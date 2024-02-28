'use strict';

const {
  calculateProcessingFee,
  liveCheck
} = require('../actions/productsProcessCommon');

const gde = require('./gde');
const globals = require('../globals');

const Manifests = require('../models/manifests');
const {
  getFacilityById,
  getFacilityByUser
} = require('../models/partners');
const {
  createProductActionLog,
  getProductBySku,
  getVendorCatalogProductBySku,
  updateBuildInspect
} = require('../models/productsProcessCommon');
const {
  clearProductShippingBoxes,
  createProductShippingBoxes,
  updateProductReshippingDone,
  updateVendorCatalogProductBoxes
} = require('../models/productsProcessReshipping');
const SupplierCodes = require('../models/supplierCodes');

const configUtils = require('../utils/configUtils');
const logUtils = require('../utils/logUtils');

exports.reshipSku = async (rushSku, inOriginalBoxes, boxes, reusePackaging, incorrectBoxDims, notes, facilityId, userId, userType, storeId) => {
  //	Grab connection here so we can do all the following in the same transaction.
  const corelinkConn = await globals.pool.getConnection();
  const vendorConn = await globals.productPool.getConnection();

  try {
    await corelinkConn.beginTransaction();
    await vendorConn.beginTransaction();

    if (notes) {
      await updateBuildInspect(corelinkConn, rushSku, notes);
    }

    const product = await getProductBySku(corelinkConn, rushSku);
    if (!product) {
      throw new Error('product not found');
    }

    //  Verify the partner/user can access the sku
    if (userType === 'PARTNERUSER') {
      const facility = await getFacilityByUser(userId);
      if (facility.storeId !== product.storeId) {
        throw new Error('product not found');
      }
    } else if (userType === 'PARTNER') {
      const facility = await getFacilityById(facilityId)
      if (!facility.length || (facility[0].storeId !== product.storeId)) {
        throw new Error('product not found');
      }
    } else if (userType === 'INTERNAL') {
      if (storeId !== product.storeId) {
        throw new Error('product not found');
      }
    }

    const directBuy = await Manifests.getByRushSku(product.sku)
      .then(rows => rows?.[0]?.manifestSource === 'DIRECT_BUY' || false);

    const supplierCode = !directBuy && product.vendorSupplierCode &&
      await SupplierCodes.get(product.vendorSupplierCode).then(rows => rows?.[0]);

    const vendorCatalogProduct = typeof product.vendorId !== 'undefined' &&
      await getVendorCatalogProductBySku(undefined, product.vendorId, product.sellerProductId);
    if (!vendorCatalogProduct) {
      throw new Error('vendor catalog product not found');
    }

    await clearProductShippingBoxes(corelinkConn, rushSku);
    if (inOriginalBoxes === 'N' && reusePackaging === 'Y') {
      await createProductShippingBoxes(corelinkConn, rushSku, boxes);
    } else if (inOriginalBoxes === 'Y' && reusePackaging === 'Y') {
      if (vendorCatalogProduct.numberOfBoxes === 0 && incorrectBoxDims === 'N') {
        await updateVendorCatalogProductBoxes(vendorConn, vendorCatalogProduct.id, boxes);
      } else if (incorrectBoxDims === 'Y') {
        await createProductShippingBoxes(corelinkConn, rushSku, boxes);
      }
    }

    const shipType = calculateShipType(boxes, vendorCatalogProduct);
    const processingFee = directBuy || !supplierCode || supplierCode.chargeProcessingFees === 'N' ? 0.00 :
      await calculateProcessingFee(boxes, vendorCatalogProduct);

    await updateProductReshippingDone(corelinkConn, rushSku, shipType, processingFee, reusePackaging, inOriginalBoxes, incorrectBoxDims);
    const updatedProduct = await getProductBySku(corelinkConn, rushSku);
    await liveCheck(corelinkConn, userId, userType, updatedProduct);
    const json = { rushSku, inOriginalBoxes, boxes, reusePackaging, notes, userId, userType };
    await createProductActionLog(corelinkConn, rushSku, 'RESHIPPING', userId, userType, json);

    await gde.queueShipCalcBySku({
      sku: rushSku,
      minimizeRateCallsFlag: configUtils.get("GDE_MINIMIZE_RATE_CALLS") === "ON",
      priority: 5
    });

    await corelinkConn.commit();
    await vendorConn.commit();
  } catch (e) {
    await corelinkConn.rollback();
    await vendorConn.rollback();
    await logUtils.logException(e);
    throw new Error(`failed to reship SKU [${rushSku}]: ${e.message}`);
  } finally {
    globals.pool.releaseConnection(corelinkConn);
    globals.productPool.releaseConnection(vendorConn);
  }
}

const SHIP_TYPE_SMALL_PARCEL = 'Small Parcel';
const SHIP_TYPE_LTL = 'LTL';

const LTL_SIDE_INCHES_THRESHOLD = 108;
const LTL_POUNDS_THRESHOLD = 150;
const LTL_COMBINED_INCHES_THRESHOLD = 165;

function calculateShipType(boxes, vendorCatalogProduct) {
  if (!boxes.length) {
    return vendorCatalogProduct.shipType || SHIP_TYPE_SMALL_PARCEL;
  }

  const isLtl = boxes.reduce((isLtl, box) => {
    // sort the dimensions lowest to highest and assign to height/width/length in that order
    const [height, width, length] = [box.packageHeight, box.packageWidth, box.packageLength].sort();

    return isLtl ||
      box.shippingWeight > LTL_POUNDS_THRESHOLD ||
      length > LTL_SIDE_INCHES_THRESHOLD ||
      length + 2 * (width + height) > LTL_COMBINED_INCHES_THRESHOLD;
  } , false);

  return isLtl ? SHIP_TYPE_LTL : SHIP_TYPE_SMALL_PARCEL;
}
