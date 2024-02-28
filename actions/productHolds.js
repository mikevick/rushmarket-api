'use strict';

const _ = require('lodash');
const moment = require('moment');
const {
	IncomingWebhook
} = require('@slack/webhook');

const sqlUtils = require('../utils/sqlUtils');

const MemberCheckouts = require('../models/memberCheckouts');
const Products = require('../models/products');
const ProductHolds = require('../models/productHolds');
const Stores = require('../models/stores');



var productCheckoutExtendMinutes = process.env.PRODUCT_HOLDS_CHECKOUT_MINUTES ? process.env.PRODUCT_HOLDS_CHECKOUT_MINUTES : 15;
var productHoldsMax = process.env.PRODUCT_HOLDS_MAX ? process.env.PRODUCT_HOLDS_MAX : 10;
var productHoldsMinutes = process.env.PRODUCT_HOLDS_MINUTES ? process.env.PRODUCT_HOLDS_MINUTES : 15;
var productMarketHoldsMinutes = process.env.PRODUCT_MARKET_HOLDS_MINUTES ? process.env.PRODUCT_MARKET_HOLDS_MINUTES : 1440;



//
//	Associate expiration bump.
//
var bumpExpiration = async (req, resp) => {
	var result = await ProductHolds.bumpExpiration(req.params.id, req.body.associateId, req.body.minutes);


	resp.data.heldUntil = moment().add(req.body.minutes, 'm').toDate();

	return resp;
};



//
//	For the moment we're assuming product holds are initiated from Shopify.   
//	6/16/2021 - Update for niche/outlet platform holds can now be initiated outside of shopify using a session id.
//	As of 5/18/2022 no longer making this assumption and phasing out use of the shopifyCustomerId
//
var executeBulkProductHold = async (req, resp) => {
	var activeHolds = 0;
	var heldIndex = -1;
	var sortBy = "date_created DESC";
	var whereInfo = {
		clause: "",
		values: []
	};

	if (req.body.sessionId !== undefined) {
		whereInfo = sqlUtils.appendWhere(whereInfo, "session_id = ?", req.body.sessionId);
	}
	else {
		whereInfo = sqlUtils.appendWhere(whereInfo, "member_id = ?", req.body.memberId);
	}
	whereInfo = sqlUtils.appendWhere(whereInfo, "store = ?", req.body.store);

	//	Retrieve all active holds for the member or session. Do they have room for another hold?
	var holds = await ProductHolds.getActiveByCustomerStore(whereInfo, sortBy);
	if (holds.length >= productHoldsMax) {
		resp.statusCode = 429;
		resp.message = "Maximum cart size reached.";
		delete resp.data;
		return resp;
	} else {
		activeHolds = holds.length;
	}


	//	Find out if the requested product has an active hold on it.
	var productHeld = undefined;
	var prom = [];
	var s = _.split(req.body.productId, ',')

	for (var i = 0; i < s.length; i++) {
		var holdObject = {
			statusCode: 201,
			productId: s[i],
			message: "Hold placed successfully.",
			heldUntil: undefined
		}

		if (activeHolds >= productHoldsMax) {
			holdObject.statusCode = 429;
			holdObject.message = "Member can't hold any more products.";
			resp.data.holds.push(holdObject);
			continue;
		}

		if ((req.body.quantity === undefined) && (req.body.quantity === null)) {
			req.body.quantity = 1;
		}
		productHeld = await ProductHolds.createMemberHold(s[i], req.body.quantity, req.body.store, req.body.city, productHoldsMinutes, req.body.context, req.body.sessionId, req.body.memberId);
		holdObject.productId = productHeld.heldProductId;


		// Already held by this member?
		if ((productHeld.held.selfHeldFlag) && (productHeld.quantityType !== 'LIMITED')) {
			holdObject.status = productHeld.held.rows[0].status;
			holdObject.heldUntil = productHeld.held.rows[0].expireTime;
			holdObject.message = "Product already in the cart.";

			resp.data.holds.push(holdObject);
		}

		else if ((productHeld.held.selfHeldFlag) && (productHeld.quantityType === 'LIMITED') && !productHeld.holdFlag) {
			holdObject.statusCode = 409;
			holdObject.heldUntil = productHeld.held.rows[0].expireTime;
			holdObject.message = "No quantity available.";

			resp.data.holds.push(holdObject);
		}
			//	Is the product held by someone else?
		else if (productHeld.held.heldFlag) {
			holdObject.statusCode = 409;
			holdObject.status = productHeld.held.rows[0].status;
			holdObject.heldUntil = productHeld.held.rows[0].expireTime;
			holdObject.message = "Product already held by another person.";

			resp.data.holds.push(holdObject);
		}

		//	If we get to this point we can hold the product.
		else {
			activeHolds++;
			holdObject.heldUntil = moment().add(productHoldsMinutes, 'm').toDate();
			holdObject.status = 'ACTIVE';
			holdObject.quantityAdded = productHeld.quantityAdded;

			resp.data.holds.push(holdObject);

			//	Lookup the rush sku to include in the slack notification.
			var rushProduct = await Products.getByShopifyVariantId(s[i]);
			if (rushProduct.length > 0) {
				var storeInfo = await Stores.getById(rushProduct[0].storeId);

				if ((storeInfo.length > 0) && (storeInfo[0].onlineHoldSlackUrl !== undefined) && (storeInfo[0].onlineHoldSlackUrl !== null)) {
					const slackUrl = storeInfo[0].onlineHoldSlackUrl;
					const slackWebhook = new IncomingWebhook(slackUrl);

					(async () => {
						try {
							await slackWebhook.send({
								text: "#" + rushProduct[0].sku + " placed on hold online"
							});
						} catch (e) {
							console.log("slack exception");
						}

					})();
				}
			}
		}
	}

	return resp;
};




