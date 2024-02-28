'use strict';

const express = require('express');
const router = express.Router();

const {
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
	updateProductHoldById
} = require('../actions/productHolds');


const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  POST /productHolds
//
router.post(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Hold placed successfully.",
			data: {}
		};

		if (((req.query.shopifyCustomerId === undefined) || (req.query.shopifyCustomerId === 0) ||
				(req.query.productId === undefined) || (req.query.productId.length === 0) ||
				(req.query.store === undefined) || (req.query.store.length === 0)) &&
			((req.query.associateId === undefined) || (req.query.associateId === 0) ||
				(req.query.productId === undefined) || (req.query.productId.length === 0) ||
				(req.query.store === undefined) || (req.query.store.length === 0))) {
			respond(resp, res, next, undefined, 400, "Product ID, store, city and either associate ID or shopify customer ID are required.");
		} else {

			if (req.query.associateId !== undefined) {
				resp = await executeProductMarketHold(req, resp);
			} else {
				resp = await executeProductHold(req, resp);
			}

			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /productHolds/bulk
//
router.post(`/bulk`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {
				holds: []
			}
		};

		if (((req.body.shopifyCustomerId === undefined) || (req.body.shopifyCustomerId === 0) ||
				(req.body.productId === undefined) || (req.body.productId.length === 0) ||
				(req.body.city === undefined) || (req.body.city.length === 0) ||
				(req.body.store === undefined) || (req.body.store.length === 0))) {
			respond(resp, res, next, undefined, 400, "Product ID, store, city and shopify customer ID are required.");
		} else {

			resp = await executeBulkProductHold(req, resp);
			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  GET /productHolds
//
router.get(`/`, async (req, res, next) => {
	try {
		var p = null;
		var resp = {
			statusCode: 200,
			message: "Member has hold on product.",
			data: {}
		};
		var sortBy = "date_created DESC";
		var whereInfo = {
			clause: "",
			values: []
		};



		if ((req.query.store === undefined) && (req.query.city === undefined)) {
			respond(resp, res, next, undefined, 400, "Store or city is required.");
		} else {


			if (req.query.dateCreatedStart) {
				if (req.query.dateCreatedStart.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "h.date_created >= ?", req.query.dateCreatedStart.substring(0, 10) + " " + req.query.dateCreatedStart.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "h.date_created >= ?", req.query.dateCreatedStart.substring(0, 10) + " 00:00:00");
				}
			}


			if (req.query.expireTimeStart) {
				if (req.query.expireTimeStart.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "expire_time >= ?", req.query.expireTimeStart.substring(0, 10) + " " + req.query.expireTimeStart.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "expire_time >= ?", req.query.expireTimeStart.substring(0, 10) + " 00:00:00");
				}
			}


			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['dateCreated', 'expireTime']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}


			if (req.query.memberId !== undefined) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "member_id = ?", req.query.memberId);
				if (req.query.city !== undefined) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "city = ?", req.query.city);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "store = ?", req.query.store);
				}
				p = getMemberHolds(whereInfo, sortBy, req, resp);
			} else if (req.query.shopifyCustomerId !== undefined) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "shopify_customer_id = ?", req.query.shopifyCustomerId);
				if (req.query.city !== undefined) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "city = ?", req.query.city);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "store = ?", req.query.store);
				}
				p = getCustomerHolds(whereInfo, sortBy, req, resp);
			} else if (req.query.associateId !== undefined) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "associate_id = ?", req.query.associateId);
				if (req.query.city !== undefined) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "city = ?", req.query.city);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "store = ?", req.query.store);
				}
				p = getAssociateHolds(whereInfo, sortBy, req, resp);
			} else if (req.query.productIdList !== undefined) {
				if (req.query.city !== undefined) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "city = ?", req.query.city);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "store = ?", req.query.store);
				}
				resp.message = "Success.";
				p = checkBulkProductHold(whereInfo, sortBy, req, resp);
			} else {
				if (req.query.productId !== undefined) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "product_id = ?", req.query.productId);
				}
				if (req.query.city !== undefined) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "city = ?", req.query.city);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "store = ?", req.query.store);
				}
				p = checkProductHold(whereInfo, sortBy, req, resp);
			}

			p.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				});
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  DELETE /productHolds
//
router.delete(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		if (((req.query.memberId === undefined) && (req.query.shopifyCustomerId === undefined)) ||
			(req.query.productId === undefined) || (req.query.store === undefined)) {
			respond(resp, res, next, undefined, 400, "Member ID or shopify customer ID, product ID and store are required.");
		} else {

			releaseProductHold(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				});
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  DELETE /productHolds/marketHolds
//
router.delete(`/marketHolds`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		if (req.query.store === undefined) {
			respond(resp, res, next, undefined, 400, "Store is required.");
		} else {

			releaseProductMarketHolds(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				});
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  DELETE /productHolds/{id}
//
router.delete(`/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		releaseProductHoldById(req, resp)
			.then((resp) => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  put /productHolds/enterCheckout
//
router.put(`/enterCheckout`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			data: {},
			message: "Product entered checkout successfully.",
		};

		if ((req.query.shopifyCustomerId === undefined) || (req.query.shopifyCustomerId.length === 0) ||
			(req.query.productId === undefined) || (req.query.productId.length === 0) ||
			(req.query.store === undefined) || (req.query.store.length === 0)) {
			respond(resp, res, next, undefined, 400, "Shopify customer ID, product ID and store are required.");
		} else {

			executeEnterCheckout(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				});
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  put /productHolds/purhcased
//
router.put(`/purchased`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Product purchased successfully.",
		};

		if ((req.query.productId === undefined) || (req.query.productId.length === 0) ||
			(req.query.store === undefined) || (req.query.store.length === 0)) {
			respond(resp, res, next, undefined, 400, "Shopify customer ID, product ID and store are required.");
		} else {

			executePurchase(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				});
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  put /productHolds/{id}/bumpExpiration
//
router.put(`/:id/bumpExpiration`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			data: {},
			message: "Product expiration extended successfully.",
		};

		if (req.get('x-app-type') === 'EXT') {
			delete resp.data;
			respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if ((req.params.id === undefined) || (req.body.minutes === undefined) || (req.body.associateId === undefined)) {
				delete resp.data;
				respond(resp, res, next, undefined, 400, "Hold ID, associate ID and minutes are required.");
			} else {

				bumpExpiration(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
					});
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  PUT /productHolds/{id}
//
router.put(`/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		if (req.query.context === undefined) {
			delete resp.data;
			respond(resp, res, next, undefined, 400, "Context is required.");
		} else {
			updateProductHoldById(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				});
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





module.exports = router;