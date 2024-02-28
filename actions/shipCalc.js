const moment = require('moment');

const configUtils = require('../utils/configUtils');

const CarrierSelection = require('../models/carrierSelection');
const Members = require('../models/members');
const Metros = require('../models/metros');
const ProductHolds = require('../models/productHolds');
const TargetedCities = require('../models/targetedCities');
const ZipToCity = require('../models/zipToCity');



var validateShippableZip = async (req, resp, cartField, cartId) => {
	var cityId = 0;
	var localShippableFlag = false;
	var ltlLargeItemFee = {
		largeItemFee: 50,
		shopifyLargeItemFeeRate: 'Large Item Delivery'
	};
	var nonLocalShippableFlag = false;
	var pickupZipFlag = false;

	if ((req.query.destZip === undefined) || (req.query.destZip === null)) {
		req.query.destZip = '';
	}
	var dash = req.query.destZip.indexOf('-');
	if (dash > 0) {
		req.query.destZip = req.query.destZip.substring(0, dash);
	}


	//	Look the zip up for non-local deliveries.  If the zip is outside market BUT the member has been slotted in a market, it's all good.
	var member = await Members.getById(req.decoded.memberId);
	if (member.length > 0) {
		member = member[0];
	}
	else {
		member = null;
	}

	var city = await ZipToCity.lookupCity(req.query.destZip);
	if (city.length > 0) {
		cityId = city[0].city_id;
	}
	else if ((member !== null) && (member.homeCityId > 0)) {
		cityId = member.homeCityId;
	}

	if ((city.length > 0)  || ((member !== null) && (member.homeCityId > 0) && (member.zip === req.query.destZip))) {
		nonLocalShippableFlag = true;
	}


	var ltlLargeItemFeeRows = await TargetedCities.getLargeItemFee(req.query.destZip);
	if (ltlLargeItemFeeRows.length) {
		ltlLargeItemFee = ltlLargeItemFeeRows[0];
	}

	//	If GDE toggled on, do new logic to validate zip for LOCAL_ONLY skus
	if (configUtils.get("GDE_TOGGLE") === "ON") {
		resp.data.cart = [];


		var cart = await ProductHolds.getCheckoutCartEligibility(cityId, cartField, cartId);
		for (var i = 0; i < cart.length; i++) {
			var context = cart[i].context;
			if (context !== null) {
				context = JSON.parse(context);
			}
			var c = {
				shopifyVariantId: cart[i].shopifyVariantId,
				sku: cart[i].sku,
				eligibility: cart[i].eligibility,
				ltlLargeItemFee: cart[i].shipType === 'LTL' ? ltlLargeItemFee.largeItemFee : null,
				ltlLargeItemFeeShopifyRate: cart[i].shipType === 'LTL' ? ltlLargeItemFee.shopifyLargeItemFeeRate : null,
				// deliveryFlag: ((context !== null) && (context.deliveryFlag)) ? true : false,
				shippableZipFlag: false,
				shipCost:  0.00,
				edd:  moment()
			}

			var store = await Metros.checkPhysicalStoreByZip(req.query.destZip);
			if ((store.length > 0) && (store[0].hasPhysicalStoreFlag === 1) && (store[0].cityId === cityId)) {
				c.pickupZipFlag = true;
			}
			else {
				c.pickupZipFlag = false;
			}

			var local = await CarrierSelection.lookupCarrierZip(cart[i].sku, cityId, req.query.destZip, cart[i].shipType, cart[i].cityId);

			switch(cart[i].eligibility) {
				case 'SHIPPABLE':
				case null:
					c.shippableZipFlag = nonLocalShippableFlag;
					break;
				
				case 'LOCAL_ONLY':
					c.shippableZipFlag = (local.length > 0) ? true : false;
					break;

				case 'BOPIS_ONLY':
					c.shippableZipFlag = false;
					break;

				//	Shouldn't happen
				case 'NOT_ELIGIBLE':
					c.shippableZipFlag = false;
					break;
			}


			resp.data.cart.push(c);
		}
	}

	//	Old logic simply validating zip code is in a market area.
	else {
		resp.data.shippableZipFlag = false;
		resp.data.shipCost = 0.00;
		resp.data.edd = moment();

		var city = await ZipToCity.lookupCity(req.query.destZip);

		if ((city.length > 0) && ((city[0].city_id === 1) || (city[0].city_id === 2))) {
			resp.data.shippableZipFlag = true;
		}
	}

	return resp;
}




module.exports = {
	validateShippableZip
}