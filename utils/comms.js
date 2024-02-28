'use strict';

const _ = require('lodash');
const fs = require('fs');
const mailchimpTransactional = require('@mailchimp/mailchimp_transactional')(process.env.MANDRILL_API_KEY);

const globals = require('../globals');

const AdhocEmail = require('../models/adhocEmail');
const CityEmailTemplates = require('../models/cityEmailTemplates');
const EmailTemplates = require('../models/emailTemplates');
const Mandrill = require('../models/mandrill');

const exceptions = require('./logUtils');

const axios = require('axios').create({
	timeout: globals.apiTimeout,
	validateStatus: function (status) {
		return ((status === 404) || (status >= 200 && status < 300));
	}
});



var sendCityTemplatedEmail = async (email, cityId, label, contexts) => {
	try {
		//	If empty email, bail.
		if ((email === undefined) || (email === null) || (email.length === 0)) {
			return;
		}

		var templateInfo = await CityEmailTemplates.getByCityIdLabel(cityId, label);
		if ((templateInfo === undefined) || (templateInfo.length === 0)) {
			throw new Error("Missing email template for " + email + " " + cityId + " " + label);
		}
		var subject = templateInfo.subject;
		var tos = _.split(email.toLowerCase(), ",");
		var allowed = [];
		var always = [];


		if (process.env.ALLOWED_EMAILS != undefined) {
			allowed = _.split(process.env.ALLOWED_EMAILS.toLowerCase(), ",");
		}
		if (process.env.ALWAYS_EMAILS != undefined) {
			always = _.split(process.env.ALWAYS_EMAILS.toLowerCase(), ",");
		}

		//	Restrict who can be sent to from dev and test.
		if ((process.env.NODE_ENV) && ((process.env.NODE_ENV === 'development') || ((process.env.NODE_ENV === 'test') && (process.env.RESTRICT_EMAIL === 'Y')))) {
			tos = _.intersection(tos, allowed);
			tos = _.union(tos, always);
			subject = `(${process.env.NODE_ENV}) ` + subject
		}

		var toArr = [];
		for (var i = 0; i < tos.length; i++) {
			toArr.push({
				"email": tos[i],
				"type": "to"
			});
		}


		sendMandrillEmail(templateInfo.templateName, subject, templateInfo.fromEmail, templateInfo.fromName, toArr, contexts);
	} catch (e) {
		exceptions.logException(e);
	}
}



var sendMandrillEmail = async (templateName, subject, fromEmail, fromName, toArr, contexts) => {
	var message = {
		"subject": subject,
		"from_email": fromEmail,
		"from_name": fromName,
		"to": toArr,
		"headers": {
			"Reply-To": fromEmail
		},
		"global_merge_vars": contexts
	}

	var template_content = [];
	if (toArr.length > 0) {
		var result = await mailchimpTransactional.messages.sendTemplate({
			"template_name": templateName,
			"template_content": template_content,
			"message": message
		});

		if (result[0].status !== 'sent') {
			await Mandrill.queueResend(toArr, fromName, JSON.stringify(contexts));
		}
	}
}




var sendTemplatedEmail = async (email, name, contexts) => {
	try {
		var templateInfo = await EmailTemplates.getByName(name);
		var subject = templateInfo.subject;
		var tos = _.split(email.toLowerCase(), ",");
		var allowed = [];
		var always = [];
		if (process.env.ALLOWED_EMAILS != undefined) {
			allowed = _.split(process.env.ALLOWED_EMAILS.toLowerCase(), ",");
		}
		if (process.env.ALWAYS_EMAILS != undefined) {
			always = _.split(process.env.ALWAYS_EMAILS.toLowerCase(), ",");
		}
		if ((process.env.NODE_ENV) && ((process.env.NODE_ENV === 'development') || ((process.env.NODE_ENV === 'test') && (process.env.RESTRICT_EMAIL === 'Y')))) {
			tos = _.intersection(tos, allowed);
			tos = _.union(tos, always);
			subject = `(${process.env.NODE_ENV}) ` + subject
		}

		var toArr = [];
		for (var i = 0; i < tos.length; i++) {
			toArr.push({
				"email": tos[i],
				"type": "to"
			});
		}

		// console.log("To: " + toArr);

		// console.log("Contexts: " + JSON.stringify(contexts, undefined, 2));



		// if (process.env.NODE_ENV === 'prod') {
		var message = {
			"subject": subject,
			"from_email": "hello@therushmarket.com",
			"from_name": "The Rush Market",
			"to": toArr,
			"headers": {
				"Reply-To": "hello@therushmarket.com"
			},
			"global_merge_vars": contexts
		}
		var template_content = [];
		// mandrill_client.users.ping2({},
		if (toArr.length > 0) {
			var result = await mailchimpTransactional.messages.sendTemplate({
				"template_name": name,
				"template_content": template_content,
				"message": message
			});

			if (result[0].status !== 'sent') {
				await Mandrill.queueResend(email, fromName, JSON.stringify(contexts));
			}
		}

	} catch (e) {
		exceptions.logException(e);
	}
}



