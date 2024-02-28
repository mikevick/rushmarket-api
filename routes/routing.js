'use strict'

const express = require('express')
const router = express.Router()

const gdeActions = require('../actions/gde')
const jwtUtils = require('../actions/jwtUtils')
const ltlReturnsActions = require('../actions/ltlReturns')

const GDE = require('../models/gdeModel')
const Stores = require('../models/stores')
const Users = require('../models/users')
const Vendors = require('../models/vendors')
const VendorSkus = require('../models/vendorSkus')
const ZipToCities = require('../models/zipToCity')

const { sendEmail } = require('../utils/comms')
const logUtils = require('../utils/logUtils')
const memberText = require('../utils/memberTextUtils')
const { respond, formatResp } = require('../utils/response')
const { getUserIdAndType } = require('../utils/userUtils')

const validStatusValues = ['New', 'Estimated', 'Approved', 'Declined', 'Scheduled', 'Picked Up', 'Delivered']
const validConditionValues = ['Like New', 'Minor Damage', 'Major Damage']
const validBooleanValues = ['Y', 'N']

//
// GET /routing/nearestRrc
//
router.get('/nearestRrc', jwtUtils.verifyToken, async (req, res, next) => {
  try {
    const { vendorSku, zipCode } = req.query

    //	Internals can't get current, externals can only get current.
    if ((req.get('x-app-type') === 'EXT' && req.query.vendorId !== 'current') ||
      (req.get('x-app-type') === 'INT' && req.query.vendorId === 'current')) {
      respond({}, res, next, [], 404, memberText.get("MEMBER_404"))
      return
    }

    //	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
    let vendorId = req.query.vendorId
    if (req.get('x-app-type') === 'EXT' && req.query.vendorId === 'current' && typeof req.decoded?.vendorId !== 'undefined') {
      vendorId = req.decoded.vendorId
    }

    const { userType } = getUserIdAndType(req)

    const newVendorCatalogProduct = typeof req.query.isValidVendorSku !== 'undefined' && req.query.isValidVendorSku !== 'false'

    const zipToCity = zipCode ? await ZipToCities.getByZipCode(zipCode) : null
    if (!zipToCity) {
      respond({}, res, next, [], 404, `Zip code [${zipCode}] is invalid`)
      return
    }

    const vendors = await Vendors.getById(vendorId)
    const vendor = vendors && vendors.length ? vendors[0] : null
    if (!vendor) {
      throw new Error("Vendor not found")
    }

    const vendorProducts = vendorId && vendorSku ? await VendorSkus.getByVendor(vendorId, vendorSku) : null
    const vendorProduct = vendorProducts && vendorProducts.length ? vendorProducts[0] : null

    if (!vendorProduct) {
      if (!newVendorCatalogProduct) {
        respond({}, res, next, [], 404, `Vendor SKU [${vendorSku}] is invalid`)
        return
      }

      const buyers = await Users.getById(vendor.buyerId)
      const buyer = buyers && buyers.length ? buyers[0] : null
      if (!buyer) {
        throw new Error("Vendor buyer not found")
      }

      const email = {
        from: 'vendorsupport@rushrecommerce.com',
        to: buyer.email,
        subject: 'Time Sensitive:  Return Routed - Missing SKU in VC',
        plainText: 'Hello,\n\n' +
          'A product was just routed to one of our recommerce centers and it doesn’t exist in our Vendor Catalog.\n\n' +
          `Can you please work with ${vendor.name} to get the product data for this SKU: ${vendorSku} and have the ` +
          'product created as quickly as possible.',
        htmlText: '<p>Hello,</p>' +
          '<p>A product was just routed to one of our recommerce centers and it doesn’t exist in our Vendor Catalog.</p>' +
          `<p>Can you please work with ${vendor.name} to get the product data for this SKU: <strong>${vendorSku}</strong> ` +
          'and have the product created as quickly as possible.</p>'
      }

      await sendEmail(email.to, email.subject, email.plainText, email.htmlText, email.from)
    }

    // Verify that this product can ship out of the metro that it's in
    const routingDecision = vendorProduct && await gdeActions.checkShipability(zipCode, zipToCity, vendor, vendorProduct, userType)
    const cannotShipFromCurrentMetro = routingDecision && routingDecision.label !== 'NEAREST_RRC'

    // Decide where the product should be routed
    // 1) If the product can't ship from the metro it's in, route to Omaha.
    // 2) If the request sends an e-mail to create a new vendor catalog product, route to the nearest owned RRC
    // 3) Otherwise, route to the nearest RRC (owned or not)
    const destinationStoreId = cannotShipFromCurrentMetro ? routingDecision.storeId :
      newVendorCatalogProduct ? zipToCity.nearestOwnedRrcStoreId :
        zipToCity.nearestRrcStoreId

    const destinationStores = destinationStoreId && await Stores.getById(destinationStoreId)
    const destinationStore = destinationStores && destinationStores.length ? destinationStores[0] : null
    if (!destinationStore) {
      respond({}, res, next, [], 404, `Nearest RRC for zip code [${zipCode}] not found`)
      return
    }

    // if the GDE shipability check didn't make the routing decision, log the fallback decision here.
    // typically happens if it's an unknown SKU
    if (!routingDecision) {
      GDE.logRoutingDecision(
        vendorId,
        vendorSku,
        zipCode,
        destinationStoreId,
        'SKU NOT FOUND',
        'No data',
        userType === 'INTERNAL' ? 'Y' : 'N')
    }

    const resp = {
      statusCode: 200,
      data: destinationStore
    }
    if (req.get('x-app-type') !== 'INT') {
      delete resp.data.shopifyLocationId
      delete resp.data.type
    }

    respond(resp, res, next)
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, {}, [])
  }
})

