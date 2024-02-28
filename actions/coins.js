'use strict';

const _ = require('lodash');

const amqp = require('amqplib');
const excel = require('exceljs');
const fs = require('fs').promises;
const gtin = require('gtin');
const {
	promisify
} = require('util');
const sleep = promisify(setTimeout);

const jwtUtils = require('../actions/jwtUtils');

const comms = require('../utils/comms');
const configUtils = require('../utils/configUtils');
const fileUtils = require('../utils/fileUtils');
const logUtils = require('../utils/logUtils');
const {
	formatResp
} = require('../utils/response');


const Coins = require('../models/coins');
const Metros = require('../models/metros');
const RushProducts = require('../models/rushProducts');
const Vendors = require('../models/vendors');



var coinDiscrepancies = async (req, resp) => {

	resp.data = await Coins.getDiscrepancies(req.query.verbose ? true : false);

	return resp;
}




var dedupe = async (req, resp) => {
	var suspect = await Coins.getSuspectCOINs();

	for (var i = 0; i < suspect.length; i++) {
		if (suspect[i].upc === null) {
			continue;
		}
		var prom = [];
		// console.log("Checking " + suspect[i].upc + " " + suspect[i].num);
		var upc = await Coins.getSuspectByUPC(suspect[i].upc);
		var upcCoins = [];

		for (var j = 0; j < upc.length; j++) {
			upcCoins.push(upc[j].coinId);
		}

		prom.push(Coins.getSuspectCoin(upcCoins));
		prom.push(Coins.getSuspectManuMPN(upcCoins));
		prom.push(Coins.getSuspectVendorSkus(upcCoins));

		var results = await Promise.all(prom);
		var coins = results[0];
		var mpn = results[1];
		var vskus = results[2];


		//	Are all returning the same count of coins?
		if ((upcCoins.length === coins.length) && (upcCoins.length === mpn.length) && (upcCoins.length === vskus.length)) {
			// console.log("      Same length: " + suspect[i].upc);
			// console.log(JSON.stringify(upcCoins, undefined, 2));
			// console.log(JSON.stringify(coins, undefined, 2));
			// console.log(JSON.stringify(mpn, undefined, 2));
			// console.log(JSON.stringify(vskus, undefined, 2));

			var goodFlag = true;
			var lastVSku = '';
			for (var j = 0; j < upcCoins.length; j++) {
				if (j === 0) {
					lastVSku = vskus[0].vendorSku;
				}
				// console.log(upcCoins[j] + " " + coins[j].id + " " + mpn[j].coinId + " " + vskus[j].coinId + " " + vskus[j].vendorSku);
				if ((upcCoins[j] !== coins[j].id) ||
					(upcCoins[j] !== mpn[j].coinId) ||
					(upcCoins[j] !== vskus[j].coinId) ||
					(lastVSku !== vskus[j].vendorSku)) {
					goodFlag = false;
				}
			}
			if (goodFlag) {
				var quantity = await RushProducts.getOnlineByVendorSku(vskus[0].vendorSku);
				if (quantity.length > 0) {
					// No live online quantity
					if (quantity[0].quantity === 0) {
						upcCoins = upcCoins.slice(1);
						// console.log("      Removing " + JSON.stringify(upcCoins, undefined, 2));
						await Coins.deleteCoins(upcCoins);
					}
				}
			}

		} else {
			// console.log("      Different lengths: " + suspect[i].upc);

			// if same coin twice for the same upc, and mpn is missing 
			if ((upcCoins.length === 2) && (upc[0].coinId === upc[1].coinId) && (upcCoins[0] === upcCoins[1]) && (mpn.length === 0)) {
				if (vskus.length === 1) {
					// console.log("      Removing " + JSON.stringify(upcCoins, undefined, 2));
					await Coins.deleteUpc(upc[1].id);
				}
			} else if ((vskus.length === 2) && (upc[0].coinId !== upc[1].coinId) && (vskus[0].vendorSku === vskus[1].vendorSku) &&
				(upcCoins[0] !== upcCoins[1]) && (mpn.length === 0)) {
				// console.log("      Removing " + JSON.stringify(upcCoins, undefined, 2));
				await Coins.deleteCoin(upc[1].coinId);
				await Coins.deleteUpc(upc[1].id);
				await Coins.deleteVendorSku(vskus[1].id);
			}


			// // matching lengths with a missing mpn
			// else if ((upcCoins.length === 2) && (upcCoins.length === coins.length) && (upcCoins.length === vskus.length)) {
			// 	var goodFlag = true;
			// 	var lastVSku = '';
			// 	for (var j = 0; j < upcCoins.length; j++) {
			// 		if (j === 0) {
			// 			lastVSku = vskus[0].vendorSku;
			// 		}
			// 		// console.log(upcCoins[j] + " " + coins[j].id + " " + mpn[j].coinId + " " + vskus[j].coinId + " " + vskus[j].vendorSku);
			// 		if ((upcCoins[j] !== coins[j].id) ||
			// 			(upcCoins[j] !== vskus[j].coinId) ||
			// 			(lastVSku !== vskus[j].vendorSku)) {
			// 			goodFlag = false;
			// 		}
			// 	}
			// 	if (goodFlag) {
			// 		var quantity = await RushProducts.getOnlineByVendorSku(vskus[0].vendorSku);
			// 		if (quantity.length > 0) {
			// 			// No live online quantity
			// 			if (quantity[0].quantity === 0) {
			// 				upcCoins = upcCoins.slice(1);
			// 				console.log("      Removing " + JSON.stringify(upcCoins, undefined, 2));
			// 				await Coins.deleteCoins(upcCoins);
			// 			}
			// 		}
			// 	}

			// }

		}

	}

	return resp;
};




//
//  Main function that attempts to match a sku with an existing COIN by UPC, then manu+MPN, then vendor sku.  If it can't a new COIN will be minted.
//
var mintOrMatch = async (product, resp) => {
	var prom = [];
	resp.minted = 0;
	resp.mapped = 0;

	prom.push(Coins.getByManufacturerMPN(product.manufacturer, product.mpn));
	prom.push(Coins.getByUPC(product.upc));
	prom.push(Coins.getByVendorSku(product.vendorId, product.vendorSku));
	var result = await Promise.all(prom);

	var byManufacturerMPN = result[0];
	var byUPC = result[1];
	var byVendorSku = result[2];


	//	Perform some sanity checks to alert if something is screwy.
	try {
		await sanityChecks(product, byUPC, byManufacturerMPN, byVendorSku);
	} catch (e) {
		await logUtils.log({
			type: 'COIN',
			message: e.message
		});
		resp.statusCode = 409;
		resp.message = e.message;
		return resp;
	}

	//
	//	First check to see if this SKU matches on an existing COIN.
	//
	var coinInfo = await checkExistingCoinMatch(product, byUPC, byManufacturerMPN, byVendorSku);

	//
	//	If no match could be made, create a COIN if data allows.
	//
	if (coinInfo.coinId === 0) {
		resp.minted++;
		await mintCoin(product, resp);
	} else {
		resp.id = coinInfo.coinId;
		resp.listedOnMarketplace = coinInfo.listedOnMarketplace;
		if (coinInfo.newMapping === true) {
			// console.log("Matched: " + resp.id + " " + product.vendorId + " " + product.vendorSku + " " + product.upc + " " + product.manufacturer + " " + product.mpn);
			resp.mapped++;
		}
	}

	return resp;
};


