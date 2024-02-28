'use strict';

const express = require('express');
const router = express.Router();

const {
	mandrillWebhook
} = require('../actions/mandrill');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');


//
//  GET /mandrillWebhook
//
router.get(`/`, (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200
		};

		// console.log("Mandrill " + req.method + " Webook");
		// console.log(JSON.stringify(req.body, undefined, 2));
		// console.log(req.get('x-webhook-verified'));

		// prom.push(Mailchimps.log(req));
		// if (req.body.type === 'unsubscribe') {
		// 	prom.push(Members.updateEmailMarketingStatusByEmail(req.body["data[email]"], 'UNSUBSCRIBED'));
		// } else if (req.body.type === 'cleaned') {
		// 	prom.push(Members.updateEmailMarketingStatusByEmail(req.body["data[email]"], 'CLEANED'));
		// }

		// Promise.all(prom)
		// 	.then(() => {

				response.respond(resp, res, next);

			// })
	} catch (e) {
		logUtils.logException(e);
		response.respond(resp, res, next);
	}
});




//
//  POST /mandrillWebhook
//
//	General handler for mandrill webhooks.  Will log it and perform logic if required for specific topics.
//
router.post(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		mandrillWebhook(req, resp)
			.then((resp) => {
				response.respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.logException(e);
				response.respond(resp, res, next);
			})
	} catch (e) {
		logUtils.logException(e);
		response.respond(resp, res, next);
	}
});




module.exports = router;