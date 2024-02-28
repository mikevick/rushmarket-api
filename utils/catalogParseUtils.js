'use strict';

const globals = require('../globals');

const _ = require('lodash');
const excel = require('exceljs');
const fs = require('fs');
const mime = require('mime-types');
const pathUtil = require('path');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

const coinActions = require('../actions/coins');

const colUtils = require('../utils/columnUtils');
const fileUtils = require('../utils/fileUtils');
const logUtils = require('../utils/logUtils');
const parseUtils = require('../utils/parseUtils');
const productUtils = require('../utils/productUtils');
const validationUtils = require('../utils/validationUtils');

const Vendors = require('../models/vendors');


//
//	Process a catalog job.
//
var processCatalogJob = async (resp, jobInfo, testParseFlag) => {
	var mappings = null;
	var p = null;
	var worksheetInfo = null;

	try {

		await loadWorksheetInfo(jobInfo);

		//	Note the job has started.
		if (!testParseFlag) {
			await Vendors.startCatalogJob(jobInfo.id);
		}

		//	Parse it!
		var results = await parseWorksheetStream(true, jobInfo, testParseFlag);

		if (!testParseFlag) {
			parseUtils.sendJobCompletionEmail(jobInfo);
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
			return parseUtils.sendJobCompletionEmail(jobInfo);
		}
		throw (e);
	};
}




var loadColumnMappings = async (jobInfo) => {
	var p = null;


	//	Grab the column mapping info.
	switch (jobInfo.format) {
		case 'TRM':
			p = getTRMMappings(jobInfo);
			break;

		case 'CUSTOM':
			p = getCustomLabelMappings(jobInfo);
			break;

		default:
			throw new Error("Unrecognized catalog format " + jobInfo.format);
			break;
	}

	jobInfo.mappings = await p;
	//	Sanity check.
	if (jobInfo.mappings.productDescription === undefined) {
		throw new Error("Mapping load failure for job " + JSON.stringify(jobInfo));
	}
}



var loadWorksheetInfo = async (jobInfo) => {
	var worksheetInfo = await Vendors.getWorksheetInfo(jobInfo.vendorId);
	if (worksheetInfo === undefined) {
		var vendor = await Vendors.getById(jobInfo.vendorId);
		if (vendor.length > 0) {
			throw new Error("Catalog worksheet info for vendor " + vendor[0].name + " not found.");
		} else {
			throw new Error("Catalog worksheet info for vendor " + jobInfo.vendorId + " not found.");
		}
	}
	jobInfo.worksheetInfo = worksheetInfo[0];
}



var getCustomLabelMappings = async (jobInfo) => {
	var mappings = {};
	var rsp = {
		statusCode: 200,
		message: "Success.",
		data: {}
	};
	var trmCols = [];
	var vendorMappings = [];


	//	Get the trm spec sheet info.
	mappings = await productUtils.getDatapointValidations();

	//	Get the column label mappings.
	var result = await productUtils.getLabelMappings(jobInfo.vendorId, rsp);
	vendorMappings = result.data.vendorColumnLabelMappings;

	if (jobInfo.headerRow !== undefined) {
		//	Find columns in the sheet that match a mapping and add to mappings.
		for (var i = 0; i < vendorMappings.length; i++) {
			if (vendorMappings[i].columnLabel !== null) {
				if (vendorMappings[i].columnLabel.startsWith("'")) {
					mappings[colUtils.colToKey(vendorMappings[i].dataPoint)]['column'] = vendorMappings[i].columnLabel;
				} else {

					for (var j = 1; j <= jobInfo.headerRow.cellCount; j++) {
						var cellText = jobInfo.headerRow.getCell(j).text;
						if (cellText !== null) {
							if (vendorMappings[i].columnLabel.toLowerCase() === cellText.toLowerCase()) {
								mappings[colUtils.colToKey(vendorMappings[i].dataPoint)]['column'] = jobInfo.headerRow.getCell(j).$col$row.substring(1, jobInfo.headerRow.getCell(j).$col$row.indexOf('$', 1));
							}
						}
					}
				}
			}
		}
	}

	return mappings;
}



