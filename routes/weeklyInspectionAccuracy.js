'use strict';

const express = require('express');
const router = express.Router();

const wiaActions = require('../actions/weeklyInspectionAccuracy');

const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');



//
//  GET /weeklyInspectionAccuracy
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	let resp = {
		statusCode: 200,
		message: 'Success.',
		data: {}
	};

	try {		
		if (req.get('x-app-type') !== 'INT') {
			respond(resp, res, next, ["data"], 403, 'Access denied.');
		}
		else {

			await wiaActions.generateReport();
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



module.exports = router