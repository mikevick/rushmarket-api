const _ = require('lodash');
const axios = require('axios').create({
	timeout: 300000,
	validateStatus: function (status) {
		return ((status == 404) || (status >= 200 && status < 300));
	}
});
const excel = require('exceljs');
const MC = require('mailchimp-api-v3')
const mc = new MC("cf79a589a96d0ff03841806d49e75306-us15");
const md5 = require('md5');
const Shopify = require('shopify-api-node');


const comms = require('../utils/comms');
const logUtils = require('../utils/logUtils');

const MemberSync = require('../models/memberSync');


var mcLists = [];

var lincolnShopify = new Shopify({
	shopName: 'rushmarketlincoln.myshopify.com',
	apiKey: '23d35003375e67f0dd1f24af25c553de',
	password: 'e01004f259687618600891681a81b60c'
});

var omahaShopify = new Shopify({
	shopName: 'rushmarket.myshopify.com',
	apiKey: '323beb19b927a7804f0a1bd6615c8b8f',
	password: 'caf8eefe1cbc63fc37c34adf8540b4ce'
});



//
//  
//
var checkForDiscrepancies = async (resp, offset, limit) => {
	var errorRow = 2;
	var errors = [];
	var errorWorkbook = new excel.Workbook();
	var errorWorksheet = errorWorkbook.addWorksheet('Member Discrepencies');
	var members = [];
	var result = null;


	injectKey(axios);

	errorWorksheet.getRow(1).font = {
		bold: true
	};
	errorWorksheet.getCell(1, 1).value = "Date Member Created";
	errorWorksheet.getCell(1, 2).value = "ID";
	errorWorksheet.getCell(1, 3).value = "Status";
	errorWorksheet.getCell(1, 4).value = "Email";
	errorWorksheet.getCell(1, 5).value = "First Name";
	errorWorksheet.getCell(1, 6).value = "Last Name";
	errorWorksheet.getCell(1, 7).value = "Zip";
	errorWorksheet.getCell(1, 8).value = "Discrepancy";
	errorWorksheet.getCell(1, 9).value = "Detail";


	var result = await MemberSync.getMemberData();
	var members = result.rows;

	// members = await loadShopify(members, offset, limit);
	// members = await loadMailchimp(members, offset, limit);
	// members = await loadShopifyCustomers(members, offset, limit);


	for (var i = 0; i < members.length; i++) {

		//	Output to display progress.
		if ((i % 10000 === 0) && (i > 0)) {
			// console.log(i);
		}

		errors = [];

		//	Look for discrepancies in shopify customer data.  This is only valid for members that are in-market.
		// console.log(i + ": " + members[i].mbrFname + " " + members[i].mbrLname + " " + members[i].mbrEmail + " : " + members[i].sFname + " " + members[i].sLname + " " + members[i].sEmail);

		if (members[i].status !== 'OUTSIDE_GEOGRAPHIC') {
			errors = await compareMemberWithShopify(errors, members[i]);
		}

		//	TODO check for shopify customers not in members table.

		//	Look for discrepancies in mailchimp member data.  
		errors = await compareMemberWithMailchimp(errors, members[i]);

		//	Check that number of linked stores matches number of shopify customers and that home shopify store is one of these.
		// errors = await compareMemberWithShopifyCustomers(errors, members[i]);


		if (errors.length > 0) {
			resp.dirtyMembers++;
			errorRow = logError(errorRow, errorWorksheet, members[i], errors)
		} else {
			resp.cleanMembers++;
		}
	}


	var d = new Date();
	resp.path = 'memberSync/' + 'discrepencies-' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '_' + d.getHours() + '_' + d.getMinutes() + '.xlsx';
	await errorWorkbook.xlsx.writeFile(resp.path);

}


