'use strict';

const _ = require('lodash');
const check = require('check-types');
const excel = require('exceljs');
const fs = require('fs-extra');
const moment = require('moment');
const path = require('path');
const url = require('url');
const PDFDoc = require('pdfkit');
const { promisify } = require('util');
const sleep = promisify(setTimeout);


const comms = require('../utils/comms');
const fileUtils = require('../utils/fileUtils');
const sqlUtils = require('../utils/sqlUtils');
const logUtils = require('../utils/logUtils');
const vendorUtils = require('../utils/vendorUtils');

const carrierSelectionActions = require('../actions/carrierSelection');
const CategoryProductActions = require('../actions/categoryProducts');
const marketActions = require('../actions/markets');
const imageActions = require('../actions/images');
const memberActions = require('../actions/members');
const SearchProductActions = require('../actions/searchProducts');

const AdhocEmail = require('../models/adhocEmail');
const AttributeNames = require('../models/attributes');
const Categories = require('../models/categories');
const Coins = require('../models/coins');
const GDE = require('../models/gdeModel');
const Mandrill = require('../models/mandrill');
const Manifests = require('../models/manifests');
const MasterData = require('../models/masterData');
const Members = require('../models/members');
const MembersToMove = require('../models/membersToMove');
const MembersToTag = require('../models/membersToTag');
const Products = require('../models/products');
const RushOrders = require('../models/rushOrders');
const SearchProducts = require('../models/searchProducts');
const ShopifyQueues = require('../models/shopifyQueues');
const Stores = require('../models/stores');
const Taxonomies = require('../models/taxonomies');
const Vendors = require('../models/vendors');

const catalogParseUtils = require('../utils/catalogParseUtils');
const configUtils = require('../utils/configUtils');
const exportUtils = require('../utils/exportUtils');
const { createMemberAlias } = require('../utils/memberUtils');
const parseUtils = require('../utils/parseUtils');
const { formatResp } = require('../utils/response');
const { createVendorPrefix } = require('../utils/vendorUtils');



const CHAR_SPACING = 6;
const LINE_ITEM_HEIGHT = 10;
const LINE_ITEM_Y_START = 260;
const TOTAL_X = 495;

var holidays = [];



//
//	Average Ship Cost By 
//
var averageShippingByCategory = async (req, resp) => {
	var avgs = await GDE.getAverageShippingByCategory();

	for (var i=0; i < avgs.length; i++) {
		await Categories.storeAverageShipping(avgs[i].categoryId, avgs[i].avgShipCost);
	}

	return resp;
}


//
//	Capture D and P messaging post-order
//
var captureDnPMessaging = async (req, resp) => {
	var carrier = null;
	var edd = null;
	var eddText = null;
	var estimatedShipCost = null;
	var estimatedShipDate = null;
	var ripple = null;
	var js = null;

	await RushOrders.pruneOrdersToCapture();


	var orders = await RushOrders.getOrdersToCapture();


	for (var i = 0; i < orders.length; i++) {

		var order = await RushOrders.getOrderCaptureDetail(orders[i].shopifyOrderId);

		var lineItemsCaptured = 0;

		for (var j = 0; j < order.length; j++) {
			edd = null;
			eddText = null;
			js = null;
			var csResp = {
				statusCode: 200,
				message: 'Success.',
				data: {}
			};


			if (order[j].fulfillmentMethod === '') {
				await RushOrders.removeOrderToBeCaptured(orders[i].shopifyOrderId);
			} else if (order[j].shipType !== null) {
				csResp = await carrierSelectionActions.get([order[j].sku], order[j].zip, csResp);
				if ((csResp !== undefined) && (csResp.statusCode === 200) && (csResp.data.carriers.length > 0)) {
					if (csResp.data.carriers[0].carrier === 'National') {
						if (order[j].shipType === 'Small Parcel') {
							carrier = 'FedEx';
						} else {
							carrier = 'Estes';
						}
					} else {
						carrier = 'Local';
					}
				}

				if (order[j].contextActive !== null) {
					js = JSON.parse(order[j].contextActive);
				} else {
					js = JSON.parse(order[j].contextHistory);
				}
				if (js !== null) {
					edd = js.edd;
					eddText = js.eddText;

					if (js.ripple) {
						ripple = js.ripple;
					}

					if (js.estimatedShipCost) {
						estimatedShipCost = js.estimatedShipCost;
					}

					if (js.estimatedShipDate) {
						estimatedShipDate = js.estimatedShipDate;
					}
				}

				if (edd !== null) {
					await RushOrders.captureDnPMessaging(orders[i].shopifyOrderId, order[j].sourceLineId, order[j].shipType, carrier, edd, eddText, estimatedShipCost, estimatedShipDate, ripple);
					lineItemsCaptured++;
				}

				if (lineItemsCaptured == order.length) {
					await RushOrders.removeOrderToBeCaptured(orders[i].shopifyOrderId)
				}
			}

			// console.log("order: " + orders[i].sourceOrderId + " line: " + orders[i].sourceLineId);
			// console.log("sku: " + orders[i].sku + " origin: " + orders[i].originCityId + " dest: " + orders[i].destCityId + " zip: " + orders[i].zip + " shipType: " + orders[i].shipType + " edd: " + edd + " eddText: " + eddText + " carrier: " + carrier);
		}
	}

	return resp;
}





//
//	Copy COINs To Coreleap
//
var copyCoinsToCoreleap = async (req, resp) => {
	var offset = 0;
	var chunkSize = (configUtils.get("COIN_COPY_CHUNK") !== null) ? parseInt(configUtils.get("COIN_COPY_CHUNK")) : 500;
	var timeoutHours = (configUtils.get("COIN_COPY_TIMEOUT_HOURS") !== null) ? parseInt((configUtils.get("COIN_COPY_TIMEOUT_HOURS") !== null)) : 24;


	await Coins.pruneCoinCopyActives();
	await Coins.timeoutCoinCopyActives(timeoutHours);

	var active = await Coins.getCoinCopyActives();
	if (active.length >= 2) {
		return resp;
	}

	var uuid = new Date().getTime().toString(16).toUpperCase();
	var result = await Coins.createCoreleapTemp(uuid);

	console.log("Before copy: " + new Date().getTime());
	result = await Coins.getCoinCopyChunk(offset, chunkSize);
	while (result.length > 0) {
		await Coins.writeCoinCopyChunk(uuid, result);
		resp.count += result.length;
		offset += result.length;
		result = await Coins.getCoinCopyChunk(offset, chunkSize);
	}
	console.log("After copy: " + new Date().getTime());

	console.log("Before swap: " + new Date().getTime());
	result = await Coins.getTempCount(uuid);

	if (result.length > 0) {
		if (result[0].num > configUtils.get("COIN_COPY_MIN_ROWS")) {
			result = await Coins.swapCoreleapTemp(uuid);
		}
		else {
			logUtils.log({
				severity: 'ERROR',
				type: 'C2V',
				message: 'Failed to meet minimum to overwrite coins_to_vskus',
				sessionId: null,
				stackTrace: null
			})
		}	
	}
	console.log("After swap: " + new Date().getTime());

	return resp;
}




//
//	Copy Vendors To Coreleap
//
var copyVendorsToCoreleap = async (req, resp) => {
	var result = await Vendors.createCoreleapTemp();

	console.log("Before copy: " + new Date().getTime());
	result = await Vendors.getSummary();
	await Vendors.writeSummary(result);
	console.log("After copy: " + new Date().getTime());

	console.log("Before swap: " + new Date().getTime());
	result = await Vendors.swapCoreleapTemp();
	console.log("After swap: " + new Date().getTime());

	return resp;
}






//
//	Data Integrity Report
//
var dataIntegrity = async (req, resp) => {
	var prom = [];
	var reportFilename = 'data-integrity-' + moment().format("YYYY-MM-DD-HH-mm") + ".xlsx";
	var reportWorkbook = new excel.Workbook();
	var reportWorksheet = null;



	prom.push(vendorUtils.validateUPCs(10000));
	prom.push(vendorUtils.sameUPCIssues(10000));
	prom.push(Coins.getDiscrepancies(false));

	var results = await Promise.all(prom);

	resp.data.UPCs = results[0];
	resp.data.vendorsWithDuplicateUPCs = results[1];
	resp.data.coinDiscrepancies = results[2];

	buildSummaryTab(reportWorkbook, resp);
	buildInvalidUPCsTab(reportWorkbook, resp);
	buildMissingUPCsTab(reportWorkbook, resp);
	buildVendorDupeUPCsTab(reportWorkbook, resp);
	buildUPCsMultipleMPNsTab(reportWorkbook, resp);
	buildNoVendorSkuCoinMapTab(reportWorkbook, resp);
	buildInvalidCoinVendorSkuMapTab(reportWorkbook, resp);
	buildNoMPNCoinMapTab(reportWorkbook, resp);
	buildInvalidCoinMPNMapTab(reportWorkbook, resp);
	buildOrphanedCoinUPCTab(reportWorkbook, resp);
	buildOrphanedCoinMPNTab(reportWorkbook, resp);
	buildOrphanedCoinVendorSkuTab(reportWorkbook, resp);


	await reportWorkbook.xlsx.writeFile('sheets/' + reportFilename);

	comms.sendEmail(process.env.DATA_INTEG_EMAIL ? process.env.DATA_INTEG_EMAIL : 'matt@rushmarket.com', 'Data Integrity Report', 'See Attached', 'See Attached', 'noreply@rushmarket.com', undefined, undefined, reportFilename, 'sheets/' + reportFilename);


	return resp;
}


//
//	Data Check Notifications
//
var dataCheckNotifications = async (req, resp) => {
	var rows = await GDE.getDataCheck();

	for (var i = 0; i < rows.length; i++) {
		comms.sendEmail((configUtils.get("GDE_DATA_CHECK_EMAIL") !== null) ? configUtils.get("GDE_DATA_CHECK_EMAIL") : 'matt@rushmarket.com', 'GDE Data Check', '', `This SKU failed GDE calc and may have data issues.  <br><br><b>SKU:</b> ${rows[i].sku}<br><b>Message:</b> ${rows[i].message}`, 'noreply@rushmarket.com', undefined, undefined);
	}

	await GDE.markDataCheckNotified(rows);


	return resp;
}



var buildInvalidCoinMPNMapTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('Invalid COIN MPN Map');
	var row = 1;

	reportWorksheet.getCell('A' + row).value = "COIN ID";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('B' + row).value = "Manufacturer";
	reportWorksheet.getCell('B' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('C' + row).value = "MPN";
	reportWorksheet.getCell('C' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.coinDiscrepancies.invalidMPNMap.length; i++) {
		reportWorksheet.getCell('A' + row).value = resp.data.coinDiscrepancies.invalidMPNMap[i].coinId;
		reportWorksheet.getCell('B' + row).value = resp.data.coinDiscrepancies.invalidMPNMap[i].manufacturer;
		reportWorksheet.getCell('C' + row).value = resp.data.coinDiscrepancies.invalidMPNMap[i].mpn;
		row++;
	}
}



var buildInvalidCoinVendorSkuMapTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('Invalid COIN Vendor SKU Map');
	var row = 1;

	reportWorksheet.getCell('A' + row).value = "COIN ID";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('B' + row).value = "Vendor ID";
	reportWorksheet.getCell('B' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('C' + row).value = "Vendor SKU";
	reportWorksheet.getCell('C' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.coinDiscrepancies.invalidVendorSkuMap.length; i++) {
		reportWorksheet.getCell('A' + row).value = resp.data.coinDiscrepancies.invalidVendorSkuMap[i].coinId;
		reportWorksheet.getCell('B' + row).value = resp.data.coinDiscrepancies.invalidVendorSkuMap[i].vendorId;
		reportWorksheet.getCell('C' + row).value = resp.data.coinDiscrepancies.invalidVendorSkuMap[i].vendorSku;
		row++;
	}
}



var buildInvalidUPCsTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('Invalid UPCs');
	var row = 1;
	reportWorksheet.getCell('A' + row).value = "Vendor Name";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('B' + row).value = "Vendor SKU";
	reportWorksheet.getCell('B' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('C' + row).value = "Product Name";
	reportWorksheet.getCell('C' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('D' + row).value = "UPC";
	reportWorksheet.getCell('D' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.UPCs.invalidUPC.length; i++) {
		reportWorksheet.getCell('A' + row).value = resp.data.UPCs.invalidUPC[i].vendorName;
		reportWorksheet.getCell('B' + row).value = resp.data.UPCs.invalidUPC[i].vendorSku;
		reportWorksheet.getCell('C' + row).value = resp.data.UPCs.invalidUPC[i].productName;
		reportWorksheet.getCell('D' + row).value = resp.data.UPCs.invalidUPC[i].upc;
		row++;
	}
}



var buildMissingUPCsTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('Missing UPCs');
	var row = 1;

	reportWorksheet.getCell('A' + row).value = "Vendor Name";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('B' + row).value = "Vendor SKU";
	reportWorksheet.getCell('B' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.UPCs.nullUPC.length; i++) {
		reportWorksheet.getCell('A' + row).value = resp.data.UPCs.nullUPC[i].vendorName;
		reportWorksheet.getCell('B' + row).value = resp.data.UPCs.nullUPC[i].vendorSku;
		row++;
	}



}


var buildNoMPNCoinMapTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('No MPN COIN Map');
	var row = 1;

	reportWorksheet.getCell('A' + row).value = "UPC";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('B' + row).value = "Vendor Name";
	reportWorksheet.getCell('B' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('C' + row).value = "Vendor SKU";
	reportWorksheet.getCell('C' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('D' + row).value = "Manufacturer";
	reportWorksheet.getCell('D' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('E' + row).value = "MPN";
	reportWorksheet.getCell('E' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.coinDiscrepancies.productsNoCoinManuMPN.length; i++) {
		reportWorksheet.getCell('A' + row).value = resp.data.coinDiscrepancies.productsNoCoinManuMPN[i].upc;
		reportWorksheet.getCell('B' + row).value = resp.data.coinDiscrepancies.productsNoCoinManuMPN[i].vendorName;
		reportWorksheet.getCell('C' + row).value = resp.data.coinDiscrepancies.productsNoCoinManuMPN[i].vendorSku;
		reportWorksheet.getCell('D' + row).value = resp.data.coinDiscrepancies.productsNoCoinManuMPN[i].manufacturer;
		reportWorksheet.getCell('E' + row).value = resp.data.coinDiscrepancies.productsNoCoinManuMPN[i].mpn;
		row++;
	}
}



var buildNoVendorSkuCoinMapTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('SKU with No Vendor SKU COIN Map');
	var row = 1;

	reportWorksheet.getCell('A' + row).value = "UPC";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('B' + row).value = "Vendor Name";
	reportWorksheet.getCell('B' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('C' + row).value = "Vendor SKU";
	reportWorksheet.getCell('C' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('D' + row).value = "Manufacturer";
	reportWorksheet.getCell('D' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('E' + row).value = "MPN";
	reportWorksheet.getCell('E' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.coinDiscrepancies.productsNoCoinVendorSku.length; i++) {
		reportWorksheet.getCell('A' + row).value = resp.data.coinDiscrepancies.productsNoCoinVendorSku[i].upc;
		reportWorksheet.getCell('B' + row).value = resp.data.coinDiscrepancies.productsNoCoinVendorSku[i].vendorName;
		reportWorksheet.getCell('C' + row).value = resp.data.coinDiscrepancies.productsNoCoinVendorSku[i].vendorSku;
		reportWorksheet.getCell('D' + row).value = resp.data.coinDiscrepancies.productsNoCoinVendorSku[i].manufacturer;
		reportWorksheet.getCell('E' + row).value = resp.data.coinDiscrepancies.productsNoCoinVendorSku[i].mpn;
		row++;
	}
}



var buildOrphanedCoinMPNTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('Orphaned COINs In MPN');
	var row = 1;

	reportWorksheet.getCell('A' + row).value = "COIN ID";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.coinDiscrepancies.orphanedCoinMPN.length; i++) {
		reportWorksheet.getCell('A' + row).value = resp.data.coinDiscrepancies.orphanedCoinMPN[i].coinId;
		row++;
	}
}



var buildOrphanedCoinUPCTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('Orphaned COINs In UPC');
	var row = 1;

	reportWorksheet.getCell('A' + row).value = "COIN ID";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.coinDiscrepancies.orphanedCoinUPC.length; i++) {
		reportWorksheet.getCell('A' + row).value = resp.data.coinDiscrepancies.orphanedCoinUPC[i].coinId;
		row++;
	}
}



var buildOrphanedCoinVendorSkuTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('Orphaned COINs In Vendor Sku');
	var row = 1;

	reportWorksheet.getCell('A' + row).value = "COIN ID";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.coinDiscrepancies.orphanedCoinVendorSku.length; i++) {
		reportWorksheet.getCell('A' + row).value = resp.data.coinDiscrepancies.orphanedCoinVendorSku[i].coinId;
		row++;
	}
}



var buildSummaryTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('Summary');
	reportWorksheet.getCell('A1').value = "Valid UPCs";
	reportWorksheet.getCell('A1').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B1').value = resp.data.UPCs.validUPCs;
	// reportWorksheet.getCell('B1').numFmt = '#,';
	reportWorksheet.getCell('A2').value = {
		text: 'Vendor SKUs Missing UPCs',
		hyperlink: "#'Missing UPCs'!A1"
	};
	reportWorksheet.getCell('A2').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B2').value = resp.data.UPCs.nullUPCs;
	reportWorksheet.getCell('A3').value = {
		text: "Vendor SKUs with Invalid UPCs",
		hyperlink: "#'Invalid UPCs'!A1"
	};
	reportWorksheet.getCell('A3').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B3').value = resp.data.UPCs.invalidUPCs;

	reportWorksheet.getCell('A5').value = {
		text: "Vendors With Multiple SKUs w/ Same UPC",
		hyperlink: "#'Vendor SKUs Dupe UPCs'!A1"
	};
	reportWorksheet.getCell('A5').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B5').value = resp.data.vendorsWithDuplicateUPCs.vendorsWithDupeUPCs;
	reportWorksheet.getCell('A6').value = {
		text: "UPCs w/ Multiple MPNs",
		hyperlink: "#'UPCs with Multiple MPNs'!A1"
	};
	reportWorksheet.getCell('A6').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B6').value = resp.data.vendorsWithDuplicateUPCs.upcsWithMultipleMPNs;

	reportWorksheet.getCell('A8').value = {
		text: "Products w/ No Vendor SKU COIN Mapping",
		hyperlink: "#'SKU with No Vendor SKU COIN Map'!A1"
	};
	reportWorksheet.getCell('A8').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B8').value = resp.data.coinDiscrepancies.productsNoCoinVendorSku.length;
	reportWorksheet.getCell('A9').value = {
		text: "Invalid COIN Vendor SKU Mappings",
		hyperlink: "#'Invalid COIN Vendor SKU Map'!A1"
	};
	reportWorksheet.getCell('A9').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B9').value = resp.data.coinDiscrepancies.invalidVendorSkuMap.length;
	reportWorksheet.getCell('A10').value = {
		text: "Products w/ No MPN COIN Mapping",
		hyperlink: "#'No MPN COIN Map'!A1"
	};
	reportWorksheet.getCell('A10').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B10').value = resp.data.coinDiscrepancies.coinManuMPNDiscrepancy ? resp.data.coinDiscrepancies.productsNoCoinManuMPN.length : 0;
	reportWorksheet.getCell('A11').value = {
		text: "Invalid COIN MPN Mappings",
		hyperlink: "#'Invalid COIN MPN Map'!A1"
	};
	reportWorksheet.getCell('A11').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B11').value = resp.data.coinDiscrepancies.invalidMPNMap.length;
	reportWorksheet.getCell('A12').value = {
		text: "Orphaned COINs in UPC Mapping",
		hyperlink: "#'Orphaned COINs In UPC'!A1"
	};
	reportWorksheet.getCell('A12').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B12').value = resp.data.coinDiscrepancies.orphanedCoinUPC.length;
	reportWorksheet.getCell('A13').value = {
		text: "Orphaned COINs in MPN Mapping",
		hyperlink: "#'Orphaned COINs in MPN'!A1"
	};
	reportWorksheet.getCell('A13').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B13').value = resp.data.coinDiscrepancies.orphanedCoinMPN.length;
	reportWorksheet.getCell('A14').value = {
		text: "Orphaned COINs in Vendor Sku Mapping",
		hyperlink: "#'Orphaned COINs in Vendor Sku'!A1"
	};
	reportWorksheet.getCell('A14').style = {
		font: {
			bold: true,
			color: {
				argb: 'FF3d50d1'
			},
			underline: true
		}
	};
	reportWorksheet.getCell('B14').value = resp.data.coinDiscrepancies.orphanedCoinVendorSku.length;
}



var buildUPCsMultipleMPNsTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('UPCs with Multiple MPNs');
	var row = 1;

	reportWorksheet.getCell('A' + row).value = "UPC";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('B' + row).value = "Vendor Name";
	reportWorksheet.getCell('B' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('C' + row).value = "Vendor SKU";
	reportWorksheet.getCell('C' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('D' + row).value = "Manufacturer";
	reportWorksheet.getCell('D' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('E' + row).value = "MPN";
	reportWorksheet.getCell('E' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.vendorsWithDuplicateUPCs.upcsWithMultipleMPN.length; i++) {
		for (var j = 0; j < resp.data.vendorsWithDuplicateUPCs.upcsWithMultipleMPN[i].mpns.length; j++) {
			reportWorksheet.getCell('A' + row).value = resp.data.vendorsWithDuplicateUPCs.upcsWithMultipleMPN[i].mpns[j].upc;
			reportWorksheet.getCell('B' + row).value = resp.data.vendorsWithDuplicateUPCs.upcsWithMultipleMPN[i].mpns[j].vendorName;
			reportWorksheet.getCell('C' + row).value = resp.data.vendorsWithDuplicateUPCs.upcsWithMultipleMPN[i].mpns[j].vendorSku;
			reportWorksheet.getCell('D' + row).value = resp.data.vendorsWithDuplicateUPCs.upcsWithMultipleMPN[i].mpns[j].manufacturer;
			reportWorksheet.getCell('E' + row).value = resp.data.vendorsWithDuplicateUPCs.upcsWithMultipleMPN[i].mpns[j].mpn;
			row++
		}
	}
}



var buildVendorDupeUPCsTab = (reportWorkbook, resp) => {
	var reportWorksheet = reportWorkbook.addWorksheet('Vendor SKUs Dupe UPCs');
	var row = 1;

	reportWorksheet.getCell('A' + row).value = "UPC";
	reportWorksheet.getCell('A' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('B' + row).value = "Vendor Name";
	reportWorksheet.getCell('B' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('C' + row).value = "Vendor SKU";
	reportWorksheet.getCell('C' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('D' + row).value = "Manufacturer";
	reportWorksheet.getCell('D' + row).style = {
		font: {
			bold: true
		}
	};
	reportWorksheet.getCell('E' + row).value = "MPN";
	reportWorksheet.getCell('E' + row).style = {
		font: {
			bold: true
		}
	};
	row++;
	for (var i = 0; i < resp.data.vendorsWithDuplicateUPCs.vendorsWithDupeUPC.length; i++) {
		for (var j = 0; j < resp.data.vendorsWithDuplicateUPCs.vendorsWithDupeUPC[i].vendorSkus.length; j++) {
			reportWorksheet.getCell('A' + row).value = resp.data.vendorsWithDuplicateUPCs.vendorsWithDupeUPC[i].vendorSkus[j].upc;
			reportWorksheet.getCell('B' + row).value = resp.data.vendorsWithDuplicateUPCs.vendorsWithDupeUPC[i].vendorSkus[j].vendorName;
			reportWorksheet.getCell('C' + row).value = resp.data.vendorsWithDuplicateUPCs.vendorsWithDupeUPC[i].vendorSkus[j].vendorSku;
			reportWorksheet.getCell('D' + row).value = resp.data.vendorsWithDuplicateUPCs.vendorsWithDupeUPC[i].vendorSkus[j].manufacturer;
			reportWorksheet.getCell('E' + row).value = resp.data.vendorsWithDuplicateUPCs.vendorsWithDupeUPC[i].vendorSkus[j].mpn;
			row++
		}
	}
}



//
//	Process catalog jobs
//
var processCatalogJobs = (req, resp) => {
	return new Promise((resolve, reject) => {
		var jobInfo = null;
		var prom = [];


		Vendors.getReadyCatalogJobs()
			.then((rows) => {
				if (rows.length === 0) {
					resolve(resp);
				} else {

					for (var i = 0; i < rows.length; i++) {
						resp.data.jobsProcessed = resp.data.jobsProcessed + 1;

						jobInfo = rows[i];
						prom.push(catalogParseUtils.processCatalogJob(resp, jobInfo, false));
					}

					Promise.all(prom)
						.then((results) => {
							downloadAndStoreImages({}, {});
							resolve(resp);
						})
						.catch((e) => {
							Vendors.failCatalogJob(jobInfo.id, e.message);
							reject(e);
						});
				}
			})
			.catch((e) => {
				Vendors.failCatalogJob(jobInfo.id, e.message);
				reject(e);
			});
	});
}



//
//	Generate Attribute Name and Values
//
var generateAttributeNameValues = async (req, resp) => {
	var attributes = await AttributeNames.getAll();

	if (attributes.length === 0) {
		resp = formatResp(resp, res, next, undefined, 404, 'Attributes not found.');
	} else {
		var json = [];

		var att = {
			name: '',
			values: []
		}
		for (var i = 0; i < attributes.length; i++) {
			if (attributes[i].att.toLowerCase() !== att.name.toLowerCase()) {
				if (att.name !== '') {
					json.push(att);
				}
				var att = {
					name: '',
					values: []
				}
				att.name = attributes[i].att;
			}
			att.values.push(attributes[i].val);
		}
		if (att.name !== '') {
			json.push(att);
		}
	}

	await AttributeNames.updateCache(json);

	return resp;
}



//
//	Generate Category Nav
//
var generateCatNav = async (req, resp) => {
	var stores = await Stores.getAllActiveStores();

	for (var a = 0; a < stores.length; a++) {

		var cats = await Categories.getAll(stores[a].store_id);
		var json = [];

		if (cats.length === 0) {
			formatResp(resp, undefined, 404, "No categories data found.")
		} else {
			var category = {};
			var collection = {};
			var lastCategory = null;
			var lastCollection = null;


			for (var i = 0; i < cats.length; i++) {

				//	See if we're starting a new category.
				if (lastCategory !== cats[i].page) {
					if (collection.name !== undefined) {
						category.collections.push(collection);
					}
					if (category.name !== undefined) {
						json.push(category);
					}

					lastCategory = cats[i].page;

					//	Start new category.
					category = {};
					collection = {};

					category.name = cats[i].name;
					category.label = cats[i].label;
					category.page = cats[i].page;
					category.slug = cats[i].slug;
					category.collections = [];
				}

				//	See if we're starting a new cluster.
				if (lastCollection !== cats[i].collection) {
					if (collection.name !== undefined) {
						category.collections.push(collection);
					}

					lastCollection = cats[i].collection;

					collection = {};

					collection.name = cats[i].collection;
					collection.slug = cats[i].collectionSlug;
				}
			}

			if (collection.name !== undefined) {
				category.collections.push(collection);
			}

			if (category.name !== undefined) {
				json.push(category);
			}
		}


		await Categories.updateCache(stores[a].store_id, json);
	}

	return resp;
}


//
// Generate Taxonomy Products
//
var generateTaxonomyProducts = async (req, resp) => {
	//check performance

	const t0 = Date.now();

	//get service areas
	var areas = await Stores.getDistinctStores();
	var taxonomies = await Taxonomies.getCached();
	var taxonomy = JSON.parse(taxonomies[0].json);
	var categories = [];
	//var areaTaxonomy = {};
	var categoryTaxonomy = {};

	//set up default vars for category products call
	var clWhereInfo = {
		join: '',
		clause: '',
		values: []
	};
	var vcWhereInfo = {
		join: '',
		clause: 'WHERE 1=1 ',
		values: []
	};
	var offset = 0;
	var limit = 1;

	//response
	var categoryResp = {};
	var cacheResp = {};

	//Areas
	var i, j, k;
	var cl = 0;
	var sl = 0;
	const al = areas.length;
	//loop areas
	for (i = 0; i < al; i++) {
		var taxonomyByCity = _.cloneDeep(taxonomy);
		categories = _.cloneDeep(taxonomy.categories);
		cl = categories.length;
		//loop categories
		for (j = 0; j < cl; j++) {
			sl = categories[j].subCategories.length;

			var subCatTotal = 0;

			//	If no subcats...
			if (sl === 0) {

				//refresh response object
				resp = {
					statusCode: 200,
					message: 'Success.',
					metaData: {
						totalCount: 0
					},
					data: {},
					slug: {
						memberId: areas[i].id,
						category: categories[j].slug,
						subCategory: null
					}
				};
				clWhereInfo = {
					join: '',
					clause: '',
					values: []
				};
				vcWhereInfo = {
					join: '',
					clause: 'WHERE 1=1 ',
					values: []
				};
				//set up request
				req.query.memberId = areas[i].id;
				req.query.categorySlug = categories[j].slug;
				req.query.sortBy = 'freshnessScore:DESC';
				categoryResp = await CategoryProductActions.getCategoryProducts(req, clWhereInfo, vcWhereInfo, req.query.sortBy, offset, limit, resp);
				if (categoryResp.data !== undefined) {
					//	Record the count for this subcat.
					taxonomyByCity.categories[j].totalCount = categoryResp.metaData.totalCount;
					subCatTotal += taxonomyByCity.categories[j].totalCount;
				}

			} else {

				//loop subcategories
				for (k = 0; k < sl; k++) {
					//refresh response object
					resp = {
						statusCode: 200,
						message: 'Success.',
						metaData: {
							totalCount: 0
						},
						data: {},
						slug: {
							memberId: areas[i].id,
							category: categories[j].slug,
							subCategory: categories[j].subCategories[k].slug
						}
					};
					clWhereInfo = {
						join: '',
						clause: '',
						values: []
					};
					vcWhereInfo = {
						join: '',
						clause: 'WHERE 1=1 ',
						values: []
					};
					//set up request
					req.query.memberId = areas[i].id;
					req.query.categorySlug = categories[j].subCategories[k].slug;
					req.query.sortBy = 'freshnessScore:DESC';
					categoryResp = await CategoryProductActions.getCategoryProducts(req, clWhereInfo, vcWhereInfo, req.query.sortBy, offset, limit, resp);
					if (categoryResp.data !== undefined) {
						categories[j].subCategories[k].categoryProducts = categoryResp.data.categoryProducts;

						//	Record the count for this subcat.
						taxonomyByCity.categories[j].subCategories[k].totalCount = categoryResp.metaData.totalCount;
						subCatTotal += taxonomyByCity.categories[j].subCategories[k].totalCount;
					}
				} //subCategory loop
			}



			categoryTaxonomy = categories[j];
			cacheResp = await Taxonomies.getCachedTaxonomyProductsByCategory(categories[j].slug, areas[i].id);
			if (cacheResp.length === 0) {
				Taxonomies.createTaxonomyProductCache(areas[i].home_city_id, areas[i].home_shopify_store_id, categories[j].slug, categoryTaxonomy);
			} else {
				Taxonomies.updateTaxonomyProductCache(areas[i].home_city_id, areas[i].home_shopify_store_id, categories[j].slug, categoryTaxonomy);
			}

			//	Prune out subcategories with no products.
			_.remove(taxonomyByCity.categories[j].subCategories, function (s) {
				return s.totalCount === 0;
			});

			taxonomyByCity.categories[j].totalCount = subCatTotal;

		} //category loop


		//	Prune out categories with no products.
		_.remove(taxonomyByCity.categories, function (c) {
			return c.subCategories.totalCount === 0;
		})

		//	Now update the cache by city

		await Taxonomies.updateCachedTaxonomyByCity(areas[i].home_city_id, JSON.stringify(taxonomyByCity));

	} //area loop
	const t1 = Date.now();
	// console.log(`Taxonomy took ${(t1 - t0)/1000} seconds.`);
	return resp;
}


//
//	Generate Member Aliases
//
var generateMemberAliases = (req, resp) => {
	return new Promise((resolve, reject) => {
		var count = req.query.count ? req.query.count : 1000;
		var prom = [];
		var alias = null;


		Members.getFreeAliases()
			.then((freeCount) => {
				if (freeCount < count) {
					for (var i = 0; i < count; i++) {
						alias = createMemberAlias(8);
						prom.push(Members.createMemberAlias(alias));
					}
				}

				return Promise.all(prom);
			})
			.then((rows) => {
				resolve(resp);
			})
			.catch((e) => {
				if (e.code != 'ER_DUP_ENTRY') {
					reject(e);
				} else {
					resolve(resp);
				}
			});
	});
}




//
//	GET vendor prefixes
//
var generatePrefixes = (req, resp) => {
	return new Promise((resolve, reject) => {
		var count = req.query.count ? req.query.count : 10;
		var prom = [];
		var prefix = null;


		Vendors.getFreePrefixes()
			.then((freeCount) => {
				if (freeCount < count) {
					for (var i = 0; i < count; i++) {
						prefix = createVendorPrefix(4);
						prom.push(Vendors.createVendorPrefix(prefix));
					}
				}

				return Promise.all(prom);
			})
			.then((rows) => {
				resolve(resp);
			})
			.catch((e) => {
				if (e.code != 'ER_DUP_ENTRY') {
					reject(e);
				} else {
					resolve(resp);
				}
			});
	});
}




//
//	GET vendor POs
//
var generateVendorPOs = async (req, resp) => {
	var prom = [];


	holidays = await RushOrders.loadHolidays();

	var orders = await RushOrders.getNewDSOrderInfo();

	orders = preprocessOrders(orders);


	// await generateInternalSpreadsheet(orders);

	await generateVendorPDFs(orders);


	return resp;
}



var preprocessOrders = (orders) => {
	var currFulfillment = "";
	var currOrder = "";
	var currVendor = "";
	var o = {};
	var result = [];

	for (var i = 0; i < orders.length; i++) {

		if ((orders[i].source_order_name !== currOrder) || (orders[i].vendor_id !== currVendor) || (orders[i].fulfillment_method !== currFulfillment)) {
			o = {
				address: orders[i].address,
				city: orders[i].city,
				email: orders[i].email,
				fulfillmentMethod: orders[i].fulfillment_method,
				customerAddress: orders[i].customer_address,
				customerCity: orders[i].customer_city,
				customerLocale: orders[i].customer_locale,
				customerState: orders[i].customer_state,
				customerZip: orders[i].customer_zip,
				fullName: orders[i].full_name,
				ltlFlag: false,
				manifestSource: orders[i].manifest_source,
				memberCityId: orders[i].member_city_id,
				orderDateCreated: orders[i].order_date_created,
				orderId: orders[i].order_id,
				ordersEmail: orders[i].orders_email,
				partnerAddress: orders[i].partner_address,
				partnerCity: orders[i].partner_city,
				partnerDDAllowance: orders[i].partner_dd_allowance,
				partnerLeadTime: orders[i].partner_lead_time,
				partnerLocale: orders[i].partner_locale,
				partnerName: orders[i].partner_name,
				partnerPostalCode: orders[i].partner_postal_code,
				partnerPrefix: orders[i].partner_prefix,
				partnerShippingCutoffCst: orders[i].partner_shipping_cutoff_cst,
				partnerStateOrProvince: orders[i].partner_state_or_province,
				partnerTariff: orders[i].partner_tariff,
				sourceOrderId: orders[i].source_order_id,
				sourceOrderName: orders[i].source_order_name,
				state: orders[i].state,
				storeId: orders[i].store_id,
				storeLocale: orders[i].store_locale,
				storeName: orders[i].store_name,
				type: orders[i].type,
				vendorId: orders[i].vendor_id,
				zip: orders[i].zip,
				lines: []
			};

			result.push(o);
			currFulfillment = orders[i].fulfillment_method;
			currOrder = orders[i].source_order_name
			currVendor = orders[i].vendor_id;
		}

		var l = {
			cost: orders[i].cost,
			name: orders[i].name,
			productShipType: orders[i].product_ship_type,
			quantity: orders[i].quantity,
			sellerProductId: orders[i].seller_product_id,
			sku: orders[i].sku,
			upc: orders[i].upc
		}

		o.lines.push(l);

		if (l.productShipType && l.productShipType.toLowerCase() === 'ltl') {
			o.ltlFlag = true;
		}
	}

	return result;
}



var generateInternalSpreadsheet = async (orders) => {
	if (orders.length > 0) {
		var ws = initPOWorksheet();

		var currOrder = "";
		var currVendor = "";
		for (var i = 0; i < orders.length; i++) {
			determineShipDate(orders[i]);

			if ((orders[i].source_order_id !== currOrder) || (orders[i].vendor_id !== currVendor)) {

				if (ws.vendorCostTotal > 0) {
					await addVendorPOTotals(ws);
				}

				currOrder = orders[i].source_order_id
				currVendor = orders[i].vendor_id;
				await addVendorPOHeader(ws, orders[i]);
				await addLineItemHeader(ws, orders[i]);
				ws.vendorCostTotal = 0;
				ws.vendorDDTotal = 0;
				ws.vendorTariffTotal = 0;
				ws.vendorTotalTotal = 0;
			}

			await addLineItem(ws, orders[i]);
		}

		if (ws.vendorCostTotal > 0) {
			await addVendorPOTotals(ws);
		}

		if (orders.length > 0) {
			prom.push(RushOrders.updateBookmark(orders[(i - 1)].order_date_created));
		}
		prom.push(finalizePOWorksheet(ws));

		await Promise.all(prom);

		comms.sendEmail(process.env.PO_EMAIL ? process.env.PO_EMAIL : 'matt@rushmarket.com', 'Vendor POs', 'See Attached', 'See Attached', 'noreply@rushmarket.com', undefined, undefined, ws.filename, 'sheets/' + ws.filename);
	}

}



var generateVendorPDFs = async (orders) => {
	var manifestSource = null;
	var po = initPO();


	if (orders.length > 0) {
		var currFulfillment = "";
		var currOrder = "";
		var currVendor = "";

		for (var i = 0; i < orders.length; i++) {
			determineShipDate(orders[i]);

			if (po.stats.vendorCostTotal > 0) {
				await addPDFOrderLevelInfo(po, orders[i - 1]);
				addPDFVendorPOTotals(po);
				// console.log("TOTAL: " + po.stats.vendorTotalTotal);
				await po.pdf.end();
				await sleep(2000);
				await sendPDFEmail(po, manifestSource);
				po = initPO();
			}

			manifestSource = orders[i].manifestSource;

			initPOPdf(po, orders[i]);

			addPDFHeader(po);

			// console.log("New Order: " + orders[i].source_order_id + " " + orders[i].source_order_name);
			currFulfillment = orders[i].fulfillmentMethod;
			currOrder = orders[i].sourceOrderName
			currVendor = orders[i].vendorId;

			await addPDFLineItemHeader(po, orders[i], manifestSource);

			po.stats.vendorCostTotal = 0;
			po.stats.vendorDDTotal = 0;
			po.stats.vendorTariffTotal = 0;
			po.stats.vendorTotalTotal = 0;

			


			//	Lines
			for (let j=0; j < orders[i].lines.length; j++) {
				await addPDFLineItem(po, orders[i].lines[j], manifestSource, orders[i].partnerDDAllowance, orders[i].partnerTariff);
				if (i === (orders.length - 1)) {
					await addPDFOrderLevelInfo(po, orders[i]);
				}
			}
		}

		if (po.stats.vendorCostTotal > 0) {
			addPDFVendorPOTotals(po);
			// console.log("TOTAL: " + po.stats.vendorTotalTotal);
			await po.pdf.end();
			await sleep(2000);
			await sendPDFEmail(po, manifestSource);
		}

		if (orders.length > 0) {
			await RushOrders.updateBookmark(orders[(i - 1)].orderDateCreated);
		}

		// comms.sendEmail(process.env.PO_EMAIL ? process.env.PO_EMAIL : 'matt@rushmarket.com', 'Vendor POs', 'See Attached', 'See Attached', 'noreply@rushmarket.com', ws.filename, 'sheets/' + ws.filename);
	}

}



var rippleTransitions = async (req, resp) => {

	//	Look for markets that are ready to open.
	await marketActions.transitionOpeningMarkets(resp);

	//	Look for skus ready to transition in the ripples.
	await marketActions.rippleMovementCheck(resp);

	return resp;
}



var sendPDFEmail = async (po, manifestSource) => {
	if (po.ltlFlag) {
		comms.sendEmail(process.env.VENDOR_PO_LTL ? process.env.VENDOR_PO_LTL : 'matt@rushmarket.com', 'LTL: New Purchase Order from The Rush Market: ' + po.orderName, 'See Attached', 'See Attached', 'noreply@rushmarket.com', undefined, process.env.VENDOR_PO_BCC, po.fileName, 'pdfs/' + po.fileName);
	} else {

		//	Dropship from vendor
		if ((manifestSource === 'DS') || (manifestSource === 'STS')) {
			if ((process.env.VENDOR_PO_ROUTING !== undefined) && (process.env.VENDOR_PO_ROUTING === "Y")) {
				comms.sendEmail(po.orderEmail, 'New Purchase Order from The Rush Market: ' + po.orderName,
					'Kindly respond within 24 hours that you have received this PO. ' +
					'Tracking information should be sent as soon as the order has shipped to vendororders@rushrecommerce.com. ' +
					'Thank you!',
					'<html><head></head><body>Kindly respond within 24 hours that you have received this PO.<br><br>' +
					'Tracking information should be sent as soon as the order has shipped to <a href="mailto:vendororders@rushrecommerce.com">vendororders@rushrecommerce.com</a>.<br><br>Thank you!</body></html>',
					'vendorsupport@rushrecommerce.com', undefined, process.env.VENDOR_PO_BCC, po.fileName, 'pdfs/' + po.fileName);
			} else {
				comms.sendEmail(process.env.VENDOR_PO_BCC ? process.env.VENDOR_PO_BCC : 'matt@rushmarket.com', 'New Purchase Order from The Rush Market: ' + po.orderName,
					'Kindly respond within 24 hours that you have received this PO. ' +
					'Tracking information should be sent as soon as the order has shipped to vendororders@rushrecommerce.com. ' +
					'Thank you!',
					'<html><head></head><body>Kindly respond within 24 hours that you have received this PO.<br><br>' +
					'Tracking information should be sent as soon as the order has shipped to <a href="mailto:vendororders@rushrecommerce.com">vendororders@rushrecommerce.com</a>.<br><br>Thank you!</body></html>',
					'vendorsupport@rushrecommerce.com', undefined, process.env.VENDOR_PO_BCC, po.fileName, 'pdfs/' + po.fileName);
			}
		}
		//	Ship from market
		else {
			comms.sendEmail(process.env.PO_SFM_EMAIL ? process.env.PO_SFM_EMAIL : 'matt@rushmarket.com', 'New SFM Purchase Order from The Rush Market: ' + po.orderName, 'See Attached', 'See Attached', 'vendorsupport@rushrecommerce.com', undefined, process.env.SFM_PO_BCC, po.fileName, 'pdfs/' + po.fileName);
		}
	}

	await sleep(2000);
}




var addPDFHeader = (po) => {
	// Add an image, constrain it to a given size, and center it vertically and horizontally
	po.pdf.image('images/logo_black.png', 50, 20, {
		fit: [150, 50],
		align: 'left',
		valign: 'top'
	});

	// Embed a font, set the font size, and render some text
	po.pdf
		.font('fonts/Calibri Regular.ttf')
		.fontSize(20)
		.text('DROP SHIP', 450, 20)
		.text('PURCHASE ORDER', 390, 40);

	// line cap settings
	po.pdf.lineWidth(2);
	po.pdf.lineCap('butt')
		.moveTo(50, 60)
		.lineTo(550, 60)
		.stroke();
}


var addPDFOrderLevelInfo = (po, order) => {
	var name = ((order.type === 'ONLINE') || (order.fulfillmentMethod === 'Delivery')) ? order.fullName : 'STS - The Rush Market' + order.storeName.substring((order.storeName.indexOf('-') + 1));
	var orderId = ((order.type === 'ONLINE') || (order.fulfillmentMethod === 'Delivery')) ? null : order.sourceOrderId;
	var address = ((order.type === 'ONLINE') || (order.fulfillmentMethod === 'Delivery')) ? order.customerAddress : order.address;
	var locale = ((order.type === 'ONLINE') || (order.fulfillmentMethod === 'Delivery')) ? order.customerLocale : order.storeLocale;
	// var state = (order.type === 'ONLINE') ? order.customer_state : order.state;
	// var zip = (order.type === 'ONLINE') ? order.customer_zip : order.zip;

	var billToStateStart = ((5 + 2) * CHAR_SPACING);
	var billToZipStart = billToStateStart + (3 * CHAR_SPACING);
	// var shipToStateStart = ((city.length + 2) * CHAR_SPACING);
	// var shipToZipStart = shipToStateStart + (3 * CHAR_SPACING);
	// var vendorStateStart = ((order.partner_city.length + 2) * CHAR_SPACING);
	// var vendorZipStart = vendorStateStart + (3 * CHAR_SPACING);


	po.pdf
		.font('fonts/Calibri Bold.ttf')
		.fontSize(11)
		.text('Ship To', 50, 80)
		.text('Vendor', 300, 80);

	po.pdf
		.font('fonts/Calibri Regular.ttf')
		.text(name, 100, 80);

	if (orderId !== null) {
		po.pdf
			.font('fonts/Calibri Regular.ttf')
			.text('Drop Ship Order #= ' + orderId, 100, 90)
			.text(address, 100, 100)
			.text(locale, 100, 110);
	} else {
		po.pdf
			.font('fonts/Calibri Regular.ttf')
			.text(address, 100, 90)
			.text(locale, 100, 100);
	}
	// .text(state, (100 + shipToStateStart), 100)
	// .text(zip, (100 + shipToZipStart), 100);

	po.pdf
		.font('fonts/Calibri Regular.ttf')
		.text(order.partnerName, 350, 80)
		.text(order.partnerAddress, 350, 90)
		.text(order.partnerLocale, 350, 100);
	// .text(order.partner_state_or_province, (350 + vendorStateStart), 100)
	// .text(order.partner_postal_code, (350 + vendorZipStart), 100);


	po.pdf
		.lineWidth(1)
		.lineCap('butt')
		.moveTo(50, 150)
		.lineTo(200, 150)
		.stroke();

	po.pdf.lineWidth(1)
		.lineCap('butt')
		.moveTo(300, 150)
		.lineTo(550, 150)
		.stroke();

	po.pdf
		.font('fonts/Calibri Bold.ttf')
		.fontSize(11)
		.text('PO Number', 50, 154)
		.text('PO Date', 50, 164)
		.text('Bill To', 300, 154);

	var dateCreated = new Date();
	po.pdf
		.font('fonts/Calibri Regular.ttf')
		.fontSize(11)
		.text(order.sourceOrderName, 116, 154)
		.text((dateCreated.getMonth() + 1) + '/' + dateCreated.getDate() + '/' + dateCreated.getFullYear(), 116, 164);


	po.pdf
		.font('fonts/Calibri Regular.ttf')
		.text("The Rush Market", 350, 154)
		.text("3201 S. 144th Street", 350, 164)
		.text("Omaha" + ', ', 350, 174)
		.text("NE", (350 + billToStateStart), 174)
		.text("68144", (350 + billToZipStart), 174);



	po.pdf.lineWidth(1)
		.lineCap('butt')
		.moveTo(50, 178)
		.lineTo(200, 178)
		.stroke();

	po.pdf.lineWidth(1)
		.lineCap('butt')
		.moveTo(300, 194)
		.lineTo(550, 194)
		.stroke();

	po.pdf
		.font('fonts/Calibri Bold.ttf')
		.fontSize(11)
		.text('Shipping Service', 300, 198)
		.text('Ship By Date', 300, 210);

	if (po.ltlFlag) {
		po.pdf
			.font('fonts/Calibri Regular.ttf')
			.fontSize(11)
			.text('LTL (see routing guide)', 396, 198)
	} else {
		po.pdf
			.font('fonts/Calibri Regular.ttf')
			.fontSize(11)
			.text('FedEx', 396, 198)
			.text(order.calculatedShipByDate, 396, 210);
	}
}


var addPDFLineItemHeader = (po, order, manifestSource) => {
	po.pdf.lineWidth(1)
		.lineCap('butt')
		.moveTo(50, 240)
		.lineTo(550, 240)
		.stroke();

	po.pdf.lineWidth(1)
		.lineCap('butt')
		.moveTo(50, 258)
		.lineTo(550, 258)
		.stroke();

	po.pdf.rect(50, 241, 500, 16)
		.fillAndStroke("#CACACA", "#CACACA");

	po.pdf
		.fillAndStroke("#000", "#000")
		.font('fonts/Calibri Bold.ttf')
		.fontSize(11)
		.text('Description', 50, 244);
	if ((manifestSource === 'DS') || (manifestSource === 'STS')) {
		po.pdf.text('Vendor SKU', 230, 244);
	} else {
		po.pdf.text('RM SKU', 230, 244);
	}

	po.pdf
		.text('Ship Type', 320, 244)
		.text('Qty', 400, 244)
		.text('Item Cost', 432, 244)
		.text('Total Cost', TOTAL_X, 244);
}


var addPDFLineItem = (po, line, manifestSource, partnerDDAllowance, partnerTariff) => {
	const formatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2
	})

	if (line.productShipType === 'LTL') {
		po.ltlFlag = true;
	}

	newPDFPageCheck(po);
	po.pdf
		.fillAndStroke("#000", "#000")
		.font('fonts/Calibri Regular.ttf')
		.fontSize(9)
		.text(line.name, 50, po.lineItemY);

	if (line.name.length >= 40) {
		po.lineItemY += LINE_ITEM_HEIGHT;
	}

	if ((manifestSource === 'DS') || (manifestSource === 'STS')) {
		po.pdf.text(line.sellerProductId, 230, po.lineItemY)
	} else {
		po.pdf.text(line.sku, 230, po.lineItemY)
	}

	po.pdf
		.text(line.productShipType, 320, po.lineItemY)
		.text(line.quantity, 400, po.lineItemY)
		.text((line.cost !== null) ? formatter.format(line.cost) : formatter.format(0), 432, po.lineItemY)
		.text((line.cost !== null) ? formatter.format((line.cost * line.quantity)) : formatter.format(0), TOTAL_X, po.lineItemY);

	po.lineItemY += LINE_ITEM_HEIGHT;

	var liCostTotal = (line.cost * line.quantity);
	var liDDAllowance = (partnerDDAllowance !== null) ? ((line.cost * line.quantity) * (partnerDDAllowance / 100)) : 0.00;
	var liTariff = (line.partnerTariff !== null) ? ((line.cost * line.quantity) * (partnerTariff / 100)) : 0.00

	po.stats.vendorCostTotal += liCostTotal;
	po.stats.vendorDDTotal += liDDAllowance;
	po.stats.vendorTariffTotal += liTariff;
	// po.stats.vendorTotalTotal += (liCostTotal - liDDAllowance + liTariff);
	po.stats.vendorTotalTotal += (liCostTotal);
}


var newPDFPageCheck = (po) => {
	if (po.lineItemY >= 680) {
		po.pdf.addPage();
		po.lineItemY = 20;
	}
}

var addPDFVendorPOTotals = (po) => {
	const formatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2
	})


	newPDFPageCheck(po);

	// po.pdf.lineWidth(1)
	// 	.lineCap('butt')
	// 	.moveTo(50, po.lineItemY + 10)
	// 	.lineTo(550, po.lineItemY + 10)
	// 	.stroke();


	// po.pdf
	// 	.fillAndStroke("#000", "#000")
	// 	.font('fonts/Calibri Regular.ttf')
	// 	.fontSize(9)
	// 	.text('Damage/Defective Allowance', 350, (po.lineItemY + 14))
	// 	.text(formatter.format(po.stats.vendorDDTotal * -1), TOTAL_X, (po.lineItemY + 14));


	po.pdf.lineWidth(1)
		.lineCap('butt')
		.moveTo(50, (po.lineItemY + 10))
		.lineTo(550, (po.lineItemY + 10))
		.stroke();

	po.pdf.lineWidth(1)
		.lineCap('butt')
		.moveTo(50, (po.lineItemY + 28))
		.lineTo(550, (po.lineItemY + 28))
		.stroke();

	po.pdf.rect(50, (po.lineItemY + 11), 500, 16)
		.fillAndStroke("#CACACA", "#CACACA");

	po.pdf
		.fillAndStroke("#000", "#000")
		.font('fonts/Calibri Bold.ttf')
		.fontSize(11)
		.text('Total', (TOTAL_X - 30), (po.lineItemY + 14))
		.text(formatter.format(po.stats.vendorTotalTotal), TOTAL_X, (po.lineItemY + 14));



	// ws.worksheet.getCell('H' + ws.currRow).value = (Math.round(ws.vendorCostTotal * 100) / 100).toFixed(2);
	// ws.worksheet.getCell('I' + ws.currRow).value = (Math.round(ws.vendorDDTotal * 100) / 100).toFixed(2);
	// ws.worksheet.getCell('J' + ws.currRow).value = (Math.round(ws.vendorTariffTotal * 100) / 100).toFixed(2);
	// ws.worksheet.getCell('K' + ws.currRow).value = (Math.round(ws.vendorTotalTotal * 100) / 100).toFixed(2);
	// ws.currRow++;

	// return ws;
}





//
//	Set home city
//
var moveMembers = async (req, resp) => {
	var jobInfo = null;
	var prom = [];


	var queued = await MembersToMove.getQueuedMembers();

	for (var i = 0; i < queued.length; i++) {
		var tmpReq = {};
		tmpReq.params = {};
		tmpReq.body = {};
		tmpReq.params.id = queued[i].memberId;
		tmpReq.body.cityId = queued[i].toCityId;

		var tmpResp = {
			statusCode: 200
		};


		await MembersToMove.markActive(queued[i].id);
		await memberActions.setHomeCity(tmpReq, tmpResp);

		await sleep(1000);

	}

	for (var i = 0; i < queued.length; i++) {
		prom.push(MembersToMove.markCompleted(queued[i].id));
	}

	await Promise.all(prom);

	return resp;
}



//
//	Set shopify and mailchimp tags
//
var tagMembers = async (req, resp) => {
	var jobInfo = null;
	var prom = [];
	var total = 0;

	var queued = await MembersToTag.getQueuedMembers();

	for (var i = 0; i < queued.length; i++) {
		console.log(i + " " + queued[i].email + " " + queued[i].verifiedMemberFlag);

		var tmpReq = {};
		tmpReq.params = {};
		tmpReq.body = {};
		tmpReq.params.id = queued[i].memberId;
		tmpReq.body.cityId = queued[i].toCityId;

		var tmpResp = {
			statusCode: 200
		};


		await MembersToTag.markActive(queued[i].tagId);
		await memberActions.tagMember(queued[i]);
		total++;

		await MembersToTag.markCompleted(queued[i].tagId);

		await sleep(1000);

	}

	resp.data.processed = total / 2;

	// var results = await Promise.all(prom);

	// prom = [];
	// for (var i=0; i < prom.length; i++) {
	// 	prom.push(MembersToTag.markCompleted(queued[i].tagId));
	// }

	// await Promise.all(prom);


	console.log("Done: " + resp.data.processed);


	return resp;
}



//
//	Process export jobs
//
var processExportJobs = (req, resp) => {
	return new Promise((resolve, reject) => {
		var jobInfo = null;
		var prom = [];


		Products.getReadyExportJobs()
			.then((rows) => {
				if (rows.length === 0) {
					resolve(resp);
				} else {

					for (var i = 0; i < rows.length; i++) {
						resp.data.jobsProcessed = resp.data.jobsProcessed + 1;

						jobInfo = rows[i];
						prom.push(exportUtils.processJob(resp, jobInfo));
					}

					Promise.all(prom)
						.then((results) => {
							resolve(resp);
						})
						.catch((e) => {
							Products.failExportJob(jobInfo.id);
							reject(e);
						});
				}
			})
			.catch((e) => {
				Products.failExportJob(jobInfo.id);
				reject(e);
			});
	});
}



//
//	Process inventory jobs
//
var processInventoryJobs = (req, resp) => {
	return new Promise((resolve, reject) => {
		var jobInfo = null;
		var prom = [];


		Vendors.getReadyInventoryJobs()
			.then((rows) => {
				if (rows.length === 0) {
					resolve(resp);
				} else {

					for (var i = 0; i < rows.length; i++) {
						resp.data.jobsProcessed = resp.data.jobsProcessed + 1;

						jobInfo = rows[i];
						prom.push(parseUtils.processInventoryJob(resp, jobInfo));
					}

					Promise.all(prom)
						.then((results) => {
							var extractFolder = process.cwd() + '/' + jobInfo.filePath + '-extract';

							fs.removeSync(extractFolder);
							var last = extractFolder.lastIndexOf('/');
							fs.removeSync(extractFolder.substring(0, last + 1 + 32));

							fs.removeSync(process.cwd() + '/' + jobInfo.filePath);

							resolve(resp);
						})
						.catch((e) => {
							Vendors.failInventoryJob(jobInfo.id, e.message);
							reject(e);
						});
				}
			})
			.catch((e) => {
				Products.failInventoryJob(jobInfo.id);
				reject(e);
			});
	});
}



//
//	Process inventory shortages
//
var processInventoryShortages = async (req, resp) => {
	var html = '<html>\n<head></head>\n<body>\n';
	var to = process.env.SHORTAGE_EMAIL ? process.env.SHORTAGE_EMAIL : 'matt@rushmarket.com';


	html = html + '<font color="red">NOTE</font>: It may be necessary to remove some of the following Ship-to-Store SKUs so that we\'re not selling more than are in inventory.<br><br>';
	html = html + '<table cellpadding="10px" cellspacing="0px" border="1">\n';
	html = html + '<tr><th>Rush SKU</th><th>Coreleap SKU</th><th>Name</th><th>Rush Quantity</th><th>Vendor Quantity</th></tr>\n';
	var stsProducts = await Manifests.getSTSProductsForSale();
	if (stsProducts.length === 0) {
		return resp;
	} else {
		for (var i = 0; i < stsProducts.length; i++) {
			var vcQuantity = await Vendors.getProductByVendorSku(stsProducts[i].vendorId, stsProducts[i].sellerProductId);
			if (vcQuantity.length > 0) {
				if (vcQuantity[0].dropshipInventory < stsProducts[i].rmQuantity) {

					await ShopifyQueues.takeSkuOffline(stsProducts[i].sku, '{ rushQuantity: ' + stsProducts[i].rmQuantity + ', vendorQuantity: ' + vcQuantity[0].dropshipInventory + ' }');

					html = html + '<tr><td>' + stsProducts[i].sku + '</td><td align="right">' + vcQuantity[0].variantSku + '</td><td>' + stsProducts[i].name + '</td><td align="right">' + stsProducts[i].rmQuantity + '</td><td align="right">' + vcQuantity[0].dropshipInventory + '</td></tr>\n';
					resp.data.shortProducts += 1;
				}
			}
		}

		if (resp.data.shortProducts > 0) {
			html = html + "</table>\n</body>\n</html>\n";

			comms.sendEmail(to, 'Low Inventory SKUs', null, html, 'noreply@rushmarket.com');
		}

		return resp;
	}
}



//
//	Process Mandrill Resends
//
var processMandrillResends = async (req, resp) => {
	var jobInfo = null;
	var prom = [];


	var rows = await Mandrill.getQueuedResends();

	for (var i = 0; i < rows.length; i++) {
		await Mandrill.resend(rows[i].id);
		await comms.sendTemplatedEmail(rows[i].email, rows[i].name, JSON.parse(rows[i].contexts));
	}

	return resp;
}


var determineShipDate = (orderInfo) => {
	if ((orderInfo.partnerShippingCutoffCst === null) || (orderInfo.partnerLeadTime === null)) {
		orderInfo.calculatedShipByDate = 'Missing info to calculate';
	} else {
		var bizDaysSkipped = 0;
		var daysInFuture = 0;
		var hour = orderInfo.partnerShippingCutoffCst.substring(0, 2);
		var min = orderInfo.partnerShippingCutoffCst.substring(3, 5);
		var cutoffToday = moment.tz('America/Chicago').hour(hour).minute(min).second(0);
		var theDay = moment.tz('America/Chicago');
		var weekendOrHoliday = false;

		// console.log("Cutoff today: " + cutoffToday.format('YYYY-MM-DD HH:mm:ss'));
		// console.log("Lead time: " + orderInfo.partner_lead_time);

		//	Bump if past cutoff
		if (theDay.isAfter(cutoffToday)) {
			// console.log("Past cutoff skipping day: " + theDay.format('YYYY-MM-DD HH:mm:ss') + " week day " + theDay.weekday());
			bumpDay(theDay);
		}

		theDay.hour(0).minute(0).second(0);

		do {
			bizDaysSkipped++;
			// console.log("Advancing business day: " + bizDaysSkipped);
			bumpDay(theDay);

		} while (bizDaysSkipped < orderInfo.partnerLeadTime);

		orderInfo.calculatedShipByDate = theDay.format('M/D/YYYY');
		// console.log("Ship date: " + theDay.format('M/D/YYYY') + " week day " + theDay.weekday());
		// console.log("next");
	}
}


var bumpDay = (theDay) => {
	var bumpFlag = false;
	theDay.add(1, 'days');

	do {
		bumpFlag = false;
		//	Bump past weekends
		if ((theDay.weekday() === 0) || (theDay.weekday() === 6)) {
			// console.log("Skipping weekend: " + theDay.format('YYYY-MM-DD HH:mm:ss') + " week day " + theDay.weekday());
			bumpFlag = true;
			theDay.add(1, 'days');
		}
		//	Bump past holidays
		else if (isHoliday(theDay)) {
			// console.log("Skipping holiday: " + theDay.format('YYYY-MM-DD HH:mm:ss') + " week day " + theDay.weekday());
			bumpFlag = true;
			theDay.add(1, 'days');
		}
	}
	while (bumpFlag);

	// console.log("     now: " + theDay.format('YYYY-MM-DD HH:mm:ss'))
}


var finalizePOWorksheet = async (ws) => {
	await ws.workbook.xlsx.writeFile('sheets/' + ws.filename);

}


var initPO = (order) => {
	var po = {

		fileName: null,
		ltlFlag: false,
		orderName: null,
		pdf: null,
		lineItemY: LINE_ITEM_Y_START,
		stats: {
			vendorCostTotal: 0,
			vendorDDTotal: 0,
			vendorTariffTotal: 0,
			vendorTotalTotal: 0
		}
	}

	return po;
}


var initPOPdf = (po, order) => {
	po.pdf = new PDFDoc();
	po.fileName = 'po-' + order.sourceOrderName + '-' + order.partnerPrefix + '.pdf';
	po.orderName = order.sourceOrderName;
	po.orderEmail = ((order.ordersEmail !== undefined) && (order.ordersEmail !== null) && (order.ordersEmail.length > 0)) ? order.ordersEmail : order.email;

	po.pdf.pipe(fs.createWriteStream('pdfs/' + po.fileName));

	po.lineItemY = LINE_ITEM_Y_START;
}



var initPOWorksheet = () => {
	var col = 1;
	var ws = {
		filename: 'purchase-orders-' + new Date().getFullYear() + "-" + (new Date().getMonth() + 1) + "-" + new Date().getDate() + "-" + new Date().getHours() + "-" + new Date().getMinutes() + '.xlsx',
		workbook: null,
		worksheet: null,
		currRow: 1,
		vendorCostTotal: 0,
		vendorDDTotal: 0,
		vendorTariffTotal: 0,
		vendorTotalTotal: 0
	}

	ws.workbook = new excel.Workbook();
	ws.worksheet = ws.workbook.addWorksheet('Purchase Orders');

	ws.worksheet.columns = [{
			width: 45
		}, //	A
		{
			width: 25
		}, //	B
		{
			width: 15
		}, //	C
		{
			width: 15
		}, //	D
		{
			width: 8
		}, //	E
		{
			width: 8
		}, //	F
		{
			width: 10
		}, //	G
		{
			width: 25
		}, //	H
		{
			width: 15
		}, //	I
		{
			width: 12
		}, //	J
		{
			width: 5
		}, //	K
		{
			width: 8
		}, //	L
		{
			width: 15
		}, //	M
		{
			width: 15
		}, //	N
		{
			width: 15
		}, //	O
		{
			width: 15
		} //	P
	];

	return ws;
}


var isHoliday = (now) => {
	for (var i = 0; i < holidays.length; i++) {
		var h = moment(holidays[i].day).hour(now.hour()).minute(now.minute()).second(now.second());
		// console.log(now.format("M/D/YYYY HH:mm:ss") + " " + h.format("M/D/YYYY HH:mm:ss") + " " + now.diff(h, 'days'), now.diff(h, 'hours'));
		if (now.diff(h, 'hours') === 0) {
			return true;
		}
	}

	return false;
}



var addLineItemHeader = (ws, orderInfo) => {
	fillLineItemHeader('A', ws, 'Item Name');
	fillLineItemHeader('B', ws, 'Partner SKU');
	fillLineItemHeader('C', ws, 'UPC');
	fillLineItemHeader('D', ws, 'Ship Type');
	fillLineItemHeader('E', ws, 'Ships by Date');
	fillLineItemHeader('F', ws, 'Quantity');
	fillLineItemHeader('G', ws, 'Cost Each');
	fillLineItemHeader('H', ws, 'Cost Total');
	fillLineItemHeader('I', ws, 'D/D Allowance');
	fillLineItemHeader('J', ws, 'Tariff');
	fillLineItemHeader('K', ws, 'Total');
	ws.currRow++;

	return ws;
}


var addLineItem = (ws, orderInfo) => {
	ws.worksheet.getCell('A' + ws.currRow).value = orderInfo.name;
	ws.worksheet.getCell('B' + ws.currRow).value = orderInfo.seller_product_id;
	ws.worksheet.getCell('C' + ws.currRow).value = orderInfo.upc;
	ws.worksheet.getCell('D' + ws.currRow).value = orderInfo.product_ship_type;
	ws.worksheet.getCell('E' + ws.currRow).value = orderInfo.calculatedShipByDate;
	ws.worksheet.getCell('F' + ws.currRow).value = orderInfo.quantity;
	ws.worksheet.getCell('G' + ws.currRow).value = (orderInfo.cost !== null) ? orderInfo.cost.toFixed(2) : 0;
	var liCostTotal = (orderInfo.cost * orderInfo.quantity);
	var liDDAllowance = (orderInfo.partner_dd_allowance !== null) ? ((orderInfo.cost * orderInfo.quantity) * (orderInfo.partner_dd_allowance / 100)) : 0.00;
	var liTariff = (orderInfo.partner_tariff !== null) ? ((orderInfo.cost * orderInfo.quantity) * (orderInfo.partner_tariff / 100)) : 0.00
	ws.worksheet.getCell('H' + ws.currRow).value = (Math.round(liCostTotal * 100) / 100).toFixed(2);
	ws.worksheet.getCell('I' + ws.currRow).value = (Math.round(liDDAllowance * 100) / 100).toFixed(2);
	ws.worksheet.getCell('J' + ws.currRow).value = (Math.round(liTariff * 100) / 100).toFixed(2);
	ws.worksheet.getCell('K' + ws.currRow).value = (Math.round((liCostTotal - liDDAllowance + liTariff) * 100) / 100).toFixed(2);
	ws.currRow++;

	ws.vendorCostTotal += liCostTotal;
	ws.vendorDDTotal += liDDAllowance;
	ws.vendorTariffTotal += liTariff;
	ws.vendorTotalTotal += (liCostTotal - liDDAllowance + liTariff);

	return ws;
}




var fillLineItemHeader = (cell, ws, text) => {
	ws.worksheet.getCell(cell + ws.currRow).fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: {
			argb: 'FFEDCEA2'
		}
	};
	ws.worksheet.getCell(cell + ws.currRow).value = text;
}


