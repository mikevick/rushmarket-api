'use strict'


const _ = require('lodash');

const rushActions = require('../actions/rushProducts');
const holdsActions = require('../actions/productHolds');

const Members = require('../models/members');
const ProductHolds = require('../models/productHolds');
const Promotions = require('../models/promotions');

const configUtils = require('../utils/configUtils');
const logUtils = require('../utils/logUtils');
const sqlUtils = require('../utils/sqlUtils');

const {
	formatResp
} = require('../utils/response');



//
//	Enter cart contents into checkout.
//
var enterCartCheckout = async (req, resp) => {
	var prom = []
	var tempReq = {
		body: {

		},
		query: {

		}
	};


	//	Get the cart items in checkout for this member/session.
	var cart = null;
	if (req.decoded.sessionId !== undefined) {
		cart = await ProductHolds.getInCartBySession(req.decoded.sessionId);
	} else if (req.decoded.memberId !== undefined) {
		cart = await ProductHolds.getInCartByMember(req.decoded.memberId);
	}

	//	Loop thru cart contents collecting active promo ids and an array of shopify variants.
	for (var i = 0; i < cart.length; i++) {
		tempReq.query.store = cart[i].store;
		tempReq.query.productId = cart[i].productId;
		if (req.decoded.sessionId !== undefined) {
			tempReq.query.sessionId = req.decoded.sessionId;
		} else if (req.decoded.memberId !== undefined) {
			tempReq.query.memberId = req.decoded.memberId;
		}

		var tempResp = {
			statusCode: 200,
			data: {},
			message: "Product entered checkout successfully."
		}

		prom.push(holdsActions.executeEnterCheckout(tempReq, tempResp));
	}

	var results = await Promise.all(prom);

	resp.data.holds = [];
	for (var i = 0; i < results.length; i++) {
		results[i].productId = cart[i].productId;
		if (results[i].data.status === 'INCHECKOUT') {
			results[i].message = "Product entered checkout successfully.";
		}
		resp.data.holds.push(results[i]);
	}

	return resp;
}



//
//	GET all promotions
//
var processCart = async (req, sessionId, memberId, resp) => {
	var coinWhereInfo = {
		clause: '',
		values: []
	}
	var context = {
		coins: [],
		placeholders: '',
		promoIds: [],
		variants: []
	}
	var rushProdResp = {
		statusCode: 200,
		message: 'Success.',
		data: {
			rushProducts: []
		}
	};
	var sortBy = 'name ASC';
	var whereInfo = {
		join: '',
		clause: '',
		values: []
	};


	var lastTime = logUtils.showTimeDiff('Start', lastTime);

	//	Retrieve the member and the shopify customer id.
	if (memberId !== undefined) {
		var member = await Members.getById(memberId);
		if (member.length !== 1) {
			formatResp(resp, undefined, 404, 'Member not found.');
			return resp;
		}
		member = member[0];
		var customerId = await Members.getHomeShopifyCustomerId(member);
		if (customerId === null) {
			formatResp(resp, undefined, 404, 'Customer not found.');
			return resp;
		}
		req.query.customerId = customerId;
	}


	lastTime = logUtils.showTimeDiff('Before get cart', lastTime);

	//	Get the cart items in checkout for this member/session.
	var cart = null;
	if (sessionId !== undefined) {
		cart = await ProductHolds.getInCartBySession(sessionId);
	} else {
		cart = await ProductHolds.getInCartByMember(memberId);
	}

	lastTime = logUtils.showTimeDiff('After get cart', lastTime);

	//	Loop thru cart contents collecting active promo ids and an array of shopify variants.
	findPromosAndVariants(cart, context);

	lastTime = logUtils.showTimeDiff('After loop', lastTime);

	//	Retrieve the /rushProducts representing the cart contents.
	if (context.variants.length > 0) {
		whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_variant_id IN (' + context.placeholders + ')', context.variants);

		req.query.onlyEligibleFlag = true;
		if (configUtils.get("OLD_CART") === "ON") {
			rushProdResp = await rushActions.getAll(req, whereInfo, coinWhereInfo, sortBy, undefined, undefined, rushProdResp);
		} else {
			await assembleCart(req, context, rushProdResp);
		}


		if (rushProdResp.statusCode !== 200) {
			resp.statusCode = rushProdResp.statusCode;
			resp.message = rushProdResp.message;
			resp.data.cartItems = [];
		} else {
			resp.data.cartExpire = cart[0].cartExpire;
			resp.data.cartItems = rushProdResp.data.rushProducts;
			await applyPromotions(resp, context.promoIds);
		}

	} else {
		resp.data.cartItems = [];
	}

	lastTime = logUtils.showTimeDiff('after getAll', lastTime);

	setQuantityAndPruneFields(cart, resp);

	lastTime = logUtils.showTimeDiff('After loop', lastTime);


	return resp;
}


