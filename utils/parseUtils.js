'use strict';

const globals = require('../globals');

const AdmZip = require('adm-zip');
const excel = require('exceljs');
const fs = require('fs');
const mime = require('mime-types');
const mysql = require('promise-mysql');
const pathUtil = require('path');
const { promisify } = require('util');
const sleep = promisify(setTimeout);
const validator = require('validator');

const coinActions = require('../actions/coins');

const colUtils = require('../utils/columnUtils');
const comms = require('../utils/comms');
const fileUtils = require('../utils/fileUtils');
const logUtils = require('../utils/logUtils');
const productUtils = require('../utils/productUtils');
const { formatResp } = require('../utils/response');
const validationUtils = require('../utils/validationUtils');
const vendorUtils = require('../utils/vendorUtils');

const Manifests = require('../models/manifests');
const Vendors = require('../models/vendors');


//
//	Process a catalog job.
//
var processJob = async (resp, jobInfo, testParseFlag) => {
	var mappings = null;
	var p = null;
	var worksheetInfo = null;

	try {
		worksheetInfo = await Vendors.getWorksheetInfo(jobInfo.vendorId);
		if (worksheetInfo === undefined) {
			var vendor = await Vendors.getById(jobInfo.vendorId);
			if (vendor.length > 0) {
				throw new Error("Catalog worksheet info for vendor " + vendor[0].name + " not found.");
			} else {
				throw new Error("Catalog worksheet info for vendor " + jobInfo.vendorId + " not found.");
			}
		}
		worksheetInfo = worksheetInfo[0];


		//	Grab the column mapping info.
		switch (jobInfo.format) {
			case 'TRM':
				p = productUtils.getTRMMappings(jobInfo, worksheetInfo);
				break;

			case 'AMAZON':
				p = productUtils.getAmazonMappings(jobInfo, worksheetInfo);
				break;

			case 'WAYFAIR':
				p = productUtils.getWayfairMappings(jobInfo, worksheetInfo);
				break;

			case 'CUSTOM':
				p = productUtils.getCustomLabelMappings(jobInfo, worksheetInfo);
				break;

			default:
				throw new Error("Unrecognized catalog format " + jobInfo.format);
				break;
		}

		mappings = await p;
		//	Sanity check.
		if (mappings.productDescription === undefined) {
			throw new Error("Mapping load failure for job " + JSON.stringify(jobInfo));
		}

		//	Note the job has started.
		if (!testParseFlag) {
			await Vendors.startCatalogJob(jobInfo.id);
		}


		//	If we're really importing into the database, create the temp table.
		if (!testParseFlag) {
			await Vendors.createTempProducts(pathUtil.basename(jobInfo.filePath));
		} else {
			return;
		}

		//	Parse it!
		var results = await parseWorksheet(true, worksheetInfo, mappings, jobInfo, testParseFlag);

		if (!testParseFlag) {
			sendJobCompletionEmail(jobInfo);
		}

		//	Remove the uploaded sheet.
		// fs.unlinkSync(jobInfo.filePath);

		if (testParseFlag) {
			if ((results != undefined) && (results.dataSample != undefined)) {
				resp.dataSample = results.dataSample;
			} else {
				resp.statusCode = 500;
				resp.message = 'This should never happen.';
			}
		}

		return resp;
	} catch (e) {
		logUtils.logException(e);
		if (!testParseFlag) {
			await Vendors.failCatalogJob(jobInfo.id, e.message)
			return sendJobCompletionEmail(jobInfo);
		}
		throw (e);
	};
}



//
//	Process an inventory job.
//
var processInventoryJob = async (resp, jobInfo) => {
	var contentType = mime.lookup(jobInfo.fileName) || 'application/octet-stream';
	var extractFolder = process.cwd() + '/' + jobInfo.filePath + '-extract';
	var prom = [];

	try {
		//	Note the job has started.
		await Vendors.startInventoryJob(jobInfo.id);

		if (contentType === 'application/zip') {
			var zip = new AdmZip(jobInfo.filePath);
			await zip.extractAllTo(extractFolder);

			//	Parse it!
			prom.push(parseInventoryWorksheet(jobInfo));
			prom.push(parseMissingWorksheet(jobInfo));
		}


		prom.push(parseVendorInventoryWorksheet(jobInfo));


		var result = await Promise.all(prom);

		var successfulUpdates = result[0] ? result[0].successfulUpdates : 0;
		successfulUpdates += result[2] ? result[2].successfulUpdates : 0;

		var missingUpdates = result[1] ? result[1].missingUpdates : 0;

		sendInventoryJobCompletionEmail(jobInfo);
		result = Vendors.completeInventoryJob(jobInfo.id, successfulUpdates, missingUpdates);

		return resp;
	} catch (e) {
		logUtils.logException(e);
		await Vendors.failInventoryJob(jobInfo.id, e.message)
		await sendInventoryJobCompletionEmail(jobInfo);
		throw (e);
	};
}