//
// POST /routing/ltl/{vendorId}
//
router.post('/ltl/:vendorId', jwtUtils.verifyToken, async (req, res, next) => {
  try {
    //	Internals can't get current, externals can only get current.
    if ((req.get('x-app-type') === 'EXT' && req.params.vendorId !== 'current') ||
      (req.get('x-app-type') === 'INT' && req.params.vendorId === 'current')) {
      respond({}, res, next, [], 404, memberText.get("MEMBER_404"))
      return
    }

    //	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
    let vendorId = req.params.vendorId
    if (req.get('x-app-type') === 'EXT' && req.params.vendorId === 'current' && typeof req.decoded?.vendorId !== 'undefined') {
      vendorId = req.decoded.vendorId
    }

    const { userId, userType } = getUserIdAndType(req)

    const {
      customerAddress1,
      customerAddress2,
      customerCity,
      customerEmail,
      customerFirstName,
      customerLastName,
      customerPhone,
      customerPhoneExt,
      customerState,
      customerZip,
      rma,
      ltlReturnItems,
    } = req.body

    if (!customerEmail || !customerFirstName || !customerLastName || !customerAddress1 || !customerCity || !customerState || !customerZip
      || !customerPhone || !rma || !ltlReturnItems || !Array.isArray(ltlReturnItems) || ltlReturnItems.length === 0) {
      const missingResp = formatResp({}, [], 400, memberText.get('MISSING_REQUIRED')
        .replace('%required%', 'customerEmail, customerFirstName, customerLastName, customerAddress1, customerCity, customerState, customerZip, customerPhone, rma, ltlReturnItems'))
      respond(missingResp, res, next)
      return
    }

    if (typeof customerState !== 'string' || !/[A-Z]{2}/.test(customerState)) {
      respond({}, res, next, [], 400, `invalid value for customerState`)
      return
    }

    if (typeof customerZip !== 'string' || !/\d{5}/.test(customerZip)) {
      respond({}, res, next, [], 400, `invalid value for customerZip`)
      return
    }

    if (typeof customerPhone !== 'string' || !/\d{10}/.test(customerPhone)) {
      respond({}, res, next, [], 400, `invalid value for customerPhone`)
      return
    }

    const invalidLtlReturnItem = ltlReturnItems.find(({ vendorSku, onPallet, condition, notes }) =>
      !vendorSku ||
      (onPallet && !validBooleanValues.includes(onPallet)) ||
      !validConditionValues.includes(condition) ||
      (['Minor Damage', 'Major Damage'].includes(condition) && !notes)
    )
    if (invalidLtlReturnItem) {
      respond({}, res, next, [], 400, `invalid value for ltlReturnItems`)
      return
    }

    const resp = {
      statusCode: 201,
      message: 'Created'
    }

    await ltlReturnsActions.create({
      customerAddress1,
      customerAddress2,
      customerCity,
      customerEmail,
      customerFirstName,
      customerLastName,
      customerPhone,
      customerPhoneExt,
      customerState,
      customerZip,
      rma,
      userId,
      userType,
      vendorId,
      ltlReturnItems,
    }, req.body)
    respond(resp, res, next)
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, {}, [])
  }
})

