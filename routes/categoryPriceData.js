'use strict';

const express = require('express');
const router = express.Router();

const categoryPriceData = require('../actions/categoryPriceData');

const memberText = require('../utils/memberTextUtils');
const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');



//
//  Get all category price data
//
router.get(`/`, async (req, res, next) => {
	let resp = {
		statusCode: 200,
		message: 'Success.',
		data: {}
	};


	try {

		if ((req.query.sku === undefined) && ((req.query.categoryId === undefined) && (req.query.msrp === undefined) && (req.query.compareAt === undefined))) {
			delete resp.data;
			respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku or categorId, msrp, compareAt"));
		} else {

			resp = await categoryPriceData.get(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
})

module.exports = router;