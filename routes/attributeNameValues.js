'use strict'

const express = require('express')
const router = express.Router()

const Attributes = require('../models/attributes');

const logUtils = require('../utils/logUtils')
const {
	respond
} = require('../utils/response');


// 
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		var json = await Attributes.getCached();

		if (json.length === 0) {
			delete resp.data;
			response.respond(resp, res, next, undefined, 404, 'Attributes not found.');
		} else {
			resp.data.attributes = JSON.parse(json[0].json);
			respond(resp, res, next);
		}		
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


module.exports = router;