//
// PUT /routing/ltl/{vendorId}/{id}
//
router.put('/ltl/:vendorId/:id', jwtUtils.verifyToken, async (req, res, next) => {
  try {
    //	Internals can't get current, externals can only get current.
    if ((req.get('x-app-type') === 'EXT' && req.params.vendorId !== 'current') ||
      (req.get('x-app-type') === 'INT' && req.params.vendorId === 'current')) {
      respond({}, res, next, [], 404, memberText.get("MEMBER_404"))
      return
    }

    //	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
    let vendorId = req.params.vendorId
    if (req.get('x-app-type') === 'EXT' && req.params.vendorId === 'current' && typeof req.decoded?.vendorId !== 'undefined') {
      vendorId = req.decoded.vendorId
    }

    const vendor = await Vendors.getById(vendorId).then(rows => rows?.[0])
    if (!vendor) {
      respond({}, res, next, [], 400, `invalid value for vendorId`)
      return
    }

    const { userId, userType } = getUserIdAndType(req)

    const id = req.params.id
    const {
      status,
      estShipCost,
      estRecovery,
      trackingNumber,
      trackingLink,
      estDaysToPickup,
    } = req.body

    if (!validStatusValues.includes(status)) {
      respond({}, res, next, [], 400, `invalid value for status`)
      return
    }

    const ltlReturn = { id, status, userId, userType, vendorId }
    switch (status) {
      case 'Estimated':
        const estRecoveryEnabled = vendor.rrcLtlReturnsShowEstRecovery === 'Y'
        if (!estShipCost || (estRecoveryEnabled && !estRecovery)) {
          respond({}, res, next, [], 400, `Required: (estShipCost${estRecoveryEnabled ? ', estRecovery' : ''})`)
          return
        }
        if (typeof estShipCost !== 'number' || estShipCost < 0) {
          respond({}, res, next, [], 400, `invalid value for estShipCost`)
          return
        }
        ltlReturn.estShipCost = estShipCost
        if (estRecoveryEnabled && (typeof estRecovery !== 'number' || estRecovery < 0)) {
          respond({}, res, next, [], 400, `invalid value for estRecovery`)
          return
        }
        ltlReturn.estRecovery = estRecoveryEnabled ? estRecovery : null
        break
      case 'Scheduled':
        if (!trackingNumber || !estDaysToPickup) {
          respond({}, res, next, [], 400, `Required: (trackingNumber, estDaysToPickup)`)
          return
        }
        ltlReturn.trackingNumber = trackingNumber;
        ltlReturn.trackingLink = trackingLink;
        if (typeof estDaysToPickup !== 'number' || estDaysToPickup < 0) {
          respond({}, res, next, [], 400, `invalid value for estDaysToPickup`)
          return
        }
        ltlReturn.estDaysToPickup = estDaysToPickup
        break
    }

    const resp = {
      statusCode: 200,
      message: 'Success'
    }

    await ltlReturnsActions.update(ltlReturn, vendor, req.get('Referer'), req.body)
    respond(resp, res, next)
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, {}, [])
  }
})

//
// GET /routing/ltl
//
router.get('/ltl', jwtUtils.verifyToken, async (req, res, next) => {
  try {
    const { dateCreatedEnd, dateCreatedStart, id, rma } = req.query

    const resp = {
      statusCode: 200,
      message: 'Success'
    }

    if (req.get('x-app-type') === 'EXT' && !req.decoded?.vendorId) {
      respond(resp, res, next, [], 403, 'Access denied.')
      return
    }

    // If this is an internal user, try to retrieve the vendor ID from the request query
    let vendorIds = req.query.vendorId
      ? (Array.isArray(req.query.vendorId) ? req.query.vendorId : req.query.vendorId.split(','))
      : []
    const vendorIdsInvalid = vendorIds.findIndex(vendorId => !vendorId) >= 0
    if (req.get('x-app-type') === 'INT' && vendorIdsInvalid) {
      respond({}, res, next, [], 400, `invalid value for vendorId`)
      return
    }

    // If this is an external user, try to retrieve the vendor ID using token.
    if (req.get('x-app-type') === 'EXT' && typeof req.decoded?.vendorId !== 'undefined') {
      vendorIds = [req.decoded.vendorId]
    }

    const statuses = req.query.status
      ? (Array.isArray(req.query.status) ? req.query.status : req.query.status.split(','))
      : []
    const statusesInvalid = statuses.findIndex(status => !status || !validStatusValues.includes(status)) >= 0
    if (statusesInvalid) {
      respond({}, res, next, [], 400, `invalid value for status`)
      return
    }

    if (!rma) {
      if (!dateCreatedStart) {
        respond({}, res, next, [], 400, `dateCreatedStart is required`)
        return
      }

      if (!dateCreatedEnd) {
        respond({}, res, next, [], 400, `dateCreatedEnd is required`)
        return
      }
    }

    const limit = req.query.limit ? safeParseInteger(req.query.limit) : 10
    if (typeof limit !== 'number' || limit <= 0) {
      respond({}, res, next, [], 400, `invalid value for limit`)
      return
    }

    const offset = req.query.offset ? safeParseInteger(req.query.offset) : 0
    if (typeof offset !== 'number' || offset < 0) {
      respond({}, res, next, [], 400, `invalid value for offset`)
      return
    }

    const orderBy = req.query.orderBy ?
      (/^\w+(\.\w+)?(\s+(ASC|DESC))?$/i.test(req.query.orderBy) ? req.query.orderBy : false) :
      'dateCreated DESC'
    if (req.query.orderBy && !orderBy) {
      respond({}, res, next, [], 400, `invalid value for orderBy`)
      return
    }

    const options = { vendorIds, id, rma, statuses, limit, offset, orderBy }
    const totalCount = await ltlReturnsActions.get(dateCreatedStart, dateCreatedEnd, { ...options, countOnly: true })
    const ltlReturns = await ltlReturnsActions.get(dateCreatedStart, dateCreatedEnd, options)

    resp.data = {
      metaData: {
        totalCount
      },
      ltlReturns
    }

    respond(resp, res, next)
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, {}, [])
  }
})

function safeParseInteger(string) {
  if (!string) {
    return
  }
  try {
    return parseInt(string)
  } catch (e) {
    return false
  }
}

module.exports = router
