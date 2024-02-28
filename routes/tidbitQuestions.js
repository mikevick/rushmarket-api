'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const {
	create,
	getAll,
	getById,
	update,
	remove
} = require('../actions/tidbitQuestions');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');
const {
	formatResp,
	respond
} = require('../utils/response');


//
//  POST /tidbitQuestions
//
router.post(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success."
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if ((req.body.question === undefined) || (req.body.tidbitType === undefined)) {
				resp = formatResp(resp, undefined, 400, "Question and tidbitType required.");
				respond(resp, res, next);
			} else {

				create(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
					})
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /tidbitQuestions
//
router.get(`/`, (req, res, next) => {
	try {
		var includeAnswers = false;
		var limit = 50;
		var memberId = null;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: "Success.",
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var whereInfo = {
			clause: "",
			values: []
		};

		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}

		if (req.query.status) {
			whereInfo = sqlUtils.appendWhere(whereInfo, "status = ?", req.query.status);
		}

		if (req.query.memberId) {
			var clause = "((q.ask_once = FALSE) OR " +
				"((q.ask_once = TRUE) AND (q.id NOT IN (SELECT tidbit_question_id FROM member_profile_tidbits WHERE member_id = ?))))";
			whereInfo = sqlUtils.appendWhere(whereInfo, clause, req.query.memberId);
		}

		if ((req.query.includeAnswers != undefined) && (req.query.includeAnswers === "true")) {
			includeAnswers = true;
		}


		//
		//	Only allow questions to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			getAll(whereInfo, offset, limit, resp, includeAnswers)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /tidbitTypes/{id}
//
router.get(`/:id`, (req, res, next) => {
	try {
		var includeAnswers = false;
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};
		var where = "";

		if ((req.query.includeAnswers != undefined) && (req.query.includeAnswers === "true")) {
			includeAnswers = true;
		}


		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			getById(req, resp, includeAnswers)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  DELETE /tidbitQuestions/{id}
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

			remove(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})

		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  PUT /tidbitQuestions/{id}
//
router.put(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Update successful."
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if ((req.body.status != undefined) && (req.body.status != 'ACTIVE') && (req.body.status != 'INACTIVE')) {
				response.respond(resp, res, next, undefined, 400, "Status invalid.");
			} else {
				update(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
					})
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


module.exports = router;