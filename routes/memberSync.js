'use strict';

const _ = require('lodash');

const excel = require('exceljs');
const express = require('express');
const fs = require('fs');
const router = express.Router();

const memberSync = require('../actions/memberSync');

const MemberSync = require('../models/memberSync');

const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');



var testData = [{
		name: "one",
		value: "first"
	},
	{
		name: "two",
		value: "second"
	},
	{
		name: "three",
		value: "third"
	}
];



//
//  GET /membersSync/readData
//
router.get(`/readData`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			shopfiyCustomers: []
		};


		var files = fs.readdirSync('member_data');
		for (var i = 0; i < files.length; i++) {
			if (files[i].startsWith("customers_export")) {
				resp.shopfiyCustomers.push(await processShopifyCustomers(files[i]));
			}
			if (files[i].startsWith("cleaned_members")) {
				await processMailchimpSubscribers(files[i], 'CLEANED');
			}
			if (files[i].startsWith("subscribed_members")) {
				await processMailchimpSubscribers(files[i], 'SUBSCRIBED');
			}
			if (files[i].startsWith("unsubscribed_members")) {
				await processMailchimpSubscribers(files[i], 'UNSUBSCRIBED');
			}
		}


		// await errorWorkbook.xlsx.writeFile('member_data/' + 'errors-' + new Date().getHours() + new Date().getMinutes() + '.xlsx');

		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /membersSync/compareMembersWithEmail
