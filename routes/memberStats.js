'use strict';

const express = require('express');
const router = express.Router();

const logUtils = require('../utils/logUtils');
const mailchimpUtils = require('../utils/mailchimpUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');
const shopifyUtils = require('../utils/shopifyUtils');

const Members = require('../models/members');


//
//  GET /memberStats
//
router.get(`/`, (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			prom.push(mailchimpUtils.lookupList("The Rush Market"));
			prom.push(shopifyUtils.customerCount());
			prom.push(Members.count());

			Promise.all(prom)
				.then((results) => {
					resp.data.mailchimpCount = (results[0] === undefined) ? 0 : results[0].stats.member_count;
					resp.data.rushSubscribed = results[2].subscribedCount;
					resp.data.shopifyCount = results[1];
					resp.data.rushCount = results[2].totalCount;
					response.respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


module.exports = router;