//
//	Store data-to-COIN mappings if product can be matched to an existing COIN.
//
var checkExistingCoinMatch = async (product, byUPC, byManufacturerMPN, byVendorSku) => {
	var flag = false;
	var coinInfo = {
		coinId: 0,
		listedOnMarketplace: false,
		newMapping: false
	}

	//	If already a COIN associated with the UPC...
	if (byUPC.length === 1) {
		coinInfo.coinId = byUPC[0].coinId;

		//	Check for pullDataForward set on another vendor sku in this COIN before linking.   If found, unset it for this vendor sku.
		await pullDataForwardCheck(coinInfo.coinId, product.vendorId, product.vendorSku);

		//	Link the vendor sku and the manufacturer/MPN to it if it isn't already.
		await linkVendorSku(byVendorSku, coinInfo, product.vendorId, product.vendorSku);
		await linkManufacturerMPN(byManufacturerMPN, coinInfo, product.manufacturer, product.mpn);
	}

	//	If already COIN matched to manufacturer + MPN 
	else if (byManufacturerMPN.length === 1) {
		coinInfo.coinId = byManufacturerMPN[0].coinId;

		//	Check for pullDataForward set on another vendor sku in this COIN before linking.   If found, unset it for this vendor sku.
		await pullDataForwardCheck(coinInfo.coinId, product.vendorId, product.vendorSku);

		//	Link the vendor sku and the UPC to it if it isn't already.
		await linkVendorSku(byVendorSku, coinInfo, product.vendorId, product.vendorSku);
		await linkUPC(byUPC, coinInfo, product.upc);
	}


	//	If already COIN matched to vendor id + vendor sku
	else if (byVendorSku.length === 1) {
		coinInfo.coinId = byVendorSku[0].coinId;

		//	Check for pullDataForward set on another vendor sku in this COIN before linking.   If found, unset it for this vendor sku.
		await pullDataForwardCheck(coinInfo.coinId, product.vendorId, product.vendorSku);

		//	Link the manufacturer/MPN and UPC to it if it isn't already.
		await linkManufacturerMPN(byManufacturerMPN, coinInfo, product.manufacturer, product.mpn);
		await linkUPC(byUPC, coinInfo, product.upc);
	}

	return coinInfo;
}



var pullDataForwardCheck = async (coinId, vendorId, vendorSku) => {

	//	Lookup existing vendor skus for this COIN that have pull data forward set.
	var pdfCount = await Coins.getPullForwardCountById(coinId, vendorId, vendorSku);

	if (pdfCount > 0) {
		await Vendors.setPullDataForwardFlag(vendorId, vendorSku, false);
	}

}


//
//  Create a new COIN and parent COIN.
//
var mintCoin = async (product, resp) => {
	var parentCoin = null;
	var validUpcFlag = false;

	//	If this is the first variant sku, also mint a parent coin, otherwise, look it up.
	//	It is assumed we always have vendor ID and vendor SKU.  
	if ((product.variantSku !== undefined) && (!product.variantSku.endsWith('-1'))) {
		var p = await Coins.lookupParentCoin(product.sku + '-1');
		if (p.length === 1) {
			parentCoin = p[0].parentId;
		}
	}


	//	If no COIN but we have valid data points to mint one, mint it!
	try {
		validUpcFlag = gtin.validate(product.upc);
	} catch (e) {}

	//	If not a valid UPC, null it out.
	if (!validUpcFlag) {
		product.upc = null;
	}

	if (((product.upc !== undefined) && (product.upc !== null) && (validUpcFlag)) ||
		((product.mpn !== undefined) && (product.mpn !== null) && (product.mpn.length > 0)) ||
		((product.vendorId !== undefined) && (product.vendorId !== null) && (product.vendorId.length > 0) && (product.vendorSku !== undefined) && (product.vendorSku !== null) && (product.vendorSku.length > 0))) {
		var result = await Coins.create(parentCoin, product);
		resp.id = result.coinId;
		resp.parentId = result.parentId;
	} else {
		throw new Error("Could not create COIN for " + JSON.stringify(product, undefined, 2));
	}
}


//	Link COIN to manufacturer + MPN.
var linkManufacturerMPN = async (byManufacturerMPN, coinInfo, manufacturer, mpn) => {
	if ((byManufacturerMPN.length === 0) && (mpn !== undefined) && (mpn !== null)) {
		var result = await Coins.linkToManufacturerMPN(coinInfo.coinId, manufacturer, mpn);
		if (result.affectedRows === 1) {
			coinInfo.newMapping = true;
		}
	}
}


//	Link COIN to UPC.
var linkUPC = async (byUPC, coinInfo, upc) => {
	if ((byUPC.length === 0) && (upc !== undefined) && (upc !== null)) {
		var result = await Coins.linkToUPC(coinInfo.coinId, upc);
		if (result.affectedRows === 1) {
			coinInfo.newMapping = true;
		}
	}
}


//	Link COIN to vendor ID + vendor SKU.
var linkVendorSku = async (byVendorSku, coinInfo, vendorId, vendorSku) => {
	if ((byVendorSku.length === 0) && (vendorId !== undefined) && (vendorId !== null) && (vendorSku !== undefined) && (vendorSku !== null)) {
		var result = await Coins.linkToVendorSku(coinInfo.coinId, vendorId, vendorSku);
		if (result.affectedRows === 1) {
			coinInfo.newMapping = true;
		}
	}
}


