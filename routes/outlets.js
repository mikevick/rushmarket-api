'use strict';

const express = require('express');
const router = express.Router();

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	respond
} = require('../utils/response');

const {
  getAvailableQuantity
} = require('../actions/outlets');


//
//  GET /outlets/productAvailability
//
router.get(`/productAvailability`, async (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			message: "Success",
			data: {}
		};

		if ((req.query.hostname === undefined) || (req.query.productId === undefined)) {
			respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "hostname, productId"));
		} else {

			await getAvailableQuantity(req, resp);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});




module.exports = router;