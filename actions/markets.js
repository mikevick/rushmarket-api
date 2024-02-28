'use strict'

const responseUtils = require('../utils/response');
const marketUtils = require('../utils/marketUtils')

const Markets = require('../models/markets')
const StorageAreas = require('../models/storageAreas')
const Stores = require('../models/stores')
const ZipToCityActions = require('../actions/zipToCity');



var createMarketRippleOverride = async (marketId, req, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}


	var override = await Markets.getAlgoStateOverridesByState(marketId, market[0].rippleAlgoId, req.body.state);
	if (override.length > 0) {
		responseUtils.formatResp(resp, ["id", "data"], 409, 'This override already exists.');
		return resp;
	}

	var valid = await Markets.getAlgoState(market[0].rippleAlgoId, req.body.state);
	if (valid.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 400, 'Invalid state for this algorithm.');
		return resp;
	}


	var result = await Markets.createAlgoStateOverride(marketId, market[0].rippleAlgoId, req.body.state, req.body.daysInStateOverride);

	if (result.affectedRows !== 1) {
		responseUtils.formatResp(resp, undefined, 500, 'Something unexpected happened.');
	} else {
		resp.id = result.insertId;
	}
	return resp;
}




var createMarketRippleCategoryOverride = async (marketId, req, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}


	var override = await Markets.getAlgoStateCategoryOverridesByState(marketId, market[0].rippleAlgoId, req.body.categoryId, req.body.state);
	if (override.length > 0) {
		responseUtils.formatResp(resp, ["id", "data"], 409, 'This override already exists.');
		return resp;
	}

	var valid = await Markets.getAlgoState(market[0].rippleAlgoId, req.body.state);
	if (valid.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 400, 'Invalid state for this algorithm.');
		return resp;
	}


	var result = await Markets.createAlgoStateCategoryOverride(marketId, market[0].rippleAlgoId, req.body.categoryId, req.body.state, req.body.daysInStateOverride);

	if (result.affectedRows !== 1) {
		responseUtils.formatResp(resp, undefined, 500, 'Something unexpected happened.');
	} else {
		resp.id = result.insertId;
	}
	return resp;
}


var createMarketRippleLocationOverride = async (marketId, req, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}
	let whereInfo = {
		clause: 'where 1=1',
		values: []
	};



	var storageArea = await StorageAreas.getByIds(req.body.storageArea, market[0].storeId, whereInfo, 'storage_area_name');
	if (storageArea.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Storage area not found.');
		return resp;
	}


	var override = await Markets.getAlgoStateLocationOverridesByState(market[0].rippleAlgoId, market[0].storeId, req.body.storageArea, req.body.state);
	if (override.length > 0) {
		responseUtils.formatResp(resp, ["id", "data"], 409, 'This override already exists.');
		return resp;
	}

	var valid = await Markets.getAlgoState(market[0].rippleAlgoId, req.body.state);
	if (valid.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 400, 'Invalid state for this algorithm.');
		return resp;
	}

	var result = await Markets.createAlgoStateLocationOverride(market[0].storeId, market[0].rippleAlgoId, req.body.storageArea, req.body.state, req.body.daysInStateOverride);

	if (result.affectedRows !== 1) {
		responseUtils.formatResp(resp, undefined, 500, 'Something unexpected happened.');
	} else {
		resp.id = result.insertId;
	}
	return resp;
}


var getAll = async (resp) => {
	var markets = await Markets.getAll();


	resp.data.markets = markets;

	return resp;
}




var getById = async (marketId, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}

	resp.data = market[0];

	return resp;
}



var getByStoreId = async (storeId, resp) => {
	var market = await Markets.getByStoreId(storeId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}

	resp.data = market[0];

	return resp;
}



var getMarketRippleCategoryOverrides = async (marketId, whereInfo, sortBy, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}

	var overrides = await Markets.getMarketRippleCategoryOverrides(marketId, whereInfo, sortBy);
	if (overrides.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Overrides not found.');
		return resp;
	}

	resp.data.categoryOverrides = overrides;

	return resp;
}




