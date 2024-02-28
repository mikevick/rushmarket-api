'use strict';

const express = require('express');
const router = express.Router();
const moment = require('moment');
const emailvalidator = require('email-validator');

const comms = require('../utils/comms');
const exceptions = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');



//
//  POST /emails 
//
router.post(`/`, (req, res, next) => {
	try {
		var now = moment();
		var prom = [];
		var resp = {
			statusCode: 200
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["members"], 403, "Access denied.");
		} else {


			if ((req.body.to === undefined) || (req.body.templateName === undefined)) {
				response.respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "to, templateName"));
			} else if (emailvalidator.validate(req.body.to === false)) {
				response.respond(resp, res, next, undefined, 400, "From and To must be valid email addresses.");
			} else {
				comms.sendTemplatedEmail(req.body.to, req.body.templateName, req.body.substitutions ? req.body.substitutions : {});
				response.respond(resp, res, next);
			}
		}
	} catch (e) {
		exceptions.routeExceptions(e, req, res, next, resp);
	}
});



module.exports = router;