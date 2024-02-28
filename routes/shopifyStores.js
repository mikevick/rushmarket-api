'use strict';

const express = require('express');
const router = express.Router();

const ShopifyStores = require('../models/shopifyStores');

const cryptoUtils = require('../utils/cryptoUtils');
const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');
const shopifyUtils = require('../utils/shopifyUtils');



//
//  GET /shopifyStores
//
router.get(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success",
			data: {}
		}

		//
		//	Only allow stores to be loaded for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["id"], 403, "Access denied.");
		} else {


			ShopifyStores.getAll('API')
				.then((storeInfo) => {
					if ((storeInfo === undefined) || (storeInfo === null)) {
						resp.statusCode = 404;
						resp.message = "Shopify stores not found.";
					} else {
						resp.data.shopifyStores = storeInfo;

						if ((req.query.includeKeys != undefined) && (req.query.includeKeys === "true")) {
							resp.data.shopifyStores.forEach((store) => {
								store.keyInfo = JSON.parse(cryptoUtils.decrypt(store.info));
								delete store.info;
							})
						}
					}
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /shopifyStores/{id}
//
router.get(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success",
			data: {}
		}

		//
		//	Only allow stores to be loaded for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["id"], 403, "Access denied.");
		} else {

			if (req.query.label === undefined) {
				respond(resp, res, next, undefined, 400, "Label is required.");
			} else {


				ShopifyStores.getById(req.params.id, req.query.label)
					.then((storeInfo) => {
						if ((storeInfo === undefined) || (storeInfo === null) || (storeInfo.length === 0)) {
							resp.statusCode = 404;
							resp.message = "Shopify stores not found.";
							delete resp.data;
						} else {
							resp.data.shopifyStores = storeInfo;

							if ((req.query.includeKeys != undefined) && (req.query.includeKeys === "true")) {
								resp.data.shopifyStores.forEach((store) => {
									store.keyInfo = JSON.parse(cryptoUtils.decrypt(store.info));
									delete store.info;
								})
							}
						}
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp);
					});
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /shopifyStores/{id}/keys
//
router.get(`/:id/keys`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success"
		}

		//
		//	Only allow texts to be reloaded for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["id"], 403, "Access denied.");
		} else {

			if (req.query.label === undefined) {
				respond(resp, res, next, undefined, 400, "Label is required.");
			} else {


				ShopifyStores.getKeys(req.params.id, req.query.label)
					.then((keyInfo) => {
						if ((keyInfo === undefined) || (keyInfo === null) || (keyInfo.length === 0)) {
							resp.statusCode = 404;
							resp.message = "Keys not found.";
						} else {
							resp.keyInfo = keyInfo;
						}
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp);
					});
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /shopifyStores/{id}/keys
//
router.post(`/:id/keys`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success"
		}

		//
		//	Only allow texts to be reloaded for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["id"], 403, "Access denied.");
		} else {


			if ((req.body.apiKey === undefined) || (req.body.apiPswd === undefined) || (req.body.sharedSecret === undefined) || (req.body.label === undefined)) {
				resp.statusCode = 400;
				resp.message = memberText.get("MISSING_REQUIRED").replace('%required%', "apiKey, apiPswd, sharedSecret, label");
				res.status(400)
				res.send(resp);
			} else {
				ShopifyStores.storeKeys(req.params.id, req.body.label, req.body)
					.then((rows) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp);
					});
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /shopifyStores/reload
//
router.post(`/reload`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Reloaded",
			count: 0
		};

		//
		//	Only allow texts to be reloaded for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["id"], 403, "Access denied.");
		} else {

			//
			//  Load member text.
			//
			shopifyUtils.loadKeys().then((keys) => {
				resp.count = keys.length;
				respond(resp, res, next);
			})
		}
	} catch (e) {
		reject(e);
	}
});





module.exports = router;