//
//	COIN-related data sanity checks to notify via logged error if we're doing anything silly.
//
var sanityChecks = (product, byUPC, byManufacturerMPN, byVendorSku) => {
	var manufacturerMPNCoin = undefined;
	var upcCoin = undefined;
	var vendorSkuCoin = undefined;


	//	Should be only one COIN for any matching datapoints and they should match!
	if (byUPC.length === 1) {
		upcCoin = byUPC[0].coinId;

		//	As directed by Kerri 3/2/21, removing this sanity check so that products with different manu+mpn aren't rejected.
		//	Make sure manu + MPN on existing COIN matches the one on the product.
		// if ((product.manufacturer !== undefined) && (product.mpn !== undefined) &&
		// 	(byUPC[0].manufacturer !== null) && (byUPC[0].mpn !== null) &&
		// 	((product.manufacturer !== byUPC[0].manufacturer) || (product.mpn !== byUPC[0].mpn))) {
		// 	throw new Error("UPCs match but manufacturer + MPNs do not for UPC: " + product.upc + " COIN manufacturer: " + byUPC[0].manufacturer + " COIN MPN: " + byUPC[0].mpn + " COIN UPC: " + byUPC[0].upc + " product vendorSku: " + product.vendorSku + " product manufacturer: " + product.manufacturer + " mpn: " + product.mpn);
		// }
	}
	if (byUPC.length > 1) {
		throw new Error("More than one COIN minted for UPC: " + product.upc);
	}

	if (byManufacturerMPN.length === 1) {
		manufacturerMPNCoin = byManufacturerMPN[0].coinId;

		//	Make sure UPC on existing COIN matches the one on the product.
		if ((product.upc !== undefined) && (byManufacturerMPN[0].upc !== null) && (product.upc !== byManufacturerMPN[0].upc)) {
			throw new Error("Manufacturer + MPN match but UPCs do not for manufacturer: " + product.manufacturer + " MPN: " + product.mpn + " COIN UPC: " + byManufacturerMPN[0].upc + " product vendorSku: " + product.vendorSku + " product UPC: " + product.upc);
		}
	}
	if (byManufacturerMPN.length > 1) {
		throw new Error("More than one COIN minted for manufacturer: " + product.manufacturer + " MPN: " + product.mpn + " " + JSON.stringify(byManufacturerMPN, undefined, 2));
	}

	if (byVendorSku.length === 1) {
		vendorSkuCoin = byVendorSku[0].coinId;
	}
	if (byVendorSku.length > 1) {
		throw new Error("More than one COIN minted for vendor ID: " + product.vendorId + " SKU: " + product.vendorSku + " " + JSON.stringify(byVendorSku, undefined, 2));
	}


	//	All COINs should be the same.
	if (((manufacturerMPNCoin !== undefined) && (upcCoin !== undefined) && (manufacturerMPNCoin !== upcCoin)) ||
		((vendorSkuCoin !== undefined) && (upcCoin !== undefined) && (vendorSkuCoin !== upcCoin)) ||
		((manufacturerMPNCoin !== undefined) && (vendorSkuCoin !== undefined) && (manufacturerMPNCoin !== vendorSkuCoin))) {
		throw new Error("COINs that should match do not.  UPC: " + product.upc + " vendor ID: " + product.vendorId + " SKU: " + product.vendorSku + " ManuCOIN: " + manufacturerMPNCoin + " VendorCOIN: " + vendorSkuCoin + " UPCCOIN: " + upcCoin);
	}


}



var getAll = async (offset, limit, resp) => {
	var coins = await Coins.getAll(offset, limit);

	resp.metaData.totalCount = coins.totalCount;
	if (coins.rows.length === 0) {
		formatResp(resp, undefined, 404, "No COINs found.")
	} else {
		resp.data.coins = coins.rows;
	}

	return resp;
};



var getById = async (id, includeProducts, resp) => {
	var coins = await Coins.getById(id, includeProducts);

	if (coins.coin.length === 0) {
		formatResp(resp, undefined, 404, "No COIN found.")
	} else {
		resp.data = coins.coin[0];
		if (coins.products.length > 0) {
			resp.data.products = coins.products;
		}
	}

	return resp;
};


var getAllMarginThresholds = async (resp, coinFilter, nameFilter) => {
	var coins = await Coins.getAllMarginThresholds(coinFilter, nameFilter);

	if (coins.coins.length === 0) {
		formatResp(resp, ["data"], 404, "No COIN found.")
	} else {
		resp.data.coins = coins.coins;
	}

	return resp;
};



var updateMarginThresholds = async (req, resp) => {
	var s = _.split(req.body.coins, ',');

	resp.data.results = [];

	for (var i = 0; i < s.length; i++) {
		var r = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};

		var c = await getById(s[i], false, r);

		if (c.statusCode !== 200) {
			resp.data.results.push({
				coinId: s[i],
				statusCode: c.statusCode
			});
		} else {
			var result = await Coins.updateMarginThreshold(s[i], req.body.marginThreshold);
			resp.data.results.push({
				coinId: s[i],
				statusCode: 200
			});
		}
	}

	return resp;
};



var deleteMarginThresholds = async (req, resp) => {
	var s = _.split(req.body.coins, ',');

	resp.data.results = [];

	for (var i = 0; i < s.length; i++) {
		var r = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};

		var c = await getById(s[i], false, r);

		if (c.statusCode !== 200) {
			resp.data.results.push({
				coinId: s[i],
				statusCode: c.statusCode
			});
		} else {
			var result = await Coins.deleteMarginThreshold(s[i]);
			resp.data.results.push({
				coinId: s[i],
				statusCode: 200
			});
		}
	}

	return resp;
};






var getSiblingsById = async (id, includeProducts, resp) => {
	var coins = await Coins.getSiblingsById(id, includeProducts);

	if (coins.coins.length === 0) {
		formatResp(resp, undefined, 404, "No COIN found.")
	} else {
		resp.data = coins.coins;
		if (coins.products.length > 0) {
			resp.data.products = coins.products;
		}
	}

	return resp;
};



var getByManufacturerMPNs = async (manufacturerMPNs, resp) => {
	var coins = await Coins.getByManufacturerMPNs(manufacturerMPNs);

	for (var i = 0; i < manufacturerMPNs.length; i++) {
		//	Lookup manufacturer / mpn in coins results.
		var coin = _.find(coins, function (c) {
			return ((c.manufacturer === manufacturerMPNs[i].manufacturer) && (c.mpn === manufacturerMPNs[i].mpn));
		})

		if (coin === undefined) {
			manufacturerMPNs[i].coinId = null;
		} else {
			manufacturerMPNs[i].coinId = coin.coinId;
		}
	}

	resp.data.manufacturerMPNs = manufacturerMPNs;

	return resp;
};



