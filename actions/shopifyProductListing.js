const globals = require('../globals');

const axios = require('axios').create({
	timeout: globals.apiTimeout,
	validateStatus: function (status) {
		return status < 500;
	}
});

const {
	formatResp
} = require('../utils/response');


const RushProducts = require('../models/rushProducts');
const ShopifyStores = require('../models/shopifyStores');


var putProductListing = async (productId, variantId, label, resp) => {
	var label = label ? label : 'RMFE';
	var result = null;
	var results = null;

	if (productId !== undefined) {
		results = await RushProducts.getShopifyProductAndCityByProduct(productId);
		if (results.length === 0) {
			formatResp(resp, undefined, 404, "No product found.")
		}
	}
	else {
		results = await RushProducts.getShopifyProductAndCityByVariant(variantId);
		if (results.length === 0) {
			formatResp(resp, undefined, 404, "No variant found.")
		}
	}

	if (results.length > 0) {
		var keys = await ShopifyStores.getKeys(results[0].shopifyStoreId, label);
		
		if ((Array.isArray(keys)) && (keys.length === 0)) {
			formatResp(resp, undefined, 403, "Shopify keys not found.")
		}
		else {

			try {
				console.log(`https://${keys.apiKey}:${keys.apiPswd}@${results[0].shopName}/admin/api/2021-07/product_listings/${results[0].shopifyProductId}.json`);
				result = await axios.put(`https://${keys.apiKey}:${keys.apiPswd}@${results[0].shopName}/admin/api/2021-07/product_listings/${results[0].shopifyProductId}.json`, {});
			} 
			catch (e) {
				console.log("Axios exception " + e.message);
			}

			if (result === null) {
				formatResp(resp, undefined, 500, `NULL response trying update product listing for ${results[0].shopifyProductId}.`);
			}
			else if (result.status === 422) {
				formatResp(resp, undefined, 404, "Variant not found in shopify store.")
			}
			else if (result.status !== 200) {
				formatResp(resp, undefined, 404, `Unexpected status returned ${result.status}.`)
			}
		}
	}


	return;
}




module.exports = {
	putProductListing
}