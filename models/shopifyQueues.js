'use strict';

const globals = require('../globals');


//
//	Throw item in shopify queue to take a low-inventory sku offline.
//
var takeSkuOffline = async (sku, extraData) => {
	var result = await globals.pool.query("INSERT INTO shopify_queue (action, type, value, extra_data) " +
		"VALUES ('LOW_INVENTORY', 'PRODUCT', ?, ?)", [sku, extraData]);
}


module.exports = {
	takeSkuOffline
};