var getByVendorSkus = async (vendorSkus, resp) => {
	var coins = [];
	var notNullCoins = 0;
	var nullCoins = 0;
	var offset = 0;
	var limit = process.env.COIN_LOOKUP_LIMIT ? process.env.COIN_LOOKUP_LIMIT : 250;
	var prom = [];
	var total = 0;


	while (offset < vendorSkus.length) {
		if ((offset + limit) > vendorSkus.length) {
			limit = vendorSkus.length - offset;
		}
		prom.push(Coins.getByVendorSkus(vendorSkus, offset, limit));

		offset += limit;

		if (i % 1000 === 0) {
			await sleep(500);
		}


	}

	var results = await Promise.all(prom);
	for (var i = 0; i < results.length; i++) {
		coins = _.concat(coins, results[i]);
	}


	for (var i = 0; i < vendorSkus.length; i++) {

		//	Lookup vendorId / vendorSku in coins results.
		var coin = _.find(coins, function (c) {
			return ((c.vendorId.toUpperCase() === vendorSkus[i].vendorId.toUpperCase()) && (c.vendorSku.toUpperCase() === vendorSkus[i].vendorSku.toUpperCase()));
		})

		if (coin === undefined) {
			vendorSkus[i].coinId = null;
			vendorSkus[i].listedOnMarketplace = false;
			nullCoins++;
		} else {
			vendorSkus[i].coinId = coin.coinId;
			vendorSkus[i].listedOnMarketplace = coin.listedOnMarketplace;
			notNullCoins++;
		}

		if (i % 1000 === 0) {
			await sleep(500);
		}

	}


	resp.data.notNullCoins = notNullCoins;
	resp.data.nullCoins = nullCoins;
	resp.data.vendorSkus = vendorSkus;

	return resp;
};



var remove = async (coinId, resp) => {
	var coin = await Coins.getById(coinId);

	if (coin.length === 0) {
		formatResp(resp, undefined, 404, "COIN not found.")
	} else {
		var upc = await Coins.getUPCByCoinId(coinId);
		var vendor = await Coins.getVendorSkuByCoinId(coinId);

		if ((upc.length > 0) || (vendor.length > 0)) {
			formatResp(resp, undefined, 403, "COIN linked to UPC or Vendor SKU.")
		} else {
			await Coins.delById(coinId);
		}
	}

	return resp;
};



//
//	Vendor Sku has been updated, see if we need to migrate it to a different COIN.
//
var updateCheck = async (oldProduct, newProduct, resp) => {
	var coinMovementFlag = false;
	var coinMovementMessage = null;
	var coinMovementType = 'UNKNOWN';
	var originalCoin = null;
	var newCoin = null;


	//	See if there is a COIN associated with the new UPC.
	var newUpcCoin = await Coins.getByUPC(newProduct.upc);
	var newManuCoin = await Coins.getByManufacturerMPN(newProduct.manufacturer, newProduct.mpn);


	//	This will tell us if there's a COIN assigned to this sku.  
	var oldCoin = await Coins.getByVendorSku(oldProduct.vendorId, oldProduct.vendorSku);

	if (oldCoin.length > 0) {
		originalCoin = await Coins.getById(oldCoin[0].coinId);

		resp.coinId = oldCoin[0].coinId;
		resp.listedOnMarketplace = oldCoin[0].listedOnMarketplace ? true : false;
		resp.parentId = oldCoin[0].parentId;
	}


	//
	//	Is the UPC CHANGING, UPC drives process.
	//
	if ((newProduct.upc !== null) && (newProduct.upc !== oldProduct.upc)) {

		//	If UPC is present and there is no current COIN, mintOrMatch.
		if (oldCoin.length === 0) {
			var result = await mintOrMatch(newProduct, {});

			resp.coinId = result.id;
			resp.listedOnMarketplace = result.listedOnMarketplace ? true : false;
			resp.parentId = result.parentId;
		}

		//	If UPC is present and there is a current COIN, align this vendor skus with the current COIN because one-to-one UPC to COIN.
		else {

			//	How many skus associated with this COIN?  Determines if we need to delete an orphaned COIN or not.
			var skuCount = 0;
			if (oldCoin.length > 0) {
				skuCount = await Coins.getVendorSkuByCoinId(oldCoin[0].coinId);
			}

			//	If this is the only vendor SKU mapped to the old COIN and no COIN mapped to new UPC, update mappings with new datapoints. 
			if ((skuCount.length === 1) && (newUpcCoin.length === 0)) {
				await Coins.updateMappingsById(oldCoin[0].coinId, newProduct);
				resp.coinId = oldCoin[0].coinId;
				resp.listedOnMarketplace = oldCoin[0].listedOnMarketplace ? true : false;
				resp.parentId = oldCoin[0].parentId;
			}

			//	If this is the only vendor SKU mapped to the old COIN and there IS a COIN mapped to new UPC, remove old COIN. 
			else if ((skuCount.length === 1) && (newUpcCoin.length === 1)) {
				await Coins.forceDelById(oldCoin[0].coinId);

				var result = await mintOrMatch(newProduct, {});

				if (result.id !== undefined) {
					resp.coinId = result.id;
					resp.listedOnMarketplace = result.listedOnMarketplace ? true : false;
					resp.parentId = result.parentId;

					coinMovementType = 'SINGLE_UPC_UPDATED_REMOVE_OLD';
					coinMovementFlag = true;
				}
			}

			//	If this is NOT the only vendor SKU mapped to this COIN, bring the other vendor skus to the new COIN but only if their UPC doesn't exist or matches the old UPC.  
			//	Otherwise, leave old associations.
			else {

				//	Detach from coins_to_vendor_skus leave other mappings for other vendor skus mapped to the old COIN.
				await Coins.unlinkFromVendorSku(oldCoin[0].coinId, newProduct.vendorId, newProduct.vendorSku);

				//	If new UPC doesn't have a COIN, mint it.	If new UPC does have a COIN, match it.
				var result = await mintOrMatch(newProduct, {});

				if (result.id !== undefined) {
					resp.coinId = result.id;
					resp.listedOnMarketplace = result.listedOnMarketplace ? true : false;
					resp.parentId = result.parentId;

					coinMovementType = 'MULTIPLE_UPC_UPDATED';
					coinMovementFlag = true;
				}
			}
		}


		//
		//  Manufacturer + MPN driving the process.
		//
	} else if ((newProduct.manufacturer + newProduct.mpn) !== (oldProduct.manufacturer + oldProduct.mpn)) {

		//	If Manu + MPN is present and there is no current COIN, mintOrMatch.
		if (oldCoin.length === 0) {
			var result = await mintOrMatch(newProduct, {});

			resp.coinId = result.id;
			resp.listedOnMarketplace = result.listedOnMarketplace ? true : false;
			resp.parentId = result.parentId;
		}
		//	If UPC is present there and there is a current COIN, one-to-one UPC to COIN.
		else {
			//	How many skus associated with this COIN?  Determines if we need to delete an orphaned COIN or not.
			var skuCount = 0;
			if (oldCoin.length > 0) {
				skuCount = await Coins.getVendorSkuByCoinId(oldCoin[0].coinId);
			}


			//	If updating manu+MPN, only one vendor SKU is mapped to the COIN, no COIN mapped to new manu+MPN, update mappings with new datapoints. 
			if ((skuCount.length === 1) && (newManuCoin.length === 0)) {
				await Coins.updateMappingsById(oldCoin[0].coinId, newProduct);
				resp.coinId = oldCoin[0].coinId;
				resp.listedOnMarketplace = oldCoin[0].listedOnMarketplace ? true : false;
				resp.parentId = oldCoin[0].parentId;
			}

			//	If updating UPC, only one vendor SKU is mapped to the COIN, is a COIN mapped to new UPC, make sure manu + MPN match.  If so, remove old COIN. 
			else if ((skuCount.length === 1) && (newManuCoin.length === 1)) {
				await Coins.forceDelById(oldCoin[0].coinId);

				var result = await mintOrMatch(newProduct, {});

				if (result.id !== undefined) {
					resp.coinId = result.id;
					resp.listedOnMarketplace = result.listedOnMarketplace ? true : false;
					resp.parentId = result.parentId;

					coinMovementType = 'SINGLE_MPN_UPDATED_REMOVE_OLD';
					coinMovementFlag = true;
				}
			}

			//	If updating UPC and there are other vendor SKUs mapped to this COIN, leave old associations.
			else {
				//	Detach from coins_to_vendor_skus
				await Coins.unlinkFromVendorSku(oldCoin[0].coinId, newProduct.vendorId, newProduct.vendorSku);

				//	If new UPC doesn't have a COIN, mint it.	If new UPC does have a COIN, match it.
				var result = await mintOrMatch(newProduct, {});

				if (result.id !== undefined) {
					resp.coinId = result.id;
					resp.listedOnMarketplace = result.listedOnMarketplace ? true : false;
					resp.parentId = result.parentId;

					coinMovementType = 'MULTIPLE_MPN_UPDATED';
					coinMovementFlag = true;
				}
			}
		}
	}

	if (coinMovementFlag) {
		newCoin = await Coins.getById(resp.coinId);
		newCoin = newCoin.coin[0];

		originalCoin = originalCoin.coin[0];

		// console.log("MOVING " + originalCoin.id + " to " + newCoin.id);

		//	If either COIN is listed on a marketplace, notify team of COIN movement.
		if ((newCoin.listedOnMarketplace) || (originalCoin.listedOnMarketplace)) {
			var n = newCoin.id;
			var o = originalCoin.id;

			if (originalCoin.listedOnMarketplace) {
				o += " (marketplace LISTED) ";
			} else {
				o += " (not marketplace listed) ";
			}

			if (newCoin.listedOnMarketplace) {
				n += " (marketplace LISTED) ";
			} else {
				n += " (not marketplace listed) ";
			}

			switch (coinMovementType) {
				case 'MULTIPLE_UPC_UPDATED':
					coinMovementMessage = 'COIN ' + o + ' moved to COIN ' + n + ' due to UPC update. ' + originalCoin.id + ' has NOT been removed and is still mapped to another sku(s).';
					comms.sendEmail(configUtils.get("COIN_EMAIL"), 'COIN Oversight', coinMovementMessage, coinMovementMessage + 'Check other vendor skus in ' + originalCoin.id, 'noreply@rushmarket.com', undefined, undefined, undefined);
					break;

				case 'MULTIPLE_MPN_UPDATED':
					coinMovementMessage = 'COIN ' + o + ' moved to COIN ' + n + ' due to MPN update. ' + originalCoin.id + ' has NOT been removed and is still mapped to another sku(s).';
					comms.sendEmail(configUtils.get("COIN_EMAIL"), 'COIN Oversight', coinMovementMessage, coinMovementMessage + 'Check other vendor skus in ' + originalCoin.id, 'noreply@rushmarket.com', undefined, undefined, undefined);
					break;

				case 'SINGLE_UPC_UPDATED_REMOVE_OLD':
					coinMovementMessage = 'COIN ' + o + ' moved to COIN ' + n + ' due to UPC update. ' + originalCoin.id + ' has been removed.';
					comms.sendEmail(configUtils.get("MARKETPLACE_EMAIL"), 'Marketplace-related COIN Movement', coinMovementMessage, coinMovementMessage, 'noreply@rushmarket.com', undefined, undefined, undefined);
					break;

				case 'SINGLE_MPN_UPDATED_REMOVE_OLD':
					coinMovementMessage = 'COIN ' + o + ' moved to COIN ' + n + ' due to MPN update. ' + originalCoin.id + ' has been removed.';
					comms.sendEmail(configUtils.get("MARKETPLACE_EMAIL"), 'Marketplace-related COIN Movement', coinMovementMessage, coinMovementMessage, 'noreply@rushmarket.com', undefined, undefined, undefined);
					break;

				default:
					coinMovementMessage = 'Unknown scenario ' + o + ' and ' + n;
					break;
			}

			// console.log("Notifying original COIN " + o + " migrating to new COIN + " + n);
			comms.sendEmail(configUtils.get("COIN_EMAIL"), 'Marketplace-related COIN Movement', coinMovementMessage, coinMovementMessage, 'noreply@rushmarket.com', undefined, undefined, undefined);

		} else {
			// console.log("Niether COIN is listed on a marketplace, no notification.");
		}


	}

	return resp;
};



