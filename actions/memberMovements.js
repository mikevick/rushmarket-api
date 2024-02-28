'use strict';

const _ = require('lodash');
const check = require('check-types');
const excel = require('exceljs');
const fs = require('fs');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

const memberActions = require('../actions/members');
const zipActions = require('../actions/zipToCity');

const Members = require('../models/members');
const ZipToCity = require('../models/zipToCity');

const comms = require('../utils/comms');
const configUtils = require('../utils/configUtils');
const fileUtils = require('../utils/fileUtils');
const shopifyUtils = require('../utils/shopifyUtils');




var initWorksheet = (title) => {
	var col = 1;
	var result = {
		filename: 'move-' + new Date().getHours() + new Date().getMinutes() + '.xlsx',
		workbook: null,
		worksheet: null
	}

	result.workbook = new excel.Workbook();

	result.worksheet = result.workbook.addWorksheet('Members');
	result.worksheet.getCell(1, 1).value = title;
	result.worksheet.getCell(2, col++).value = 'ID';
	result.worksheet.getCell(2, col++).value = 'Email';
	result.worksheet.getCell(2, col++).value = 'First';
	result.worksheet.getCell(2, col++).value = 'Last';
	result.worksheet.getCell(2, col++).value = 'Zip';
	result.worksheet.getCell(2, col++).value = 'Result';

	return result;
}



var initSlottingWorksheet = (title, summaryLines) => {
	var col = 1;
	var result = {
		filename: 'slotting-' + new Date().getHours() + new Date().getMinutes() + '.xlsx',
		workbook: null,
		worksheet: null
	}

	result.workbook = new excel.Workbook();

	result.worksheet = result.workbook.addWorksheet('Members');


	result.worksheet.getCell(1, 1).value = title;

	result.worksheet.getCell(2, col++).value = 'Current City';
	result.worksheet.getCell(2, col++).value = 'New City';
	result.worksheet.getCell(2, col++).value = 'Count';

	col = 1;
	result.worksheet.getCell(4 + summaryLines, col++).value = 'ID';
	result.worksheet.getCell(4 + summaryLines, col++).value = 'Email';
	result.worksheet.getCell(4 + summaryLines, col++).value = 'Zip';
	result.worksheet.getCell(4 + summaryLines, col++).value = 'Current City';
	result.worksheet.getCell(4 + summaryLines, col++).value = 'New City';
	result.worksheet.getCell(4 + summaryLines, col++).value = 'Result';

	return result;
}