//
//	Parse the inventory worksheet.
//
var parseInventoryWorksheet = async (jobInfo) => {
	var cols = 0;
	var extractFolder = process.cwd() + '/' + jobInfo.filePath + '-extract';
	var updateFile = extractFolder + '/updated.csv';
	var contentType = mime.lookup(updateFile) || 'application/octet-stream';
	var successfulUpdates = 0;
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var p = null;
	var quantity = 0;
	var resp = {};
	var result = null;
	var rows = 0;
	var updateRows = 0;
	var rushSku = undefined;


	if (!fs.existsSync(updateFile)) {
		resp.updateRows = 0;
		resp.successfulUpdates = 0;
		return resp;
	}

	//	Open the workbook.
	if (contentType === 'text/csv') {
		p = inputWorkbook.csv.readFile(updateFile);
		inputWorksheet = await p;
	} else {
		throw new Error('Content type for sheet must be .csv');
	}


	rows = inputWorksheet.rowCount;
	cols = inputWorksheet.columnCount;


	//	Format sanity check.
	if ((inputWorksheet.getCell('C1').text !== 'retailer_sku') || (inputWorksheet.getCell('H1').text !== 'new')) {
		throw new Error('Format of updated spreadsheet different than what was expected.');
	}


	//	Parse the updated inventory quantities.
	for (var i = 2; i <= rows; i++) {
		updateRows += 1;

		if (inputWorksheet.getCell('F' + i).text === 'quantity_available') {

			rushSku = inputWorksheet.getCell('C' + i).text;
			quantity = inputWorksheet.getCell('H' + i).text;

			result = await Manifests.getVendorSkuByRushSku(rushSku);
			if (result.length > 0) {
				result = await Vendors.updateInventoryByVendorSku(result[0].vendorId, result[0].sellerProductId, quantity);
				if (result.affectedRows === 1) {
					successfulUpdates += 1;
				}
			}
		}
	}

	resp.updateRows = updateRows;
	resp.successfulUpdates = successfulUpdates;

	return resp;
}




//
//	Parse the missing worksheet.
//
var parseMissingWorksheet = async (jobInfo) => {
	var cols = 0;
	var extractFolder = process.cwd() + '/' + jobInfo.filePath + '-extract';
	var missingFile = extractFolder + '/missing_from_feed.csv';
	var contentType = mime.lookup(missingFile) || 'application/octet-stream';
	var missingUpdates = 0;
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var p = null;
	var resp = {};
	var result = null;
	var rows = 0;
	var updateRows = 0;
	var rushSku = undefined;


	if (!fs.existsSync(missingFile)) {
		resp.missingUpdates = 0;
		return resp;
	}



	//	Open the workbook.
	if (contentType === 'text/csv') {
		p = inputWorkbook.csv.readFile(missingFile);
		inputWorksheet = await p;
	} else {
		throw new Error('Content type for sheet must be .csv');
	}


	rows = inputWorksheet.rowCount;
	cols = inputWorksheet.columnCount;


	//	Format sanity check.
	if (inputWorksheet.getCell('C1').text !== 'retailer_sku') {
		throw new Error('Format of missing spreadsheet different than what was expected.');
	}


	//	Parse the updated inventory quantities.
	for (var i = 2; i <= rows; i++) {
		updateRows += 1;

		rushSku = inputWorksheet.getCell('C' + i).text;

		result = await Manifests.getVendorSkuByRushSku(rushSku);
		if (result.length > 0) {
			result = await Vendors.updateInventoryByVendorSku(result[0].vendorId, result[0].sellerProductId, 0);
			if (result.affectedRows === 1) {
				missingUpdates += 1;
			}
		}
	}

	resp.missingUpdates = missingUpdates;

	return resp;
}



//
//	Parse the vendor inventory sheet.  This can be a direct upload or the "not in catalog" sheet from duoplane.
//
var parseVendorInventoryWorksheet = async (jobInfo) => {
	var cols = 0;
	var contentType = mime.lookup(jobInfo.fileName) || 'application/octet-stream';
	var extractFolder = process.cwd() + '/' + jobInfo.filePath + '-extract';
	var vendorFile = (contentType === 'application/zip') ? extractFolder + '/not_in_catalog.csv' : jobInfo.filePath;
	var successfulUpdates = 0;
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var p = null;
	var prom = [];
	var resp = {};
	var result = null;
	var rows = 0;
	var quantity = undefined;
	var updateRows = 0;
	var vendorSku = undefined;


	if (!fs.existsSync(vendorFile)) {
		resp.successfulUpdates = 0;
		return resp;
	}


	var worksheetInfo = await Vendors.getInventoryWorksheetInfo(jobInfo.vendorId);
	if (worksheetInfo === undefined) {
		var vendor = await Vendors.getById(jobInfo.vendorId);
		if (vendor.length > 0) {
			throw new Error("Inventory worksheet info for vendor " + vendor[0].name + " not found.");
		} else {
			throw new Error("Inventory worksheet info for vendor " + jobInfo.vendorId + " not found.");
		}
	}


	//	Open the workbook.
	if ((contentType === 'text/csv') || (contentType === 'application/zip')) {
		p = inputWorkbook.csv.readFile(vendorFile);
		inputWorksheet = await p;
	} else if (contentType.indexOf('openxmlformats-officedocument.spreadsheetml.sheet') > 0) {
		p = inputWorkbook.xlsx.readFile(jobInfo.filePath)
		inputWorksheet = await p;

		//	Skip the 0th element, and then skip over any undefined sheets.
		worksheetInfo.worksheetNumber = 1;
		for (var i = 1; i < inputWorkbook._worksheets.length; i++) {
			if (inputWorkbook._worksheets[i] === undefined) {
				worksheetInfo.worksheetNumber++;
			}
		}

		inputWorksheet = inputWorkbook.getWorksheet(worksheetInfo.worksheetNumber);
	} else {
		throw new Error('Content type for sheet must be .csv or .xlsx');
	}


	if (inputWorksheet === undefined) {
		throw new Error('Looks like some tabs were deleted from this spreadsheet. Copy tab into new sheet and resubmit.');
	}
	rows = inputWorksheet.rowCount;
	cols = inputWorksheet.columnCount;


	//	Parse the updated inventory quantities.
	for (var i = worksheetInfo.firstDataRow; i <= rows; i++) {
		updateRows += 1;

		vendorSku = inputWorksheet.getCell(worksheetInfo.vendorSkuColumn + i).text;
		quantity = inputWorksheet.getCell(worksheetInfo.quantityColumn + i).text;

		prom.push(Vendors.updateInventoryByVendorSku(jobInfo.vendorId, vendorSku, quantity));

		if (i % 500 === 0) {
			successfulUpdates += await processInventoryBatch(prom);
		}
	}

	if (prom.length > 0) {
		successfulUpdates += await processInventoryBatch(prom);
	}

	resp.successfulUpdates = successfulUpdates;

	return resp;
}



