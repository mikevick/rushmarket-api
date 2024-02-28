'use strict'

const check = require('check-types');
const express = require('express');
const router = express.Router();

const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');
const memberText = require('../utils/memberTextUtils');
const sqlUtils = require('../utils/sqlUtils');

const {
	getByStoreId
} = require('../actions/bubbleMerch');



//  Get bubble merch data for a shopify store id
router.get(`/`, async (req, res, next) => {
	try {
		var limit = undefined;
		var offset = undefined;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}
		var order = null;
		var sortBy = '';


		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}



		if (req.query.sortBy) {
			sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['lastRefresh', 'nextRefresh']);

			if (sortBy === 'field') {
				respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
			} else if (sortBy === 'direction') {
				respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
			} else {
				sortBy += ', ';
			}
		}

		if ((sortBy != 'field') && (sortBy != 'direction')) {

			if (limit === 0) {
				order = "ORDER BY l.store_id, " + sortBy + " l.name";
			}
			else {
				order = "ORDER BY l.store_id, " + sortBy + " l.name, lc.position, lcb.position";
			}

			//	Need a storeId, zip or an authtoken to determine sku eligibility.
			if ((req.query.storeId === undefined) || (!check.integer(parseInt(req.query.storeId)))) {
				respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "storeId"));
			} else {
				resp = await getByStoreId(req, resp, offset, limit, order);
				respond(resp, res, next)
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


module.exports = router