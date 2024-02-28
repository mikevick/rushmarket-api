'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const {
	getAll,
	getUpdateTypes
} = require('../actions/vendorProductChangeLogs');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const {
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  GET /products
//
router.get(`/`, (req, res, next) => {
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
		};
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};
		var sortBy = 'date_created DESC';

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			if (req.query.vendorCatalogProductId) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'vendor_catalog_product_id = ?', req.query.vendorCatalogProductId);
			}

			if (req.query.updateType) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'update_type = ?', req.query.updateType);
			}

			if (req.query.updaterId) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'updater_id = ?', req.query.updaterId);
			}

			if (req.query.dateCreatedStart) {
				if (req.query.dateCreatedStart.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'date_created >= ?', req.query.dateCreatedStart.substring(0, 10) + ' ' + req.query.dateCreatedStart.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'date_created >= ?', req.query.dateCreatedStart.substring(0, 10) + ' 00:00:00');
				}
			}

			if (req.query.dateCreatedEnd) {
				if (req.query.dateCreatedEnd.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'date_created <= ?', req.query.dateCreatedEnd.substring(0, 10) + ' ' + req.query.dateCreatedEnd.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'date_created <= ?', req.query.dateCreatedEnd.substring(0, 10) + ' 00:00:00');
				}
			}

			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['dateCreated']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}

			if ((sortBy != 'field') && (sortBy != 'direction')) {
				getAll(whereInfo, sortBy, offset, limit, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ['id']);
					})
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
//  GET /vendorProductChangeLogs/updateTypes
//
router.get(`/updateTypes`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};


		await getUpdateTypes(resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})




module.exports = router