var setQuantityAndPruneFields = (cart, resp) => {
	for (var i = 0; i < resp.data.cartItems.length; i++) {
		delete resp.data.cartItems[i].noIndexFlag;
		delete resp.data.cartItems[i].weight;
		delete resp.data.cartItems[i].freshnessScore;
		delete resp.data.cartItems[i].productDescription;
		delete resp.data.cartItems[i].dimensions;
		delete resp.data.cartItems[i].size;
		delete resp.data.cartItems[i].sizeLabel;
		delete resp.data.cartItems[i].primaryMaterial;
		delete resp.data.cartItems[i].secondaryMaterial;
		delete resp.data.cartItems[i].primaryColor;
		delete resp.data.cartItems[i].bulletPoints;
		delete resp.data.cartItems[i].assemblyInstructions;

		for (var j = 0; j < resp.data.cartItems[i].variantGroups.length; j++) {
			delete resp.data.cartItems[i].variantGroups[j].assemblyMessage;
			delete resp.data.cartItems[i].variantGroups[j].marketInfo;
			delete resp.data.cartItems[i].variantGroups[j].localCourierAvailable;
			delete resp.data.cartItems[i].variantGroups[j].sizeLabel;
			delete resp.data.cartItems[i].variantGroups[j].size;
			delete resp.data.cartItems[i].variantGroups[j].ripple;
			delete resp.data.cartItems[i].variantGroups[j].nationalShipCost;
			delete resp.data.cartItems[i].variantGroups[j].localShipCost;
			delete resp.data.cartItems[i].variantGroups[j].availabilityConditionBullets;
			delete resp.data.cartItems[i].variantGroups[j].largeItemBullets;

			resp.data.cartItems[i].variantGroups[j].quantity = 0;

			for (var k = 0; k < resp.data.cartItems[i].variantGroups[j].variants.length; k++) {
				delete resp.data.cartItems[i].variantGroups[j].variants[k].marketPrice;
				delete resp.data.cartItems[i].variantGroups[j].variants[k].marketPrice;

				var hold = _.find(cart, function (c) {
					if ((resp.data.cartItems[i].variantGroups.length === 0) || (resp.data.cartItems[i].variantGroups[j].variants.length === 0)) {
						return false;
					}
					return (c.productId === resp.data.cartItems[i].variantGroups[j].variants[k].shopifyVariantId.toString());
				})

				if (hold !== undefined) {
					resp.data.cartItems[i].variantGroups[j].quantity += hold.quantity;
					resp.data.cartItems[i].variantGroups[j].variants[k].hold = {
						id: hold.holdId,
						context: hold.context,
						productId: hold.productId,
						quantity: hold.quantity
					}
				}
			}
		}
	}
}



var assembleCart = async (req, context, rushProdResp) => {
	var tempResp = {
		statusCode: 200,
		message: 'Success.',
		data: {
			rushProducts: []
		}
	};

	for (var j = 0; j < context.coins.length; j++) {
		var r = {
			params: {
				id: context.coins[j].coinId
			},
			query: {
				onlyEligibleFlag: true,
				variantFilters: context.coins[j].shopifyVariantIds.toString(),
				zip: req.query.zip
			}
		}
		tempResp = await rushActions.getByCoin(r, tempResp);
		if ((tempResp !== null) && (tempResp.statusCode === 200)) {
			rushProdResp.data.rushProducts.push(tempResp.data.rushProducts);
		}
	}
}


//	Loop thru cart contents collecting active promo ids and an array of shopify variants.
var findPromosAndVariants = (cart, context) => {
	for (var i = 0; i < cart.length; i++) {
		if (context.placeholders.length > 0) {
			context.placeholders += ', ';
		}
		context.placeholders += '?';

		//	Build simple array of shopify variants for "old" way.
		context.variants.push(cart[i].shopifyVariantId);



		//	Group variants in the cart by COIN
		var index = _.findIndex(context.coins, function (v) {
			return v.coinId === cart[i].coinId;
		})

		if ((cart[i].coinId === null) || (index === -1)) {
			var v = {
				coinId: null,
				shopifyVariantIds: []
			}

			if ((cart[i].coinId === null) || (cart[i].onlineQuickSale === 'Y')) {
				v.coinId = cart[i].sku;
			} else {
				v.coinId = cart[i].coinId;
			}
			v.shopifyVariantIds.push(cart[i].shopifyVariantId);
			context.coins.push(v);
		} else {
			context.coins[index].shopifyVariantIds.push(cart[i].shopifyVariantId);
		}


		//	Collect quantity of distinct promo IDs
		if (cart[i].promoId !== null) {
			var idx = _.findIndex(context.promoIds, function (p) {
				return p.promoId === cart[i].promoId
			});
			if (idx > -1) {
				context.promoIds[idx].quantity++;
			} else {
				context.promoIds.push({
					promoId: cart[i].promoId,
					quantity: 1
				});
			}
		}
	}
}



