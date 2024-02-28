'use strict';

const moment = require('moment-timezone');
const express = require('express');
const router = express.Router();

const {
	getActivity,
	getTotals
} = require('../actions/crcActivity');

const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  GET /crcActivity
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var dateFilterColumn = 'p.date_created';
		var dateStart = moment();
		var dateEnd = moment();
		var id;
		var internalFlag = true;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};
		var whereInfo = {
			clause: '',
			values: []
		};


		//	Determine if this is an internal user or not and capture their id.
		if ((req.get('x-app-type') === 'EXT') &&
			(req.decoded !== undefined) &&
			(req.decoded.vendorId != undefined)) {
			req.query.vendorId = req.decoded.vendorId;
			internalFlag = false;
		}
		else if ((req.get('x-app-type') === 'INT') &&
			(req.decoded !== undefined) &&
			(req.decoded.userId != undefined)) {
				id = req.decoded.userId;
				internalFlag = true;
		}


		if ((req.query.type === undefined) ||
			((req.query.type !== 'RECEIVED') && (req.query.type !== 'RETURNED') && (req.query.type !== 'SOLD') && (req.query.type !== 'DISPOSED') && (req.query.type !== 'TOTALS'))) {
			respond(resp, res, next, ["data"], 400, 'Type must be specified as RECEIVED, RETURNED, SOLD, DISPOSED or TOTALS.');
		}
		else if ((req.query.dateCreatedStart === undefined) || (req.query.dateCreatedEnd === undefined)) {
			respond(resp, res, next, ["data"], 400, 'Required: dateCreatedStart and dateCreatedEnd.');
		}
		else if ((req.query.source) && (req.query.source !== 'outlet') && (req.query.source !== 'rushmarket')) { 
			respond(resp, res, next, ["data"], 400, `Source must be 'outlet' or 'rushmarket'`);
		} else {

			if (req.query.type === 'DISPOSED') {
				dateFilterColumn = 'COALESCE(pal.date_created,p.date_created)';
			}
			else if (req.query.type !== 'RECEIVED') {
				dateFilterColumn = 'line_item_date_created';
			}

			if (req.query.vendorId) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'm.vendor_id = ?', req.query.vendorId);
			}

			if (req.query.dateCreatedStart) {
				if (req.query.dateCreatedStart.length > 10) {
					dateStart = moment(req.query.dateCreatedStart.substring(0, 10) + ' ' + req.query.dateCreatedStart.substring(11, 19));
					whereInfo = sqlUtils.appendWhere(whereInfo, dateFilterColumn + ' >= ?', req.query.dateCreatedStart.substring(0, 10) + ' ' + req.query.dateCreatedStart.substring(11, 19));
				} else {
					dateStart = moment(req.query.dateCreatedStart.substring(0, 10) + ' 00:00:00');
					whereInfo = sqlUtils.appendWhere(whereInfo, dateFilterColumn + ' >= ?', req.query.dateCreatedStart.substring(0, 10) + ' 00:00:00');
				}
			}


			if (req.query.dateCreatedEnd) {
				if (req.query.dateCreatedEnd.length > 10) {
					dateEnd = moment(req.query.dateCreatedEnd.substring(0, 10) + ' ' + req.query.dateCreatedEnd.substring(11, 19));
					whereInfo = sqlUtils.appendWhere(whereInfo, dateFilterColumn + ' <= ?', req.query.dateCreatedEnd.substring(0, 10) + ' ' + req.query.dateCreatedEnd.substring(11, 19));
				} else {
					dateEnd = moment(req.query.dateCreatedEnd.substring(0, 10) + ' 00:00:00');
					whereInfo = sqlUtils.appendWhere(whereInfo, dateFilterColumn + ' <= ?', req.query.dateCreatedEnd.substring(0, 10) + ' 00:00:00');
				}
			}

			// console.log(dateStart.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss'));
			// console.log(dateEnd.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss'));
			// console.log(dateEnd.diff(dateStart, 'days'));

			if (dateEnd.diff(dateStart, 'days') > 366) {
				respond(resp, res, next, ["data"], 400, 'Date range must be <= one year.');
			} else {
				if (req.query.type !== 'TOTALS') {
					await getActivity(req.query.type, whereInfo, req.query.vendorId, req.query.source, req.query.dateCreatedStart, req.query.dateCreatedEnd, resp);
				}
				else {
					await getTotals(req.query.vendorId, dateStart, dateEnd, req.query.source, resp);
				}
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})






module.exports = router