var fillVendorPOHeader = (cell, ws, text) => {
	ws.worksheet.getCell(cell + ws.currRow).fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: {
			argb: 'FF8BCD93'
		}
	};
	ws.worksheet.getCell(cell + ws.currRow).value = text;
}


var fillVendorPOTotalHeader = (cell, ws, text) => {
	ws.worksheet.getCell(cell + ws.currRow).fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: {
			argb: 'FFD0E1F3'
		}
	};
	ws.worksheet.getCell(cell + ws.currRow).value = text;
}




var addVendorPOHeader = (ws, orderInfo) => {
	fillVendorPOHeader('A', ws, 'Ship-To Name');
	fillVendorPOHeader('B', ws, 'Ship-To Address');
	fillVendorPOHeader('C', ws, '');
	fillVendorPOHeader('D', ws, '');
	fillVendorPOHeader('E', ws, '');
	fillVendorPOHeader('F', ws, '');
	fillVendorPOHeader('G', ws, '');
	fillVendorPOHeader('H', ws, 'Partner Name');
	fillVendorPOHeader('I', ws, 'Partner Address');
	fillVendorPOHeader('J', ws, '');
	fillVendorPOHeader('K', ws, '');
	fillVendorPOHeader('L', ws, '');
	fillVendorPOHeader('M', ws, 'Partner Email');
	fillVendorPOHeader('N', ws, 'PO Number');
	fillVendorPOHeader('O', ws, 'Date Ordered');
	fillVendorPOHeader('P', ws, 'Ship Service');
	ws.currRow++;

	var name = (orderInfo.type === 'ONLINE') ? orderInfo.full_name : orderInfo.store_name;
	var address = (orderInfo.type === 'ONLINE') ? orderInfo.customer_address : orderInfo.address;
	var city = (orderInfo.type === 'ONLINE') ? orderInfo.customer_city : orderInfo.city;
	var state = (orderInfo.type === 'ONLINE') ? orderInfo.customer_state : orderInfo.state;
	var zip = (orderInfo.type === 'ONLINE') ? orderInfo.customer_zip : orderInfo.zip;

	ws.worksheet.getCell('A' + ws.currRow).value = name;
	ws.worksheet.getCell('B' + ws.currRow).value = address;
	ws.worksheet.getCell('C' + ws.currRow).value = city;
	ws.worksheet.getCell('E' + ws.currRow).value = state;
	ws.worksheet.getCell('F' + ws.currRow).value = zip;
	ws.worksheet.getCell('H' + ws.currRow).value = orderInfo.partner_name;
	ws.worksheet.getCell('I' + ws.currRow).value = orderInfo.partner_address;
	ws.worksheet.getCell('J' + ws.currRow).value = orderInfo.partner_city;
	ws.worksheet.getCell('K' + ws.currRow).value = orderInfo.partner_state_or_province;
	ws.worksheet.getCell('L' + ws.currRow).value = orderInfo.partner_postal_code;
	ws.worksheet.getCell('M' + ws.currRow).value = orderInfo.orders_email;
	ws.worksheet.getCell('N' + ws.currRow).value = orderInfo.source_order_id;
	ws.worksheet.getCell('N' + ws.currRow).numFmt = '0';
	ws.worksheet.getCell('O' + ws.currRow).value = new Date();
	ws.worksheet.getCell('P' + ws.currRow).value = 'FedEx';
	ws.currRow++;

	return ws;
}


