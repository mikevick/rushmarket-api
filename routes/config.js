'use strict';

const express = require('express');
const router = express.Router();


const configUtils = require('../utils/configUtils');
const response = require('../utils/response');



//
//  get /config/reload
//
router.get(`/reload`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Reloaded"
		};

		//
		//	Only allow texts to be reloaded for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["id"], 403, "Access denied.");
		} else {

			//
			//  Load member text.
			//
			await configUtils.load();
			response.respond(resp, res, next);
		}
	} catch (e) {
		reject(e);
	}
});


module.exports = router;