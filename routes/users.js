'use strict';

const emailvalidator = require('email-validator');
const express = require('express');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils');
const UserActions = require('../actions/users');

const Users = require('../models/users');
const UserLogins = require('../models/userLogins');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	respond
} = require('../utils/response');
const shopifyUtils = require('../utils/shopifyUtils');
const sqlUtils = require('../utils/sqlUtils');


//
//  GET /users/orders/{id}
//
router.get(`/orders/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};


		var si = shopifyUtils.getCityInfoByCity("Omaha");

		var locations = await si.shopify.location.list();

		console.log(JSON.stringify(locations, undefined, 2));

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
//  GET /users/carriers
//
router.get(`/orders/carriers`, async (req, res, next) => {
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
//  GET /users/variants/{id}
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
//  POST /users/orders/{id}/fulfill
//
router.post(`/orders/:id/fulfill`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		var lineItemId = null;

		var si = shopifyUtils.getCityInfoByCity("Omaha");

		var locations = await si.shopify.location.list();

		var order = await si.shopify.order.get(req.params.id);

		for (var i = 0; i < order.line_items.length; i++) {
			if (order.line_items[i].variant_id.toString() === req.body.shopifyVariantId) {
				lineItemId = order.line_items[i].id;
			}
		}

		var variant = await si.shopify.productVariant.get(req.body.shopifyVariantId);

		console.log("fulfillment_service: " + variant.fulfillment_service);
		console.log("inventory_item_id: " + variant.inventory_item_id);

		var params = {
			inventory_item_ids: variant.inventory_item_id
		}
		var levels = await si.shopify.inventoryLevel.list(params);

		if (levels.length > 0) {
			console.log("location_id: " + levels[0].location_id);
			console.log("available: " + levels[0].available);

			params = {
				location_id: levels[0].location_id,
				tracking_number: req.body.trackingNumber,
				tracking_company: req.body.carrier,
				line_items: [{
					id: lineItemId
				}]
			};
			var result = await si.shopify.fulfillment.create(req.params.id, params);
		}


		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


router.get(`/`, async (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: memberText.get("GET_SUCCESS"),
      metaData: {
        totalCount: 0
      },
      data: {}
    };
    var whereInfo = {
      clause: ' WHERE 1=1 ',
      values: []
    }
    var limit = 50;
    var offset = 0;
    var sortBy = 'u.email ASC';

    //only allow internal to gain access to list of users
    if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, undefined, 403, 'Access denied.')
		} else {
      if (req.query.email) {
        if ((req.query.exactMatchFlag != undefined) && (req.query.exactMatchFlag === 'true')) {
          whereInfo = sqlUtils.appendWhere(whereInfo, 'u.email = ?', req.query.email);
        } else {
          whereInfo = sqlUtils.appendWhere(whereInfo, 'u.email LIKE ?', `%${req.query.email}%`);
        }
      }
      if (req.query.userName) {
        if ((req.query.exactMatchFlag != undefined) && (req.query.exactMatchFlag === 'true')) {
          whereInfo = sqlUtils.appendWhere(whereInfo, 'u.user_name = ?', req.query.userName);
        } else {
          whereInfo = sqlUtils.appendWhere(whereInfo, 'u.user_name LIKE ?', `%${req.query.userName}%`);
        }
      }
      if (req.query.deleted) { 
        if ((req.query.exactMatchFlag != undefined) && (req.query.exactMatchFlag === 'true')) {
          whereInfo = sqlUtils.appendWhere(whereInfo, 'u.deleted = ?', Number.parseInt(req.query.deleted));
        } else {
          whereInfo = sqlUtils.appendWhere(whereInfo, 'u.deleted IN (?)');
          whereInfo.values.push(req.query.deleted.split(',').map((a)=>Number.parseInt(a)));
        }
      }

      if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['u.user_name', 'u.email']);
				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}

      if ((sortBy != 'field') && (sortBy != 'direction')) {
				resp = await UserActions.getAll(whereInfo, sortBy, offset, limit, resp);
				respond(resp, res, next);
			}
    }

  } catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
//  GET /users/{id}
//
router.get(`/:id`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.userId != undefined)) {
				req.params.id = req.decoded.userId;
			}


			Users.getById(req.params.id)
				.then((rows) => {

					if (rows.length === 0) {
						respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
					} else {
						resp.data = rows[0];
						if (resp.data.deleted[0] === 1) {
							resp.data.deleted = true;
						} else {
							resp.data.deleted = false;
						}

						//
						//	If this is an external API request, remove password.
						//
						if (req.get('x-app-type') === 'EXT') {
							delete resp.data.password;
							delete resp.data.dateCreated;
							delete resp.data.dateDeleted;
							delete resp.data.userId;
						}
						respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  POST /users/login
//
router.post(`/login`, async (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGIN_SUCCESS"),
			data: {}
		};

		if ((req.body.email === undefined) || (emailvalidator.validate(req.body.email) === false) || (req.body.password === undefined) || (req.body.password.trim().length === 0)) {
			respond(resp, res, next, ["id", "data"], 401, memberText.get("LOGIN_FAIL"));
		} else {
			await UserActions.login(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /users/{id}/logout
//
router.post(`/:id/logout`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGOUT_SUCCESS")
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.userId != undefined)) {
			req.params.id = req.decoded.userId;
		}

		//
		//	Couldn't decode JWT token, simply respond logged out.
		//
		if ((req.decoded === undefined) || (req.decoded.userId === undefined)) {
			respond(resp, res, next);

		}
		//
		//	Mark the token invalid.
		//
		else {
			UserLogins.logout(req)
				.then((results) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




module.exports = router;