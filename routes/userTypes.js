'use strict';

const express = require('express');
const router = express.Router();

const UserTypes = require('../models/userTypes');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	respond
} = require('../utils/response');


//
//  GET /userTypes
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};


		resp.data.userTypes = await UserTypes.get();
		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



module.exports = router;