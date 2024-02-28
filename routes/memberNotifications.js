'use strict';

const express = require('express');
const router = express.Router();

const {
	queueNotification
} = require('../actions/memberNotifications');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	formatResp,
	respond
} = require('../utils/response');



//
//  POST /memberNotifications
//
router.post(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Notification queued."
		};


		//
		//	Only internal calls allowed.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, undefined, 403, "Access denied.");
		}
		else if ((req.body.toMemberId === undefined) || (req.body.sendTimestamp === undefined) || (req.body.deliveryType === undefined) || (req.body.message === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "toMemberId, sendTimestamp, deliveryType, message"));
			respond(resp, res, next);
		}
		else if ((req.body.deliveryType !== "EMAIL") && (req.body.deliveryType !== "TEXT") && (req.body.deliveryType !== "MESSAGE")) {
			resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "deliveryType"));
			respond(resp, res, next);
		}
		else {
			resp = await queueNotification(req.body.toMemberId, req.body.sendTimestamp, req.body.deliveryType, req.body.message, req.body.relatedToId, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



module.exports = router;