var addVendorPOTotals = (ws) => {
	fillVendorPOTotalHeader('H', ws, 'Cost Total');
	fillVendorPOTotalHeader('I', ws, 'D/D Total');
	fillVendorPOTotalHeader('J', ws, 'Tariff Total');
	fillVendorPOTotalHeader('K', ws, 'Overall Total');
	ws.currRow++;

	ws.worksheet.getCell('H' + ws.currRow).value = (Math.round(ws.vendorCostTotal * 100) / 100).toFixed(2);
	ws.worksheet.getCell('I' + ws.currRow).value = (Math.round(ws.vendorDDTotal * 100) / 100).toFixed(2);
	ws.worksheet.getCell('J' + ws.currRow).value = (Math.round(ws.vendorTariffTotal * 100) / 100).toFixed(2);
	ws.worksheet.getCell('K' + ws.currRow).value = (Math.round(ws.vendorTotalTotal * 100) / 100).toFixed(2);
	ws.currRow++;

	return ws;
}

//
// Staging data for Search
var stageProductDataforSearch = async (req, resp) => {
	const taxonomies = await Taxonomies.getCached();
	const taxonomy = JSON.parse(taxonomies[0].json);
	let subcatlen = 0;
	let catlen = taxonomy.categories.length;
	let i, j = 0;
	let soldTimeFrame = 0;
	try {
		//get the time frame for including/showing sold products in search
		let masterDataRow = await MasterData.getMasterDataByType("soldTimeFrame");
		if (masterDataRow.length > 0) {
			soldTimeFrame = masterDataRow[0].value;
		}
		//loop for categories
		for (i = 0; i < catlen; i++) {
			subcatlen = taxonomy.categories[i].subCategories.length;
			//console.log(`*** ${i+1}/${catlen}: ${taxonomy.categories[i].slug.toUpperCase()} ***`);
			if (subcatlen > 0) {
				for (j = 0; j < subcatlen; j++) {
					//console.log(`==> ${j+1}/${subcatlen}: ${taxonomy.categories[i].subCategories[j].slug}`);
					await SearchProductActions.manageSearchProducts(req, taxonomy.categories[i], taxonomy.categories[i].subCategories[j].slug, soldTimeFrame, resp);
				}
			} else {
				await SearchProductActions.manageSearchProducts(req, taxonomy.categories[i], taxonomy.categories[i].slug, soldTimeFrame, resp);
			}
		}
	} catch (e) {
		//console.log(e);
		logUtils.logException(e);
	}
	return resp;
}

