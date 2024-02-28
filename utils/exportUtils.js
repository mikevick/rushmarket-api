'use strict';

const _ = require('lodash');
const excel = require('exceljs');
const fs = require('fs');
const sanitize = require("sanitize-filename");
const validator = require('validator');

const VCGDE = require('../models/vcGDE');
const Products = require('../models/products');
const RushProducts = require('../models/rushProducts');
const Vendors = require('../models/vendors');

const colUtils = require('../utils/columnUtils');
const comms = require('../utils/comms');
const fileUtils = require('../utils/fileUtils');
const logUtils = require('../utils/logUtils');


const TMP_DIR = 'sheets/';

// Trying to write with an excel.stream.xlsx.WorkbookWriter() object fails
// silently if any parent directories of the export fileName do not exist.
if (!fs.existsSync(TMP_DIR)){
	console.log("Creating directory", TMP_DIR);
	fs.mkdirSync(TMP_DIR);
}

//
//	Process an export job.
//
var processJob = (resp, jobInfo) => {
	return new Promise((resolve, reject) => {
		var prom = [];
		var sanitizedLabel = sanitize(jobInfo.label).replace(/'/g, '');
		var worksheetInfo = null;

		//	Use label in file name if it's provided.
		jobInfo.exportFile = (sanitizedLabel.length > 0) ? 'export-' + sanitizedLabel + '-' + new Date().getHours() + new Date().getMinutes() + '.xlsx' : 'export-' + new Date().getHours() + new Date().getMinutes() + '.xlsx';



		prom.push(Products.startExportJob(jobInfo.id));
		switch (jobInfo.format) {
			// case 'EXCELIFY-BARSTOOLS':
			// 	prom.push(processBarstoolsExport(resp, jobInfo));
			// 	break;

			// case 'EXCELIFY-PATIO-UMBRELLAS':
			// 	prom.push(processPatioUmbrellasExport(resp, jobInfo));
			// 	break;

			// case 'EXCELIFY-PLANTERS':
			// 	prom.push(processPlantersExport(resp, jobInfo));
			// 	break;

			// case 'MARKETPLACE':
			// 	prom.push(processMarketplaceExport(resp, jobInfo));
			// 	break;

			// case 'TRM':
			// 	prom.push(processBarstoolsExport(resp, jobInfo));
			// 	break;

			case 'TRM-VENDOR-CATALOG':
				prom.push(processTRMExportEnhanced(resp, jobInfo));
				break;


			case 'RRC':
				prom.push(processRRCExportEnhanced(resp, jobInfo));
				break;

			case 'RBR-ON-HAND':
				prom.push(processRBROnHandExportEnhanced(resp, jobInfo));
				break;
	
			case 'SINGLE-UPLOAD':
				prom.push(processSingleUpload(resp, jobInfo));
				break;

			case 'SHOPIFY':
				break;

			default:
				throw new Error("Unrecognized export format " + jobInfo.format);
				break;
		}

		Promise.all(prom)
			.then((resp) => {
				sendJobCompletionEmail(jobInfo);
				resolve(resp[1]);
			})
			.catch((e) => {
				logUtils.logException(e);
				reject(e);
			});
	});
}


// id, context, submitterId, whereClause
var processBarstoolsExport = (resp, jobInfo) => {
	return new Promise((resolve, reject) => {
		var storageContext = {};
		var whereInfo = {
			clause: jobInfo.whereClause,
			values: []
		}

		storageContext = fileUtils.getContext(jobInfo.storageContext, 'UNIQUE');

		if (storageContext === null) {
			throw new Error("Storage context " + jobInfo.storageContext + " doesn't exist.");
		} else {

			Products.getAll(whereInfo, 'sku, variant_sku')
				.then((result) => {
					return writeBarstoolsExportSheet(jobInfo, storageContext, result.products, resp);
				})
				.then((resp) => {
					resolve(resp);
				})
				.catch((e) => {
					throw (e);
				});
		}
	})
};



var processPatioUmbrellasExport = (resp, jobInfo) => {
	return new Promise((resolve, reject) => {
		var storageContext = {};
		var whereInfo = {
			clause: jobInfo.whereClause,
			values: []
		}

		storageContext = fileUtils.getContext(jobInfo.storageContext, 'UNIQUE');

		if (storageContext === null) {
			throw new Error("Storage context " + jobInfo.storageContext + " doesn't exist.");
		} else {

			Products.getAll(whereInfo, 'sku, variant_sku')
				.then((result) => {
					return writePatioUmbrellasExportSheet(jobInfo, storageContext, result.products, resp);
				})
				.then((resp) => {
					resolve(resp);
				})
				.catch((e) => {
					throw new Error(e);
				});
		}
	})
};



var processPlantersExport = (resp, jobInfo) => {
	return new Promise((resolve, reject) => {
		var storageContext = {};
		var whereInfo = {
			clause: jobInfo.whereClause,
			values: []
		}

		storageContext = fileUtils.getContext(jobInfo.storageContext, 'UNIQUE');

		if (storageContext === null) {
			throw new Error("Storage context " + jobInfo.storageContext + " doesn't exist.");
		} else {

			Products.getAll(whereInfo, 'sku, variant_sku')
				.then((result) => {
					return writePlantersExportSheet(jobInfo, storageContext, result.products, resp);
				})
				.then((resp) => {
					resolve(resp);
				})
				.catch((e) => {
					throw new Error(e);
				});
		}
	})
};



var processMarketplaceExport = (resp, jobInfo) => {
	return new Promise((resolve, reject) => {
		var storageContext = {};
		var whereInfo = {
			clause: jobInfo.whereClause,
			values: []
		}

		storageContext = fileUtils.getContext(jobInfo.storageContext, 'UNIQUE');

		if (storageContext === null) {
			throw new Error("Storage context " + jobInfo.storageContext + " doesn't exist.");
		} else {

			Products.getAll(whereInfo, 'sku, variant_sku')
				.then((result) => {
					return writeMarketplaceExportSheet(jobInfo, storageContext, result.products, resp);
				})
				.then((resp) => {
					resolve(resp);
				})
				.catch((e) => {
					throw new Error(e);
				});
		}
	})
};



var processTRMExport = (resp, jobInfo) => {
	return new Promise((resolve, reject) => {
		var storageContext = {};
		var whereInfo = {
			clause: jobInfo.whereClause,
			values: []
		}

		storageContext = fileUtils.getContext(jobInfo.storageContext, 'UNIQUE');

		if (storageContext === null) {
			throw new Error("Storage context " + jobInfo.storageContext + " doesn't exist.");
		} else {

			Products.getAll(whereInfo, 'sku, variant_sku')
				.then((result) => {
					return writeTRMExportSheet(jobInfo, storageContext, result.products, resp);
				})
				.then((resp) => {
					resolve(resp);
				})
				.catch((e) => {
					throw new Error(e);
				});
		}
	})
};



var processSingleUpload = async (resp, jobInfo) => {
	var storageContext = {};
	var whereInfo = {
		clause: jobInfo.whereClause,
		values: []
	}

	storageContext = fileUtils.getContext(jobInfo.storageContext, 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context " + jobInfo.storageContext + " doesn't exist.");
	} else {

		var result = await Products.getAll(whereInfo, 'sku, variant_sku');
		return await writeSingleUploadExportSheet(jobInfo, storageContext, result.products, resp);
	}
}




var writeSingleUploadExportSheet = async (jobInfo, storageContext, products, resp) => {
	var col = 1;
	var row = 2;
	var prom = [];
	var exportWorkbook = new excel.Workbook();
	var exportWorksheet = null;


	exportWorksheet = exportWorkbook.addWorksheet('Products');


	exportWorksheet.getCell(1, col++).value = 'vendor_sku';
	exportWorksheet.getCell(1, col++).value = 'product_name';
	exportWorksheet.getCell(1, col++).value = 'primary_category';
	exportWorksheet.getCell(1, col++).value = 'secondary_category';
	exportWorksheet.getCell(1, col++).value = 'brand_name';
	exportWorksheet.getCell(1, col++).value = 'manufacturer';
	exportWorksheet.getCell(1, col++).value = 'mpn';
	exportWorksheet.getCell(1, col++).value = 'upc';
	exportWorksheet.getCell(1, col++).value = 'product_cost';
	exportWorksheet.getCell(1, col++).value = 'msrp';
	exportWorksheet.getCell(1, col++).value = 'partner_selling_price';
	exportWorksheet.getCell(1, col++).value = 'previous';
	exportWorksheet.getCell(1, col++).value = 'live';
	exportWorksheet.getCell(1, col++).value = 'sold';
	exportWorksheet.getCell(1, col++).value = 'numOrange';
	exportWorksheet.getCell(1, col++).value = 'in_market_price';
	exportWorksheet.getCell(1, col++).value = 'quantity';
	exportWorksheet.getCell(1, col++).value = 'extended_msrp';
	exportWorksheet.getCell(1, col++).value = 'product_url';
	exportWorksheet.getCell(1, col++).value = 'primary_material';
	exportWorksheet.getCell(1, col++).value = 'secondary_material';
	exportWorksheet.getCell(1, col++).value = 'material_specific';
	exportWorksheet.getCell(1, col++).value = 'primary_color';
	exportWorksheet.getCell(1, col++).value = 'color_specific';
	exportWorksheet.getCell(1, col++).value = 'product_weight';
	exportWorksheet.getCell(1, col++).value = 'product_height';
	exportWorksheet.getCell(1, col++).value = 'product_width';
	exportWorksheet.getCell(1, col++).value = 'product_depth';
	exportWorksheet.getCell(1, col++).value = 'partial_item';
	exportWorksheet.getCell(1, col++).value = 'quantity_per_carton';
	exportWorksheet.getCell(1, col++).value = 'main_image_knockout';
	exportWorksheet.getCell(1, col++).value = 'main_image_lifestyle';
	exportWorksheet.getCell(1, col++).value = 'alt_image3';
	exportWorksheet.getCell(1, col++).value = 'alt_image4';
	exportWorksheet.getCell(1, col++).value = 'alt_image5';
	exportWorksheet.getCell(1, col++).value = 'swatch_image6';
	exportWorksheet.getCell(1, col++).value = 'attribute_name1';
	exportWorksheet.getCell(1, col++).value = 'attribute_value1';
	exportWorksheet.getCell(1, col++).value = 'attribute_name2';
	exportWorksheet.getCell(1, col++).value = 'attribute_value2';
	exportWorksheet.getCell(1, col++).value = 'attribute_name3';
	exportWorksheet.getCell(1, col++).value = 'attribute_value3';
	exportWorksheet.getCell(1, col++).value = 'attribute_name4';
	exportWorksheet.getCell(1, col++).value = 'attribute_value4';
	exportWorksheet.getCell(1, col++).value = 'attribute_name5';
	exportWorksheet.getCell(1, col++).value = 'attribute_value5';
	exportWorksheet.getCell(1, col++).value = 'attribute_name6';
	exportWorksheet.getCell(1, col++).value = 'attribute_value6';
	exportWorksheet.getCell(1, col++).value = 'style_tag1';
	exportWorksheet.getCell(1, col++).value = 'style_tag2';
	exportWorksheet.getCell(1, col++).value = 'product_description';
	exportWorksheet.getCell(1, col++).value = 'bullet_point1';
	exportWorksheet.getCell(1, col++).value = 'bullet_point2';
	exportWorksheet.getCell(1, col++).value = 'bullet_point3';
	exportWorksheet.getCell(1, col++).value = 'bullet_point4';
	exportWorksheet.getCell(1, col++).value = 'check_in_note';



	//	Get search filter info
	var filter = JSON.parse(jobInfo.filterJson);


	var foundVskuArr = [];
	var foundUpcArr = [];
	var foundMpnArr = [];

	for (var i = 0; i < products.length; i++) {
		if (products[i].vendorSku !== null) {
			foundVskuArr.push(products[i].vendorSku.trim());
		}

		if (products[i].upc !== null) {
			foundUpcArr.push(products[i].upc.trim());
		}

		if (products[i].mpn !== null) {
			foundMpnArr.push(products[i].mpn.trim());
		}
	}

	//	Determine the vendor skus not found and write a row on the sheet for them.
	var vskuArr = [];
	if (filter.vendorSkus) {
		for (let i = 0; i < filter.vendorSkus.length; i++) {
			vskuArr.push(filter.vendorSkus[i].vendorSku);
		}
		vskuArr = _.difference(vskuArr, foundVskuArr);
	}

	for (var i = 0; i < vskuArr.length; i++) {
		exportWorksheet.getCell(row, 1).value = vskuArr[i];
		exportWorksheet.getCell(row, 12).value = 'N';
		exportWorksheet.getCell(row, 13).value = 0;
		exportWorksheet.getCell(row, 14).value = 0;
		exportWorksheet.getCell(row++, 15).value = 0;
	}

	var upcArr = [];
	if (filter.upc !== null) {
		upcArr = filter.upc.split(",");
		upcArr = _.difference(upcArr, foundUpcArr);
	}

	for (var i = 0; i < upcArr.length; i++) {
		exportWorksheet.getCell(row++, 8).value = upcArr[i];
	}

	var mpnArr = [];
	if (filter.mpn !== null) {
		mpnArr = filter.mpn.split(",");
		mpnArr = _.difference(mpnArr, foundMpnArr);
	}

	for (var i = 0; i < mpnArr.length; i++) {
		exportWorksheet.getCell(row++, 7).value = mpnArr[i];
	}


	//	Now populate found skus
	for (var i = 0; i < products.length; i++) {
		prom = [];
		prom.push(RushProducts.checkPrevious(products[i].vendorSku.trim()));
		prom.push(RushProducts.checkLiveSold(products[i].vendorSku.trim()));
		prom.push(RushProducts.checkOrange(products[i].vendorSku.trim()));

		var checkResults = await Promise.all(prom);


		//	Check for previously manifested
		var previous = 'N';
		if ((checkResults[0].length > 0) && (checkResults[0][0].num > 0)) {
			previous = 'Y';
		}

		//	Check for live and sold counts
		var live = 0;
		var sold = 0;
		if ((checkResults[1].length > 0) && (checkResults[1][0].num > 0)) {
			if (checkResults[1][0].status === 'Live') {
				live = checkResults[1][0].num;
			} else if (checkResults[1][0].status === 'Sold') {
				sold = checkResults[1][0].num;
			}
		}

		if ((checkResults[1].length > 1) && (checkResults[1][1].num > 0)) {
			if (checkResults[1][1].status === 'Live') {
				live = checkResults[1][1].num;
			} else if (checkResults[1][1].status === 'Sold') {
				sold = checkResults[1][1].num;
			}
		}


		//	Check for orange counts
		var orange = 0;
		if ((checkResults[2].length > 0) && (checkResults[2][0].num > 0)) {
			orange = checkResults[2][0].num;
		}



		col = 1;
		exportWorksheet.getCell(row, col++).value = products[i]['vendorSku'];
		exportWorksheet.getCell(row, col++).value = products[i]['productName'];
		exportWorksheet.getCell(row, col++).value = products[i]['primaryCategory'];
		exportWorksheet.getCell(row, col++).value = products[i]['secondaryCategory'];
		exportWorksheet.getCell(row, col++).value = products[i]['brandName'];
		exportWorksheet.getCell(row, col++).value = products[i]['manufacturer'];
		exportWorksheet.getCell(row, col++).value = products[i]['mpn'];
		exportWorksheet.getCell(row, col++).value = products[i]['upc'];
		exportWorksheet.getCell(row, col++).value = products[i]['productCost'];
		exportWorksheet.getCell(row, col++).value = products[i]['msrp'];
		exportWorksheet.getCell(row, col++).value = products[i]['partnerSellingPrice'];

		exportWorksheet.getCell(row, col++).value = previous;

		exportWorksheet.getCell(row, col++).value = live;
		exportWorksheet.getCell(row, col++).value = sold;
		exportWorksheet.getCell(row, col++).value = orange;
		exportWorksheet.getCell(row, col++).value = products[i]['inMarketPrice'];
		exportWorksheet.getCell(row, col++).value = products[i]['quantity'];
		exportWorksheet.getCell(row, col++).value = products[i]['extendedMsrp'];
		exportWorksheet.getCell(row, col++).value = products[i]['productUrl'];
		exportWorksheet.getCell(row, col++).value = products[i]['primaryMaterial'];
		exportWorksheet.getCell(row, col++).value = products[i]['secondaryMaterial'];
		exportWorksheet.getCell(row, col++).value = products[i]['materialSpecific'];
		exportWorksheet.getCell(row, col++).value = products[i]['primaryColor'];
		exportWorksheet.getCell(row, col++).value = products[i]['colorSpecific'];
		exportWorksheet.getCell(row, col++).value = products[i]['productWeight'];
		exportWorksheet.getCell(row, col++).value = products[i]['productHeight'];
		exportWorksheet.getCell(row, col++).value = products[i]['productWidth'];
		exportWorksheet.getCell(row, col++).value = products[i]['productDepth'];
		exportWorksheet.getCell(row, col++).value = products[i]['partialItem'];
		exportWorksheet.getCell(row, col++).value = products[i]['quantityPerCarton'];
		exportWorksheet.getCell(row, col++).value = products[i]['mainImageKnockout'];
		exportWorksheet.getCell(row, col++).value = products[i]['mainImageLifestyle'];
		exportWorksheet.getCell(row, col++).value = products[i]['altImage3'];
		exportWorksheet.getCell(row, col++).value = products[i]['altImage4'];
		exportWorksheet.getCell(row, col++).value = products[i]['altImage5'];
		exportWorksheet.getCell(row, col++).value = products[i]['swatchImage6'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeName1'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeValue1'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeName2'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeValue2'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeName3'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeValue3'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeName4'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeValue4'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeName5'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeValue5'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeName6'];
		exportWorksheet.getCell(row, col++).value = products[i]['attributeValue6'];
		exportWorksheet.getCell(row, col++).value = products[i]['styleTag1'];
		exportWorksheet.getCell(row, col++).value = products[i]['styleTag2'];
		exportWorksheet.getCell(row, col++).value = products[i]['productDescription'];
		exportWorksheet.getCell(row, col++).value = products[i]['bulletPoint1'];
		exportWorksheet.getCell(row, col++).value = products[i]['bulletPoint2'];
		exportWorksheet.getCell(row, col++).value = products[i]['bulletPoint3'];
		exportWorksheet.getCell(row, col++).value = products[i]['bulletPoint4'];
		exportWorksheet.getCell(row, col++).value = products[i]['checkInNote'];
		row++;
	}



	await exportWorkbook.xlsx.writeFile(TMP_DIR + jobInfo.exportFile);

	var results = await fileUtils.storeMultipartFile(storageContext, 'vendor-catalog-exports', TMP_DIR + jobInfo.exportFile, jobInfo.exportFile, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync(TMP_DIR + jobInfo.exportFile);

	if (jobInfo.id != undefined) {
		await Products.completeExportJob(jobInfo.id, results.url);
	}

	return resp;
}




var processRRCExportEnhanced = async (resp, jobInfo) => {
	var storageContext = {};
	var whereInfo = {
		clause: jobInfo.whereClause,
		values: []
	}

	jobInfo.whereInfo = whereInfo;

	storageContext = fileUtils.getContext(jobInfo.storageContext, 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context " + jobInfo.storageContext + " doesn't exist.");
	} else {

		resp = await writeRRCExportSheetOptimized(jobInfo, storageContext, resp);
		return resp;
	}
};





var writeRRCExportSheetOptimized = async (jobInfo, storageContext, resp) => {
	var chunkSize = process.env.EXPORT_CHUNK_SIZE ? process.env.EXPORT_CHUNK_SIZE : 1000;
	var col = 4;
	const exportOptions = {
		filename: TMP_DIR + jobInfo.exportFile,
		useStyles: true,
		useSharedStrings: true
	};
	var exportWorkbook = new excel.stream.xlsx.WorkbookWriter(exportOptions);
	var exportWorksheet = null;
	var filter = JSON.parse(jobInfo.filterJson);
	var rowsProcessed = 0;

	exportWorksheet = exportWorkbook.addWorksheet('Export');

	exportWorksheet.getCell(1, (1)).value = 'product_name';
	exportWorksheet.getCell(1, (2)).value = 'dropship_inventory';
	exportWorksheet.getCell(1, (3)).value = 'vendor_sku';
	exportWorksheet.getCell(1, (4)).value = 'primary_category';
	exportWorksheet.getCell(1, (5)).value = 'secondary_category';
	exportWorksheet.getCell(1, (6)).value = 'brand_name';
	exportWorksheet.getCell(1, (7)).value = 'date_created';

	await exportWorksheet.getRow(1).commit();

	var row = 2;

	var rowCount = await Products.getProductCount(jobInfo.whereClause);

	while (rowsProcessed < rowCount.totalCount) {
		await Products.progressExportJob(jobInfo.id, "INPROG-" + rowsProcessed);

		var rows = await Products.getAll(jobInfo.whereInfo, 'vendor_sku', rowsProcessed, chunkSize);
		console.log("Rows: " + rowsProcessed + " of " + rowCount.totalCount + " " + rows.products[0].vendorSku);


		for (var i = 0; i < rows.products.length; i++) {
			col = 4;
			exportWorksheet.getCell(row, (1)).value = rows.products[i]['productName'];
			exportWorksheet.getCell(row, (2)).value = rows.products[i]['dropshipInventory'];
			exportWorksheet.getCell(row, (3)).value = rows.products[i]['vendorSku'];
			exportWorksheet.getCell(row, (4)).value = rows.products[i]['primaryCategory'];
			exportWorksheet.getCell(row, (5)).value = rows.products[i]['secondaryCategory'];
			exportWorksheet.getCell(row, (6)).value = rows.products[i]['brandName'];
			exportWorksheet.getCell(row, (7)).value = rows.products[i]['dateCreated'];

			await exportWorksheet.getRow(row).commit();

			row = row + 1;
		}


		rowsProcessed += rows.products.length;
	}


	await exportWorkbook.commit();
	// await exportWorkbook.xlsx.writeFile('sheets/' + jobInfo.exportFile);

	var results = await fileUtils.storeMultipartFile(storageContext, 'rrc-exports', TMP_DIR + jobInfo.exportFile, jobInfo.exportFile, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync(TMP_DIR + jobInfo.exportFile);

	if (jobInfo.id != undefined) {
		await Products.completeExportJob(jobInfo.id, results.url);
	}

	return resp;
}




var processRBROnHandExportEnhanced = async (resp, jobInfo) => {
	var storageContext = {};
	var whereInfo = {
		clause: jobInfo.whereClause,
		values: []
	}

	jobInfo.whereInfo = whereInfo;

	storageContext = fileUtils.getContext(jobInfo.storageContext, 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context " + jobInfo.storageContext + " doesn't exist.");
	} else {

		resp = await writeRBROnHandExportSheetOptimized(jobInfo, storageContext, resp);
		return resp;
	}
};



var writeRBROnHandExportSheetOptimized = async (jobInfo, storageContext, resp) => {
	var chunkSize = process.env.EXPORT_CHUNK_SIZE ? process.env.EXPORT_CHUNK_SIZE : 1000;
	var col = 4;
	const exportOptions = {
		filename: TMP_DIR + jobInfo.exportFile,
		useStyles: true,
		useSharedStrings: true
	};
	var exportWorkbook = new excel.stream.xlsx.WorkbookWriter(exportOptions);
	var exportWorksheet = null;
	var filter = JSON.parse(jobInfo.filterJson);
	var rowsProcessed = 0;
	var whereInfo = {
		clause: jobInfo.whereClause,
		values: []
	}


	exportWorksheet = exportWorkbook.addWorksheet('Export');

	exportWorksheet.getCell(1, (1)).value = 'rush_sku';
	exportWorksheet.getCell(1, (2)).value = 'vendor_sku';
	exportWorksheet.getCell(1, (3)).value = 'status';
	exportWorksheet.getCell(1, (4)).value = 'product_name';
	exportWorksheet.getCell(1, (5)).value = 'primary_category';
	exportWorksheet.getCell(1, (6)).value = 'secondary_category';
	exportWorksheet.getCell(1, (7)).value = 'condition';
	exportWorksheet.getCell(1, (8)).value = 'location';
	exportWorksheet.getCell(1, (9)).value = 'main_image';
	exportWorksheet.getCell(1, (10)).value = 'shipping_label';
	exportWorksheet.getCell(1, (11)).value = 'damage_images';
	exportWorksheet.getCell(1, (12)).value = 'date_created';

	await exportWorksheet.getRow(1).commit();

	var row = 2;

	await Products.progressExportJob(jobInfo.id, "PROCESSING");

	var rowCount = await RushProducts.getAllRRC(whereInfo, ' p.sku DESC ', 0, 1000000);

	for (let i = 0; i < rowCount.totalCount; i++) {
		console.log("Rows: " + rowsProcessed + " of " + rowCount.totalCount);

		col = 4;
		exportWorksheet.getCell(row, (1)).value = rowCount.rushProducts[i]['sku'];
		exportWorksheet.getCell(row, (2)).value = rowCount.rushProducts[i]['sellerProductId'];
		exportWorksheet.getCell(row, (3)).value = rowCount.rushProducts[i]['status'];
		exportWorksheet.getCell(row, (4)).value = rowCount.rushProducts[i]['name'];
		exportWorksheet.getCell(row, (5)).value = rowCount.rushProducts[i]['category1'];
		exportWorksheet.getCell(row, (6)).value = rowCount.rushProducts[i]['category2'];
		exportWorksheet.getCell(row, (7)).value = rowCount.rushProducts[i]['conditionName'];
		exportWorksheet.getCell(row, (8)).value = rowCount.rushProducts[i]['locationNumber'];
		exportWorksheet.getCell(row, (9)).value = rowCount.rushProducts[i]['mainImage'];

		let images = '';
		for (let j=0; j < rowCount.rushProducts[i]['shippingLabelImages'].length; j++) {
			if (images.length) {
				images += ',';
			}
			images += rowCount.rushProducts[i]['shippingLabelImages'][j];
		}
		exportWorksheet.getCell(row, (10)).value = images;

		images = '';
		for (let j=0; j < rowCount.rushProducts[i]['damageImages'].length; j++) {
			if (images.length) {
				images += ',';
			}
			images += rowCount.rushProducts[i]['damageImages'][j];
		}
		exportWorksheet.getCell(row, (11)).value = images;

		exportWorksheet.getCell(row, (12)).value = rowCount.rushProducts[i]['dateCreated'];

		await exportWorksheet.getRow(row).commit();

		row += 1;
	}


	await exportWorkbook.commit();
	// await exportWorkbook.xlsx.writeFile('sheets/' + jobInfo.exportFile);

	var results = await fileUtils.storeMultipartFile(storageContext, 'rrc-exports', TMP_DIR + jobInfo.exportFile, jobInfo.exportFile, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync(TMP_DIR + jobInfo.exportFile);

	if (jobInfo.id != undefined) {
		await Products.completeExportJob(jobInfo.id, results.url);
	}

	return resp;
}








var processTRMExportEnhanced = async (resp, jobInfo) => {
	var storageContext = {};
	var whereInfo = {
		clause: jobInfo.whereClause,
		values: []
	}

	jobInfo.whereInfo = whereInfo;

	storageContext = fileUtils.getContext(jobInfo.storageContext, 'UNIQUE');

	if (storageContext === null) {
		throw new Error("Storage context " + jobInfo.storageContext + " doesn't exist.");
	} else {

		resp = await writeTRMExportSheetOptimized(jobInfo, storageContext, resp);
		return resp;
	}
};



var writeTRMExportSheetOptimized = async (jobInfo, storageContext, resp) => {
	var chunkSize = process.env.EXPORT_CHUNK_SIZE ? process.env.EXPORT_CHUNK_SIZE : 1000;
	var col = 4;
	const exportOptions = {
		filename: TMP_DIR + jobInfo.exportFile,
		useStyles: true,
		useSharedStrings: true
	};
	var exportWorkbook = new excel.stream.xlsx.WorkbookWriter(exportOptions);
	var exportWorksheet = null;
	var filter = JSON.parse(jobInfo.filterJson);
	var rowsProcessed = 0;

	exportWorksheet = exportWorkbook.addWorksheet('Export');
	var colInfo = await Vendors.getTRMTemplateColumnInfo();

	var gdeCities = [];
	if (filter.includeGDEData) {
		gdeCities = await VCGDE.getDistinctDestCities();
	}


	exportWorksheet.getCell(1, (1)).value = 'coreleap_sku';
	exportWorksheet.getCell(1, (2)).value = 'coreleap_variant_sku';
	exportWorksheet.getCell(1, (3)).value = 'dropship_inventory';
	for (var i = 0; i < colInfo.length; i++) {
		exportWorksheet.getCell(1, col++).value = colInfo[i].dataPoint;
	}

	exportWorksheet.getCell(1, col++).value = 'coin_id';
	if (filter.includeGDEData) {
		exportWorksheet.getCell(1, col++).value = 'min_selling_price';
		exportWorksheet.getCell(1, col++).value = 'max_selling_price';
	}


	for (var i = 0; i < gdeCities.length; i++) {
		exportWorksheet.getCell(1, col++).value = `${gdeCities[i]['city']}_ship_cost`;
	}

	for (var i = 0; i < gdeCities.length; i++) {
		exportWorksheet.getCell(1, col++).value = `${gdeCities[i]['city']}_min_selling_price`;
	}

	await exportWorksheet.getRow(1).commit();

	var row = 2;

	var rowCount = await Products.getProductCount(jobInfo.whereClause);

	while (rowsProcessed < rowCount.totalCount) {
		await Products.progressExportJob(jobInfo.id, "INPROG-" + rowsProcessed);

		var rows = await Products.getAll(jobInfo.whereInfo, 'sku, variant_sku', rowsProcessed, chunkSize);
		console.log("Rows: " + rowsProcessed + " of " + rowCount.totalCount + " " + rows.products[0].vendorSku);


		for (var i = 0; i < rows.products.length; i++) {
			col = 4;
			var gde = [];
			if ((filter.includeGDEData) && (filter.vendorId !== undefined)) {
				if ((filter.vendorId === undefined) || (filter.vendorId === '')) {
					gde = await VCGDE.getExportDataByVendorSku(rows.products[i]['vendorId'], rows.products[i]['vendorSku']);
				} else {
					gde = await VCGDE.getExportDataByVendorSku(filter.vendorId, rows.products[i]['vendorSku']);
				}
			}
			exportWorksheet.getCell(row, (1)).value = rows.products[i]['sku'];
			exportWorksheet.getCell(row, (2)).value = rows.products[i]['variantSku'];
			exportWorksheet.getCell(row, (3)).value = rows.products[i]['dropshipInventory'];
			for (var j = 0; j < colInfo.length; j++) {
				if (colInfo[j].dataPoint === 'master_id (if children)') {
					exportWorksheet.getCell(row, col).value = rows.products[i]['masterId'];
				} else {
					exportWorksheet.getCell(row, col).value = rows.products[i][colUtils.colToKey(colInfo[j].dataPoint)];
				}
				col++;
			}
			exportWorksheet.getCell(row, col++).value = rows.products[i]['coinId'];

			if (filter.includeGDEData) {
				var minSellingCol = col;
				exportWorksheet.getCell(row, col++).value = rows.products[i]['coinId'];
				var maxSellingCol = col;
				exportWorksheet.getCell(row, col++).value = rows.products[i]['coinId'];

				for (var j = 0; j < gde.length; j++) {
					exportWorksheet.getCell(row, col++).value = gde[j]['ship_cost'];
				}

				var max = 0;
				var min = 10000;
				for (var j = 0; j < gde.length; j++) {
					exportWorksheet.getCell(row, col++).value = gde[j]['min_selling_price'];
					if (gde[j]['min_selling_price'] > max) {
						max = gde[j]['min_selling_price'];
					}
					if (gde[j]['min_selling_price'] < min) {
						min = gde[j]['min_selling_price'];
					}
				}
				exportWorksheet.getCell(row, minSellingCol).value = min;
				exportWorksheet.getCell(row, maxSellingCol).value = max;
			}

			await exportWorksheet.getRow(row).commit();

			row = row + 1;
		}


		rowsProcessed += rows.products.length;
	}


	await exportWorkbook.commit();
	// await exportWorkbook.xlsx.writeFile('sheets/' + jobInfo.exportFile);

	var results = await fileUtils.storeMultipartFile(storageContext, 'vendor-catalog-exports', TMP_DIR + jobInfo.exportFile, jobInfo.exportFile, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync(TMP_DIR + jobInfo.exportFile);

	if (jobInfo.id != undefined) {
		await Products.completeExportJob(jobInfo.id, results.url);
	}

	return resp;
}





var writeBarstoolsExportSheet = async (jobInfo, storageContext, products, resp) => {
	var col = 1;
	var row = 2;
	var exportWorkbook = new excel.Workbook();
	var exportWorksheet = null;


	exportWorksheet = exportWorkbook.addWorksheet('Products');


	exportWorksheet.getCell(1, col++).value = 'ID';
	exportWorksheet.getCell(1, col++).value = 'Handle';
	exportWorksheet.getCell(1, col++).value = 'Command';
	exportWorksheet.getCell(1, col++).value = 'Title';
	exportWorksheet.getCell(1, col++).value = 'Body HTML';
	exportWorksheet.getCell(1, col++).value = 'Vendor';
	exportWorksheet.getCell(1, col++).value = 'Type';
	exportWorksheet.getCell(1, col++).value = 'Tags';
	exportWorksheet.getCell(1, col++).value = 'Tags Command';
	exportWorksheet.getCell(1, col++).value = 'Published';
	exportWorksheet.getCell(1, col++).value = 'Published Scope';
	exportWorksheet.getCell(1, col++).value = 'Primary Row';
	exportWorksheet.getCell(1, col++).value = 'Image Src';
	exportWorksheet.getCell(1, col++).value = 'Image Alt Text';
	exportWorksheet.getCell(1, col++).value = 'Image Command';
	exportWorksheet.getCell(1, col++).value = 'Variant Command';
	exportWorksheet.getCell(1, col++).value = 'Option1 Name';
	exportWorksheet.getCell(1, col++).value = 'Option1 Value';
	exportWorksheet.getCell(1, col++).value = 'Option2 Name';
	exportWorksheet.getCell(1, col++).value = 'Option2 Value';
	exportWorksheet.getCell(1, col++).value = 'Option3 Name';
	exportWorksheet.getCell(1, col++).value = 'Option3 Value';
	exportWorksheet.getCell(1, col++).value = 'Variant Position';
	exportWorksheet.getCell(1, col++).value = 'Variant SKU';
	exportWorksheet.getCell(1, col++).value = 'Variant Barcode';
	exportWorksheet.getCell(1, col++).value = 'Variant Image';
	exportWorksheet.getCell(1, col++).value = 'Variant Weight';
	exportWorksheet.getCell(1, col++).value = 'Variant Weight Unit';
	exportWorksheet.getCell(1, col++).value = 'Variant Country of Origin';
	exportWorksheet.getCell(1, col++).value = 'Variant Price';
	exportWorksheet.getCell(1, col++).value = 'Variant Cost';
	exportWorksheet.getCell(1, col++).value = 'Variant Taxable';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Tracker';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Policy';
	exportWorksheet.getCell(1, col++).value = 'Variant Fulfillment Service';
	exportWorksheet.getCell(1, col++).value = 'Variant Requires Shipping';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Qty';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Adjust';
	exportWorksheet.getCell(1, col++).value = 'Metafield: highlights.high-lights [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: popup_content.content [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: spr.reviews [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: description_tag [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: product.vendorsku [string]';
	exportWorksheet.getCell(1, col++).value = 'Variant Metafield: product.vendorsku [string]';
	exportWorksheet.getCell(1, col++).value = 'Variant Metafield: product.shiptype [string]';


	var country = 'CN';
	var handle = '';
	var html = '';
	var images = '';
	var oneFrameColor = true;
	var oneSeatColor = true;
	var oneSeatMaterial = true;
	var parent = null;
	var primary = 'FALSE';
	var tags = '';


	for (var i = 0; i < products.length; i++) {
		col = 1;
		images = '';
		country = 'CN';
		tags = '';


		if (products[i]['variantSku'].endsWith('-1')) {
			primary = 'TRUE';
			handle = '';
			var bname = products[i]['brandName'];
			if (bname !== null) {
				bname = bname.toLowerCase().trim();
				handle = handle + bname + ' ';
			}
			var pname = products[i]['productName'];
			if (pname !== null) {
				pname = pname.toLowerCase().trim();
				handle = handle + pname
			}
			handle = handle.replace(/ /g, "-");
			handle = handle.replace(/[^a-zA-Z0-9-]/g, "");
		} else {
			primary = 'FALSE';
		}


		//	Check to see if there are more than one seat material option tied to this sku.
		if (products[i]['variantSku'].endsWith('-1')) {
			parent = products[i]['sku'];
			var material = products[i]['materialSpecific'];
			var j = i;
			j++;
			while ((j < products.length) && (products[j]['sku'] === parent)) {
				if (products[j]['materialSpecific'] != material) {
					oneSeatMaterial = false;
				}
				j++;
			}
		}


		//	Check to see if there are more than one seat color option tied to this sku.
		if (products[i]['variantSku'].endsWith('-1')) {
			parent = products[i]['sku'];
			var color = products[i]['colorSpecific'];
			var j = i;
			j++;
			while ((j < products.length) && (products[j]['sku'] === parent)) {
				if (products[j]['colorSpecific'] != color) {
					oneSeatColor = false;
				}
				j++;
			}
		}


		//	Check to see if there are more than one frame color option tied to this sku.
		if ((products[i]['attributeName4'] != null) && (products[i]['attributeName4'].endsWith('-1'))) {
			parent = products[i]['sku'];
			var color = products[i]['attributeName4'];
			var j = i;
			j++;
			while ((j < products.length) && (products[j]['sku'] === parent)) {
				if (products[j]['attributeName4'] != color) {
					oneFrameColor = false;
				}
				j++;
			}
		}



		tags = tags + 'Brand_' + products[i]['brandName'];
		tags = tags + ',Supplier_' + products[i]['manufacturer'];

		if (products[i]['primaryMaterial'] != null) {
			tags = tags + ',Frame Material_' + products[i]['primaryMaterial'];
		}

		if (products[i]['secondaryMaterial'] != null) {
			var materials = products[i]['secondaryMaterial'].split(',');
			for (var k = 0; k < materials.length; k++) {
				tags = tags + ',Seat Material_' + materials[k].trim();
			}
		}

		if (products[i]['primaryColor'] != null) {
			var colors = products[i]['primaryColor'].split(',');
			for (var k = 0; k < colors.length; k++) {
				tags = tags + ',Color_' + colors[k].trim();
				tags = tags + ',Seat Color_' + colors[k].trim();
			}
		}

		if (products[i]['productSize'] != null) {
			tags = tags + ',Seat Height_' + products[i]['productSize'];
		}

		if (products[i]['attributeValue1'] != null) {
			var colors = products[i]['attributeValue1'].split(',');
			for (var k = 0; k < colors.length; k++) {
				tags = tags + ',Frame Color_' + colors[k].trim();
			}
		}

		if (products[i]['attributeValue2'] != null) {
			var styles = products[i]['attributeValue2'].split(',');
			for (var k = 0; k < styles.length; k++) {
				tags = tags + ',Back Style_' + styles[k].trim();
			}
		}

		if (products[i]['attributeValue3'] != null) {
			var features = products[i]['attributeValue3'].split(',');
			for (var k = 0; k < features.length; k++) {
				tags = tags + ',Feature_' + features[k].trim();
			}
		}

		if (products[i]['styleTag1'] != null) {
			var styles = products[i]['styleTag1'].split(',');
			for (var k = 0; k < styles.length; k++) {
				tags = tags + ',Style_' + styles[k].trim();
			}
		}




		html = '<div class="barsol_box3">\n' +
			'<h2 class="product_dec_title">Specifications</h2>\n' +
			'<table>\n' +
			'<tbody>\n' +
			'<tr>\n' +
			'<td>Brand</td>\n' +
			'<td>' + products[i]['brandName'] + '</td>\n' +
			'</tr>\n' +
			'<tr>\n' +
			'<td>Dimensions</td>\n' +
			'<td>' + products[i]['productWidth'] + '" W x ' + products[i]['productDepth'] + '" D x ' + products[i]['productHeight'] + '" H</td>\n' +
			'</tr>\n';

		if (products[i]['productSize'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Seat Height</td>\n' +
				'<td>' + products[i]['productSize'] + '"</td>\n' +
				'</tr>\n';
		}

		html = html +
			'<tr>\n' +
			'<td>Product Weight</td>\n' +
			'<td>' + products[i]['productWeight'] + ' lbs.</td>\n' +
			'</tr>\n' +
			'<tr>\n' +
			'<td>Features</td>\n' +
			'<td>' + products[i]['attributeValue3'] + '</td>\n' +
			'</tr>\n';


		if (oneFrameColor && (products[i]['attributeValue4'] != null)) {
			html = html +
				'<tr>\n' +
				'<td>Frame Color</td>\n' +
				'<td>' + products[i]['attributeValue4'] + '</td>\n' +
				'</tr>\n';
		}

		if (oneSeatColor && (products[i]['colorSpecific'] != null)) {
			html = html +
				'<tr>\n' +
				'<td>Seat Color</td>\n' +
				'<td>' + products[i]['colorSpecific'] + '</td>\n' +
				'</tr>\n';
		}


		if (products[i]['styleTag2'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Frame Material</td>\n' +
				'<td>' + products[i]['styleTag2'] + '</td>\n' +
				'</tr>\n';
		}

		if (oneSeatMaterial && (products[i]['materialSpecific'] != null)) {
			html = html +
				'<tr>\n' +
				'<td>Seat Material</td>\n' +
				'<td>' + products[i]['materialSpecific'] + '</td>\n' +
				'</tr>\n';
		}

		html = html +
			'<tr>\n' +
			'<td>Assembly</td>\n';

		if (products[i]['assemblyReqd'] === 'Y') {
			html = html + '<td>Required</td>\n';
		} else {
			html = html + '<td>Fully Assembled</td>\n';
		}
		html = html +
			'</tr>\n';

		if (products[i]['seatingCapacity'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Weight Capacity</td>\n' +
				'<td>' + products[i]['seatingCapacity'] + ' lbs.</td>\n' +
				'</tr>\n';
		}

		if (products[i]['additionalDims'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Warranty</td>\n' +
				'<td>' + products[i]['additionalDims'] + ' Warranty</td>\n' +
				'</tr>\n';
		}


		html = html +
			'</tbody>\n' +
			'</table>\n' +
			'</div>\n';


		if ((products[i]['prop65Chemicals'] != null) && (products[i]['prop65Chemicals'].length > 0)) {
			html = html +
				'<div class="p65w" style="padding-top: 10px; font-size: .9em; color: #8b8d8c;">\n' +
				'<table>\n' +
				'<tbody>\n' +
				'<tr>\n' +
				'<td>\n' +
				'<svg xmlns="http://www.w3.org/2000/svg" preserveaspectratio="xMaxYMax" viewbox="0 0 25 22" height="22" width="25" focusable="false" class="Icon-sc-19f81vv-0 ikHKrY">\n' +
				'<g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">\n' +
				'<g transform="translate(-973.000000, -1240.000000)" fill-rule="nonzero">\n' +
				'<g id="warning" transform="translate(973.000000, 1240.000000)">\n' +
				'<path d="M0.879764065,21.8322595 L24.1189201,21.8322595 C24.419147,21.8322595 24.6966878,21.6720508 24.846824,21.4118875 C24.9970508,21.1519056 24.9970508,20.8313975 24.846824,20.5714156 L13.2272686,0.445644283 C13.0770871,0.185571688 12.799637,0.0253629764 12.4993648,0.0253629764 C12.1990472,0.0253629764 11.9215971,0.185571688 11.771461,0.445644283 L0.151814882,20.5714156 C0.00163339383,20.8313975 0.00163339383,21.1519056 0.151814882,21.4118875 C0.301950998,21.6719601 0.579446461,21.8322595 0.879764065,21.8322595 Z" id="path8" fill="#000000"></path>\n' +
				'<polygon id="polygon10" fill="#FFFF00" points="12.4993194 2.55653358 22.6548094 20.1463249 2.3438294 20.1463249"></polygon>\n' +
				'<circle id="circle12" fill="#000000" cx="12.4993194" cy="17.5171506" r="1.16352087"></circle>\n' +
				'<path d="M13.2063521,15.0445554 L14.0410163,7.43080762 C14.1090744,6.81011797 13.8003176,6.20866606 13.256216,5.90222323 C12.7122051,5.5957804 12.0378403,5.64337568 11.5422868,6.02327586 C11.0467332,6.40317604 10.8255445,7.04205989 10.9801724,7.64700544 L11.8477768,15.2030399 C11.8756806,15.4460073 12.0312613,15.6557169 12.2558076,15.7527677 C12.4803539,15.8498639 12.7397005,15.8196007 12.9358893,15.673412 C13.1319873,15.527314 13.2351633,15.2874319 13.2063521,15.0445554" id="path14" fill="#000000"></path>\n' +
				'</g>\n' +
				'</g>\n' +
				'</g>\n' +
				'</svg>\n' +
				'</td>\n' +
				'<td style="padding-left: 10px;"><b> Warning:</b> This product can expose you to chemicals including ' + products[i]['prop65Chemicals'] + ', which is known to the State of California to cause cancer. For more information, visit www.p65warnings.ca.gov</td>\n' +
				'</tr>\n' +
				'</tbody>\n' +
				'</table>\n' +
				'</div>';
		}

		var hiHtml = '<h2 class="product_dec_title">Product Highlights</h2>\n' +
			'<p class="text_style1">' + products[i]['productDescription'] + '</p>\n' +
			'<ul>\n';
		if ((products[i]['bulletPoint1'] != null) && (products[i]['bulletPoint1'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint1'] + '</li>\n';
		}
		if ((products[i]['bulletPoint2'] != null) && (products[i]['bulletPoint2'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint2'] + '</li>\n';
		}
		if ((products[i]['bulletPoint3'] != null) && (products[i]['bulletPoint3'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint3'] + '</li>\n';
		}
		if ((products[i]['bulletPoint4'] != null) && (products[i]['bulletPoint4'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint4'] + '</li>\n';
		}
		hiHtml = hiHtml + '</ul>\n' +
			'<div class="barsol_tag">\n' +
			'</div>\n';


		col++; //	ID
		exportWorksheet.getCell(row, col++).value = handle; //	Handle
		exportWorksheet.getCell(row, col++).value = 'NEW'; //	Command
		exportWorksheet.getCell(row, col++).value = products[i]['vendorName'] + ' ' + products[i]['productName']; //	Title
		exportWorksheet.getCell(row, col).alignment = {
			wrapText: true
		};
		exportWorksheet.getCell(row, col++).value = (primary === 'TRUE') ? html : ''; //	Body HTML
		exportWorksheet.getCell(row, col++).value = products[i]['vendorName']; //	Vendor
		exportWorksheet.getCell(row, col++).value = products[i]['secondaryCategory']; //	Type
		exportWorksheet.getCell(row, col++).value = tags; //	Tags
		exportWorksheet.getCell(row, col++).value = 'MERGE'; //	Tags Command
		exportWorksheet.getCell(row, col++).value = 'TRUE'; //	Published
		exportWorksheet.getCell(row, col++).value = 'global'; //	Published Scope
		exportWorksheet.getCell(row, col++).value = primary; //	Primary Row

		if (products[i]['mainImageKnockout'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['mainImageKnockout'];
		}
		if (products[i]['mainImageLifestyle'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['mainImageLifestyle'];
		}
		if (products[i]['altImage3'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['altImage3'];
		}
		if (products[i]['altImage4'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['altImage4'];
		}
		if (products[i]['altImage5'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['altImage5'];
		}

		if (images.length > 0) {
			exportWorksheet.getCell(row, col++).value = images; //	Image Src
		} else {
			col++;
		}

		col++; // Image Alt Text

		exportWorksheet.getCell(row, col++).value = 'MERGE'; //	Image Command
		exportWorksheet.getCell(row, col++).value = 'MERGE'; //	Variant Command
		col++; //	Option3 Name
		col++; //	Option1 Value
		col++; //	Option3 Name
		col++; //	Option2 Value
		col++; //	Option3 Name
		col++; //	Option3 Value
		exportWorksheet.getCell(row, col++).value = parseInt(products[i]['variantSku'].substring(products[i]['variantSku'].indexOf('-') + 1)); //	Variant Position
		exportWorksheet.getCell(row, col++).value = products[i]['variantSku'] //	Variant SKU
		exportWorksheet.getCell(row, col++).value = products[i]['upc']; //	Variant Barcode

		if (products[i]['swatchImage6'] != null) {
			exportWorksheet.getCell(row, col++).value = products[i]['swatchImage6']; //	Variant Image 
		} else {
			col++;
		}
		exportWorksheet.getCell(row, col++).value = products[i]['productWeight']; //	Variant Weight
		exportWorksheet.getCell(row, col++).value = 'lb'; //	Variant Weight Unit

		if (products[i]['countryManufacture'] !== undefined) {
			if ((products[i]['countryManufacture'] !== null) && (products[i]['countryManufacture'].length === 2)) {
				country = products[i]['countryManufacture'];
			} else if ((products[i]['countryManufacture'] !== null) && (products[i]['countryManufacture'].toLowerCase() === 'china')) {
				country = 'CN'
			} else if ((products[i]['countryManufacture'] !== null) && (products[i]['countryManufacture'].toLowerCase() === 'india')) {
				country = 'IN'
			} else if ((products[i]['countryManufacture'] !== null) && (products[i]['countryManufacture'].toLowerCase() === 'indonesia')) {
				country = 'ID'
			} else if ((products[i]['countryManufacture'] !== null) && (products[i]['countryManufacture'].toLowerCase() === 'malaysia')) {
				country = 'MN'
			} else if ((products[i]['countryManufacture'] !== null) && (products[i]['countryManufacture'].toLowerCase() === 'mexico')) {
				country = 'MX'
			} else if ((products[i]['countryManufacture'] !== null) && (products[i]['countryManufacture'].toLowerCase() === 'vietnam')) {
				country = 'VN'
			} else if ((products[i]['countryManufacture'] !== null) && (products[i]['countryManufacture'].toLowerCase() === 'viet nam')) {
				country = 'VN'
			} else {
				country = '??'
			}
		}
		exportWorksheet.getCell(row, col++).value = country; //	Variant Country of Origin
		exportWorksheet.getCell(row, col++).value = 9999.99; //	Variant Price
		exportWorksheet.getCell(row, col++).value = products[i]['productCost']; //	Variant Cost
		exportWorksheet.getCell(row, col++).value = 'TRUE'; //	Variant Taxable
		exportWorksheet.getCell(row, col++).value = 'Shopify'; //	Variant Inventory Tracker
		exportWorksheet.getCell(row, col++).value = 'Deny'; //	Variant Inventory Policy
		exportWorksheet.getCell(row, col++).value = 'Manual'; //	Variant Fulfillment Service
		exportWorksheet.getCell(row, col++).value = 'TRUE'; //	Variant Requires Shipping
		exportWorksheet.getCell(row, col++).value = 10; //	Variant Inventory Qty
		exportWorksheet.getCell(row, col++).value = 0; //	Variant Inventory Adjust
		exportWorksheet.getCell(row, col).alignment = {
			wrapText: true
		};
		exportWorksheet.getCell(row, col++).value = hiHtml; //	Metafield: highlights.high-lights [string]
		col++; //	Metafield: popup_content.content [string]
		col++; //	Metafield: spr.reviews [string]
		col++; //	Metafield: description_tag [string]
		col++; //	Metafield: product.vendorsku [string]
		exportWorksheet.getCell(row, col++).value = products[i]['vendorSku']; //	Variant Metafield: product.vendorsku [string]
		exportWorksheet.getCell(row, col++).value = products[i]['shipType']; //	Variant Metafield: product.shiptype [string]



		row = row + 1;
	}

	await exportWorkbook.xlsx.writeFile(TMP_DIR + jobInfo.exportFile);

	var results = await fileUtils.storeMultipartFile(storageContext, 'vendor-catalog-exports', TMP_DIR + jobInfo.exportFile, jobInfo.exportFile, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync(TMP_DIR + jobInfo.exportFile);

	if (jobInfo.id != undefined) {
		await Products.completeExportJob(jobInfo.id, results.url);
	}

	return resp;
}



var writePatioUmbrellasExportSheet = async (jobInfo, storageContext, products, resp) => {
	var col = 1;
	var row = 2;
	var exportWorkbook = new excel.Workbook();
	var exportWorksheet = null;


	exportWorksheet = exportWorkbook.addWorksheet('Products');


	exportWorksheet.getCell(1, col++).value = 'ID';
	exportWorksheet.getCell(1, col++).value = 'Handle';
	exportWorksheet.getCell(1, col++).value = 'Command';
	exportWorksheet.getCell(1, col++).value = 'Title';
	exportWorksheet.getCell(1, col++).value = 'Body HTML';
	exportWorksheet.getCell(1, col++).value = 'Vendor';
	exportWorksheet.getCell(1, col++).value = 'Type';
	exportWorksheet.getCell(1, col++).value = 'Tags';
	exportWorksheet.getCell(1, col++).value = 'Tags Command';
	exportWorksheet.getCell(1, col++).value = 'Published';
	exportWorksheet.getCell(1, col++).value = 'Published Scope';
	exportWorksheet.getCell(1, col++).value = 'Primary Row';
	exportWorksheet.getCell(1, col++).value = 'Image Src';
	exportWorksheet.getCell(1, col++).value = 'Image Alt Text';
	exportWorksheet.getCell(1, col++).value = 'Image Command';
	exportWorksheet.getCell(1, col++).value = 'Variant Command';
	exportWorksheet.getCell(1, col++).value = 'Option1 Name';
	exportWorksheet.getCell(1, col++).value = 'Option1 Value';
	exportWorksheet.getCell(1, col++).value = 'Option2 Name';
	exportWorksheet.getCell(1, col++).value = 'Option2 Value';
	exportWorksheet.getCell(1, col++).value = 'Option3 Name';
	exportWorksheet.getCell(1, col++).value = 'Option3 Value';
	exportWorksheet.getCell(1, col++).value = 'Variant Position';
	exportWorksheet.getCell(1, col++).value = 'Variant SKU';
	exportWorksheet.getCell(1, col++).value = 'Variant Barcode';
	exportWorksheet.getCell(1, col++).value = 'Variant Image';
	exportWorksheet.getCell(1, col++).value = 'Variant Weight';
	exportWorksheet.getCell(1, col++).value = 'Variant Weight Unit';
	exportWorksheet.getCell(1, col++).value = 'Variant Country of Origin';
	exportWorksheet.getCell(1, col++).value = 'Variant Price';
	exportWorksheet.getCell(1, col++).value = 'Variant Cost';
	exportWorksheet.getCell(1, col++).value = 'Variant Taxable';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Tracker';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Policy';
	exportWorksheet.getCell(1, col++).value = 'Variant Fulfillment Service';
	exportWorksheet.getCell(1, col++).value = 'Variant Requires Shipping';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Qty';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Adjust';
	exportWorksheet.getCell(1, col++).value = 'Metafield: highlights.high-lights [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: popup_content.content [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: spr.reviews [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: description_tag [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: product.vendorsku [string]';
	exportWorksheet.getCell(1, col++).value = 'Variant Metafield: product.vendorsku [string]';
	exportWorksheet.getCell(1, col++).value = 'Variant Metafield: product.shiptype [string]';


	var country = 'CN';
	var handle = '';
	var html = '';
	var images = '';
	var parent = null;
	var onePoleColor = true;
	var primary = 'FALSE';
	var tags = '';

	for (var i = 0; i < products.length; i++) {
		col = 1;
		images = '';
		country = 'CN';
		tags = '';

		if (products[i]['variantSku'].endsWith('-1')) {
			primary = 'TRUE';
			handle = products[i]['brandName'].toLowerCase().trim() + ' ' + products[i]['productName'].toLowerCase().trim();
			handle = handle.replace(/ /g, "-");
			handle = handle.replace(/[^a-zA-Z0-9-]/g, "");
		} else {
			primary = 'FALSE';
		}




		//	Check to see if there are more than one pole color tied to this sku.
		if (products[i]['variantSku'].endsWith('-1')) {
			parent = products[i]['sku'];
			var color = products[i]['styleTag1'];
			var j = i;
			j++;
			while ((j < products.length) && (products[j]['sku'] === parent)) {
				if (products[j]['styleTag1'] != color) {
					onePoleColor = false;
				}
				j++;
			}
		}



		//	Build tags
		tags = tags + 'Brand_' + products[i]['brandName'];
		tags = tags + ',Supplier_' + products[i]['manufacturer'];

		if (products[i]['primaryMaterial'] != null) {
			tags = tags + ',Canopy Material_' + products[i]['primaryMaterial'];
		}

		if (products[i]['secondaryMaterial'] != null) {
			tags = tags + ',Pole Material_' + products[i]['secondaryMaterial'];
		}

		if (products[i]['primaryColor'] != null) {
			tags = tags + ',Color_' + products[i]['primaryColor'];
		}

		if (products[i]['productSize'] < 6) {
			tags = tags + ',Umbrella Width_Under 6\'';
		} else if ((products[i]['productWidth'] >= 6) && (products[i]['productWidth'] < 8)) {
			tags = tags + ',Umbrella Width_6-8\'';
		} else if ((products[i]['productWidth'] >= 8) && (products[i]['productWidth'] < 10)) {
			tags = tags + ',Umbrella Width_8-10\'';
		} else if (products[i]['productWidth'] >= 10) {
			tags = tags + ',Umbrella Width_10\' and Up';
		}

		if (products[i]['attributeValue1'] != null) {
			tags = tags + ',Lift Method_' + products[i]['attributeValue1'];
		}

		if (products[i]['attributeValue2'] != null) {
			tags = tags + ',Canopy Shape_' + products[i]['attributeValue2'];
		}

		if (products[i]['attributeValue3'] != null) {
			tags = tags + ',Tilt_' + products[i]['attributeValue3'];
		}

		if (products[i]['attributeValue4'] != null) {
			var features = products[i]['attributeValue4'].split(',');
			for (var k = 0; k < features.length; k++) {
				tags = tags + ',Feature_' + features[k];
			}
		}




		html = '<div class="barsol_box3">\n' +
			'<h2 class="product_dec_title">Specifications</h2>\n' +
			'<table>\n' +
			'<tbody>\n' +
			'<tr>\n' +
			'<td>Dimensions</td>\n' +
			'<td>' + products[i]['productWidth'] + '" W x ' + products[i]['productDepth'] + '" D x ' + products[i]['productHeight'] + '" H</td>\n' +
			'</tr>\n';

		if (products[i]['materialSpecific'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Canopy Fabric</td>\n' +
				'<td>' + products[i]['materialSpecific'] + '</td>\n' +
				'</tr>\n';
		}


		if (products[i]['attributeValue1'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Lift Method</td>\n' +
				'<td>' + products[i]['attributeValue1'] + '</td>\n' +
				'</tr>\n';
		}

		if (products[i]['secondaryMaterial'] != null) {
			html = html +
				'<tr>\n';
			//	If pole color is populated this is a pole material.
			if (products[i]['styleTag1'] != null) {
				html = html +
					'<td>Pole Material</td>\n';
			} else {
				html = html +
					'<td>Material</td>\n';
			}
			html = html +
				'<td>' + products[i]['secondaryMaterial'] + '</td>\n' +
				'</tr>\n';
		}

		if (onePoleColor && (products[i]['styleTag1'] != null)) {
			html = html +
				'<tr>\n' +
				'<td>Pole Color</td>\n' +
				'<td>' + products[i]['styleTag1'] + '</td>\n' +
				'</tr>\n';
		}


		if (products[i]['additionalDims'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Recommended Umbrella Base Weight</td>\n' +
				'<td>' + products[i]['additionalDims'] + '</td>\n' +
				'</tr>\n';
		}

		if (products[i]['attributeValue3'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Tilt</td>\n' +
				'<td>' + products[i]['attributeValue3'] + '</td>\n' +
				'</tr>\n';
		}

		if (products[i]['attributeValue4'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Feature</td>\n' +
				'<td>' + products[i]['attributeValue4'] + '</td>\n' +
				'</tr>\n';
		}

		html = html +
			'<tr>\n' +
			'<td>Product Weight</td>\n' +
			'<td>' + products[i]['productWeight'] + ' lbs.</td>\n' +
			'</tr>\n';


		if (products[i]['attributeValue2'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Canopy Shape</td>\n' +
				'<td>' + products[i]['attributeValue2'] + '</td>\n' +
				'</tr>\n';
		}

		html = html +
			'<tr>\n' +
			'<td>Brand</td>\n' +
			'<td>' + products[i]['brandName'] + '</td>\n' +
			'</tr>\n' +
			'</tbody>\n' +
			'</table>\n';




		var hiHtml = '<h2 class="product_dec_title">Product Highlights</h2>\n' +
			'<p class="text_style1">' + products[i]['productDescription'] + '</p>\n' +
			'<ul>\n';
		if ((products[i]['bulletPoint1'] != null) && (products[i]['bulletPoint1'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint1'] + '</li>\n';
		}
		if ((products[i]['bulletPoint2'] != null) && (products[i]['bulletPoint2'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint2'] + '</li>\n';
		}
		if ((products[i]['bulletPoint3'] != null) && (products[i]['bulletPoint3'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint3'] + '</li>\n';
		}
		if ((products[i]['bulletPoint4'] != null) && (products[i]['bulletPoint4'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint4'] + '</li>\n';
		}
		hiHtml = hiHtml + '</ul>\n' +
			'<div class="barsol_tag">\n' +
			'</div>\n';


		col++; //	ID
		exportWorksheet.getCell(row, col++).value = handle; //	Handle
		exportWorksheet.getCell(row, col++).value = 'NEW'; //	Command
		exportWorksheet.getCell(row, col++).value = products[i]['brandName'] + ' ' + products[i]['productName']; //	Title
		exportWorksheet.getCell(row, col).alignment = {
			wrapText: true
		};
		exportWorksheet.getCell(row, col++).value = (primary === 'TRUE') ? html : ''; //	Body HTML
		exportWorksheet.getCell(row, col++).value = products[i]['vendorName']; //	Vendor
		exportWorksheet.getCell(row, col++).value = products[i]['secondaryCategory']; //	Type
		exportWorksheet.getCell(row, col++).value = tags; //	Tags
		exportWorksheet.getCell(row, col++).value = 'MERGE'; //	Tags Command
		exportWorksheet.getCell(row, col++).value = 'TRUE'; //	Published
		exportWorksheet.getCell(row, col++).value = 'global'; //	Published Scope
		exportWorksheet.getCell(row, col++).value = primary; //	Primary Row

		if (products[i]['mainImageKnockout'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['mainImageKnockout'];
		}
		if (products[i]['mainImageLifestyle'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['mainImageLifestyle'];
		}
		if (products[i]['altImage3'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['altImage3'];
		}
		if (products[i]['altImage4'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['altImage4'];
		}
		if (products[i]['altImage5'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['altImage5'];
		}

		if (images.length > 0) {
			exportWorksheet.getCell(row, col++).value = images; //	Image Src
		} else {
			col++;
		}

		col++; // Image Alt Text

		exportWorksheet.getCell(row, col++).value = 'MERGE'; //	Image Command
		exportWorksheet.getCell(row, col++).value = 'MERGE'; //	Variant Command
		col++; //	Option3 Name
		col++; //	Option1 Value
		col++; //	Option3 Name
		col++; //	Option2 Value
		col++; //	Option3 Name
		col++; //	Option3 Value
		exportWorksheet.getCell(row, col++).value = parseInt(products[i]['variantSku'].substring(products[i]['variantSku'].indexOf('-') + 1)); //	Variant Position
		exportWorksheet.getCell(row, col++).value = products[i]['variantSku'] //	Variant SKU
		exportWorksheet.getCell(row, col++).value = products[i]['upc']; //	Variant Barcode

		if (products[i]['swatchImage6'] != null) {
			exportWorksheet.getCell(row, col++).value = products[i]['swatchImage6']; //	Variant Image 
		} else {
			col++;
		}
		exportWorksheet.getCell(row, col++).value = products[i]['productWeight']; //	Variant Weight
		exportWorksheet.getCell(row, col++).value = 'lb'; //	Variant Weight Unit

		if (products[i]['countryManufacture'].length === 2) {
			country = products[i]['countryManufacture'];
		} else if (products[i]['countryManufacture'].toLowerCase() === 'china') {
			country = 'CN'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'india') {
			country = 'IN'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'indonesia') {
			country = 'ID'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'malaysia') {
			country = 'MN'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'mexico') {
			country = 'MX'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'vietnam') {
			country = 'VN'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'viet nam') {
			country = 'VN'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'germany') {
			country = 'DE'
		} else {
			country = '??'
		}
		exportWorksheet.getCell(row, col++).value = country; //	Variant Country of Origin
		exportWorksheet.getCell(row, col++).value = 9999.99; //	Variant Price
		exportWorksheet.getCell(row, col++).value = products[i]['productCost']; //	Variant Cost
		exportWorksheet.getCell(row, col++).value = 'TRUE'; //	Variant Taxable
		exportWorksheet.getCell(row, col++).value = 'Shopify'; //	Variant Inventory Tracker
		exportWorksheet.getCell(row, col++).value = 'Deny'; //	Variant Inventory Policy
		exportWorksheet.getCell(row, col++).value = 'Manual'; //	Variant Fulfillment Service
		exportWorksheet.getCell(row, col++).value = 'TRUE'; //	Variant Requires Shipping
		exportWorksheet.getCell(row, col++).value = 10; //	Variant Inventory Qty
		exportWorksheet.getCell(row, col++).value = 0; //	Variant Inventory Adjust
		exportWorksheet.getCell(row, col).alignment = {
			wrapText: true
		};
		exportWorksheet.getCell(row, col++).value = hiHtml; //	Metafield: highlights.high-lights [string]
		col++; //	Metafield: popup_content.content [string]
		col++; //	Metafield: spr.reviews [string]
		col++; //	Metafield: description_tag [string]
		col++; //	Metafield: product.vendorsku [string]
		exportWorksheet.getCell(row, col++).value = products[i]['vendorSku']; //	Variant Metafield: product.vendorsku [string]
		exportWorksheet.getCell(row, col++).value = products[i]['shipType']; //	Variant Metafield: product.shiptype [string]



		row = row + 1;
	}

	await exportWorkbook.xlsx.writeFile(TMP_DIR + jobInfo.exportFile);

	var results = await fileUtils.storeMultipartFile(storageContext, 'vendor-catalog-exports', TMP_DIR + jobInfo.exportFile, jobInfo.exportFile, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync(TMP_DIR + jobInfo.exportFile);

	if (jobInfo.id != undefined) {
		await Products.completeExportJob(jobInfo.id, results.url);
	}

	return resp;
}



var writePlantersExportSheet = async (jobInfo, storageContext, products, resp) => {
	var col = 1;
	var row = 2;
	var exportWorkbook = new excel.Workbook();
	var exportWorksheet = null;


	exportWorksheet = exportWorkbook.addWorksheet('Products');


	exportWorksheet.getCell(1, col++).value = 'ID';
	exportWorksheet.getCell(1, col++).value = 'Handle';
	exportWorksheet.getCell(1, col++).value = 'Command';
	exportWorksheet.getCell(1, col++).value = 'Title';
	exportWorksheet.getCell(1, col++).value = 'Body HTML';
	exportWorksheet.getCell(1, col++).value = 'Vendor';
	exportWorksheet.getCell(1, col++).value = 'Type';
	exportWorksheet.getCell(1, col++).value = 'Tags';
	exportWorksheet.getCell(1, col++).value = 'Tags Command';
	exportWorksheet.getCell(1, col++).value = 'Published';
	exportWorksheet.getCell(1, col++).value = 'Published Scope';
	exportWorksheet.getCell(1, col++).value = 'Primary Row';
	exportWorksheet.getCell(1, col++).value = 'Image Src';
	exportWorksheet.getCell(1, col++).value = 'Image Alt Text';
	exportWorksheet.getCell(1, col++).value = 'Image Command';
	exportWorksheet.getCell(1, col++).value = 'Variant Command';
	exportWorksheet.getCell(1, col++).value = 'Option1 Name';
	exportWorksheet.getCell(1, col++).value = 'Option1 Value';
	exportWorksheet.getCell(1, col++).value = 'Option2 Name';
	exportWorksheet.getCell(1, col++).value = 'Option2 Value';
	exportWorksheet.getCell(1, col++).value = 'Option3 Name';
	exportWorksheet.getCell(1, col++).value = 'Option3 Value';
	exportWorksheet.getCell(1, col++).value = 'Variant Position';
	exportWorksheet.getCell(1, col++).value = 'Variant SKU';
	exportWorksheet.getCell(1, col++).value = 'Variant Barcode';
	exportWorksheet.getCell(1, col++).value = 'Variant Image';
	exportWorksheet.getCell(1, col++).value = 'Variant Weight';
	exportWorksheet.getCell(1, col++).value = 'Variant Weight Unit';
	exportWorksheet.getCell(1, col++).value = 'Variant Country of Origin';
	exportWorksheet.getCell(1, col++).value = 'Variant Price';
	exportWorksheet.getCell(1, col++).value = 'Variant Cost';
	exportWorksheet.getCell(1, col++).value = 'Variant Taxable';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Tracker';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Policy';
	exportWorksheet.getCell(1, col++).value = 'Variant Fulfillment Service';
	exportWorksheet.getCell(1, col++).value = 'Variant Requires Shipping';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Qty';
	exportWorksheet.getCell(1, col++).value = 'Variant Inventory Adjust';
	exportWorksheet.getCell(1, col++).value = 'Metafield: highlights.high-lights [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: popup_content.content [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: spr.reviews [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: description_tag [string]';
	exportWorksheet.getCell(1, col++).value = 'Metafield: product.vendorsku [string]';
	exportWorksheet.getCell(1, col++).value = 'Variant Metafield: product.vendorsku [string]';
	exportWorksheet.getCell(1, col++).value = 'Variant Metafield: product.shiptype [string]';


	var country = 'CN';
	var handle = '';
	var html = '';
	var images = '';
	var parent = null;
	var oneColor = true;
	var oneDims = true;
	var oneWeight = true;
	var primary = 'FALSE';
	var tags = '';

	for (var i = 0; i < products.length; i++) {
		col = 1;
		images = '';
		country = 'CN';
		tags = '';

		if (products[i]['variantSku'].endsWith('-1')) {
			primary = 'TRUE';
			handle = products[i]['brandName'].toLowerCase().trim() + ' ' + products[i]['productName'].toLowerCase().trim();
			handle = handle.replace(/ /g, "-");
			handle = handle.replace(/[^a-zA-Z0-9-]/g, "");
		} else {
			primary = 'FALSE';
		}


		//	Check to see if there are more than one color tied to this sku.
		if (products[i]['variantSku'].endsWith('-1')) {
			parent = products[i]['sku'];
			var color = products[i]['colorSpecific'];
			var j = i;
			j++;
			while ((j < products.length) && (products[j]['sku'] === parent)) {
				if (products[j]['colorSpecific'] != color) {
					oneColor = false;
				}
				j++;
			}
		}


		//	Check to see if there are more than one weight tied to this sku.
		if (products[i]['variantSku'].endsWith('-1')) {
			parent = products[i]['sku'];
			var weight = products[i]['productWeight'];
			var j = i;
			j++;
			while ((j < products.length) && (products[j]['sku'] === parent)) {
				if (products[j]['productWeight'] != weight) {
					oneWeight = false;
				}
				j++;
			}
		}


		//	Check to see if there are more than one size tied to this sku.
		if (products[i]['variantSku'].endsWith('-1')) {
			parent = products[i]['sku'];
			var width = products[i]['productWidth'];
			var depth = products[i]['productDepth'];
			var height = products[i]['productHeight'];
			var j = i;
			j++;
			while ((j < products.length) && (products[j]['sku'] === parent)) {
				if ((products[i]['productWidth'] != width) ||
					(products[i]['productDepth'] != depth) ||
					(products[i]['productHeight'] != height)) {
					oneDims = false;
				}
				j++;
			}
		}

		//	Build tags
		tags = tags + 'Material_' + products[i]['primaryMaterial'];
		tags = tags + ',Color_' + products[i]['primaryColor'];
		if (products[i]['productWidth'] < 8) {
			tags = tags + ',Size_Small: Width up to 8"';
		} else if ((products[i]['productWidth'] >= 8) && (products[i]['productWidth'] < 16)) {
			tags = tags + ',Size_Medium: Width up to 16"';
		} else if ((products[i]['productWidth'] >= 16) && (products[i]['productWidth'] < 24)) {
			tags = tags + ',Size_Large: Width up to 24"';
		} else if (products[i]['productWidth'] >= 24) {
			tags = tags + ',Size_Extra Large: Width over 24"';
		}
		if (products[i]['attributeValue1'] != null) {
			tags = tags + ',Shape_' + products[i]['attributeValue1'];
		}
		if (products[i]['attributeValue2'] != null) {
			var features = products[i]['attributeValue2'].split(',');
			for (var k = 0; k < features.length; k++) {
				tags = tags + ',Feature_' + features[k];
			}
		}
		tags = tags + ',Brand_' + products[i]['brandName'];
		if (products[i]['styleTag1'] != null) {
			tags = tags + ',Planter Style_' + products[i]['styleTag1'];
		}
		tags = tags + ',Supplier_' + products[i]['manufacturer'];


		html = '<div class="barsol_box3">\n' +
			'<h2 class="product_dec_title">Specifications</h2>\n' +
			'<table>\n' +
			'<tbody>\n' +
			'<tr>\n' +
			'<td>Material</td>\n' +
			'<td>' + products[i]['materialSpecific'] + '</td>\n' +
			'</tr>\n';

		if (products[i]['attributeValue1'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Shape</td>\n' +
				'<td>' + products[i]['attributeValue1'] + '</td>\n' +
				'</tr>\n';
		}

		html = html +
			'<tr>\n' +
			'<td>Brand</td>\n' +
			'<td>' + products[i]['brandName'] + '</td>\n' +
			'</tr>\n' +
			'<tr>\n' +
			'<td>Country of Origin</td>\n' +
			'<td>' + products[i]['countryManufacture'] + '</td>\n' +
			'</tr>\n';

		if (oneColor) {
			html = html +
				'<tr>\n' +
				'<td>Color</td>\n' +
				'<td>' + products[i]['colorSpecific'] + '</td>\n' +
				'</tr>\n';
		}

		if (products[i]['attributeValue2'] != null) {
			html = html +
				'<tr>\n' +
				'<td>Feature</td>\n' +
				'<td>' + products[i]['attributeValue2'] + '</td>\n' +
				'</tr>\n';
		}

		if (oneWeight) {
			html = html +
				'<tr>\n' +
				'<td>Product Weight</td>\n' +
				'<td>' + products[i]['productWeight'] + ' lbs.</td>\n' +
				'</tr>\n';
		}

		if (oneDims) {
			html = html +
				'<tr>\n' +
				'<td>Dimensions</td>\n' +
				'<td>' + products[i]['productWidth'] + '" W x ' + products[i]['productDepth'] + '" D x ' + +products[i]['productHeight'] + '" H</td>\n' +
				'</tr>\n';
		}

		html = html +
			'<tr>\n' +
			'<td>Assembly</td>\n';
		if (products[i]['assemblyReqd'] === 'Y') {
			html = html + '<td>Required</td>\n';
		} else {
			html = html + '<td>Not Required</td>\n';
		}
		html = html +
			'</tr>\n';


		if ((products[i]['prop65Chemicals'] != null) && (products[i]['prop65Chemicals'].length > 0)) {
			html = html +
				'<div class="p65w" style="padding-top: 10px; font-size: .9em; color: #8b8d8c;">\n' +
				'<table>\n' +
				'<tbody>\n' +
				'<tr>\n' +
				'<td>\n' +
				'<svg xmlns="http://www.w3.org/2000/svg" preserveaspectratio="xMaxYMax" viewbox="0 0 25 22" height="22" width="25" focusable="false" class="Icon-sc-19f81vv-0 ikHKrY">\n' +
				'<g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">\n' +
				'<g transform="translate(-973.000000, -1240.000000)" fill-rule="nonzero">\n' +
				'<g id="warning" transform="translate(973.000000, 1240.000000)">\n' +
				'<path d="M0.879764065,21.8322595 L24.1189201,21.8322595 C24.419147,21.8322595 24.6966878,21.6720508 24.846824,21.4118875 C24.9970508,21.1519056 24.9970508,20.8313975 24.846824,20.5714156 L13.2272686,0.445644283 C13.0770871,0.185571688 12.799637,0.0253629764 12.4993648,0.0253629764 C12.1990472,0.0253629764 11.9215971,0.185571688 11.771461,0.445644283 L0.151814882,20.5714156 C0.00163339383,20.8313975 0.00163339383,21.1519056 0.151814882,21.4118875 C0.301950998,21.6719601 0.579446461,21.8322595 0.879764065,21.8322595 Z" id="path8" fill="#000000"></path>\n' +
				'<polygon id="polygon10" fill="#FFFF00" points="12.4993194 2.55653358 22.6548094 20.1463249 2.3438294 20.1463249"></polygon>\n' +
				'<circle id="circle12" fill="#000000" cx="12.4993194" cy="17.5171506" r="1.16352087"></circle>\n' +
				'<path d="M13.2063521,15.0445554 L14.0410163,7.43080762 C14.1090744,6.81011797 13.8003176,6.20866606 13.256216,5.90222323 C12.7122051,5.5957804 12.0378403,5.64337568 11.5422868,6.02327586 C11.0467332,6.40317604 10.8255445,7.04205989 10.9801724,7.64700544 L11.8477768,15.2030399 C11.8756806,15.4460073 12.0312613,15.6557169 12.2558076,15.7527677 C12.4803539,15.8498639 12.7397005,15.8196007 12.9358893,15.673412 C13.1319873,15.527314 13.2351633,15.2874319 13.2063521,15.0445554" id="path14" fill="#000000"></path>\n' +
				'</g>\n' +
				'</g>\n' +
				'</g>\n' +
				'</svg>\n' +
				'</td>\n' +
				'<td style="padding-left: 10px;"><b> Warning:</b> This product can expose you to chemicals including ' + products[i]['prop65Chemicals'] + ', which is known to the State of California to cause cancer. For more information, visit www.p65warnings.ca.gov</td>\n' +
				'</tr>\n' +
				'</tbody>\n' +
				'</table>\n' +
				'</div>';
		}

		var hiHtml = '<h2 class="product_dec_title">Product Highlights</h2>\n' +
			'<p class="text_style1">' + products[i]['productDescription'] + '</p>\n' +
			'<ul>\n';
		if ((products[i]['bulletPoint1'] != null) && (products[i]['bulletPoint1'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint1'] + '</li>\n';
		}
		if ((products[i]['bulletPoint2'] != null) && (products[i]['bulletPoint2'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint2'] + '</li>\n';
		}
		if ((products[i]['bulletPoint3'] != null) && (products[i]['bulletPoint3'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint3'] + '</li>\n';
		}
		if ((products[i]['bulletPoint4'] != null) && (products[i]['bulletPoint4'] != '')) {
			hiHtml = hiHtml + '<li><span class="list_icon"></span>' + products[i]['bulletPoint4'] + '</li>\n';
		}
		hiHtml = hiHtml + '</ul>\n' +
			'<div class="barsol_tag">\n' +
			'</div>\n';


		col++; //	ID
		exportWorksheet.getCell(row, col++).value = handle; //	Handle
		exportWorksheet.getCell(row, col++).value = 'NEW'; //	Command
		exportWorksheet.getCell(row, col++).value = products[i]['brandName'] + ' ' + products[i]['productName']; //	Title
		exportWorksheet.getCell(row, col).alignment = {
			wrapText: true
		};
		exportWorksheet.getCell(row, col++).value = (primary === 'TRUE') ? html : ''; //	Body HTML
		exportWorksheet.getCell(row, col++).value = products[i]['vendorName']; //	Vendor
		exportWorksheet.getCell(row, col++).value = products[i]['secondaryCategory']; //	Type
		exportWorksheet.getCell(row, col++).value = tags; //	Tags
		exportWorksheet.getCell(row, col++).value = 'MERGE'; //	Tags Command
		exportWorksheet.getCell(row, col++).value = 'TRUE'; //	Published
		exportWorksheet.getCell(row, col++).value = 'global'; //	Published Scope
		exportWorksheet.getCell(row, col++).value = primary; //	Primary Row

		if (products[i]['mainImageKnockout'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['mainImageKnockout'];
		}
		if (products[i]['mainImageLifestyle'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['mainImageLifestyle'];
		}
		if (products[i]['altImage3'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['altImage3'];
		}
		if (products[i]['altImage4'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['altImage4'];
		}
		if (products[i]['altImage5'] != null) {
			if (images.length > 0) {
				images = images + ";";
			}
			images = images + products[i]['altImage5'];
		}

		if (images.length > 0) {
			exportWorksheet.getCell(row, col++).value = images; //	Image Src
		} else {
			col++;
		}

		col++; // Image Alt Text

		exportWorksheet.getCell(row, col++).value = 'MERGE'; //	Image Command
		exportWorksheet.getCell(row, col++).value = 'MERGE'; //	Variant Command
		col++; //	Option3 Name
		col++; //	Option1 Value
		col++; //	Option3 Name
		col++; //	Option2 Value
		col++; //	Option3 Name
		col++; //	Option3 Value
		exportWorksheet.getCell(row, col++).value = parseInt(products[i]['variantSku'].substring(products[i]['variantSku'].indexOf('-') + 1)); //	Variant Position
		exportWorksheet.getCell(row, col++).value = products[i]['variantSku'] //	Variant SKU
		exportWorksheet.getCell(row, col++).value = products[i]['upc']; //	Variant Barcode

		if (products[i]['swatchImage6'] != null) {
			exportWorksheet.getCell(row, col++).value = products[i]['swatchImage6']; //	Variant Image 
		} else {
			col++;
		}
		exportWorksheet.getCell(row, col++).value = products[i]['productWeight']; //	Variant Weight
		exportWorksheet.getCell(row, col++).value = 'lb'; //	Variant Weight Unit

		if (products[i]['countryManufacture'].length === 2) {
			country = products[i]['countryManufacture'];
		} else if (products[i]['countryManufacture'].toLowerCase() === 'china') {
			country = 'CN'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'india') {
			country = 'IN'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'indonesia') {
			country = 'ID'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'malaysia') {
			country = 'MN'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'mexico') {
			country = 'MX'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'vietnam') {
			country = 'VN'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'viet nam') {
			country = 'VN'
		} else if (products[i]['countryManufacture'].toLowerCase() === 'germany') {
			country = 'DE'
		} else {
			country = '??'
		}
		exportWorksheet.getCell(row, col++).value = country; //	Variant Country of Origin
		exportWorksheet.getCell(row, col++).value = 9999.99; //	Variant Price
		exportWorksheet.getCell(row, col++).value = products[i]['productCost']; //	Variant Cost
		exportWorksheet.getCell(row, col++).value = 'TRUE'; //	Variant Taxable
		exportWorksheet.getCell(row, col++).value = 'Shopify'; //	Variant Inventory Tracker
		exportWorksheet.getCell(row, col++).value = 'Deny'; //	Variant Inventory Policy
		exportWorksheet.getCell(row, col++).value = 'Manual'; //	Variant Fulfillment Service
		exportWorksheet.getCell(row, col++).value = 'TRUE'; //	Variant Requires Shipping
		exportWorksheet.getCell(row, col++).value = 10; //	Variant Inventory Qty
		exportWorksheet.getCell(row, col++).value = 0; //	Variant Inventory Adjust
		exportWorksheet.getCell(row, col).alignment = {
			wrapText: true
		};
		exportWorksheet.getCell(row, col++).value = hiHtml; //	Metafield: highlights.high-lights [string]
		col++; //	Metafield: popup_content.content [string]
		col++; //	Metafield: spr.reviews [string]
		col++; //	Metafield: description_tag [string]
		col++; //	Metafield: product.vendorsku [string]
		exportWorksheet.getCell(row, col++).value = products[i]['vendorSku']; //	Variant Metafield: product.vendorsku [string]
		exportWorksheet.getCell(row, col++).value = products[i]['shipType']; //	Variant Metafield: product.shiptype [string]



		row = row + 1;
	}

	await exportWorkbook.xlsx.writeFile(TMP_DIR + jobInfo.exportFile);

	var results = await fileUtils.storeMultipartFile(storageContext, 'vendor-catalog-exports', TMP_DIR + jobInfo.exportFile, jobInfo.exportFile, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync(TMP_DIR + jobInfo.exportFile);

	if (jobInfo.id != undefined) {
		await Products.completeExportJob(jobInfo.id, results.url);
	}

	return resp;
}



var writeMarketplaceExportSheet = async (jobInfo, storageContext, products, resp) => {
	try {
		var exportWorkbook = new excel.Workbook();
		var exportWorksheet = null;
		var offset = 3;

		exportWorksheet = exportWorkbook.addWorksheet('Export');
		var colInfo = await Vendors.getTRMTemplateColumnInfo();


		//	Output column headers
		exportWorksheet.getCell(1, (1)).value = 'coreleap_sku';
		exportWorksheet.getCell(1, (2)).value = 'coreleap_variant_sku';
		for (var i = 0; i < colInfo.length; i++) {
			exportWorksheet.getCell(1, (i + offset)).value = colInfo[i].dataPoint;
			//	
			if (colInfo[i].dataPoint === 'vendor_sku') {
				exportWorksheet.getCell(1, (i + ++offset)).value = 'relationship_name';
			}
			//	Explode prop_65_chemicals into 4 individual cells.
			if (colInfo[i].dataPoint === 'prop_65_chemicals') {
				exportWorksheet.getCell(1, (i + offset++)).value = 'prop_65_chemical1';
				exportWorksheet.getCell(1, (i + offset++)).value = 'prop_65_chemical2';
				exportWorksheet.getCell(1, (i + offset++)).value = 'prop_65_chemical3';
				exportWorksheet.getCell(1, (i + offset)).value = 'prop_65_chemical4';
			}
		}


		//	Output data.
		var prop65ChemicalCol = 0;
		var row = 2;
		for (var i = 0; i < products.length; i++) {

			offset = 3;

			//	If it's not a -1 or it is and the next variant is a -2, output the coreleap sku.
			if ((!products[i]['variantSku'].endsWith('-1')) || ((i < (products.length - 1)) && (products[i + 1]['variantSku'].endsWith('-2')))) {
				exportWorksheet.getCell(row, (1)).value = products[i]['sku'];
			}
			exportWorksheet.getCell(row, (2)).value = products[i]['variantSku'];
			for (var j = 0; j < colInfo.length; j++) {

				if (colUtils.colToKey(colInfo[j].dataPoint) === 'vendorSku') {
					exportWorksheet.getCell(row, (j + offset++)).value = products[i][colUtils.colToKey(colInfo[j].dataPoint)];
				} else if (colUtils.colToKey(colInfo[j].dataPoint) === 'prop65') {
					if (products[i][colUtils.colToKey(colInfo[j].dataPoint)] === 'Y') {
						exportWorksheet.getCell(row, (j + offset)).value = 'true';
					} else {
						exportWorksheet.getCell(row, (j + offset)).value = 'false';
					}
				} else if (colUtils.colToKey(colInfo[j].dataPoint) === 'prop65Chemicals') {
					if (products[i]['prop65Chemicals'] !== null) {
						var chemicals = products[i]['prop65Chemicals'].split(',');
						for (var k = 0; k < chemicals.length; k++) {
							exportWorksheet.getCell(row, (j + offset + k)).value = chemicals[k].trim();
						}
					}
					offset = offset + 3;
				} else if (colUtils.colToKey(colInfo[j].dataPoint) === 'productName') {
					//	If the product name already includes the vendor name, don't prepend.
					if (products[i][colUtils.colToKey(colInfo[j].dataPoint)].indexOf(products[i]['vendorName']) >= 0) {
						exportWorksheet.getCell(row, (j + offset)).value = products[i][colUtils.colToKey(colInfo[j].dataPoint)];
					} else {
						exportWorksheet.getCell(row, (j + offset)).value = products[i]['vendorName'] + ' ' + products[i][colUtils.colToKey(colInfo[j].dataPoint)];
					}
				} else {
					exportWorksheet.getCell(row, (j + offset)).value = products[i][colUtils.colToKey(colInfo[j].dataPoint)];
				}
			}

			row = row + 1;
		}

		await exportWorkbook.xlsx.writeFile(TMP_DIR + jobInfo.exportFile);


		var results = await fileUtils.storeMultipartFile(storageContext, 'vendor-catalog-exports', TMP_DIR + jobInfo.exportFile, jobInfo.exportFile, false);

		if (results != undefined) {
			resp.url = results.url;
		}

		//	Remove the local exported products file.
		fs.unlinkSync(TMP_DIR + jobInfo.exportFile);

		if (jobInfo.id != undefined) {
			await Products.completeExportJob(jobInfo.id, results.url);
		}

		return resp;
	} catch (e) {
		throw new Error(e);
	}
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
			} else {
				exportWorksheet.getCell(row, (j + 4)).value = products[i][colUtils.colToKey(colInfo[j].dataPoint)];
			}
		}

		row = row + 1;
	}

	await exportWorkbook.xlsx.writeFile(TMP_DIR + jobInfo.exportFile);


	var results = await fileUtils.storeMultipartFile(storageContext, 'vendor-catalog-exports', TMP_DIR + jobInfo.exportFile, jobInfo.exportFile, false);

	if (results != undefined) {
		resp.url = results.url;
	}

	//	Remove the local exported products file.
	fs.unlinkSync(TMP_DIR + jobInfo.exportFile);

	if (jobInfo.id != undefined) {
		await Products.completeExportJob(jobInfo.id, results.url);
	}

	return resp;
}



var sendJobCompletionEmail = (jobInfo) => {
	const date = new Date();
	const fullName = jobInfo.submitter.name;
	const fileName = jobInfo.exportFile;
	const today = date.toLocaleDateString();
	const currentTime = date.toLocaleTimeString();
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	let htmlText = `
<p>
  ${fullName}, your export of ${fileName} has been completed successfully on
  ${today} at ${currentTime} (${timeZone}).
</p>
<p>
  Thank you for being a valued customer.
</p>
<img src="https://cdn.shopify.com/s/files/1/1757/1461/files/rr-logo-blk.png?v=1656441279" alt="RUSH ReCommerce Logo"/>
`

	let plainText = `${fullName}, your export of ${fileName} has been completed successfully on ${today} at ${currentTime} (${timeZone}).

Thank you for being a valued customer.
`
	let to = process.env.TECH_EMAIL;
	if (jobInfo.submitterType === 'VENDOR' && jobInfo.submitterEmail && validator.isEmail(jobInfo.submitterEmail)) {
		to = jobInfo.submitterEmail;
	} else if ((jobInfo.submitter != undefined) && (jobInfo.submitter.email != undefined) && (validator.isEmail(jobInfo.submitter.email))) {
		to = jobInfo.submitter.email;
	} else {
		plainText = plainText + '   NOTE: This job was not submitted by an identified submitter.';
		htmlText = htmlText + '<p>NOTE: This job was not submitted by an identified submitter.</p>';
	}

	comms.sendEmail(to, 'Export Job Completion', plainText, htmlText, process.env.EMAIL_USER);
}


module.exports = {
	processJob,
	processBarstoolsExport,
	processTRMExport
}