//
//	For the moment we're assuming product holds are initiated from Shopify.
//
var executeProductHold = async (req, resp) => {

	var city = req.query.city ? req.query.city : req.query.store;
	var heldIndex = -1;
	var sortBy = "date_created DESC";
	var whereInfo = {
		clause: "",
		values: []
	};

	whereInfo = sqlUtils.appendWhere(whereInfo, "shopify_customer_id = ?", req.query.shopifyCustomerId);
	whereInfo = sqlUtils.appendWhere(whereInfo, "store = ?", req.query.store);

	//	Retrieve all active holds for the member at the store. Does member have room for another hold?
	var holds = await ProductHolds.getActiveByCustomerStore(whereInfo, sortBy);
	if (holds.length >= productHoldsMax) {
		resp.statusCode = 429;
		resp.message = "Member can't hold any more products.";
		delete resp.data;
		return resp;
	}


	//	Find out if the requested product has an active hold on it.
	var productHeld = await ProductHolds.createMemberHold(req.query.shopifyCustomerId, req.query.productId, req.query.store, city, productHoldsMinutes, req.query.context);

	//	See if the requested product is already held by this member.  If so, return the expiration time.
	if (productHeld.heldProduct.selfHeldFlag) {
		resp.data.heldUntil = productHeld.rows[0].expireTime;
		resp.data.status = productHeld.rows[0].status;
		resp.message = "Product already held by member.";

		return resp;
	}

	//	Is the product held by someone else?
	if ((productHeld.rows !== null) && (productHeld.rows.length > 0)) {
		resp.statusCode = 409;
		resp.data.heldUntil = productHeld.rows[0].expireTime;
		resp.data.status = productHeld.rows[0].status;
		resp.message = "Product held by another member.";
		return resp;
	}


	//	If we get to this point we can hold the product.
	// await ProductHolds.createHold(req.query.memberId, req.query.productId, req.query.store, productHoldsMinutes);
	resp.data.heldUntil = moment().add(productHoldsMinutes, 'm').toDate();
	resp.data.status = 'ACTIVE';


	//	Lookup the rush sku to include in the slack notification.
	var rushProduct = await Products.getByShopifyVariantId(req.query.productId);
	if (rushProduct.length > 0) {
		var storeInfo = await Stores.getById(rushProduct[0].storeId);

		if ((storeInfo.length > 0) && (storeInfo[0].onlineHoldSlackUrl !== undefined) && (storeInfo[0].onlineHoldSlackUrl !== null)) {
			const slackUrl = storeInfo[0].onlineHoldSlackUrl;
			const slackWebhook = new IncomingWebhook(slackUrl);

			(async () => {
				try {
					await slackWebhook.send({
						text: "#" + rushProduct[0].sku + " placed on hold online"
					});
				} catch (e) {
					console.log("slack exception");
				}

			})();
		}
	}

	return resp;
};



