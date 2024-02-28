'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const MemberTexts = require('../models/memberText');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');



//
//  DELETE /memberTexts/{label}
//
router.delete(`/:label`, (req, res, next) => {
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

			MemberTexts.delByLabel(req.params.label)
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
//  GET /memberTexts
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

			var whereInfo = {
				clause: "",
				values: []
			};

			MemberTexts.get(whereInfo, offset, limit)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next);
					} else {
						resp.data.memberTexts = rows;
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
//  GET /memberTexts/{label}
//
router.get(`/:label`, (req, res, next) => {
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

			MemberTexts.getByLabel(req.params.label)
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
//  POST /memberTexts
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
		} else if ((req.body.label === undefined) || (req.body.text === undefined)) {
			response.respond(resp, res, next, undefined, 400, "Required: (label, text).");
		} else {
			//
			//	Verify this label hasn't already been used.
			//
			MemberTexts.getByLabel(req.body.label)
				.then((rows) => {
					//
					//	Platform/version already exists.
					//
					if (rows.length > 0) {
						response.respond(resp, res, next, ["id"], 409, memberText.get("TEXT_LABEL_EXISTS"));
					}
					//
					//	We have not seen this email before.
					//
					else {
						MemberTexts.create(req.body.label, req.body.text)
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


//
//  POST /memberTexts/reload
//
router.post(`/reload`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Reloaded",
			texts: []
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
			memberText.load().then((text) => {
				if ((text != undefined) && (text.length > 0)) {
					for (var i=0; i < text.length; i++) {
						resp.texts.push(text[i].label + ": " + text[i].text);
					}
				}

				response.respond(resp, res, next);
			})
		}
	} catch (e) {
		reject(e);
	}
});


module.exports = router;