var SyncSearchWithAlgolia = async (req, resp) => {
	let whereInfo = {
		clause: '',
		values: []
	};
	let sortBy = 'category_slug, status ASC'
	// limit and offset defaults and query overrides
	let limit = 4000;
	let offset = 0;
	let batchSize = 100;
	let i, j, k = 0;
	let newProductList = [];
	let sliceProductList = [];
	let removeProductList = [];
	let prom = [];
	let searchResult = {};
	let searchLen = 0;
	let productLen = 0;
	let results = {};
	let productLoops = 0;
	let sliceStart = 0;
	let sliceEnd = batchSize;
	let searchResp = {
		statusCode: 200,
		message: 'Success.',
		metaData: {
			totalCount: 0
		},
		data: {}
	};

	if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
		limit = parseInt(req.query.limit);
	}
	if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
		offset = parseInt(req.query.offset);
	}

	// add where clause to select by city name and bubble id
	if (req.query.categorySlug) {
		whereInfo = sqlUtils.appendWhere(whereInfo, 'category_slug = ?', req.query.categorySlug);
	}
	if (req.query.index) {
		whereInfo = sqlUtils.appendWhere(whereInfo, 'index = ?', req.query.index);
	}
	if (req.query.status) {
		whereInfo = sqlUtils.appendWhere(whereInfo, 'status = ?', req.query.status);
	}
	//if the limit is more than 100, then we will loop over batches of 100
	searchResp = {
		statusCode: 200,
		message: 'Success.',
		metaData: {
			totalCount: 0
		},
		data: {}
	};
	searchResult = await SearchProductActions.getSearchProducts(whereInfo, sortBy, offset, limit, searchResp);
	//searchLen = 0;
	if (searchResult.data.searchProducts !== undefined)
		searchLen = searchResult.data.searchProducts.length;
	// if we get results back, loop through search results and insert new records into Algolia
	if (searchLen > 0) {
		for (j = 0; j < searchLen; j++) {
			switch (searchResult.data.searchProducts[j].status) {
				case 'LIVE':
					//do nothing with products that are live
					break;
				case 'NEW':
				case 'UPDATE':
					newProductList.push(JSON.parse(searchResult.data.searchProducts[j].product_data));
					prom.push(SearchProducts.updateStatusSearchProduct(searchResult.data.searchProducts[j].id, "LIVE"));
					break;
				case 'REMOVE':
					removeProductList.push(searchResult.data.searchProducts[j].sku);
					break;
			}
		}
		productLen = newProductList.length;
		if (productLen > 0) {
			//when the length is greater than batchSize, then we want to break it down into smaller portions
			if (productLen > batchSize) {
				//figure out how many loops we need
				productLoops = Math.ceil(productLen / batchSize);
				sliceStart = 0;
				sliceEnd = batchSize;
				//loop
				for (i = 0; i < productLoops; i++) {
					//break up list
					sliceProductList = newProductList.slice(sliceStart, sliceEnd);
					try {
						await SearchProducts.addNewProductsToAlgoliaIndex(sliceProductList);
					} catch (e) {
						console.log("New exception " + e);
						logUtils.log({
							severity: 'ERROR',
							type: 'ALGOLIA',
							message: JSON.stringify(sliceProductList),
							sessionId: null,
							stackTrace: e.stackTrace
						})
						logUtils.logException(e);
					}
					sliceStart = sliceEnd;
					sliceEnd += batchSize;
					if (sliceEnd > productLen) {
						sliceEnd = productLen;
					}
				}
				results = await Promise.all(prom);
				newProductList = [];
			} else {
				try {
					await SearchProducts.addNewProductsToAlgoliaIndex(newProductList);
				} catch (e) {
					console.log("New exception2 " + e);

					logUtils.log({
						severity: 'ERROR',
						type: 'ALGOLIA',
						message: JSON.stringify(newProductList),
						sessionId: null,
						stackTrace: e.stackTrace
					})
					logUtils.logException(e);
				}
				results = await Promise.all(prom);
				newProductList = [];
			}
		}
		if (removeProductList.length > 0) {
			try {
				SearchProducts.deleteProductsFromAlgolia(removeProductList);
			} catch (e) {
				logUtils.log({
					severity: 'ERROR',
					type: 'ALGOLIA',
					message: JSON.stringify(removeProductList),
					sessionId: null,
					stackTrace: e.stackTrace
				})
				logUtils.logException(e);
			}
			removeProductList.forEach((sku) => {
				SearchProducts.removeSearchProduct(sku);
			})
			removeProductList = [];
		}
	}
	return resp;
}



