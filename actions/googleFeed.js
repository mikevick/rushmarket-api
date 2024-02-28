'use strict'


const _ = require('lodash');
const excel = require('exceljs');
const fsSync = require('fs');
const fs = require('fs').promises;
const {
	google
} = require('googleapis');
const ftp = require('basic-ftp');
const moment = require('moment-timezone');


var auth = undefined;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS !== undefined) {
	auth = new google.auth.GoogleAuth({
		keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
		scopes: ['https://www.googleapis.com/auth/content'],
	});
}


google.options({
	validateStatus: function (status) {
		return ((status == 404) || (status >= 200 && status < 300));
	}
});

const content = google.content('v2.1');


const globals = require('../globals');

const rushProductActions = require('./rushProducts');

const Coins = require('../models/coins')
const GDE = require('../models/gdeModel');
const GoogleFeed = require('../models/googleFeed');
const Metros = require('../models/metros');
const Stores = require('../models/stores');
const Vendors = require('../models/vendors');
const ZipToCity = require('../models/zipToCity');

const comms = require('../utils/comms');
const configUtils = require('../utils/configUtils')
const fileUtils = require('../utils/fileUtils')
const logUtils = require('../utils/logUtils')
const memberText = require('../utils/memberTextUtils')
const sqlUtils = require('../utils/sqlUtils')
const productUtils = require('../utils/productUtils')

const {
	formatResp
} = require('../utils/response');
const e = require('express');
const {
	nullFormat
} = require('numeral');
const {
	ContainerSASPermissions, uploadBrowserDataToBlockBlob
} = require('@azure/storage-blob');
const {
	checkVendorSku
} = require('../models/products');
const {
	getDefaultSettings
} = require('http2');
const {
	BodyElement
} = require('soap/lib/wsdl/elements');



var buildTimestamp = new moment();
var scoringRules = [];

//
//	Check if a sku needs to be removed from the Google Shopping Feed
//
var skuDeleteCheck = async (sku, resp) => {
	var skuInfo = await GoogleFeed.getCandidateSku(sku);
	var googleVendors = await Vendors.getMarketplaceVendors('Google');

	//	If sku wasn't found, jump out.
	if (skuInfo.length === 0) {
		return;
	}

	skuInfo = skuInfo[0];

	//	If the sku's vendor isn't good for Google, jump out.
	if (_.findIndex(googleVendors, function (v) {
			return v.vendorId === skuInfo.vendorId;
		}) === -1) {
		return;
	}


	//	Get the vendor catalog product and coin
	var vcp = await Vendors.getProductByVendorSku(skuInfo.vendorId, skuInfo.sellerProductId);
	var c = await Coins.getByVendorSku(skuInfo.vendorId, skuInfo.sellerProductId);

	var coin = null;
	if (c.length > 0) {
		coin = c[0].coinId;
	} else {
		return
	}





	//	If the sku in question is Sold, check to see if it's COIN should still be listed.
	if (skuInfo.status === 'Sold') {
		await checkSoldSkusCoin(coin, skuInfo.sku, resp);
	}

	//	If the sku is NOT Sold, it has gone thru the GDE which may impact how it's listed on Google Shopping
	else {
		await checkLiveSkusCoin(coin, skuInfo.sku, resp);
	}

}



var checkLiveSkusCoin = async (coin, sku, resp) => {
	var deletedFlag = false;

	var coinInfo = await pullCoinAndAnalyze(coin, sku);

	//	Remove from main feed if dropped below threshold
	deletedFlag = await deleteIfBelowThreshold(coin, coinInfo, resp);

	if (!deletedFlag) {

		//	If at least one sku in the COIN is nationally shippable make sure the COIN is in stock in the main feed. 
		if (coinInfo.targetSkuCondition === 'New') {
			if (coinInfo.newNational) {
				//	Mark out of stock in main feed.
				await updateCoinInFeed(`${coin}-N`, {
					availability: 'in stock'
				}, undefined, resp);

			}

			//	No sku in the listing is nationally shippable make sure it's out of stock in the main feed and set relevant regions in stock.
			else {

				//	Mark out of stock in main feed.
				await updateCoinInFeed(`${coin}-N`, {
					availability: 'out of stock'
				}, undefined, resp);


				//	Insert into each shippable region
				await updateRegions(`${coin}-N`, coinInfo.newSkus, coinInfo.newPrice, 'in stock', resp);
				// console.log("Feed manipulation check for New");
			}
		} else if (coinInfo.targetSkuCondition === 'Like New') {
			if (coinInfo.likeNewNational) {

				//	Mark out of stock in main feed.
				await updateCoinInFeed(coin, {
					availability: 'in stock'
				}, undefined, resp);
			} else {

				//	Mark out of stock in main feed.
				await updateCoinInFeed(coin, {
					availability: 'out of stock'
				}, undefined, resp);

				//	Insert into each shippable region
				await updateRegions(coin, coinInfo.likeNewSkus, coinInfo.likeNewPrice, 'in stock', resp);
				// console.log("Feed manipulation check for Like New");
			}
		}
	}

	return deletedFlag;
}


var updateRegions = async (id, skuList, price, availability, resp) => {
	var prom = [];
	var shippable = await GDE.getShippable(skuList);
	for (var i = 0; i < shippable.length; i++) {
		prom.push(insertCoinInRegionalFeed(id, {
			regionId: `00${shippable[i].dest_postal_code}00`,
			price: {
				value: price,
				currency: 'USD'
			},
			availability: availability
		}, process.env.GOOGLE_REGIONAL_FEED_ID, resp));
	}

	await Promise.all(prom);
}




//	For a Sold sku, grab the COIN info used by the product page and analyze it.
//	If the quantity has fallen below the quantity threshold, move the COIN from the feed.
var checkSoldSkusCoin = async (coin, sku, resp) => {
	var deletedFlag = false;

	//	We are pulling COIN data after the sku in question has been marked Sold.  So the analysis will tell us what's left.
	var coinInfo = await pullCoinAndAnalyze(coin, sku);

	//	Remove from main feed if dropped below threshold
	deletedFlag = await deleteIfBelowThreshold(coin, coinInfo, resp);

	//	If no delete, there are other skus in the same condition for the COIN.
	if (!deletedFlag) {

		//	If the sku that Sold was not nationally shippable then the remaining sellable skus drive 
		//	whether it's in the main feed or not and this sale didn't matter in that regard.
		if (!coinInfo.targetSkuNational) {
			// Nothing to do
		}

		//	If the sku that Sold was nationally shippable	and those that remain do not ship nationally, 
		//	this COIN needs to be made Out of Stock in the main feed and set In Stock	in specific regions.
		else {
			if (coinInfo.targetSkuCondition === 'New') {
				if (!coinInfo.newNational) {

					//	Mark out of stock in main feed.
					await updateCoinInFeed(`${coin}-N`, {
						availability: 'out of stock'
					}, undefined, resp);

					//	Insert into each shippable region
					await updateRegions(`${coin}-N`, coinInfo.newSkus, coinInfo.newPrice, 'in stock', resp);
					// console.log("Feed manipulation check for New");
				}
			} else if (coinInfo.targetSkuCondition === 'Like New') {
				if (!coinInfo.likeNewNational) {

					//	Mark out of stock in main feed.
					await updateCoinInFeed(coin, {
						availability: 'out of stock'
					}, undefined, resp);

					//	Insert into each shippable region
					await updateRegions(coin, coinInfo.likeNewSkus, coinInfo.likeNewPrice, 'in stock');
					// console.log("Feed manipulation check for Like New");
				}
			}
		}
	}

	return deletedFlag;
}


var deleteIfBelowThreshold = async (coin, coinInfo, resp) => {
	var deletedFlag = false;

	if ((coinInfo.targetSkuCondition === 'New') &&
		(!coinInfo.newFound || (coinInfo.newQuantity < parseInt(configUtils.get("GOOGLE_FEED_MIN_QTY"))))) {
		// console.log(`Removing ${coin}-N`);
		deletedFlag = true;
		deleteCoinFromFeed(`${coin}-N`, resp);

	} else if ((coinInfo.targetSkuCondition === 'Like New') &&
		(!coinInfo.likeNewFound || (coinInfo.likeNewQuantity < parseInt(configUtils.get("GOOGLE_FEED_MIN_QTY"))))) {
		// console.log(`Removing ${coin}`);
		deletedFlag = true;
		deleteCoinFromFeed(coin, resp);
	}

	return deletedFlag;
}


