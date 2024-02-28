'use strict';

const express = require('express');
const router = express.Router();

const gdeActions = require('../actions/gde');
const jwtUtils = require('../actions/jwtUtils');
const {
	fulfill,
	getOrder,
	getOrders,
	getOrdersPdf,
	updateOrderLineItem,
	updateOrderLineItems
} = require('../actions/orders');

const {
	getAllFacilityStoreIdsByPartnerId,
	getAllFacilityStoreIdsByPartnerUserId,
	getByStoreId
} = require('../models/partners');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const { respond } = require('../utils/response');
const shopifyUtils = require('../utils/shopifyUtils');
const {
	getUserIdAndType,
	userLookup
} = require('../utils/userUtils');


//
//  GET /orders
//
router.get('/', jwtUtils.verifyToken, async (req, res, next) => {
	const resp = {
		statusCode: 200,
		message: 'Success'
	};

	try {
		if (req.get('x-app-type') === 'EXT' && (req.decoded.identity === undefined ||
			(req.decoded.identity.type !== 'PARTNER' && req.decoded.identity.type !== 'PARTNERUSER'))) {
			respond(resp, res, next, [], 403, 'Access denied.');
			return;
		}

		const productStoreId = safeParseInteger(req.query.productStoreId);
		if (typeof productStoreId !== 'number') {
			respond({}, res, next, [], 400, `invalid value for productStoreId`);
			return;
		}

		if (req.get('x-app-type') === 'EXT') {
			let storeIdRows = [];
			if (req.decoded.identity.type === 'PARTNER') {
				storeIdRows = await getAllFacilityStoreIdsByPartnerId(req.decoded.identity.partnerId);
			}
			if (req.decoded.identity.type === 'PARTNERUSER') {
				storeIdRows = await getAllFacilityStoreIdsByPartnerUserId(req.decoded.identity.partnerId, req.decoded.identity.userId);
			}

			if (!storeIdRows.map(row => row.storeId).includes(productStoreId)) {
				respond({}, res, next, [], 400, `invalid value for productStoreId`);
				return;
			}
		}

		const limit = safeParseInteger(req.query.limit);
		if (
			(req.query.offset && !req.query.limit) ||
			(req.query.limit && typeof limit !== 'number') ||
			limit <= 0
		) {
			respond({}, res, next, [], 400, `invalid value for limit`);
			return;
		}

		const offset = safeParseInteger(req.query.offset);
		if (
			(req.query.limit && !req.query.offset) ||
			(req.query.offset && typeof offset !== 'number') ||
			offset < 0
		) {
			respond({}, res, next, [], 400, `invalid value for offset`);
			return;
		}

		const orderBy = req.query.orderBy ?
			(/^\w+(\.\w+)?(\s+(ASC|DESC))?$/i.test(req.query.orderBy) ? req.query.orderBy : false) :
			undefined;
		if (req.query.orderBy && !orderBy) {
			respond({}, res, next, [], 400, `invalid value for orderBy`);
			return;
		}

		const options = {
			...req.query,
			productStoreId,
			countOnly: req.query.countOnly === "true",
			limit,
			offset,
			orderBy,
			orderLineStaticStatus: req.query.orderLineStaticStatus?.trim()
		};

		const ordersCount = await getOrders(productStoreId, {
			...options,
			countOnly: true,
			limit: undefined,
			offset: undefined,
			orderBy: undefined
		});
		const orders = options.countOnly ? undefined : await getOrders(productStoreId, options);
		respond(
			{
				...resp,
				data: {
					metaData: {
						totalCount: ordersCount?.[0]?.num || 0
					},
					orders
				}
			},
			res,
			next
		);
	} catch (e) {
		console.log(e)
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

function safeParseInteger(string) {
	if (!string) {
		return;
	}
	try {
		return parseInt(string);
	} catch (e) {
		return false;
	}
}


//
// POST /orders/pdf
//
router.post(`/pdf`, jwtUtils.verifyToken, async (req, res, next) => {
	const resp = {
		statusCode: 200,
		message: 'Success'
	};

	try {
		if (req.get('x-app-type') === 'EXT' && (req.decoded.identity === undefined ||
			(req.decoded.identity.type !== 'PARTNER' && req.decoded.identity.type !== 'PARTNERUSER'))) {
			respond(resp, res, next, [], 403, 'Access denied.');
			return;
		}

		const productStoreId = req.body.productStoreId;
		if (!productStoreId || typeof productStoreId !== 'number') {
			respond({}, res, next, [], 400, `invalid value for productStoreId`);
			return;
		}

		if (req.get('x-app-type') === 'EXT') {
			let storeIdRows = [];
			if (req.decoded.identity.type === 'PARTNER') {
				storeIdRows = await getAllFacilityStoreIdsByPartnerId(req.decoded.identity.partnerId);
			}
			if (req.decoded.identity.type === 'PARTNERUSER') {
				storeIdRows = await getAllFacilityStoreIdsByPartnerUserId(req.decoded.identity.partnerId, req.decoded.identity.userId);
			}

			if (!storeIdRows.map(row => row.storeId).includes(productStoreId)) {
				respond({}, res, next, [], 400, `invalid value for productStoreId`);
				return;
			}
		}

		const orderIds = Array.isArray(req.body.orderIds) ? req.body.orderIds : [];
		const orderIdsInvalid = orderIds.findIndex(orderId => !orderId || typeof orderId !== 'number') >= 0;
		if (!orderIds.length || orderIdsInvalid) {
			respond({}, res, next, [], 400, `invalid value for orderIds`);
			return;
		}

		const ordersPdf = await getOrdersPdf(orderIds, productStoreId, req.body.forceMultiOrderFormat);
		if (ordersPdf) {
			res.status(200);
			res.contentType('application/pdf');
			ordersPdf.doc.on('close', () => ordersPdf.cleanUp?.().catch(error =>
				logUtils.logException(`Order PDF generation cleanup errors:\n${error.stack || error.message}`)));
			ordersPdf.doc.pipe(res);
			ordersPdf.doc.end();
		} else {
			respond({}, res, next, [], 404, 'Not found.');
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
// GET /orders/byId/:id
//
router.get(`/byId/:id`, jwtUtils.verifyToken, async (req, res, next) => {
	const resp = {
		statusCode: 200,
		message: 'Success'
	};

	try {
		if (req.get('x-app-type') === 'EXT' && (req.decoded.identity === undefined ||
			(req.decoded.identity.type !== 'PARTNER' && req.decoded.identity.type !== 'PARTNERUSER'))) {
			respond(resp, res, next, [], 403, 'Access denied.');
			return;
		}

		const productStoreId = safeParseInteger(req.query.productStoreId);
		if (typeof productStoreId !== 'number') {
			respond({}, res, next, [], 400, `invalid value for productStoreId`);
			return;
		}

		if (req.get('x-app-type') === 'EXT') {
			let storeIdRows = [];
			if (req.decoded.identity.type === 'PARTNER') {
				storeIdRows = await getAllFacilityStoreIdsByPartnerId(req.decoded.identity.partnerId);
			}
			if (req.decoded.identity.type === 'PARTNERUSER') {
				storeIdRows = await getAllFacilityStoreIdsByPartnerUserId(req.decoded.identity.partnerId, req.decoded.identity.userId);
			}

			if (!storeIdRows.map(row => row.storeId).includes(productStoreId)) {
				respond({}, res, next, [], 400, `invalid value for productStoreId`);
				return;
			}
		}

		const sourceOrderName = safeParseInteger(req.params.id);
		if (typeof sourceOrderName !== 'number') {
			respond({}, res, next, [], 400, `invalid value for sourceOrderName`);
			return;
		}

		const data = await getOrder(sourceOrderName, productStoreId, req.get('x-app-type') === 'INT');
		if (data) {
			respond({ ...resp, data }, res, next);
		} else {
			respond({}, res, next, [], 404, 'Not found.');
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
// PUT /orders/{id}/items
//
router.put(`/:id/items`, jwtUtils.verifyToken, async (req, res, next) => {
	const resp = {
		statusCode: 200,
		message: 'Success'
	};

	try {
		if (req.get('x-app-type') === 'EXT' && (req.decoded.identity === undefined ||
			(req.decoded.identity.type !== 'PARTNER' && req.decoded.identity.type !== 'PARTNERUSER'))) {
			respond(resp, res, next, [], 403, 'Access denied.');
			return;
		}

		const productStoreId = safeParseInteger(req.query.productStoreId);
		if (typeof productStoreId !== 'number') {
			respond({}, res, next, [], 400, `invalid value for productStoreId`);
			return;
		}

		if (req.get('x-app-type') === 'EXT') {
			let storeIdRows = [];
			if (req.decoded.identity.type === 'PARTNER') {
				storeIdRows = await getAllFacilityStoreIdsByPartnerId(req.decoded.identity.partnerId);
			}
			if (req.decoded.identity.type === 'PARTNERUSER') {
				storeIdRows = await getAllFacilityStoreIdsByPartnerUserId(req.decoded.identity.partnerId, req.decoded.identity.userId);
			}

			if (!storeIdRows.map(row => row.storeId).includes(productStoreId)) {
				respond({}, res, next, [], 400, `invalid value for productStoreId`);
				return;
			}
		}

		const { userId, userType } = getUserIdAndType(req);
		const { email } = await userLookup(userId, userType);
		const { name } = await getByStoreId(productStoreId);
		const userDetails = { partnerName: name, productStoreId, userEmail: email, userId, userType };

		const sourceOrderName = safeParseInteger(req.params.id);
		if (typeof sourceOrderName !== 'number') {
			respond({}, res, next, [], 400, `invalid value for sourceOrderName`);
			return;
		}

		const updated = await updateOrderLineItems(sourceOrderName, req.body || {}, userDetails);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
// PUT /orders/items/{id}
//
router.put(`/items/:id`, jwtUtils.verifyToken, async (req, res, next) => {
	const resp = {
		statusCode: 200,
		message: 'Success'
	};

	try {
		if (req.get('x-app-type') === 'EXT' && (req.decoded.identity === undefined ||
			(req.decoded.identity.type !== 'PARTNER' && req.decoded.identity.type !== 'PARTNERUSER'))) {
			respond(resp, res, next, [], 403, 'Access denied.');
			return;
		}

		const productStoreId = safeParseInteger(req.query.productStoreId);
		if (typeof productStoreId !== 'number') {
			respond({}, res, next, [], 400, `invalid value for productStoreId`);
			return;
		}

		if (req.get('x-app-type') === 'EXT') {
			let storeIdRows = [];
			if (req.decoded.identity.type === 'PARTNER') {
				storeIdRows = await getAllFacilityStoreIdsByPartnerId(req.decoded.identity.partnerId);
			}
			if (req.decoded.identity.type === 'PARTNERUSER') {
				storeIdRows = await getAllFacilityStoreIdsByPartnerUserId(req.decoded.identity.partnerId, req.decoded.identity.userId);
			}

			if (!storeIdRows.map(row => row.storeId).includes(productStoreId)) {
				respond({}, res, next, [], 400, `invalid value for productStoreId`);
				return;
			}
		}

		const { userId, userType } = getUserIdAndType(req);
		const { email } = await userLookup(userId, userType);
		const { name } = await getByStoreId(productStoreId);
		const userDetails = { partnerName: name, productStoreId, userEmail: email, userId, userType };

		const sourceLineId = safeParseInteger(req.params.id);
		if (typeof sourceLineId !== 'number') {
			respond({}, res, next, [], 400, `invalid value for sourceLineItemId`);
			return;
		}

		const rushSku = safeParseInteger(req.query.rushSku);
		if (typeof rushSku !== 'number') {
			respond({}, res, next, [], 400, `invalid value for rushSku`);
			return;
		}

		const updated = await updateOrderLineItem(sourceLineId, rushSku, req.body || {}, userDetails, resp);
		if (!updated) {
			respond({}, res, next, [], 404, `Order line item not found`);
			return;	
		}


		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
//  GET /orders/{id}
//
router.get(`/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};


		var si = shopifyUtils.getCityInfoByCity("Omaha");

		var locations = await si.shopify.location.list();

		// console.log(JSON.stringify(locations, undefined, 2));

		resp.data.locations = locations;

		var result = await si.shopify.order.get(req.params.id);

		console.log(JSON.stringify(result, undefined, 2));

		// var result = await si.shopify.fulfillment.get(req.params.id);

		resp.data.order = result;

		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  GET /carriers
//
router.get(`/carriers`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};


		var si = shopifyUtils.getCityInfoByCity("Omaha");

		var carriers = await si.shopify.carrierService.list();

		console.log(JSON.stringify(carriers, undefined, 2));
		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  GET /orders/variants/{id}
//
router.get(`/variants/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};


		var si = shopifyUtils.getCityInfoByCity("Omaha");

		var variant = await si.shopify.productVariant.get(req.params.id);

		//		console.log(JSON.stringify(variant, undefined, 2));

		console.log("fulfillment_service: " + variant.fulfillment_service);
		console.log("inventory_item_id: " + variant.inventory_item_id);

		var params = {
			inventory_item_ids: variant.inventory_item_id
		}
		var levels = await si.shopify.inventoryLevel.list(params);

		if (levels.length > 0) {
			console.log("location_id: " + levels[0].location_id);
			console.log("available: " + levels[0].available);
		}

		// console.log(JSON.stringify(levels, undefined, 2));

		// var result = await si.shopify.fulfillment.get(req.params.id);

		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});




//
//  POST /orders/fulfill
//
router.post(`/fulfill`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};


		if ((req.body.skus === undefined) || (req.body.skus === null)) {
			respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "skus"));
		}
		else {
			resp = await fulfill(req, resp);

			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /orders/soldSku
//
router.post(`/soldSku`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
		};


			await gdeActions.queueSkuDeleteCheck({sku: req.body.sku}, resp);
			respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});




module.exports = router;