//
//	
//
var mergeCoins = async (origCoin, destCoin, resp) => {
	var dest = null;
	var orig = null;
	var prom = [];


	//	Double check that destination COIN is valid.
	prom.push(Coins.getById(origCoin));
	prom.push(Coins.getById(destCoin));

	var result = await Promise.all(prom);

	//	Double check that origin COIN is valid.
	if (result[0].coin.length !== 1) {
		resp.statusCode = 404;
		resp.message = "Origin COIN doesn't exist";
	}
	//	Double check that destination COIN is valid.
	else if (result[1].coin.length !== 1) {
		resp.statusCode = 404;
		resp.message = "Destination COIN doesn't exist";
	} else {
		orig = result[0].coin[0];
		dest = result[1].coin[0];

		//	Update coins_to_upc
		await Coins.mergeCoins(origCoin, destCoin);


		//	If either COIN is listed on a marketplace, notify team of COIN movement.
		if ((dest.listedOnMarketplace) || (orig.listedOnMarketplace)) {
			var n = destCoin;
			var o = origCoin;

			if (orig.listedOnMarketplace) {
				o += " (marketplace LISTED) ";
			} else {
				o += " (not marketplace listed) ";
			}

			if (dest.listedOnMarketplace) {
				n += " (marketplace LISTED) ";
			} else {
				n += " (not marketplace listed) ";
			}

			var coinMovementMessage = 'COIN ' + o + ' melded into COIN ' + n + '. ' + origCoin + ' has been removed.';

			// console.log("Notifying original COIN " + o + " migrating to new COIN + " + n);
			comms.sendEmail(configUtils.get("COIN_EMAIL"), 'Marketplace-related COIN Movement', coinMovementMessage, coinMovementMessage, 'noreply@rushmarket.com', undefined, undefined, undefined);

		} 		

	}

	return resp;
};