var queueImagesToConvert = async (req, resp) => {
	var batchSize = (req.query.batchSize) ? parseInt(req.query.batchSize) : 500;
	var count = 0;
	var rows = await Vendors.getImagesToConvert();

	for (var i = 0; i < rows.length; i++) {
		if ((rows[i].mainImageKnockout !== undefined) &&
			(rows[i].mainImageKnockout !== null) &&
			(rows[i].mainImageKnockout.trim().length > 0) &&
			(rows[i].mainImageKnockout.indexOf("rushimages") < 0) &&
			(rows[i].mainImageKnockout.indexOf("rushmarket.com") < 0)) {
			var flag = await Vendors.queueImageForDownload(rows[i].vendorId, rows[i].vendorSku, 'main_image_knockout', rows[i].mainImageKnockout);
			if (flag) {
				count++;
			}
		}

		if ((rows[i].mainImageLifestyle !== undefined) &&
			(rows[i].mainImageLifestyle !== null) &&
			(rows[i].mainImageLifestyle.trim().length > 0) &&
			(rows[i].mainImageLifestyle.indexOf("rushimages") < 0) &&
			(rows[i].mainImageLifestyle.indexOf("rushmarket.com") < 0)) {
			var flag = await Vendors.queueImageForDownload(rows[i].vendorId, rows[i].vendorSku, 'main_image_lifestyle', rows[i].mainImageLifestyle);
			if (flag) {
				count++;
			}
		}

		if ((rows[i].altImage3 !== undefined) &&
			(rows[i].altImage3 !== null) &&
			(rows[i].altImage3.trim().length > 0) &&
			(rows[i].altImage3.indexOf("rushimages") < 0) &&
			(rows[i].altImage3.indexOf("rushmarket.com") < 0)) {
			var flag = await Vendors.queueImageForDownload(rows[i].vendorId, rows[i].vendorSku, 'alt_image3', rows[i].altImage3);
			if (flag) {
				count++;
			}
		}

		if ((rows[i].altImage4 !== undefined) &&
			(rows[i].altImage4 !== null) &&
			(rows[i].altImage4.trim().length > 0) &&
			(rows[i].altImage4.indexOf("rushimages") < 0) &&
			(rows[i].altImage4.indexOf("rushmarket.com") < 0)) {
			var flag = await Vendors.queueImageForDownload(rows[i].vendorId, rows[i].vendorSku, 'alt_image4', rows[i].altImage4);
			if (flag) {
				count++;
			}
		}

		if ((rows[i].altImage5 !== undefined) &&
			(rows[i].altImage5 !== null) &&
			(rows[i].altImage5.trim().length > 0) &&
			(rows[i].altImage5.indexOf("rushimages") < 0) &&
			(rows[i].altImage5.indexOf("rushmarket.com") < 0)) {
			var flag = await Vendors.queueImageForDownload(rows[i].vendorId, rows[i].vendorSku, 'alt_image5', rows[i].altImage5);
			if (flag) {
				count++;
			}
		}

		if ((rows[i].swatchImage6 !== undefined) &&
			(rows[i].swatchImage6 !== null) &&
			(rows[i].swatchImage6.trim().length > 0) &&
			(rows[i].swatchImage6.indexOf("rushimages") < 0) &&
			(rows[i].swatchImage6.indexOf("rushmarket.com") < 0)) {
			var flag = await Vendors.queueImageForDownload(rows[i].vendorId, rows[i].vendorSku, 'swatch_image6', rows[i].swatchImage6);
			if (flag) {
				count++;
			}
		}

		if (count > batchSize) {
			break;
		}
	}

	return resp;
}