//
router.get(`/compareMembersWithEmail`, async (req, res, next) => {
	try {
		const chunkSize = 1000;
		var offset = 0;
		var resp = {
			statusCode: 200,
			cleanMembers: 0,
			dirtyMembers: 0,
			path: ""
		};



		//
		//	Main loop where we look for discrepancies. 
		//
		await memberSync.checkForDiscrepancies(resp, parseInt(req.query.offset), parseInt(req.query.limit));

		offset = offset + chunkSize;

		// } while (members.length === chunkSize);

		// console.log("Matches: " + matchCount + " Mismatches: " + mismatchCount);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//
//	Find members in lists that don't match their home shopify store id.
//
//


//	Find members with duplicate email addresses - shouldn't be any.

//
//	Find members in multiple lists ignoring the ones that are archived in one.
//	Retrieving an archived member will result in a resource not found exception being thrown.
//
//  GET /membersSync/multipleLists
//
router.get(`/multipleLists`, async (req, res, next) => {
	try {
		const chunkSize = 1000;
		var errorRow = 2;
		var errorWorkbook = new excel.Workbook();
		var errorWorksheet = errorWorkbook.addWorksheet('Multiple List Members');
		var match = true;
		var matchCount = 0;
		var members = null;
		var mismatchCount = 0;
		var errors = [];
		var offset = 0;
		var resp = {
			statusCode: 200,
			cleanMembers: 0,
			dirtyMembers: 0,
			path: ""
		};
		var result = null;

		errorWorksheet.getRow(1).font = {
			bold: true
		};
		errorWorksheet.getCell(1, 1).value = "Date Member Created";
		errorWorksheet.getCell(1, 2).value = "ID";
		errorWorksheet.getCell(1, 3).value = "Email";
		errorWorksheet.getCell(1, 4).value = "First Name";
		errorWorksheet.getCell(1, 5).value = "Last Name";
		errorWorksheet.getCell(1, 6).value = "Discrepancy";
		errorWorksheet.getCell(1, 7).value = "Detail";

		result = await MemberSync.getMutipleListMembers();

		var d = new Date();
		resp.path = 'memberSync/' + 'discrepencies-' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '_' + d.getHours() + '_' + d.getMinutes() + '.xlsx';
		await errorWorkbook.xlsx.writeFile(resp.path);

		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




var getDataByName = (name) => {
	var si = _.find(testData, function (o) {
		return o.name === name;
	});

	if (si != undefined) {
		return si;
		return JSON.parse(JSON.stringify(si));
	} else {
		return null;
	}
}





var parseTags = (tags) => {
	var tagInfo = {
		homeCity: null,
		zip: null,
		verifiedFlag: false
	}
	var tagSplit = _.split(tags, ",");

	for (var j = 0; j < tagSplit.length; j++) {
		if (tagSplit[j].trim() === 'verified') {
			tagInfo.verifiedFlag = true;
		} else if (tagSplit[j].trim().startsWith('homeCity:')) {
			tagInfo.homeCity = tagSplit[j].trim();
		} else {
			tagInfo.zip = tagSplit[j].trim().substring(0, 24);
		}
	}

	return tagInfo;
}



var processMailchimpSubscribers = async (fileName, disposition) => {
	var customers = [];
	var dot = fileName.indexOf('.');
	// var errorRow = 1;
	// var errorWorksheet = null;
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var prom = [];
	var cityId = fileName.substring(fileName.lastIndexOf('_') + 1, dot);

	// errorWorksheet = errorWorkbook.addWorksheet('Shopify Customers');

	console.log('Mailchimp City ID: ' + cityId + " Type: " + disposition);
	await MemberSync.deleteMailchimpByShopifyStore(cityId, disposition);

	var jobInfo = {
		filePath: 'member_data/' + fileName
	}
	await openWorksheetStream(jobInfo);

	//	Parse the data.
	for await (const row of jobInfo.worksheetReader) {
		jobInfo.rowCounter++;

		if (jobInfo.rowCounter === 1) {} else {

			if (row.getCell(1).value === 'aeremita@live.com') {
				var cell = row.getCell(5);
				console.log(row.getCell(1).value + " " + row.getCell(5).value + " " + row.getCell(5).text)
			}
			var customer = {
				cityId: cityId,
				email: row.getCell(1).value,
				firstName: row.getCell(2).value,
				lastName: row.getCell(3).value,
				zip: row.getCell(5).value,
				verifiedFlag: (row.getCell(6).value === 'Y') ? true : false,
				disposition: disposition
			};

			if (customer.email === null) {
				customer.email = '';
			}

			customers.push(customer);

			// console.log(inputWorksheet.getCell(i, 1).value + ' ' + inputWorksheet.getCell(i, 2).value + ' ' + inputWorksheet.getCell(i, 3).value + ' ' + inputWorksheet.getCell(i, 17).value);
			if (jobInfo.rowCounter % 5000 === 0) {
				prom.push(MemberSync.addMailchimpSubscribers(customers));
				customers = [];
				jobInfo.rowCounter = 1;
			}
		}
	}

	if (customers.length > 0) {
		prom.push(MemberSync.addMailchimpSubscribers(customers));
	}

	var result = await Promise.all(prom);
}



var processShopifyCustomers = async (fileName) => {
	var customers = [];
	var dot = fileName.indexOf('.');
	// var errorRow = 1;
	// var errorWorksheet = null;
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var prom = [];
	var storeId = fileName.substring(fileName.lastIndexOf('_') + 1, dot);

	// errorWorksheet = errorWorkbook.addWorksheet('Shopify Customers');

	console.log('Shopify Store ID: ' + storeId);
	await MemberSync.deleteShopifyByShopifyStore(storeId);

	var jobInfo = {
		filePath: 'member_data/' + fileName
	}
	await openWorksheetStream(jobInfo);

	//	Parse the data.
	for await (const row of jobInfo.worksheetReader) {
		jobInfo.rowCounter++;

		if (jobInfo.rowCounter === 1) {} else {

			var customer = {
				storeId: storeId,
				firstName: row.getCell(1).value,
				lastName: row.getCell(2).value,
				email: row.getCell(3).value,
				zip: null,
				verifiedFlag: false
			};

			var tagInfo = parseTags(row.getCell(17).value);
			customer.zip = tagInfo.zip;
			customer.verifiedFlag = tagInfo.verifiedFlag;
			customer.homeCity = tagInfo.homeCity;

			// if ((customer.zip === null) || (customer.zip.length === 0)) {
			// 	errorRow = logError(errorRow, errorWorksheet, "Missing Zip", customer);
			// }

			// if ((customer.zip != null) && (customer.zip.length > 0) && (!isValidZipcode(customer.zip))) {
			// 	errorRow = logError(errorRow, errorWorksheet, "Invalid Zip", customer);
			// }

			// if ((customer.email === null) || (customer.email.length === 0)) {
			// 	errorRow = logError(errorRow, errorWorksheet, "Missing Email", customer);
			// }

			// if ((customer.email != null) && (customer.email.length > 0) && (!emailvalidator.validate(customer.email))) {
			// 	errorRow = logError(errorRow, errorWorksheet, "Invalid Email", customer);
			// }

			if (customer.email === null) {
				customer.email = '';
			}

			customers.push(customer);

			// console.log(inputWorksheet.getCell(i, 1).value + ' ' + inputWorksheet.getCell(i, 2).value + ' ' + inputWorksheet.getCell(i, 3).value + ' ' + inputWorksheet.getCell(i, 17).value);
			if (jobInfo.rowCounter % 5000 === 0) {
				prom.push(MemberSync.addShopifyCustomers(customers));
				customers = [];
			}
		}
	}

	if (customers.length > 0) {
		prom.push(MemberSync.addShopifyCustomers(customers));
	}

	var result = await Promise.all(prom);
	return {
		storeId: storeId,
		count: jobInfo.rowCounter
	}
}



var openWorksheetStream = async (jobInfo) => {
	var worksheetCount = 0;

	jobInfo.worksheetReader = undefined;
	jobInfo.rowCounter = 0;

	jobInfo.workbookReader = new excel.stream.xlsx.WorkbookReader(jobInfo.filePath);

	for await (jobInfo.worksheetReader of jobInfo.workbookReader) {
		worksheetCount++;
		if (worksheetCount === 1) {
			break;
		}
	}

	if (jobInfo.worksheetReader === undefined) {
		throw new Error("Worksheet doesn't seem to exist in " + jobInfo.fileName);
	}


	jobInfo.headerRow = undefined;
}




module.exports = router;