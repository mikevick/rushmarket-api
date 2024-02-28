'use strict'

const moment = require('moment-timezone')
const express = require('express')
const router = express.Router()

const { getActivity, getTotals } = require('../actions/partnerActivity')

const jwtUtils = require('../actions/jwtUtils')
const logUtils = require('../utils/logUtils')
const { respond } = require('../utils/response')
const sqlUtils = require('../utils/sqlUtils')

//
//  GET /partnerActivity
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
  try {
    var dateFilterColumn = 'p.date_created'
    var dateStart = moment()
    var dateEnd = moment()
    var id
    var internalFlag = true
    var resp = {
      statusCode: 200,
      message: 'Success.',
      data: {},
    }
    var whereInfo = {
      clause: '',
      values: [],
    }

    resp.data.disposalFeesFlag = false;

    //	Determine if this is an internal user or not and capture their id.
    if (((req.get('x-app-type') === 'INT') && !req.decoded.userId) || ((req.get('x-app-type') === 'EXT') && req.decoded.userId)) {
      respond(resp, res, next, undefined, 403, 'Access denied.');
    }
    else {

      if (req.get('x-app-type') === 'EXT' && (req.decoded !== undefined) && (req.decoded.identity.partnerId != undefined)) {
      
        req.query.partnerId = req.decoded.identity.partnerId
        if ((req.decoded.identity.type === 'PARTNER') && (req.query.facilityId === 'current')) {
          respond(resp, res, next, ["data"], 400, 'Invalid facility ID.');
          return;
        }
        req.query.facilityId = req.decoded.identity.facilityId ? req.decoded.identity.facilityId : req.query.facilityId
        internalFlag = false
      } else if (req.get('x-app-type') === 'INT' && req.decoded !== undefined && req.decoded.userId != undefined) {
        if ((!req.query.partnerId) || (req.query.partnerId === 'current')) { 
        respond(resp, res, next, ["data"], 400, 'Invalid partner ID.');
        return;
      }
      id = req.decoded.userId
      internalFlag = true
    }

      if (
        req.query.type === undefined ||
        (req.query.type !== 'TOTALS' &&
          req.query.type !== 'PROCESSED' &&
          req.query.type !== 'DISPOSED' &&
          req.query.type !== 'FULFILLMENT' &&
          req.query.type !== 'STORAGE')
      ) {
        respond(
          resp,
          res,
          next,
          ['data'],
          400,
          'Type must be specified as TOTALS, PROCESSED, DISPOSED, FULFILLMENT or STORAGE.'
        )
      } else if (req.query.dateStart === undefined || req.query.dateEnd === undefined) {
        respond(resp, res, next, ['data'], 400, 'Required: dateStart and dateEnd.')
      } else if (!req.query.partnerId) {
        respond(resp, res, next, ['data'], 400, 'Required: partnerId.')
      } else {
        if (req.query.type === 'DISPOSED' || req.query.type === 'PROCESSED') {
          dateFilterColumn = 'COALESCE(pal.date_created,p.date_created)'
        }
        else if (req.query.type === 'FULFILLMENT') {
          dateFilterColumn = 'oll.date_created'
        }
        else if (req.query.type === 'STORAGE') {
          dateFilterColumn = 's.month_beginning'
        }

        if (req.query.dateStart) {
          if (req.query.dateStart.length > 10) {
            dateStart = moment(req.query.dateStart.substring(0, 10) + ' ' + req.query.dateStart.substring(11, 19))
            whereInfo = sqlUtils.appendWhere(
              whereInfo,
              dateFilterColumn + ' >= ?',
              req.query.dateStart.substring(0, 10) + ' ' + req.query.dateStart.substring(11, 19)
            )
          } else {
            dateStart = moment(req.query.dateStart.substring(0, 10) + ' 00:00:00')
            whereInfo = sqlUtils.appendWhere(
              whereInfo,
              dateFilterColumn + ' >= ?',
              req.query.dateStart.substring(0, 10) + ' 00:00:00'
            )
          }
        }

        if (req.query.dateEnd) {
          if (req.query.dateEnd.length > 10) {
            dateEnd = moment(req.query.dateEnd.substring(0, 10) + ' ' + req.query.dateEnd.substring(11, 19))
            whereInfo = sqlUtils.appendWhere(
              whereInfo,
              dateFilterColumn + ' <= ?',
              req.query.dateEnd.substring(0, 10) + ' ' + req.query.dateEnd.substring(11, 19)
            )
          } else {
            dateEnd = moment(req.query.dateEnd.substring(0, 10) + ' 00:00:00')
            whereInfo = sqlUtils.appendWhere(
              whereInfo,
              dateFilterColumn + ' <= ?',
              req.query.dateEnd.substring(0, 10) + ' 00:00:00'
            )
          }
        }

        // console.log(dateStart.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss'));
        // console.log(dateEnd.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss'));
        // console.log(dateEnd.diff(dateStart, 'days'))

        if (dateEnd.diff(dateStart, 'days') > 366) {
          respond(resp, res, next, ['data'], 400, 'Date range must be <= one year.')
        } else {
          if (req.query.type !== 'TOTALS') {
            await getActivity(
              req.query.type,
              whereInfo,
              req.query.partnerId,
              req.query.facilityId,
              req.query.dateStart,
              req.query.dateEnd,
              resp
            )
          } else {
            await getTotals(req.query.partnerId, req.query.facilityId, req.query.dateStart, req.query.dateEnd, resp)
          }
          respond(resp, res, next)
        }
      }
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp)
  }
})

module.exports = router
