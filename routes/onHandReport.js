'use strict';

const express = require('express');
const router = express.Router();

const {
	getOnHand
} = require('../actions/onHand');

const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  GET /onHandReport
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var id;
		var internalFlag = true;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {
				onHandQuantity: 0,
				projectedRecoveryValue: 0
			}
		};
		var whereInfo = {
			clause: '',
			values: []
		};



		//	Determine if this is an internal user or not and capture their id.
		if ((req.get('x-app-type') === 'EXT') &&
			(req.decoded !== undefined) &&
			(req.decoded.vendorId != undefined)) {
			req.query.vendorId = req.decoded.vendorId;
			internalFlag = false;
		}
		else if ((req.get('x-app-type') === 'INT') &&
			(req.decoded !== undefined) &&
			(req.decoded.userId != undefined)) {
				id = req.decoded.userId;
				internalFlag = true;
		}


		if (req.query.vendorId === undefined) {
			respond(resp, res, next, ["data"], 400, 'Required: vendorId.');
		} else {

			if (req.query.vendorId) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'm.vendor_id = ?', req.query.vendorId);
			}

			await getOnHand(req.query.vendorId, whereInfo, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})


module.exports = router