//
//	Logic for market holds initiated by an associate.
//
var executeProductMarketHold = async (req, resp) => {
	var heldIndex = -1;

	//	Find out if the requested product has an active hold on it.
	var productHeld = await ProductHolds.createMarketHold(req.query.associateId, req.query.productId, req.query.store, req.query.city, productMarketHoldsMinutes);

	//	See if the requested product is already held by this member.  If so, return the expiration time.
	if ((productHeld !== undefined) && (productHeld.length > 0) && (productHeld[0].associateId === req.query.associateId)) {
		resp.data.heldUntil = productHeld[0].expireTime;
		resp.data.status = productHeld[0].status;
		resp.message = "Product already held by associate.";

		return resp;
	}

	//	Is the product held by someone else?
	if ((productHeld !== undefined) && (productHeld.length > 0)) {
		resp.statusCode = 409;
		resp.data.heldUntil = productHeld[0].expireTime;
		resp.data.status = productHeld[0].status;
		resp.message = "Product held by another member/associate.";
		return resp;
	}


	//	If we get to this point we can hold the product.
	// await ProductHolds.createHold(req.query.memberId, req.query.productId, req.query.store, productHoldsMinutes);
	resp.data.heldUntil = moment().add(productHoldsMinutes, 'm').toDate();
	resp.data.status = 'ACTIVE';

	return resp;
};



var checkBulkProductHold = async (whereInfo, sortBy, req, resp) => {
	var prom = [];
	var s = _.split(req.query.productIdList, ',')

	for (var i = 0; i < s.length; i++) {
		var wInfo = _.cloneDeep(whereInfo);

		//	Find out if the requested product has an active hold on it.
		wInfo = sqlUtils.appendWhere(wInfo, "product_id = ?", s[i]);

		prom.push(ProductHolds.getActiveByProductStore(wInfo, sortBy, s[i], req.query.store));
	}


	var productHeld = await Promise.all(prom);

	if (productHeld.length > 0) {
		resp.data.productHolds = [];
	}


	for (var i = 0; i < s.length; i++) {
		var holdObject = {
			statusCode: 404,
			productId: s[i],
			message: "Product not held.",
			status: null,
			heldUntil: null,
			quantity: 0
		}

		//	If member wasn't passed we're checking to see if anyone holds it.
		for (var j=0; j < productHeld[i].length; j++) {
			holdObject.heldUntil = productHeld[i][0].expireTime;
			holdObject.statusCode = 200;
			holdObject.status = productHeld[i][0].status;
			holdObject.message = "Product already held.";
			holdObject.quantity += productHeld[i][j].quantity;
		}

		resp.data.productHolds.push(holdObject);
	}

	return resp;
};