//
//  
//
var checkForDiscrepanciesOld = async (resp, offset, limit) => {
	var errorRow = 2;
	var errors = [];
	var errorWorkbook = new excel.Workbook();
	var errorWorksheet = errorWorkbook.addWorksheet('Member Discrepencies');
	var members = [];
	var result = null;


	injectKey(axios);

	errorWorksheet.getRow(1).font = {
		bold: true
	};
	errorWorksheet.getCell(1, 1).value = "Date Member Created";
	errorWorksheet.getCell(1, 2).value = "ID";
	errorWorksheet.getCell(1, 3).value = "Status";
	errorWorksheet.getCell(1, 4).value = "Email";
	errorWorksheet.getCell(1, 5).value = "First Name";
	errorWorksheet.getCell(1, 6).value = "Last Name";
	errorWorksheet.getCell(1, 7).value = "Discrepancy";
	errorWorksheet.getCell(1, 8).value = "Detail";


	members = await loadMembers(members, offset, limit);
	members = await loadShopify(members, offset, limit);
	members = await loadMailchimp(members, offset, limit);
	members = await loadShopifyCustomers(members, offset, limit);


	for (var i = 0; i < members.length; i++) {

		//	Output to display progress.
		if ((i % 10000 === 0) && (i > 0)) {
			console.log(i);
		}

		errors = [];

		//	Look for discrepancies in shopify customer data.  This is only valid for members that are in-market.
		if (members[i].status !== 'OUTSIDE_GEOGRAPHIC') {
			errors = await compareMemberWithShopify(errors, members[i]);
		}

		//	Look for discrepancies in mailchimp member data.  
		errors = await compareMemberWithMailchimp(errors, members[i]);

		//	Check that number of linked stores matches number of shopify customers and that home shopify store is one of these.
		errors = await compareMemberWithShopifyCustomers(errors, members[i]);


		if (errors.length > 0) {
			resp.dirtyMembers++;
			errorRow = logError(errorRow, errorWorksheet, members[i], errors)
		} else {
			resp.cleanMembers++;
		}
	}


	var d = new Date();
	resp.path = 'memberSync/' + 'discrepencies-' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '_' + d.getHours() + '_' + d.getMinutes() + '.xlsx';
	await errorWorkbook.xlsx.writeFile(resp.path);

}





//
//	Look for discrepancies in mailchimp member data.  
//	
var compareMemberWithMailchimp = async (errors, member) => {
	if ((member.mbrMarketingStatus === 'ARCHIVED') && (member.cMarketingStatuscMarketingStatus === null)) {
		return errors;
	}

	//	Should be a member of list corresponding to home store id. 
	if (member.cEmail === null) {
		// var result = await addMCMember(member);

		errors = await pushError(errors, member, {
			type: "No Mailchimp Member",
			detail: member.mbrEmail + " " + member.cEmail
		});

		return errors;
	}


	// if (member.mailchimp[j].email !== null) {
	// 	count++;
	// 	if (member.mailchimp[j].disposition === 'SUBSCRIBED') {
	// 		countSubscribed++;
	// 	}
	// }

	if (member.mbrCityId === member.cCityId) {

		if (member.mbrFname !== member.cFname) {
			errors = await pushError(errors, member, {
				type: "Mailchimp First Name Mismatch",
				detail: "Member: " + member.mbrFname + ", Mailchimp: " + member.cFname
			});
		}

		if (member.mbrLname != member.cLname) {
			errors = await pushError(errors, member, {
				type: "Mailchimp Last Name Mismatch",
				detail: "Member: " + member.mbrLname + ", Mailchimp: " + member.cLname
			});
		}

		if (member.mbrEmail.toLowerCase() != member.cEmail.toLowerCase()) {
			errors = await pushError(errors, member, {
				type: "Mailchimp Email Mismatch",
				detail: "Member: " + member.mbrEmail + ", Mailchimp: " + member.cEmail
			});
		}

		if ((member.mbrZip !== member.cZip) && ((member.mbrZip !== '') || (member.cZip !== null))) {
			errors = await pushError(errors, member, {
				type: "Mailchimp Zip Mismatch",
				detail: "Member: " + member.mbrZip + ", Mailchimp: " + member.cZip
			});

			//	Align mailchimp zip with member zip.
			// if (isValidZipcode(member.zip) === true) {
			// 	await updateMCMember(member);
			// }
		}

		if (member.mbrMarketingStatus != member.cMarketingStatus) {
			errors = await pushError(errors, member, {
				type: "Mailchimp Status Mismatch",
				detail: "Member: " + member.mbrMarketingStatus + ", Mailchimp: " + member.cMarketingStatus
			});

			// var result = await axios.put(`https://rm-api.azurewebsites.net/v1/members/${member.id}`, {
			// 	emailMarketingStatus: `${member.mailchimp[j].disposition}`
			// });
		}

		var tempDate = new Date(member.dateCreated);

		if ((tempDate >= new Date('2018-08-20')) && (member.mbrEmailFlag !== member.cEmailFlag)) {
			errors = await pushError(errors, member, {
				type: "Mailchimp Verified Mismatch",
				detail: "Member: " + member.mbrEmailFlag + ", Mailchimp: " + member.cEmailFlag
			});

			// await updateMCMember(member);
		}
	} else {
		if ((member.mbrCityId === 0) && (member.cCityId === 2)) {
			errors = await pushError(errors, member, {
				type: "LINCOLN Mailchimp List Mismatch",
				detail: "Member: " + member.mbrCityId + ", Mailchimp: " + member.cCityId
			});

		} else {
			if ((member.mbrEmailMarketingStatus !== 'CLEANED') || (member.cMarketingStatus !== 'CLEANED')) {
				errors = await pushError(errors, member, {
					type: "Mailchimp List Mismatch",
					detail: "Member: " + member.mbrCityId + ", Mailchimp: " + member.cCityId
				});
			}
		}
	}


	return errors;
}


