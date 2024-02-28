'use strict';

const emailvalidator = require('email-validator');
const express = require('express');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils');
const {
	changePassword,
	login,
	resetPassword
} = require('../actions/partnerHub');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	respond
} = require('../utils/response');


const UserLogins = require('../models/userLogins');



//
//  POST /partnerHub/login
//
router.post(`/login`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGIN_SUCCESS"),
			data: {}
		};

		if (!req.body.email || (emailvalidator.validate(req.body.email) === false) || !req.body.password || (req.body.password.trim().length === 0)) {
			respond(resp, res, next, ["id", "data"], 401, memberText.get("LOGIN_FAIL"));
		} else {
			await login(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /partnerHub/resetPassword
//
router.post(`/resetPassword`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("PSWD_RESET_SUCCESS")
		};

		if ((req.body.email === undefined) || (emailvalidator.validate(req.body.email) === false)) {
			respond(resp, res, next, ["id", "data"], 401, 'Please provide a valid email address.');
		} else {
			await resetPassword(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /partnerHub/changePassword
//
router.post(`/changePassword`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("CHANGE_PSWD_SUCCESS")
		};

		if ((req.body.verificationId === undefined) || (req.body.password === undefined)) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "Verification ID, Password"));
		} else {
			await changePassword(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /partnerHub/{id}/logout
//
router.post(`/:id/logout`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGOUT_SUCCESS")
		};
		var userFlag = false;

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.userId != undefined)) {
			req.params.id = req.decoded.userId;
		}

		//
		//	Couldn't decode JWT token, simply respond logged out.
		//
		if ((req.decoded === undefined) || (req.decoded.userId === undefined)) {
			respond(resp, res, next);

		}
		//
		//	Mark the token invalid.
		//
		else {
			UserLogins.logout(req)
				.then((results) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /partnerHub/vendorHopIn
//
router.post(`/vendorHopIn`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			message: "Hop-in successful.",
			data: {}
		};
		var userId = 0;


		if (req.body.vendorId === undefined) {
			respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "vendorId"));
		} else {

			//
			//	Couldn't decode JWT token, simply respond logged out.
			//
			if ((req.decoded === undefined) || (req.decoded.userId === undefined)) {
				respond(resp, res, next);
			}
			//
			//	Mark the token invalid.
			//
			else {

				var oldAccessToken = req.get('x-access-token');
				resp.data.accessToken = jwtUtils.signToken({
					userId: req.decoded.userId,
					vendorId: req.body.vendorId
				});

				await UserLogins.updateToken(req.decoded.userId, oldAccessToken, resp.data.accessToken);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



module.exports = router;