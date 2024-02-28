'use strict';

const express = require('express');
const router = express.Router();

const {
	putProductListing
} = require('../actions/shopifyProductListing');

const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	respond
} = require('../utils/response');



//
//  PUT /shopifyProductListing
//
router.put(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
		};


		if ((req.body.shopifyVariantId === undefined) && (req.body.shopifyProductId === undefined)) {
			respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "shopifyVariantId, shopifyProductId"));
		} else {

			await putProductListing(req.body.shopifyProductId, req.body.shopifyVariantId, req.body.label, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})


module.exports = router