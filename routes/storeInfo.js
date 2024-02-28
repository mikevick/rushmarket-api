'use strict';

const express = require('express');
const router = express.Router();

const Members = require('../models/members');


const logUtils = require('../utils/logUtils');
const {
	formatResp,
	respond
} = require('../utils/response');
const memberText = require('../utils/memberTextUtils');



//
//  GET /storeInfo
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		}

		if (req.query.zip === undefined) {
			resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "zip"));
			respond(resp, res, next);
		} else {

			resp.data.storeInfo = await Members.populateStoreInfoByZip(req.query.zip);
			if (resp.data.storeInfo.store === undefined) {
				resp.statusCode = 404;
				resp.message = "No store info found."
				delete resp.data;
			}
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



module.exports = router;