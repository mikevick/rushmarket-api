'use strict';

const _ = require('lodash');
const eaddr = require('email-addresses');
const excel = require('exceljs');
const fs = require('fs');
const readline = require('readline');
const express = require('express');
const router = express.Router();

const {
	google
} = require('googleapis');

const vendorActions = require('../actions/vendors');

const Vendors = require('../models/vendors');

const exceptions = require('../utils/logUtils');
const response = require('../utils/response');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify',
	'https://mail.google.com'
];

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'creds/tracking-email-token.json';


//
//  GET /experiment 
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		await vendorActions.processInvoiceAndShippedEmail(req, resp);

		// // Load client secrets from a local file.
		// fs.readFile('creds/tracking-email-credentials.json', (err, content) => {
		// 	if (err) return console.log('Error loading client secret file:', err);
		// 	// Authorize a client with credentials, then call the Gmail API.
		// 	authorize(JSON.parse(content), processMessages);
		// });



		response.respond(resp, res, next);

	} catch (e) {
		exceptions.routeExceptions(e, req, res, next, resp);
	}

});


/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
var authorize = (credentials, callback) => {
	const {
		client_secret,
		client_id,
		redirect_uris
	} = credentials.installed;
	const oAuth2Client = new google.auth.OAuth2(
		client_id, client_secret, redirect_uris[0]);

	// Check if we have previously stored a token.
	fs.readFile(TOKEN_PATH, (err, token) => {
		if (err) return getNewToken(oAuth2Client, callback);
		oAuth2Client.setCredentials(JSON.parse(token));
		callback(oAuth2Client);
	});
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
var getNewToken = (oAuth2Client, callback) => {
	console.log(`GETTING NEW TOKEN`);
	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
	});
	console.log('Authorize this app by visiting this url:', authUrl);
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	rl.question('Enter the code from that page here: ', (code) => {
		rl.close();
		oAuth2Client.getToken(code, (err, token) => {
			if (err) return console.error('Error retrieving access token', err);
			oAuth2Client.setCredentials(token);
			// Store the token to disk for later program executions
			fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
				if (err) return console.error(err);
				console.log('Token stored to', TOKEN_PATH);
			});
			callback(oAuth2Client);
		});
	});
}



/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
var listLabels = async (auth) => {
	const gmail = google.gmail({
		version: 'v1',
		auth
	});
	var result = await gmail.users.labels.list({
		userId: 'me',
	});

	const labels = result.data.labels;
	if (labels.length) {
		console.log('Labels:');
		labels.forEach((label) => {
			console.log(`- ${label.name}`);
		});
	} else {
		console.log('No labels found.');
	}
}


var processMessages = async (auth) => {
	const gmail = google.gmail({
		version: 'v1',
		auth
	});
	var result = await gmail.users.messages.list({
		userId: 'me',
		q: 'in:inbox'
	});

	var msgs = result.data.messages;
	if ((msgs) && (msgs.length)) {
		console.log('Messages:');
		for (var i = 0; i < msgs.length; i++) {
			await getMessage(msgs[i].id, auth);
		};
	} else {
		console.log('No messages found.');
	}
}


