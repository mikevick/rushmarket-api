'use strict'

const check = require('check-types')
const express = require('express')
const router = express.Router()

const productCostRules = require('../actions/productCostRules')
const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const memberText = require('../utils/memberTextUtils')
const sqlUtils = require('../utils/sqlUtils')

// Create product cost rule (POST)
router.post(`/`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 201,
      message: 'Success.',
      id: 0
    }

    if (req.body.name === undefined || req.body.vendorId === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'name, vendorId'))
    } else {
      productCostRules.create(req.body.name, req.body.active, req.body.vendorId, req.body.conditionId, req.body.conditionName, req.body.conditionValue, req.body.costBase, resp)
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

// Update product cost rule (PUT)
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

    // create setInfo
    // req.body.name, req.body.active, req.body.categoryId, req.body.damageLevel, req.body.damageValue
    if (req.body.name) {
      setInfo = sqlUtils.appendSet(setInfo, 'name = ?', req.body.name)
    }
    if (req.body.active) {
      setInfo = sqlUtils.appendSet(setInfo, 'active = ?', req.body.active)
    }
    if (req.body.vendorId) {
      setInfo = sqlUtils.appendSet(setInfo, 'vendor_id = ?', req.body.vendorId)
    }
    if (req.body.conditionId) {
      setInfo = sqlUtils.appendSet(setInfo, 'condition_id = ?', req.body.conditionId)
    }
    if (req.body.conditionName) {
      setInfo = sqlUtils.appendSet(setInfo, 'condition_name = ?', req.body.conditionName)
    }
    if (req.body.conditionValue) {
      setInfo = sqlUtils.appendSet(setInfo, 'condition_value = ?', req.body.conditionValue)
    }
    if (req.body.costBase) {
      setInfo = sqlUtils.appendSet(setInfo, 'cost_base = ?', req.body.costBase)
    }

    productCostRules.updateById(req.params.id, setInfo, resp)
      .then((resp) => {
        response.respond(resp, res, next)
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined)
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id'])
  }
})

//  Get all product cost rules (GET)
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

    // add where clause to select by name
    if (req.query.name) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'name LIKE ?', '%' + req.query.name + '%')
    }

    if (req.query.active) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'active = ?', req.query.active)
    }

    if (req.query.vendorId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'vendor_id = ?', req.query.vendorId)
    }

    if (req.query.conditionName) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'condition_name = ?', req.query.conditionName)
    }

    productCostRules.getAll(whereInfo, offset, limit, resp)
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

//  Get product cost rule by id (GET)
router.get(`/:id`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.',
      data: {}
    }

    productCostRules.getById(req.params.id, resp)
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

// delete product cost rule by id (DELETE)
router.delete(`/:id`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.'
    }

    productCostRules.remove(req.params.id, resp)
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