var processInventoryBatch = async (prom) => {
	var updates = 0;

	var result = await Promise.all(prom);
	prom.length = 0;

	for (var j = 0; j < result.length; j++) {
		if (result[j].affectedRows === 1) {
			updates += 1;
		}
	}

	return updates;
}




var buildColArray = async (conn, mappings, colArray) => {

	var schema = await Vendors.getProductSchema(conn);

	//	Pull columns out of the information schema so this can be somewhat dynamic.  We're only interested in columns that match the TRM template columns.
	for (var i = 0; i < schema.length; i++) {
		//	master_id a special case because it's on the sheet as 'master_id (if children)'. 
		if ((schema[i].COLUMN_NAME === 'master_id') && (mappings[colUtils.colToKey('master_id (if children)')] !== undefined)) {
			colArray.push('master_id');
		} else if ((mappings[colUtils.colToKey(schema[i].COLUMN_NAME)] !== undefined) && (mappings[colUtils.colToKey(schema[i].COLUMN_NAME)].column !== null)) {
			colArray.push(schema[i].COLUMN_NAME);
		}
	}

	return colArray;
}



var buildDataSQL = (colArray) => {
	var o = {};
	var placeholders = '';
	var updateClause = '';

	for (var i = 0; i < colArray.length; i++) {
		if (placeholders.length > 0) {
			placeholders = placeholders + ', ';
		}
		placeholders = placeholders + '?';


		if (colArray[i] != 'id') {
			if (updateClause.length > 0) {
				updateClause = updateClause + ', ';
			}
			updateClause = updateClause + colArray[i] + " = ?"
		}
	}

	o.insertCols = colArray.toString();
	o.placeholders = placeholders;
	o.updateClause = updateClause;

	return o;
}


var buildProductInsertSQL = (row, fixedSQL, skuInfo, colArray) => {
	var valArray = [];

	for (var j = 0; j < colArray.length; j++) {
		valArray.push(row[colArray[j]]);
	}
	valArray.push(skuInfo.sku);
	valArray.push(skuInfo.variantSku);
	valArray.push(skuInfo.variantSequence);
	valArray.push(row['eligible_for_trm']);
	valArray.push(row['eligible_for_inline']);
	valArray.push(row['eligible_for_bulk_buys']);
	valArray.push(row['eligible_for_off_price']);
	valArray.push(row['eligible_for_cost_based_returns']);
	valArray.push(row['eligible_for_rev_share_returns']);
	valArray.push(row['validation_errors']);
	valArray.push(row['trm_eligibility_errors']);
	valArray.push(row['inline_eligibility_errors']);
	valArray.push(row['bulk_buys_eligibility_errors']);
	valArray.push(row['off_price_eligibility_errors']);
	valArray.push(row['cost_based_returns_eligibility_errors']);
	valArray.push(row['rev_share_returns_eligibility_errors']);
	valArray.push(row['search_field']);

	var sql = mysql.format("INSERT INTO vendor_catalog_products (" + fixedSQL.insertCols + ", " +
		"sku, variant_sku, variant_sequence, eligible_for_trm, eligible_for_inline, eligible_for_bulk_buys, eligible_for_off_price, eligible_for_cost_based_returns, eligible_for_rev_share_returns, " +
		"validation_errors, trm_eligibility_errors, inline_eligibility_errors, bulk_buys_eligibility_errors, off_price_eligibility_errors, cost_based_returns_eligibility_errors, rev_share_returns_eligibility_errors, search_field) " +
		"VALUES (" + fixedSQL.placeholders + ", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ", valArray);

	return sql;
}



