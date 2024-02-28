'use strict';

const _ = require('lodash');
const dateformat = require('dateformat');
const excel = require('exceljs');
const gtin = require('gtin');
const mime = require('mime-types');
const moment = require('moment');
const validator = require('validator');

const colUtils = require('../utils/columnUtils');
const validationUtils = require('../utils/validationUtils');

const Vendors = require('../models/vendors');



//
//	Check for vendorSku duplicates.
//
var checkForDuplicateVendorSkus = (vendorSkus, product, invalidInfo) => {
	try {
		var vs = _.find(vendorSkus, function (element) {
			if ((product.vendorSku !== undefined) && (product.vendorSku !== null)) {
				return element === product.vendorSku.toUpperCase();
			}
		});

		if ((vs === undefined) && (product.vendorSku !== undefined) && (product.vendorSku !== null)) {
			vendorSkus.push(product.vendorSku.toUpperCase());
		} else {
			invalidInfo.push({
				error: "invalid",
				field: "vendorSku",
				text: "Duplicate vendor_sku " + product.vendorSku
			});
		}
	} catch (e) {
		console.log(e);
	}
}



//
//	Price validation.
//
var existingProductPriceValidation = (existingProduct, product, coreRequiredInfo) => {
	var msrp = isNaN(parseFloat(product.msrp)) ? parseFloat(existingProduct.msrp) : parseFloat(product.msrp);
	var partnerSellingPrice = isNaN(parseFloat(product.partnerSellingPrice)) ? parseFloat(existingProduct.partnerSellingPrice) : parseFloat(product.partnerSellingPrice);
	var inMarketPrice = isNaN(parseFloat(product.inMarketPrice)) ? parseFloat(existingProduct.inMarketPrice) : parseFloat(product.inMarketPrice);
	var shipToMarketPrice = isNaN(parseFloat(product.shipToMarketPrice)) ? parseFloat(existingProduct.shipToMarketPrice) : parseFloat(product.shipToMarketPrice);

	if ((!isNaN(msrp)) && (!isNaN(partnerSellingPrice))) {
		if (msrp < partnerSellingPrice) {
			coreRequiredInfo.push({
				error: "invalid",
				field: "msrp",
				text: "MSRP should be >= partner selling price."
			});
		}
	}

	if ((!isNaN(partnerSellingPrice)) && (!isNaN(inMarketPrice))) {
		if (partnerSellingPrice <= inMarketPrice) {
			coreRequiredInfo.push({
				error: "invalid",
				field: "partnerSellingPrice",
				text: "Partner selling price should be > in-market price."
			});
		}
	}

	//
	//	Removing this check per RM-2807.
	//
	// if ((!isNaN(partnerSellingPrice)) && (!isNaN(shipToMarketPrice))) {
	// 	if (partnerSellingPrice <= shipToMarketPrice) {
	// 		coreRequiredInfo.push({
	// 			error: "invalid",
	// 			field: "partnerSellingPrice",
	// 			text: "Partner selling price should be > ship to market price."
	// 		});
	// 	}
	// }
}




//
//	Init parse product object.
//
var initializeParseProduct = (parseProduct, product) => {
	parseProduct.product = product;
	parseProduct.validationErrors = null;
	parseProduct.coreEligibilityErrors = null;
	parseProduct.trmEligibilityErrors = null;
	parseProduct.nicheEligibilityErrors = null;
}



var mergeProductChanges = (existing, changed) => {
	var product = _.cloneDeep(existing);

	Object.keys(product).forEach(function (key) {
		if ((changed[key] === null) || (changed[key] != undefined)) {
			product[key] = changed[key];
		}
	});

	if (changed.userId) {
		product.userId = changed.userId;
	}

	return product;
}



var getProductSchema = async () => {
	var o = {};
	var schema = {};

	var rows = await Vendors.getVendorProductSchema();

	for (var i = 0; i < rows.length; i++) {
		if (rows[i].COLUMN_TYPE.startsWith("char(") || rows[i].COLUMN_TYPE.startsWith("varchar(")) {
			var o = {
				type: "char",
				len: extractLength(rows[i].COLUMN_TYPE)
			};


			schema[colUtils.colToKey(rows[i].COLUMN_NAME)] = o;
		}
	}

	return schema;
}


var extractLength = (value) => {
	var openParen = value.indexOf("(");
	var closeParen = value.indexOf(")");
	var num = value.substring(openParen + 1, closeParen);

	return parseInt(num);
}



