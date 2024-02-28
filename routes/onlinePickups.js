'use strict';

const express = require('express');
const router = express.Router();
const {
	notify
} = require('../actions/onlinePickups');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	respond
} = require('../utils/response');




//
//  GET /onlinePickups/notify
//
router.get(`/notify`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
		};

		if ((req.query.name === false) || (req.query.city === undefined) || (req.query.orderId === 0) || (req.query.model === 0) || (req.query.color === 0)) {
			respond(resp, res, next, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'name, city, orderId, model, color'));
		} else {
			await notify(req, resp);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



module.exports = router;