var buildProductUpdateBody = (row, colArray) => {
	var body = {

	}

	for (var i = 0; i < colArray.length; i++) {
		if (colArray[i] != 'id') {
			body[colUtils.colToKey(colArray[i])] = row[colArray[i]];
		}
	}
	body.eligibleForTrm = row['eligible_for_trm'];
	body.eligibleForInline = row['eligible_for_inline'];
	body.eligibleForBulkBuys = row['eligible_for_bulk_buys'];
	body.eligibleForOffPrice = row['eligible_for_off_price'];
	body.eligibleForCostBasedReturns = row['eligible_for_cost_based_returns'];
	body.eligibleForRevShareReturns = row['eligible_for_rev_share_returns'];
	body.validationErrors = row['validation_errors'];
	body.coreEligibilityErrors = row['core_eligibility_errors'];
	body.trmEligibilityErrors = row['trm_eligibility_errors'];
	body.inlineEligibilityErrors = row['inline_eligibility_errors'];
	body.bulkBuysEligibilityErrors = row['bulk_buys_eligibility_errors'];
	body.offPriceEligibilityErrors = row['off_price_eligibility_errors'];
	body.costBasedReturnsEligibilityErrors = row['cost_based_returns_eligibility_errors'];
	body.revShareReturnsEligibilityErrors = row['rev_share_returns_eligibility_errors'];
	body.searchField = row['search_field'];

	return body;
}







var writeRows = async (conn, colArray, rows) => {
	var sql = "SELECT * FROM vendor_catalog_products";
	var valArr = [];

	try {
		//	Build the SQL specific to the data columns being inserted/updated.
		var dataSQL = buildDataSQL(colArray);

		for (var k = 0; k < rows.length; k++) {

			var row = rows[k];
			valArr = [];

			await conn.beginTransaction();

			var existingProduct = await Vendors.getProductByVendorSku(row['vendor_id'], row['vendor_sku'], conn);

			//	If product doesn't exist already, create it.  Otherwise do an update.
			if (existingProduct.length === 0) {
				var skuInfo = await Vendors.assignSku(conn, row['vendor_id'], row['master_id']);

				sql = buildProductInsertSQL(row, dataSQL, skuInfo, colArray);
				await conn.query(sql);

			} else {
				existingProduct = existingProduct[0];

				var newBody = buildProductUpdateBody(row, colArray);

				// Leverage code to merge an updated product, revalidate it, etc that already exists.
				var updateInfo = await productUtils.orchestrateUpdate(existingProduct, newBody);

				//	Did any of the datapoints that might impact COINs change?  If not do nothing.
				//	If so:
				//		If a missing UPC has been added, look up in coins_to_upc.
				//			If already there do nothing.
				//			If not there, add to coins_to_upc
				//
				//		If UPC has been changed see if there's another product with the old UPC do nothing.
				//			If not another product, remove the mapping.
				//	


				if (updateInfo.product !== undefined) {
					var result = await Vendors.updateProductById(existingProduct.vendorId, existingProduct.id, updateInfo.product);
				}
			}

			await conn.commit();


		}
	} catch (e) {
		logUtils.logException("Write rows exception: " + e);
		conn.rollback();
		throw e;
	}

}






//
//	Merge products out of a temporary table into the master table.
//
var mergeProducts = async (mappings, uuid) => {
	try {
		var colArray = [];
		var conn = null;
		var resp = {
			statusCode: 200,
			messages: 'Success',
			rows: 0
		}


		conn = await globals.productPool.getConnection();

		var rows = await Vendors.checkTempTableExists(conn, uuid);

		//	Validate that the temp table exists and error if not.
		if (rows.length === 0) {
			resp.statusCode = 404;
			resp.message = "Upload table vendor_catalog_import_" + uuid + " doesn't exist.";
			return resp;
		} else {

			colArray.push('id');
			colArray.push('vendor_id');
			await buildColArray(conn, mappings, colArray)

			// Grab all the rows from the temp table.
			rows = await Vendors.getTempTableData(conn, uuid);

			//	Insert or update data from temp table to products table.
			await writeRows(conn, colArray, rows);

			await Vendors.dropTempTable(conn, uuid);

			return resp;
		}
	} catch (e) {
		throw e;
	} finally {
		globals.productPool.releaseConnection(conn);
	}
}



//
//	Build a product object from data in the spreadsheet.
//
var buildProduct = (row, mappings, inputWorksheet) => {
	var product = {};

	Object.keys(mappings).forEach(function (key) {
		// console.log(key + " " + mappings[key]['column']);
		if ((key === 'freightClass') && (mappings[key]['column'] != null) && (inputWorksheet.getCell(mappings[key]['column'] + row).text.trim() === "")) {
			product[key] = null;
		} else {
			if (mappings[key]['column'] != null) {
				if (mappings[key]['column'].startsWith("'")) {
					product[key] = mappings[key]['column'].substring(1);
				} else {
					if (inputWorksheet.getCell(mappings[key]['column'] + row).type != excel.ValueType.Null) {
						product[key] = inputWorksheet.getCell(mappings[key]['column'] + row).text.trim();

						//	Make sure to pad with leading 0s if UPC is short.
						if (key === "upc") {
							if (product[key].length < 12) {
								var beginningLength = product[key].length;
								for (var u = 0; u < (12 - beginningLength); u++) {
									product[key] = "0" + product[key];
								}
							}
						}
					} else {
						product[key] = null;
					}
				}
			}
		}
	}) // Build product


	return product;
}