//
//	Performs basic validation on all fields that are populated.  Plus provides some special validation
//
var validateProduct = async (validations, product, schema) => {
	var invalidInfo = [];
	var requiredInfo = [];
	var validationErrors = {
		errorDetails: [],
		message: ""
	}

	if (schema === undefined) {
		// console.log("Loading schema...")
		schema = await getProductSchema();
	}

	Object.keys(product).forEach(function (key) {
		if (validations[key] != undefined) {
			var msg = [];

			//	Validate lengths for string fields.
			if (schema[key] !== undefined) {
				if ((product[key] !== null) && (product[key].length > schema[key].len)) {
					msg.push("Maximum length allowed for " + colUtils.keyToCol(key) + " is " + schema[key].len);
					product[key] = product[key].substring(0, schema[key.len]);
				}
			}


			// console.log(key + " " + validations[key]['basicValidation']);

			switch (validations[key]['basicValidation']) {
				case 'DECIMAL':
					msg = validateDecimalField(product, key, msg);
					break;

				case 'HHMM':
					msg = validateCSTField(product, key, msg);
					break;

				case 'IMAGE':
					msg = validateURLField(product, key, msg);
					break;

				case 'INTEGER':
					msg = validateIntegerField(product, key, msg);
					break;

				case 'INTRANGE':
					msg = validateIntegerRangeField(validations[key], product, key, msg);
					break;

				case 'SHIPTYPE':
					msg = validateShipTypeField(product, key, msg);
					break;

				case 'UPC':
					msg = validateUPCField(product, key, msg);
					break;

				case 'YN':
					msg = validateYNField(product, key, msg);
					break;

				default:
					break;
			}

			if (msg.length > 0) {
				invalidInfo.push({
					error: "invalid",
					field: key,
					text: msg
				});
			}
		}
	})


	//
	//	Extra data validations to prevent data inconsistencies.
	//

	//	Make sure that the UPC for this product doesn't already exist on another SKU for the vendor.
	if ((product.upc !== undefined) && (product.upc !== null) && (product.upc.trim().length > 0)) {
		var upc = await Vendors.getProductByVendorUPC(product);
		if ((upc.length === 1) && (upc[0].vendorSku !== product.vendorSku)) {
			invalidInfo.push({
				error: "invalid",
				field: "mpn",
				text: "UPC already exists for this vendor."
			});
		}
	}

	//	Make sure that the manufacturer + MPN for this product doesn't already exist on another SKU for the vendor.
	if ((product.manufacturer !== undefined) && (product.mpn !== undefined)) {
		var manuMPN = await Vendors.getProductByVendorManufacturerMPN(product);
		if ((manuMPN.length === 1) && (manuMPN[0].vendorSku !== product.vendorSku)) {
			invalidInfo.push({
				error: "invalid",
				field: "mpn",
				text: "Manufacturer + MPN combo already exists for this vendor."
			});
		}
	}


	if ((product.numberOfBoxes !== undefined) && (product.numberOfBoxes !== null) && (validator.isInt(product.numberOfBoxes.toString()))) {
		var getOut = false;
		for (var d = 0;
			(d < parseInt(product.numberOfBoxes)) && (!getOut); d++) {
			var pkgH = 'packageHeight' + (d + 1);
			var pkgW = 'packageWidth' + (d + 1);
			var pkgL = 'packageLength' + (d + 1);
			var pkgH = 'packageHeight' + (d + 1);
			var shpW = 'shippingWeight' + (d + 1);

			if (
				(product[pkgH] === undefined) || (product[pkgH] === null) || (!validator.isDecimal(product[pkgH].toString())) ||
				(product[pkgW] === undefined) || (product[pkgW] === null) || (!validator.isDecimal(product[pkgW].toString())) ||
				(product[pkgL] === undefined) || (product[pkgL] === null) || (!validator.isDecimal(product[pkgL].toString())) ||
				(product[shpW] === undefined) || (product[shpW] === null) || (!validator.isDecimal(product[shpW].toString()))
			) {
				invalidInfo.push({
					error: "invalid",
					field: "boxDimensions",
					text: "Box dimensions for all " + product.numberOfBoxes + " boxes must be supplied."
				});
				getOut = true;
			}

			//	Order for LTL calculation.
			else {

				if (typeof product[pkgH] === 'string') {
					product[pkgH] = parseFloat(product[pkgH]);
				}
				if (typeof product[pkgW] === 'string') {
					product[pkgW] = parseFloat(product[pkgW]);
				}
				if (typeof product[pkgL] === 'string') {
					product[pkgL] = parseFloat(product[pkgL]);
				}

				var dims = [product[pkgH], product[pkgW], product[pkgL]];
				var sortedDims = _.sortBy(dims);

				product[pkgH] = sortedDims[0];
				product[pkgW] = sortedDims[1];
				product[pkgL] = sortedDims[2];
			}
		}
	}


	validationErrors = validationUtils.finalizeValidationErrors(validationErrors, requiredInfo, invalidInfo);

	return validationErrors;
}



//
//	Validate has the core product data points required to be added to the vendor catalog.
//
var verifyCoreEligibility = (requiredInfo, product, uploadFlag) => {
	requiredInfo = validateFieldPopulated(product, 'vendorSku', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'productName', requiredInfo);


	newProductPriceValidation(product, requiredInfo);

	return requiredInfo;
}


//
//	Validate product has data points required to be eligible for bulk buys.
//
var verifyBulkBuysEligibility = (requiredInfo, product) => {
	requiredInfo = validateFieldPopulated(product, 'partnerSellingPrice', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'msrp', requiredInfo);

	return requiredInfo;
}



//
//	Validate product has data points required to be eligible for inline.
//
var verifyInlineEligibility = (requiredInfo, product) => {
	requiredInfo = validateFieldPopulated(product, 'productCost', requiredInfo);

	return requiredInfo;
}



//
//	Validate product has data points required to be eligible for off price.
//
var verifyOffPriceEligibility = (requiredInfo, product) => {
	requiredInfo = validateFieldPopulated(product, 'productCost', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'partnerSellingPrice', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'msrp', requiredInfo);

	return requiredInfo;
}



//
//	Validate product has data points required to be eligible for retailer returns.
//
var verifyRevShareReturnsEligibility = (requiredInfo, product) => {
	requiredInfo = validateFieldPopulated(product, 'partnerSellingPrice', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'msrp', requiredInfo);

	return requiredInfo;
}



//
//	Validate product has data points required to be eligible for retailer returns.
//
var verifyCostBasedReturnsEligibility = (requiredInfo, product) => {
	requiredInfo = validateFieldPopulated(product, 'productCost', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'partnerSellingPrice', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'msrp', requiredInfo);

	return requiredInfo;
}



//
//	Validate product has data points required to be eligible for sale on TRM.
//
var verifyTRMEligibility = (requiredInfo, product, vendor) => {
	requiredInfo = validateFieldPopulated(product, 'mainImageKnockout', requiredInfo);

	//	4/30/2020 - Turning off VC pricing validation.
	//
	if ((vendor !== undefined) && (vendor.partnerTypes !== undefined)) {
		var dropshipFlag = false;
		var dropshipRequiredInfo = [];
		var inMarketFlag = false;
		var inMarketRequiredInfo = [];

		if (vendor.partnerTypes.length === 0) {
			dropshipFlag = true;
			inMarketFlag = true;
		}

		for (var i = 0; i < vendor.partnerTypes.length; i++) {
			if ((vendor.partnerTypes[i] === "RBR") || (vendor.partnerTypes[i] === 'Direct')) {
				inMarketFlag = true;
			} else if (vendor.partnerTypes[i] === "STM") {
				dropshipFlag = true;
			}
		}

		if (inMarketFlag) {
			inMarketRequiredInfo = validateFieldPopulated(product, 'inMarketPrice', inMarketRequiredInfo);
		}

		if (dropshipFlag) {
			dropshipRequiredInfo = validateFieldPopulated(product, 'shipToMarketPrice', dropshipRequiredInfo);
		}

		//	If both flags are true and only one price is missing, we're good.
		if (inMarketFlag && dropshipFlag) {
			if (inMarketRequiredInfo.length + dropshipRequiredInfo.length === 2) {
				requiredInfo.push(inMarketRequiredInfo[0]);
				requiredInfo.push(dropshipRequiredInfo[0]);
			}
		} else if (inMarketFlag && !dropshipFlag && (inMarketRequiredInfo.length > 0)) {
			requiredInfo.push(inMarketRequiredInfo[0]);
		} else if (!inMarketFlag && dropshipFlag && (dropshipRequiredInfo.length > 0)) {
			requiredInfo.push(dropshipRequiredInfo[0]);
		}

	}



	// msg = validateFieldPopulated(product, 'masterId (if children)', requiredInfo);

	// 2019-10-09 These are weeded out for TRM 1.0 changes.
	// requiredInfo = validateFieldPopulated(product, 'quantityPerCarton', requiredInfo);
	// requiredInfo = validateFieldPopulated(product, 'attributeName1', requiredInfo);
	// requiredInfo = validateFieldPopulated(product, 'attributeValue1', requiredInfo);
	// requiredInfo = validateFieldPopulated(product, 'msrp', requiredInfo);
	// requiredInfo = validateFieldPopulated(product, 'mapPrice', requiredInfo);
	// requiredInfo = validateFieldPopulated(product, 'assemblyReqd', requiredInfo);
	// requiredInfo = validateFieldPopulated(product, 'brandName', requiredInfo);
	// requiredInfo = validateFieldPopulated(product, 'mainImageLifestyle', requiredInfo);
	// requiredInfo = validateFieldPopulated(product, 'primaryCategory', requiredInfo);
	// requiredInfo = validateFieldPopulated(product, 'secondaryCategory', requiredInfo);
	// requiredInfo = validateFieldPopulated(product, 'upc', requiredInfo);


	return requiredInfo;
}


