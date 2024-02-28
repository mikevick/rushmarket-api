'use strict';

const express = require('express');
const isValidZipcode = require('is-valid-zipcode');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils');
const sessions = require('../actions/sessions');

const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');


//
//  POST /sessions
//
router.post(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success",
			data: {}
		};


		if ((req.body.zip !== undefined) && (req.body.zip !== null) && (isValidZipcode(req.body.zip) === false)) {
			respond(resp, res, next, ["data"], 400, "Invalid zip code.");
		}
		else {
			await sessions.createSession(req, resp);
			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  PUT /sessions
//
router.put(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success",
		};

		if ((req.decoded === undefined) || (req.decoded.sessionId === undefined)) {
			respond(resp, res, next, ["data"], 400, "Invalid session.");
		}

		if ((req.body.zip !== undefined) && (req.body.zip !== null) && (isValidZipcode(req.body.zip) === false)) {
			respond(resp, res, next, ["data"], 400, "Invalid zip code.");
		}
		else {
			if ((req.body.zip !== undefined) && (req.body.zip !== null)) {
				await sessions.updateSession(req.decoded.sessionId, req, resp);
			}

			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



module.exports = router;