//	
//	Look for discrepancies in shopify customer data.  This is only valid for members that are in-market.
//
var compareMemberWithShopify = async (errors, member) => {

	if (member.mbrStoreId > 0) {
		//	Verify they belong to the store that matches their home_shopify_store_id.
		if (member.mbrStoreId !== member.sStoreId) {
			errors = await pushError(errors, member, {
				type: "No Customer On Home Store",
				detail: "Member: " + member.mbrStoreId
			});
			return errors;
		}

		if (member.mbrFname !== member.sFname) {
			errors = await pushError(errors, member, {
				type: "Shopify First Name Mismatch",
				detail: "Member: " + member.mbrFname + ", Shopify: " + member.sFname + " Store: " + member.sStoreId
			});
		}

		if (member.mbrLname !== member.sLname) {
			errors = await pushError(errors, member, {
				type: "Shopify Last Name Mismatch",
				detail: "Member: " + member.mbrFname + ", Shopify: " + member.sLname + " Store: " + member.sStoreId
			});
		}

		if (member.mbrEmail !== member.sEmail) {
			errors = await pushError(errors, member, {
				type: "Shopify Email Mismatch",
				detail: "Member: " + member.mbrEmail + ", Shopify: " + member.sEmail + " Store: " + member.sStoreId
			});
		}

		if ((member.mbrZip !== member.sZip) && ((member.mbrZip !== '') || (member.sZip !== null))) {
			errors = await pushError(errors, member, {
				type: "Shopify Zip Mismatch",
				detail: "Member: " + member.mbrZip + ", Shopify: " + member.sZip + " Store: " + member.sStoreId
			});
		}

		if (((member.mbrVerifiedFlag === null) && (member.sVerifiedFlag !== 0)) || ((member.mbrVerifiedFlag !== null) && (member.mbrVerifiedFlag !== member.sVerifiedFlag))) {
			errors = await pushError(errors, member, {
				type: "Shopify Verified Mismatch",
				detail: "Member: " + member.mbrVerifiedFlag + ", Shopify: " + member.sVerifiedFlag + " Store: " + member.sStoreId
			});

			// var tags = buildShopifyTags(member);
			// if ((member.shopifyCustomerId !== undefined) && (member.shopifyCustomerId !== null)) {
			// 	try {
			// 		console.log("Email: " + member.email + " Store: " + member.shopify[j].storeId + " ID: " + cust.customerId + " Tags: " + tags);
			// 		if (member.shopify[j].storeId === 1) {
			// 			var result = await omahaShopify.customer.update(cust.customerId, {
			// 				tags: tags
			// 			});
			// 		} else if (member.shopify[j].storeId === 2) {
			// 			var result = await lincolnShopify.customer.update(cust.customerId, {
			// 				tags: tags
			// 			});
			// 		}
			// 	} catch (e) {
			// 		console.log("Shopify exception " + e);
			// 	}
			// }
		}
	}

	return errors;
}