//
//	This function pulls the COIN just like the product page so the associated skus can be analyzed.
//	Will be looking at availability and price by region.
//
var pullCoinAndAnalyze = async (coin, targetSku, metros, physicalOrigins) => {
	var coinInfo = {
		coinProduct: undefined,
		conditionsByOrigin: [],
		feedDataById: [],
		feedDataCommon: {},
		originsWithCoin: [],
		// targetSkuNational: false,
		// targetSkuCondition: undefined,
		pullForwardVendorSku: {}
	}

	var rq = {
		query: {
			bypassFulfillmentOptionsFlag: "true",
			zip: 68134
		},
		params: {
			id: coin
		}
	}

	var rp = {
		statusCode: 200,
		message: memberText.get('GET_SUCCESS'),
		data: {}
	}


	//	Prepare the metros order by clauses so we pull the sku that'll be selected on the product page.
	for (var i = 0; i < metros.length; i++) {
		metros[i].orderBy = '';
		if (metros[i].type === 'PHYSICAL') {
			metros[i].orderBy = `FIELD(store_id, ${metros[i].storeId}) DESC, `;
		}
	}

	coinInfo.coinProduct = await rushProductActions.getByCoin(rq, rp);


	if (coinInfo.coinProduct.statusCode === 200) {
		coinInfo.pullForwardVendorSku = coinInfo.coinProduct.data.rushProducts.pullForwardVendorSku;

		//	Note which condition the sku in question is part of.
		for (var j = 0; j < coinInfo.coinProduct.data.rushProducts.variantGroups.length; j++) {
			for (var k = 0; k < coinInfo.coinProduct.data.rushProducts.variantGroups[j].variants.length; k++) {
				if (coinInfo.coinProduct.data.rushProducts.variantGroups[j].variants[k].sku === targetSku) {
					coinInfo.targetSkuCondition = coinInfo.coinProduct.data.rushProducts.variantGroups[j].conditionName;
				}
			}
		}

		//
		//	Look for variantGroups that are New or Like New with a sufficient quantity.   
		//

		//	Get info on what's available by product origin.
		for (var i = 0; i < physicalOrigins.length; i++) {
			coinInfo.conditionsByOrigin.push(await checkForConditionsByOrigin(coinInfo.coinProduct, physicalOrigins[i], coinInfo));
		}


		await prepareFeedDataById(metros, coinInfo);


		//	Roll up data by condition
		// rollUpByCondition(response);



		// var targetShippable = await GDE.getShippablePct([targetSku]);
		// if ((targetShippable.length > 0) && (targetShippable[0].pct_ship_eligible === 100)) {
		// 	coinInfo.targetSkuNational = true;
		// }

	}

	return coinInfo;
}


var processDSOrigins = async (dsOrigins, physicalOrigins) => {
	for (let i = 0; i < dsOrigins.length; i++) {
		let region = await lookupRegionAbbreviation(dsOrigins[i].warehouse1PostalCode);

		let phys = {
			city: `Drop Ship - ${region.name}`,
			regionAbbrev: region.abbrev,
			storeId: 106,
			zip: dsOrigins[i].warehouse1PostalCode
		}

		//	Add unique dropship regions to phsyical origins.
		if (!_.find(physicalOrigins, function (o) {
			return o.regionAbbrev === region.abbrev;
		})) {
			physicalOrigins.push(phys);
		}
	}
}


var lookupRegionAbbreviation = async (zip) => {
	let info = {
		abbrev: null,
		name: null
	}

	//	Determine Region for Dropship
	let region = await ZipToCity.getRegionAbbreviation(zip);
	switch (region.abbrev) {
		case 'NORTHERN':
			info.abbrev = 'NCA';
			info.name = 'Northern California Region';
			break;

		case 'SOUTHERN':
			info.abbrev = 'SCA';
			info.name = 'Southern California Region';
			break;
					
		case 'EASTERN':
			info.abbrev = 'EPA';
			info.name = 'Eastern Pennsylvania';
			break;
						
		case 'WESTERN':
			info.abbrev = 'WPA';
			info.name = 'Western Pennsylvania';
			break;
		
		default:
			info.abbrev = region.abbrev;
			info.name = region.name;
			break;
	}	
	
	return info;
}

var prepareFeedDataById = async (metros, coinInfo, vcp) => {
	let filteredOrigins = coinInfo.conditionsByOrigin.filter(origin => origin.likeNewStats.found || origin.newStats.found);
		
	for (let i = 0; i < filteredOrigins.length; i++) {
		let origin = filteredOrigins[i];

		if (origin.newStats.found) {
			coinInfo.feedDataById.push(await populateId(metros, coinInfo, origin, "newStats"));
		}

		if (origin.likeNewStats.found) {
			coinInfo.feedDataById.push(await populateId(metros, coinInfo, origin, "likeNewStats"));
		}
	};
}


var populateId = async (metros, coinInfo, origin, condition) => { 
	let conditionName = (condition === 'newStats') ? 'New' : 'Like New';
	let id = {
		id: `${coinInfo.coinProduct.data.rushProducts.coinId}-${(condition === 'newStats') ? 'N' : 'L'}-${origin.regionAbbrev}`,
		coinQuantity: origin[condition].quantity,
		directBuyQuantity: origin[condition].directBuyQuantity,
		rbrQuantity: origin[condition].rbrQuantity,
		skus: origin[condition].skus,
		regions: [],
		averageMarginDollars: 0,
		averageMarginPercent: 0,
		national: false,
		pdpUrlExtension: (condition === 'newStats') ? '/new' : '/open-box',
		conditionParam: (condition === 'newStats') ? 'n' : 'l',
		storeId: origin.storeId,
		linkedDmaStoreId: origin.linkedDmaStoreId
	}



	//	Keep track of physical stores with the coin.
	if (!_.find(coinInfo.originsWithCoin, function (c) {
		return (c.conditionName === conditionName && c.storeId === origin.storeId);
	})) {

		coinInfo.originsWithCoin.push({
			id: id.id,
			conditionName: conditionName,
			storeId: origin.storeId,
			city: origin.city
		});
	}


	//	Get Vendor names
	id.vendorNames = await Coins.getVendorNamesBySkus(id.skus);
	if (id.vendorNames.length) {
		id.vendorNames = id.vendorNames[0].vendorNames;
	}
	else id.vendorNames = '';

	//	Get averages.
	let averages = await GDE.getAverages(id.skus);
	if (averages[0].dollars) {
		id.averageMarginDollars = averages[0].dollars;
	}
	if (averages[0].pct) {
		id.averageMarginPercent = averages[0].pct;
	}

	await populateRegionForId(metros, id);

	return id;
}


var populateRegionForId = async (metros, id) => {
	//	Determine regional availability.
	for (let i = 0; i < metros.length; i++) {
		let theMetro = metros[i];

		// Flags for this metro
		let metroNewFound = false;
		let metroLikeNewFound = false;
		let metroDamagedFound = false;
		let metroGoodFound = false;
		let metroFairFound = false;

		let result = await GoogleFeed.checkMetroSku(theMetro, id.skus);
		if (result.length) {
			id.regions.push({
				regionId: `00${theMetro.zip}00`,
				city: `${theMetro.city}`,
				storeId: `${theMetro.storeId}`,
				sku: `${result[0].sku}`,
				shipType: `${result[0].shipType}`,
				price: `${result[0].price}`,
				conditionName: `${result[0].conditionName}`,
				effectiveEligibility: `${result[0].effectiveEligibility}`
			})
		}
	}


	//	If eligible across all regions with same price, is national
	if (id.regions.length === metros.length) {
		let price = 0;
		let priceSame = true;

		for (let i = 0; i < id.regions.length; i++) {
			if (price === 0) {
				price = id.regions[i].price;
			} else if (price !== id.regions[i].price) {
				priceSame = false;
			}

			if (priceSame) {
				id.national = true;
			}
		}
	}
}



var populatePriceDiscountScore = (price, product) => {
	var discount = 0;
	var score = 0;

	if (price > 0.00) {
		if ((product.data.rushProducts.marketPrice !== undefined) && (product.data.rushProducts.marketPrice !== null) && (product.data.rushProducts.marketPrice > 0)) {
			discount = (1 - (price / product.data.rushProducts.marketPrice)) * 100;
		} else if ((product.data.rushProducts.msrp !== undefined) && (product.data.rushProducts.msrp !== null)) {
			discount = (1 - (price / product.data.rushProducts.msrp)) * 100;
		} else {
			discount = 30;
		}
	}


	var rule = _.find(scoringRules, function (r) {
		return r.criteria === 'PRICE_DISCOUNT';
	});

	var scoreRanges = rule.scores;

	for (var i = 0; i < scoreRanges.length; i++) {
		if ((discount >= scoreRanges[i].start) && (discount <= scoreRanges[i].end)) {
			score = scoreRanges[i].score;
		}
	}


	return score;
}


