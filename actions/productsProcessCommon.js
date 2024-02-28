const Manifests = require('../models/manifests')
const Partners = require('../models/partners')
const ProductCostRules = require('../models/productCostRules')
const ProductsProcess = require('../models/productsProcessCommon')
const Stores = require('../models/stores');

const { roundTo2Places } = require('../utils/mathUtils')

exports.calculateCost = async (product, vendor, conditionName) => {
  const price = product.inMarketPrice !== null ? product.inMarketPrice : 0
  if (vendor.partnerContractType === 'REVENUE_SHARE') {
    return price * (vendor.partnerRevSharePercent / 100)
  }

  if (vendor.partnerContractType === 'COST_BASED') {
    const rule = await ProductCostRules.getSpecific(vendor.id, conditionName).then(rows => rows?.[0])
    if (rule) {
      if (rule.costBase === 'cost') {
        return product.productCost * (rule.conditionValue / 100)
      }
      return price * (rule.conditionValue / 100)
    }
  }

  return product.productCost
}

exports.calculateProcessingFee = async (boxes, vendorCatalogProduct) => {
  const coalescedBoxes = await getBoxes(vendorCatalogProduct, { boxes })
  const cubicInches = calculateCubicInches(coalescedBoxes)
  const processingFee = await ProductsProcess.getProcessingFee(vendorCatalogProduct.vendorId, cubicInches)
  if (processingFee?.processingFee && processingFee.processingFee > 0) {
    return roundTo2Places(processingFee.processingFee)
  }
  return 0.00
}

exports.calculatePartnerReceiptInspectionFee = async (partnerId, facilityId, rushSku, vendorCatalogProduct) => {
  const manifest = await Manifests.getByRushSku(rushSku).then(rows => rows?.[0])
  if (!manifest) {
    return { cubicInches: null, fee: 0 }
  }

  //  See if this is a partner processing their own products.
  const captureFees = await isPartnerFeeCharged(partnerId, { rushSku })
  if (!captureFees) {
    return { cubicInches: null, fee: 0 }
  }

  if (manifest.defaultProductCondition === 'New') {
    const facility = await Partners.getFacilityByStoreId(manifest.productStoreId).then(rows => rows?.[0])
    if (!facility) {
      return { cubicInches: null, fee: 0 }
    }

    if ((manifest.productShipType === null) || (manifest.productShipType.toLowerCase() === 'small parcel')) {
      return { cubicInches: null, fee: roundTo2Places(facility.spPerUnit) }
    }

    return { cubicInches: null, fee: roundTo2Places(facility.ltlPerUnit) }
  }

  const coalescedBoxes = await getBoxes(vendorCatalogProduct, { rushSku })
  const cubicInches = calculateCubicInches(coalescedBoxes)
  const partnerReceiptInspectionFee = await ProductsProcess.getPartnerReceiptInspectionFee(facilityId, cubicInches)
  if (partnerReceiptInspectionFee?.processingFee && partnerReceiptInspectionFee.processingFee > 0) {
    return { cubicInches, fee: roundTo2Places(partnerReceiptInspectionFee.processingFee) }
  }

  return { cubicInches, fee: 0 }
}

/**
 * Determines whether a partner fee should be charged for a particular product
 * @param {string} partnerId
 * @param {Object} options  must provide either rushProduct, or rushSku
 * @param [options.rushProduct]
 * @param [options.rushSku]
 * @param [options.vendorId]
 * @param [options.vendorSupplierCode]
 */
const isPartnerFeeCharged = exports.isPartnerFeeCharged = async (partnerId, options) => {
  const product = options.rushProduct ||
    (options.vendorId && options.vendorSupplierCode) ||
    (options.rushSku && await ProductsProcess.getProductBySku(null, options.rushSku))
  if (!product) {
    // this should never happen
    return false
  }

  const vendorId = options.vendorId || product.vendorId
  const vendorSupplierCode = options.vendorSupplierCode || product.vendorSupplierCode

  const partnerRelatedToVendor = await ProductsProcess.isPartnerRelatedToVendor(partnerId, vendorId)
  if (!partnerRelatedToVendor) {
    // product is not the partner's own, charge fee
    return true
  }

  // only charge the fee to the partner if the associated vendor has been set up that way
  return ProductsProcess.isVendorPayingPartnerFees(vendorId, vendorSupplierCode)
}

