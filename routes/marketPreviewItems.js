'use strict'

const express = require('express')
const router = express.Router()
const check = require('check-types')

const jwtUtils = require('../actions/jwtUtils')
const MarketPreviewItems = require('../actions/marketPreviewItems')
const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const sqlUtils = require('../utils/sqlUtils')

//  Get market preview by store id (GET)
router.get(`/:handle`, jwtUtils.verifyToken, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.',
      metaData: {},
      data: {}
    }
    var whereInfo = {
      clause: '',
      values: []
    }
    var limit = 10
    var offset = 0

    // Member must be logged in to see information.  Only accessible externally since it is member specific data.
    if ((req.get('x-app-type') === 'EXT') && (req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
      req.params.id = req.decoded.memberId

      // We have two cases: verify an inactive preview before going live and a member viewing their active store preview.
      if (req.query.marketPreviewInstanceId !== undefined) {
        if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
          limit = parseInt(req.query.limit)
        }
        if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
          offset = parseInt(req.query.offset)
        }
        // validate status
        if ((req.query.status) && !((req.query.status.toUpperCase() === 'LIVE') || (req.query.status.toUpperCase() === 'PUBLISH') || (req.query.status.toUpperCase() === 'SOLD') || (req.query.status.toUpperCase() === 'ACTIVE') || (req.query.status.toUpperCase() === 'INACTIVE'))) {
          response.respond(resp, res, next, ['id'], 400, 'Status must be "LIVE", "PUBLISH", "SOLD", "ACTIVE" or "INACTIVE"')
        } else {
          whereInfo = sqlUtils.appendWhere(whereInfo, 'mp.handle = ?', req.params.handle)
          whereInfo = sqlUtils.appendWhere(whereInfo, 'mpi.id = ?', req.query.marketPreviewInstanceId)
          if (req.query.status) {
            whereInfo = sqlUtils.appendWhere(whereInfo, 'p.status = ?', req.query.status)
          }
          MarketPreviewItems.getMarketPreviewItems(whereInfo, offset, limit, resp)
            .then((resp) => {
              response.respond(resp, res, next)
            })
            .catch((e) => {
              logUtils.routeExceptions(e, req, res, next, resp, undefined)
            })
        }
      } else {
      // verify member should see this preview
        whereInfo = sqlUtils.appendWhere(whereInfo, 'm.id = ?', req.params.id)
        whereInfo = sqlUtils.appendWhere(whereInfo, 'mp.handle = ?', req.params.handle)
        MarketPreviewItems.verifyMemberMarketPreviewConnection(whereInfo, resp)
          .then((resp) => {
          // When verified, pull the preview:
            if (resp.data.memberMarketPreviewConnection !== undefined) {
              delete resp.data.memberMarketPreviewConnection
              whereInfo.clause = ''
              whereInfo.values = []
              if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
                limit = parseInt(req.query.limit)
              }
              if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
                offset = parseInt(req.query.offset)
              }
              // validate status
              if ((req.query.status) && !((req.query.status.toUpperCase() === 'LIVE') || (req.query.status.toUpperCase() === 'PUBLISH') || (req.query.status.toUpperCase() === 'SOLD') || (req.query.status.toUpperCase() === 'ACTIVE') || (req.query.status.toUpperCase() === 'INACTIVE'))) {
                response.respond(resp, res, next, ['id'], 400, 'Status must be "LIVE", "PUBLISH", "SOLD", "ACTIVE" or "INACTIVE"')
              } else {
                whereInfo = sqlUtils.appendWhere(whereInfo, 'mp.handle = ?', req.params.handle)
                whereInfo = sqlUtils.appendWhere(whereInfo, 'mp.active = ?', 'Y')
                whereInfo = sqlUtils.appendWhere(whereInfo, 'mpi.active = ?', 'Y')
                if (req.query.status) {
                  whereInfo = sqlUtils.appendWhere(whereInfo, 'p.status = ?', req.query.status)
                }

                MarketPreviewItems.getMarketPreviewItems(whereInfo, offset, limit, resp)
                  .then((resp) => {
                    response.respond(resp, res, next)
                  })
                  .catch((e) => {
                    logUtils.routeExceptions(e, req, res, next, resp, undefined)
                  })
              }
            } else {
              response.respond(resp, res, next)
            }
          })
          .catch((e) => {
            logUtils.routeExceptions(e, req, res, next, resp, undefined)
          })
      }
    } else {
      response.respond(resp, res, next, ['id'], 400, 'Must be logged in to view this information.')
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined)
  }
})

module.exports = router
