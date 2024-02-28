'use strict'

const check = require('check-types');
const express = require('express');
const router = express.Router();

const { getAll, getAllChildren } = require('../actions/categories');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const { respond } = require('../utils/response');


//  Get categories data for a hamburger menu
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		if ((req.query.storeId === undefined) || (!check.integer(parseInt(req.query.storeId)))) {
			respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "storeId"));
		} else {
			resp = await getAll(req, resp);
			respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


// Get all child categories with category1 (parent) and category2 (child)
router.get(`/children`, async (req, res, next) => {
	try {
		const resp = {
			statusCode: 200,
			message: 'Success.',
			data: {
				children: await getAllChildren()
			}
		};
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, {}, undefined);
	}
});


module.exports = router