var populateNetMarginScore = async (skus) => {
	var margin = 0;
	var score = 0;

	var pct = await GDE.getMarginHighestShipping(skus);
	if (pct.length > 0) {
		if (pct[0].effective_eligibility === 'BOPIS_ONLY') {
			margin = pct[0].bopis_pct;
		} else if (pct[0].effective_eligibility === 'LOCAL_ONLY') {
			if (pct[0].local_pct !== null) {
				margin = pct[0].local_pct;
			} else {
				margin = pct[0].bopis_pct;
			}
		} 
		//	No calculated ship cost for an always shippable, use category average ship cost.
		else if ((pct[0].effective_eligibility === 'SHIPPABLE') && (pct[0].pct === null)) {
			margin = pct[0].no_ship_cost_shippable_pct;
		} else if (pct[0].pct === null) {
			margin = pct[0].no_ship_cost_pct;
		} else {
			margin = pct[0].pct;
		}
	}

	var rule = _.find(scoringRules, function (r) {
		return r.criteria === 'NET_MARGIN';
	});

	
	if (!rule) {
		return 0;
	}

	var scoreRanges = rule.scores;

	if (margin === null) {
		score = 0;
	} else {
		for (var i = 0; i < scoreRanges.length; i++) {
			if ((margin >= scoreRanges[i].start) && (margin <= scoreRanges[i].end)) {
				score = scoreRanges[i].score;
			}
		}
	}

	return score;
}


var populateInventoryDepthScore = (quantity) => {
	var score = 0;

	var rule = _.find(scoringRules, function (r) {
		return r.criteria === 'INVENTORY_DEPTH';
	});

	var scoreRanges = rule.scores;

	for (var i = 0; i < scoreRanges.length; i++) {
		if ((quantity >= scoreRanges[i].start) && (quantity <= scoreRanges[i].end)) {
			score = scoreRanges[i].score;
		}
	}

	return score;
}



var populateEvergreenScore = (quantity) => {
	var score = 0;

	var rule = _.find(scoringRules, function (r) {
		return r.criteria === 'EVERGREEN';
	});

	var scoreRanges = rule.scores;

	for (var i = 0; i < scoreRanges.length; i++) {
		if ((quantity >= scoreRanges[i].start) && (quantity <= scoreRanges[i].end)) {
			score = scoreRanges[i].score;
		}
	}

	return score;
}


var populateConditionScore = (condition) => {
	var score = 3;


	var rule = _.find(scoringRules, function (r) {
		return r.criteria === 'CONDITION';
	});

	var scoreValues = rule.scores;

	for (var i = 0; i < scoreValues.length; i++) {
		if (condition === scoreValues[i].value) {
			score = scoreValues[i].score;
		}
	}

	return score;
}





var rollUpByCondition = (response) => {
	for (var i = 0; i < response.conditionsByStore.length; i++) {
		if (response.conditionsByStore[i].newStats.skus.length > 0) {
			if (response.newSkus.length > 0) {
				response.newSkus += ', ';
			}
			response.newSkus += response.conditionsByStore[i].newStats.skus;

			response.newQuantity += response.conditionsByStore[i].newStats.quantity;
		}

		//	Look for the highest compareAt price across stores
		if (response.conditionsByStore[i].newStats.marketPrice > response.newCompareAtPrice) {
			response.newCompareAtPrice = response.conditionsByStore[i].newStats.marketPrice;
		}
	}

	for (var i = 0; i < response.conditionsByStore.length; i++) {
		if (response.conditionsByStore[i].likeNewStats.skus.length > 0) {
			if (response.likeNewSkus.length > 0) {
				response.likeNewSkus += ', ';
			}
			response.likeNewSkus += response.conditionsByStore[i].likeNewStats.skus;

			response.likeNewQuantity += response.conditionsByStore[i].likeNewStats.quantity;
		}

		//	Look for the highest compareAt price across stores
		if (response.conditionsByStore[i].likeNewStats.marketPrice > response.likeNewCompareAtPrice) {
			response.likeNewCompareAtPrice = response.conditionsByStore[i].likeNewStats.marketPrice;
		}
	}

	for (var i = 0; i < response.conditionsByStore.length; i++) {
		if (response.conditionsByStore[i].damagedStats.skus.length > 0) {
			if (response.damagedSkus.length > 0) {
				response.damagedSkus += ', ';
			}
			response.damagedSkus += response.conditionsByStore[i].damagedStats.skus;
		}
	}

	for (var i = 0; i < response.conditionsByStore.length; i++) {
		if (response.conditionsByStore[i].goodStats.skus.length > 0) {
			if (response.goodSkus.length > 0) {
				response.goodSkus += ', ';
			}
			response.goodSkus += response.conditionsByStore[i].goodStats.skus;
		}
	}

	for (var i = 0; i < response.conditionsByStore.length; i++) {
		if (response.conditionsByStore[i].fairStats.skus.length > 0) {
			if (response.fairSkus.length > 0) {
				response.fairSkus += ', ';
			}
			response.fairSkus += response.conditionsByStore[i].fairStats.skus;
		}
	}
}


var checkForConditionsByOrigin = async (coinProduct, origin, response) => {
	let conditions = {
		storeId: origin.storeId,
		linkedDmaStoreId: origin.linkedDmaStoreId,
		city: (origin.partnerFacility === 'Y') ? 'Partner - ' + origin.city : origin.city,
		regionAbbrev: origin.storeId,
		regionName: undefined, 
		newStats: {
			index: -1,
			found: false,
			quantity: 0,
			national: false,
			price: 0,
			marketPrice: 0,
			shipping: 0,
			skus: '',
			directBuyQuantity: 0,
			rbrQuantity: 0
		},
		likeNewStats: {
			index: -1,
			found: false,
			quantity: 0,
			national: false,
			price: 0,
			marketPrice: 0,
			shipping: 0,
			skus: '',
			directBuyQuantity: 0,
			rbrQuantity: 0
		},
		damagedStats: {
			index: -1,
			found: false,
			quantity: 0,
			national: false,
			price: 0,
			marketPrice: 0,
			shipping: 0,
			skus: '',
			directBuyQuantity: 0,
			rbrQuantity: 0
		},
		goodStats: {
			index: -1,
			found: false,
			quantity: 0,
			national: false,
			price: 0,
			marketPrice: 0,
			shipping: 0,
			skus: '',
			directBuyQuantity: 0,
			rbrQuantity: 0
		},
		fairStats: {
			index: -1,
			found: false,
			quantity: 0,
			national: false,
			price: 0,
			marketPrice: 0,
			shipping: 0,
			skus: '',
			directBuyQuantity: 0,
			rbrQuantity: 0
		}
	}

	for (var j = 0; j < coinProduct.data.rushProducts.variantGroups.length; j++) {
		if ((coinProduct.data.rushProducts.variantGroups[j].quantity > 0) &&
			(coinProduct.data.rushProducts.variantGroups[j].eligibility !== null) &&
			(coinProduct.data.rushProducts.variantGroups[j].storeId === origin.storeId)) {
		
			//	If dropship, make sure regions match
			if (origin.storeId === 106) {
				let region = await lookupRegionAbbreviation(coinProduct.data.rushProducts.variantGroups[j].marketInfo.storeZip);
				if (region.abbrev !== origin.regionAbbrev) {
					continue;
				}
				conditions.regionAbbrev = region.abbrev;
				conditions.regionName = region.name;
			}

			await checkForVariants('New', coinProduct.data.rushProducts.variantGroups[j], j, response, conditions.newStats);
			await checkForVariants('Like New', coinProduct.data.rushProducts.variantGroups[j], j, response, conditions.likeNewStats);
			await checkForVariants('Damaged', coinProduct.data.rushProducts.variantGroups[j], j, response, conditions.damagedStats);
			await checkForVariants('Good', coinProduct.data.rushProducts.variantGroups[j], j, response, conditions.goodStats);
			await checkForVariants('Fair', coinProduct.data.rushProducts.variantGroups[j], j, response, conditions.fairStats);
		}
	}

	return conditions;
}