//
//	Parse the worksheet building products and storing them in the database or alternatively returning them in the response as a data sample.
//
var parseWorksheet = async (mergeFlag, worksheetInfo, mappings, jobInfo, testParseFlag) => {
	var acceptedRows = 0;
	var cols = 0;
	var contentType = mime.lookup(jobInfo.fileName) || 'application/octet-stream';
	var count = 1;
	var eligibleBulkBuys = false;
	var eligibleCore = false;
	var eligibleInline = false;
	var eligibleOffPrice = false;
	var eligibleRevShareReturns = false;
	var eligibleTRM = false;
	var eligibleCostBasedReturns = false;
	var errorRows = 0;
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var p = null;
	var parsedProducts = [];
	var prom = [];
	var rejectedFile = pathUtil.basename(jobInfo.filePath) + '-rejected-' + new Date().getHours() + new Date().getMinutes() + '.xlsx';
	var rejectedRows = 0;
	var rejectedWorkbook = new excel.Workbook();
	var rejectedWorksheet = null;
	var resp = {};
	var result = null;
	var rows = 0;
	var storageContext = {};
	var vendorSkus = [];


	//	Retrieve the storage context.
	storageContext = fileUtils.getContext(process.env.REJECTED_SHEET_STORAGE_CONTEXT, 'OVERWRITE');
	if (storageContext === null) {
		throw new Error("Storage context " + process.env.REJECTED_SHEET_STORAGE_CONTEXT + " doesn't exist.");
	}


	//	Open the workbook.
	if (contentType === 'text/csv') {
		p = inputWorkbook.csv.readFile(jobInfo.filePath)
		inputWorksheet = await p;
	} else if (contentType.indexOf('openxmlformats-officedocument.spreadsheetml.sheet') > 0) {
		p = inputWorkbook.xlsx.readFile(jobInfo.filePath)
		inputWorksheet = await p;

		//	Skip the 0th element, and then skip over any undefined sheets.
		worksheetInfo.worksheetNumber = 1;
		for (var i = 1; i < inputWorkbook._worksheets.length; i++) {
			if (inputWorkbook._worksheets[i] === undefined) {
				worksheetInfo.worksheetNumber++;
			}
		}

		inputWorksheet = inputWorkbook.getWorksheet(worksheetInfo.worksheetNumber);
	} else {
		throw new Error('Content type for sheet must be .csv or .xlsx');
	}

	if (inputWorksheet.rowCount > 30000) {
		throw new Error('Please limit product data to 30,000 rows.')
	}

	if (inputWorksheet.rowCount > 30000) {
		throw new Error('Please limit product data to 30,000 rows.');
	}

	// console.log(inputWorksheet.rowCount + " " + inputWorksheet.columnCount);

	rows = inputWorksheet.rowCount;
	if (testParseFlag) {
		if (rows > (worksheetInfo.firstDataRow + 2)) {
			rows = (worksheetInfo.firstDataRow + 2);
		}
	}
	cols = inputWorksheet.columnCount;


	//	Products that don't pass the core requirements to get into the catalog will be written to an excel sheet.   
	//	Start error worksheet with all the same header info before the data so it can be submitted using the same formatting assumptions as the original.
	if (!fs.existsSync('sheets')) {
		fs.mkdirSync('sheets');
	}
	rejectedWorksheet = rejectedWorkbook.addWorksheet('Rejected');
	for (var i = 1; i < worksheetInfo.firstDataRow; i++) {
		copyExcelRow(inputWorksheet, rejectedWorksheet, cols, i);
		if (i === (worksheetInfo.firstDataRow - 1)) {
			rejectedWorksheet.getCell(i, (cols + 1)).value = "ERRORS";
		}
	}


	var vendor = await Vendors.getById(jobInfo.vendorId);

	var schema = await productUtils.getProductSchema();




	//	Parse the data.
	for (var i = worksheetInfo.firstDataRow; i <= rows; i++) {
		var existingProductFlag = false;
		var invalidInfo = [];
		var parseProduct = {};
		var product = {};
		var validationErrors = {
			errorDetails: [],
			message: ""
		}


		count = count + 1;

		//	Build product.
		product = buildProduct(i, mappings, inputWorksheet);

		//	Make sure there is a vendor sku.
		if (product.vendorSku === undefined) {
			console.log("skip");
			await sleep(500);			
			continue;
			// throw new Error('Sheet rows must contain a vendor sku');
		}

		product.vendorId = jobInfo.vendorId; //	Convenience datapoint for validateProduct.

		productUtils.initializeParseProduct(parseProduct, product);
		productUtils.checkForDuplicateVendorSkus(vendorSkus, product, invalidInfo);

		//	Perform validation by data types.
		validationErrors = await productUtils.validateProduct(mappings, product, schema);
		validationErrors = validationUtils.finalizeValidationErrors(validationErrors, [], invalidInfo);

		delete product.vendorId; //	Remove convenience datapoint so as not to cause downstream issues.


		var coreRequiredInfo = [];
		var coreValidationErrors = {
			errorDetails: [],
			message: ""
		}

		//	Don't do eligibility verification if this is an update.
		var existingProduct = await Vendors.getProductByVendorSku(jobInfo.vendorId, product.vendorSku);
		if (existingProduct.length === 0) {
			existingProductFlag = false;
			// Verify if this product is eligible to be entered into the catalog
			coreRequiredInfo = productUtils.verifyCoreEligibility(coreRequiredInfo, product, true);
			coreValidationErrors = validationUtils.finalizeValidationErrors(coreValidationErrors, coreRequiredInfo, []);
		} else {
			existingProductFlag = true;
			productUtils.existingProductPriceValidation(existingProduct[0], product, coreRequiredInfo);
			coreValidationErrors = validationUtils.finalizeValidationErrors(coreValidationErrors, coreRequiredInfo, []);
		}


		//	If there are validation errors at this point product didn't pass core requirements.  Add to rejected sheet.
		if ((validationErrors.message.length > 0) || (coreValidationErrors.message.length > 0)) {
			parseProduct.acceptedFlag = false;
			parseProduct.validationErrors = validationErrors.message;
			parseProduct.coreEligibilityErrors = coreValidationErrors.message;
			var cellMessage = validationErrors.message + " " + coreValidationErrors.message;

			copyExcelRow(inputWorksheet, rejectedWorksheet, cols, i);
			rejectedWorksheet.getCell((worksheetInfo.firstDataRow + rejectedRows), (cols + 1)).value = cellMessage;
			rejectedRows = rejectedRows + 1;

		} else {

			//	Otherwise check for rush product and TRM eligibility.
			eligibleInline = false;
			eligibleBulkBuys = false;
			eligibleOffPrice = false;
			eligibleCostBasedReturns = false;
			eligibleRevShareReturns = false;
			eligibleTRM = false;

			var inlineRequiredInfo = [];
			inlineRequiredInfo = productUtils.verifyInlineEligibility(inlineRequiredInfo, product);

			var inlineValidationErrors = {
				errorDetails: [],
				message: ""
			}
			inlineValidationErrors = validationUtils.finalizeValidationErrors(inlineValidationErrors, inlineRequiredInfo, []);

			if (inlineValidationErrors.message.length === 0) {
				eligibleInline = true;
			}


			var bulkBuysRequiredInfo = [];
			bulkBuysRequiredInfo = productUtils.verifyBulkBuysEligibility(bulkBuysRequiredInfo, product);

			var bulkBuysValidationErrors = {
				errorDetails: [],
				message: ""
			}
			bulkBuysValidationErrors = validationUtils.finalizeValidationErrors(bulkBuysValidationErrors, bulkBuysRequiredInfo, []);

			if (bulkBuysValidationErrors.message.length === 0) {
				eligibleBulkBuys = true;
			}


			var offPriceRequiredInfo = [];
			offPriceRequiredInfo = productUtils.verifyOffPriceEligibility(offPriceRequiredInfo, product);

			var offPriceValidationErrors = {
				errorDetails: [],
				message: ""
			}
			offPriceValidationErrors = validationUtils.finalizeValidationErrors(offPriceValidationErrors, offPriceRequiredInfo, []);

			if (offPriceValidationErrors.message.length === 0) {
				eligibleOffPrice = true;
			}


			var costBasedReturnsRequiredInfo = [];
			costBasedReturnsRequiredInfo = productUtils.verifyCostBasedReturnsEligibility(costBasedReturnsRequiredInfo, product);

			var costBasedReturnsValidationErrors = {
				errorDetails: [],
				message: ""
			}
			costBasedReturnsValidationErrors = validationUtils.finalizeValidationErrors(costBasedReturnsValidationErrors, costBasedReturnsRequiredInfo, []);

			if (costBasedReturnsValidationErrors.message.length === 0) {
				eligibleCostBasedReturns = true;
			}


			var revShareReturnsRequiredInfo = [];
			revShareReturnsRequiredInfo = productUtils.verifyRevShareReturnsEligibility(revShareReturnsRequiredInfo, product);

			var revShareReturnsValidationErrors = {
				errorDetails: [],
				message: ""
			}
			revShareReturnsValidationErrors = validationUtils.finalizeValidationErrors(revShareReturnsValidationErrors, revShareReturnsRequiredInfo, []);

			if (revShareReturnsValidationErrors.message.length === 0) {
				eligibleRevShareReturns = true;
			}



			var trmRequiredInfo = [];
			trmRequiredInfo = productUtils.verifyTRMEligibility(trmRequiredInfo, product, vendor[0]);

			var trmValidationErrors = {
				errorDetails: [],
				message: ""
			}
			trmValidationErrors = validationUtils.finalizeValidationErrors(trmValidationErrors, trmRequiredInfo, []);

			if ((eligibleInline || eligibleBulkBuys || eligibleOffPrice || eligibleCostBasedReturns || eligibleRevShareReturns) && (trmValidationErrors.message.length === 0)) {
				eligibleTRM = true;
			}


			acceptedRows = acceptedRows + 1;

			parseProduct.acceptedFlag = true;
			parseProduct.trmEligibilityErrors = JSON.stringify(trmValidationErrors);

			//	If we're not doing a test parse, write product to the database.
			if (!testParseFlag) {
				prom.push(Vendors.addTempProduct(pathUtil.basename(jobInfo.filePath), i, jobInfo.vendorId, product,
					((validationErrors.errorDetails.length > 0) ? JSON.stringify(validationErrors) : null),
					eligibleTRM, ((trmValidationErrors.message.length > 0) ? JSON.stringify(trmValidationErrors) : null),
					eligibleInline, ((inlineValidationErrors.message.length > 0) ? JSON.stringify(inlineValidationErrors) : null),
					eligibleBulkBuys, ((bulkBuysValidationErrors.message.length > 0) ? JSON.stringify(bulkBuysValidationErrors) : null),
					eligibleOffPrice, ((offPriceValidationErrors.message.length > 0) ? JSON.stringify(offPriceValidationErrors) : null),
					eligibleCostBasedReturns, ((costBasedReturnsValidationErrors.message.length > 0) ? JSON.stringify(costBasedReturnsValidationErrors) : null),
					eligibleRevShareReturns, ((revShareReturnsValidationErrors.message.length > 0) ? JSON.stringify(revShareReturnsValidationErrors) : null)));
			}
		}

		parsedProducts.push(parseProduct);
	}

	if (vendorSkus.length === 0) {
		throw new Error("Data rows must contain a vendor sku.");
	}

	await Promise.all(prom);

	//	If rejected products, store the sheet to the Azure storage account and return url.
	if ((rejectedRows > 0) && (!testParseFlag)) {
		await rejectedWorkbook.xlsx.writeFile('sheets/' + rejectedFile);
	}


	//	If we wrote a rejected product sheet, store it on Azure storage so it can be referenced via URL.
	if ((rejectedRows > 0) && (!testParseFlag)) {
		result = await fileUtils.storeMultipartFile(storageContext, 'vendor-catalog-errors', 'sheets/' + rejectedFile, rejectedFile, false);
	}

	//	Remove the local rejected products file.
	if ((rejectedRows > 0) && (!testParseFlag)) {
		fs.unlinkSync('sheets/' + rejectedFile);
	}

	var rejectedUrl = (result != undefined) ? result.url : null;
	var uploadId = pathUtil.basename(jobInfo.filePath);

	// console.log("TABLE: " + uploadId);

	//	Complete the import job with some stats.
	if (!testParseFlag) {
		await Vendors.completeCatalogJob(jobInfo.id, uploadId, acceptedRows, errorRows, rejectedRows, rejectedUrl);
	}

	//	Either merge or return sample rows.
	if (testParseFlag) {
		resp.dataSample = parsedProducts;
	} else {
		await mergeProducts(mappings, pathUtil.basename(jobInfo.filePath));
		//	Mint COINs for coinless skus, which would include the ones just added.
		await coinActions.mintNew({});
	}
	return resp;
}


