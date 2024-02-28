'use strict';


const excel = require('exceljs');
const fs = require('fs');
const validator = require('validator');

const colUtils = require('../utils/columnUtils');
const comms = require('../utils/comms');
const fileUtils = require('../utils/fileUtils');



var processGDEExport = async (resp, jobInfo) => {
	var storageContext = {};
	// var whereInfo = {
	// 	clause: jobInfo.whereClause,
	// 	values: []
	// }

	// jobInfo.whereInfo = whereInfo;
	jobInfo.exportFile = "gde-export" + '-' + new Date().getHours() + new Date().getMinutes() + '.xlsx';

	storageContext = fileUtils.getContext("CATALOG", 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context " + "CATALOG" + " doesn't exist.");
	} else {

		resp = await writeGDEExportSheet(jobInfo, "CATALOG", resp);
		return resp;
	}
};



var writeGDEExportSheet = async (jobInfo, storageContext, resp) => {
	var chunkSize = process.env.EXPORT_CHUNK_SIZE ? process.env.EXPORT_CHUNK_SIZE : 1000;
	const exportOptions = {
		filename: 'sheets/' + jobInfo.exportFile,
		useStyles: true,
		useSharedStrings: true
	};
	var exportWorkbook = new excel.stream.xlsx.WorkbookWriter(exportOptions);
	var exportWorksheet = null;
	var rowsProcessed = 0;

	exportWorksheet = exportWorkbook.addWorksheet('Export');

	exportWorksheet.getCell(1, (1)).value = 'sku';
	exportWorksheet.getCell(1, (2)).value = 'category_1_name';
	exportWorksheet.getCell(1, (3)).value = 'category_2_name';
	exportWorksheet.getCell(1, (4)).value = 'ship_type';
	exportWorksheet.getCell(1, (5)).value = 'box_count';
	exportWorksheet.getCell(1, (6)).value = 'shippable';
	exportWorksheet.getCell(1, (7)).value = 'local_shipping';
	exportWorksheet.getCell(1, (8)).value = 'origin_market';
	exportWorksheet.getCell(1, (9)).value = 'dest_market';
	exportWorksheet.getCell(1, (10)).value = 'price';
	exportWorksheet.getCell(1, (11)).value = 'threshold_shipping';
	exportWorksheet.getCell(1, (12)).value = 'large_item_fee';
	exportWorksheet.getCell(1, (13)).value = 'product_cost';
	exportWorksheet.getCell(1, (14)).value = 'drop_ship_fee';
	exportWorksheet.getCell(1, (15)).value = 'national_ship_cost';
	exportWorksheet.getCell(1, (16)).value = 'local_ship_cost';
	exportWorksheet.getCell(1, (17)).value = 'national_margin_pct';
	exportWorksheet.getCell(1, (18)).value = 'local_margin_pct';
	exportWorksheet.getCell(1, (19)).value = 'margin_threshold';
	exportWorksheet.getCell(1, (20)).value = 'eligbility';

	await exportWorksheet.getRow(1).commit();

	var row = 2;

	// var rows = await GDE.getExportInfo({
	// 	dbPool: globals.pool,
	// 	dbProdPool: globals.productPool,
	// 	mongoIdGen: globals.mongoid
	// });

	// console.log("Rows: " + rowsProcessed + " of " + rowCount.totalCount + " " + rows.products[0].vendorSku);


	for (var i = 0; i < rows.length; i++) {
		exportWorksheet.getCell(row, (1)).value = rows[i]['sku'];
		exportWorksheet.getCell(row, (2)).value = rows[i]['category1Name'];
		exportWorksheet.getCell(row, (3)).value = rows[i]['category2Name'];
		exportWorksheet.getCell(row, (4)).value = rows[i]['shipType'];
		exportWorksheet.getCell(row, (5)).value = rows[i]['boxCount'];
		exportWorksheet.getCell(row, (6)).value = rows[i]['shippable'];
		exportWorksheet.getCell(row, (7)).value = rows[i]['localShipping'];
		exportWorksheet.getCell(row, (8)).value = rows[i]['originMarket'];
		exportWorksheet.getCell(row, (9)).value = rows[i]['destinationMarket'];
		exportWorksheet.getCell(row, (10)).value = rows[i]['price'];
		exportWorksheet.getCell(row, (11)).value = rows[i]['thresholdShipping'];
		exportWorksheet.getCell(row, (12)).value = rows[i]['largeItemFee'];
		exportWorksheet.getCell(row, (13)).value = rows[i]['productCost'];
		exportWorksheet.getCell(row, (14)).value = rows[i]['dropShipFee'];
		exportWorksheet.getCell(row, (15)).value = rows[i]['nationalShipCost'];
		exportWorksheet.getCell(row, (16)).value = rows[i]['localShipCost'];
		exportWorksheet.getCell(row, (17)).value = rows[i]['nationalMarginPct'];
		exportWorksheet.getCell(row, (18)).value = rows[i]['localMarginPct'];
		exportWorksheet.getCell(row, (19)).value = rows[i]['marginEligibilityThreshold'];
		exportWorksheet.getCell(row, (20)).value = rows[i]['eligibility'];

		await exportWorksheet.getRow(row).commit();
		row++;
	}
	

	await exportWorkbook.commit();
	// await exportWorkbook.xlsx.writeFile('sheets/' + jobInfo.exportFile);

	var results = await fileUtils.storeMultipartFile(storageContext, 'vendor-catalog-exports', 'sheets/' + jobInfo.exportFile, jobInfo.exportFile, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync('sheets/' + jobInfo.exportFile);

	if (jobInfo.id != undefined) {
		await Products.completeExportJob(jobInfo.id, results.url);
	}

	return resp;
}




var writeTRMExportSheet = async (jobInfo, storageContext, products, resp) => {
	var exportWorkbook = new excel.Workbook();
	var exportWorksheet = null;

	exportWorksheet = exportWorkbook.addWorksheet('Export');
	var colInfo = await Vendors.getTRMTemplateColumnInfo();

	exportWorksheet.getCell(1, (1)).value = 'coreleap_sku';
	exportWorksheet.getCell(1, (2)).value = 'coreleap_variant_sku';
	exportWorksheet.getCell(1, (3)).value = 'dropship_inventory';
	for (var i = 0; i < colInfo.length; i++) {
		exportWorksheet.getCell(1, (i + 4)).value = colInfo[i].dataPoint;
	}

	var row = 2;
	for (var i = 0; i < products.length; i++) {
		exportWorksheet.getCell(row, (1)).value = products[i]['sku'];
		exportWorksheet.getCell(row, (2)).value = products[i]['variantSku'];
		exportWorksheet.getCell(row, (3)).value = products[i]['dropshipInventory'];
		for (var j = 0; j < colInfo.length; j++) {
			if (colInfo[j].dataPoint === 'master_id (if children)') {
				exportWorksheet.getCell(row, (j + 4)).value = products[i]['masterId'];
			}
			else {
				exportWorksheet.getCell(row, (j + 4)).value = products[i][colUtils.colToKey(colInfo[j].dataPoint)];
			}
		}

		row = row + 1;
	}

	await exportWorkbook.xlsx.writeFile('sheets/' + jobInfo.exportFile);


	var results = await fileUtils.storeMultipartFile(storageContext, 'vendor-catalog-exports', 'sheets/' + jobInfo.exportFile, jobInfo.exportFile, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync('sheets/' + jobInfo.exportFile);

	if (jobInfo.id != undefined) {
		await Products.completeExportJob(jobInfo.id, results.url);
	}

	return resp;
}



var sendJobCompletionEmail = (jobInfo) => {
	var msg = `Your export job ${jobInfo.id} has been processed. Log in to see results.`;
	var to = process.env.TECH_EMAIL;

	if ((jobInfo.submitter != undefined) && (jobInfo.submitter.email != undefined) && (validator.isEmail(jobInfo.submitter.email))) {
		to = jobInfo.submitter.email;
	} else {
		msg = msg + '   NOTE: This job was not submitted by an identified submitter.';
	}

	comms.sendEmail(to, 'Export Job Completion', msg, msg, process.env.EMAIL_USER);
}





module.exports = {
	processGDEExport
};