var checkForVariants = async (conditionName, variantGroup, variantIndex, response, conditionStats) => {
	if (variantGroup.conditionName === conditionName) {
		//	Keep a list of new skus so we can verify whether at least one is shippable everywhere
		for (var k = 0; k < variantGroup.variants.length; k++) {

			let theVariant = variantGroup.variants[k];

			if ((theVariant.status === 'Live') &&
				(theVariant.onlineShopping === 'Y')) {

				if (!conditionStats.found) {
					conditionStats.found = true;
					conditionStats.index = variantIndex;
					conditionStats.price = variantGroup.price;
					conditionStats.conditionName = conditionName;

					//	Look for the variant with the highest comapreAt price (marketPrice)
					if (theVariant.marketPrice > conditionStats.marketPrice) {
						conditionStats.marketPrice = theVariant.marketPrice;
					}
					if (variantGroup.largeItemBullets.length > 0) {
						conditionStats.shipping = 50;
					}
				}

				if (theVariant.dropshipType === 'LIMITED') {
					conditionStats.quantity += theVariant.limitedQuantity;
				}
				else if (theVariant.dropshipType === 'UNLIMITED') {
					conditionStats.quantity += 99;
				}
				else {
					conditionStats.quantity++;
				}
				switch (theVariant.manifestSource) {
					case 'DIRECT_BUY':
						conditionStats.directBuyQuantity++;
						break;
						
					case 'RBR':
						conditionStats.rbrQuantity++;
						break;
				}

				if (conditionStats.skus.length > 0) {
					conditionStats.skus += ', ';
				}
				conditionStats.skus += variantGroup.variants[k].sku;

			}
		}


		if (conditionStats.skus.length > 0) {
			var shippable = await GDE.getShippablePct(conditionStats.skus);
			if ((shippable.length > 0) && (shippable[0].pct_ship_eligible === 100)) {
				conditionStats.national = true;
			}
		}
	}
}




var getCoinFromFeed = async (coin, resp) => {
	var body = {
		merchantId: process.env.GOOGLE_MERCHANT_ID,
		auth: auth,
		productId: `online:en:US:${coin}`
	}

	var product = await content.products.get(body);

	// console.log(JSON.stringify(product.status, undefined, 2));
	if (product.status === 404) {
		formatResp(resp, ['metaData', 'data'], 404, 'COIN not found');
	} else {
		// console.log(JSON.stringify(product.data, undefined, 2));
		resp.data = product.data
	}

}

//	Delete a COIN from the google shopping feed.
var deleteCoinFromFeed = async (coin, resp) => {
	var body = {
		merchantId: process.env.GOOGLE_MERCHANT_ID,
		auth: auth,
		// itemId: `online:en:US:${req.params.id}`,
		productId: `online:en:US:${coin}`
	}

	var product = await content.products.delete(body);
	if (product.status === 404) {
		formatResp(resp, ['metaData', 'data'], 404, 'COIN not found');
	} else {
		// console.log(JSON.stringify(product.status, undefined, 2));
		// resp.data = product.data;
	}

	return resp;
}



//	Insert a COIN in the google shopping feed.
var insertCoinInRegionalFeed = async (coin, insertBody, feedId, resp) => {
	var body = {
		merchantId: process.env.GOOGLE_MERCHANT_ID,
		auth: auth,
		productId: `online:en:US:${coin}`,
		requestBody: insertBody
	}

	if (feedId !== undefined) {
		body.feedId = feedId;
	}

	var product = await content.regionalinventory.insert(body);
	if (product.status === 404) {
		formatResp(resp, ['metaData', 'data'], 404, 'COIN not found');
	} else {
		// console.log(JSON.stringify(product.status, undefined, 2));
		// resp.data = product.data;
	}

	return resp;
}





//	Update a COIN in the google shopping feed.
var updateCoinInFeed = async (coin, updateBody, feedId, resp) => {
	var body = {
		merchantId: process.env.GOOGLE_MERCHANT_ID,
		auth: auth,
		// itemId: `online:en:US:${req.params.id}`,
		productId: `online:en:US:${coin}`,
		requestBody: updateBody
	}

	if (feedId !== undefined) {
		body.feedId = feedId;
	}

	var product = await content.products.update(body);
	if (product.status === 404) {
		formatResp(resp, ['metaData', 'data'], 404, 'COIN not found');
	} else {
		// console.log(JSON.stringify(product.status, undefined, 2));
		// resp.data = product.data;
	}

	return resp;
}



//
//	Build the feed
//
var buildGoogleFeed = async (req, resp) => {
	buildTimestamp = new moment();

	var ids = [];
	var googleVendors = await Vendors.getMarketplaceVendors('Google');
	var limit = req.query.limit ? parseInt(req.query.limit) : 10000000;
	var offset = req.query.offset ? parseInt(req.query.offset) : 0;
	var skus = await GoogleFeed.getCandidateSkus(offset, limit);
	var prodConn = await globals.productROPool.getConnection();
	var metros = await Metros.getMetroZipAndStoreId();
	var dsOrigins = await Vendors.getAllDropshipOrigins();
	var physicalOrigins = await Stores.getActivePhysicalOnlyStores();

	var mainSheetInfo = await initMainSheet(buildTimestamp, metros);
	var physicalSheetInfo = await initPhysicalSheet(buildTimestamp);
	var regionalSheetInfo = await initRegionalSheet(buildTimestamp);

	try {

		console.log(`Google Feed Start - ${new Date()}`);

		await processDSOrigins(dsOrigins, physicalOrigins);		

		for (var i = 0; i < skus.length; i++) {
			if ((i + 1) % 100 === 0) {
				console.log("Processing: " + (i + 1));
			}

			// if (i === 5000) {
			// 	break;
			// }

			//	If the sku's vendor isn't good for Google, skip
			if (_.findIndex(googleVendors, function (v) {
				return v.vendorId === skus[i].vendorId;
			}) === -1) {
				continue;
			}

			//	Retrieve the vendor catalog product and COIN
			let c = await Coins.getByVendorSku(skus[i].vendorId, skus[i].sellerProductId);


			let coin = null;
			if (c.length > 0) {
				coin = c[0].coinId;
			} else {
				continue;
			}


			//	TEMP
			// if (
			// 			(coin !== '17AD52649F8')
			// 	// && (coin !== '179FCB2BD89')
			// 	// && (coin !== '179FCB2AEBB')
			// ) {
			// 	continue;
			// }

			//	Don't reprocess a COIN already encountered
			if (_.findIndex(ids, function (o) {
					return o === coin
				}) > -1) {
				// console.log("Already processed " + coin + " " + skus[i].sku);
				continue;
			}


			//	Determine if COIN has new skus and/or like new skus.
			var coinInfo = await pullCoinAndAnalyze(coin, skus[i].sku, metros, physicalOrigins);
			if (coinInfo.coinProduct.statusCode !== 200) {
				continue;
			}
		
			var vcp = await Vendors.getProductByVendorSku(coinInfo.pullForwardVendorSku.vendorId, coinInfo.pullForwardVendorSku.vendorSku, prodConn);

			//	Prepare feed
			await prepareCommonFeedData(coinInfo, vcp);

			for (let i = 0; i < coinInfo.feedDataById.length; i++) {
				let theId = coinInfo.feedDataById[i];

				if (theId.coinQuantity >= parseInt(configUtils.get("GOOGLE_FEED_MIN_QTY"))) {
					ids.push(coin);

					if (theId.regions.length) {
						await writeMainSheet(mainSheetInfo, coinInfo, theId, vcp, metros);
					}

					if (!theId.national) {
						await writeRegionalSheet(regionalSheetInfo, theId);
					}
				}
			}

			await writePhysicalSheet(physicalSheetInfo, coinInfo);
		}


		await completeMainSheet(mainSheetInfo, metros);
		await completeRegionalSheet(regionalSheetInfo);
		await completePhysicalSheet(physicalSheetInfo);


		//	Check that text files contain the header and queue uploads if good.
		await headerCheck(mainSheetInfo, regionalSheetInfo, physicalSheetInfo);

		console.log(`Google Feed End - ${new Date()}`);

	} catch (e) {
		console.log(e);
	} finally {
		await globals.productROPool.releaseConnection(prodConn);
	}

	return resp;
}



