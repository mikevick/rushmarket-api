'use strict';

const express = require('express');
const router = express.Router();

const FileStorageContexts = require('../models/fileStorageContexts');

const fileUtils = require('../utils/fileUtils');
const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');




//
//  GET /fileStorageContexts
//
router.get(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success"
		}

		//
		//	Only allow texts to be reloaded for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["id"], 403, "Access denied.");
		} else {


			FileStorageContexts.getAll(req.params.id)
				.then((rows) => {
					resp.data = rows;
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /fileStorageContexts/{id}
//
router.get(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success"
		}

		//
		//	Only allow texts to be reloaded for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["id"], 403, "Access denied.");
		} else {


			FileStorageContexts.get(req.params.id)
				.then((keyInfo) => {
					if ((keyInfo === undefined) || (keyInfo === null) || (keyInfo.length === 0)) {
						resp.statusCode = 404;
						resp.message = "Not found.";
					} else {
						resp.data = keyInfo;
					}
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /fileStorageContexts
//
router.post(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			id: 0,
			message: "Success"
		}

		//
		//	Only allow texts to be reloaded for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["id"], 403, "Access denied.");
		} else {


			if ((req.body.name === undefined) || (req.body.baseUri === undefined) || (req.body.baseFolder === undefined) || (req.body.keys.account === undefined) || (req.body.keys.accountKey === undefined)) {
				resp.statusCode = 400;
				resp.message = memberText.get("MISSING_REQUIRED").replace('%required%', "name, baseUri, baseFolder, account, accountKey");
				res.status(400)
				res.send(resp);
			} else {
				FileStorageContexts.store(req.body)
					.then((id) => {
						resp.id = id;
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp);
					});
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /fileStorageContexts/reload
//
router.post(`/reload`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Reloaded",
			count: 0
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
			fileUtils.loadContexts().then((contexts) => {
				resp.count = contexts.length;
				respond(resp, res, next);
			})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





module.exports = router;