//	
//	Check that number of linked stores matches number of shopify customers and that home shopify store is one of these.
//
var compareMemberWithShopifyCustomers = async (errors, member) => {

	// if (member.shopify.length != member.shopifyCustomers.length) {
	// 	errors = await pushError(errors, member, {
	// 		type: "Shopify Customer ID / Shopify Customer Mismatch",
	// 		detail: "Member: " + member.homeShopifyStoreId
	// 	});
	// }

	//	Verify they are linked to the store that matches their home_shopify_store_id.
	if (member.mbrStoreStoreId > 0) {
		if (member.mbrStoreId !== undefined) {
			errors = await pushError(errors, member, {
				type: "No Link To Home Store",
				detail: "Member: " + member.homeShopifyStoreId
			});
		}
	}

	return errors;
}




//
//	Build tags from member.
//
var buildShopifyTags = (member) => {
	var tags = '';
	if ((member.zip !== undefined) && (member.zip !== '')) {
		tags = tags + member.zip;
	}
	if ((member.verifiedMemberFlag !== undefined) && ((member.verifiedMemberFlag === true) || (member.verifiedMemberFlag === 1))) {
		if (tags.length > 0) {
			tags = tags += ',';
		}
		tags = tags += 'verified';
	}
	if (member.mbrCityId === 1) {
		if (tags.length > 0) {
			tags = tags += ',';
		}
		tags += 'homeCity:omaha'
	}
	if (member.mbrCityId === 2) {
		if (tags.length > 0) {
			tags = tags += ',';
		}
		tags += 'homeCity:lincoln'
	}

	return tags;
}



var getShopifyCustomerId = (member, storeId) => {
	return _.find(member.shopifyCustomers, function (c) {
		return ((c.email.toLowerCase() === member.email) && (c.storeId === storeId))
	});
}



var ignoreDiscrepancy = async (id, discrepancy, detail) => {
	var result = await MemberSync.getIgnore(id, discrepancy, detail);
	if (result.rows.length > 0) {
		return true;
	} else {
		return false;
	}
}



var injectKey = (axios) => {
	axios.interceptors.request.use(function (config) {
		config.headers['X-APP-ID'] = '41f42595d5a9ae5a13bc30faa1877030';
		return config;
	}, function (error) {
		return Promise.reject(error);
	});
}





//
//  Load data from member table into array of members objects.
//
var loadMembers = async (members, offset, limit) => {
	var result = null;


	//	Retrieve all members from the table who have an email address.
	result = await MemberSync.getAllWithEmail(offset, limit);
	var memberRows = result.rows;
	console.log(memberRows.length + " Member Rows");

	//	De-dupe and turn into easily processed objects
	for (var i = 0; i < memberRows.length; i++) {
		if (memberRows[i].firstName === null) {
			memberRows[i].firstName = '';
		}
		if (memberRows[i].lastName === null) {
			memberRows[i].lastName = '';
		}
		if (memberRows[i].email === null) {
			memberRows[i].email = '';
		}
		if (memberRows[i].zip === null) {
			memberRows[i].zip = '';
		}

		m = {
			id: memberRows[i].id,
			dateCreated: memberRows[i].dateCreated,
			status: memberRows[i].status,
			firstName: memberRows[i].firstName,
			lastName: memberRows[i].lastName,
			email: memberRows[i].email,
			zip: memberRows[i].zip,
			verifiedMemberFlag: memberRows[i].verifiedMemberFlag,
			emailVerificationFlag: memberRows[i].emailVerificationFlag,
			homeShopifyStoreId: memberRows[i].homeShopifyStoreId,
			homeCityId: memberRows[i].homeCityId,
			emailMarketingStatus: memberRows[i].emailMarketingStatus,
			mailchimp: [],
			shopify: [],
			shopifyCustomers: []
		}

		members.push(m);
	}
	memberRows = [];

	return members;
}




