'use strict';

const express = require('express');
const router = express.Router();

const supplierCodeSuffix = require('../actions/supplierCodeSuffix');

const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');



//
//  GET /supplierCodeSuffix
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			resp = await supplierCodeSuffix.getAll(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});





module.exports = router;