var sendEmail = async (to, subject, plainText, htmlText, from, cc, bcc, filename, path) => {
	try {
		await AdhocEmail.create(to, subject, plainText, htmlText, from, cc, bcc, filename, path);

	} catch (e) {
		exceptions.logException(e);
	}
}



var sendQueuedEmail = async (rows) => {
	if ((rows !== null) && (rows !== undefined) && (rows.length > 0)) {

		try {

			for (var i = 0; i < rows.length; i++) {
				var recipients = [];

				rows[i].sentFlag = false;


				//
				//  If develop or test, only send to allowed recipients.
				//

				var tos = prepareTos(rows[i].to);
				formatRecipients(recipients, tos, "to");
				var ccs = prepareCCs(rows[i].cc);
				formatRecipients(recipients, ccs, "cc");
				var bccs = prepareCCs(rows[i].bcc);
				formatRecipients(recipients, bccs, "bcc");

				rows[i].subject = prepareSubject(rows[i].subject);

				var f = ((rows[i].from !== undefined) && (rows[i].from !== null)) ? rows[i].from : process.env.EMAIL_USER;

				var message = {
					from_email: f,
					subject: rows[i].subject,
					text: (rows[i].plainText != undefined) ? rows[i].plainText : null,
					html: (rows[i].htmlText != undefined) ? rows[i].htmlText : null,
					preserve_recipients: true,
					to: recipients
				}

				if ((rows[i].filename !== undefined) && (rows[i].filename !== null)) {
					message.attachments = [{
						name: rows[i].filename,
						content: fs.readFileSync(rows[i].path, {
							encoding: 'base64'
						})
					}]
				}

				console.log("SENDING MAIL: " + JSON.stringify(message, undefined, 2));

				var response = await mailchimpTransactional.messages.send({
					message
				});

				if ((response[0]?.status === 'sent') || (response[0]?.status === 'queued')) {
					rows[i].sentFlag = true;
				}

			}

		} catch (e) {
			exceptions.logException(e);
		}
	}

};


var prepareTos = (to) => {
	var tos = [];
	if (to === undefined) {
		to = 'matt@rushmarket.com';
	}
	tos = _.split(to.toLowerCase(), ",");

	var allowed = [];
	var always = [];
	if (process.env.ALLOWED_EMAILS != undefined) {
		allowed = _.split(process.env.ALLOWED_EMAILS.toLowerCase(), ",");
	}

	if (process.env.ALWAYS_EMAILS != undefined) {
		always = _.split(process.env.ALWAYS_EMAILS.toLowerCase(), ",");
	}
	if ((process.env.NODE_ENV) && ((process.env.NODE_ENV === 'development') || ((process.env.NODE_ENV === 'test') && (process.env.RESTRICT_EMAIL === 'Y')))) {
		tos = _.intersection(tos, allowed);
		tos = _.union(tos, always);
	}

	return tos;
}


var prepareCCs = (cc) => {
	var ccs = [];

	if ((cc !== null) && (cc.trim().length > 0)) {
		ccs = _.split(cc, ',');
	}

	return ccs;
}


var prepareSubject = (subject) => {
	if ((process.env.NODE_ENV) && ((process.env.NODE_ENV === 'development') || (process.env.NODE_ENV === 'test'))) {
		subject = `(${process.env.NODE_ENV}) ` + subject
	}

	return subject;
}


var formatRecipients = (recipients, arr, type) => {
	for (var i = 0; i < arr.length; i++) {
		recipients.push({
			email: arr[i],
			type: type
		})
	}
}

var sendChangeEmail = (member) => {
	if ((member.email !== undefined) && (member.email !== null)) {

		var contexts = [{
				"name": "RUSHIMAGE",
				"content": ((member.storeInfo != undefined) && (member.storeInfo.logoUrl != undefined)) ? member.storeInfo.logoUrl : 'https://cdn.shopify.com/s/files/1/1757/1461/files/HZ-no-city-digital-black.png?10146406607426040436'
			},
			{
				"name": "FNAME",
				"content": member.firstName
			},
			{
				"name": "PSWDCHANGEURL",
				"content": process.env.EMAIL_TEMPS_PSWDCHANGEURL
			},
			{
				"name": "VID",
				"content": member.verificationId
			}
		]


		sendCityTemplatedEmail(member.email, member.homeCityId, "PSWD_CHANGE", contexts);
	}
}