//
//  Load mailchimp member data into array of members objects.
//
var loadMailchimp = async (members, offset, limit) => {
	var c = {};
	var result = await MemberSync.getMailchimpWithEmail();
	var mailchimpRows = result.rows;
	console.log(mailchimpRows.length + " Mailchimp Rows");

	var index = 0;
	for (var i = 0; i < members.length; i++) {
		m = members[i];

		index = _.findIndex(mailchimpRows, function (c) {
			return c.email.toLowerCase() === m.email;
		}, index);

		if (index === -1) {
			console.log(m.email + " not found");
		} else {
			do {
				if (mailchimpRows[index].cFirst === null) {
					mailchimpRows[index].cFirst = '';
				}
				if (mailchimpRows[index].cLast === null) {
					mailchimpRows[index].cLast = '';
				}
				if (mailchimpRows[index].cEmail === null) {
					mailchimpRows[index].cEmail = '';
				}
				if (mailchimpRows[index].cZip === null) {
					mailchimpRows[index].cZip = '';
				}

				c = {
					email: mailchimpRows[index].cEmail.toLowerCase(),
					firstName: mailchimpRows[index].cFirst,
					lastName: mailchimpRows[index].cLast,
					zip: mailchimpRows[index].cZip,
					emailVerificationFlag: mailchimpRows[index].cEmailVerifiedFlag,
					disposition: mailchimpRows[index].cDisposition,
					storeId: mailchimpRows[index].cStoreId
				}
				m.mailchimp.push(c);
				index++;
			} while ((index < mailchimpRows.length) && (mailchimpRows[index].email.toLowerCase() === m.email));
		}

		// if (i % 10000 === 0) {
		// 	console.log(i);
		// }
	}
	mailchimpRows = [];

	return members;
}



//
//  Load shopify customer data into array of members objects.
//
var loadShopify = async (members, offset, limit) => {
	var result = result = await MemberSync.getShopifyWithEmail(offset, limit);
	var s = {};
	var shopifyRows = result.rows;
	console.log(shopifyRows.length + " Shopify Rows");


	//	Every member email is represented in members.   An email may be represented 0, 1 or more times in shopifyRows.
	var index = 0;
	for (var i = 0; i < members.length; i++) {
		m = members[i];

		index = _.findIndex(shopifyRows, function (s) {
			return s.email === m.email;
		}, index);

		if (index === -1) {
			console.log(m.email + " not found");
		} else {
			do {

				//  Convert nulls to empty strings so we'll match appropriately.
				if (shopifyRows[index].sFirst === null) {
					shopifyRows[index].sFirst = '';
				}
				if (shopifyRows[index].sLast === null) {
					shopifyRows[index].sLast = '';
				}
				if (shopifyRows[index].sEmail === null) {
					shopifyRows[index].sEmail = '';
				}
				if (shopifyRows[index].sZip === null) {
					shopifyRows[index].sZip = '';
				}

				var s = {
					email: shopifyRows[index].sEmail.toLowerCase(),
					firstName: shopifyRows[index].sFirst,
					lastName: shopifyRows[index].sLast,
					zip: shopifyRows[index].sZip,
					verifiedMemberFlag: shopifyRows[index].sVerifiedFlag,
					storeId: shopifyRows[index].sStoreId
					// customerId: shopifyRows[i].scCustomerId
				}
				m.shopify.push(s);
				index++;
			} while ((index < shopifyRows.length) && (shopifyRows[index].email === m.email));
		}

		// if (i % 10000 === 0) {
		// 	console.log(i);
		// }
	}
	shopifyRows = [];

	return members;
}



//
//  Load shopify customer data into array of members objects.
//
var loadShopifyCustomers = async (members, offset, limit) => {
	var c = {};
	var result = await MemberSync.getShopifyCustomersWithEmail();
	var shopifyCustomerRows = result.rows;

	var index = 0;
	for (var i = 0; i < members.length; i++) {
		m = members[i];

		index = _.findIndex(shopifyCustomerRows, function (sc) {
			return sc.email.toLowerCase() === m.email;
		}, index);

		if (index === -1) {
			console.log(m.email + " not found");
		} else {
			do {

				c = {
					email: shopifyCustomerRows[index].email.toLowerCase(),
					customerId: shopifyCustomerRows[index].scCustomerId,
					storeId: shopifyCustomerRows[index].scStoreId
				}
				m.shopifyCustomers.push(c);
				index++;
			} while ((index < shopifyCustomerRows.length) && (shopifyCustomerRows[index].email.toLowerCase() === m.email));
		}

		// if (i % 10000 === 0) {
		// 	console.log(i);
		// }
	}
	shopifyCustomerRows = [];

	return members;
}



