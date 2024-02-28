'use strict';

const _ = require('lodash');
const express = require('express');
const router = express.Router();

const {
	get
} = require('../actions/carrierSelection');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	respond
} = require('../utils/response');



//
//  GET /carrierSelection
//
router.get(`/`, async (req, res, next) => {
	try {
		var skus = [];
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};


		if ((req.query.sku === undefined) || (req.query.destZip === undefined)) {
			respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku, destZip"));
		} else {

			if (req.query.sku) {
				if (req.query.sku.indexOf(',') >= 0) {
					var s = _.split(req.query.sku, ',')
					for (var i = 0; i < s.length; i++) {
						skus.push(s[i]);
					}
				}
				else {
					skus.push(req.query.sku);
				}
			}

			await get(skus, req.query.destZip, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})


module.exports = router