var moveLincolnInOmaha = async (resp) => {
	var col = 1;
	var row = 3;
	var tmpReq = {};

	tmpReq.params = {};
	tmpReq.body = {};

	var storageContext = fileUtils.getContext("RUSHMARKET", 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context RUSHMARKET doesn't exist.");
	}

	var info = initWorksheet('Members Slotted In Omaha List w/ Lincoln Zips');

	var moving = await Members.getLincolnInOmaha();

	for (var i = 0; i < moving.length; i++) {
		try {
			col = 1;
			info.worksheet.getCell(row, col++).value = moving[i].id;
			info.worksheet.getCell(row, col++).value = moving[i].email;
			info.worksheet.getCell(row, col++).value = moving[i].first_name;
			info.worksheet.getCell(row, col++).value = moving[i].last_name;
			info.worksheet.getCell(row, col++).value = moving[i].zip;

			var tmpResp = {
				statusCode: 200
			};

			tmpReq.params.id = moving[i].id;
			tmpReq.body.shopifyStoreId = 2;

			var r = await memberActions.setHomeCity(tmpReq, tmpResp);

			if (r.statusCode === 200) {
				info.worksheet.getCell(row, col++).value = 'OK';
			} else {
				info.worksheet.getCell(row, col++).value = r.statusCode + ' ' + r.message;
			}
		} catch (e) {
			info.worksheet.getCell(row, col++).value = r.statusCode + ' ' + r.message;
		}

		row++;
	}

	await info.workbook.xlsx.writeFile('sheets/' + info.filename);

	var results = await fileUtils.storeMultipartFile(storageContext, 'member-movements', 'sheets/' + info.filename, info.filename, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync('sheets/' + info.filename);

	return resp;
}



var moveLincolnInOutliers = async (resp) => {
	var col = 1;
	var row = 3;
	var tmpReq = {};

	tmpReq.params = {};
	tmpReq.body = {};

	var storageContext = fileUtils.getContext("RUSHMARKET", 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context RUSHMARKET doesn't exist.");
	}

	var info = initWorksheet('Members Slotted In Outliers List w/ Lincoln Zips');

	var moving = await Members.getLincolnInOutliers();

	for (var i = 0; i < moving.length; i++) {
		try {
			col = 1;
			info.worksheet.getCell(row, col++).value = moving[i].id;
			info.worksheet.getCell(row, col++).value = moving[i].email;
			info.worksheet.getCell(row, col++).value = moving[i].first_name;
			info.worksheet.getCell(row, col++).value = moving[i].last_name;
			info.worksheet.getCell(row, col++).value = moving[i].zip;

			var tmpResp = {
				statusCode: 200
			};

			tmpReq.params.id = moving[i].id;
			tmpReq.body.shopifyStoreId = 2;

			var r = await memberActions.setHomeCity(tmpReq, tmpResp);

			if (r.statusCode === 200) {
				info.worksheet.getCell(row, col++).value = 'OK';
			} else {
				info.worksheet.getCell(row, col++).value = r.statusCode + ' ' + r.message;
			}
		} catch (e) {
			info.worksheet.getCell(row, col++).value = r.statusCode + ' ' + r.message;
		}

		row++;
	}

	await info.workbook.xlsx.writeFile('sheets/' + info.filename);

	var results = await fileUtils.storeMultipartFile(storageContext, 'member-movements', 'sheets/' + info.filename, info.filename, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync('sheets/' + info.filename);

	return resp;
}



var moveOutliers = async (resp) => {
	var col = 1;
	var row = 3;
	var tmpReq = {};

	tmpReq.params = {};
	tmpReq.body = {};

	var storageContext = fileUtils.getContext("RUSHMARKET", 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context RUSHMARKET doesn't exist.");
	}

	var info = initWorksheet('Members Slotted In Omaha/Lincoln w/ Outlier Zips');

	var moving = await Members.getSlottedOutliers();

	for (var i = 0; i < moving.length; i++) {
		try {
			col = 1;
			info.worksheet.getCell(row, col++).value = moving[i].id;
			info.worksheet.getCell(row, col++).value = moving[i].email;
			info.worksheet.getCell(row, col++).value = moving[i].first_name;
			info.worksheet.getCell(row, col++).value = moving[i].last_name;
			info.worksheet.getCell(row, col++).value = moving[i].zip;

			var tmpResp = {
				statusCode: 200
			};

			tmpReq.params.id = moving[i].id;
			tmpReq.body.shopifyStoreId = 0;

			var r = await memberActions.setHomeCity(tmpReq, tmpResp);

			if (r.statusCode === 200) {
				info.worksheet.getCell(row, col++).value = 'OK';
			} else {
				info.worksheet.getCell(row, col++).value = r.statusCode + ' ' + r.message;
			}
		} catch (e) {
			info.worksheet.getCell(row, col++).value = r.statusCode + ' ' + r.message;
		}

		row++;
	}

	await info.workbook.xlsx.writeFile('sheets/' + info.filename);

	var results = await fileUtils.storeMultipartFile(storageContext, 'member-movements', 'sheets/' + info.filename, info.filename, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync('sheets/' + info.filename);

	return resp;
}



var transitionLincolnToOmahaTag = async (resp) => {
	var col = 1;
	var row = 3;
	var tmpReq = {};

	tmpReq.params = {};
	tmpReq.body = {};


	try {
		// var me = await Members.getByEmail("lincoln101@rushmarket.com");

		// var shopifyUpdateInfo = await shopifyUtils.prepareShopifyUpdateBody(me[0].homeShopifyStoreId, me[0]);
		// var r = await shopifyUtils.updateMemberInfo(0, me[0].id, shopifyUpdateInfo);

		// var cityInfo = shopifyUtils.getCityInfoByShopId(me[0].homeShopifyStoreId);
		// if (cityInfo.hubShopifyStoreId !== cityInfo.id) {
		// 	var citySlug = cityInfo.citySlug;

		// 	var hubCityInfo = shopifyUtils.getCityInfoByShopId(cityInfo.hubShopifyStoreId);
		// 	hubCityInfo.citySlug = citySlug;
		// 	var result = await shopifyUtils.addMemberFromMember(hubCityInfo, me[0]);

		// 	//	If the shopify add was successful, link the shopify customer id
		// 	if ((result !== undefined) && (result !== null) && (result.id > 0)) {
		// 		await Members.linkMemberToShopifyStore(me[0].id, hubCityInfo.shopName, result.id);
		// 	}
		// }





		var moving = await Members.getLincolnMembers();

		for (var i = 0; i < moving.length; i++) {
			// console.log(i + " " + moving[i].email + " " + moving[i].verifiedMemberFlag);

			var shopifyUpdateInfo = await shopifyUtils.prepareShopifyUpdateBody(moving[i], moving[i]);
			var r = await shopifyUtils.updateMemberInfo(0, moving[i].id, shopifyUpdateInfo);

		}

		// console.log("Done.");

	} catch (e) {
		// console.log(e.message);
	}

	return resp;
}



var transitionOmahaTag = async (resp) => {
	var max = 0;
	var tmpReq = {};

	tmpReq.params = {};
	tmpReq.body = {};


	try {
		var moving = await Members.getOmahaMembers();

		for (var i = 0; i < moving.length; i++) {
			// console.log(i + " " + moving[i].email + " " + moving[i].verifiedMemberFlag);

			var shopifyUpdateInfo = await shopifyUtils.prepareShopifyUpdateBody(moving[i], moving[i]);
			var r = await shopifyUtils.updateMemberInfo(0, moving[i].id, shopifyUpdateInfo);
			if (r[0] !== undefined) {
				max++;
				// console.log(max + " of 1000");
				// if (max === 10000) {
				// 	break;
				// }
			}

		}

		// console.log("Done.");

	} catch (e) {
		// console.log(e.message);
	}

	return resp;
}




var transitionLincolnToOmahaAdd = async (resp) => {
	var col = 1;
	var row = 3;
	var tmpReq = {};

	tmpReq.params = {};
	tmpReq.body = {};


	try {
		var moving = await Members.getLincolnMembersNotInOmaha();

		for (var i = 0; i < moving.length; i++) {
			// console.log(i + " " + moving[i].email + " " + moving[i].verifiedMemberFlag);

			var cityInfo = shopifyUtils.getCityInfoByShopId(moving[i].homeShopifyStoreId);
			// hub in this case is 1 for Omaha
			if (cityInfo.id !== 1) {
				var citySlug = cityInfo.citySlug;

				var hubCityInfo = shopifyUtils.getCityInfoByShopId(1);
				hubCityInfo.citySlug = citySlug;
				var result = await shopifyUtils.addMemberFromMember(hubCityInfo, moving[i]);

				//	If the shopify add was successful, link the shopify customer id
				if ((result !== undefined) && (result !== null) && (result.id > 0)) {
					await Members.linkMemberToShopifyStore(moving[i].id, hubCityInfo.shopName, result.id);
				}
			}

			await sleep(500);

		}

	} catch (e) {
		console.log(e.message);
	}

	return resp;
}



var transitionLincolnFinds = async (resp) => {
	var col = 1;
	var row = 3;
	var tmpReq = {};

	tmpReq.params = {};
	tmpReq.body = {};


	try {
		var moving = await Members.getLincolnFinds();

		for (var i = 0; i < moving.length; i++) {
			console.log(i + " " + moving[i].memberId + " " + moving[i].shopifyCustomerId);

			var info = await Members.getShopifyCustomerId({id: 1}, moving[i].memberId);
			await Members.updateFindsCustomer(moving[i].memberId, info[0].shopifyCustomerId, 'omaha')
			// await sleep(500);
		}

	} catch (e) {
		console.log(e.message);
	}

	return resp;
}







var moveLincolnToOmaha = async (resp) => {
	var col = 1;
	var row = 3;
	var tmpReq = {};

	tmpReq.params = {};
	tmpReq.body = {};

	var storageContext = fileUtils.getContext("RUSHMARKET", 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context RUSHMARKET doesn't exist.");
	}

	var info = initWorksheet('Migrate Lincoln Members To Omaha');

	var moving = await Members.getLincolnMembers();

	for (var i = 0; i < moving.length; i++) {
		try {
			col = 1;
			info.worksheet.getCell(row, col++).value = moving[i].id;
			info.worksheet.getCell(row, col++).value = moving[i].email;
			info.worksheet.getCell(row, col++).value = moving[i].firstName;
			info.worksheet.getCell(row, col++).value = moving[i].lastName;
			info.worksheet.getCell(row, col++).value = moving[i].zip;

			var tmpResp = {
				statusCode: 200
			};

			tmpReq.params.id = moving[i].id;
			tmpReq.body.shopifyStoreId = 1;

			var r = await memberActions.setHomeCity(tmpReq, tmpResp);

			if (r.statusCode === 200) {
				info.worksheet.getCell(row, col++).value = 'OK';
			} else {
				info.worksheet.getCell(row, col++).value = r.statusCode + ' ' + r.message;
			}
		} catch (e) {
			info.worksheet.getCell(row, col++).value = r.statusCode + ' ' + r.message;
		}

		row++;
	}

	await info.workbook.xlsx.writeFile('sheets/' + info.filename);

	var results = await fileUtils.storeMultipartFile(storageContext, 'member-movements', 'sheets/' + info.filename, info.filename, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync('sheets/' + info.filename);

	return resp;
}




var moveNationalToOutliers = async (resp) => {
	var col = 1;
	var row = 3;
	var tmpReq = {};

	tmpReq.params = {};
	tmpReq.body = {};

	var storageContext = fileUtils.getContext("RUSHMARKET", 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context RUSHMARKET doesn't exist.");
	}

	var info = initWorksheet('Members Slotted In National');

	var moving = await Members.getNational();

	for (var i = 0; i < moving.length; i++) {
		try {
			col = 1;
			info.worksheet.getCell(row, col++).value = moving[i].id;
			info.worksheet.getCell(row, col++).value = moving[i].email;
			info.worksheet.getCell(row, col++).value = moving[i].first_name;
			info.worksheet.getCell(row, col++).value = moving[i].last_name;
			info.worksheet.getCell(row, col++).value = moving[i].zip;

			var tmpResp = {
				statusCode: 200
			};

			tmpReq.params.id = moving[i].id;
			tmpReq.body.cityId = 0;

			var r = await memberActions.setHomeCity(tmpReq, tmpResp);
			// var r = {
			// 	statusCode: 200
			// }

			if (r.statusCode === 200) {
				info.worksheet.getCell(row, col++).value = 'OK';
			} else {
				info.worksheet.getCell(row, col++).value = r.statusCode + ' ' + r.message;
			}
		} catch (e) {
			console.log("Exception: " + e.message);
			console.log(JSON.stringify(e, undefined, 2));
			info.worksheet.getCell(row, col++).value = 'exception';
		}

		row++;
	}

	await info.workbook.xlsx.writeFile('sheets/' + info.filename);

	var results = await fileUtils.storeMultipartFile(storageContext, 'member-movements', 'sheets/' + info.filename, info.filename, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync('sheets/' + info.filename);

	return resp;
}



var realignMembersToZips = async (resp) => {
	var col = 1;
	var movements = [];
	var row = 3;
	var tmpReq = {};

	tmpReq.params = {};
	tmpReq.body = {};

	var storageContext = fileUtils.getContext("RUSHMARKET", 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context RUSHMARKET doesn't exist.");
	}

	var summary = await Members.getMisSlottedSummary();

	var info = initSlottingWorksheet('Reslotted Members', summary.length);

	for (var i=0; i < summary.length; i++) {
		movements.push({
			currentCity: summary[i].currentCity,
			newCity: summary[i].newCity,
			count: 0
		})
	}

	var moving = await Members.getMisSlotted();


	row += (summary.length + 2);

	var len = moving.length;
	if (configUtils.get("RESLOT_PER_RUN") !== null) {
		len = parseInt(configUtils.get("RESLOT_PER_RUN"));
	}

	for (var i = 0; i < len; i++) {
		console.log("Processing " + i + " of " + len);
		try {
			col = 1;
			info.worksheet.getCell(row, col++).value = moving[i].memberId;
			info.worksheet.getCell(row, col++).value = moving[i].email;
			info.worksheet.getCell(row, col++).value = moving[i].zip;
			info.worksheet.getCell(row, col++).value = moving[i].currentCity;
			info.worksheet.getCell(row, col++).value = moving[i].newCity;

			var tmpResp = {
				statusCode: 200
			};

			tmpReq.params.id = moving[i].memberId;
			tmpReq.body.cityId = moving[i].newId;

			var r = await memberActions.setHomeCity(tmpReq, tmpResp);
			// var r = {
			// 	statusCode: 200
			// }

			if (r.statusCode === 200) {
				info.worksheet.getCell(row, col++).value = 'OK';

				var index = _.findIndex(movements, function(m) {
					return ((m.currentCity === moving[i].currentCity) && (m.newCity === moving[i].newCity));
				})

				if (index >= 0) {
					movements[index].count++;
				}
			} else {
				info.worksheet.getCell(row, col++).value = r.statusCode + ' ' + r.message;
			}
		} catch (e) {
			console.log("Exception: " + e.message);
			console.log(JSON.stringify(e, undefined, 2));
			info.worksheet.getCell(row, col++).value = 'exception';
		}

		row++;
	}

	row = 3;
	col = 1;

	for (var i=0; i < movements.length; i++) {
		col = 1;
		info.worksheet.getCell(row, col++).value = movements[i].currentCity;
		info.worksheet.getCell(row, col++).value = movements[i].newCity;
		info.worksheet.getCell(row, col++).value = movements[i].count;

		row++;
	}

	await info.workbook.xlsx.writeFile('sheets/' + info.filename);

	var results = await fileUtils.storeMultipartFile(storageContext, 'member-movements', 'sheets/' + info.filename, info.filename, false);

	if (results != undefined) {
		resp.url = results.url;
		comms.sendEmail('matt@rushmarket.com', 'Reslot', results.url, results.url);
	}

	//	Remove the local exported products file.
	fs.unlinkSync('sheets/' + info.filename);

	return resp;
}





var tagAllMembers = async (req, resp) => {
	var limit = 100;
	var offset = 0;
	var max = 0;
	var tmpReq = {};
	var whereInfo = {
		clause: "",
		values: []
	};


	if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
		limit = parseInt(req.query.limit);
	}
	if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
		offset = parseInt(req.query.offset);
	}


	tmpReq.params = {};
	tmpReq.body = {};

	// var limit = 1000;
	// if (configUtils.get("TAG_PER_RUN") !== null) {
	// 	limit = parseInt(configUtils.get("TAG_PER_RUN"));
	// }


	try {
		var tagging = await Members.getAll(whereInfo, "date_created", offset, limit);

		console.log("Processing tags for " + tagging.rows.length + " members");

		for (var i = 0; i < tagging.rows.length; i++) {
			console.log(i + " " + tagging.rows[i].email + " " + tagging.rows[i].verifiedMemberFlag);

			await memberActions.tagMember(tagging.rows[i]);

			// max++;
			// console.log(max + " of " + limit);
			// if (max === limit) {
			// 	break;
			// }

			await sleep(250);

		}

		console.log("Done.");

	} catch (e) {
		console.log(e.message);
	}

	return resp;
}




var processZips = async (path, resp) => {
	let cityColumn = -1;
	let populationColumn = -1;
	let regionColumn = -1;
	let rowCounter = 0;
	let typeColumn = -1;
	let workbookReader = new excel.stream.xlsx.WorkbookReader(path);
	let worksheetReader = undefined;
	let zipColumn = -1;
	

	for await (worksheetReader of workbookReader) {
		break;
	}

	for await (const row of worksheetReader) {
		rowCounter++;

		if (rowCounter === 1) {
			for (let i = 0; i < row._cells.length; i++) {
				switch (row._cells[i].value) {
					case 'Zip Code':
						zipColumn = i;
						break;
					case 'City ID':
						cityColumn = i;
						break;
					case 'Type':
						typeColumn = i;
						break;
					case 'Region':
						regionColumn = i;
						break;
					case 'Population':
						populationColumn = i;
						break;
				}
			}
		}
		else {
			let zip = row._cells[zipColumn].text;
			if (zip.length === 4) {
				zip = `0${zip}`;
			}
			let cityId = row._cells[cityColumn].value;
			let type = row._cells[typeColumn].value;
			let region = row._cells[regionColumn].value;
			let population = row._cells[populationColumn].value;

			let mapping = await ZipToCity.getByZipCode(zip);

			//	Existing zip-to-city mapping
			if (mapping) {
				let body = {
					cityId: cityId,
					type: type,
					region: region,
					population: population,
					zips: `${zip}`
				}
				await zipActions.updateZips(body, { statusCode: 200, message: 'Success', data: {}});
			}
			//	New zip-to-city mapping
			else {
				let body = {
					cityId: cityId,
					type: type,
					region: region,
					population: population,
					zips: `${zip}`
				}
				await zipActions.addZips(body, { statusCode: 200, message: 'Success', data: {}});
			}

		}
	}

}





module.exports = {
	moveLincolnInOmaha,
	moveLincolnInOutliers,
	moveLincolnToOmaha,
	moveNationalToOutliers,
	moveOutliers,
	processZips,
	tagAllMembers,
	realignMembersToZips,
	transitionLincolnFinds,
	transitionLincolnToOmahaAdd,
	transitionLincolnToOmahaTag,
	transitionOmahaTag
}