'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const router = express.Router();

const {
	shopifyWebhook
} = require('../actions/shopify');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');


router.use(bodyParser.urlencoded({
	extended: true
}));
router.use(bodyParser.json({
	verify: function (req, res, buf, encoding) {
		var shopHMAC = req.get('x-shopify-hmac-sha256');
		if (!shopHMAC) return;
		if (req.get('x-webhook-verified')) throw "Unexpected webhook verified header";
		var sharedSecret = process.env.API_SECRET;
		var digest = crypto.createHmac('SHA256', sharedSecret).update(buf).digest('base64');
		if (digest === req.get('x-shopify-hmac-sha256')) {
			req.headers['x-webhook-verified'] = '200';
		}
	}
}));




//
//  POST /shopifyWebhook
//
//	General handler for shopify webhooks.  Will log it and perform logic if required for specific topics.
//
router.post(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		shopifyWebhook(req, resp)
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