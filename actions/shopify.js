'use strict';

const memberActions = require('../actions/members');
const rushProductsActions = require('../actions/rushProducts');

const MemberCheckouts = require('../models/memberCheckouts');
const Members = require('../models/members');
const ProductHolds = require('../models/productHolds');
const RushOrders = require('../models/rushOrders');
const RushProducts = require('../models/rushProducts');
const Shopifys = require('../models/shopify');

const comms = require('../utils/comms');
const {
	extractTags,
	getCityInfoByShop
} = require('../utils/shopifyUtils');


//
//	General handler for shopify webhooks.  Will log it and perform logic if required for specific topics.
//
var shopifyWebhook = (req, resp) => {
	return new Promise((resolve, reject) => {
		var cityInfo = getCityInfoByShop(req.headers['x-shopify-shop-domain']);
		var prom = [];

		// console.log("Shopify Webook");
		// console.log(JSON.stringify(req.body, undefined, 2));
		// console.log(req.get('x-webhook-verified'));


		//
		//	Customer create - add to our member database and mailchimp.
		//
		if (req.headers['x-shopify-topic'] === 'customers/create') {
			prom.push(Shopifys.log(req));
			if ((cityInfo !== undefined) && (cityInfo !== null)) {
				prom.push(addCustomerFromNotification(cityInfo, req));
			}
		}

		if (req.headers['x-shopify-topic'] === 'customers/update') {
			prom.push(Shopifys.log(req));
			if ((cityInfo !== undefined) && (cityInfo !== null)) {
				prom.push(updateCustomerFromNotification(cityInfo, req));
			}
		}

		if (req.headers['x-shopify-topic'] === 'customers/delete') {
			// prom.push(logUtils.log({
			// 	severity: 'ERROR',
			// 	type: 'MEMBERDELETE',
			// 	message: "Shopify member deleted: " + JSON.stringify(req.body)
			// }));
		}

		if (req.headers['x-shopify-topic'] === 'fulfillments/create') {
			// prom.push(Shopifys.logFulfillment(req));
			if ((cityInfo !== undefined) && (cityInfo !== null)) {
				prom.push(markFulfillmentFromNotification(req));
			}
		}

		if (req.headers['x-shopify-topic'] === 'orders/create') {
			prom.push(Shopifys.logOrder(req));
			if ((cityInfo !== undefined) && (cityInfo !== null)) {
				prom.push(markPurchasesAndRefundsFromNotification(req));
				prom.push(RushOrders.markOrderForCapture(req.body.id));
			}
		}

		if (req.headers['x-shopify-topic'] === 'orders/updated') {
			prom.push(Shopifys.logOrder(req));
			if ((cityInfo !== undefined) && (cityInfo !== null)) {
				prom.push(markPurchasesAndRefundsFromNotification(req));
			}
		}

		Promise.all(prom)
			.then((results) => {
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


//
//  Logic to add customer from webhook notification.
//
var addCustomerFromNotification = (cityInfo, req) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200
			};

			//
			//	Extract zip.
			//
			var tags = extractTags(req);


			req.body.zip = tags.zip;
			req.body.verifiedMemberFlag = tags.verifiedMemberFlag;
			req.body.firstName = req.body.first_name;
			req.body.lastName = req.body.last_name;
			if (req.body.email === null) {
				req.body.email = '';
			}

			console.log(JSON.stringify(tags, undefined, 2));
			//
			//	Call to signup
			//
			//	If this customer is from open box platform, skip signup
			if (tags.openBoxPlatform) {
				resolve();
			} else if (tags.facebookFlag) {
				resolve();
			} else {
				memberActions.signup(req, resp, req.get('x-shopify-shop-domain'))
					.then((results) => {
						resolve(results);
					})
					.catch((e) => {
						reject(e);
					})
			}

		} catch (e) {
			reject(e);
		}
	});
};