var headerCheck = async (mainSheetInfo, regionalSheetInfo, physicalSheetInfo) => {
	let goodFlag = true;

	// goodFlag = await peekAtHeader(mainSheetInfo, 'id', goodFlag);
	// if (goodFlag) {
	// 	goodFlag = await peekAtHeader(regionalSheetInfo, 'id', goodFlag);
	// }
	// if (goodFlag) {
	// 	goodFlag = await peekAtHeader(physicalSheetInfo, 'coin', goodFlag);
	// }

	if (goodFlag) {
		await GoogleFeed.queueUpload(mainSheetInfo.exportOptions.tsvFilename, process.env.GOOGLE_FEED_FILENAME, 0);	
		await GoogleFeed.queueUpload(physicalSheetInfo.exportOptions.tsvFilename, 'physical-coin', parseInt(configUtils.get("GOOGLE_UPLOAD_GAP_MINUTES")));
		await GoogleFeed.queueUpload(regionalSheetInfo.exportOptions.tsvFilename, process.env.GOOGLE_REGIONAL_FILENAME, parseInt(configUtils.get("GOOGLE_UPLOAD_GAP_MINUTES")));
	}
	else {
		fsSync.unlink(mainSheetInfo.exportOptions.tsvfilename);
		fsSync.unlink(physicalSheetInfo.exportOptions.tsvfilename);
		fsSync.unlink(regionalSheetInfo.exportOptions.tsvfilename);
	}
}


var peekAtHeader = async (sheetInfo, text, goodFlag) => {
	try {
		let fd = fsSync.openSync(sheetInfo.exportOptions.tsvFilename, 'r+');
		let buffer = Buffer.alloc(100);
		fsSync.read(fd, buffer, 0, 100, 0, function (err, num, buffer) {
		});

		fsSync.close(fd);
		buffer = buffer.toString();
		if (buffer.startsWith(text)) {
			goodFlag = true;
		}
		else {
			goodFlag = false;
		}

		if (!goodFlag) {
			await logUtils.log({
				severity: 'ERROR',
				type: 'GFEED',
				message: `First 100 bytes ${sheetInfo.exportOptions.tsvFilename}: ${buffer.toString()}`,
				stackTrace: new Error().stack
			})
		}

		return goodFlag;
	}
	catch (e) {
		return false;
	}
}


