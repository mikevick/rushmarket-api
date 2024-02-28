'use strict'

const check = require('check-types')
const express = require('express')
const router = express.Router()

const productFeedbackTypes = require('../actions/productFeedbackTypes')

const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const sqlUtils = require('../utils/sqlUtils')



//
//  Get Product Feedback Types
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}
		var sortBy = "sort_order ASC";
		var whereInfo = {
			clause: '',
			values: []
		}
		

		whereInfo = sqlUtils.appendWhere(whereInfo, "active = 'Y'");

		// limit and offset defaults and query overrides
		var limit = 1000
		var offset = 0

		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit)
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset)
		}

		if (req.query.sortBy) {
			sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['type', 'code', 'sortOrder']);

			if (sortBy === 'field') {
				respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
			} else if (sortBy === 'direction') {
				respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
			}
		}

		if ((sortBy != 'field') && (sortBy != 'direction')) {
			var resp = await productFeedbackTypes.getAll(whereInfo, sortBy, offset, limit, resp);
			response.respond(resp, res);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})



module.exports = router