//
//  Logic to mark fulfilled line items as fulfilled.
//
var markFulfillmentFromNotification = async (req) => {
	var prom = [];
	var resp = {
		statusCode: 200
	};

	// comms.sendEmail('matt@rushmarket.com', 'Fulfillment Webhook', JSON.stringify(req.body.line_items, undefined, 2), JSON.stringify(req.body.line_items, undefined, 2));

	if (req.body.line_items !== undefined) {
		for (var i = 0; i < req.body.line_items.length; i++) {
			// console.log("Fulfilled Variant: " + req.body.line_items[i].variant_id);
			prom.push(RushOrders.markLineItemFulfilled(req.body.line_items[i].id));
		}

		await Promise.all(prom);
	}
}



//
//  Logic to mark previously held products as purchased
//
var markPurchasesAndRefundsFromNotification = async (req) => {
	var prom = [];
	var resp = {
		statusCode: 200
	};

	if (req.body.customer !== undefined) {
		// console.log("Customer: " + req.body.customer.id);
		for (var i = 0; i < req.body.line_items.length; i++) {
			// console.log("Purchased Variant: " + req.body.line_items[i].variant_id);
			if (req.body.line_items[i].variant_id !== null) {
				prom.push(ProductHolds.purchase(req.body.customer.id, req.body.line_items[i].variant_id));
				prom.push(MemberCheckouts.markInactiveByVariant(req.body.customer.id, req.body.line_items[i].variant_id));
				prom.push(RushProducts.invalidateCoinInCacheByVariant(req.body.line_items[i].variant_id));
				prom.push(rushProductsActions.limitedQuantityDSPurchase(req.body.line_items[i].variant_id, req.body.line_items[i].quantity));
			}
		}

		await Promise.all(prom);

		for (var i = 0; i < req.body.refunds.length; i++) {
			for (var j = 0; j < req.body.refunds[i].refund_line_items.length; j++) {
				// console.log("Refunded Variant: " + req.body.refunds[i].refund_line_items[j].line_item.variant_id);
				prom.push(ProductHolds.refund(req.body.customer.id, req.body.refunds[i].refund_line_items[j].line_item.variant_id));
			}
		}

		await Promise.all(prom);
	}
}


//
//  Logic to update customer from webhook notification.
//
var updateCustomerFromNotification = (cityInfo, req) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200
			};

			//
			//	Extract zip.
			//
			var tags = extractTags(req);

			//	If this customer is from open box platform, skip update
			if (tags.openBoxPlatform) {
				resolve();
			} else {
				req.body.zip = tags.zip;
				req.body.verifiedMemberFlag = tags.verifiedMemberFlag;
				req.body.firstName = req.body.first_name;
				req.body.lastName = req.body.last_name;
				if (req.body.email === null) {
					req.body.email = '';
				}


				Members.getByShopifyCustomerId(cityInfo, req.body.id)
					.then((rows) => {
						if (rows.length === 0) {

							//	If we've received an update notification but we can't lookup member by shopify customer id for that store, assume the update
							//	arrived just ahead of the create and do nothing.   
							// return Members.linkMemberToShopifyStoreByEmail(req.body.email, req.get('x-shopify-shop-domain'), req.body.id);
							return false;
						} else {
							rows[0];
							req.body.shopifyCustomerId = req.body.id;
							req.params.id = rows[0].id;
							return true;
						}
					})
					.then((doUpdate) => {

						//
						//	Call to update
						//
						if (doUpdate) {
							return memberActions.update(true, req, resp, req.get('x-shopify-shop-domain'));
						} else {

						}
					})
					.then((results) => {
						resolve(results);
					})
					.catch((e) => {
						reject(e);
					})
			}
		} catch (e) {
			reject(e);
		}
	});
};



var verifyShopifyHook = (req) => {
	var buf = '';
	var digest = null;

	//
	//	If the notification looks like it didn't come from shopify, ignore.  
	//	TODO Try to get signature verification to work.
	//
	if (req.headers['x-shopify-shop-domain'] === undefined) {
		comms.sendEmail('matt@rushmarket.com', 'Unknown Webhook Source', 'Customer creation webhook received not from shopify.', 'Customer creation webhook received not from shopify.');
		return false;
	} else {
		return true;
	}
}


module.exports = {
	shopifyWebhook
};