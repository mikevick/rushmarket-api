'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const EmailTemplates = require('../models/emailTemplates');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');



//
//  DELETE /emailTemplates/{id}
//
router.delete(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			EmailTemplates.delById(req.params.id)
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
//  GET /emailTemplates
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

			var where = "";

			EmailTemplates.get(offset, limit)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next);
					} else {
						resp.data.emailTemplates = rows;
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  GET /emailTemplates/{id}
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
			response.respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			EmailTemplates.getById(req.params.id)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next, ["data"], 404);
					} else {
						resp.data = rows[0];
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /emailTemplates
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
		} else if ((req.body.name === undefined) || (req.body.from === undefined) || (req.body.subject === undefined) || (req.body.textBody === undefined) || (req.body.htmlBody === undefined)) {
			response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "name, from, subject, textBody, htmlBody"));
		} else {
			//
			//	Verify this template name hasn't already been used.
			//
			EmailTemplates.getByName(req.body.name)
				.then((rows) => {
					//
					//	Template name already exists.
					//
					if (rows != undefined) {
						response.respond(resp, res, next, ["id"], 409, memberText.get("EMAIL_TEMPLATE_EXISTS"));
					}
					//
					//	We have not seen this email before.
					//
					else {
						EmailTemplates.create(req.body.name, req.body.from, req.body.subject, req.body.textBody, req.body.htmlBody)
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
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});


//
//  PUT /emailTemplates/{id}
//
router.put(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["id"], 403, "Access denied.");
		} else {
			EmailTemplates.updateById(req.params.id, req.body)
				.then((id) => {
					response.respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



module.exports = router;