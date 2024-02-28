'use strict'

const _ = require('lodash');

const responseUtils = require('./response');


var validateMarketState = (market, req, resp) => {
	var newMarket = _.cloneDeep(market);

	if (req.body.storeType != undefined) {
		newMarket.storeType = req.body.storeType;
	}

	if (req.body.marketType != undefined) {
		newMarket.marketType = req.body.marketType;
	}

	//	If going to OPEN_MARKET the store type has to be PHYSICAL.
	if ((market.marketType === 'FULFILLMENT_CENTER') && (newMarket.marketType === 'OPEN_MARKET')) {
		if (newMarket.storeType !== 'PHYSICAL') {
			responseUtils.formatResp(resp, undefined, 400, 'Market type cannot be set to OPEN_MARKET unless store type is PHYSICAL.');
			return resp;
		}
	}

	//	If changing store type to ONLINE, market type cannot be OPEN_MARKET.
	if ((market.storeType === 'PHYSICAL') && (newMarket.storeType === 'ONLINE')) {
		if (newMarket.marketType === 'OPEN_MARKET') {
			responseUtils.formatResp(resp, undefined, 400, 'Store type cannot be set to ONLINE unless market type is FULFILLMENT_CENTER.');
			return resp;
		}
	}

	return resp;
}


module.exports = {
	validateMarketState
}