const getBoxes = exports.getBoxes = async (vendorCatalogProduct, { boxes, rushSku }) => {
  if (!boxes && !rushSku) {
    throw new Error("boxes or rushSku must be provided")
  }

  if (boxes?.length) {
    return boxes
  }

  if (rushSku) {
    const productShippingBoxes = await ProductsProcess.getProductShippingBoxes(rushSku)
    if (productShippingBoxes && productShippingBoxes.numberOfBoxes > 0) {
      return new Array(productShippingBoxes.numberOfBoxes)
        .fill(null)
        .map((v, index) => ({
          packageHeight: productShippingBoxes[`packageHeight${index + 1}`],
          packageWidth: productShippingBoxes[`packageWidth${index + 1}`],
          packageLength: productShippingBoxes[`packageLength${index + 1}`]
        }))
    }
  }

  if (vendorCatalogProduct.numberOfBoxes > 0) {
    return new Array(vendorCatalogProduct.numberOfBoxes)
      .fill(null)
      .map((v, index) => ({
        packageHeight: vendorCatalogProduct[`packageHeight${index + 1}`],
        packageWidth: vendorCatalogProduct[`packageWidth${index + 1}`],
        packageLength: vendorCatalogProduct[`packageLength${index + 1}`]
      }))
  }

  if (vendorCatalogProduct.productHeight && vendorCatalogProduct.productWidth && vendorCatalogProduct.productDepth) {
    return [{
      packageHeight: vendorCatalogProduct.productHeight,
      packageWidth: vendorCatalogProduct.productWidth,
      packageLength: vendorCatalogProduct.productDepth
    }]
  }

  return []
}

const calculateCubicInches = exports.calculateCubicInches = (boxes) => {
  const cubicInches = boxes.reduce((cubicInches, box) =>
    cubicInches + box.packageHeight * box.packageWidth * box.packageLength, 0)
  return Math.round(cubicInches)
}

exports.liveCheck = async (conn, userId, userType, rushProduct) => {
  const {
    locationNumber,
    price,
    shopifyProductId,
    shopifyVariantId,
    sku,
    stepBuildLocateDone,
    stepConditionDone,
    stepReceiveDone,
    stepReshippingDone,
    stepVerifyDone,
    storeId,
    onlineQuickSale,
  } = rushProduct

  //	All steps done?
  let status
  if (
    stepReceiveDone === 'Y' &&
    stepReshippingDone === 'Y' &&
    stepVerifyDone === 'Y' &&
    stepConditionDone === 'Y' &&
    stepBuildLocateDone === 'Y'
  ) {
    if (price !== undefined && price !== null && price > 0) {
      status = 'Live'
    } else {
      status = 'Active'
    }
  } else {
    status = 'Received'
  }

  const isOnlineEligible = status === 'Live' && locationNumber &&
    await ProductsProcess.isLocationOnlineEligible(conn, storeId, locationNumber)
  const onlineShopping = isOnlineEligible ? 'Y' : 'N'

  await ProductsProcess.updateProductStatus(conn, sku, status, onlineShopping)

  //	If new status Live and not in the shopify queue, add it to the queue
  if (status === 'Live' && shopifyProductId === 0) {
    await ProductsProcess.createShopifyQueue(conn, sku)
  } else if (
      onlineQuickSale === 'Y'
      && shopifyProductId > 0
      && (status === 'Live' || status === 'Received')
  ) {
    const stores = await Stores.getById(storeId);
    const shopifyStoreId = stores[0].shopifyStoreId;
    await ProductsProcess.reCreateShopifyQueue(conn, sku, shopifyStoreId, shopifyProductId, shopifyVariantId);
  }
}
