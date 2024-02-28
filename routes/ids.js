'use strict';

const express = require('express');
const router = express.Router();

const globals = require('../globals');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');


//
//  GET /ids
//
router.get(`/`, (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			id: globals.mongoid.fetch(),
			statusCode: 200
		};

		response.respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


module.exports = router;