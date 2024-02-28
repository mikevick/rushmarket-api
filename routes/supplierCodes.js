'use strict';
const express = require('express');
const router = express.Router();

const SupplierCodes = require('../models/supplierCodes');

const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const {
	respond
} = require('../utils/response');


//
//  PUT /supplierCodes/{code}
//
router.put(`/:code`, async (req, res, next) => {
	var resp = {
		statusCode: 200,
		message: 'Success.'
	};

	try {

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {

			if ((req.body.storeId !== null) && (!Number.isInteger(req.body.storeId))) {
				response.respond(resp, res, next, undefined, 400, 'Invalid storeId.');
			} else {
				var result = await SupplierCodes.update(req.params.code, req.body.storeId);
				if (result.affectedRows !== 1) {
					response.respond(resp, res, next, undefined, 404, 'Code not found.');
				}
				else {
					respond(resp, res, next);
				}
			}
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, null, null);
	}
})


//
//  GET /supplierCodes/{code}
//
router.get(`/:code`, jwtUtils.verifyToken, async (req, res, next) => {
	var resp = {
		statusCode: 200,
		message: 'Success.',
		data: {}
	};

	try {

		if ((req.get('x-app-type') === 'EXT') && ((req.decoded.identity === undefined) || ((req.decoded.identity.type !== 'PARTNER') && (req.decoded.identity.type !== 'PARTNERUSER')))) {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {

			var codes = await SupplierCodes.get(req.params.code);
			if (codes.length === 0) {
				response.respond(resp, res, next, ['data'], 404, 'Code not found.');
			}
			else {
				resp.data = codes[0];
				respond(resp, res, next);
			}
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, null, null);
	}
})



module.exports = router