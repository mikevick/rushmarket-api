'use strict';

const express = require('express');
const router = express.Router();

const ScheduledTasks = require('../models/scheduledTasks');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');


//
//  GET /ping
//
router.get(`/`, (req, res, next) => {
	try {
		var gap = process.env.PING_MINUTES ? process.env.PING_MINUTES : 30;
		var resp = {
			statusCode: 200,
			message: "20200811-1"
		};

	
		ScheduledTasks.check()
		.then((results) => {

			if (results[0].mins >= gap) {
				resp.statusCode = 500;
				logUtils.log({
					severity: 'ERROR',
					type: 'SCHEDTASKS',
					message: 'Scheduled tasks may be stuck.'
				});
			}

			response.respond(resp, res, next);
		})
		.catch ((e) => {
			logUtils.routeExceptions(e, req, res, next, resp);
		})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

module.exports = router;