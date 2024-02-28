'use strict';

const express = require('express');
const router = express.Router();
const emailvalidator = require('email-validator');

const emailCaptures = require('../actions/emailCaptures');

const exceptions = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');



//
//  POST /emailCaptures 
//
router.post(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		if ((req.body.email === undefined) || (req.body.zip === undefined)) {
			response.respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "email, zip"));
		} else if (emailvalidator.validate(req.body.email) === false) {
			response.respond(resp, res, next, undefined, 400, "Email must be valid email address.");
		} else {
			await emailCaptures.capture(req.body.email, req.body.zip, req.body.tags, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		exceptions.routeExceptions(e, req, res, next, resp);
	}
});


module.exports = router;