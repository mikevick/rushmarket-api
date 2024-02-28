'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const Telemetries = require('../models/telemetries');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  GET /telemetries
//
router.get(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			// totalCount: 0,
			// filteredCount: 0,
			data: {}
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["data"], 403, "Access denied.");
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
			};

			if (req.query.sessionId) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "session_id = ?", req.query.sessionId);
			}

			Telemetries.get(whereInfo, offset, limit)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next);
					} else {
						resp.data.telemetries = rows;
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["data "]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



module.exports = router;