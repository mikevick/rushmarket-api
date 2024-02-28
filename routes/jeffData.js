'use strict';
const express = require('express');
const router = express.Router();

const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');
const {
	buildDefaultShippable
} = require('../actions/jeffData');



//
//  GET /buildSheet
//
router.get(`/defaultShippable`, async (req, res, next) => {
	var resp = {
		statusCode: 200,
		message: 'Success.',
		data: {}
	};


	try {
		await buildDefaultShippable(resp);

		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, null, null);
	}
})

module.exports = router;