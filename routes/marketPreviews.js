'use strict'

const express = require('express')
const router = express.Router()

const jwtUtils = require('../actions/jwtUtils')
const MarketPreviews = require('../actions/marketPreviews')
const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const sqlUtils = require('../utils/sqlUtils')

//  Get market preview by store id (GET)
router.get(`/`, jwtUtils.verifyToken, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.',
      data: {}
    }
    var whereInfo = {
      clause: '',
      values: []
    }

    if ((req.get('x-app-type') === 'EXT') && (req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
      req.params.id = req.decoded.memberId

      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.id = ?', req.params.id)
      whereInfo = sqlUtils.appendWhere(whereInfo, 'mp.active = ?', 'Y')

      MarketPreviews.getMarketPreviews(whereInfo, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined)
        })
    } else {
      response.respond(resp, res, next, ['id'], 400, 'Must be logged in to view this information.')
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined)
  }
})

module.exports = router