var checkProductHold = async (whereInfo, sortBy, req, resp) => {
	//	Find out if the requested product has an active hold on it.
	var productHeld = await ProductHolds.getActiveByProductStore(whereInfo, sortBy, req.query.productId, req.query.store);


	if ((req.query.memberId === undefined) && (req.query.shopifyCustomerId === undefined)) {
		//	If member wasn't passed we're checking to see if anyone holds it.
		if (productHeld.length > 0) {
			if (req.query.productId !== undefined) {
				resp.data.heldUntil = productHeld[0].expireTime;
				resp.data.status = productHeld[0].status;
				resp.message = "Product already held.";
			} else {
				resp.data.productHolds = [];
				for (var i = 0; i < productHeld.length; i++) {
					resp.data.productHolds.push({
						id: productHeld[i].id,
						dateCreated: productHeld[i].dateCreated,
						city: productHeld[i].city,
						productId: productHeld[i].productId,
						productName: productHeld[i].name,
						heldUntil: productHeld[i].expireTime,
						status: productHeld[i].status,
						holderName: productHeld[i].holderName,
						marketHoldFlag: productHeld[i].marketHoldFlag,
						context: productHeld[i].context
					});
					resp.message = "Active holds found.";

				}
			}
		} else {
			resp.statusCode = 404;
			resp.message = (req.query.productId !== undefined) ? "Product not held." : "No products held.";
			delete resp.data;
		}
	} else {
		//	See if the requested product is already held by this member.  If so, return the expiration time.
		if ((productHeld.length > 0) && ((productHeld[0].shopifyCustomerId === req.query.shopifyCustomerId) || (productHeld[0].memberId === req.query.memberId))) {
			resp.data.heldUntil = productHeld[0].expireTime;
			resp.data.status = productHeld[0].status;
			resp.message = "Product already held by member.";
		} else {
			resp.statusCode = 404;
			resp.message = "Member does not have a hold on product."
			delete resp.data;
		}

	}

	return resp;
};



var getAssociateHolds = async (whereInfo, sortBy, req, resp) => {
	//	Retrieve all active holds for the member.
	var holds = await ProductHolds.getActiveByAssociateStore(whereInfo, sortBy);

	resp.data.productHolds = [];
	if (holds.length > 0) {
		resp.message = "Associate has product holds.";
		for (var i = 0; i < holds.length; i++) {
			resp.data.productHolds.push({
				id: holds[i].id,
				city: holds[i].city,
				productId: holds[i].productId,
				heldUntil: holds[i].expireTime,
				status: holds[i].status,
				context: holds[i].context
			});
		}
	} else {
		resp.statusCode = 404;
		resp.message = "Associate has no product holds.";
	}

	return resp;
};



var getCustomerHolds = async (whereInfo, sortBy, req, resp) => {
	//	Retrieve all active holds for the member.
	var holds = await ProductHolds.getActiveByCustomerStore(whereInfo, sortBy);

	resp.data.productHolds = [];
	if (holds.length > 0) {
		resp.message = "Member has product holds.";
		for (var i = 0; i < holds.length; i++) {
			resp.data.productHolds.push({
				id: holds[i].id,
				city: holds[i].city,
				productId: holds[i].productId,
				heldUntil: holds[i].expireTime,
				status: holds[i].status,
				context: holds[i].context
			});
		}
	} else {
		resp.statusCode = 404;
		resp.message = "Member has no product holds.";
	}

	return resp;
};



var getMemberHolds = async (whereInfo, sortBy, req, resp) => {
	//	Retrieve all active holds for the member.
	var holds = await ProductHolds.getActiveByMemberStore(whereInfo, sortBy);

	resp.data.productHolds = [];
	if (holds.length > 0) {
		resp.message = "Member has product holds.";
		for (var i = 0; i < holds.length; i++) {
			resp.data.productHolds.push({
				id: holds[i].id,
				city: holds[i].city,
				productId: holds[i].productId,
				heldUntil: holds[i].expireTime,
				status: holds[i].status,
				context: holds[i].context
			});
		}
	} else {
		resp.statusCode = 404;
		resp.message = "Member has no product holds.";
	}

	return resp;
};



