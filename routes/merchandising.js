'use strict'

const check = require('check-types');
const express = require('express');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');
const memberText = require('../utils/memberTextUtils');
const sqlUtils = require('../utils/sqlUtils');



const {
	get,
	getTurbo
} = require('../actions/merchandising');




//  Get bubble merch data for a shopify store id
router.get(`/`, async (req, res, next) => {
	try {
		var includeArchived = false;
		var includeProductConditions = true;
		var limit = undefined;
		var productLimit = undefined;
		var offset = undefined;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}
		var order = null
		var sortBy = '';


		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.productLimit) && (check.integer(parseInt(req.query.productLimit)))) {
			productLimit = parseInt(req.query.productLimit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}

		if ((req.query.includeArchived !== undefined) && ((req.query.includeArchived === true) || (req.query.includeArchived === "true"))) {
			includeArchived = true;
		}

		if ((req.query.includeProductConditionsFlag !== undefined) && ((req.query.includeProductConditionsFlag === false) || (req.query.includeProductConditionsFlag === "false"))) {
			includeProductConditions = false;
		}

		if (req.query.sortBy) {
			sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['lastRefresh', 'nextRefresh', 'clusterDateCreated', 'clusterDatePublished']);

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
				order = "ORDER BY " + sortBy + " l.name";
			}
			else {
				order = "ORDER BY  " + sortBy + " l.name, lc.position, lc.id";
			}

			//	Need a zip or an authtoken to determine sku eligibility.
			if ((req.query.zip === undefined) && (req.get('x-access-token') === undefined)) {
				respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "zip, authToken"));
			} else {
				if (req.query.zip !== undefined) {
					if (req.query.noturbo !== undefined) {
						resp = await get(req, resp, offset, limit, productLimit, order, req.query.bypassGDE, includeArchived, includeProductConditions);
					}
					else {
						resp = await getTurbo(req, resp, offset, limit, productLimit, order, req.query.bypassGDE, includeArchived, includeProductConditions);
					}
				}
				else if (req.get('x-access-token') !== undefined) {
					resp = await jwtUtils.verifyTokenInline(req, resp);

					if ((req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
						resp = await get(req, resp, offset, limit, order, req.query.bypassGDE); 
					}
				}
				respond(resp, res, next)
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


module.exports = router