var prepareCommonFeedData = async (coinInfo, vcp) => {
	coinInfo.feedDataCommon = {
		itemGroupId: `${coinInfo.coinProduct.data.rushProducts.coinId}`,
		mpn: (vcp.length && vcp[0].mpn) ? vcp[0].mpn : '',
		title: coinInfo.coinProduct.data.rushProducts.name,
		tsvTitle: coinInfo.coinProduct.data.rushProducts.name.replace(/"/g, '""'),
		description: (coinInfo.coinProduct.data.rushProducts.productDescription !== null) ? coinInfo.coinProduct.data.rushProducts.productDescription : '',
		tsvDescription: coinInfo.coinProduct.data.rushProducts.productDescription,
	}

}

var loadScoringRules = async () => {
	scoringRules = [];
	var rows = await GoogleFeed.getScoringRules();
	var c = '';
	var rule = null;

	for (var i = 0; i < rows.length; i++) {
		if (rows[i].criteria !== c) {
			if (rule !== null) {
				scoringRules.push(rule);
			}

			rule = {
				criteria: rows[i].criteria,
				type: rows[i].type,
				scores: []
			}

			c = rule.criteria;
		}

		if (rule.type === 'RANGE') {
			rule.scores.push({
				start: rows[i].rangeStart,
				end: rows[i].rangeEnd,
				score: rows[i].score
			})
		} else if (rule.type === 'VALUE') {
			rule.scores.push({
				value: rows[i].value,
				score: rows[i].score
			})
		}
	}
	scoringRules.push(rule);
}



var writeRegional = async (sheetInfo, id, price, skus) => {
	var region = null;
	var shippable = await GDE.getShippable(skus);
	var unique = null;
	var written = [];
	for (var i = 0; i < shippable.length; i++) {
		region = `00${shippable[i].dest_postal_code}00`;
		unique = `${region}${price}`;
		if ((shippable[i].eligibility !== 'NOT_ELIGIBLE') &&
			(_.findIndex(written, function (w) {
				return w === unique;
			}) === -1)) {
			await writeRegionalSheet(sheetInfo, id, price, region, 'in stock');
			written.push(unique);
		}
	}
}



var initMainSheet = async (buildTimestamp, metros) => {
	var sheetInfo = {
		buildTimestamp: buildTimestamp,
		storageContext: fileUtils.getContext('CATALOG', 'UNIQUE'),
		exportOptions: {
			filename: `sheets/google-feed-${buildTimestamp.valueOf()}.xlsx`,
			tsvFilename: `sheets/google-feed-${buildTimestamp.valueOf()}.txt`,
			useStyles: true,
			useSharedStrings: true
		},
		exportWorkbook: null,
		exportWorksheet: null,
		recipients: (configUtils.get("GOOGLE_FEED_EMAILS") !== null) ? configUtils.get("GOOGLE_FEED_EMAILS") : 'matt@rushmarket.com',
		rowsProcessed: 0,
		row: 2,
		tsvFile: -1
	}

	let col = 1;

	sheetInfo.exportWorkbook = new excel.stream.xlsx.WorkbookWriter(sheetInfo.exportOptions);
	sheetInfo.exportWorksheet = sheetInfo.exportWorkbook.addWorksheet('Feed'),

	sheetInfo.exportWorksheet.getCell(1, col++).value = 'id';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'item_group_id';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'title';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'description';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'price';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'condition';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'link';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'availability';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'image_link';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'google_product_category';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'product_category';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'brand';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'gtin';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'mpn';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'identifier_exists';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'color';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'material';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'size';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'product_detail';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'ads_redirect';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'product_highlight';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'msrp';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'main_lifestyle_image';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'alt_image3';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'alt_image4';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'alt_image5';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_name1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_name2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_name3';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_name4';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_name5';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_name6';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_value1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_value2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_value3';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_value4';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_value5';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'attribute_value6';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'bullet_point1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'bullet_point2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'bullet_point3';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'bullet_point4';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'color_specific';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'material_specific';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'shipping';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'avg_margin_dollars';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'avg_margin_pct';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'category2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'coin_quantity';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'rbr_count';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'direct_buy_count';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'vendor_names';
	

	await sheetInfo.exportWorksheet.getRow(1).commit();

	// await initStream(sheetInfo);
	// await writeLineToStream(sheetInfo, 'id\titem_group_id\ttitle\tdescription\tprice\tcondition\tlink\tavailability\timage_link\tgoogle_product_category\tproduct_category\tbrand\tgtin\tmpn\tidentifier_exists\tcolor\tmaterial\tsize\tproduct_detail\tads_redirect\tproduct_highlight\tmsrp\tlifestyle_image\talt_image3\talt_image4\talt_image5\tattribute_name1\tattribute_name2\tattribute_name3\tattribute_name4\tattribute_name5\tattribute_name6\tattribute_value1\tattribute_value2\tattribute_value3\tattribute_value4\tattribute_value5\tattribute_value6\tbullet_point1\tbullet_point2\tbullet_point3\tbullet_point4\tcolor_specific\tmaterial_specific\tshipping\tavg_margin_dollars\tavg_margin_pct\tcategory2\tcoin_quantity\trbr_count\tdirect_buy_count\tvendor_names');
	
	
	return sheetInfo;
}


var initStream = async (sheetInfo) => {
	sheetInfo.tsvFile = fsSync.createWriteStream(sheetInfo.exportOptions.tsvFilename, { flags: 'a' });
	sheetInfo.tsvFile.on('error', (e) => {
		console.log(`Error: ${error}`);
		sheetInfo.tsvFile.end();
	})
}


var writeLineToStream = async (sheetInfo, line) => {
	doWrite();

	function doWrite() {
		// console.log(`in doWrite() ${new Date()} ${new moment().valueOf()} ${sheetInfo.exportOptions.tsvFilename} ${line.substring(0, 50)}`)

		if (!sheetInfo.tsvFile.write(line)) {
			console.log(`************ Waiting for drain ${sheetInfo.exportOptions.tsvFilename} ${line.substring(0, 50)}`);
			sheetInfo.tsvFile.once('drain', () => {
				console.log(`event emitted ${new Date()} ${new moment().valueOf()}`)
				// doWrite()
			});
		}
	}
}



var initPhysicalSheet = async (buildTimestamp) => {
	var sheetInfo = {
		buildTimestamp: buildTimestamp,
		storageContext: fileUtils.getContext('CATALOG', 'UNIQUE'),
		exportOptions: {
			filename: `sheets/physical-coin-${buildTimestamp.valueOf()}.xlsx`,
			tsvFilename: `sheets/physical-coin-${buildTimestamp.valueOf()}.txt`,
			useStyles: true,
			useSharedStrings: true
		},
		exportWorkbook: null,
		exportWorksheet: null,
		recipients: (configUtils.get("GOOGLE_FEED_EMAILS") !== null) ? configUtils.get("GOOGLE_FEED_EMAILS") : 'matt@rushmarket.com',
		rowsProcessed: 0,
		row: 2,
		tsvFile: -1
	}

	sheetInfo.exportWorkbook = new excel.stream.xlsx.WorkbookWriter(sheetInfo.exportOptions);
	sheetInfo.exportWorksheet = sheetInfo.exportWorkbook.addWorksheet('Feed'),

	sheetInfo.exportWorksheet.getCell(1, 1).value = 'coin';
	sheetInfo.exportWorksheet.getCell(1, 2).value = 'store_id';
	sheetInfo.exportWorksheet.getCell(1, 3).value = 'store_city';
	await sheetInfo.exportWorksheet.getRow(1).commit();

	// await initStream(sheetInfo);
	// await writeLineToStream(sheetInfo, 'coin\tstore_id\tstore_city');
	// sheetInfo.tsvFile = fsSync.createWriteStream(sheetInfo.exportOptions.tsvFilename, { flags: 'a' });
	// sheetInfo.tsvFile.on('error', (e) => sheetInfo.tsvFile.end());
	// sheetInfo.tsvFile.on('open', () => sheetInfo.tsvFile.write('coin\tstore_id\tstore_city'));

	return sheetInfo;
}



var initRegionalSheet = async (buildTimestamp) => {
	var sheetInfo = {
		buildTimestamp: buildTimestamp,
		storageContext: fileUtils.getContext('CATALOG', 'UNIQUE'),
		exportOptions: {
			filename: `sheets/google-regional-inventory-${buildTimestamp.valueOf()}.xlsx`,
			tsvFilename: `sheets/google-regional-inventory-${buildTimestamp.valueOf()}.txt`,
			useStyles: true,
			useSharedStrings: true
		},
		exportWorkbook: null,
		exportWorksheet: null,
		recipients: (configUtils.get("GOOGLE_FEED_EMAILS") !== null) ? configUtils.get("GOOGLE_FEED_EMAILS") : 'matt@rushmarket.com',
		rowsProcessed: 0,
		row: 2,
		tsvFile: -1
	}

	sheetInfo.exportWorkbook = new excel.stream.xlsx.WorkbookWriter(sheetInfo.exportOptions);
	sheetInfo.exportWorksheet = sheetInfo.exportWorkbook.addWorksheet('Regional Feed'),

	sheetInfo.exportWorksheet.getCell(1, 1).value = 'id';
	sheetInfo.exportWorksheet.getCell(1, 2).value = 'region_id';
	sheetInfo.exportWorksheet.getCell(1, 3).value = 'price';
	sheetInfo.exportWorksheet.getCell(1, 4).value = 'availability';

	await sheetInfo.exportWorksheet.getRow(1).commit();

	// await initStream(sheetInfo);
	// await writeLineToStream(sheetInfo, 'id\tregion_id\tprice\tavailability');
	// sheetInfo.tsvFile = fsSync.createWriteStream(sheetInfo.exportOptions.tsvFilename, { flags: 'a' });
	// sheetInfo.tsvFile.on('error', (e) => sheetInfo.tsvFile.end());
	// sheetInfo.tsvFile.on('open', () => sheetInfo.tsvFile.write('id\tregion_id\tprice\tavailability'));

	return sheetInfo;
}



// , region, vcProducts, availability, newAverageMarginDollars, newAverageMarginPercent, likeNewAverageMarginDollars, likeNewAverageMarginPercent) => {

var writeMainSheet = async (sheetInfo, coinInfo, theId, vcp, metros) => {
	let col = 1;

	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = theId.id;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.coinProduct.data.rushProducts.coinId;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.coinProduct.data.rushProducts.name;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (coinInfo.coinProduct.data.rushProducts.productDescription !== null) ? coinInfo.coinProduct.data.rushProducts.productDescription : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = theId.regions[0].price + " USD";
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (theId.regions[0].conditionName === 'New') ? 'New' : 'Used';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = 'https://www.rushmarket.com/product/' + coinInfo.coinProduct.data.rushProducts.coinId + theId.pdpUrlExtension + '?utm_source=google&utm_medium=googleshopping&c=' + theId.conditionParam;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = theId.national ? 'in stock' : 'out of stock';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = ((coinInfo.coinProduct.data.rushProducts.images[0] !== undefined) && (coinInfo.coinProduct.data.rushProducts.images[0] !== null)) ?
		(coinInfo.coinProduct.data.rushProducts.images[0].indexOf("?") > -1) ?
		coinInfo.coinProduct.data.rushProducts.images[0] + '&utm_source=google&utm_medium=googleshopping' :
		coinInfo.coinProduct.data.rushProducts.images[0] + '?utm_source=google&utm_medium=googleshopping' :
		coinInfo.coinProduct.data.rushProducts.images[0];
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.coinProduct.data.rushProducts.frontEndSpace + ' > ' + coinInfo.coinProduct.data.rushProducts.frontEndName;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.coinProduct.data.rushProducts.brandName ? coinInfo.coinProduct.data.rushProducts.brandName : coinInfo.coinProduct.data.rushProducts.manufacturer;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.coinProduct.data.rushProducts.upc;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.feedDataCommon.mpn;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = ((coinInfo.coinProduct.data.rushProducts.upc === '') && (coinInfo.feedDataCommon.mpn === '')) ? 'N' : 'Y';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.coinProduct.data.rushProducts.primaryColor;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.coinProduct.data.rushProducts.primaryMaterial;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.coinProduct.data.rushProducts.size;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (coinInfo.coinProduct.data.rushProducts.style !== undefined) ? `General:Style:${coinInfo.coinProduct.data.rushProducts.style}` : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = 'https://www.rushmarket.com/product/' + coinInfo.coinProduct.data.rushProducts.coinId + theId.pdpUrlExtension;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (theId.regions[0].conditionName !== 'New') ? 'This Open Box item has been inspected by our team deemed to be in excellent condition with no physical flaws, scratches, or scuffs.' : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.coinProduct.data.rushProducts.msrp;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].mainImageLifestyle) ? vcp[0].mainImageLifestyle : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].altImage3) ? vcp[0].altImage3 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].altImage4) ? vcp[0].altImage4 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].altImage5) ? vcp[0].altImage5 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeName1) ? vcp[0].attributeName1 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeName2) ? vcp[0].attributeName2 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeName3) ? vcp[0].attributeName3 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeName4) ? vcp[0].attributeName4 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeName5) ? vcp[0].attributeName5 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeName6) ? vcp[0].attributeName6 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeValue1) ? vcp[0].attributeValue1 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeValue2) ? vcp[0].attributeValue2 : '';;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeValue3) ? vcp[0].attributeValue3 : '';;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeValue4) ? vcp[0].attributeValue4 : '';;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeValue5) ? vcp[0].attributeValue5 : '';;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].attributeValue6) ? vcp[0].attributeValue6 : '';;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].bulletPoint1) ? vcp[0].bulletPoint1 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].bulletPoint2) ? vcp[0].bulletPoint2 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].bulletPoint3) ? vcp[0].bulletPoint3 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].bulletPoint4) ? vcp[0].bulletPoint4 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].colorSpecific) ? vcp[0].colorSpecific : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = (vcp[0].materialSpecific) ? vcp[0].materialSpecific : '';
	let shipping = '';
	for (let i = 0; i < metros.length; i++) {
		if (theId.regions[0].shipType === 'LTL') {
			if (shipping.length) {
				shipping += ','
			}
			shipping += `US:${metros[i].zip}:LTL:${metros[i].largeItemFee} USD`;
		}
		// col++;
	}
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = shipping;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = theId.averageMarginDollars;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = theId.averageMarginPercent;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = coinInfo.coinProduct.data.rushProducts.frontEndName;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = theId.coinQuantity;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = theId.rbrQuantity;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = theId.directBuyQuantity;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = theId.vendorNames;

	await sheetInfo.exportWorksheet.getRow(sheetInfo.row).commit();

	sheetInfo.row++;
}



var writePhysicalSheet = async (sheetInfo, coinInfo) => {
	let origins = coinInfo.originsWithCoin;
	let tsvBuf = '\n';


	for (let i= 0; i < origins.length; i++) {
		sheetInfo.exportWorksheet.getCell(sheetInfo.row, 1).value = origins[i].id;
		tsvBuf += `${origins[i].id}`;
		sheetInfo.exportWorksheet.getCell(sheetInfo.row, 2).value = origins[i].storeId;
		tsvBuf += `\t${origins[i].storeId}`;
		sheetInfo.exportWorksheet.getCell(sheetInfo.row, 3).value = origins[i].city;
		tsvBuf += `\t${origins[i].city}`;
		// await writeLineToStream(sheetInfo, tsvBuf);
		await sheetInfo.exportWorksheet.getRow(sheetInfo.row).commit();
		sheetInfo.row++;
		tsvBuf = '\n';	
	}
}


