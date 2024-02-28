'use strict';

const isValidZipcode = require('is-valid-zipcode');

const Coins = require('../models/coins')
const PartnerProducts = require('../models/partnerProducts')
const Vendors = require('../models/vendors');
const ZipToCity = require('../models/zipToCity');

const {
	formatResp
} = require('../utils/response');



var getAvailableQuantity = async (req, resp) => {
	//	Find vendor based on hostname.
	var vendor = await Vendors.getByOutletHost(req.query.hostname);

	if (vendor.length === 0) {
		resp = formatResp(resp, ['data'], 403, "Access denied.");
	} else {

		var vendorId = vendor[0].id;

		var coin = await Coins.getByVendorSku(vendorId, req.query.productId);
		var rushSkus = [];

	//	If no zip supplied, we're going to get quantity that can be shipped nationally.
		if ((req.query.zip === undefined) || (req.query.zip === null)) {

			var rushSkus = await getNationallyShippingSkus(vendorId, req.query.productId, coin, req.query.excludeDropship);

			if (rushSkus.length === 0) {
				resp = formatResp(resp, ['data'], 404, "No products found.");
			} else {

				formatResponse(rushSkus, coin, resp);
			}
		}
		else {
			req.query.zip = req.query.zip.trim();
			if (isValidZipcode(req.query.zip.trim()) === false) {
				resp = formatResp(resp, ['data'], 400, "Invalid zip code.");
			}
			else {
				var city = await ZipToCity.lookupCity(req.query.zip);
				if (city.length === 0) {
					resp = formatResp(resp, ['data'], 400, "No metro found.");
				}
				else {
					var rushSkus = await getRegionallyShippingSkus(vendorId, req.query.productId, coin, city[0].city_id, req.query.excludeDropship);

					if (rushSkus.length === 0) {
						resp = formatResp(resp, ['data'], 404, "No products found.");
					} else {
		
						formatResponse(rushSkus, coin, resp);
					}		
				}
			}
		}
	}
}


var formatResponse = (rushSkus, coin, resp) => {
	const formatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2
	})


	resp.data.totalQuantity = 0;
	var min = 1000000;
	var max = 0;
	var oqsFlag = false

	for (var i = 0; i < rushSkus.length; i++) {
		//	If at least one non-OQS sku, return COIN as productId.   Otherwise return sku.
		if (rushSkus[0].onlineQuickSale === 'N') {
			resp.data.productId = coin[0].coinId;
		}

		// Use first rushSku as an OQS.
		else {
			oqsFlag = true;
			resp.data.productId = rushSkus[0].sku;
		}

		if (((!oqsFlag) && (rushSkus[i].onlineQuickSale === 'N')) ||
			((oqsFlag) && (rushSkus[i].onlineQuickSale === 'Y'))) {
			resp.data.totalQuantity++;
			if (rushSkus[i].price < min) {
				min = rushSkus[i].price;
			}

			if (rushSkus[i].price > max) {
				max = rushSkus[i].price;
			}
		}

		if (rushSkus[i].onlineQuickSale === 'Y') {
			break;
		}
	}


	//	Format priceRange
	if (min === max) {
		resp.data.priceRange = formatter.format(min);
	} else {
		resp.data.priceRange = `${formatter.format(min)}-${formatter.format(max)}`;
	}

}


var getNationallyShippingSkus = async (vendorId, vendorSku, coin, excludeDropship) => {
	var rushSkus = [];

	//	This will retrieve all rush skus that ship nationally and are associated with a COIN based on vendor sku.
	if (coin.length > 0) {
		rushSkus = await PartnerProducts.getNationalQuantityByCoin(coin[0].coinId, excludeDropship);
	}

	//	If none by COIN, look for nationally shippingOQS skus based on seller_product_id
	if ((coin.length === 0) || (rushSkus.length === 0)) {
		rushSkus = await PartnerProducts.getNationalOQSQuantity(vendorId, vendorSku);
	}

	return rushSkus;
}


var getRegionallyShippingSkus = async (vendorId, vendorSku, coin, cityId, excludeDropship) => {
	var rushSkus = [];

	//	This will retrieve all rush skus that ship nationally and are associated with a COIN based on vendor sku.
	if (coin.length > 0) {
		rushSkus = await PartnerProducts.getRegionalQuantityByCoin(cityId, coin[0].coinId, excludeDropship);
	}

	//	If none by COIN, look for nationally shippingOQS skus based on seller_product_id
	if ((coin.length === 0) || (rushSkus.length === 0)) {
		rushSkus = await PartnerProducts.getRegionalOQSQuantity(cityId, vendorId, vendorSku);
	}

	return rushSkus;
}




module.exports = {
	getAvailableQuantity
};