//
//  Write is discrepancy error row to the error worksheet.
//
var logError = (errorRow, errorWorksheet, member, errors) => {
	errorWorksheet.getCell(errorRow, 1).value = member.dateCreated;
	errorWorksheet.getCell(errorRow, 2).value = member.id;
	errorWorksheet.getCell(errorRow, 3).value = member.status;
	errorWorksheet.getCell(errorRow, 4).value = member.mbrEmail;
	errorWorksheet.getCell(errorRow, 5).value = member.mbrFname;
	errorWorksheet.getCell(errorRow, 6).value = member.mbrLname;
	errorWorksheet.getCell(errorRow, 7).value = member.mbrZip;

	for (var i = 0; i < errors.length; i++) {
		errorWorksheet.getCell(errorRow, 8).value = errors[i].type;
		errorWorksheet.getCell(errorRow, 9).value = errors[i].detail;
		console.log(errors[i].type + " " + errors[i].detail);
		errorRow++;
	}


	return errorRow;
}



var pushError = async (errors, member, e) => {
	var ignore = await ignoreDiscrepancy(member.id, e.type, e.detail);

	if (!ignore) {
		errors.push({
			type: e.type,
			detail: e.detail
		});
	}

	return errors;
}



var lookupMCList = async (listName) => {
	try {
		var list = undefined;
		var listFound = false;


		//	
		//	Lookup lists.
		//
		for (var i = 0; i < mcLists.length; i++) {
			if (mcLists[i].name === listName) {
				listFound = true;
				list = JSON.parse(JSON.stringify(mcLists[i]));
			}
		}

		if (!listFound) {

			var listsResponse = await mc.get({
				path: '/lists'
			});

			//
			//	If there's a result, loop through the lists and see if we can find the target list.
			//
			if ((listsResponse != undefined) && (listsResponse.lists != undefined)) {
				for (var i = 0; i < listsResponse.lists.length; i++) {
					if (listName === listsResponse.lists[i].name) {
						list = listsResponse.lists[i];
						listFound = true;
						mcLists.push(listsResponse.lists[i]);
					}
				}
			}
		}

		return (list);
	} catch (e) {
		logUtils.logException(e);
	};
}



var addMCMember = async (member) => {
	var requestBody = {};

	var body = {
		email_address: member.email,
		status: 'subscribed',
		merge_fields: {
			FNAME: member.firstName,
			LNAME: member.lastName,
			MMERGE3: member.zip,
			MMERGE5: (member.emailVerificationFlag === 1) ? 'Y' : ''
		},
	}

	var listName = 'The Rush Market - Omaha';
	if (member.homeShopifyStoreId === 0) {
		listName = 'The Rush Market - Outliers';
	} else if (member.homeShopifyStoreId === 2) {
		listName = 'The Rush Market - Lincoln';
	}


	var listInfo = await lookupMCList(listName);
	if (listInfo === undefined) {
		comms.sendEmail('matt@rushmarket.com', 'Mailchimp List Error', listName + ' could not be found.  Email: ' + member.email, listName + ' could not be found.  Email: ' + member.email);
		return;
	}

	var listId = listInfo.id;


	try {
		var result = await mc.post({
			path: '/lists/' + listId + '/members',
			body: body
		});

		return result;
	} catch (e) {
		if (e.title === 'Invalid Resource') {
			// console.log("Invalid Resource");
			return e.message;
		} else {
			return e.message;
		}
	}
}



var updateMCMember = async (member) => {
	var requestBody = {};

	var updateBody = {
		email_address: member.email,
		merge_fields: {
			FNAME: member.firstName,
			LNAME: member.lastName,
			MMERGE3: member.zip,
			MMERGE5: (member.emailVerificationFlag === 1) ? 'Y' : ''
		},
	}

	var listName = 'The Rush Market - Omaha';
	if (member.homeShopifyStoreId === 0) {
		listName = 'The Rush Market - Outliers';
	} else if (member.homeShopifyStoreId === 2) {
		listName = 'The Rush Market - Lincoln';
	}


	var listInfo = await lookupMCList(listName);
	if (listInfo === undefined) {
		comms.sendEmail('matt@rushmarket.com', 'Mailchimp List Error', listName + ' could not be found.  Email: ' + member.email, listName + ' could not be found.  Email: ' + member.email);
		return;
	}

	var listId = listInfo.id;

	requestBody = {
		method: 'put',
		path: `/lists/${listId}/members/${md5(member.email.toLowerCase())}`,
		body: updateBody
	}



	try {
		var result = await mc.request(requestBody);
		return result;
	} catch (e) {
		if (e.title === 'Invalid Resource') {
			console.log("Invalid Resource");
		} else {
			logUtils.logException(e);
		}
	}
}





module.exports = {
	checkForDiscrepancies
}