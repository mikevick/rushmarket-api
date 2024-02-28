'use strict';

const _ = require('lodash');
const express = require('express');
const router = express.Router();

const {
	getInventory
} = require('../actions/inventory');

const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	formatResp,
	respond
} = require('../utils/response');

//
//  GET /inventory
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get('GET_SUCCESS'),
			data: {}
		}
		var vendorSkus = [];

		if (req.query.vendorSkus) {
			if (req.query.vendorSkus.indexOf(',') >= 0) {
				var s = _.split(req.query.vendorSkus, ',');
				for (var i = 0; i < s.length; i++) {
					vendorSkus.push(s[i]);
				}
			} else {
				vendorSkus.push(req.query.vendorSkus);
			}
		}
		
		//
		//	Internals can't get current, externals can only get current.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ['data'], 404, memberText.get('MEMBER_404'))
		}
		else if (req.query.vendorSkus === undefined) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'vendorSkus'))
			respond(resp, res, next)
		} else {

			console.log('skus: ' + JSON.stringify(vendorSkus, undefined, 2));

			resp = await getInventory(req, resp, vendorSkus);

			respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})



module.exports = router