//
//	
//
var mergeHistory = async (coinId, resp) => {
	var history = await Coins.getMergeHistory(coinId);

	if (history.length === 0) {
		formatResp(resp, undefined, 404, "No merge history found.")
	} else {
		resp.data = history;
	}

	return resp;
};



//
//	This will go through all VC products matching COINs where possible and minting them otherwise.
//
var mintExisting = async (resp) => {
	var limit = 1000;
	var mapped = 0;
	var minted = 0;
	var offset = 0;
	var products = undefined;
	var result = undefined;
	var whereInfo = {
		clause: "",
		values: []
	};


	do {
		whereInfo.values = [];
		result = await Vendors.getAllProducts(whereInfo, 'upc DESC, mpn DESC', offset, limit);

		products = result.rows;

		// console.log("Processing: " + products.length + " " + products[0].vendorSku + " " + products[0].manufacturer + " " + products[0].mpn);
		for (var i = 0; i < products.length; i++) {
			try {

				//	Validate UPC
				if (products[i].upc !== null) {
					try {
						if (gtin.validate(products[i].upc) === false) {
							throw new Error("Invalid UPC: " + products[i].upc);
						}
					} catch (e) {
						if (e.message.startsWith("Barcode is not of a valid format")) {
							e.message = "Invalid UPC: " + products[i].upc;
						}
						logUtils.logException(e);
					}
				}

				await mintOrMatch(products[i], resp);
				minted += resp.minted;
				mapped += resp.mapped;
			} catch (e) {
				if (e.message.startsWith("Barcode is not of a valid format")) {
					e.message = "Invalid UPC: " + products[i].upc;
				}
				logUtils.logException(e);
				// console.log(e.message);
			}
		}

		// console.log("Offset: " + offset + ": Minted: " + minted + " Mapped: " + mapped);
		minted = 0;
		mapped = 0;
		offset = offset + limit;
	} while (result.totalCount > offset)

	// console.log("Minting completed.");

	return resp;
};



//
//	Mint new COINs for any products that aren't associated with a COIN.
//
var mintNew = async (resp) => {
	var limit = 1000;
	var mapped = 0;
	var minted = 0;
	var offset = 0;
	var products = undefined;
	var result = undefined;


	do {
		result = await Vendors.getAllCoinlessProducts(offset, limit);

		products = result.rows;
		// console.log("Processing: " + products.length);
		for (var i = 0; i < products.length; i++) {
			await mintOrMatch(products[i], resp);
			minted += resp.minted;
			mapped += resp.mapped;
		}
		// console.log("Minted: " + minted + " Mapped: " + mapped);

		offset = offset + limit;
	} while (result.totalCount > offset)

	return resp;
};



var updateCoin = async (req, resp) => {
	var userId = 0;

	var c = await Coins.getById(req.params.id);

	if (c.coin.length === 0) {
		formatResp(resp, undefined, 404, "No COINs found.");
	} else {

		//	Check for a userId
		await jwtUtils.verifyTokenInline(req, resp);
		if ((req.decoded !== undefined) && (req.decoded.userId !== undefined)) {
			userId = req.decoded.userId;
		}


		if ((req.body.listedOnMarketplace === 'true') || (req.body.listedOnMarketplace === true) ||
			(req.body.listedOnMarketplace === '1') || (req.body.listedOnMarketplace === 1) ||
			(req.body.listedOnMarketplace === 'Y')) {
			req.body.listedOnMarketplace = true;
		} else {
			req.body.listedOnMarketplace = false;
		}


		var result = await Coins.updateCoin(userId, req.params.id, req.body);
	}

	return resp;
}



var queueMintOrMatch = async (vendorId, vendorSku, manufacturer, mpn, upc, resp) => {
	var queue = process.env.MQ_COIN_Q;

	await sendToQueue(queue, {
		vendorId: vendorId,
		vendorSku: vendorSku,
		manufacturer: manufacturer,
		mpn: mpn,
		upc: upc
	});

	return resp;
}


var sendToQueue = async (queue, msg) => {
	var open = null;
	var conn = null;
	var channel = null;

	try {
		open = amqp.connect(process.env.MQ_URL);
		conn = await open;
		channel = await conn.createChannel();

		var ok = await channel.assertQueue(queue, {
			durable: true
		});
		await channel.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), {
			persistent: true
		});
	} catch (e) {
		console.log('Exception: ' + e);
	} finally {
		if (channel !== null) {
			await channel.close();
		}
		if (conn !== null) {
			await conn.close();
		}
	}
}



var assortmentEligibility = async (resp) => {
	var prom = [];
	var sheetInfo = {
		storageContext: fileUtils.getContext('CATALOG', 'UNIQUE'),
		exportOptions: {
			filename: 'sheets/Assortment-Eligibility-Report.xlsx',
			useStyles: true,
			useSharedStrings: true
		},
		workbook: null,
		byCategoryWorksheet: null,
		byVendorWorksheet: null,
		recipients: `matt@rushmarket.com,${configUtils.get('ASSORTMENT_ELIGIBILITY_EMAIL')}`,
		catRow: 3,
		dsCol: 5,
		nonDSCol: 6,
		totalCol: 7,
		pctTotalCol: 8,
		venRow: 3
	}
	var whereInfo = {
		clause: '',
		values: []
	}


	var metros = await Metros.getAll(whereInfo, 0, 1000);

	sheetInfo.workbook = new excel.stream.xlsx.WorkbookWriter(sheetInfo.exportOptions);

	await initByCategory(sheetInfo, metros);
	await initByVendor(sheetInfo, metros);

	await populateByCategory(sheetInfo, metros);
	await populateByVendor(sheetInfo, metros);

	await sheetInfo.workbook.commit();

	var results = await fileUtils.storeMultipartFile(sheetInfo.storageContext, 'Assortment-Eligibility-Report', sheetInfo.exportOptions.filename, 'Assortment-Eligibility-Report.xlsx', false);

	if (results != undefined) {
		comms.sendEmail(sheetInfo.recipients, 'Assortment Eligibility Report', '', `<br><br><b><a href="${results.url}">Assortment Eligibility Report</a>`, 'noreply@rushmarket.com', undefined, undefined);
		console.log("URL: " + results.url);
	}

	//	Remove the local exported products file.
	await fs.unlink(sheetInfo.exportOptions.filename);

	resp.data.url = results.url;
}