var downloadAndStoreImages = async (req, resp) => {
	var batchSize = ((req.query !== undefined) && (req.query.batchSize !== undefined)) ? parseInt(req.query.batchSize) : 800;
	var storageContext = fileUtils.getContext("CATALOG", "UNIQUE");

	var rows = await Vendors.getPendingImageDownloads(batchSize);
	var images = [];
	for (var i = 0; i < rows.length; i++) {
		var imageResults = null;
		try {
			var parsed = url.parse(rows[i].url);
			images.push({
				fileName: path.basename(parsed.pathname),
				url: rows[i].url
			})

			var r = {
				body: {
					images: images
				},
				query: {
					relativePath: `vendors/${rows[i].vendorId}/images`
				}
			}

			imageResults = await imageActions.storeImageUrls(storageContext, r, resp);
		} catch (e) {}

		if ((imageResults !== null) && (imageResults.data.imageUrls[0].statusCode === 200)) {
			var updateResult = await Vendors.updateProductImage(rows[i].vendorId, rows[i].vendorSku, rows[i].columnName, imageResults.data.imageUrls[0].url);
			if (updateResult.affectedRows === 1) {
				await Vendors.markImageSuccess(rows[i].id, imageResults.data.imageUrls[0].url);
			} else {
				await Vendors.markImageFail(rows[i].id);
			}
		} else {
			await Vendors.markImageFail(rows[i].id);
		}
		if (imageResults !== null) {
			console.log(imageResults.data.imageUrls[0].statusCode + " " + rows[i].url + " " + imageResults.data.imageUrls[0].url)
		}

		images = [];
	}

	return resp;
}



var sendAdhoc = async () => {
	var rows = await AdhocEmail.getBatch(100);

	await comms.sendQueuedEmail(rows);

	await AdhocEmail.markSent(rows);

	return rows.length;
}



module.exports = {
	averageShippingByCategory,
	captureDnPMessaging,
	copyCoinsToCoreleap,
	copyVendorsToCoreleap,
	dataCheckNotifications,
	dataIntegrity,
	downloadAndStoreImages,
	generateAttributeNameValues,
	generateCatNav,
	generateTaxonomyProducts,
	generateMemberAliases,
	generatePrefixes,
	generateVendorPOs,
	rippleTransitions,
	moveMembers,
	processCatalogJobs,
	processExportJobs,
	processInventoryJobs,
	processInventoryShortages,
	processMandrillResends,
	sendAdhoc,
	stageProductDataforSearch,
	SyncSearchWithAlgolia,
	tagMembers,
	queueImagesToConvert
}
