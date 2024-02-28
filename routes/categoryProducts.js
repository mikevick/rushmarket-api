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
	getCategoryProducts
} = require('../actions/categoryProducts');




//  Get categories products 
router.get(`/`, async (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		}
		var sortBy = 'p.freshness_score DESC';
		var clWhereInfo = {
			join: '',
			clause: '',
			values: []
		}
		var vcWhereInfo = {
			join: '',
			clause: 'WHERE 1=1 ',
			values: []
		}

		if ((req.query.categorySlug === undefined) || ((req.query.memberId === undefined) && (req.query.market === undefined))) {
			respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "categorySlug and memberId or market"));
		} else {

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}
					
			if ((req.query.color) && (req.query.color.trim().length > 0)) {
				vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, '(FIND_IN_SET(?, COALESCE(primary_color, color_specific)) > 0) ', [req.query.color]);
				clWhereInfo = sqlUtils.appendWhere(clWhereInfo, '(p.online_quick_sale != \'Y\' OR (p.online_quick_sale = \'Y\' AND (FIND_IN_SET(?, q.color) > 0)))', [req.query.color]);
			} else if (req.query.color !== undefined) {
				req.query.color = undefined;
			}

			if ((req.query.material) && (req.query.material.trim().length > 0)) {
				vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, '(FIND_IN_SET(?, COALESCE(primary_material, material_specific)) > 0)', [req.query.material]);
				clWhereInfo = sqlUtils.appendWhere(clWhereInfo, '(p.online_quick_sale != \'Y\' OR (p.online_quick_sale = \'Y\' AND (FIND_IN_SET(?, q.material) > 0)))', [req.query.material]);
			} else if (req.query.material !== undefined) {
				req.query.material = undefined;
			}

			if ((req.query.size) && (req.query.size.trim().length > 0)) {
				clWhereInfo = sqlUtils.appendWhere(clWhereInfo, '(p.online_quick_sale != \'Y\' OR (p.online_quick_sale = \'Y\' AND q.size = ?))', [req.query.size]);
			} else if (req.query.size !== undefined) {
				req.query.size = undefined;
			}			

			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['price', 'freshnessScore', 'dateOnline']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}

			if ((sortBy != 'field') && (sortBy != 'direction')) {
				resp = await getCategoryProducts(req, clWhereInfo, vcWhereInfo, req.query.sortBy, offset, limit, resp);
				respond(resp, res, next)
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


module.exports = router