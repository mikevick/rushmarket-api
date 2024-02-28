'use strict';

const express = require('express');
const router = express.Router();


const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');
const {
	deleteCoinFromFeed,
	getCoinFromFeed,
	skuDeleteCheck,
	uploadFeed
} = require('../actions/googleFeed');



//
//  GET /
//
// router.get(`/`, async (req, res, next) => {
// 	var resp = {
// 		statusCode: 200,
// 		message: 'Success.',
// 		metaData: {
// 			totalCount: 0
// 		},
// 		data: {}
// 	};

// 	try {
// 		var body = {
// 			merchantId: process.env.GOOGLE_MERCHANT_ID,
// 			auth: auth,
// 			maxResults: 250
// 		}

// 		var products = await content.products.list(body);

// 		console.log(JSON.stringify(products.data.resources, undefined, 2));

// 		resp.data = products.data;

// 		respond(resp, res, next);

// 	} catch (e) {
// 		logUtils.routeExceptions(e, req, res, next, null, null);
// 	}
// })


//
//  GET /skuDeleteCheck/{sku}
//
router.get(`/skuDeleteCheck/:sku`, async (req, res, next) => {
	var resp = {
		statusCode: 200,
		message: 'Success.'
	};


	try {
		console.log(`Checking if ${req.params.sku} should be deleted from google feed.`);
		await skuDeleteCheck(req.params.sku, resp);

		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, null, null);
	}
})



//
//  GET /{COIN}
//
router.get(`/:id`, async (req, res, next) => {
	var resp = {
		statusCode: 200,
		message: 'Success.',
		data: {}
	};

	try {

		await getCoinFromFeed(req.params.id, resp);
		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, null, null);
	}
})




//
//  DELETE /{COIN}
//
router.delete(`/:id`, async (req, res, next) => {
	var resp = {
		statusCode: 200,
		message: 'Success.',
		metaData: {
			totalCount: 0
		},
		data: {}
	};

	try {
		await deleteCoinFromFeed(req.params.id, resp);
		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, null, null);
	}
})


//
//  POST /upload
//
router.post(`/upload`, async (req, res, next) => {
	var resp = {
		statusCode: 200,
		message: 'Success.',
		metaData: {
			totalCount: 0
		},
		data: {}
	};

	try {
		await uploadFeed(resp);
		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, null, null);
	}
})



module.exports = router