var initByCategory = async (sheetInfo, metros) => {
	sheetInfo.byCategoryWorksheet = sheetInfo.workbook.addWorksheet('By Category');

	//	Populate Metros row
	var mcol = 5;
	for (var i = 0; i < metros.rows.length; i++) {
		sheetInfo.byCategoryWorksheet.getCell(1, mcol).value = metros.rows[i].name;
		mcol += 4;
	}
	await sheetInfo.byCategoryWorksheet.getRow(1).commit();

	//	Populate Header Row
	sheetInfo.byCategoryWorksheet.getCell(2, 1).value = 'Category';
	sheetInfo.byCategoryWorksheet.getCell(2, 2).value = 'Total DS Available';
	sheetInfo.byCategoryWorksheet.getCell(2, 3).value = 'Total On Hand Available';
	sheetInfo.byCategoryWorksheet.getCell(2, 4).value = 'Total Available';
	var mcol = 5;
	for (var i = 0; i < metros.rows.length; i++) {
		sheetInfo.byCategoryWorksheet.getCell(2, mcol++).value = 'DS';
		sheetInfo.byCategoryWorksheet.getCell(2, mcol++).value = 'On Hand';
		sheetInfo.byCategoryWorksheet.getCell(2, mcol++).value = 'Total';
		sheetInfo.byCategoryWorksheet.getCell(2, mcol++).value = '% of Total';
	}
	await sheetInfo.byCategoryWorksheet.getRow(2).commit();
}


var populateByCategory = async (sheetInfo, metros) => {
	var prom = [];
	prom.push(Coins.getDropshipQuantityByCategoryByCity());
	prom.push(Coins.getNonDropshipQuantityByCategoryByCity());
	prom.push(Coins.getQuantityByCategory());
	prom.push(Coins.getDropshipQuantityByCategory());
	prom.push(Coins.getNonDropshipQuantityByCategory());

	var results = await Promise.all(prom);
	var dropship = results[0];
	var nonDropship = results[1];
	var totalAvailable = results[2];
	var totalDS = results[3];
	var totalOH = results[4];

	// Determine a unique list of categories
	var categories = [];
	for (var i = 0; i < dropship.length; i++) {
		if (dropship[i].name !== null) {
			categories.push(dropship[i].name);
		} else {
			categories.push('NONE');
		}
	}
	for (var i = 0; i < nonDropship.length; i++) {
		if (nonDropship[i].name !== null) {
			categories.push(nonDropship[i].name);
		} else {
			categories.push('NONE');
		}
	}

	categories = _.uniq(categories);
	categories = _.sortBy(categories);

	//	Each row starts with the category.
	for (var i = 0; i < categories.length; i++) {
		await populateByMetroByCategory(sheetInfo, categories[i], metros, dropship, nonDropship, totalDS, totalOH, totalAvailable);
	}
}




var populateByMetroByCategory = async (sheetInfo, categoryName, metros, dropship, nonDropship, totalDS, totalOH, totals) => {
	var totalAvailable = 0;
	var totalMetro = 0;
	
	sheetInfo.byCategoryWorksheet.getCell(sheetInfo.catRow, 1).value = categoryName;
	sheetInfo.dsCol = 5;
	sheetInfo.nonDSCol = 6;
	sheetInfo.totalCol = 7;
	sheetInfo.pctTotalCol = 8;


	var totalIndex = _.findIndex(totalDS, function (t) {
		return (t.name === categoryName) ;
	})
	if (totalIndex > -1) {
		sheetInfo.byCategoryWorksheet.getCell(sheetInfo.catRow, 2).value = totalDS[totalIndex].quantity;
	}


	var totalIndex = _.findIndex(totalOH, function (t) {
		return (t.name === categoryName) ;
	})
	if (totalIndex > -1) {
		sheetInfo.byCategoryWorksheet.getCell(sheetInfo.catRow, 3).value = totalOH[totalIndex].quantity;
	}


	var totalIndex = _.findIndex(totals, function (t) {
		return (t.name === categoryName) ;
	})
	if (totalIndex > -1) {
		sheetInfo.byCategoryWorksheet.getCell(sheetInfo.catRow, 4).value = totals[totalIndex].quantity;
		totalAvailable = totals[totalIndex].quantity;
	}


	//	See if there's info for the metro.
	for (var j = 0; j < metros.rows.length; j++) {
		totalMetro = 0;

		var dsIndex = _.findIndex(dropship, function (d) {
			return ((d.city === metros.rows[j].name) && ((d.name === categoryName) || ((d.name === null) && (categoryName === 'NONE'))));
		});

		if (dsIndex > -1) {
			sheetInfo.byCategoryWorksheet.getCell(sheetInfo.catRow, sheetInfo.dsCol).value = dropship[dsIndex].quantity;
			totalMetro += dropship[dsIndex].quantity;
		}


		var nonDSIndex = _.findIndex(nonDropship, function (d) {
			return ((d.city === metros.rows[j].name) && ((d.name === categoryName) || ((d.name === null) && (categoryName === 'NONE'))));
		});

		if (nonDSIndex > -1) {
			sheetInfo.byCategoryWorksheet.getCell(sheetInfo.catRow, sheetInfo.nonDSCol).value = nonDropship[nonDSIndex].quantity;
			totalMetro += nonDropship[nonDSIndex].quantity;
		}

		sheetInfo.byCategoryWorksheet.getCell(sheetInfo.catRow, sheetInfo.totalCol).value = totalMetro;
		sheetInfo.byCategoryWorksheet.getCell(sheetInfo.catRow, sheetInfo.pctTotalCol).value = `${Math.round((totalMetro / totalAvailable) * 100)}%`;


		sheetInfo.dsCol += 4;
		sheetInfo.nonDSCol += 4;
		sheetInfo.totalCol += 4;
		sheetInfo.pctTotalCol += 4;
	}


	await sheetInfo.byCategoryWorksheet.getRow(sheetInfo.catRow).commit();
	sheetInfo.catRow++;
}



var initByVendor = async (sheetInfo, metros) => {
	sheetInfo.byVendorWorksheet = sheetInfo.workbook.addWorksheet('By Vendor');

	//	Populate Metros row
	var mcol = 5;
	for (var i = 0; i < metros.rows.length; i++) {
		sheetInfo.byVendorWorksheet.getCell(1, mcol).value = metros.rows[i].name;
		mcol += 4;
	}
	await sheetInfo.byVendorWorksheet.getRow(1).commit();

	//	Populate Header Row
	sheetInfo.byVendorWorksheet.getCell(2, 1).value = 'Vendor';
	sheetInfo.byVendorWorksheet.getCell(2, 2).value = 'Total DS Available';
	sheetInfo.byVendorWorksheet.getCell(2, 3).value = 'Total On Hand Available';
	sheetInfo.byVendorWorksheet.getCell(2, 4).value = 'Total Available';
	var mcol = 5;
	for (var i = 0; i < metros.rows.length; i++) {
		sheetInfo.byVendorWorksheet.getCell(2, mcol++).value = 'DS';
		sheetInfo.byVendorWorksheet.getCell(2, mcol++).value = 'On Hand';
		sheetInfo.byVendorWorksheet.getCell(2, mcol++).value = 'Total';
		sheetInfo.byVendorWorksheet.getCell(2, mcol++).value = '% of Total';
	}
	await sheetInfo.byVendorWorksheet.getRow(2).commit();
}



