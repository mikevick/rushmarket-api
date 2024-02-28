'use strict'

const check = require('check-types')
const express = require('express')
const router = express.Router()

const productDisposalFeeRules = require('../actions/productDisposalFeeRules')
const jwtUtils = require('../actions/jwtUtils');
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

    if (req.get('x-app-type') !== 'INT') {
      response.respond(resp, res, next, ["id"], 403, "Access denied.");
    } else {

      if (req.body.name === undefined) {
        response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'name'))
      } else {
        productDisposalFeeRules.create(req.body.name, req.body.active, req.body.vendorId, req.body.boxSizeMin, req.body.boxSizeMax, req.body.disposalFee, resp)
          .then((resp) => {
            response.respond(resp, res, next)
          })
          .catch((e) => {
            logUtils.routeExceptions(e, req, res, next, resp, undefined)
          })
      }
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


    if (req.get('x-app-type') !== 'INT') {
      response.respond(resp, res, next, ["id"], 403, "Access denied.");
    } else {


      // create setInfo
      if (req.body.name) {
        setInfo = sqlUtils.appendSet(setInfo, 'name = ?', req.body.name)
      }
      if (req.body.active) {
        setInfo = sqlUtils.appendSet(setInfo, 'active = ?', req.body.active)
      }
      if (req.body.vendorId) {
        setInfo = sqlUtils.appendSet(setInfo, 'vendor_id = ?', req.body.vendorId)
      }
      if (req.body.boxSizeMin >= 0) {
        setInfo = sqlUtils.appendSet(setInfo, 'box_size_min = ?', req.body.boxSizeMin)
      }
      if (req.body.boxSizeMax > 0) {
        setInfo = sqlUtils.appendSet(setInfo, 'box_size_max = ?', req.body.boxSizeMax)
      }
      if (req.body.disposalFee) {
        setInfo = sqlUtils.appendSet(setInfo, 'disposal_fee = ?', req.body.disposalFee)
      }

      productDisposalFeeRules.updateById(req.params.id, setInfo, resp)
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

//  Get all product cost rules (GET)
router.get(`/`, jwtUtils.verifyToken, (req, res, next) => {
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

    //	Internals can't get current, externals can only get current.
    if (((req.get('x-app-type') === 'EXT') && (req.query.vendorId != 'current')) ||
      ((req.get('x-app-type') === 'INT') && (req.query.vendorId === 'current'))) {
      response.respond(resp, res, next, ["data"], 404, "Vendor not found.");
    } else {

      //	If this is an external API call attempting to get current, try to retrieve the member ID using token.
      if ((req.get('x-app-type') === 'EXT') &&
        (req.query.vendorId === 'current') &&
        (req.decoded != undefined) &&
        (req.decoded.vendorId != undefined)) {
        req.query.vendorId = req.decoded.vendorId;
      }


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

      if (req.query.boxSize) {
        whereInfo = sqlUtils.appendWhere(whereInfo, '? BETWEEN box_size_min AND box_size_max', req.query.boxSize)
      }

      if (req.query.disposalFee) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'disposal_fee = ?', req.query.disposalFee)
      }

      productDisposalFeeRules.getAll(whereInfo, offset, limit, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined)
        })
    }
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

    //	Internals can't get current, externals can only get current.
    if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
      ((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
      respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
    } else {

      //	If this is an external API call attempting to get current, try to retrieve the member ID using token.
      if ((req.get('x-app-type') === 'EXT') &&
        (req.params.id === 'current') &&
        (req.decoded != undefined) &&
        (req.decoded.vendorId != undefined)) {
        req.params.id = req.decoded.vendorId;
      }

      productDisposalFeeRules.getById(req.params.id, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined)
        })
    }
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

    if (req.get('x-app-type') !== 'INT') {
      response.respond(resp, res, next, [], 403, "Access denied.");
    } else {


      productDisposalFeeRules.remove(req.params.id, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, ['id'])
        })
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp)
  }
})

module.exports = router