var copyExcelRow = (inputWorksheet, outputWorksheet, cols, row) => {
	var origRow = inputWorksheet.getRow(row);
	var newRowVals = [];

	for (var i = 1; i <= origRow.cellCount; i++) {
		var cell = origRow.getCell(i);
		newRowVals.push(cell.value);
	}

	outputWorksheet.addRow(newRowVals);
}



var sendJobCompletionEmail = (jobInfo) => {
	var msg = `Your catalog job ${jobInfo.id} has been processed. Log in to see results.`;
	var to = process.env.TECH_EMAIL ? process.env.TECH_EMAIL : 'matt@rushmarket.com';

	if ((jobInfo.submitter != undefined) && (jobInfo.submitter.email != undefined) && (validator.isEmail(jobInfo.submitter.email))) {
		to = jobInfo.submitter.email;
	} else {
		msg = msg + '   NOTE: This job was not submitted by an identified submitter.';
	}

	comms.sendEmail(to, 'Catalog Job Completion', msg, msg, process.env.EMAIL_USER);
}



var sendInventoryJobCompletionEmail = (jobInfo) => {
	var msg = `Your inventory job ${jobInfo.id} has been processed. Log in to see results.`;
	var to = process.env.TECH_EMAIL ? process.env.TECH_EMAIL : 'matt@rushmarket.com';

	if ((jobInfo.submitter != undefined) && (jobInfo.submitter.email != undefined) && (validator.isEmail(jobInfo.submitter.email))) {
		to = jobInfo.submitter.email;
	} else {
		msg = msg + '   NOTE: This job was not submitted by an identified submitter.';
	}

	comms.sendEmail(to, 'Inventory Job Completion', msg, msg, process.env.EMAIL_USER);
}