var sendResetEmail = (member) => {
	if ((member.email !== undefined) && (member.email !== null)) {

		var contexts = [{
				"name": "RUSHIMAGE",
				"content": ((member.storeInfo != undefined) && (member.storeInfo.logoUrl != undefined)) ? member.storeInfo.logoUrl : 'https://cdn.shopify.com/s/files/1/1757/1461/files/HZ-no-city-digital-black.png?10146406607426040436'
			},
			{
				"name": "FNAME",
				"content": member.firstName
			},
			{
				"name": "PSWDRESETURL",
				"content": process.env.EMAIL_TEMPS_PSWDRESETURL
			},
			{
				"name": "VID",
				"content": member.verificationId
			}
		]

		sendCityTemplatedEmail(member.email, member.homeCityId, "PSWD_RESET", contexts);
	}
}


var sendSetPasswordEmail = (member) => {
	if ((member.email !== undefined) && (member.email !== null)) {

		var contexts = [{
				"name": "RUSHIMAGE",
				"content": ((member.storeInfo != undefined) && (member.storeInfo.logoUrl != undefined)) ? member.storeInfo.logoUrl : 'https://cdn.shopify.com/s/files/1/1757/1461/files/HZ-no-city-digital-black.png?10146406607426040436'
			},
			{
				"name": "FNAME",
				"content": member.firstName
			},
			{
				"name": "PSWDSETURL",
				"content": process.env.EMAIL_TEMPS_PSWDSETURL
			},
			{
				"name": "VID",
				"content": member.verificationId
			}
		]

		sendCityTemplatedEmail(member.email, member.homeCityId, "PSWD_SET", contexts);
	}
}


var sendNotificationEmail = (member) => {
	if ((member.newEmail !== undefined) && (member.newEmail !== null)) {

		var contexts = [{
				"name": "RUSHIMAGE",
				"content": ((member.storeInfo != undefined) && (member.storeInfo.logoUrl != undefined)) ? member.storeInfo.logoUrl : 'https://cdn.shopify.com/s/files/1/1757/1461/files/HZ-no-city-digital-black.png?10146406607426040436'
			},
			{
				"name": "FNAME",
				"content": member.firstName
			},
			{
				"name": "OLDEMAIL",
				"content": member.oldEmail
			},
			{
				"name": "NEWEMAIL",
				"content": member.newEmail
			}
		]

		sendCityTemplatedEmail(member.newEmail, member.homeCityId, "EMAIL_CHANGE_NOTIFICATION", contexts);
	}
}


var sendRRCResetEmail = (vendor) => {
	if ((vendor.email !== undefined) && (vendor.email !== null)) {

		var contexts = [{
				"name": "RUSHIMAGE",
				"content": 'https://cdn.shopify.com/s/files/1/1757/1461/files/rr-logo-blk.png?v=1656441279'
			},
			{
				"name": "FNAME",
				"content": vendor.name
			},
			{
				"name": "PSWDRESETURL",
				"content": process.env.EMAIL_TEMPS_RRC_PSWDRESETURL
			},
			{
				"name": "VID",
				"content": vendor.verificationId
			}
		]

		var toArr = [];

		toArr.push({
			"email": vendor.email,
			"type": "to"
		})
		sendMandrillEmail("RRC_PSWD_RESET", "Reset Your Password", "hello@therushmarket.com", "Rush ReCommerce", toArr, contexts);

		// sendTemplatedEmail(vendor.email, "VENDOR_PSWD_RESET", contexts);
	}
}


var sendVerificationEmail = async (member) => {
	if ((member.email !== undefined) && (member.email !== null)) {

		var contexts = [{
				"name": "VERIFYURL",
				"content": process.env.EMAIL_TEMPS_VERIFYURL
			},
			{
				"name": "VID",
				"content": member.verificationId
			}
		]

		sendCityTemplatedEmail(member.email, member.homeCityId, "YOURE_IN_VERIFY", contexts);
	}
}


var sendYoureInEmail = async (member) => {
	if ((member.email !== undefined) && (member.email !== null)) {

		var contexts = [{
				"name": "VERIFYURL",
				"content": process.env.EMAIL_TEMPS_VERIFYURL
			},
			{
				"name": "VID",
				"content": member.verificationId
			}
		]

		sendCityTemplatedEmail(member.email, member.homeCityId, "YOURE_IN", contexts);
	}
}


module.exports = {
	sendChangeEmail,
	sendEmail,
	sendNotificationEmail,
	sendQueuedEmail,
	sendResetEmail,
	sendSetPasswordEmail,
	sendTemplatedEmail,
	sendRRCResetEmail,
	sendVerificationEmail,
	sendYoureInEmail
}