var getMessage = async (msgId, auth) => {
	var inboxFlag = false;
	var starredFlag = false;

	console.log(`Processing message ${msgId}`);

	const gmail = google.gmail({
		version: 'v1',
		auth
	});

	var msg = await gmail.users.messages.get({
		userId: 'me',
		id: msgId,
	});

	//	Only interested in messages in the inbox.
	if (_.findIndex(msg.data.labelIds, function (l) {
			return l === 'INBOX';
		}) >= 0) {
		inboxFlag = true;
	}

	//	Only interested in messages not starred.  Starred means we've already processed them.
	// if (_.findIndex(msg.data.labelIds, function (l) {
	// 		return l === 'STARRED';
	// 	}) >= 0) {
	// 	starredFlag = true;
	// }


	//	Process message if unstarred in the inbox.
	if ((msg) && (msg.status === 200)) {
		var info = await processMessage(msg);

		if (info.filename !== null) {
			console.log(`Probable attachment: ${info.from} ${info.filename} ${info.attachmentId}`);

			//	Validate sender email is a vendor email.
			var vendors = await Vendors.getByAnyEmail(info.from);
			if (vendors.length > 0) {
				info.vendorId = vendors[0].id;
				var result = await processAttachment(gmail, msgId, msg, info);

				const messages = [
					'From: <beaviebugeater@gmail.com>',
					'To: ' + info.from,
					'References: ' + info.messageId,
					'In-Reply-To: ' + info.messageId,
					'Content-Type: text/html; charset=utf-8',
					'MIME-Version: 1.0',
					'Subject: Re: ' + info.subject,
					'',
					info.responseEmail,
					'',
				];
				const message = messages.join('\n');
				const encodedMessage = Buffer.from(message)
					.toString('base64')
					.replace(/\+/g, '-')
					.replace(/\//g, '_')
					.replace(/=+$/, '');
				result = await gmail.users.messages.send({
					auth: auth,
					userId: 'me',
					resource: {
						raw: encodedMessage,
						threadId: msg.threadId
					}
				});

				console.log('here');
			}
		}
	}


	//	Mark the message as processed by deleting it.
	// var result = await gmail.users.messages.delete({
	// 	userId: 'me',
	// 	id: msgId
	// })
	var result = await gmail.users.messages.modify({
		userId: 'me',
		id: msgId,
		requestBody: {
			addLabelIds: ['TRASH']
		}
	})
}



var processMessage = async (msg) => {
	var info = {
		attachmentId: null,
		from: null,
		filename: null,
		processFlag: false
	}


	//	If it has a sheet			
	for (var i = 0; i < msg.data.payload.headers.length; i++) {
		if (msg.data.payload.headers[i].name === 'From') {
			info.from = eaddr.parseFrom(msg.data.payload.headers[i].value);
			if (info.from && info.from[0].address) {
				info.from = info.from[0].address;
			}
		}
		if (msg.data.payload.headers[i].name === 'Message-ID') {
			info.messageId = msg.data.payload.headers[i].value;
		}
		if (msg.data.payload.headers[i].name === 'Subject') {
			info.subject = msg.data.payload.headers[i].value;
		}
	}

	for (var i = 0; i < msg.data.payload.parts.length; i++) {
		if (msg.data.payload.parts[i].mimeType.indexOf('spreadsheet') >= 0) {
			info.filename = msg.data.payload.parts[i].filename;
		}
		info.attachmentId = msg.data.payload.parts[i].body.attachmentId;
	}

	return info;
}



var processAttachment = async (gmail, msgId, msg, info) => {
	var decodedSheet = null;
	var errors = '';
	var responseEmail = '<html><head></head><body>';
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var totalGood = 0;


	var result = await gmail.users.messages.attachments.get({
		userId: 'me',
		messageId: msgId,
		id: info.attachmentId
	});

	//	Assuming base64 encoding.  Maybe should validate?
	if (result.status === 200) {
		decodedSheet = new Buffer(result.data.data, 'base64');
		info.savedSheetName = `sheets/received_sheet-${info.vendorId}-${new Date().getHours()}-${new Date().getMinutes()}.xlsx`
		await fs.writeFileSync(info.savedSheetName, decodedSheet);

		var p = inputWorkbook.xlsx.readFile(info.savedSheetName)
		inputWorksheet = await p;
		inputWorksheet = inputWorkbook.getWorksheet(1);


		if (inputWorksheet.rowCount > 30000) {
			throw new Error('Please limit product data to 30,000 rows.')
		}


		for (var i = 2; i <= inputWorksheet.rowCount; i++) {
			var orderId = inputWorksheet.getCell(i, 1).value;
			var invoiceNumber = inputWorksheet.getCell(i, 2).value;
			var vendorSku = inputWorksheet.getCell(i, 3).value;
			var trackingNumber = inputWorksheet.getCell(i, 4).value;

			var resp = {
				statusCode: 200,
				message: 'Success'
			}
			var req = {
				params: {
					id: info.vendorId
				},
				body: {
					orderId: orderId,
					invoiceNumber: invoiceNumber,
					vendorSku: vendorSku,
					tracking: trackingNumber
				}
			}
			await vendorActions.fulfill(req, resp);

			if (resp.statusCode !== 200) {
				errors += `Row ${i}: ${resp.message}<br>`;
			} else {
				totalGood++;
			}

			console.log('here');
		}

		if (errors.length > 0) {
			responseEmail += errors + '<br><br>';
		}

		responseEmail += `Total rows processed successfully: ${totalGood}`;
		responseEmail += `</body></html>`;

		info.responseEmail = responseEmail;

	} else {
		//	Log bad attachment 
	}

}


module.exports = router;