'use strict'

const {
  calculateCubicInches,
  calculatePartnerReceiptInspectionFee,
  getBoxes,
  isPartnerFeeCharged,
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
  createProductConditionLog,
  createProductLocationLog,
  getDisposalFee,
  getPartnerDisposalFee,
  getProductBySku,
  getVendorCatalogProductBySku,
  updateBuildInspect
} = require('../models/productsProcessCommon')
const {
  getProductCostRule,
  getProductDamagePricingRule,
  getProductMissingHardwareRule,
  getVendorById,
  updateProductCondition,
} = require('../models/productsProcessCondition')
const { createProductPricingLog } = require('../models/rushProductPrice')
const SupplierCodes = require('../models/supplierCodes')

const configUtils = require('../utils/configUtils')
const logUtils = require('../utils/logUtils')
const { roundTo2Places } = require('../utils/mathUtils')
const shopifyUtils = require('../utils/shopifyUtils')

exports.conditionSku = async (
  rushSku,
  conditionName,
  damages,
  missingHardware,
  assemblyInstructions,
  notes,
  partnerId,
  facilityId,
  userId,
  userType,
  storeId
) => {
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
    } else if (userType === 'PARTNER') {
      const facility = await getFacilityById(facilityId)
      if (!facility.length || (facility[0].storeId !== product.storeId)) {
        throw new Error('product not found')
      }
    } else if (userType === 'INTERNAL') {
      if (storeId !== product.storeId) {
        throw new Error('product not found')
      }
    }

    const vendorCatalogProduct =
      typeof product.vendorId !== 'undefined' &&
      (await getVendorCatalogProductBySku(undefined, product.vendorId, product.sellerProductId))
    if (!vendorCatalogProduct) {
      throw new Error('vendor catalog product not found')
    }

    const vendor = await getVendorById(undefined, product.vendorId)
    if (!vendor) {
      throw new Error('vendor not found')
    }

    let pendingProductChanges
    if (conditionName === 'Trash') {
      const disposalFee = await calculateTrashDisposalFee(conn, rushSku, product, vendorCatalogProduct)

      const {
        cubicInches: partnerDisposalCubicInches,
        fee: partnerDisposalFee
      } = await calculatePartnerDisposalFee(conn, partnerId, facilityId, rushSku, vendorCatalogProduct)

      const {
        cubicInches: partnerReceiptInspectionCubicInches,
        fee: partnerReceiptInspectionFee
      } = await calculatePartnerReceiptInspectionFee(partnerId, facilityId, rushSku, vendorCatalogProduct)

      pendingProductChanges = {
        status: 'Inactive',
        inactiveReasonId: 1,
        onlineShopping: 'N',
        pricingTypeId: 0,
        locationNumber: '',
        palletNumber: null,
        disposalFee,
        partnerDisposalCubicInches,
        partnerDisposalFee,
        partnerReceiptInspectionCubicInches,
        partnerReceiptInspectionFee
      }

      const locationChanged = !!product.locationNumber
      const palletChanged = !!product.palletNumber
      await createProductLocationLog(
        conn,
        userId,
        userType,
        rushSku,
        product.storeId,
        locationChanged ? product.locationNumber : '',
        locationChanged ? pendingProductChanges.locationNumber : '',
        palletChanged ? product.palletNumber : null,
        palletChanged ? pendingProductChanges.palletNumber : null
      )
      await createProductActionLog(conn, rushSku, 'STATUS_CHANGE', userId, userType)

      //  Record TRASHED action.
      await createProductActionLog(conn, rushSku, 'TRASHED', userId, userType, null)
    } else if (['New', 'Like New'].includes(conditionName)) {
      const cost = await calculateProductCost(conn, vendor, product.price, vendorCatalogProduct, conditionName)
      pendingProductChanges = {
        pricingTypeId: 7,
        damageTop: 0,
        damageBottom: 0,
        damageInterior: 0,
        missingHardware: 0,
        disposalFee: 0,
        partnerDisposalFee: 0,
        cost,
      }
    } else {
      const damagePricing = await calculateDamagePricing(conn, damages, missingHardware, vendorCatalogProduct)
      const cost = await calculateProductCost(conn, vendor, damagePricing.price, vendorCatalogProduct, conditionName)
      pendingProductChanges = {
        ...damagePricing,
        disposalFee: 0,
        partnerDisposalFee: 0,
        cost,
      }
    }

    const adjustedConditionName = getAdjustedConditionName(conditionName, damages, missingHardware)
    const json = {
      rushSku,
      conditionName,
      damages,
      missingHardware,
      assemblyInstructions,
      notes,
      userId,
      userType,
    }
    await createProductActionLog(conn, rushSku, 'CONDITIONING', userId, userType, json)
    const updatedProduct = await updateProductCondition(
      conn,
      rushSku,
      adjustedConditionName,
      assemblyInstructions,
      pendingProductChanges
    )

    const conditionChanged = product.conditionName !== adjustedConditionName
    if (conditionChanged) {
      await createProductConditionLog(conn, rushSku, userId, userType, product.conditionName, adjustedConditionName)
    }

    const pricingChanged =
      product.price !== updatedProduct.price || product.pricingTypeId !== updatedProduct.pricingTypeId
    if (pricingChanged) {
      if (product.shopifyVariantId) {
        let si = shopifyUtils.getCityInfoByCity('Omaha')
        let variant = await si.shopify.productVariant.get(product.shopifyVariantId)
        let result = await si.shopify.productVariant.update(product.shopifyVariantId, {
          price: updatedProduct.price,
        })
      }

      await createProductPricingLog(
        conn,
        userId,
        userType,
        rushSku,
        product.price,
        updatedProduct.price,
        product.pricingTypeId,
        updatedProduct.pricingTypeId
      )
    }

    if (conditionName !== 'Trash') {
      await liveCheck(conn, userId, userType, updatedProduct)
      await gde.queueShipCalcBySku({
        sku: rushSku,
        minimizeRateCallsFlag: configUtils.get('GDE_MINIMIZE_RATE_CALLS') === 'ON',
        priority: 5,
      })
    }

    await conn.commit()
  } catch (e) {
    await conn.rollback()
    await logUtils.logException(e)
    throw new Error(`failed to condition SKU [${rushSku}]: ${e.message}`)
  } finally {
    globals.pool.releaseConnection(conn)
  }
}