//
//	Read the header of the spreadsheet and map the datapoints to TRM normalized datapoints.
//
var getStandardMappings = async (jobInfo, dataPointName, matchRow) => {
	var p = null;
	var trmCols = [];


	//	Get TRM column info.
	trmCols = await Vendors.getTRMTemplateColumnInfo();

	var found = false;
	var mappings = {};

	if (jobInfo.headerRow !== undefined) {
		//	Find column mappings and map to TRM datapoint.
		for (var i = 0; i < trmCols.length; i++) {
			found = false;
			mappings[colUtils.colToKey(trmCols[i].dataPoint)] = {
				column: null,
				dbColumn: trmCols[i].dataPoint,
				basicValidation: trmCols[i]['basicValidation'],
				basicValidationMeta: trmCols[i]['basicValidationMeta']
			};
			if (trmCols[i][dataPointName] != null) {
				for (var j = 1; j <= jobInfo.headerRow.cellCount; j++) {
					var cellText = jobInfo.headerRow.getCell(j).text;
					if (cellText !== null) {
						if (trmCols[i][dataPointName] === cellText.toLowerCase()) {
							mappings[colUtils.colToKey(trmCols[i].dataPoint)]['column'] = jobInfo.headerRow.getCell(j).$col$row.substring(1, jobInfo.headerRow.getCell(j).$col$row.indexOf('$', 1));
							found = true;
							break;
						}
					}

					if (!found) {
						// console.log("NOT FOUND: " + trmCols[i].dataPoint + ' ' + inputWorksheet.getCell(inputWorksheet.getColumn(j).letter + matchRow).value);
					}
				}
			}
		}
	}

	return mappings;
}



var getTRMMappings = async (jobInfo) => {
	var mappings = await getStandardMappings(jobInfo, 'dataPoint', 1);

	return mappings;
}



//	
//	Locate the correct worksheet and store the stream reader with the jobInfo.
//
var openWorksheetStream = async (jobInfo) => {
	var contentType = mime.lookup(jobInfo.fileName) || 'application/octet-stream';
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var p = null;
	var worksheetCount = 0;

	jobInfo.worksheetReader = undefined;
	jobInfo.rowCounter = 0;

	if (contentType === 'text/csv') {
		p = inputWorkbook.csv.readFile(jobInfo.filePath)
		inputWorksheet = await p;
	} else {
		jobInfo.workbookReader = new excel.stream.xlsx.WorkbookReader(jobInfo.filePath);
		for await (jobInfo.worksheetReader of jobInfo.workbookReader) {
			worksheetCount++;
			if (worksheetCount === jobInfo.worksheetInfo.worksheetNumber) {
				break;
			}
		}
	}

	if (jobInfo.worksheetReader === undefined) {
		throw new Error("Worksheet " + jobInfo.worksheetInfo.worksheetNumber + " doesn't seem to exist in " + jobInfo.fileName);
	}


	jobInfo.headerRow = undefined;
}