//
//	For now we're assuming this only happens from Shopify.
//
var executeEnterCheckout = async (req, resp) => {
	var sortBy = "date_created DESC";
	var whereInfo = {
		clause: "",
		values: []
	};
	var productId = req.query.productId ? req.query.productId : req.body.productId;
	var sessionId = req.query.sessionId ? req.query.sessionId : req.body.sessionId ? req.body.sessionId : undefined;
	var memberId = req.query.memberId ? req.query.memberId : req.body.memberId ? req.body.memberId : undefined;
	var store = req.query.store ? req.query.store : req.body.store;

	whereInfo = sqlUtils.appendWhere(whereInfo, "product_id = ?", productId);
	whereInfo = sqlUtils.appendWhere(whereInfo, "store = ?", store);


	//	Find out if the requested product has an active hold on it.
	var productHeld = null;
	if (sessionId !== undefined) {
		productHeld = await ProductHolds.getActiveBySessionProductStore(sessionId, productId, store);
	}
	else {
		productHeld = await ProductHolds.getActiveByMemberProductStore(memberId, productId, store);
	}

	//	See if the requested product is already held by this member.  If so, return the expiration time.
	if ((productHeld.length > 0) && ((productHeld[0].sessionId === sessionId) || (productHeld[0].memberId === memberId))) {

		//	Extend hold if it's actively held by this member and mark as in checkout.
		var result = null;
		if (sessionId !== undefined) {
			result = await ProductHolds.enterCheckoutBySessionId(sessionId, productId, store, productCheckoutExtendMinutes);
		}
		else if (memberId !== undefined) {
			result = await ProductHolds.enterCheckoutByMemberId(memberId, productId, store, productCheckoutExtendMinutes);
		}


		if (result.affectedRows === 1) {
			resp.message = "Product hold extended successfully.";
		} else {
			resp.statusCode = 404;
			resp.message = "Member does not have a hold on product.";
		}
		resp.data.heldUntil = moment().add(productCheckoutExtendMinutes, 'm').toDate();
		resp.data.status = 'INCHECKOUT';
		resp.message = "Product entered checkout successfully.";
	} else {
		resp.statusCode = 404;
		resp.message = "Member does not have a hold on product."
		delete resp.data;
	}

	return resp;
};



//
//	For now we're assuming this only happens from Shopify.
//
var executePurchase = async (req, resp) => {
	var sortBy = "date_created DESC";
	var whereInfo = {
		clause: "",
		values: []
	};

	var productId = req.query.productId ? req.query.productId : req.body.productId;
	var memberId = req.query.memberId ? req.query.memberId : req.body.memberId;
	var sessionId = req.query.sessionId ? req.query.sessionId : req.body.sessionId;
	var store = req.query.store ? req.query.store : req.body.store;


	whereInfo = sqlUtils.appendWhere(whereInfo, "product_id = ?", productId);
	whereInfo = sqlUtils.appendWhere(whereInfo, "store = ?", store);


	//	Find out if the requested product has an active hold on it.
	var productHeld = null;
	if (sessionId !== undefined) {
		productHeld = await ProductHolds.getActiveBySessionProductStore(sessionId, productId, store);
	}
	else {
		productHeld = await ProductHolds.getActiveByMemberProductStore(memberId, productId, store);
	}


	//	See if the requested product is already held by this member.  If so, return the expiration time.
	if ((productHeld.length > 0) && ((productHeld[0].sessionId === sessionId) || (productHeld[0].memberId === memberId))) {

		//	If we can get to the checkoutId, grab it and mark the checkout as inactive.
		if (productHeld[0].context !== null) {
			try {
				var j = JSON.parse(productHeld[0].context);

				if ((j.checkoutId !== undefined) && (j.checkoutId !== null)) {
					await MemberCheckouts.markInactive(j.checkoutId);
				}
			} catch (e) {
				console.log(e);
			}
		}

		//	Mark purchased.
		var result = null;
		if (sessionId !== undefined) {
			result = await ProductHolds.purchaseBySessionId(sessionId, productId, store);
		}
		else if (memberId !== undefined) {
			result = await ProductHolds.purchaseByMemberId(memberId, productId, store);
		}

		if (result.affectedRows === 1) {
			resp.message = "Product purchased successfully.";
		} else {
			resp.statusCode = 404;
			resp.message = "Member does not have a hold on product.";
		}
	} else {
		resp.statusCode = 404;
		resp.message = "Member does not have a hold on product."
		delete resp.data;
	}

	return resp;
};



