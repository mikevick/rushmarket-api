'use strict';

const express = require('express');
const router = express.Router();

const Mailchimps = require('../models/mailchimp');
const Members = require('../models/members');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');


router.get(`/`, (req, res, next) => {
	var resp = {
		statusCode: 200
	};

	response.respond(resp, res, next);
});

//
//  POST /mailchimpWebhook
//
router.post(`/`, (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200
		};

		// console.log("Mailchimp Webook");
		// console.log(JSON.stringify(req.body, undefined, 2));
		// console.log(req.get('x-webhook-verified'));

		prom.push(Mailchimps.log(req));
		if (req.body.type === 'unsubscribe') {
			prom.push(Members.updateEmailMarketingStatusByEmail(req.body["data[email]"], 'UNSUBSCRIBED'));
		} else if (req.body.type === 'cleaned') {
			prom.push(Members.updateEmailMarketingStatusByEmail(req.body["data[email]"], 'CLEANED'));
		}

		Promise.all(prom)
			.then(() => {

				response.respond(resp, res, next);

			})
	} catch (e) {
		console.log("mailchimp webhook exception");
		logUtils.logException(e);
		response.respond(resp, res, next);
	}
});


module.exports = router;