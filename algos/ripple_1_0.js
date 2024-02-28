'use strict'

const e = require('express');
const moment = require('moment-timezone');

const markets = require('../actions/markets')

const Markets = require('../models/markets')
const RippleAlgos = require('../models/rippleAlgos')
const Stores = require('../models/stores');


//	Initialize the Ripples for 1.0 algorithm
exports.init = async (marketId) => {
	var market = await Markets.getById(marketId);
	if (market.length > 0) {
		market = market[0];
	} else {
		throw Error("Unrecognized market");
	}

	console.log("Ripple 1.0 - initializing " + market.storeId);

	var algos = await RippleAlgos.getByNameAndState('RIPPLE_1.0');


	if (algos.length > 0) {

		//	If there are skus in this market that are not eligibility overriden to NOT_ELIGIBLE then the market 
		//	has been ACTIVE before transitioning to OPEN_MARKET.  
		var unsuppressedCount = await Markets.getUnsuppressedMarketSkus(market.storeId);
		if (unsuppressedCount > 0) {
			//	Any online eligible skus at the time the market switches to OPEN_MARKET from FULFILLMENT_CENTER
			//	remain with their GDE eligibility and be in the NATIONWIDE ripple.
			//	All new skus will enter the first ripple.
			var skus = await markets.overrideEligibilityByMarket(market.storeId, null);
			for (var i = 0; i < skus.length; i++) {
				await RippleAlgos.updateSkuState(skus[i].sku, algos[0].id, 'NATIONWIDE', null);
			}
		} else {

			//	Otherwise we're starting with the ripples and therefore any
			//	that are being overridden NOT_ELIGIBLE will be put into the 
			//	first active ripple.
			var suppressedSkus = await Markets.getSuppressedMarketSkus(market.storeId);
			for (var i = 0; i < suppressedSkus.length; i++) {
				await this.setState(market.rippleAlgoId, marketId, suppressedSkus[i].sku, suppressedSkus[i].storeId, suppressedSkus[i].storageArea,
					suppressedSkus[i].categoryId, null);
			}
		}

	} else {
		//	TODO log error;
	}
}



var setState = async (algoId, marketId, sku, storeId, storageArea, categoryId, currentState, conditionName) => {
	//	If DS sku, go directly to NATIONWIDE
	var dsFlag = await RippleAlgos.dsCheck(sku);

	if (dsFlag) {
		await nationwide(algoId, sku, marketId, storeId, storageArea, categoryId, nextState);
	} else {

		var nextState = 'NATIONWIDE';
		var s = await RippleAlgos.getNextActiveState(marketId, currentState);
		if ((s !== undefined) && (s !== null)) {
			nextState = s;
		}

		// console.log("Moving " + sku + " from " + currentState + " to " + nextState);

		switch (nextState) {

			case 'BOPIS_ONLY':
				await bopis(algoId, sku, marketId, storeId, storageArea, categoryId, nextState);
				break

			case 'LOCAL':
				var stifleExpiration = false;

				//	If this is a damaged product, don't set an expiration so sku will never go past LOCAL.
				if ((conditionName !== undefined) && ((conditionName === 'Damaged') || (conditionName === 'Good') || (conditionName === 'Fair'))) {
					stifleExpiration = true;
				}
				await local(algoId, sku, marketId, storeId, storageArea, categoryId, nextState, stifleExpiration);
				break

			case 'RIPPLE_1':
				await ripple(1, algoId, sku, marketId, storeId, storageArea, categoryId, nextState);
				break;

			case 'RIPPLE_2':
				await ripple(2, algoId, sku, marketId, storeId, storageArea, categoryId, nextState);
				break;

			case 'RIPPLE_3':
				await ripple(3, algoId, sku, marketId, storeId, storageArea, categoryId, nextState);
				break;

			case 'RIPPLE_4':
				await ripple(4, algoId, sku, marketId, storeId, storageArea, categoryId, nextState);
				break;

			case 'RIPPLE_5':
				await ripple(5, algoId, sku, marketId, storeId, storageArea, categoryId, nextState);
				break;

			case 'NATIONWIDE':
				await nationwide(algoId, sku, marketId, storeId, storageArea, categoryId, nextState);
				break;
		}
	}
}