//
//	Validate product has data points required to be eligible for sale as a drop ship item.
//
var verifyDropshipEligibility = (requiredInfo, product, vendor) => {

	var knockoutRequiredInfo = [];
	var lifestyleRequiredInfo = [];
	var psRequiredInfo = [];
	var msrpRequiredInfo = [];

	requiredInfo = validateFieldPopulated(product, 'vendorSku', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'productName', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'productCost', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'primaryMaterial', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'primaryColor', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'productWeight', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'productHeight', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'productWidth', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'productDepth', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'primaryCategory', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'secondaryCategory', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'numberOfBoxes', requiredInfo);
	// box 1 dims are always required
	requiredInfo = validateFieldPopulated(product, 'packageHeight1', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'packageWidth1', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'packageLength1', requiredInfo);
	requiredInfo = validateFieldPopulated(product, 'shippingWeight1', requiredInfo);
	// when there is more than 1 box... we need to make sure all box dims are present for the number of boxes there are
	if (product.numberOfBoxes !== undefined && product.numberOfBoxes > 1) {
		for (var i=2; i<=product.numberOfBoxes; i++) {
			requiredInfo = validateFieldPopulated(product, `packageHeight${i}`, requiredInfo);
			requiredInfo = validateFieldPopulated(product, `packageWidth${i}`, requiredInfo);
			requiredInfo = validateFieldPopulated(product, `packageLength${i}`, requiredInfo);
			requiredInfo = validateFieldPopulated(product, `shippingWeight${i}`, requiredInfo);
		}
	}

	knockoutRequiredInfo = validateFieldPopulated(product, 'mainImageKnockout', knockoutRequiredInfo);
	lifestyleRequiredInfo = validateFieldPopulated(product, 'mainImageLifestyle', lifestyleRequiredInfo);
	psRequiredInfo = validateFieldPopulated(product, 'partnerSellingPrice', psRequiredInfo);
	msrpRequiredInfo = validateFieldPopulated(product, 'msrp', msrpRequiredInfo);

	//	If both images are missing, we got problems.
	if (knockoutRequiredInfo.length + lifestyleRequiredInfo.length === 2) {
		requiredInfo.push(knockoutRequiredInfo[0]);
		requiredInfo.push(lifestyleRequiredInfo[0]);
	}
	//	If both prices are missing, we got problems.
	if (psRequiredInfo.length + msrpRequiredInfo.length === 2) {
		requiredInfo.push(psRequiredInfo[0]);
		requiredInfo.push(msrpRequiredInfo[0]);
	}

	return requiredInfo;
}


//
//	Validate product has data points required to be eligible for sale as a limited quantity drop ship item.
//	NOTE: check verifyDropshipEligibility instead unless this flag becomes relevant again
//
//  

var validateCountryField = (product, key, msg) => {
	var dataPoint = colUtils.keyToCol(key);
	if ((product[key] === undefined) || (product[key] === null) && (product[key].length > 0)) {
		msg.push(dataPoint + ' is required');
		// } else if (!validator.isISO31661Alpha2(product[key])) {
		// 	msg = msgAppend(msg, dataPoint + ' must be a valid country code');
	}

	return msg;
}


var validateCSTField = (product, key, msg) => {
	var dataPoint = colUtils.keyToCol(key);
	if ((product[key] != undefined) && (product[key] != null) && (product[key].length > 0)) {
		if (product[key].length <= 8) {
			var m = moment(product[key], 'h:mm a');
			if ((m._pf.meridiem === undefined) || (m.format("hh:mm A").length != 8)) {
				msg.push(dataPoint + ' must be a valid time in format HH:MM AM/PM');
			} else {
				product[key] = m.format("hh:mm A");
			}
		} else {
			try {
				var d = new Date(product[key]);
				d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
				var m = moment(dateformat(d, "HH:MM"), 'h:mm a');

				product[key] = m.format("hh:mm A");
			} catch (e) {
				if (e.message === 'Invalid date') {
					msg.push(dataPoint + ' must be a valid time in format HH:MM AM/PM');
				} else {
					throw new Error(e);
				}
			}
		}
	}

	return msg;
}


var validateDecimalField = (product, key, msg) => {
	var dataPoint = colUtils.keyToCol(key);
	if (product[key] === '') {
		product[key] = null;
	}
	if ((product[key] != undefined) && (product[key] != null)) {
		if ((typeof (product[key]) != 'number') && (!validator.isDecimal(product[key]))) {
			msg.push(dataPoint + ' must be a decimal');
		}
	}

	return msg;
}


var validateFieldPopulated = (product, key, requiredInfo) => {
	var dataPoint = colUtils.keyToCol(key);
	if ((product[key] === undefined) || (product[key] === null) || (product[key].length === 0)) {
		requiredInfo.push({
			error: "isRequired",
			field: colUtils.keyToCol(key),
			text: colUtils.keyToCol(key)
		});
	}

	return requiredInfo;
}


var validateIntegerField = (product, key, msg) => {
	var dataPoint = colUtils.keyToCol(key);
	if ((product[key] != undefined) && (product[key] != null)) {
		if ((typeof (product[key]) != 'number') && (!validator.isInt(product[key]))) {
			msg.push(dataPoint + ' must be an integer');
		}
	}

	return msg;
}


var validateIntegerRangeField = (validation, product, key, msg) => {
	var dataPoint = colUtils.keyToCol(key);
	var rangeBeg = 0;
	var rangeEnd = 9999;

	if (validation.basicValidationMeta != null) {
		var idx = validation.basicValidationMeta.indexOf('-');
		rangeBeg = parseInt(validation.basicValidationMeta.substring(0, idx));
		rangeEnd = parseInt(validation.basicValidationMeta.substring(idx + 1));
	}

	if ((product[key] != undefined) && (product[key] != null)) {
		if ((typeof (product[key]) != 'number') && (!validator.isInt(product[key]))) {
			msg.push(dataPoint + ' must be an integer');
		} else if ((product[key] < rangeBeg) || (product[key] > rangeEnd)) {
			msg.push(dataPoint + ' must be in the range ' + rangeBeg + '-' + rangeEnd);
		}
	}

	return msg;
}