var writeRegionalSheet = async (sheetInfo, theId) => {
	for (var j = 0; j < theId.regions.length; j++) {

		let tsvBuf = '\n';

		sheetInfo.exportWorksheet.getCell(sheetInfo.row, 1).value = theId.id;
		tsvBuf += `${theId.id}`;
		sheetInfo.exportWorksheet.getCell(sheetInfo.row, 2).value = theId.regions[j].regionId;
		tsvBuf += `\t${theId.regions[j].regionId}`;
		sheetInfo.exportWorksheet.getCell(sheetInfo.row, 3).value = theId.regions[j].price + " USD";
		tsvBuf += `\t${theId.regions[j].price + " USD"}`;
		sheetInfo.exportWorksheet.getCell(sheetInfo.row, 4).value = 'in stock';
		tsvBuf += `\tin stock`;
		
		// await writeLineToStream(sheetInfo, tsvBuf);
		await sheetInfo.exportWorksheet.getRow(sheetInfo.row).commit();

		sheetInfo.row++;
	}
}


var completeMainSheet = async (sheetInfo, metros) => {

	await sheetInfo.exportWorkbook.commit();

	var results = await fileUtils.storeMultipartFile(sheetInfo.storageContext, 'google-shopping-feed', sheetInfo.exportOptions.filename, `google-feed-${sheetInfo.buildTimestamp.valueOf()}.xlsx`, false);

	if (results != undefined) {
		comms.sendEmail(sheetInfo.recipients, 'Google Shopping Feed', '', `<br><br><b><a href="${results.url}">Google Shopping Feed</a>`, 'noreply@rushmarket.com', undefined, undefined);
		console.log("URL: " + results.url);
	}

	await writeMainTSV(sheetInfo, metros);

	//	Remove the local exported products file.
	await fs.unlink(sheetInfo.exportOptions.filename);
}


