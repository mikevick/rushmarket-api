'use strict';

const express = require('express');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils');
const {
	validateShippableZip
} = require('../actions/shipCalc');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	respond
} = require('../utils/response');

//
//  GET /shipCalc
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var cartField = null;
		var cartId = null;
		var resp = {
			statusCode: 200,
			data: {
			}
		}

		if ((req.decoded === undefined) || ((req.decoded.memberId === undefined) && (req.decoded.sessionId === undefined))) {
			respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "authToken"));
		} else if (req.query.destZip === undefined) {
			respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "zip"));
		} else {
			if (req.decoded.memberId !== undefined) {
				cartField = 'member_id';
				cartId = req.decoded.memberId;
			}
			else if (req.decoded.sessionId !== undefined) {
				cartField = 'session_id';
				cartId = req.decoded.sessionId;
			}

			await validateShippableZip(req, resp, cartField, cartId);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})


module.exports = router;