'use strict';

const _ = require('lodash');
const express = require('express');
const router = express.Router();

const {
	createNotListedReason,
	getInventory,
	getListedOns,
	getNotListedReasons
} = require('../actions/marketplaces');

const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	formatResp,
	respond
} = require('../utils/response');


//
//  GET /marketplaces/inventory
//
router.get(`/inventory`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get('GET_SUCCESS'),
			data: {}
		}
		var coins = [];

		if (req.query.coinId) {
			if (req.query.coinId.indexOf(',') >= 0) {
				var s = _.split(req.query.coinId, ',');
				for (var i = 0; i < s.length; i++) {
					coins.push(s[i]);
				}
			} else {
				coins.push(req.query.coinId);
			}
		}
		
		//
		//	Internals can't get current, externals can only get current.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ['data'], 404, memberText.get('MEMBER_404'))
		}
		else if (req.query.coinId === undefined) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'vendorSkus'))
			respond(resp, res, next)
		} else {

			// console.log('coins: ' + JSON.stringify(coins, undefined, 2));

			resp = await getInventory(req, resp, coins);

			respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})



//
//  GET /marketplaces/listedOns
//
router.get(`/listedOns`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get('GET_SUCCESS'),
			data: {}
		}


		//
		//	Internals can't get current, externals can only get current.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ['data'], 404, memberText.get('MEMBER_404'))
		} else {

			resp = await getListedOns(req, resp);

			respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})


//
//  GET /marketplaces/notListedReasons
//
router.get(`/notListedReasons`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get('GET_SUCCESS'),
			data: {}
		}


		//
		//	Internals can't get current, externals can only get current.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ['data'], 404, memberText.get('MEMBER_404'))
		} else {

			resp = await getNotListedReasons(req, resp);

			respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})



//
//  POST /marketplaces/notListedReasons
//
router.post(`/notListedReasons`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: memberText.get('GET_SUCCESS')
		}


		//
		//	Internals can't get current, externals can only get current.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ['data'], 404, memberText.get('MEMBER_404'))
		} else if ((req.body.reason === undefined) || (req.body.reason === null)) {
			respond(resp, res, next, ['data'], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "reason"))
		} else {

			resp = await createNotListedReason(req, resp);

			respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})




module.exports = router