var getMarketRippleLocationOverrides = async (marketId, whereInfo, sortBy, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}

	var overrides = await Markets.getMarketRippleLocationOverrides(marketId, whereInfo, sortBy);
	if (overrides.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Overrides not found.');
		return resp;
	}

	resp.data.locationOverrides = overrides;

	return resp;
}




var getMarketRippleSettings = async (marketId, resp) => {
	var settings = await Markets.getRippleSettings(marketId);
	if (settings.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}

	for (var i=0; i < settings.length; i++) {
		if (settings[i].activeFlag === 1) {
			settings[i].activeFlag = true;
		}
		else {
			settings[i].activeFlag = false;
		}
	}

	resp.data = settings;

	return resp;
}



var updateMarketRippleSettings = async (req, resp) => {
	var settings = await Markets.getRippleSettings(req.params.id);
	if (settings.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}

	var result = await Markets.updateRippleSettingsById(req.params.sid, req.body.activeFlag);

	if (result.affectedRows != 1) {
		responseUtils.formatResp(resp, ["id"], 404, 'Ripple settings not found.');
	}

	return resp;
}



var getMarketRippleLocationOverridesById = async (marketId, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}

	var overrides = await Markets.getAlgoStateOverridesById(marketId, market[0].rippleAlgoId);
	if (overrides.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}

	resp.data.skuCount = overrides.skuCount;
	resp.data.overrides = overrides.states;

	return resp;
}



var getMarketRippleSkus = async (marketId, sortBy, offset, limit, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	}

	market = market[0];

	var result = await Markets.getMarketAlgoSkus(marketId, sortBy);
	if (result.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Skus not found.');
		return resp;
	} else {
		resp.data.skus = result;
	}

	return resp;
}



//	Force a market to NATIONWIDE ripple.  This would be used for existing markets at the time Ripple is rolled out.
var forceNationwide = async (marketId) => {
	var market = await Markets.getById(marketId);

	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	} else {
		//	Set eligibility override for all skus located in this market to null 
		await overrideEligibilityByMarket(market[0].storeId, null);

		//	Set sku algo states to nationwide
		await Markets.nationwideSkuAlgoStates(market[0].id, market[0].storeId, market[0].rippleAlgoId);

		//	Update market phase.
		await Markets.updateMarketPhase(marketId, 'RIPPLE');
	}
}



var updateById = async (marketId, req, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, undefined, 404, 'Market not found.');
		return resp;
	}
	market = market[0];

	
	var store = await Stores.getById(market.storeId);
	if (store.length === 0) {
		responseUtils.formatResp(resp, undefined, 404, 'Market store ID invalid.');
		return resp;
	}


	resp = marketUtils.validateMarketState(market, req, resp);
	if (resp.statusCode !== 200) {
		return resp;
	}


	if ((req.body.memberDisplayName != undefined) || (req.body.storeType != undefined) || (req.body.onlineAvailable != undefined) || (req.body.curbsideAvailable != undefined)) {
		await Stores.updateById(market.storeId, req.body.memberDisplayName, req.body.storeType, req.body.onlineAvailable, req.body.curbsideAvailable);

		await ZipToCityActions.runLocationCalculations();
	}


	//	Check original market type against new to determine if we need to transition.
	if ((req.body.marketType != undefined) && (market.marketType !== req.body.marketType)) {
		await Markets.updateById(marketId, undefined, req.body.marketType);

		if (req.body.marketType === 'FULFILLMENT_CENTER') {
			await transitionToFulfillmentCenter(market.id);
		} else if (req.body.marketType === 'OPEN_MARKET') {
			await transitionToOpenMarket(market.id);
		}
	}


	if (req.body.marketOpen != undefined) {
		await Markets.updateById(marketId, req.body.marketOpen, undefined);
	}

	return resp;
}



var updateMarketRippleOverride = async (marketId, overrideId, req, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id"], 404, 'Market not found.');
		return resp;
	}
	market = market[0];


	var result = await Markets.updateAlgoStateOverride(overrideId, req.body.daysInStateOverride);

	if (result.affectedRows != 1) {
		responseUtils.formatResp(resp, ["id"], 404, 'Override not found.');
	}

	return resp;
}


