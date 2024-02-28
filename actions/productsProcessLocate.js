'use strict'

const {
  calculatePartnerReceiptInspectionFee,
  liveCheck
} = require('../actions/productsProcessCommon')

const gde = require('./gde')
const globals = require('../globals')

const {
  getFacilityById,
  getFacilityByUser
} = require('../models/partners')
const {
  createProductActionLog,
  createProductLocationLog,
  getProductBySku,
  getVendorCatalogProductBySku,
  sellbriteInventoryQueue,
  updateBuildInspect,
} = require('../models/productsProcessCommon')
const { updateProductLocateDone } = require('../models/productsProcessLocate')

const configUtils = require('../utils/configUtils')
const logUtils = require('../utils/logUtils')

exports.locateSku = async (rushSku, location, notes, partnerId, facilityId, userId, userType, storeId) => {
  //	Grab connection here so we can do all the following in the same transaction.
  const conn = await globals.pool.getConnection()

  try {
    await conn.beginTransaction()

    if (notes) {
      await updateBuildInspect(conn, rushSku, notes)
    }

    const product = await getProductBySku(conn, rushSku)
    if (!product) {
      throw new Error('product not found')
    }

    //  Verify the partner/user can access the sku
    if (userType === 'PARTNERUSER') {
      const facility = await getFacilityByUser(userId)
      if (facility.storeId !== product.storeId) {
        throw new Error('product not found')
      }
    }
    else if (userType === 'PARTNER') {
      const facility = await getFacilityById(facilityId)
      if (!facility.length || (facility[0].storeId !== product.storeId)) {
        throw new Error('product not found')
      }
    }
    else if (userType === 'INTERNAL') {
      if (storeId !== product.storeId) {
        throw new Error('product not found')
      }
    }

    const vendorCatalogProduct = typeof product.vendorId !== 'undefined' &&
      await getVendorCatalogProductBySku(undefined, product.vendorId, product.sellerProductId)
    if (!vendorCatalogProduct) {
      throw new Error('vendor catalog product not found')
    }

    const locationNumber = `${location.area}${location.zone}${location.location}`
    if (product.locationNumber !== locationNumber) {
      await createProductLocationLog(
        conn,
        userId,
        userType,
        rushSku,
        product.storeId,
        product.locationNumber || '',
        locationNumber,
        null,
        null
      )

      //  Create Sellbrite queue entry on product creation
      await sellbriteInventoryQueue(conn, rushSku, '/v1/products/process/locate');      
    }

    const { cubicInches, fee } = await calculatePartnerReceiptInspectionFee(partnerId, facilityId, rushSku, vendorCatalogProduct)

    await updateProductLocateDone(conn, rushSku, locationNumber, cubicInches, fee)
    const updatedProduct = await getProductBySku(conn, rushSku)
    const json = { rushSku, location, notes, partnerId, userId, userType }
    await createProductActionLog(conn, rushSku, 'BUILD_LOCATE', userId, userType, json)

    await liveCheck(conn, userId, userType, updatedProduct)
    await gde.queueShipCalcBySku({
      sku: rushSku,
      minimizeRateCallsFlag: configUtils.get("GDE_MINIMIZE_RATE_CALLS") === "ON",
      priority: 5
    })

    await conn.commit()
  } catch (e) {
    await conn.rollback()
    await logUtils.logException(e)
    throw new Error(`failed to verify SKU [${rushSku}]: ${e.message}`)
  } finally {
    globals.pool.releaseConnection(conn)
  }
}
