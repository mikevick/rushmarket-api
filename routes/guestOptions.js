'use strict';

const express = require('express');
const router = express.Router();

const GuestOptions = require('../models/guestOptions');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');



//
//  GET /
//
router.get(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			data: {}
		};

		GuestOptions.get()
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next, undefined, 404);
					} else {
						resp.data.guestOptions = rows;
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




module.exports = router;