var populateByVendor = async (sheetInfo, metros) => {
	var prom = [];
	prom.push(Coins.getDropshipQuantityByVendorByCity());
	prom.push(Coins.getNonDropshipQuantityByVendorByCity());
	prom.push(Coins.getQuantityByVendor());
	prom.push(Coins.getDropshipQuantityByVendor());
	prom.push(Coins.getNonDropshipQuantityByVendor());


	var results = await Promise.all(prom);
	var dropship = results[0];
	var nonDropship = results[1];
	var totalAvailable = results[2];
	var totalDS = results[3];
	var totalOH = results[4];

	// Determine a unique list of vendors
	var vendors = [];
	for (var i = 0; i < dropship.length; i++) {
		if (dropship[i].name !== null) {
			vendors.push(dropship[i].name);
		} else {
			vendors.push('NONE');
		}
	}
	for (var i = 0; i < nonDropship.length; i++) {
		if (nonDropship[i].name !== null) {
			vendors.push(nonDropship[i].name);
		} else {
			vendors.push('NONE');
		}
	}

	vendors = _.uniq(vendors);
	vendors = _.sortBy(vendors);

	//	Each row starts with the category.
	for (var i = 0; i < vendors.length; i++) {
		await populateByMetroByVendor(sheetInfo, vendors[i], metros, dropship, nonDropship, totalDS, totalOH, totalAvailable);
	}
}




var populateByMetroByVendor = async (sheetInfo, vendorName, metros, dropship, nonDropship, totalDS, totalOH, totals) => {
	var totalAvailable = 0;
	var totalMetro = 0;
	
	sheetInfo.byVendorWorksheet.getCell(sheetInfo.venRow, 1).value = vendorName;
	sheetInfo.dsCol = 5;
	sheetInfo.nonDSCol = 6;
	sheetInfo.totalCol = 7;
	sheetInfo.pctTotalCol = 8;


	var totalIndex = _.findIndex(totalDS, function (t) {
		return (t.name === vendorName) ;
	})
	if (totalIndex > -1) {
		sheetInfo.byVendorWorksheet.getCell(sheetInfo.venRow, 2).value = totalDS[totalIndex].quantity;
	}


	var totalIndex = _.findIndex(totalOH, function (t) {
		return (t.name === vendorName) ;
	})
	if (totalIndex > -1) {
		sheetInfo.byVendorWorksheet.getCell(sheetInfo.venRow, 3).value = totalOH[totalIndex].quantity;
	}


	var totalIndex = _.findIndex(totals, function (t) {
		return (t.name === vendorName) ;
	})
	if (totalIndex > -1) {
		sheetInfo.byVendorWorksheet.getCell(sheetInfo.venRow, 4).value = totals[totalIndex].quantity;
		totalAvailable = totals[totalIndex].quantity;
	}


	//	See if there's info for the metro.
	for (var j = 0; j < metros.rows.length; j++) {
		totalMetro = 0;

		var dsIndex = _.findIndex(dropship, function (d) {
			return ((d.city === metros.rows[j].name) && ((d.name === vendorName) || ((d.name === null) && (vendorName === 'NONE'))));
		});

		if (dsIndex > -1) {
			sheetInfo.byVendorWorksheet.getCell(sheetInfo.venRow, sheetInfo.dsCol).value = dropship[dsIndex].quantity;
			totalMetro += dropship[dsIndex].quantity;
		}


		var nonDSIndex = _.findIndex(nonDropship, function (d) {
			return ((d.city === metros.rows[j].name) && ((d.name === vendorName) || ((d.name === null) && (vendorName === 'NONE'))));
		});

		if (nonDSIndex > -1) {
			sheetInfo.byVendorWorksheet.getCell(sheetInfo.venRow, sheetInfo.nonDSCol).value = nonDropship[nonDSIndex].quantity;
			totalMetro += nonDropship[nonDSIndex].quantity;
		}

		sheetInfo.byVendorWorksheet.getCell(sheetInfo.venRow, sheetInfo.totalCol).value = totalMetro;
		sheetInfo.byVendorWorksheet.getCell(sheetInfo.venRow, sheetInfo.pctTotalCol).value = `${Math.round((totalMetro / totalAvailable) * 100)}%`;

		sheetInfo.dsCol += 4;
		sheetInfo.nonDSCol += 4;
		sheetInfo.totalCol += 4;
		sheetInfo.pctTotalCol += 4;
	}


	await sheetInfo.byVendorWorksheet.getRow(sheetInfo.venRow).commit();
	sheetInfo.venRow++;
}


var createCrossListings = async (req, resp) => {
	for (var i=0; i < req.body.crossListings.length; i++) {
		var r = await Coins.createCrossListing(req.body.crossListings[i].coinId, req.body.crossListings[i].crossListCategoryId);
		resp.data.results.push({
			id: r.id,
			coinId: r.coinId,
			statusCode: r.status
		})

	}
}


var updateCrossListings = async (req, resp) => {
	for (var i=0; i < req.body.crossListings.length; i++) {
		var r = await Coins.updateCrossListing(req.body.crossListings[i].id, req.body.crossListings[i].crossListCategoryId);
		resp.data.results.push({
			id: r.id,
			coinId: r.coinId,
			statusCode: r.status
		})
	}
}


var deleteCrossListings = async (req, resp) => {
	for (var i=0; i < req.body.crossListings.length; i++) {
		var r = await Coins.deleteCrossListing(req.body.crossListings[i].id);
		resp.data.results.push({
			id: r.id,
			coinId: r.coinId,
			statusCode: r.status
		})
	}
}


var getCrossListings = async (whereInfo, offset, limit, resp) => {
	var rows = await Coins.getCrossListings(whereInfo, offset, limit);

	resp.data.crossListings = rows;

	return resp;
}


var getCrossListingsById = async (id, resp) => {
	var rows = await Coins.getCrossListingsById(id);

	resp.data.crossListings = rows;

	return resp;
}




module.exports = {
	assortmentEligibility,
	coinDiscrepancies,
	createCrossListings,
	dedupe,
	deleteCrossListings,
	deleteMarginThresholds,
	getAll,
	getAllMarginThresholds,
	getById,
	getByManufacturerMPNs,
	getByVendorSkus,
	getCrossListings,
	getCrossListingsById,
	getSiblingsById,
	mergeCoins,
	mergeHistory,
	mintExisting,
	mintNew,
	mintOrMatch,
	queueMintOrMatch,
	remove,
	updateCheck,
	updateCoin,
	updateCrossListings,
	updateMarginThresholds
}