var releaseProductHold = async (req, resp) => {
	//	Release the hold if it's actively held by this member.
	var result = undefined;

	//	Deprecated
	// if (req.query.shopifyCustomerId !== undefined) {
	// 	result = await ProductHolds.releaseActiveHoldByCustomerProductStore(req.query.shopifyCustomerId, req.query.productId, req.query.store);
	// } else if (req.body.shopifyCustomerId !== undefined) {
	// 	var s = _.split(req.body.productId, ',');
	// 	for (var i=0; i < s.length; i++) {
	// 		result = await ProductHolds.releaseActiveHoldByCustomerProductStore(req.body.shopifyCustomerId, s[i], req.body.store);
	// 	}

	// } else 

	if (req.body.memberId !== undefined) {
		for (var i=0; i < req.body.products.length; i++) {
			result = await ProductHolds.releaseActiveHoldByMemberProductStore(req.body.memberId, req.body.products[i].productId, req.body.products[i].quantity, req.body.store);
		}
	} else  if (req.body.sessionId !== undefined) {
		for (var i=0; i < req.body.products.length; i++) {
			result = await ProductHolds.releaseActiveHoldBySessionProductStore(req.body.sessionId, req.body.products[i].productId, req.body.products[i].quantity, req.body.store);
		}
	}


	if (result) {
		if (result.affectedRows === 1) {
			resp.message = "Hold released successfully.";
		} else {
			resp.statusCode = 404;
			resp.message = "No hold to release.";
		}
	}

	return resp;
};




var releaseProductHoldById = async (req, resp) => {
	//	Release the hold if it's actively held by this member.
	var result = await ProductHolds.releaseActiveHoldById(req.params.id);

	if (result) {
		if (result.affectedRows === 1) {
			resp.message = "Hold released successfully.";
		} else {
			resp.statusCode = 404;
			resp.message = "No hold to release.";
		}
	}

	return resp;
};



var releaseProductMarketHolds = async (req, resp) => {
	//	Release market holds for specified store.
	var result = undefined;
	result = await ProductHolds.releaseActiveHoldByStore(req.query.store);

	if (result) {
		if (result.affectedRows >= 1) {
			resp.message = "Market holds released successfully.";
		} else {
			resp.statusCode = 404;
			resp.message = "No market holds to release.";
		}
	}

	return resp;
};



var updateProductHoldById = async (req, resp) => {
	var context = req.query.context ? req.query.context : req.body.context;
	var quantity = req.query.quantity ? req.query.quantity : req.body.quantity;
	var result = undefined;

	result = await ProductHolds.updateHold(req.params.id, context, quantity);

	if (result) {
		if (result.affectedRows >= 1) {
			resp.message = "Market hold updated successfully.";
		} else {
			resp.statusCode = 404;
			resp.message = "No market hold found.";
		}
	}

	return resp;
};


var updateProductHolds = async (req, resp) => {
	var context = req.body.context;
	var result = undefined;

	
	if (req.body.memberId !== undefined) {
		var s = _.split(req.body.productId, ',');
		for (var i=0; i < s.length; i++) {
			result = await ProductHolds.updateMemberHoldByProductId(req.body.memberId, s[i], context);
		}


	} else if (req.body.sessionId !== undefined) {
		var s = _.split(req.body.productId, ',');
		for (var i=0; i < s.length; i++) {
			result = await ProductHolds.updateSessionHoldByProductId(req.body.sessionId, s[i], context);
		}
	}


	if (result) {
		if (result.affectedRows === 1) {
			resp.message = "Hold updated successfully.";
		} else {
			resp.statusCode = 404;
			resp.message = "No hold updated.";
		}
	}

	return resp;
};




module.exports = {
	bumpExpiration,
	checkBulkProductHold,
	checkProductHold,
	executeBulkProductHold,
	executeEnterCheckout,
	executeProductHold,
	executeProductMarketHold,
	executePurchase,
	getAssociateHolds,
	getCustomerHolds,
	getMemberHolds,
	releaseProductHold,
	releaseProductHoldById,
	releaseProductMarketHolds,
	updateProductHoldById,
	updateProductHolds
}