var validateShipTypeField = (product, key, msg) => {
	var dataPoint = colUtils.keyToCol(key);
	if ((product[key] !== undefined) && (product[key] !== null) && (product[key].length > 0)) {
		if (((product[key]).toLowerCase() !== 'small parcel') && ((product[key]).toLowerCase() !== 'ltl')) {
			msg.push(dataPoint + ' must be Small Parcel or LTL');
		}
		if ((product[key]).toLowerCase() === 'ltl') {
			msg = validateDecimalField(product, 'freightClass', msg);
			msg = validateDecimalField(product, 'nfmcCode', msg);
		}

		if ((product[key]).toLowerCase() === 'ltl') {
			product[key] = 'LTL';
		}
		if ((product[key]).toLowerCase() === 'small parcel') {
			product[key] = 'Small Parcel';
		}

	}


	return msg;
}


var validateUPCField = (product, key, msg) => {
	var dataPoint = colUtils.keyToCol(key);
	if ((product[key] !== undefined) && (product[key] !== null)) {
		try {
			if ((product[key].length === 0) || (gtin.validate(product[key].toString()) === false)) {
				msg.push(dataPoint + ' must be a valid UPC');
			}
		} catch (e) {
			if (e.message === 'Barcode is not of a valid format') {
				msg.push(dataPoint + ' must be a valid UPC');
			} else {
				throw new Error(e);
			}
		}
	}

	return msg;
}


var validateURLField = (product, key, msg) => {
	var dataPoint = colUtils.keyToCol(key);
	if ((product[key] != undefined) && (product[key] != null) && (product[key].length > 0)) {
		// if (validator.isURL(product[key]) === false) {
		// 	msg.push(dataPoint + ' must be a URL');
		// }
	}

	return msg;
}


var validateYNField = (product, key, msg) => {
	var dataPoint = colUtils.keyToCol(key);
	if ((product[key] != undefined) && (product[key] != null) && (product[key].length > 0)) {
		if (!validator.isIn(product[key], ['Y', 'N', 'y', 'n'])) {
			msg.push(dataPoint + ' must be Y or N');
		}
	}

	return msg;
}



