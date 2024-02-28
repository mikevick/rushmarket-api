'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const {
	create,
	createAnswer,
	getAll,
	getAllAnswers,
	getById,
	getAnswerById,
	remove,
	removeAnswer,
	update,
	updateAnswer
} = require('../actions/tidbitTypes');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const {
	formatResp,
	respond
} = require('../utils/response');


//
//  POST /tidbitTypes
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

			if (req.body.name === undefined) {
				resp = formatResp(resp, undefined, 400, "Name required.");
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
//  GET /tidbitTypes
//
router.get(`/`, (req, res, next) => {
	try {
		var limit = 50;
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


		//
		//	Only allow types to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			getAll(whereInfo, offset, limit, resp)
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
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};
		var where = "";


		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			getById(req, resp)
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
//  DELETE /tidbitTypes/{id}
//
router.delete(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Delete successful."
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

			if (req.body.name === undefined) {
				resp = formatResp(resp, undefined, 400, "Name required.");
				respond(resp, res, next);
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


//
//  POST /tidbitTypes/{id}/answers
//
router.post(`/:id/answers`, (req, res, next) => {
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

			if (req.body.answer === undefined) {
				resp = formatResp(resp, undefined, 400, "Answer required.");
				respond(resp, res, next);
			} else {

				createAnswer(req, resp)
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
//  GET /tidbitTypes/{id}/answers
//
router.get(`/:id/answers`, (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: "Success.",
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var where = "";


		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}


		//
		//	Only allow types to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			getAllAnswers(req.params.id, offset, limit, resp)
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
//  DELETE /tidbitTypes/{id}/answers/{aid}
//
router.delete(`/:id/answers/:aid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Delete successful."
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			removeAnswer(req, resp)
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
//  GET /tidbitTypes/{id}/answers/{aid}
//
router.get(`/:id/answers/:aid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			getAnswerById(req, resp)
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
//  PUT /tidbitTypes/{id}/answers/{aid}
//
router.put(`/:id/answers/:aid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if (req.body.answer === undefined) {
				resp = formatResp(resp, undefined, 400, "Answer required.");
				respond(resp, res, next);
			} else {

				updateAnswer(req, resp)
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