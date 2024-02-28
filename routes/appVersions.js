'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const AppVersions = require('../models/appVersions');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');


//
//  DELETE /appVersions/{id}
//
router.delete(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			AppVersions.delById(req.params.id)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next, undefined, 404);
					} else {
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





//
//  GET /appVersions
//
router.get(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			data: {}
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["appVersions"], 403, "Access denied.");
		} else {

			var limit = 10;
			var offset = 0;

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			var where = "";

			AppVersions.getAll(offset, limit)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next);
					} else {
						resp.data.appVersions = rows;
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["appVersions"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["appVersions"]);
	}
});


//
//  GET /appVersions/{id}
//
router.get(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			data: {}
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["memberTexts"], 403, "Access denied.");
		} else {

			AppVersions.getById(req.params.id)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next, ["appVersions"], 404);
					} else {
						resp.data = rows[0];
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["appVersions"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["appVersions"]);
	}
});



//
//  POST /appVersions
//
router.post(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			id: 0
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["id"], 403, "Access denied.");
		} else if ((req.body.version === undefined) || (req.body.platform === undefined) || (req.body.statusCode === undefined) || (req.body.forceFlag === undefined)) {
			response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "version, platform, statusCode, forceFlag"));
		} else {

			//
			//	Verify this platform/version pair hasn't already been used.
			//
			AppVersions.getSpecificVersion(req.body.platform, req.body.version)
				.then((rows) => {
					//
					//	Platform/version already exists.
					//
					if (rows.length > 0) {
						response.respond(resp, res, next, ["id"], 409, memberText.get("PLAT_VERS_EXISTS"));
					}
					//
					//	We have not seen this email before.
					//
					else {
						AppVersions.create(req.body.version, req.body.platform, req.body.statusCode, req.body.forceFlag)
							.then((id) => {
								resp.id = id;
								response.respond(resp, res, next);
							})
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		}
	} catch (e) {
		reject(e);
	}
});


module.exports = router;