//
//	Parse the worksheet building products and storing them in the database or alternatively returning them in the response as a data sample.
//
var parseWorksheetStream = async (mergeFlag, jobInfo, testParseFlag) => {
	var parsedProducts = [];
	var prom = [];
	var rejectedFile = pathUtil.basename(jobInfo.filePath) + '-rejected-' + new Date().getHours() + new Date().getMinutes() + '.xlsx';
	var resp = {};
	var result = null;
	var updateProm = [];
	var vendorSkus = [];
	var commitEvery = process.env.SHEET_COMMIT_EVERY ? process.env.SHEET_COMMIT_EVERY : 1000;
	var updateEvery = process.env.SHEET_UPDATE_EVERY ? process.env.SHEET_UPDATE_EVERY : 100;



	//	Open the sheet stream.
	await openWorksheetStream(jobInfo);

	//	Parse the data.
	for await (const row of jobInfo.worksheetReader) {

		jobInfo.rowCounter++;

		//	If we're on the header row, determine the column mappings.  Otherwise if on or past first data row process product.
		if (jobInfo.rowCounter === (jobInfo.worksheetInfo.firstDataRow - 1)) {
			jobInfo.headerRow = row;

			await initialize(jobInfo);
		} else if (jobInfo.rowCounter >= jobInfo.worksheetInfo.firstDataRow) {

			initializeProductInfo(jobInfo);

			//	Build product.
			jobInfo.productInfo.product = buildProduct(jobInfo.mappings, row);
			if ((jobInfo.productInfo.product.vendorSku === undefined) || (jobInfo.productInfo.product.vendorSku === null)) {
				await sleep(50);
				continue;
			}



			//	Queue up any non-Rush images for download.
			await queueImages(jobInfo.vendorId, jobInfo.productInfo.product);


			//	Check for an existing product and merge new with old.
			jobInfo.existingProduct = await Vendors.getProductByVendorSku(jobInfo.vendorId, jobInfo.productInfo.product.vendorSku);
			if (jobInfo.existingProduct.length > 0) {
				jobInfo.productInfo.product = productUtils.mergeProductChanges(jobInfo.existingProduct[0], jobInfo.productInfo.product);
			}

			// console.log(jobInfo.rowCounter + ": " + jobInfo.productInfo.product.vendorSku);

			jobInfo.productInfo.product.vendorId = jobInfo.vendorId; //	Convenience datapoint for validateProduct.

			productUtils.initializeParseProduct(jobInfo.productInfo.parseProduct, jobInfo.productInfo.product);
			productUtils.checkForDuplicateVendorSkus(vendorSkus, jobInfo.productInfo.product, jobInfo.productInfo.invalidInfo);

			//	Perform validation by data types.
			jobInfo.productInfo.product.validationErrors = await productUtils.validateProduct(jobInfo.mappings, jobInfo.productInfo.product, jobInfo.schema);
			jobInfo.productInfo.product.validationErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.validationErrors, [], jobInfo.productInfo.invalidInfo);

			// delete jobInfo.productInfo.product.vendorId; //	Remove convenience datapoint so as not to cause downstream issues.

			//	Don't do eligibility verification if this is an update.
			await verifyEligibility(jobInfo);


			//	If there are validation errors at this point product didn't pass core requirements.  Add to rejected sheet.
			if ((jobInfo.productInfo.product.validationErrors.message.length > 0) ||
				(jobInfo.productInfo.product.coreValidationErrors.message.length > 0)) {
				rejectProduct(jobInfo, row);
			} else {
				verifyRushAndTRMEligibility(jobInfo);

				jobInfo.acceptedRows++;

				jobInfo.productInfo.parseProduct.acceptedFlag = true;
				// jobInfo.productInfo.parseProduct.product.trmEligibilityErrors = JSON.stringify(jobInfo.productInfo.product.trmEligibilityErrors);

				//	If we're not doing a test parse, write product to the database.
				if (!testParseFlag) {
					if (jobInfo.productInfo.existingProductFlag) {
						var newBody = buildProductUpdateBody(jobInfo.productInfo.product, jobInfo.colArray);

						// Leverage code to merge an updated product, revalidate it, etc that already exists.
						var updateInfo = await productUtils.orchestrateUpdate(jobInfo.existingProduct[0], newBody, jobInfo.schema);

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
							var updateResult = await Vendors.updateProductById(jobInfo.existingProduct[0].vendorId, jobInfo.existingProduct[0].id, updateInfo.product)
							if ((updateResult !== undefined) && (updateResult.affectedRows === 1)) {
								if (jobInfo.submitterId !== undefined) {
									productUtils.logChanges(jobInfo.submitterId, jobInfo.submitterType, jobInfo.existingProduct[0].id, jobInfo.existingProduct[0], updateInfo);
								}

								updateProm.push(coinActions.updateCheck(jobInfo.existingProduct[0], updateInfo.product, {}));
							}
						}

					} else {
						jobInfo.productInfo.product.id = globals.mongoid.fetch();

						var sqlAndValues = buildProductInsertSQL(jobInfo.productInfo.product, jobInfo.dataSQL, jobInfo.colArray);
						prom.push(Vendors.addProductFromImport(jobInfo.vendorId, jobInfo.productInfo.product.masterId ? jobInfo.productInfo.product.masterId : null, sqlAndValues));
					}
				}
			}

			//	Mint or Match
			prom.push(coinActions.queueMintOrMatch(jobInfo.productInfo.product.vendorId, jobInfo.productInfo.product.vendorSku, jobInfo.productInfo.product.manufacturer, jobInfo.productInfo.product.mpn, jobInfo.productInfo.product.upc));

			if (testParseFlag) {
				parsedProducts.push(jobInfo.productInfo.parseProduct);
			}

			if (((jobInfo.rowCounter - 1) % updateEvery) === 0) {
				await Vendors.updateCatalogJob(jobInfo.id, jobInfo.acceptedRows, jobInfo.errorRows, jobInfo.rejectedRows);
				var abort = await Vendors.checkAbortFlag(jobInfo.id);
				if (abort) {
					console.log("Aborting...");
					break;
				}
			}


			if (((jobInfo.rowCounter - 1) % commitEvery) === 0) {
				console.log("Committing " + (jobInfo.rowCounter - 1) + " " + prom.length);
				await Promise.all(prom);
				prom = [];
			}

		}
	}

	if (vendorSkus.length === 0) {
		throw new Error("Data rows must contain a vendor sku.");
	}

	// console.log("Out of Loop Committing " + (jobInfo.rowCounter - 1) + " " + prom.length);
	await Promise.all(prom);

	//	Do any COIN updates if needed
	await Promise.all(updateProm);

	//	If rejected products, store the sheet to the Azure storage account and return url.
	if (!testParseFlag) {
		var uploadId = pathUtil.basename(jobInfo.filePath);
		var rejectedUrl = undefined;

		if (jobInfo.rejectedRows > 0) {
			rejectedUrl = await finalizeRejected(jobInfo, rejectedFile);
		}


		//	Either merge or return sample rows.
		if (testParseFlag) {
			resp.dataSample = parsedProducts;
		} else {
			// TODO  await mergeProducts(mappings, pathUtil.basename(jobInfo.filePath));

			//	Mint COINs for coinless skus, which would include the ones just added.
			// await Vendors.updateCatalogJob(jobInfo.id, jobInfo.acceptedRows, jobInfo.errorRows, jobInfo.rejectedRows, "MINTING");
			// await coinActions.mintNew({});
		}

		//	Complete the import job with some stats.
		await Vendors.completeCatalogJob(jobInfo.id, uploadId, jobInfo.acceptedRows, jobInfo.errorRows, jobInfo.rejectedRows, rejectedUrl);
	}

	return resp;
}