function getAdjustedConditionName(conditionName, damages, missingHardware) {
  if (conditionName !== 'Damaged') {
    return conditionName
  }

  const excessDamage = damages.reduce(
    (excessDamage, damage) =>
      excessDamage ||
      damage.severity === 'Considerable' ||
      (damage.severity === 'Moderate' && damage.visibility === 'Clearly Visible'),
    false
  )

  if (missingHardware !== 'No' || excessDamage) {
    return 'Fair'
  }

  return 'Good'
}

async function calculateTrashDisposalFee(conn, rushSku, product, vendorCatalogProduct) {
  //  For Direct Buy loads there won't be a supplier code.  If there isn't one no disposal fees - return 0.0
  var supplierCode = await SupplierCodes.get(product.vendorSupplierCode).then(rows => rows?.[0])
  if (!supplierCode) {
    return 0.0
  }

  if (supplierCode.chargeDisposalFees !== 'N') {
    const boxes = await getBoxes(vendorCatalogProduct, { rushSku })
    const cubicInches = calculateCubicInches(boxes)
    const disposalFee = await getDisposalFee(supplierCode.vendorId, cubicInches)
    if (disposalFee) {
      return roundTo2Places(disposalFee.disposalFee)
    }
  }

  return 0.0
}

async function calculatePartnerDisposalFee(conn, partnerId, facilityId, rushSku, vendorCatalogProduct) {
  //  See if this is a partner processing their own products.
  const captureFees = await isPartnerFeeCharged(partnerId, { rushSku, vendorId: vendorCatalogProduct.vendorId })
  if (!captureFees) {
    return { cubicInches: null, fee: 0 }
  }

  const boxes = await getBoxes(vendorCatalogProduct, { rushSku })
  const cubicInches = calculateCubicInches(boxes)
  const disposalFee = await getPartnerDisposalFee(facilityId, cubicInches)
  if (disposalFee) {
    return { cubicInches, fee: roundTo2Places(disposalFee.disposalFee) }
  }

  return { cubicInches, fee: 0 }
}

async function calculateDamagePricing(conn, damages, missingHardware, vendorCatalogProduct) {
  const damagePricingRules = await Promise.all(
    damages.map(damage => getProductDamagePricingRule(conn, damage.severity, damage.location, damage.visibility))
  )

  const productDamageRules = damagePricingRules.reduce((productDamageRules, damagePricingRule) => {
    switch (damagePricingRule.damageLocation) {
      case 'Top, front, corner, sides':
        return {
          ...productDamageRules,
          damageTop: damagePricingRule.productDamagePricingRulesId,
        }
      case 'Bottom or back':
        return {
          ...productDamageRules,
          damageBottom: damagePricingRule.productDamagePricingRulesId,
        }
      case 'Interior':
        return {
          ...productDamageRules,
          damageInterior: damagePricingRule.productDamagePricingRulesId,
        }
      default:
        throw new Error('Unknown damage location')
    }
  }, {})

  // get the largest adjustment value from all the damage pricing rules
  const maxDamageAdjustmentValue = damagePricingRules.reduce(
    (maxAdjustmentValue, pricingRule) => Math.max(maxAdjustmentValue, pricingRule.damageAdjustmentValue),
    0
  )

  // determine new price and pricingTypeId based on the damage pricing rules
  let price = (1 - maxDamageAdjustmentValue / 100) * vendorCatalogProduct.inMarketPrice
  let pricingTypeId = damagePricingRules.reduce(
    (pricingTypeId, pricingRule) => (pricingRule.pricingTypeId === 4 ? 4 : pricingTypeId),
    8
  )

  // apply any applicable missing hardware rule to the new price and pricingTypeId
  const missingHardwareRule = missingHardware !== 'No' && (await getProductMissingHardwareRule(conn, missingHardware))
  if (missingHardwareRule) {
    price = (1 - missingHardwareRule.damageAdjustmentValue / 100) * price
    pricingTypeId = missingHardwareRule.pricingTypeId === 4 ? 4 : pricingTypeId
  }

  return {
    ...productDamageRules,
    missingHardware: missingHardwareRule?.productMissingHardwareRulesId,
    price: roundTo2Places(price),
    pricingTypeId,
  }
}

async function calculateProductCost(conn, vendor, productPrice, vendorCatalogProduct, conditionName) {
  switch (vendor.partnerContractType) {
    case 'REVENUE_SHARE':
      return roundTo2Places((productPrice * vendor.partnerRevSharePercent) / 100)
    case 'COST_BASED':
      const costRule = await getProductCostRule(conn, vendor.id, conditionName)
      if (!costRule) {
        return vendorCatalogProduct.productCost
      }

      const multiplier = costRule.conditionValue / 100
      switch (costRule.costBase) {
        case 'cost':
          return roundTo2Places(vendorCatalogProduct.productCost * multiplier)
        case 'price':
          return roundTo2Places(vendorCatalogProduct.inMarketPrice * multiplier)
        default:
          throw new Error(`unknown cost base ${costRule.costBase}`)
      }
    default:
      throw new Error(`unknown partner contract type ${vendor.partnerContractType}`)
  }
}