var writeMainTSV = async (sheetInfo, metros) => {
	let rowCount = 0;
	let workbookReader = new excel.stream.xlsx.WorkbookReader(sheetInfo.exportOptions.filename);
	let worksheetReader = undefined;

	for await (worksheetReader of workbookReader) {
		break;
	}

	let tsvBuf = 'id\titem_group_id\ttitle\tdescription\tprice\tcondition\tlink\tavailability\timage_link\tgoogle_product_category\tproduct_category\tbrand\tgtin\tmpn\tidentifier_exists\tcolor\tmaterial\tsize\tproduct_detail\tads_redirect\tproduct_highlight\tmsrp\tlifestyle_image\talt_image3\talt_image4\talt_image5\tattribute_name1\tattribute_name2\tattribute_name3\tattribute_name4\tattribute_name5\tattribute_name6\tattribute_value1\tattribute_value2\tattribute_value3\tattribute_value4\tattribute_value5\tattribute_value6\tbullet_point1\tbullet_point2\tbullet_point3\tbullet_point4\tcolor_specific\tmaterial_specific\t';

	// for (let i = 0; i < metros.length; i++) {
		tsvBuf += 'shipping\t';
	// }

	tsvBuf += 'avg_margin_dollars\tavg_margin_pct\tcategory2\tcoin_quantity\trbr_count\tdirect_buy_count\tvendor_names\n';

	let tsvFile = await fsSync.openSync(`${sheetInfo.exportOptions.tsvFilename}`, 'w');
	fsSync.writeSync(tsvFile, tsvBuf);

	for await (const row of worksheetReader) {
		tsvBuf = '';

		if (rowCount > 0) {
			//	id
			tsvBuf += `"${row._cells[0].value}"`;
	
			//	item_group
			tsvBuf += `\t"${row._cells[1].value}"`;
	
			//	title
			tsvBuf += '\t';
			tsvBuf += `"${row._cells[2].value.replace(/"/g, '""')}"`;

			//	description
			tsvBuf += '\t';
			if (row._cells[3] && row._cells[3].value) {
				tsvBuf += `"${row._cells[3].value.replace(/"/g, '""')}"`;
			}
	
			//	price
			tsvBuf += `\t${row._cells[4].value}`;
	
			//	condition
			tsvBuf += `\t${row._cells[5].value}`;

			//	link
			tsvBuf += `\t"${row._cells[6].value}"`;

			//	availability
			tsvBuf += `\t${row._cells[7].value}`;
	
			//	image_link
			tsvBuf += `\t`;
			if (row._cells[8] && row._cells[8].value) {
				tsvBuf += `"${row._cells[8].value}"`;
			}
	
			//	google_product_category
			tsvBuf += `\t`;

			//	product_category
			tsvBuf += `\t${row._cells[10].value}`;
	
			//	brand
			tsvBuf += `\t`; 
			if (row._cells[11] && row._cells[11].value) {
				tsvBuf += `${row._cells[11].value.replace(/"/g, '""')}`;
			}
	
			//	gtin
			tsvBuf += `\t`; 
			if (row._cells[12] && row._cells[12].value) {
				tsvBuf += `${row._cells[12].value}`;
			}
	
			//	mpn
			tsvBuf += `\t`; 
			if (row._cells[13] && row._cells[13].value) {
				tsvBuf += `${row._cells[13].value}`;
			}

			//	identifier_exists
			tsvBuf += `\t${row._cells[14].value}`;
	
			//	color
			tsvBuf += '\t'; 
			if (row._cells[15] && row._cells[15].value) {
				tsvBuf += `"${row._cells[15].value.replace(/,/g, '/')}"`;
			}
	
			//	material
			tsvBuf += '\t'; 
			if (row._cells[16] && row._cells[16].value) {
				tsvBuf += `"${row._cells[16].value.replace(/,/g, '/')}"`;
			}

			//	size
			tsvBuf += '\t';
			if (row._cells[17] && row._cells[17].value) {
				tsvBuf += `${row._cells[17].value}`;
			}
	
			//	product_detail
			tsvBuf += '\t';
			if (row._cells[18] && row._cells[18].value) {
				tsvBuf += `${row._cells[18].value}`;
			}

			//	ads_redirect
			tsvBuf += `\t${row._cells[19].value}`;
	
			//	product_highlight
			tsvBuf += '\t';
			if (row._cells[5].value !== 'New') {
				tsvBuf += `"This Open Box item has been inspected by our team.","Open Box Savings."`;
			}
	
			//	msrp
			tsvBuf += '\t';
			if (row._cells[21] && row._cells[21].value) {
				tsvBuf += `${row._cells[21].value}`;
			}
	
			//	main_lifestyle_image
			tsvBuf += '\t';
			if (row._cells[22] && row._cells[22].value) {
				tsvBuf += `"${row._cells[22].value}"`;
			}
	
			//	alt_image3
			tsvBuf += `\t`;
			if (row._cells[23] && row._cells[23].value) {
				tsvBuf += `"${row._cells[23].value}"`;
			}
	
			//	alt_image4
			tsvBuf += `\t`;
			if (row._cells[24] && row._cells[24].value) {
				tsvBuf += `"${row._cells[24].value}"`;
			}
	
			//	alt_image5
			tsvBuf += `\t`;
			if (row._cells[25] && row._cells[25].value) {
				tsvBuf == `"${row._cells[25].value}"`;
			}

			//	attribute_name1
			tsvBuf += `\t`;
			if (row._cells[26] && row._cells[26].value) {
				tsvBuf += `"${row._cells[26].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_name2
			tsvBuf += `\t`;
			if (row._cells[27] && row._cells[27].value) {
				tsvBuf += `"${row._cells[27].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_name3
			tsvBuf += `\t`;
			if (row._cells[28] && row._cells[28].value) {
				tsvBuf += `"${row._cells[28].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_name4
			tsvBuf += `\t`;
			if (row._cells[29] && row._cells[29].value) {
				tsvBuf += `"${row._cells[29].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_name5
			tsvBuf += `\t`;
			if (row._cells[30] && row._cells[30].value) {
				tsvBuf += `"${row._cells[30].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_name6
			tsvBuf += `\t`;
			if (row._cells[31] && row._cells[31].value) {
				tsvBuf += `"${row._cells[31].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_value1
			tsvBuf += `\t`;
			if (row._cells[32] && row._cells[32].value) {
				tsvBuf += `"${row._cells[32].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_value2
			tsvBuf += `\t`;
			if (row._cells[33] && row._cells[33].value) {
				tsvBuf += `"${row._cells[33].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_value3
			tsvBuf += `\t`;
			if (row._cells[34] && row._cells[34].value) {
				tsvBuf += `"${row._cells[34].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_value4
			tsvBuf += `\t`;
			if (row._cells[35] && row._cells[35].value) {
				tsvBuf += `"${row._cells[35].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_value5
			tsvBuf += `\t`;
			if (row._cells[36] && row._cells[36].value) {
				tsvBuf += `"${row._cells[36].value.replace(/"/g, '""')}"`;
			}
	
			//	attribute_value6
			tsvBuf += `\t`;
			if (row._cells[37] && row._cells[37].value) {
				tsvBuf += `"${row._cells[37].value.replace(/"/g, '""')}"`;
			}

			//	bullet_point1
			tsvBuf += `\t`;
			if (row._cells[38] && row._cells[38].value) {
				tsvBuf += `"${row._cells[38].value.replace(/"/g, '""')}"`;
			}
	
			//	bullet_point2
			tsvBuf += `\t`;
			if (row._cells[39] && row._cells[39].value) {
				tsvBuf += `"${row._cells[39].value.replace(/"/g, '""')}"`;
			}
	
			//	bullet_point3
			tsvBuf += `\t`;
			if (row._cells[40] && row._cells[40].value) {
				tsvBuf += `"${row._cells[40].value.replace(/"/g, '""')}"`;
			}
	
			//	bullet_point4
			tsvBuf += `\t`;
			if (row._cells[41] && row._cells[41].value) {
				tsvBuf += `"${row._cells[41].value.replace(/"/g, '""')}"`;
			}

			//	color_specific
			tsvBuf += `\t`;
			if (row._cells[42] && row._cells[42].value) {
				tsvBuf += `"${row._cells[42].value.replace(/"/g, '""')}"`;
			}
	
			//	material_specific
			tsvBuf += `\t`;
			if (row._cells[43] && row._cells[43].value) {
				tsvBuf += `"${row._cells[43].value.replace(/"/g, '""')}"`;
			}
	
			//	shipping
			tsvBuf += `\t`;
			if (row._cells[44] && row._cells[44].value) {
				tsvBuf += `${row._cells[44].value}`;
			}

			//	avg_margin_dollars
			tsvBuf += `\t`;
			tsvBuf += `${row._cells[45].value}`;
		
			//	avg_margin_pct
			tsvBuf += `\t`;
			tsvBuf += `${row._cells[46].value}`;
	
			//	category2
			tsvBuf += `\t`;
			if (row._cells[47] && row._cells[47].value) {
				tsvBuf += `"${row._cells[47].value.replace(/"/g, '""')}"`;
			}
	
			//	coin_quantity
			tsvBuf += `\t`;
			tsvBuf += `${row._cells[48].value}`;
	
			//	rbr_count
			tsvBuf += `\t`;
			tsvBuf += `${row._cells[49].value}`;
	
			//	direct_buy
			tsvBuf += `\t`;
			tsvBuf += `${row._cells[50].value}`;
	
			tsvBuf += `\t`;
			if (row._cells[51] && row._cells[51].value) {
				tsvBuf += `"${row._cells[51].value.replace(/"/g, '""')}"`;
			}

			tsvBuf += '\n';

			fsSync.writeSync(tsvFile, tsvBuf);
		}
		rowCount++;
	}

	fsSync.close(tsvFile);
}





var completePhysicalSheet = async (sheetInfo) => {

	await sheetInfo.exportWorkbook.commit();

	var results = await fileUtils.storeMultipartFile(sheetInfo.storageContext, 'physcial-coin', sheetInfo.exportOptions.filename, `physical-coin-${sheetInfo.buildTimestamp.valueOf()}.xlsx`, false);

	if (results != undefined) {
		comms.sendEmail('matt@rushmarket.com', 'Physical Coin Feed', '', `<br><br><b><a href="${results.url}">Physical Coin Feed</a>`, 'noreply@rushmarket.com', undefined, undefined);
		console.log("URL: " + results.url);
	}

	await writePhysicalTSV(sheetInfo);

	//	Remove the local exported products file.
	await fs.unlink(sheetInfo.exportOptions.filename);
}


var writePhysicalTSV = async (sheetInfo) => {
	let rowCount = 0;
	let workbookReader = new excel.stream.xlsx.WorkbookReader(sheetInfo.exportOptions.filename);
	let worksheetReader = undefined;

	for await (worksheetReader of workbookReader) {
		break;
	}

	let tsvFile = await fsSync.openSync(`${sheetInfo.exportOptions.tsvFilename}`, 'w');
	fsSync.writeSync(tsvFile, 'coin\tstore_id\tstore_city\n');

	for await (const row of worksheetReader) {
		let tsvBuf = '';

		if (rowCount > 0) {
			//	id
			tsvBuf += `${row._cells[0].value}`;
	
			//	store_id
			tsvBuf += `\t${row._cells[1].value}`;
	
			//	city
			tsvBuf += '\t';
			tsvBuf += `${row._cells[2].value}`;

			tsvBuf += '\n';

			fsSync.writeSync(tsvFile, tsvBuf);
		}
		rowCount++;
	}

	fsSync.close(tsvFile);
}




var completeRegionalSheet = async (sheetInfo) => {

	await sheetInfo.exportWorkbook.commit();

	var results = await fileUtils.storeMultipartFile(sheetInfo.storageContext, 'google-shopping-feed', sheetInfo.exportOptions.filename, `google-regional-inventory-${sheetInfo.buildTimestamp.valueOf()}.xlsx`, false);

	if (results != undefined) {
		comms.sendEmail(sheetInfo.recipients, 'Google Shopping Regional Feed', '', `<br><br><b><a href="${results.url}">Google Shopping Regional Feed</a>`, 'noreply@rushmarket.com', undefined, undefined);
		console.log("URL: " + results.url);
	}

	await writeRegionalTSV(sheetInfo);

	//	Remove the local exported products file.
	await fs.unlink(sheetInfo.exportOptions.filename);
}


var writeRegionalTSV = async (sheetInfo) => {
	let rowCount = 0;
	let workbookReader = new excel.stream.xlsx.WorkbookReader(sheetInfo.exportOptions.filename);
	let worksheetReader = undefined;

	for await (worksheetReader of workbookReader) {
		break;
	}

	let tsvFile = await fsSync.openSync(`${sheetInfo.exportOptions.tsvFilename}`, 'w');
	fsSync.writeSync(tsvFile, 'id\tregion_id\tprice\tavailability\n');

	for await (const row of worksheetReader) {
		let tsvBuf = '';

		if (rowCount > 0) {
			//	id
			tsvBuf += `${row._cells[0].value}`;
	
			//	region_id
			tsvBuf += `\t${row._cells[1].value}`;
	
			//	price
			tsvBuf += `\t${row._cells[2].value}`;
	
			//	availability
			tsvBuf += `\tin stock`;

			tsvBuf += '\n';

			fsSync.writeSync(tsvFile, tsvBuf);
		}
		rowCount++;
	}

	fsSync.close(tsvFile);
}


var uploadFeed = async (req, resp) => {

	var uploads = await GoogleFeed.getPendingUploads();

	var hosts = _.split(process.env.GOOGLE_FTP_HOST, ',');
	var users = _.split(process.env.GOOGLE_FTP_USER, ',');
	var pswds = _.split(process.env.GOOGLE_FTP_PSWD, ',');

	for (var i = 0; i < uploads.length; i++) {
		for (var j = 0; j < hosts.length; j++) {

			//	Don't send the coin-to-store feed to google.
			if ((uploads[i].originFilename.indexOf('physical') >= 0) && (hosts[j].indexOf('google') >= 0)) {
				continue;
			}
			//	Don't send the main product feed to google.
			if ((uploads[i].originFilename.indexOf('feed') >= 0) && (hosts[j].indexOf('google') >= 0)) {
				continue;
			}
			const client = new ftp.Client()
			client.ftp.verbose = true
			try {
				console.log("\n\n\n");
				// console.log(hosts[j], users[j], pswds[j]);
				await client.access({
					host: hosts[j],
					user: users[j],
					password: pswds[j],
					secure: false
				})
				// console.log(await client.list())
				await client.uploadFrom(uploads[i].originFilename, uploads[i].destFilename);

				await GoogleFeed.markUploadSent(uploads[i].id);
			} catch (err) {
				console.log(err)
			}
			client.close()
		}
		await fs.unlink(uploads[i].originFilename);
	}
}




module.exports = {
	buildGoogleFeed,
	deleteCoinFromFeed,
	getCoinFromFeed,
	insertCoinInRegionalFeed,
	skuDeleteCheck,
	updateCoinInFeed,
	uploadFeed
}