var vendorImport = async (filePath, fileName, resp) => {
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var vendor = {};

	inputWorkbook = await inputWorkbook.csv.readFile(filePath);

	// console.log(inputWorkbook.rowCount + " " + inputWorkbook.columnCount);

	for (var i = 2; i <= inputWorkbook.rowCount; i++) {
		vendor.email = inputWorkbook.getCell(i, 2).text;
		vendor.name = inputWorkbook.getCell(i, 3).text;
		vendor.dba = inputWorkbook.getCell(i, 4).text;
		vendor.taxIdNumber = inputWorkbook.getCell(i, 5).text;
		vendor.websiteAddress = inputWorkbook.getCell(i, 6).text;
		vendor.paymentTerms = inputWorkbook.getCell(i, 7).text;
		vendor.leadTime = inputWorkbook.getCell(i, 8).text;
		vendor.shippingCutoffCst = inputWorkbook.getCell(i, 9).text;
		vendor.inventoryUpdloadProcess = inputWorkbook.getCell(i, 10).text;
		vendor.invoiceMethod = inputWorkbook.getCell(i, 11).text;
		vendor.map = (inputWorkbook.getCell(i, 12).text === 'Yes') ? true : false;
		vendor.salesName = inputWorkbook.getCell(i, 13).text;
		vendor.salesEmail = inputWorkbook.getCell(i, 14).text;
		vendor.salesPhone = inputWorkbook.getCell(i, 15).text;
		vendor.orderName = inputWorkbook.getCell(i, 16).text;
		vendor.orderEmail = inputWorkbook.getCell(i, 17).text;
		vendor.orderPhone = inputWorkbook.getCell(i, 18).text;
		vendor.transportationName = inputWorkbook.getCell(i, 19).text;
		vendor.transportationEmail = inputWorkbook.getCell(i, 20).text;
		vendor.transportationPhone = inputWorkbook.getCell(i, 21).text;
		vendor.csName = inputWorkbook.getCell(i, 22).text;
		vendor.csEmail = inputWorkbook.getCell(i, 23).text;
		vendor.csPhone = inputWorkbook.getCell(i, 24).text;
		vendor.companyAddress1 = inputWorkbook.getCell(i, 25).text;
		vendor.companyCity = inputWorkbook.getCell(i, 26).text;
		vendor.companyStateOrProvince = inputWorkbook.getCell(i, 27).text;
		vendor.companyPostalCode = inputWorkbook.getCell(i, 28).text;
		vendor.companyCountry = inputWorkbook.getCell(i, 53).text;
		vendor.warehouse1Address1 = inputWorkbook.getCell(i, 29).text;
		vendor.warehouse1City = inputWorkbook.getCell(i, 30).text;
		vendor.warehouse1StateOrProvince = inputWorkbook.getCell(i, 31).text;
		vendor.warehouse1PostalCode = inputWorkbook.getCell(i, 32).text;
		vendor.warehouse1Country = inputWorkbook.getCell(i, 54).text;
		vendor.warehouse2Address1 = inputWorkbook.getCell(i, 33).text;
		vendor.warehouse2City = inputWorkbook.getCell(i, 34).text;
		vendor.warehouse2StateOrProvince = inputWorkbook.getCell(i, 35).text;
		vendor.warehouse2PostalCode = inputWorkbook.getCell(i, 36).text;
		vendor.warehouse2Country = inputWorkbook.getCell(i, 55).text;
		vendor.warehouse3Address1 = inputWorkbook.getCell(i, 37).text;
		vendor.warehouse3City = inputWorkbook.getCell(i, 38).text;
		vendor.warehouse3StateOrProvince = inputWorkbook.getCell(i, 39).text;
		vendor.warehouse3PostalCode = inputWorkbook.getCell(i, 40).text;
		vendor.warehouse3Country = inputWorkbook.getCell(i, 56).text;
		vendor.damageDefectiveAllowance = inputWorkbook.getCell(i, 41).text;
		vendor.preferenceAllowance = inputWorkbook.getCell(i, 42).text;
		vendor.manufacturerWarranty = inputWorkbook.getCell(i, 43).text;
		vendor.provideReplacementParts = (inputWorkbook.getCell(i, 44).text === 'Yes') ? true : false;
		vendor.replacementPartsAdditional = inputWorkbook.getCell(i, 45).text;
		vendor.partsName = inputWorkbook.getCell(i, 46).text;
		vendor.partsEmail = inputWorkbook.getCell(i, 47).text;
		vendor.partsPhone = inputWorkbook.getCell(i, 48).text;
		vendor.allow3rdPartySalesAmazon = (inputWorkbook.getCell(i, 49).text === 'Yes') ? true : false;
		vendor.allow3rdPartySalesEbay = (inputWorkbook.getCell(i, 50).text === 'Yes') ? true : false;
		vendor.allow3rdPartySalesWalmart = (inputWorkbook.getCell(i, 51).text === 'Yes') ? true : false;
		vendor.allow3rdPartySalesHouzz = (inputWorkbook.getCell(i, 52).text === 'Yes') ? true : false;


		var req = {
			body: vendor
		}
		var validationErrors = await vendorUtils.validateVendor(req, false);
		if (validationErrors.errorDetails.length > 0) {
			resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
			return resp;
		} else {
			resp = await Vendors.create(vendor);
		}

		// console.log(JSON.stringify(vendor, undefined, 2));
	}

	fs.unlinkSync(filePath);

}



module.exports = {
	buildDataSQL,
	buildProductInsertSQL,
	mergeProducts,
	parseWorksheet,
	processJob,
	processInventoryJob,
	sendJobCompletionEmail,
	vendorImport
};