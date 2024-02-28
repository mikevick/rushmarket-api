'use strict'

const check = require('check-types')
const express = require('express')
const router = express.Router()

const BubbleStores = require('../actions/bubbleStores')
const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const memberText = require('../utils/memberTextUtils')
const sqlUtils = require('../utils/sqlUtils')

// Create bubble sample (POST)
router.post(`/`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 201,
      message: 'Success.',
      id: 0
    }

    if (req.body.bubbleId === undefined || req.body.shopifyStoreId === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'bubbleId, shopifyStoreId'))
    } else {
      BubbleStores.create(req.body.bubbleId, req.body.shopifyStoreId, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined)
        })
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id'])
  }
})

// Update Bubble (PUT)
router.put('/:id', (req, res, next) => {
  try {
    var valid = true
    var resp = {
      statusCode: 200,
      message: 'Success.',
      id: 0
    }
    var setInfo = {
      clause: '',
      values: []
    }

    // validation: must be changing status or name values and status must be active or inactive
    if (!(req.body.bubbleId || req.body.shopifyStoreId)) {
      response.respond(resp, res, next, ['id'], 400, 'Please update bubble id or shopify store id for the Bubble - store connection')
      valid = false
    }
    if (valid) {
      // create setInfo
      if (req.body.bubbleId) {
        setInfo = sqlUtils.appendSet(setInfo, 'bubble_id = ?', req.body.bubbleId)
      }
      if (req.body.shopifyStoreId) {
        setInfo = sqlUtils.appendSet(setInfo, 'shopify_store_id = ?', req.body.shopifyStoreId)
      }

      BubbleStores.updateById(req.params.id, setInfo, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined)
        })
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id'])
  }
})

//  Get all bubble samples (GET)
router.get(`/`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.',
      metaData: {
        totalCount: 0
      },
      data: {}
    }
    var whereInfo = {
      clause: '',
      values: []
    }

    // limit and offset defaults and query overrides
    var limit = 10
    var offset = 0

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit)
    }
    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset)
    }

    // add where clause to select by city name and bubble id
    if (req.query.shopifyStoreId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'shopify_store_id = ?', req.query.shopifyStoreId)
    }
    if (req.query.bubbleId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'bubble_id = ?', req.query.bubbleId)
    }

    BubbleStores.getAll(whereInfo, offset, limit, resp)
      .then((resp) => {
        response.respond(resp, res, next)
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined)
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined)
  }
})

//  Get bubble sample by id (GET)
router.get(`/:id`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.',
      data: {}
    }

    BubbleStores.getById(req.params.id, resp)
      .then((resp) => {
        response.respond(resp, res, next)
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined)
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined)
  }
})

// delete bubble by id (DELETE)
router.delete(`/:id`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.'
    }

    BubbleStores.remove(req.params.id, resp)
      .then((resp) => {
        response.respond(resp, res, next)
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, ['id'])
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp)
  }
})

module.exports = router
