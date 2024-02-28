'use strict';

const express = require('express');
const router = express.Router();

const {
	enterCartCheckout,
	processCart
} = require('../actions/cart');

const jwtUtils = require('../actions/jwtUtils');
const holdsActions = require('../actions/productHolds');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	respond
} = require('../utils/response');


//
//  GET /cart
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var memberId = undefined;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};
		var sessionId = undefined;


		if ((req.get('x-app-type') === 'EXT') &&
				(req.decoded !== undefined) && (req.decoded !== null) &&
				(((req.decoded.sessionId !== undefined) && (req.decoded.sessionId !== null)) ||
				(req.decoded.memberId !== undefined) && (req.decoded.memberId !== null))) {
			memberId = req.decoded.memberId;
			sessionId = req.decoded.sessionId;

			resp = await processCart(req, sessionId, memberId, resp);
			respond(resp, res, next);
		} else {
			respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "memberId or sessionId"));
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
//  POST /cart/items
//
router.post(`/items`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Item(s) added to cart successfully.",
			data: {
				holds: []
			}
		};


		//	Inject sessionId or memberId into body for easier use.
		if ((req.decoded !== undefined) && (req.decoded.sessionId !== undefined)) {
			req.body.sessionId = req.decoded.sessionId;
		}

		if ((req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
			req.body.memberId = req.decoded.memberId;
		}
	
	
		//	Either a customerId or a sessionId needs to be provided 
		if (((req.body.sessionId === undefined) && (req.body.memberId === undefined)) ||
				(req.body.productId === undefined) || (req.body.productId.length === 0) ||
				(req.body.city === undefined) || (req.body.city.length === 0) ||
				(req.body.store === undefined) || (req.body.store.length === 0)) {
			respond(resp, res, next, undefined, 400, "Product ID, store, city and session ID are required.");
		} else {

			resp = await holdsActions.executeBulkProductHold(req, resp);
			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  DELETE /cart/item
//
router.delete(`/items`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		//	Inject sessionId or memberId into body for easier use.
		if ((req.decoded !== undefined) && (req.decoded.sessionId !== undefined)) {
			req.body.sessionId = req.decoded.sessionId;
		}

		if ((req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
			req.body.memberId = req.decoded.memberId;
		}
	

		if ((req.body.products === undefined) || (req.body.store === undefined)) {
			respond(resp, res, next, undefined, 400, "Products and store are required.");
		} else {

			holdsActions.releaseProductHold(req, resp)
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
//  DELETE /cart/item/{id}
//
router.delete(`/items/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		holdsActions.releaseProductHoldById(req, resp)
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
//  put /cart/items/enterCheckout
//
router.put(`/items/enterCheckout`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			data: {},
			message: "Product entered checkout successfully.",
		};

		//	Inject sessionId or memberId into body for easier use.
		if ((req.decoded !== undefined) && (req.decoded.sessionId !== undefined)) {
			req.body.sessionId = req.decoded.sessionId;
		}

		if ((req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
			req.body.memberId = req.decoded.memberId;
		}
	
		if ((req.body.productId === undefined) || (req.body.productId.length === 0) ||(req.body.store === undefined) || (req.body.store.length === 0)) {
			respond(resp, res, next, undefined, 400, "Product ID and store are required.");
		} else {

			holdsActions.executeEnterCheckout(req, resp)
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
//  put /cart/items/purhcased
//
router.put(`/items/purchased`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Product purchased successfully.",
		};


		//	Inject sessionId or memberId into body for easier use.
		if ((req.decoded !== undefined) && (req.decoded.sessionId !== undefined)) {
			req.body.sessionId = req.decoded.sessionId;
		}

		if ((req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
			req.body.memberId = req.decoded.memberId;
		}
	

		if ((req.body.productId === undefined) || (req.body.productId.length === 0) || (req.body.store === undefined) || (req.body.store.length === 0)) {
			respond(resp, res, next, undefined, 400, "Product ID and store are required.");
		} else {

			holdsActions.executePurchase(req, resp)
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
//  PUT /cart/items
//
router.put(`/items`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		//	Inject sessionId or memberId into body for easier use.
		if ((req.decoded !== undefined) && (req.decoded.sessionId !== undefined)) {
			req.body.sessionId = req.decoded.sessionId;
		}

		if ((req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
			req.body.memberId = req.decoded.memberId;
		}
	

		if (req.body.productId === undefined) {
			delete resp.data;
			respond(resp, res, next, undefined, 400, "One or more productIds must be provided.");
		}
		else if (req.body.context === undefined) {
			delete resp.data;
			respond(resp, res, next, undefined, 400, "Context is required.");
		} else {
			holdsActions.updateProductHolds(req, resp)
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
//  PUT /cart/items/{id}
//
router.put(`/items/:id`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		//	Inject sessionId or memberId into body for easier use.
		if ((req.decoded !== undefined) && (req.decoded.sessionId !== undefined)) {
			req.body.sessionId = req.decoded.sessionId;
		}

		if ((req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
			req.body.memberId = req.decoded.memberId;
		}


		if ((req.query.context === undefined) && (req.body.context === undefined) &&
				(req.query.quantity === undefined) && (req.body.quantity === undefined)) {
			delete resp.data;
			respond(resp, res, next, undefined, 400, "Context and/or quantity is required.");
		} else {
			holdsActions.updateProductHoldById(req, resp)
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
//  PUT /cart/checkout
//
router.put(`/checkout`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			message: 'Success.',
			statusCode: 200,
			data: {}
		};

		if ((req.get('x-app-type') === 'EXT') &&
				(req.decoded !== undefined) && (req.decoded !== null) &&
				(((req.decoded.sessionId !== undefined) && (req.decoded.sessionId !== null)) ||
				(req.decoded.memberId !== undefined) && (req.decoded.memberId !== null))) {

			var resp = await enterCartCheckout(req, resp);
			respond(resp, res, next);
		} else {
			respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "memberId or sessionId"));
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





module.exports = router