//
//	GET all promotions
//
var processCartOrig = async (req, sessionId, memberId, resp) => {
	var coinWhereInfo = {
		clause: '',
		values: []
	}
	var placeholders = '';
	var promoIds = [];
	var rushProdResp = {
		statusCode: 200,
		message: 'Success.',
		data: {
			rushProducts: []
		}
	};
	var sortBy = 'name ASC';
	var variants = [];
	var whereInfo = {
		join: '',
		clause: '',
		values: []
	};


	var lastTime = logUtils.showTimeDiff('Start', lastTime);

	//	Retrieve the member and the shopify customer id.
	if (memberId !== undefined) {
		var member = await Members.getById(memberId);
		if (member.length !== 1) {
			formatResp(resp, undefined, 404, 'Member not found.');
			return resp;
		}
		member = member[0];
		var customerId = await Members.getHomeShopifyCustomerId(member);
		if (customerId === null) {
			formatResp(resp, undefined, 404, 'Customer not found.');
			return resp;
		}
		req.query.customerId = customerId;
	}


	lastTime = logUtils.showTimeDiff('Before get cart', lastTime);

	//	Get the cart items in checkout for this member/session.
	var cart = null;
	if (sessionId !== undefined) {
		cart = await ProductHolds.getInCartBySession(sessionId);
	} else {
		cart = await ProductHolds.getInCartByMember(memberId);
	}

	lastTime = logUtils.showTimeDiff('After get cart', lastTime);

	//	Loop thru cart contents collecting active promo ids and an array of shopify variants.
	for (var i = 0; i < cart.length; i++) {
		if (placeholders.length > 0) {
			placeholders += ', ';
		}
		placeholders += '?';

		variants.push(cart[i].shopifyVariantId);

		if (cart[i].promoId !== null) {
			var idx = _.findIndex(promoIds, function (p) {
				return p.promoId === cart[i].promoId
			});
			if (idx > -1) {
				promoIds[idx].quantity++;
			} else {
				promoIds.push({
					promoId: cart[i].promoId,
					quantity: 1
				});
			}
		}
	}

	lastTime = logUtils.showTimeDiff('After loop', lastTime);

	//	Retrieve the /rushProducts representing the cart contents.
	if (variants.length > 0) {
		whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_variant_id IN (' + placeholders + ')', variants);

		req.query.onlyEligibleFlag = true;
		rushProdResp = await rushActions.getAll(req, whereInfo, coinWhereInfo, sortBy, undefined, undefined, rushProdResp);

		if (rushProdResp.statusCode !== 200) {
			resp.statusCode = rushProdResp.statusCode;
			resp.message = rushProdResp.message;
			resp.data.cartItems = [];
		} else {
			resp.data.cartExpire = cart[0].cartExpire;
			resp.data.cartItems = rushProdResp.data.rushProducts;
			await applyPromotions(resp, promoIds);
		}

	} else {
		resp.data.cartItems = [];
	}

	lastTime = logUtils.showTimeDiff('after getAll', lastTime);

	for (var i = 0; i < resp.data.cartItems.length; i++) {
		var hold = _.find(cart, function (c) {
			if ((resp.data.cartItems[i].variantGroups.length === 0) || (resp.data.cartItems[i].variantGroups[0].variants.length === 0)) {
				return false;
			}
			return (c.productId === resp.data.cartItems[i].variantGroups[0].variants[0].shopifyVariantId.toString());
		})

		if (hold !== undefined) {
			resp.data.cartItems[i].variantGroups[0].quantity = hold.quantity;
			resp.data.cartItems[i].variantGroups[0].variants[0].hold = {
				id: hold.holdId,
				context: hold.context,
				productId: hold.productId
			}
		}
	}

	lastTime = logUtils.showTimeDiff('After loop', lastTime);


	return resp;
}



var applyPromotions = async (resp, promoIds) => {
	var prom = [];

	//	Set the default discount for each item in the cart.
	for (var i = 0; i < resp.data.cartItems.length; i++) {
		resp.data.cartItems[i].promoDiscountAmount = 0;
	}

	for (var i = 0; i < promoIds.length; i++) {
		var promo = await Promotions.getById(promoIds[i].promoId);

		switch (promo.type) {
			case 'PCT_OFF':
				calculatePctOff(promo, promoIds[i], resp);
				break;

			case 'PCT_OFF_BY_COIN':
				// calculatePctOffCoin(promo, resp);
				break;

			case 'DOLLARS_OFF':
				// calculateDollarsOff(promo, resp);
				break;

			case 'PRICING':
				break;
		}
	}
}


var calculatePctOff = (promo, promoInCart, resp) => {
	//	Figuring out which discount tier the quantity in cart fits into, if any
	var tier = -1;
	for (var i = 0; i < promo.tiers.length; i++) {
		if (promoInCart.quantity >= promo.tiers[i].minQty) {
			tier = i;
		}
	}

	//	If we found an applicable tier, apply the discount to the effected items in the cart.
	if (tier > -1) {
		for (var i = 0; i < resp.data.cartItems.length; i++) {
			if (resp.data.cartItems[i].promoId === promoInCart.promoId) {
				resp.data.cartItems[i].promoDiscountPct = promo.tiers[tier].discountAmount;
				resp.data.cartItems[i].promoDiscountAmount = (Math.floor((resp.data.cartItems[i].promoDiscountPct * resp.data.cartItems[i].variantGroups[0].price) * 100) / 100);
			}
		}
	}
}



module.exports = {
	enterCartCheckout,
	processCart
}