var buildColArray = async (jobInfo) => {
	var schema = await Vendors.getProductSchema();


	//	Pull columns out of the information schema so this can be somewhat dynamic.  We're only interested in columns that match the TRM template columns.
	for (var i = 0; i < schema.length; i++) {
		//	master_id a special case because it's on the sheet as 'master_id (if children)'. 
		if ((schema[i].COLUMN_NAME === 'master_id') && (jobInfo.mappings[colUtils.colToKey('master_id (if children)')] !== undefined)) {
			jobInfo.colArray.push('master_id');
		} else if ((jobInfo.mappings[colUtils.colToKey(schema[i].COLUMN_NAME)] !== undefined) && (jobInfo.mappings[colUtils.colToKey(schema[i].COLUMN_NAME)].column !== null)) {
			jobInfo.colArray.push(schema[i].COLUMN_NAME);
		}
	}
}




//
//	Build a product object from data in the spreadsheet.
//
var buildProduct = (mappings, row) => {
	var product = {};
	product.searchField = '';

	Object.keys(mappings).forEach(function (key) {
		// console.log(key + " " + mappings[key]['column']);
		if ((key === 'freightClass') && (mappings[key]['column'] != null) && (row.getCell(mappings[key]['column']).text.trim() === "")) {
			product[key] = null;
		} else {
			if (mappings[key]['column'] != null) {
				if (mappings[key]['column'].startsWith("'")) {
					product[key] = mappings[key]['column'].substring(1);
				} else {
					if (row.getCell(mappings[key]['column']).type != excel.ValueType.Null) {
						product[key] = row.getCell(mappings[key]['column']).text.trim();

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
		product.searchField = buildSearchField(product.searchField, key, product, ['vendorSku', 'upc', 'mpn', 'productName', 'primaryMaterial', 'primaryColor', 'primaryCategory', 'secondaryCategory', 'brandName', 'styleTag1', 'styleTag2'])

	}) // Build product


	return product;
}



var buildProductInsertSQL = (row, fixedSQL, colArray) => {
	var sqlAndValues = {
		sql: null,
		valArray: []
	}

	for (var j = 0; j < colArray.length; j++) {
		sqlAndValues.valArray.push(row[colUtils.colToKey(colArray[j])]);
	}
	sqlAndValues.valArray.push(row[colUtils.colToKey('eligible_for_trm')]);
	sqlAndValues.valArray.push(row[colUtils.colToKey('eligible_for_dropship')]);
	// sqlAndValues.valArray.push(row[colUtils.colToKey('eligible_for_limited_quantity_dropship')]);
	sqlAndValues.valArray.push(row[colUtils.colToKey('eligible_for_inline')]);
	sqlAndValues.valArray.push(row[colUtils.colToKey('eligible_for_bulk_buys')]);
	sqlAndValues.valArray.push(row[colUtils.colToKey('eligible_for_off_price')]);
	sqlAndValues.valArray.push(row[colUtils.colToKey('eligible_for_cost_based_returns')]);
	sqlAndValues.valArray.push(row[colUtils.colToKey('eligible_for_rev_share_returns')]);
	sqlAndValues.valArray.push((row[colUtils.colToKey('validation_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('validation_errors')]) : null);
	sqlAndValues.valArray.push((row[colUtils.colToKey('trm_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('trm_eligibility_errors')]) : null);
	sqlAndValues.valArray.push((row[colUtils.colToKey('dropship_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('dropship_eligibility_errors')]) : null);
	// sqlAndValues.valArray.push((row[colUtils.colToKey('limited_quantity_dropship_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('limited_quantity_dropship_eligibility_errors')]) : null);
	sqlAndValues.valArray.push((row[colUtils.colToKey('inline_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('inline_eligibility_errors')]) : null);
	sqlAndValues.valArray.push((row[colUtils.colToKey('bulk_buys_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('bulk_buys_eligibility_errors')]) : null);
	sqlAndValues.valArray.push((row[colUtils.colToKey('off_price_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('off_price_eligibility_errors')]) : null);
	sqlAndValues.valArray.push((row[colUtils.colToKey('cost_based_returns_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('cost_based_returns_eligibility_errors')]) : null);
	sqlAndValues.valArray.push((row[colUtils.colToKey('rev_share_returns_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('rev_share_returns_eligibility_errors')]) : null);
	sqlAndValues.valArray.push(row[colUtils.colToKey('search_field')]);

	sqlAndValues.sql = "INSERT INTO vendor_catalog_products (" + fixedSQL.insertCols + ", " +
		"eligible_for_trm, eligible_for_dropship, eligible_for_inline, eligible_for_bulk_buys, eligible_for_off_price, eligible_for_cost_based_returns, eligible_for_rev_share_returns, " +
		"validation_errors, trm_eligibility_errors, dropship_eligibility_errors, inline_eligibility_errors, bulk_buys_eligibility_errors, off_price_eligibility_errors, cost_based_returns_eligibility_errors, rev_share_returns_eligibility_errors, search_field, " +
		"sku, variant_sku, variant_sequence) " +
		"VALUES (" + fixedSQL.placeholders + ", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ";

	return sqlAndValues;
}



var buildProductUpdateBody = (row, colArray) => {
	var body = {

	}

	for (var i = 0; i < colArray.length; i++) {
		if (colArray[i] != 'id') {
			body[colUtils.colToKey(colArray[i])] = row[colUtils.colToKey(colArray[i])];
		}
	}
	body.eligibleForTrm = row[colUtils.colToKey('eligible_for_trm')];
	body.eligibleForDropship = row[colUtils.colToKey('eligible_for_dropship')];
	// body.eligibleForLimitedQuantityDropship = row[colUtils.colToKey('eligible_for_limited_quantity_dropship')];
	body.eligibleForInline = row[colUtils.colToKey('eligible_for_inline')];
	body.eligibleForBulkBuys = row[colUtils.colToKey('eligible_for_bulk_buys')];
	body.eligibleForOffPrice = row[colUtils.colToKey('eligible_for_off_price')];
	body.eligibleForCostBasedReturns = row[colUtils.colToKey('eligible_for_cost_based_returns')];
	body.eligibleForRevShareReturns = row[colUtils.colToKey('eligible_for_rev_share_returns')];
	body.validationErrors = (row[colUtils.colToKey('validation_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('validation_errors')]) : null;
	body.trmEligibilityErrors = (row[colUtils.colToKey('trm_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('trm_eligibility_errors')]) : null;
	body.dropshipEligibilityErrors = (row[colUtils.colToKey('dropship_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('dropship_eligibility_errors')]) : null;
	// body.limitedQuantityDropshipEligibilityErrors = (row[colUtils.colToKey('limited_quantity_dropship_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('limited_quantity_dropship_eligibility_errors')]) : null;
	body.inlineEligibilityErrors = (row[colUtils.colToKey('inline_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('inline_eligibility_errors')]) : null;
	body.bulkBuysEligibilityErrors = (row[colUtils.colToKey('bulk_buys_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('bulk_buys_eligibility_errors')]) : null;
	body.offPriceEligibilityErrors = (row[colUtils.colToKey('off_price_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('off_price_eligibility_errors')]) : null;
	body.costBasedReturnsEligibilityErrors = (row[colUtils.colToKey('cost_based_returns_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('cost_based_returns_eligibility_errors')]) : null;
	body.revShareReturnsEligibilityErrors = (row[colUtils.colToKey('rev_share_returns_eligibility_errors')].message.length > 0) ? JSON.stringify(row[colUtils.colToKey('rev_share_returns_eligibility_errors')]) : null;
	body.searchField = row[colUtils.colToKey('search_field')];

	return body;
}





var buildSearchField = (searchField, key, product, fields) => {
	var idx = _.indexOf(fields, key);
	if (idx > -1) {
		if ((product[key] !== undefined) && (product[key] !== null)) {
			searchField = searchField + product[key];
		}
	}

	return searchField.substring(0, 4096 - 1);
}




var copyExcelRow = (row, outputWorksheet) => {
	var newRowVals = [];


	for (var i = 1; i <= row.cellCount; i++) {
		var cell = row.getCell(i);
		newRowVals.push(cell.value);
	}

	outputWorksheet.addRow(newRowVals);
}



var finalizeRejected = async (jobInfo, rejectedFile) => {
	await jobInfo.rejectedWorkbook.xlsx.writeFile('sheets/' + rejectedFile);
	var result = await fileUtils.storeMultipartFile(jobInfo.storageContext, 'vendor-catalog-errors', 'sheets/' + rejectedFile, rejectedFile, false);
	fs.unlinkSync('sheets/' + rejectedFile);

	return (result != undefined) ? result.url : null;
}



var initialize = async (jobInfo) => {
	//	Retrieve the storage context.
	jobInfo.storageContext = fileUtils.getContext(process.env.REJECTED_SHEET_STORAGE_CONTEXT, 'OVERWRITE');
	if (jobInfo.storageContext === null) {
		throw new Error("Storage context " + process.env.REJECTED_SHEET_STORAGE_CONTEXT + " doesn't exist.");
	}


	//	Products that don't pass the core requirements to get into the catalog will be written to an excel sheet.   
	//	Start error worksheet with all the same header info before the data so it can be submitted using the same formatting assumptions as the original.
	if (!fs.existsSync('sheets')) {
		fs.mkdirSync('sheets');
	}

	jobInfo.rejectedWorkbook = new excel.Workbook();
	jobInfo.rejectedWorksheet = null;
	jobInfo.rejectedRows = 0;
	jobInfo.errorRows = 0;
	jobInfo.acceptedRows = 0;



	jobInfo.errorMessageColumn = (jobInfo.headerRow.cellCount + 1);
	jobInfo.rejectedWorksheet = jobInfo.rejectedWorkbook.addWorksheet('Rejected');
	copyExcelRow(jobInfo.headerRow, jobInfo.rejectedWorksheet);
	jobInfo.rejectedWorksheet.getCell(jobInfo.rowCounter, jobInfo.errorMessageColumn).value = "ERRORS";

	jobInfo.vendor = await Vendors.getById(jobInfo.vendorId);
	jobInfo.schema = await productUtils.getProductSchema();
	await loadColumnMappings(jobInfo);
	await initializeColumnArray(jobInfo);
	jobInfo.dataSQL = parseUtils.buildDataSQL(jobInfo.colArray);
}



var initializeProductInfo = (jobInfo) => {
	if (jobInfo.productInfo === undefined) {
		jobInfo.productInfo = {}
	}

	jobInfo.productInfo.existingProductFlag = false;
	jobInfo.productInfo.invalidInfo = [];
	jobInfo.productInfo.parseProduct = {};
	jobInfo.productInfo.product = {};
}


var queueImages = async (vendorId, product) => {
	if ((product.mainImageKnockout !== undefined) &&
		(product.mainImageKnockout !== null) &&
		(product.mainImageKnockout.trim().length > 0) &&
		(product.mainImageKnockout.indexOf("rushimages") < 0) &&
		(product.mainImageKnockout.indexOf("rushmarket.com") < 0)) {
		await Vendors.queueImageForDownload(vendorId, product.vendorSku, 'main_image_knockout', product.mainImageKnockout);
	}

	if ((product.mainImageLifestyle !== undefined) &&
		(product.mainImageLifestyle !== null) &&
		(product.mainImageLifestyle.trim().length > 0) &&
		(product.mainImageLifestyle.indexOf("rushimages") < 0) &&
		(product.mainImageLifestyle.indexOf("rushmarket.com") < 0)) {
		await Vendors.queueImageForDownload(vendorId, product.vendorSku, 'main_image_lifestyle', product.mainImageLifestyle);
	}

	if ((product.altImage3 !== undefined) &&
		(product.altImage3 !== null) &&
		(product.altImage3.trim().length > 0) &&
		(product.altImage3.indexOf("rushimages") < 0) &&
		(product.altImage3.indexOf("rushmarket.com") < 0)) {
		await Vendors.queueImageForDownload(vendorId, product.vendorSku, 'alt_image3', product.altImage3);
	}

	if ((product.altImage4 !== undefined) &&
		(product.altImage4 !== null) &&
		(product.altImage4.trim().length > 0) &&
		(product.altImage4.indexOf("rushimages") < 0) &&
		(product.altImage4.indexOf("rushmarket.com") < 0)) {
		await Vendors.queueImageForDownload(vendorId, product.vendorSku, 'alt_image4', product.altImage4);
	}

	if ((product.altImage5 !== undefined) &&
		(product.altImage5 !== null) &&
		(product.altImage5.trim().length > 0) &&
		(product.altImage5.indexOf("rushimages") < 0) &&
		(product.altImage5.indexOf("rushmarket.com") < 0)) {
		Vendors.queueImageForDownload(vendorId, product.vendorSku, 'alt_image5', product.altImage5);
	}

	if ((product.swatchImage6 !== undefined) &&
		(product.swatchImage6 !== null) &&
		(product.swatchImage6.trim().length > 0) &&
		(product.swatchImage6.indexOf("rushimages") < 0) &&
		(product.swatchImage6.indexOf("rushmarket.com") < 0)) {
		await Vendors.queueImageForDownload(vendorId, product.vendorSku, 'swatch_image6', product.swatchImage6);
	}
}



var initializeColumnArray = async (jobInfo) => {
	jobInfo.colArray = [];
	jobInfo.colArray.push('id');
	jobInfo.colArray.push('vendor_id');

	await buildColArray(jobInfo);
}


var rejectProduct = (jobInfo, row) => {
	jobInfo.productInfo.parseProduct.acceptedFlag = false;
	jobInfo.productInfo.parseProduct.validationErrors = jobInfo.productInfo.product.validationErrors.message;
	jobInfo.productInfo.parseProduct.coreEligibilityErrors = jobInfo.productInfo.product.coreValidationErrors.message;
	var cellMessage = jobInfo.productInfo.product.validationErrors.message + " " + jobInfo.productInfo.product.coreValidationErrors.message;

	copyExcelRow(row, jobInfo.rejectedWorksheet);
	jobInfo.rejectedWorksheet.getCell((jobInfo.worksheetInfo.firstDataRow + jobInfo.rejectedRows), jobInfo.errorMessageColumn).value = cellMessage;
	jobInfo.rejectedRows++;
}



var verifyEligibility = async (jobInfo) => {
	jobInfo.productInfo.product.coreRequiredInfo = [];
	jobInfo.productInfo.product.coreValidationErrors = {
		errorDetails: [],
		message: ""
	}

	if (jobInfo.existingProduct.length === 0) {
		jobInfo.productInfo.existingProductFlag = false;
		// Verify if this product is eligible to be entered into the catalog
		jobInfo.productInfo.product.coreRequiredInfo = productUtils.verifyCoreEligibility(jobInfo.productInfo.product.coreRequiredInfo, jobInfo.productInfo.product, true);
		jobInfo.productInfo.product.coreValidationErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.coreValidationErrors, jobInfo.productInfo.product.coreRequiredInfo, []);
	} else {
		jobInfo.productInfo.existingProductFlag = true;
		productUtils.existingProductPriceValidation(jobInfo.existingProduct[0], jobInfo.productInfo.product, jobInfo.productInfo.product.coreRequiredInfo);
		jobInfo.productInfo.product.coreValidationErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.coreValidationErrors, jobInfo.productInfo.product.coreRequiredInfo, []);
	}

}



var verifyRushAndTRMEligibility = (jobInfo) => {

	//	Otherwise check for rush product and TRM eligibility.
	jobInfo.productInfo.product.eligibleForInline = false;
	jobInfo.productInfo.product.eligibleForBulkBuys = false;
	jobInfo.productInfo.product.eligibleForOffPrice = false;
	jobInfo.productInfo.product.eligibleForCostBasedReturns = false;
	jobInfo.productInfo.product.eligibleForRevShareReturns = false;
	jobInfo.productInfo.product.eligibleForTrm = false;
	// jobInfo.productInfo.product.eligibleForLimitedQuantityDropship = false;
	jobInfo.productInfo.product.eligibleForDropship = false;

	var inlineRequiredInfo = [];
	inlineRequiredInfo = productUtils.verifyInlineEligibility(inlineRequiredInfo, jobInfo.productInfo.product);

	jobInfo.productInfo.product.inlineEligibilityErrors = {
		errorDetails: [],
		message: ""
	}
	jobInfo.productInfo.product.inlineEligibilityErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.inlineEligibilityErrors, inlineRequiredInfo, []);

	if (jobInfo.productInfo.product.inlineEligibilityErrors.message.length === 0) {
		jobInfo.productInfo.product.eligibleForInline = true;
	}


	var bulkBuysRequiredInfo = [];
	bulkBuysRequiredInfo = productUtils.verifyBulkBuysEligibility(bulkBuysRequiredInfo, jobInfo.productInfo.product);

	jobInfo.productInfo.product.bulkBuysEligibilityErrors = {
		errorDetails: [],
		message: ""
	}
	jobInfo.productInfo.product.bulkBuysEligibilityErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.bulkBuysEligibilityErrors, bulkBuysRequiredInfo, []);

	if (jobInfo.productInfo.product.bulkBuysEligibilityErrors.message.length === 0) {
		jobInfo.productInfo.product.eligibleForBulkBuys = true;
	}


	var offPriceRequiredInfo = [];
	offPriceRequiredInfo = productUtils.verifyOffPriceEligibility(offPriceRequiredInfo, jobInfo.productInfo.product);

	jobInfo.productInfo.product.offPriceEligibilityErrors = {
		errorDetails: [],
		message: ""
	}
	jobInfo.productInfo.product.offPriceEligibilityErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.offPriceEligibilityErrors, offPriceRequiredInfo, []);

	if (jobInfo.productInfo.product.offPriceEligibilityErrors.message.length === 0) {
		jobInfo.productInfo.product.eligibleForOffPrice = true;
	}


	var costBasedReturnsRequiredInfo = [];
	costBasedReturnsRequiredInfo = productUtils.verifyCostBasedReturnsEligibility(costBasedReturnsRequiredInfo, jobInfo.productInfo.product);

	jobInfo.productInfo.product.costBasedReturnsEligibilityErrors = {
		errorDetails: [],
		message: ""
	}
	jobInfo.productInfo.product.costBasedReturnsEligibilityErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.costBasedReturnsEligibilityErrors, costBasedReturnsRequiredInfo, []);

	if (jobInfo.productInfo.product.costBasedReturnsEligibilityErrors.message.length === 0) {
		jobInfo.productInfo.product.eligibleForCostBasedReturns = true;
	}


	var revShareReturnsRequiredInfo = [];
	revShareReturnsRequiredInfo = productUtils.verifyRevShareReturnsEligibility(revShareReturnsRequiredInfo, jobInfo.productInfo.product);

	jobInfo.productInfo.product.revShareReturnsEligibilityErrors = {
		errorDetails: [],
		message: ""
	}
	jobInfo.productInfo.product.revShareReturnsEligibilityErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.revShareReturnsEligibilityErrors, revShareReturnsRequiredInfo, []);

	if (jobInfo.productInfo.product.revShareReturnsEligibilityErrors.message.length === 0) {
		jobInfo.productInfo.product.eligibleForRevShareReturns = true;
	}



	var trmRequiredInfo = [];
	trmRequiredInfo = productUtils.verifyTRMEligibility(trmRequiredInfo, jobInfo.productInfo.product, jobInfo.vendor[0]);

	jobInfo.productInfo.product.trmEligibilityErrors = {
		errorDetails: [],
		message: ""
	}
	jobInfo.productInfo.product.trmEligibilityErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.trmEligibilityErrors, trmRequiredInfo, []);


	var dropshipRequiredInfo = [];
	dropshipRequiredInfo = productUtils.verifyDropshipEligibility(dropshipRequiredInfo, jobInfo.productInfo.product, jobInfo.vendor[0]);

	jobInfo.productInfo.product.dropshipEligibilityErrors = {
		errorDetails: [],
		message: ""
	}
	jobInfo.productInfo.product.dropshipEligibilityErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.dropshipEligibilityErrors, dropshipRequiredInfo, []);


	// // var limitedQuantityDropshipRequiredInfo = [];
	// // limitedQuantityDropshipRequiredInfo = productUtils.verifyLimitedQuantityDropshipEligibility(limitedQuantityDropshipRequiredInfo, jobInfo.productInfo.product, jobInfo.vendor[0]);

	// jobInfo.productInfo.product.limitedQuantityDropshipEligibilityErrors = {
	// 	errorDetails: [],
	// 	message: ""
	// }
	// jobInfo.productInfo.product.limitedQuantityDropshipEligibilityErrors = validationUtils.finalizeValidationErrors(jobInfo.productInfo.product.limitedQuantityDropshipEligibilityErrors, limitedQuantityDropshipRequiredInfo, []);


	//	Set TRM eligibility flag.
	if ((jobInfo.productInfo.product.eligibleForInline || jobInfo.productInfo.product.eligibleForBulkBuys ||
			jobInfo.productInfo.product.eligibleForOffPrice || jobInfo.productInfo.product.eligibleForCostBasedReturns ||
			jobInfo.productInfo.product.eligibleForRevShareReturns) && (jobInfo.productInfo.product.trmEligibilityErrors.message.length === 0)) {
		jobInfo.productInfo.product.eligibleForTrm = true;
	}


	//	Set flag for dropship eligibility
	if ((jobInfo.productInfo.product.eligibleForInline || jobInfo.productInfo.product.eligibleForBulkBuys ||
			jobInfo.productInfo.product.eligibleForOffPrice || jobInfo.productInfo.product.eligibleForCostBasedReturns ||
			jobInfo.productInfo.product.eligibleForRevShareReturns) && (jobInfo.productInfo.product.dropshipEligibilityErrors.message.length === 0)) {
		jobInfo.productInfo.product.eligibleForDropship = true;
	}
	//	Set flag for limit quantity dropship eligibility
	// if ((jobInfo.productInfo.product.eligibleForInline || jobInfo.productInfo.product.eligibleForBulkBuys ||
	// 		jobInfo.productInfo.product.eligibleForOffPrice || jobInfo.productInfo.product.eligibleForCostBasedReturns ||
	// 		jobInfo.productInfo.product.eligibleForRevShareReturns) && (jobInfo.productInfo.product.limitedQuantityDropshipEligibilityErrors.message.length === 0)) {
	// 	jobInfo.productInfo.product.eligibleForLimitedQuantityDropship = true;
	// }

}


module.exports = {
	processCatalogJob
}