var getAmazonMappings = (jobInfo, worksheetInfo) => {
	return new Promise((resolve, reject) => {
		getStandardMappings(jobInfo, worksheetInfo, 'amazonDatapoint', 3)
			.then((mappings) => {
				resolve(mappings);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



var getCustomMappings = (jobInfo, worksheetInfo) => {
	return new Promise((resolve, reject) => {
		var mappings = {};
		var rsp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};
		var trmCols = [];
		var vendorMappings = [];


		getDatapointValidations()
			.then((results) => {
				mappings = results;


				return getMappings(jobInfo.vendorId, rsp);
			})
			.then((result) => {
				vendorMappings = result.data.vendorColumnMappings;

				var keys = Object.keys(mappings);
				for (var i = 0; i < keys.length; i++) {
					for (var j = 0; j < vendorMappings.length; j++) {
						if (keys[i] === colUtils.colToKey(vendorMappings[j].dataPoint)) {
							mappings[colUtils.colToKey(vendorMappings[j].dataPoint)]['column'] = vendorMappings[j].column;
						}
					}
				}

				// console.log("Custom Mappings: " + JSON.stringify(mappings, undefined, 2));

				resolve(mappings);
			})
			.catch((e) => {
				reject(e);
			})
	});
}




var openWorksheet = async (jobInfo, worksheetInfo) => {
	var contentType = mime.lookup(jobInfo.fileName) || 'application/octet-stream';
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var p = null;

	if (contentType === 'text/csv') {
		p = inputWorkbook.csv.readFile(jobInfo.filePath)
		inputWorksheet = await p;
	} else {
		p = inputWorkbook.xlsx.readFile(jobInfo.filePath);
		inputWorkbook = await p;


		// Skip the 0th element, and then skip over any undefined sheets.
		worksheetInfo.worksheetNumber = 1;
		for (var i = 1; i < inputWorkbook._worksheets.length; i++) {
			if (inputWorkbook._worksheets[i] === undefined) {
				worksheetInfo.worksheetNumber++;
			}
		}
		inputWorksheet = inputWorkbook.getWorksheet(worksheetInfo.worksheetNumber);
	}

	if (inputWorksheet === undefined) {
		throw new Error("Worksheet " + worksheetInfo.worksheetNumber + " doesn't seem to exist in " + jobInfo.fileName);
	}

	console.log(inputWorksheet.rowCount + " " + inputWorksheet.columnCount);


	if (inputWorksheet.rowCount > 30000) {
		throw new Error('Please limit product data to 30,000 rows.');
	}


	return inputWorksheet;
}




var getCustomLabelMappings = async (jobInfo, worksheetInfo) => {
	var mappings = {};
	var rsp = {
		statusCode: 200,
		message: "Success.",
		data: {}
	};
	var trmCols = [];
	var vendorMappings = [];


	//	Get the trm spec sheet info.
	mappings = await getDatapointValidations();

	//	Get the column label mappings.
	var result = await getLabelMappings(jobInfo.vendorId, rsp);
	vendorMappings = result.data.vendorColumnLabelMappings;

	//	Open the sheet.
	var inputWorksheet = await openWorksheet(jobInfo, worksheetInfo);


	//	Find columns in the sheet that match a mapping and add to mappings.
	for (var i = 0; i < vendorMappings.length; i++) {
		if (vendorMappings[i].columnLabel !== null) {
			if (vendorMappings[i].columnLabel.startsWith("'")) {
				mappings[colUtils.colToKey(vendorMappings[i].dataPoint)]['column'] = vendorMappings[i].columnLabel;
			} else {
				for (var j = 1; j <= inputWorksheet.columnCount; j++) {

					var cellText = inputWorksheet.getCell(inputWorksheet.getColumn(j).letter + (worksheetInfo.firstDataRow - 1)).text;
					if (cellText !== null) {
						if (vendorMappings[i].columnLabel.toLowerCase() === cellText.toLowerCase()) {
							mappings[colUtils.colToKey(vendorMappings[i].dataPoint)]['column'] = inputWorksheet.getColumn(j).letter;
						}
					}
				}
			}
		}
	}

	return mappings;
}



var getDatapointValidations = () => {
	return new Promise((resolve, reject) => {
		var prom = [];
		var trmCols = [];


		Vendors.getTRMTemplateColumnInfo()
			.then((results) => {
				trmCols = results;

				var found = false;
				var mappings = {};

				//
				//	Find column mappings and map to TRM datapoint.
				//
				for (var i = 0; i < trmCols.length; i++) {
					found = false;
					mappings[colUtils.colToKey(trmCols[i].dataPoint)] = {
						column: null,
						basicValidation: trmCols[i]['basicValidation'],
						basicValidationMeta: trmCols[i]['basicValidationMeta']
					};
					// if (trmCols[i][dataPointName] != null) {
					// 	for (var j = 1; j <= inputWorksheet.columnCount; j++) {
					// 		if (trmCols[i][dataPointName] === inputWorksheet.getCell(inputWorksheet.getColumn(j).letter + matchRow).text) {
					// 			mappings[colUtils.colToKey(trmCols[i].dataPoint)]['column'] = inputWorksheet.getColumn(j).letter;
					// 			found = true;
					// 			break;
					// 		}
					// 	}

					// 	if (!found) {
					// 		console.log("NOT FOUND: " + trmCols[i].dataPoint + ' ' + inputWorksheet.getCell(inputWorksheet.getColumn(j).letter + matchRow).value);
					// 	}
					// }
				}

				resolve(mappings);
			})
			.catch((e) => {
				reject(e);
			});
	});
}




var getLabelMappings = async (vendorId, resp) => {
	var trmCols = null;
	var sheetInfo = null;

	//	This will have all the defined columns in the template.
	trmCols = await Vendors.getTRMTemplateColumnInfo();

	resp.data.vendorColumnLabelMappings = [];
	var rows = await Vendors.getColumnLabelMappings(vendorId);

	if (rows.rows.length === 0) {
		throw new Error("Vendor set for CUSTOM feed format but no mappings defined.");
	}

	for (var i = 0; i < trmCols.length; i++) {
		var o = {
			id: null,
			label: trmCols[i].label,
			dataPoint: trmCols[i].dataPoint,
			dataPointId: trmCols[i].id,
			columnLabel: null
		}

		var m = rows.rows.find(function (c) {
			if (c.dataPointId === trmCols[i].id) {
				return c.templateColumnLabel.trim();
			}
		})

		if (m !== undefined) {
			o.columnLabel = m.templateColumnLabel;
			o.id = m.id;
		}

		resp.data.vendorColumnLabelMappings.push(o);
	}

	return resp;
}



var getMappings = async (vendorId, resp) => {
	var trmCols = null;
	var sheetInfo = null;

	//	This will have all the defined columns in the template.
	trmCols = await Vendors.getTRMTemplateColumnInfo();

	resp.data.vendorColumnMappings = [];
	var rows = await Vendors.getColumnMappings(vendorId);

	for (var i = 0; i < trmCols.length; i++) {
		var o = {
			id: null,
			label: trmCols[i].label,
			dataPoint: trmCols[i].dataPoint,
			column: null
		}

		var m = rows.rows.find(function (c) {
			if (c.dataPoint === trmCols[i].dataPoint) {
				return c.templateColumn;
			}
		})

		if (m !== undefined) {
			o.column = m.templateColumn;
			o.id = m.id;
		}

		resp.data.vendorColumnMappings.push(o);
	}

	return resp;
}


//
//	Read the header of the spreadsheet and map the datapoints to TRM normalized datapoints.
//
var getStandardMappings = async (jobInfo, worksheetInfo, dataPointName, matchRow) => {
	var contentType = mime.lookup(jobInfo.fileName) || 'application/octet-stream';
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var p = null;
	var trmCols = [];


	//	Get TRM column info.
	trmCols = await Vendors.getTRMTemplateColumnInfo();

	if (contentType === 'text/csv') {
		p = inputWorkbook.csv.readFile(jobInfo.filePath)
		inputWorksheet = await p;
	} else {
		p = inputWorkbook.xlsx.readFile(jobInfo.filePath);
		inputWorkbook = await p;

		//	Skip the 0th element, and then skip over any undefined sheets.
		worksheetInfo.worksheetNumber = 1;
		for (var i = 1; i < inputWorkbook._worksheets.length; i++) {
			if (inputWorkbook._worksheets[i] === undefined) {
				worksheetInfo.worksheetNumber++;
			}
		}
		inputWorksheet = inputWorkbook.getWorksheet(worksheetInfo.worksheetNumber);
	}

	if (inputWorksheet === undefined) {
		throw new Error("Worksheet " + worksheetInfo.worksheetNumber + " doesn't seem to exist in " + jobInfo.fileName);
	}

	if (inputWorksheet.rowCount > 30000) {
		throw new Error('Please limit product data to 30,000 rows.')
	}


	console.log(inputWorksheet.rowCount + " " + inputWorksheet.columnCount);

	var found = false;
	var mappings = {};

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
			for (var j = 1; j <= inputWorksheet.columnCount; j++) {
				if (trmCols[i][dataPointName] === inputWorksheet.getCell(inputWorksheet.getColumn(j).letter + matchRow).text) {
					mappings[colUtils.colToKey(trmCols[i].dataPoint)]['column'] = inputWorksheet.getColumn(j).letter;
					found = true;
					break;
				}
			}

			if (!found) {
				// console.log("NOT FOUND: " + trmCols[i].dataPoint + ' ' + inputWorksheet.getCell(inputWorksheet.getColumn(j).letter + matchRow).value);
			}
		}
	}


	return mappings;
}



var getTRMTemplateInfo = () => {
	return new Promise((resolve, reject) => {
		var templateInfo = null;

		Vendors.getTRMTemplateColumnInfo()
			.then((results) => {
				trmCols = results;
				for (var i = 0; i < trmCols.length; i++) {
					found = false;
					templateInfo[colUtils.colToKey(trmCols[i].dataPoint)] = {
						column: null,
						dbColumn: trmCols[i].dataPoint,
						basicValidation: trmCols[i]['basicValidation'],
						basicValidationMeta: trmCols[i]['basicValidationMeta']
					};
				}

				resolve(templateInfo)

			})
			.catch((e) => {
				reject(e);
			});
	})
}


var getTRMMappings = (jobInfo, worksheetInfo) => {
	return new Promise((resolve, reject) => {
		getStandardMappings(jobInfo, worksheetInfo, 'dataPoint', 1)
			.then((mappings) => {
				resolve(mappings);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



var getWayfairMappings = (jobInfo, worksheetInfo) => {
	return new Promise((resolve, reject) => {
		getStandardMappings(jobInfo, worksheetInfo, 'wayfairHeading', 2)
			.then((mappings) => {
				resolve(mappings);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	Price validation.
//
var newProductPriceValidation = (product, coreRequiredInfo) => {
	var msrp = parseFloat(product.msrp);
	var partnerSellingPrice = parseFloat(product.partnerSellingPrice);
	var inMarketPrice = parseFloat(product.inMarketPrice);
	var shipToMarketPrice = parseFloat(product.shipToMarketPrice);

	if ((!isNaN(msrp)) && (!isNaN(partnerSellingPrice))) {
		if (msrp < partnerSellingPrice) {
			coreRequiredInfo.push({
				error: "invalid",
				field: "msrp",
				text: "MSRP should be >= partner selling price."
			});
		}
	}

	if ((!isNaN(partnerSellingPrice)) && (!isNaN(inMarketPrice))) {
		if (partnerSellingPrice <= inMarketPrice) {
			coreRequiredInfo.push({
				error: "invalid",
				field: "partnerSellingPrice",
				text: "Partner selling price should be > in-market price."
			});
		}
	}

	//
	//	Removing this check per RM-2807.
	//
	// if ((!isNaN(partnerSellingPrice)) && (!isNaN(shipToMarketPrice))) {
	// 	if (partnerSellingPrice <= shipToMarketPrice) {
	// 		coreRequiredInfo.push({
	// 			error: "invalid",
	// 			field: "partnerSellingPrice",
	// 			text: "Partner selling price should be > ship to market price."
	// 		});
	// 	}
	// }
}



var logChanges = async (id, type, productId, existingProduct, updateInfo) => {

	Object.keys(updateInfo.newProduct).forEach(function (key) {
		// console.log(key + " old " + existingProduct[key] + " new " + updateInfo.newProduct[key]);

		if (((existingProduct[key] === null) && (updateInfo.newProduct[key] !== null)) ||
			((existingProduct[key] === undefined) && (updateInfo.newProduct[key] !== undefined)) ||
			((existingProduct[key] !== null) && (updateInfo.newProduct[key] === null)) ||
			((existingProduct[key] !== null) && (updateInfo.newProduct[key] !== null) &&
			(existingProduct[key].toString() !== updateInfo.newProduct[key].toString()))) {
			// console.log(key);
			switch (key) {
				case 'productCost':
					// console.log(`MSRP: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PRODUCT_COST', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'msrp':
					// console.log(`MSRP: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'MSRP', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'mapPrice':
					// console.log(`MAP: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'MAP', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'inMarketPrice':
					// console.log(`RUSH_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'RUSH_PRICE', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shipToMarketPrice':
					// console.log(`DROP_SHIP_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'DROP_SHIP_PRICE', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'partnerSellingPrice':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'COMPARE_PRICE', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'mainImageKnockout':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'MAIN_IMAGE_KNOCKOUT', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'mainImageLifestyle':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'MAIN_IMAGE_LIFESTYLE', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'altImage3':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ALT_IMAGE3', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'altImage4':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ALT_IMAGE4', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'altImage5':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ALT_IMAGE5', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'swatchImage6':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SWATCH_IMAGE6', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'productDescription':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PRODUCT_DESCRIPTION', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'bulletPoint1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'BULLET_POINT1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'bulletPoint2':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'BULLET_POINT2', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'bulletPoint3':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'BULLET_POINT3', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'bulletPoint4':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'BULLET_POINT4', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'dropshipInventory':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'DROPSHIP_INVENTORY', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'productName':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PRODUCT_NAME', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'manufacturer':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'MANUFACTURER', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'brandName':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'BRAND_NAME', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'primaryCategory':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PRIMARY_CATEGORY', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'secondaryCategory':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SECONDARY_CATEGORY', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'styleTag1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'STYLE_TAG1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'styleTag2':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'STYLE_TAG2', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'productCost':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PRODUCT_COST', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'upc':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'UPC', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'mpn':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'MPN', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'primaryColor':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PRIMARY_COLOR', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'colorSpecific':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'COLOR_SPECIFIC', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'primaryMaterial':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PRIMARY_MATERIAL', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'secondaryMaterial':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SECONDARY_MATERIAL', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'materialSpecific':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'MATERIAL_SPECIFIC', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'assemblyReqd':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ASSEMBLY_REQD', existingProduct[key], updateInfo.newProduct[key]);
					break;

					// 	case 'ASSEMBLY_INST':
					// // console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					// Vendors.logChange(id, type, productId, 'SECONDARY_MATERIAL', existingProduct[key], updateInfo.newProduct[key]);
					// break;

				case 'seatingCapacity':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SEATING_CAPACITY', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeName1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_NAME1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeValue1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_VALUE1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeName2':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_NAME2', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeValue2':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_VALUE2', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeName3':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_NAME3', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeValue3':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_VALUE3', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeName4':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_NAME4', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeValue4':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_VALUE4', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeName5':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_NAME5', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeValue5':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_VALUE5', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeName6':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_NAME6', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'attributeValue6':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'ATTRIBUTE_VALUE6', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shipType':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIP_TYPE', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'numberOfBoxes':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'NUMBER_OF_BOXES', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'quantityPerCarton':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'QUANTITY_PER_CARTON', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'freightClass':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'FREIGHT_CLASS', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'cstCutoff':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'CST_CUTOFF', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'leadTime':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'LEAD_TIME', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength1':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH1', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight2':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT2', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight2':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT2', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth2':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH2', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength2':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH2', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight3':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT3', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight3':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT3', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth3':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH3', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength3':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH3', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight4':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT4', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight4':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT4', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth4':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH4', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength4':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH4', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight5':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT5', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight5':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT5', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth5':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH5', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength5':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH5', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight6':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT6', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight6':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT6', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth6':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH6', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength6':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH6', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight7':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT7', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight7':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT7', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth7':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH7', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength7':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH7', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight8':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT8', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight8':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT8', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth8':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH8', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength8':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH8', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight9':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT9', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight9':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT9', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth9':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH9', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength9':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH9', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight10':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT10', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight10':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT10', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth10':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH10', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength10':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH10', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight11':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT11', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight11':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT11', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth11':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH11', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength11':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH11', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight12':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT12', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight12':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT12', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth12':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH12', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength12':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH12', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight13':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT13', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight13':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT13', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth13':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH13', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength13':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH13', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight14':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT14', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight14':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT14', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth14':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH14', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength14':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH14', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight15':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT15', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight15':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT15', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth15':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH15', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength15':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH15', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight16':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT16', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight16':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT16', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth17':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH17', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength17':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH17', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight18':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT18', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight18':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT18', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth18':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH18', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength18':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH18', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight19':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT19', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight19':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT19', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth19':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH19', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength19':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH19', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'shippingWeight20':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'SHIPPING_WEIGHT20', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageHeight20':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_HEIGHT20', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageWidth20':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_WIDTH20', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'packageLength20':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PACKAGE_LENGTH20', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'countryManufacture':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'COUNTRY_MANUFACTURE', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'nmfcCode':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'NMFC_CODE', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'partialItem':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PARTIAL_ITEM', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'prop65':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PROP65', existingProduct[key], updateInfo.newProduct[key]);
					break;

				case 'prop65Chemicals':
					// console.log(`COMPARE_PRICE: ${existingProduct[key]} ${updateInfo.newProduct[key]}`);
					Vendors.logChange(id, type, productId, 'PROP65_CHEMICALS', existingProduct[key], updateInfo.newProduct[key]);
					break;

			}
		}
	});

}


var orchestrateUpdate = async (existingProduct, newProduct, schema) => {
	var updateInfo = {};

	//	Retrieve validation rules.
	var validations = await getDatapointValidations();

	//	Merge updates into existing product so all fields are populated.
	var product = mergeProductChanges(existingProduct, newProduct);

	var validationErrors = await validateProduct(validations, product, schema);
	updateInfo.validationErrors = validationErrors;

	//	Verify product against eligibility requirements and update flags/status.
	updateInfo.product = await verifyEligibility(product, existingProduct);
	updateInfo.newProduct = newProduct;

	return updateInfo;
}



//
//	Verify eligibility and set flags on product as appropriate.  Also reconstructs searchField.
//
var verifyEligibility = async (product, oldProduct) => {

	//	Check to see if we've achieved or lost core eligibility, which will dictate status.
	var coreRequiredInfo = [];
	coreRequiredInfo = verifyCoreEligibility(coreRequiredInfo, product);

	var coreValidationErrors = {
		errorDetails: [],
		message: ""
	}
	coreValidationErrors = validationUtils.finalizeValidationErrors(coreValidationErrors, coreRequiredInfo, []);


	//	See if we need to change the status of the product.
	if (coreRequiredInfo.length > 0) {
		product.status = 'STUB';
	} else {
		if (oldProduct === undefined) {
			product.status = 'ACTIVE';
		} else if (oldProduct.status === 'STUB') {
			product.status = 'ACTIVE';
		}
	}



	product.eligibleForTrm = false;
	product.eligibleForDropship = false;
	// product.eligibleForLimitedQuantityDropship = false;
	product.eligibleForInline = false;
	product.eligibleForBulkBuys = false;
	product.eligibleForOffPrice = false;
	product.eligibleForCostBasedReturns = false;
	product.eligibleForRevShareReturns = false;


	var inlineRequiredInfo = [];
	inlineRequiredInfo = verifyInlineEligibility(inlineRequiredInfo, product);

	var inlineValidationErrors = {
		errorDetails: [],
		message: ""
	}
	inlineValidationErrors = validationUtils.finalizeValidationErrors(inlineValidationErrors, inlineRequiredInfo, []);

	if ((product.status != 'STUB') && (inlineValidationErrors.message.length === 0)) {
		product.eligibleForInline = true;
	}


	var bulkBuysRequiredInfo = [];
	bulkBuysRequiredInfo = verifyBulkBuysEligibility(bulkBuysRequiredInfo, product);

	var bulkBuysValidationErrors = {
		errorDetails: [],
		message: ""
	}
	bulkBuysValidationErrors = validationUtils.finalizeValidationErrors(bulkBuysValidationErrors, bulkBuysRequiredInfo, []);

	if ((product.status != 'STUB') && (bulkBuysValidationErrors.message.length === 0)) {
		product.eligibleForBulkBuys = true;
	}


	var offPriceRequiredInfo = [];
	offPriceRequiredInfo = verifyOffPriceEligibility(offPriceRequiredInfo, product);

	var offPriceValidationErrors = {
		errorDetails: [],
		message: ""
	}
	offPriceValidationErrors = validationUtils.finalizeValidationErrors(offPriceValidationErrors, offPriceRequiredInfo, []);

	if ((product.status != 'STUB') && (offPriceValidationErrors.message.length === 0)) {
		product.eligibleForOffPrice = true;
	}


	var costBasedReturnsRequiredInfo = [];
	costBasedReturnsRequiredInfo = verifyCostBasedReturnsEligibility(costBasedReturnsRequiredInfo, product);

	var costBasedReturnsValidationErrors = {
		errorDetails: [],
		message: ""
	}
	costBasedReturnsValidationErrors = validationUtils.finalizeValidationErrors(costBasedReturnsValidationErrors, costBasedReturnsRequiredInfo, []);

	if ((product.status != 'STUB') && (costBasedReturnsValidationErrors.message.length === 0)) {
		product.eligibleForCostBasedReturns = true;
	}


	var revShareReturnsRequiredInfo = [];
	revShareReturnsRequiredInfo = verifyRevShareReturnsEligibility(revShareReturnsRequiredInfo, product);

	var revShareReturnsValidationErrors = {
		errorDetails: [],
		message: ""
	}
	revShareReturnsValidationErrors = validationUtils.finalizeValidationErrors(revShareReturnsValidationErrors, revShareReturnsRequiredInfo, []);

	if ((product.status != 'STUB') && (revShareReturnsValidationErrors.message.length === 0)) {
		product.eligibleForRevShareReturns = true;
	}

	var vendor = await Vendors.getById(product.vendorId);

	var trmRequiredInfo = [];
	trmRequiredInfo = verifyTRMEligibility(trmRequiredInfo, product, vendor[0]);

	var trmValidationErrors = {
		errorDetails: [],
		message: ""
	}
	trmValidationErrors = validationUtils.finalizeValidationErrors(trmValidationErrors, trmRequiredInfo, []);


	var dropshipRequiredInfo = [];
	dropshipRequiredInfo = verifyDropshipEligibility(dropshipRequiredInfo, product, vendor[0]);

	var dropshipValidationErrors = {
		errorDetails: [],
		message: ""
	}
	dropshipValidationErrors = validationUtils.finalizeValidationErrors(dropshipValidationErrors, dropshipRequiredInfo, []);


	// var limitedQuantityDropshipRequiredInfo = [];
	// limitedQuantityDropshipRequiredInfo = verifyLimitedQuantityDropshipEligibility(limitedQuantityDropshipRequiredInfo, product, vendor[0]);

	// var limitedQuantityDropshipValidationErrors = {
	// 	errorDetails: [],
	// 	message: ""
	// }
	// limitedQuantityDropshipValidationErrors = validationUtils.finalizeValidationErrors(limitedQuantityDropshipValidationErrors, limitedQuantityDropshipRequiredInfo, []);


	//	If this isn't a stub and passes TRM eligibility, trip flag.
	if ((product.status != 'STUB') &&
		(product.eligibleForInline || product.eligibleForBulkBuys || product.eligibleForOffPrice || product.eligibleForCostBasedReturns || product.eligibleForRevShareReturns) &&
		(trmValidationErrors.message.length === 0)) {
		product.eligibleForTrm = true;
	} else if ((!product.eligibleForInline || !product.eligibleForBulkBuys || !product.eligibleForOffPrice || !product.eligibleForCostBasedReturns || !product.eligibleForRevShareReturns) &&
		(trmValidationErrors.message.length === 0)) {
		trmValidationErrors.message = "Must be eligible for inline, bulk buys, off price, cost based returns or rev share returns.";
	}

	// if ((product.status != 'STUB') &&
	// 	(product.eligibleForInline || product.eligibleForBulkBuys || product.eligibleForOffPrice || product.eligibleForCostBasedReturns || product.eligibleForRevShareReturns) &&
	// 	(limitedQuantityDropshipValidationErrors.message.length === 0)) {
	// 	product.eligibleForLimitedQuantityDropship = true;
	// }


	if ((product.status != 'STUB') &&
		(product.eligibleForInline || product.eligibleForBulkBuys || product.eligibleForOffPrice || product.eligibleForCostBasedReturns || product.eligibleForRevShareReturns) &&
		(dropshipValidationErrors.message.length === 0)) {
		product.eligibleForDropship = true;
	}

	product.coreEligibilityErrors = ((coreValidationErrors.message.length > 0) ? JSON.stringify(coreValidationErrors) : null);
	product.trmEligibilityErrors = ((trmValidationErrors.message.length > 0) ? JSON.stringify(trmValidationErrors) : null);
	product.dropshipEligibilityErrors = ((dropshipValidationErrors.message.length > 0) ? JSON.stringify(dropshipValidationErrors) : null);
	// product.limitedQuantityDropshipEligibilityErrors = ((limitedQuantityDropshipValidationErrors.message.length > 0) ? JSON.stringify(limitedQuantityDropshipValidationErrors) : null);
	product.inlineEligibilityErrors = ((inlineValidationErrors.message.length > 0) ? JSON.stringify(inlineValidationErrors) : null);
	product.bulkBuysEligibilityErrors = ((bulkBuysValidationErrors.message.length > 0) ? JSON.stringify(bulkBuysValidationErrors) : null);
	product.offPriceEligibilityErrors = ((offPriceValidationErrors.message.length > 0) ? JSON.stringify(offPriceValidationErrors) : null);
	product.costBasedReturnsEligibilityErrors = ((costBasedReturnsValidationErrors.message.length > 0) ? JSON.stringify(costBasedReturnsValidationErrors) : null);
	product.revShareReturnsEligibilityErrors = ((revShareReturnsValidationErrors.message.length > 0) ? JSON.stringify(revShareReturnsValidationErrors) : null);

	var searchField = '';
	if (product.vendorSku != undefined) {
		searchField = searchField + product.vendorSku;
	} else if ((oldProduct != undefined) && (oldProduct.vendorSku != undefined)) {
		searchField = searchField + oldProduct.vendorSku;
	}
	if (product.upc != undefined) {
		searchField = searchField + product.upc;
	} else if ((oldProduct != undefined) && (oldProduct.upc != undefined)) {
		searchField = searchField + oldProduct.upc;
	}
	if (product.mpn != undefined) {
		searchField = searchField + product.mpn;
	} else if ((oldProduct != undefined) && (oldProduct.mpn != undefined)) {
		searchField = searchField + oldProduct.mpn;
	}
	if (product.productName != undefined) {
		searchField = searchField + product.productName;
	} else if ((oldProduct != undefined) && (oldProduct.productName != undefined)) {
		searchField = searchField + oldProduct.productName;
	}
	if (product.primaryMaterial != undefined) {
		searchField = searchField + product.primaryMaterial;
	} else if ((oldProduct != undefined) && (oldProduct.primaryMaterial != undefined)) {
		searchField = searchField + oldProduct.primaryMaterial;
	}
	if (product.primaryColor != undefined) {
		searchField = searchField + product.primaryColor;
	} else if ((oldProduct != undefined) && (oldProduct.primaryColor != undefined)) {
		searchField = searchField + oldProduct.primaryColor;
	}
	if (product.primaryCategory != undefined) {
		searchField = searchField + product.primaryCategory;
	} else if ((oldProduct != undefined) && (oldProduct.primaryCategory != undefined)) {
		searchField = searchField + oldProduct.primaryCategory;
	}
	if (product.secondaryCategory != undefined) {
		searchField = searchField + product.secondaryCategory;
	} else if ((oldProduct != undefined) && (oldProduct.secondaryCategory != undefined)) {
		searchField = searchField + oldProduct.secondaryCategory;
	}
	if (product.brandName != undefined) {
		searchField = searchField + product.brandName;
	} else if ((oldProduct != undefined) && (oldProduct.brandName != undefined)) {
		searchField = searchField + oldProduct.brandName;
	}
	if (product.styleTag1 != undefined) {
		searchField = searchField + product.styleTag1;
	} else if ((oldProduct != undefined) && (oldProduct.styleTag1 != undefined)) {
		searchField = searchField + oldProduct.styleTag1;
	}
	if (product.styleTag2 != undefined) {
		searchField = searchField + product.styleTag2;
	} else if ((oldProduct != undefined) && (oldProduct.styleTag2 != undefined)) {
		searchField = searchField + oldProduct.styleTag2;
	}
	product.searchField = searchField;

	return product;
}


module.exports = {
	checkForDuplicateVendorSkus,
	existingProductPriceValidation,
	getAmazonMappings,
	getCustomMappings,
	getCustomLabelMappings,
	getDatapointValidations,
	getMappings,
	getLabelMappings,
	getProductSchema,
	getStandardMappings,
	getTRMMappings,
	getTRMTemplateInfo,
	getWayfairMappings,
	initializeParseProduct,
	logChanges,
	mergeProductChanges,
	newProductPriceValidation,
	orchestrateUpdate,
	validateCountryField,
	validateCSTField,
	validateDecimalField,
	validateFieldPopulated,
	validateIntegerField,
	validateIntegerRangeField,
	validateProduct,
	validateShipTypeField,
	validateUPCField,
	validateYNField,
	verifyBulkBuysEligibility,
	verifyCoreEligibility,
	verifyDropshipEligibility,
	verifyEligibility,
	verifyInlineEligibility,
	verifyOffPriceEligibility,
	verifyRevShareReturnsEligibility,
	verifyCostBasedReturnsEligibility,
	verifyTRMEligibility
}