var updateMarketRippleCategoryOverride = async (marketId, overrideId, req, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id"], 404, 'Market not found.');
		return resp;
	}
	market = market[0];


	var result = await Markets.updateAlgoStateCategoryOverride(overrideId, req.body.daysInStateOverride);

	if (result.affectedRows != 1) {
		responseUtils.formatResp(resp, ["id"], 404, 'Override not found.');
	}

	return resp;
}


var updateMarketRippleLocationOverride = async (marketId, overrideId, req, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id"], 404, 'Market not found.');
		return resp;
	}
	market = market[0];


	var result = await Markets.updateAlgoStateLocationOverride(overrideId, req.body.daysInStateOverride);

	if (result.affectedRows != 1) {
		responseUtils.formatResp(resp, ["id"], 404, 'Override not found.');
	}

	return resp;
}



var deleteMarketRippleCategoryOverride = async (marketId, overrideId, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id"], 404, 'Market not found.');
		return resp;
	}
	market = market[0];


	var result = await Markets.deleteAlgoStateCategoryOverride(overrideId);

	if (result.affectedRows != 1) {
		responseUtils.formatResp(resp, ["id"], 404, 'Override not found.');
	}

	return resp;
}



var deleteMarketRippleLocationOverride = async (marketId, overrideId, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id"], 404, 'Market not found.');
		return resp;
	}
	market = market[0];


	var result = await Markets.deleteAlgoStateLocationOverride(overrideId);

	if (result.affectedRows != 1) {
		responseUtils.formatResp(resp, ["id"], 404, 'Override not found.');
	}

	return resp;
}





var deleteMarketRippleOverride = async (marketId, overrideId, resp) => {
	var market = await Markets.getById(marketId);
	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id"], 404, 'Market not found.');
		return resp;
	}
	market = market[0];


	var result = await Markets.deleteAlgoStateOverride(overrideId);

	if (result.affectedRows != 1) {
		responseUtils.formatResp(resp, ["id"], 404, 'Override not found.');
	}

	return resp;
}