//
//	Transition skus in epired ripples to their next state
//
var transition = async (algoId) => {
	var rippleSkus = await RippleAlgos.getExpiredRipples();

	for (var i = 0; i < rippleSkus.length; i++) {
		setState(algoId, rippleSkus[i].marketId, rippleSkus[i].sku, rippleSkus[i].storeId, rippleSkus[i].storageArea, rippleSkus[i].categoryId, rippleSkus[i].currentState, rippleSkus[i].conditionName);
	}
}



//	
//	Enable calculated eligibility for local only.  
//	
var bopis = async (algoId, sku, marketId, storeId, storageArea, categoryId, nextState) => {
	var shippingRipples = await RippleAlgos.getShippingRipples(sku);

	if (shippingRipples.length > 0) {
		await Markets.overrideEligibilityBySku(sku, 'NOT_ELIGIBLE');
		await Markets.overrideEligibilityBySku(sku, 'BOPIS_ONLY', [shippingRipples[0].cityId]);

		await markets.determineSummary(sku);

		var stateExpire = await daysInState(algoId, nextState, marketId, storeId, storageArea, categoryId);
		await RippleAlgos.updateSkuState(sku, algoId, nextState, stateExpire);
	}
}


//	
//	Enable calculated eligibility for local only.  
//	
var local = async (algoId, sku, marketId, storeId, storageArea, categoryId, nextState, stifleExpiration) => {
	var shippingRipples = await RippleAlgos.getShippingRipples(sku);

	if (shippingRipples.length > 0) {
		await Markets.overrideEligibilityBySku(sku, 'NOT_ELIGIBLE');
		await Markets.overrideEligibilityBySku(sku, null, [shippingRipples[0].cityId]);

		await markets.determineSummary(sku);

		var stateExpire = null;
		if ((stifleExpiration === undefined) || (stifleExpiration === false)) {
			stateExpire = await daysInState(algoId, nextState, marketId, storeId, storageArea, categoryId);
		}
		await RippleAlgos.updateSkuState(sku, algoId, nextState, stateExpire);
	}
}


//	
//	Enable calculated eligibility for all markets.  
//	
var nationwide = async (algoId, sku, storeId, storageArea, categoryId, nextState) => {
	var shippingRipples = await RippleAlgos.getShippingRipples(sku);

	await Markets.overrideEligibilityBySku(sku, null);
	await markets.determineSummary(sku);
	await RippleAlgos.updateSkuState(sku, algoId, 'NATIONWIDE', null);
}



//	
//	Enable calculated eligibility for markets with distinct shipping cost values successively as rippleNum increases.  
//	
var ripple = async (rippleNum, algoId, sku, marketId, storeId, storageArea, categoryId, nextState) => {
	var shippingRipples = await RippleAlgos.getShippingRipples(sku);

	//	If number of distinct shipping costs matches ripple number, advance this sku ahead to NATIONWIDE.
	if (shippingRipples.length <= rippleNum) {
		await Markets.overrideEligibilityBySku(sku, null);
		await markets.determineSummary(sku);
		await RippleAlgos.updateSkuState(sku, algoId, 'NATIONWIDE', null);
	}

	//	If more than rippleNum distinct shipping costs, advance the rippleNumth ring of cities with the lowest cost.
	else {
		await Markets.overrideEligibilityByShipCost(sku, null, shippingRipples[(rippleNum - 1)].nationalShipCost);
		await markets.determineSummary(sku);

		var stateExpire = await daysInState(algoId, nextState, marketId, storeId, storageArea, categoryId);
		await RippleAlgos.updateSkuState(sku, algoId, nextState, stateExpire);
	}
}



var daysInState = async (algoId, nextState, marketId, storeId, storageArea, categoryId) => {
	var days = await RippleAlgos.getDaysInState(algoId, nextState, marketId, storeId, storageArea, categoryId);
	var daysInState = 14;
	if (days.length > 0) {
		daysInState = days[0].daysInState;
	}

	return moment().add(daysInState, 'days').format('YYYY-MM-DD HH:mm:ss');
}


module.exports = {
	nationwide,
	setState,
	transition
}