'use strict'

const express = require('express')
const router = express.Router()

const { createProduct, updateProduct } = require('../actions/products')
const jwtUtils = require('../actions/jwtUtils')

const logUtils = require('../utils/logUtils')
const memberText = require('../utils/memberTextUtils')
const { formatResp, respond } = require('../utils/response')

//
//  POST /products/process/receive
//
router.post('/', jwtUtils.verifyToken, async (req, res, next) => {
  let resp = {
    statusCode: 201,
    message: 'Product Received',
    nextStep: null,
  }

  try {
    let userId = null
    let userType = null

    if (
      req.get('x-app-type') === 'EXT' &&
      (req.decoded.identity === undefined ||
        (req.decoded.identity.type !== 'PARTNER' && req.decoded.identity.type !== 'PARTNERUSER'))
    ) {
      respond(resp, res, next, ['metaData', 'data'], 403, 'Access denied.')
    } else if (
      (req.body.vendorSupplierCode === undefined && req.body.manifestId === undefined) ||
      req.body.vendorSku === undefined ||
      req.body.rushSku === undefined ||
      req.body.storeId === undefined ||
      req.body.trackingNumber === undefined ||
      req.body.isTrash === undefined ||
      req.body.notes === undefined
    ) {
      resp = formatResp(
        resp,
        undefined,
        400,
        memberText
          .get('MISSING_REQUIRED')
          .replace('%required%', 'vendorSupplierCode or manifestId, vendorSku, rushSku, storeId, trackingNumber, isTrash, notes')
      )
      respond(resp, res, next)
    } else {
      //
      //	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
      //
      if (req.get('x-app-type') === 'EXT' && req.decoded !== undefined && req.decoded.identity !== undefined) {
        userId = req.decoded.identity.userId ? req.decoded.identity.userId : req.decoded.identity.partnerId
        userType = req.decoded.identity.type
      } else if (req.get('x-app-type') === 'INT') {
        userId = req.decoded.userId
        userType = 'INTERNAL'
      }

      await createProduct(userId, userType, req, resp)
      respond(resp, res, next)
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp)
  }
})

//
//  PUT /products/process/receive/{rushSku}
//
router.put(`/:rushSku`, jwtUtils.verifyToken, async (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Product Received',
  }

  try {
    let userId = null
    let userType = null

    if (
      req.get('x-app-type') === 'EXT' &&
      (req.decoded.identity === undefined ||
        (req.decoded.identity.type !== 'PARTNER' && req.decoded.identity.type !== 'PARTNERUSER'))
    ) {
      respond(resp, res, next, ['metaData', 'data'], 403, 'Access denied.')
    } else if (
      req.body.trackingNumber === undefined ||
      req.body.isTrash === undefined ||
      req.body.notes === undefined
    ) {
      resp = formatResp(
        resp,
        undefined,
        400,
        memberText
          .get('MISSING_REQUIRED')
          .replace('%required%', 'trackingNumber, isTrash, notes')
      )
      respond(resp, res, next)
    } else {
      //
      //	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
      //
      if (req.get('x-app-type') === 'EXT' && req.decoded !== undefined && req.decoded.identity !== undefined) {
        userId = req.decoded.identity.userId ? req.decoded.identity.userId : req.decoded.identity.partnerId
        userType = req.decoded.identity.type
      } else if (req.get('x-app-type') === 'INT') {
        userId = req.decoded.userId
        userType = 'INTERNAL'
      }

      req.body.rushSku = req.params.rushSku
      await updateProduct(userId, userType, req, resp)
      respond(resp, res, next)
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp)
  }
})

module.exports = router