//	TODO Move into ripple algorithm library
var determineSummary = async (sku) => {
	var rows = await Markets.getEligibility(sku);
	var shippableCount = 0;

	//	Determine shippable percentage for this sku
	for (var i = 0; i < rows.length; i++) {
		if (rows[i].eligibility === 'SHIPPABLE') {
			shippableCount++;
		}
	}

	await Markets.storeSummary(sku, shippableCount, rows.length, Math.round((shippableCount / rows.length) * 100.0));

	var vsku = await Markets.getVendorSku(sku);
	if (vsku.length > 0) {
		var coinSkus = await Markets.getSkusInCoin(vsku[0].sellerProductId.replace(/'/g, "\\'"));
		if (coinSkus.skuList.length > 0) {
			await Markets.storeCoinSummary(coinSkus.skuList, coinSkus.skusInCoin, coinSkus.shippableInCoin, Math.round((coinSkus.shippableInCoin / coinSkus.skusInCoin) * 100.0));
			await Markets.storeCoinByCity(coinSkus.skuArray, coinSkus.skusInCoin, coinSkus.byCity);
		}
	}
}


var determineSummaryByMarket = async (storeId) => {
	var skus = await Markets.getMarketSkus(storeId);

	var prom = [];
	for (var i = 0; i < skus.length; i++) {
		prom.push(determineSummary(skus[i].sku));
	}
	await Promise.all(prom);
}



//	Reset market back to PREOPEN.   This would likely only be used during testing.
var resetMarket = async (marketId, resp) => {
	var market = await Markets.getById(marketId);

	if (market.length === 0) {
		responseUtils.formatResp(resp, ["id", "data"], 404, 'Market not found.');
		return resp;
	} else {
		//	Set eligibility override for all skus located in this market to NOT_ELIGIBLE 
		await overrideEligibilityByMarket(market[0].storeId, 'NOT_ELIGIBLE');

		await determineSummaryByMarket(market[0].storeId);

		//	Remove sku algo states
		await Markets.clearSkuAlgoStates(market[0].storeId);

		//	Update market status.
		await Markets.updateMarketStatus(marketId, 'PREOPEN');
		await Markets.updateById(marketId, undefined, 'FULFILLMENT_CENTER');
		await Stores.updateById(market[0].storeId, undefined, 'ONLINE');

		await ZipToCityActions.runLocationCalculations();
	}
}



//	Look for markets in Ripples and invoke the logic to transition from one ripple to the next.   
var rippleMovementCheck = async (resp) => {
	var algos = await Markets.getMarketsInRipples();

	for (var i = 0; i < algos.length; i++) {
		var algo = require(`${algos[i].codeModule}`);
		await algo.transition(algos[i].algoId);
	}

	return resp;
}



//	Look for markets ready to open and transition them based on whether it'll operate as a Fulfillment Center or Open Market.   
var transitionOpeningMarkets = async (resp) => {
	var markets = await Markets.getReadyToOpen();

	for (var i = 0; i < markets.length; i++) {

		await Markets.updateMarketStatus(markets[i].id, 'ACTIVE');

		//	If Fulfillment Center, all online eligible skus in warehouse location to GDE eligibility
		if (markets[i].marketType === 'FULFILLMENT_CENTER') {
			await transitionToFulfillmentCenter(markets[i].id);
		}


		//	If Open Market, all eligible skus already in GDE eligibility stay that way, all others go through ripples
		else if (markets[i].marketType === 'OPEN_MARKET') {
			await transitionToOpenMarket(markets[i].id);
		}

	}

	return resp;
}



//	Transition market to Fulfillment Center mode
var transitionToFulfillmentCenter = async (marketId) => {
	var markets = await Markets.getById(marketId);

	if (markets.length === 1) {
		var market = markets[0];

		await Markets.updateById(marketId, undefined, 'FULFILLMENT_CENTER');

		if (markets[0].status === 'ACTIVE') {
			// console.log("transitioning to fulfillment center");
			await overrideEligibilityByMarket(market.storeId, null);
			await determineSummaryByMarket(market.storeId);

			//	Remove sku algo states
			await Markets.clearSkuAlgoStates(market.storeId);

			await Markets.updateMarketStatus(market.id, 'ACTIVE');
		}
	}
}



//	Transition market to Open Market mode
var transitionToOpenMarket = async (marketId, ripple) => {
	var markets = await Markets.getById(marketId);

	if (markets.length === 1) {
		var market = markets[0];

		await Markets.updateById(marketId, undefined, 'OPEN_MARKET');

		if (markets[0].status === 'ACTIVE') {
			// console.log("transitioning to open market");

			await initializeRipples(market, ripple);
			await determineSummaryByMarket(market.storeId);

			await Markets.updateMarketStatus(markets[0].id, 'ACTIVE');
		}
	}
}



//	Initialize Ripples 
var initializeRipples = async (market) => {
	// console.log("initializing ripples");
	var algo = require(`${market.codeModule}`);

	await algo.init(market.id);
}



var overrideEligibilityByMarket = async (storeId, overrideEligibility, destCities) => {
	var skus = await Markets.getMarketSkus(storeId);

	var prom = [];
	for (var i = 0; i < skus.length; i++) {
		prom.push(Markets.overrideEligibilityBySku(skus[i].sku, overrideEligibility, destCities));
		prom.push(determineSummary(skus[i].sku));
	}
	await Promise.all(prom);

	return skus;
}


var resetToLowestRipple = async (sku, storeId, storageArea) => {
	var market = await Markets.getByStoreId(storeId);
	if (market.length === 1) {
		market = market[0];
		var algo = require(`${market.codeModule}`);

		if ((market.status === 'ACTIVE') && (market.marketType === 'OPEN_MARKET')) {
			var eligibility = await Markets.getEligibilityDataBySku(sku);
			var categoryId = null;
			if (eligibility.length > 0) {
				categoryId = eligibility[0].categoryId;
			}
			await algo.setState(market.rippleAlgoId, market.id, sku, storeId, storageArea, categoryId, null);
		}
	}
}



//	DEPRECATED
//	Look for markets ready to move from BOPIS_ONLY to Ripple.   
// var transitionExpiredBOPISOnly = async (resp) => {
// 	var markets = await Markets.getExpiredBOPISOnly();


// 	//	Set eligibility override for all skus located in this market to BOPIS_ONLY
// 	for (var i = 0; i < markets.length; i++) {
// 		await transitionMarketPhase(markets[i]);
// 	}

// 	return resp;
// }



//	DEPRECATED
//	Look for markets ready to move on from MARKET_EXCLUSIVE.   
// var transitionExpiredMarketExclusive = async (resp) => {
// 	var markets = await Markets.getExpiredMarketExclusive();

// 	//	Set eligibility override for all skus located in this market to BOPIS_ONLY
// 	for (var i = 0; i < markets.length; i++) {
// 		await transitionMarketPhase(markets[i]);
// 	}

// 	return resp;
// }



// var transitionMarketPhase = async (market) => {
// 	//	Get information about market phases for this market to determine what phase to land the market in.
// 	var phaseInfo = await Markets.getPhaseInfo(market.id);

// 	var boe = moment(market.bopisOnlyEnd);
// 	var mee = moment(market.marketExclusiveEnd);
// 	var now = moment();

// 	if (phaseInfo.marketExclusiveFlag && mee.isAfter(now) && (market.eligibilityPhase === 'PREOPEN')) {
// 		await transitionToMarketExclusive(market);
// 	} else if (phaseInfo.bopisOnlyFlag && boe.isAfter(now) && ((market.eligibilityPhase === 'PREOPEN') || (market.eligibilityPhase === 'MARKET_EXCLUSIVE'))) {
// 		await transitionToBOPISOnly(market);
// 	} else {
// 		await transitionToRipples(market);
// 	}
// }



//	DEPRECATED
//
//	Transition market to BOPIS ONLY
// var transitionToBOPISOnly = async (market) => {
// 	console.log("transitioning to bopis only");
// 	await overrideEligibilityByMarket(market.storeId, 'NOT_ELIGIBLE');
// 	await overrideEligibilityByMarket(market.storeId, 'BOPIS_ONLY', [market.cityId]);
// 	await determineSummaryByMarket(market.storeId);
// 	await Markets.updateMarketPhase(market.id, 'BOPIS_ONLY');
// }


//	DEPRECATED
//
//	Transition market to Market Exclusive
// var transitionToMarketExclusive = async (market) => {
// 	console.log("transitioning to market exclusive");
// 	await overrideEligibilityByMarket(market.storeId, 'NOT_ELIGIBLE');
// 	await determineSummaryByMarket(market.storeId);
// 	await Markets.updateMarketPhase(market.id, 'MARKET_EXCLUSIVE');
// }




module.exports = {
	createMarketRippleOverride,
	createMarketRippleCategoryOverride,
	createMarketRippleLocationOverride,
	deleteMarketRippleOverride,
	deleteMarketRippleCategoryOverride,
	deleteMarketRippleLocationOverride,
	determineSummary,
	determineSummaryByMarket,
	forceNationwide,
	getAll,
	getById,
	getByStoreId,
	getMarketRippleCategoryOverrides,
	getMarketRippleLocationOverrides,
	getMarketRippleLocationOverridesById,
	getMarketRippleSettings,
	getMarketRippleSkus,
	initializeRipples,
	overrideEligibilityByMarket,
	resetMarket,
	resetToLowestRipple,
	rippleMovementCheck,
	transitionToFulfillmentCenter,
	transitionToOpenMarket,
	transitionOpeningMarkets,
	updateById,
	updateMarketRippleCategoryOverride,
	updateMarketRippleLocationOverride,
	updateMarketRippleOverride,
	updateMarketRippleSettings
}