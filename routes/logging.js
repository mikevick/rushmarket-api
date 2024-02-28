'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const Logging = require('../models/logging');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  POST /logMessages
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
		} else {


			logUtils.log(req.body)
				.then((id) => {
					resp.id = id;
					response.respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		}
	} catch (e) {
		reject(e);
	}
});


//
//  GET /logMessages
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
			response.respond(resp, res, next, ["totalCount", "filteredCount", "data"], 403, "Access denied.");
		} else {

			var limit = 10;
			var offset = 0;

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			var whereInfo = {
				clause: "",
				values: []
			}

			if (req.query.sessionId) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "session_id = ?", req.query.sessionId);
			}

			if (req.query.severity) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "severity = ?", req.query.severity);
			}

			Logging.get(whereInfo, offset, limit)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next, ["data"], 404);
					} else {
						resp.data.logMessages = rows;
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["logMessages"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["logMessages"]);
	}
});


//
//  GET /logMessages/{id}
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
			response.respond(resp, res, next, ["totalCount", "filteredCount", "data"], 403, "Access denied.");
		} else {

			Logging.getById(req.params.id)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next, ["data"], 404);
					} else {
						resp.data = rows[0];
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["logMessages"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["logMessages"]);
	}
});



module.exports = router;