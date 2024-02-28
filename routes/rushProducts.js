'use strict';

const _ = require('lodash');
const check = require('check-types');
const express = require('express');
const moment = require('moment-timezone');
const router = express.Router();

const {
  calculatePricing,
  clearEDDCache,
  getAll,
  getAllProducts,
  getAllProductsLite,
  getAllRRC,
  getBulkStateByCoin,
  getByCoin,
  getEDDCacheSize,
  getStateByCoin,
  purgeByCoin
} = require('../actions/rushProducts');

const jwtUtils = require('../actions/jwtUtils');

const Partners = require('../models/partners');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
  respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  GET /rushProducts
//
router.get(`/`, async (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.',
      metaData: {
        totalCount: 0
      },
      data: {
        rushProducts: []
      }
    };
  
    //	Check for a userId
    await jwtUtils.verifyTokenInline(req, resp);


    //  If External request coming from front-end...  can be not verified or verified with no vendorId
    if ((req.get('x-app-type') === 'EXT') && ((req.decoded === undefined) || ((req.decoded.vendorId === undefined) && (req.decoded.partnerId === undefined)))) {
      await getFEProducts(req, resp, res, next);
    }

    //  ProductLite
    else if ((req.get('x-app-type') === 'INT') && (req.query.productLite && req.query.productLite.toUpperCase() === "TRUE")) {
      await getProductLiteProducts(req, resp, res, next);
    }

    //  RRC Externalization - either an internal user passing the rrc device id or an external vendor
    else if ((req.get('x-device-id') === 'rrc') || ((req.get('x-app-type') === 'EXT') && (req.decoded !== undefined) && ((req.decoded.vendorId !== undefined) || (req.decoded.partnerId !== undefined)))) {
      await getRRCProducts(req, resp, res, next);
    }

    //  Product heavy
    else {
      await getHeavyProducts(req, resp, res, next);
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp);
  }
})




var getHeavyProducts = async (req, resp, res, next) => {
  var coinFilter = [];
  var limit = 50;
  var offset = 0;
  var whereInfo = {
    clause: '',
    values: []
  };
  var coinWhereInfo = {
    clause: '',
    values: []
  }
  var sortBy = '';
  var includeShippingBoxes = false;


  if ((req.get('x-app-type') === 'EXT') && (req.decoded !== undefined) && (req.decoded.vendorId !== undefined)) {
    req.vendorId = req.decoded.vendorId;
    internalFlag = false;
  }


  //default values
  whereInfo.clause = ' WHERE 1=1 ';



  if (req.query.status && req.query.status.toUpperCase() === "SOLD") {
    req.query.status = "Purchase";
  }

  if (req.query.includeShippingBoxes && req.query.includeShippingBoxes.toUpperCase() === "TRUE") {
    includeShippingBoxes = true;
  }
  //scrape attributes
  if (req.query.attributeId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'sa.attribute_name IN (SELECT `name` FROM `attribute_mappings` WHERE `attribute_id` = ?)', req.query.attributeId);
    if (req.query.attributeValueId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sa.attribute_value IN (SELECT `value` FROM `attribute_value_mappings` WHERE `attribute_value_id` = ?)', req.query.attributeValueId);
    }
  }

  if (req.query.vendorId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'm.vendor_id IN (?)');
    whereInfo.values.push(req.query.vendorId.split(','));
  }

  // storage pallets
  if (req.query.mismatchPalletLocation && req.query.mismatchPalletLocation.toUpperCase() === "TRUE") {
    whereInfo = sqlUtils.appendWhere(whereInfo, '( p.pallet_number IS NOT NULL AND p.pallet_number != "" AND ( p.location_number != sp.location_number OR p.store_id != sp.current_store_id ) )');
  }

  if (req.query.dropshipType) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_type = ?', req.query.dropshipType);
  }

  if (req.query.status) {
    if (req.query.status.toUpperCase() === "RETURN" || req.query.status.toUpperCase() === "PURCHASE") {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'i.line_type = ?', req.query.status);
      whereInfo = sqlUtils.appendWhere(whereInfo, 'AND i.order_line_item_id = (SELECT max(order_line_item_id) FROM order_line_items WHERE sku = p.sku)');
      if (req.query.dateModifiedStart) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'i.line_item_date_created >= ?', req.query.dateModifiedStart);
      }
      if (req.query.dateModifiedEnd) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'i.line_item_date_created <= ?', req.query.dateModifiedEnd);
        dateModifiedEnd = req.query.dateModifiedEnd;
      }

    } else {
      if (req.query.status.length > 0) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'p.status IN (?)');
        whereInfo.values.push(req.query.status.split(','));
      }
      if (req.query.dateModifiedStart) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_modified >= ?', req.query.dateModifiedStart);
      }
      if (req.query.dateModifiedEnd) {
        whereInfo = sqlUtils.appendWhere(whereInfo, ' p.date_modified <= ?', req.query.dateModifiedEnd);
        dateModifiedEnd = req.query.dateModifiedEnd;
      }
    }
  }

  if (req.query.sellerProductId) {
    //listQualify(sellerProductSku,"'",",","CHAR")
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.seller_product_id IN (?)');
    whereInfo.values.push(req.query.sellerProductId.split(','));
  }

  if (req.query.productName) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.name LIKE ?', '%' + req.query.productName + '%');
  }

  if (req.query.manufacturer) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.manufacturer LIKE ?', '%' + req.query.manufacturer + '%');
  }

  if (req.query.rushSku) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku IN (?)');
    whereInfo.values.push(req.query.rushSku.split(","));
  }

  // category mappings
  if (req.query.categoryId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'cm.category_id IN (?)', req.query.categoryId);
  }

  if (req.query.storeId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.store_id = ?', req.query.storeId);
    if (req.query.storageArea) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.storage_area IN (?)');
      whereInfo.values.push(req.query.storageArea.split(','));
    }
    if (req.query.storageZone) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.storage_zone = ?', req.query.storageZone);
    }
    if (req.query.storageLocation) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.storage_location = ?', req.query.storageLocation);
    }
  }

  if (req.query.noLocation) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.location_number = ""');
  }

  if (req.query.marketFloor) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'l.market_floor IN (?)');
    whereInfo.values.push(req.query.marketFloor.split(','));
  }

  if (req.query.palletNumber) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.pallet_number IN (?)');
    whereInfo.values.push(req.query.palletNumber.split(','));
  }

  if (req.query.productId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_id IN (?)');
    whereInfo.values.push(req.query.productId.split(','));
  }

  if (req.query.listedOnStyleSave) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.listed_on_stylesave IN (?)');
    whereInfo.values.push(req.query.listedOnStyleSave.split(','));
  }

  if (req.query.createdDateStart) {
    whereInfo = sqlUtils.appendWhere(whereInfo, ' p.date_created >= ?', req.query.createdDateStart);
  }

  if (req.query.createdDateEnd) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created <= ?', req.query.createdDateEnd);
  }

  if (req.query.dateToReleaseStart) {
    whereInfo = sqlUtils.appendWhere(whereInfo, ' p.date_to_release >= ?', req.query.dateToReleaseStart);
  }

  if (req.query.dateToReleaseEnd) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_to_release <= ?', req.query.dateToReleaseEnd);
  }

  if (req.query.lastSkuProcessed) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku < ?', req.query.lastSkuProcessed);
  }

  if (req.query.manifestId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.manifest_id IN (?)');
    whereInfo.values.push(req.query.manifestId.split(','));
  }

  if (req.query.upc) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc = ?', req.query.upc);
  }

  if (req.query.mpn) {
    whereInfo = sqlUtils.appendWhere(whereIngo, 'p.mpn = ?', req.query.mpn);
  }

  if (req.query.shopifyProductId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_product_id = ?', req.query.shopifyProductId);
  }

  if (req.query.shopifyVariantId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_variant_id = ?', req.query.shopifyVariantId);
  }

  if (req.query.inMarketExclusive) {
    whereInfo = sqlUtils.appendWhere(whereInfo, '( p.in_market_exclusive = "Y" OR ( p.in_market_exclusive = "N" AND l.online_eligible = "N" ))');
  }

  if (req.query.manifestSource) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'm.manifest_source = ?', req.query.manifestSource);
  }

  if (req.query.freshnessScoreMin) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.freshness_score >= ?', req.query.freshnessScoreMin);
  }

  if (req.query.freshnessScoreMax) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.freshness_score <= ?', req.query.freshnessScoreMax);
  }

  if (req.query.onlineShopping) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.online_shopping IN (?)');
    whereInfo.values.push(req.query.onlineShopping.split(','));
  }

  if (req.query.pricingTypeId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.pricing_type_id = ?', req.query.pricingTypeId);
  }

  if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
    limit = parseInt(req.query.limit);
  }

  if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
    offset = parseInt(req.query.offset);
  }

  if (req.query.sortBy && req.query.sortBy.toUpperCase() === "SKULIST") {
    let rushSkus = req.query.rushSku.split(',');
    let skuList = '';
    if (rushSkus.length > 1) {
      rushSkus.forEach((sku, i) => {
        if (i > 0) {
          skuList += `,"${sku}"`;
        } else {
          skuList += `"${sku}"`;
        }
      })
      sortBy = `FIELD( p.sku ${skuList} )`;
    }
  } else if (req.query.sortBy) {
    sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku', 'name']);
    if (sortBy === 'field') {
      respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
    } else if (sortBy === 'direction') {
      respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
    }
  }
  if ((sortBy != 'field') && (sortBy != 'direction')) {
    resp = await getAllProducts(includeShippingBoxes, req.query.status, req.query.dateModifiedEnd, req.query.attributeId, whereInfo, sortBy, offset, limit, resp);
    respond(resp, res, next);
  }

}



var getFEProducts = async (req, resp, res, next) => {
  var coinFilter = [];
  var limit = 50;
  var offset = 0;
  var whereInfo = {
    clause: '',
    values: []
  };
  var coinWhereInfo = {
    clause: '',
    values: []
  }
  var sortBy = '';
  var includeShippingBoxes = false;


  if ((req.query.customerId === undefined) && (req.query.zip === undefined)) {
    respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "customerId or zip"));
  } else {

    //  Reset the response for an external call from the FE
    resp.statusCode = 200;
    resp.message = 'Success.';

    sortBy = 'name ASC';
    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    if (req.query.coinId) {
      if (req.query.coinId.indexOf(',') >= 0) {
        var s = _.split(req.query.coinId, ',')
        var placeholders = '';
        for (var i = 0; i < s.length; i++) {
          if (placeholders.length > 0) {
            placeholders += ', ';
          }
          placeholders += '?';
        }
        coinWhereInfo = sqlUtils.appendWhere(coinWhereInfo, 'coin_id IN (' + placeholders + ')', s);
      } else {
        coinWhereInfo = sqlUtils.appendWhere(coinWhereInfo, 'coin_id =  ?', req.query.coinId);
      }
    }

    if (req.query.shopifyVariantId) {
      if (req.query.shopifyVariantId.indexOf(',') >= 0) {
        var s = _.split(req.query.shopifyVariantId, ',')
        var placeholders = '';
        for (var i = 0; i < s.length; i++) {
          if (placeholders.length > 0) {
            placeholders += ', ';
          }
          placeholders += '?';
        }
        whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_variant_id IN (' + placeholders + ')', s);
      } else {
        // if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_variant_id LIKE ?', req.query.shopifyVariantId);
        // } else {
        // 	whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_variant_id LIKE ?', req.query.shopifyVariantId + '%');
        // }
      }
    }


    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku', 'name']);

      if (sortBy === 'field') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }

    if ((sortBy != 'field') && (sortBy != 'direction')) {
      resp = await getAll(req, whereInfo, coinWhereInfo, sortBy, offset, limit, resp);
      respond(resp, res, next);
    }
  }
}


var getRRCProducts = async (req, resp, res, next) => {
  var coinFilter = [];
  var limit = 50;
  var offset = 0;
  var whereInfo = {
    clause: '',
    values: []
  };
  var coinWhereInfo = {
    clause: '',
    values: []
  }
  var sortBy = '';
  var includeShippingBoxes = false;


  sortBy = ' p.sku DESC ';
  var internalFlag = true;
  if ((req.decoded !== undefined) && ((req.decoded.vendorId !== undefined) || (req.decoded.partnerId !== undefined))) {
    internalFlag = false;
  } else {
    internalFlag = true;
  }

  if (internalFlag && !req.query.vendorId && !req.query.partnerId) {
    respond(resp, res, next, ["data", "metaData"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "vendorId or partnerId"));
  } else {


    //  If this is a partner or a partner user, or an internal impersonating a partner, get a list of allowable storeIds.
    var storeIds = [];
    var partnerId = req.query.partnerId ? req.query.partnerId : undefined;
    var partnerUserId = undefined;
    if (req.decoded && req.decoded.identity && req.decoded.identity.type) {
      if (req.decoded.identity.type === 'PARTNER') {
        partnerId = req.decoded.identity.partnerId;
      }
      else if (req.decoded.identity.type === 'PARTNERUSER') {
        partnerId = req.decoded.identity.partnerId;
        partnerUserId = req.decoded.identity.userId;
      }
    }

    if (partnerId && partnerUserId) {
      storeIds = await Partners.getAllFacilityStoreIdsByPartnerUserId(partnerId, partnerUserId);
    }
    else if (partnerId) {
      storeIds = await Partners.getAllFacilityStoreIdsByPartnerId(partnerId);
    }

    var storeIdList = '';
    for (var i=0; i < storeIds.length; i++) {
      if (storeIdList.length) {
        storeIdList += ', ';
      }
      storeIdList += `${storeIds[i].storeId}`;
    }

    whereInfo.clause = ' WHERE 1=1 ';

    if (storeIdList.length) {
      whereInfo = sqlUtils.appendWhere(whereInfo, `p.store_id IN (${storeIdList})`);
    }

    if (internalFlag && !partnerId && req.query.vendorId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.vendor_id = ?', req.query.vendorId);
    } else if (!partnerId && req.decoded.vendorId !== undefined) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.vendor_id = ?', req.decoded.vendorId);
    }

    if ((req.query.status) && (typeof req.query.status === 'string')) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.status IN (?)')
      whereInfo.values.push(req.query.status.split(','));
    }

    if (req.query.manifestSource) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.manifest_source IN (?)')
      whereInfo.values.push(req.query.manifestSource.split(','));
    }

    if (req.query.conditionName) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.condition_name IN (?)');
      whereInfo.values.push(req.query.conditionName.split(','));
    }

    if (req.query.category1Id) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'c.parent_id = ?', req.query.category1Id);
    }

    if (req.query.dropshipType) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_type = ?', req.query.dropshipType);
    }

    if (req.query.category2Id) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'c.category_id IN (?)');
      whereInfo.values.push(req.query.category2Id.split(','));
    }

    if (req.query.vendorSku) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.seller_product_id IN (?)');
      whereInfo.values.push(req.query.vendorSku.split(','));
    }

    if (req.query.sku) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku IN (?)', req.query.sku);
    }

    if (req.query.upc) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc = ?', req.query.upc);
    }

    if (req.query.mpn) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.mpn = ?', req.query.mpn);
    }

    if (req.query.storageArea) {
      if (req.query.storageZone !== 'NULL') {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'sl.storage_area IN (?)');
        whereInfo.values.push(req.query.storageArea.split(','));
      }
    }

    if (req.query.storageZone) {
      if (req.query.storageZone !== 'NULL') {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'sl.storage_zone IN (?)');
        whereInfo.values.push(req.query.storageZone.split(','));
      }
    }

    if (req.query.storageLocation) {
      if (req.query.storageLocation !== 'NULL') {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'sl.storage_location IN (?)');
        whereInfo.values.push(req.query.storageLocation.split(','));
      }
    }

    if ((req.query.storeId) && (req.query.storeId !== 'current')) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.store_id = ?', req.query.storeId);
    }

    if (req.query.dateCreated) {
      var start = moment(`${req.query.dateCreated} 00:00`).tz('America/Chicago');
      var end = new moment(start).add(1, 'days');

      start.add((-1 * moment.tz.zone('America/Chicago').utcOffset()), 'minutes');
      end.add((-1 * moment.tz.zone('America/Chicago').utcOffset()), 'minutes');

      whereInfo = sqlUtils.appendWhere(whereInfo, `p.date_created >= CONVERT_TZ(?, 'America/Chicago', 'GMT') AND p.date_created  < CONVERT_TZ(?, 'America/Chicago', 'GMT')`)
      whereInfo.values.push(start.utc().format());
      whereInfo.values.push(end.utc().format());
    }

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku', 'status', 'name', 'category1', 'category2', 'conditionName', 'locationNumber', 'sellerProductId', 'storeName', 'dateCreated']);

      if (sortBy === 'field') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }

    if ((sortBy != 'field') && (sortBy != 'direction')) {
      await getAllRRC(whereInfo, sortBy, offset, limit, resp);
      respond(resp, res, next);
    }
  }

}

var getProductLiteProducts = async (req, resp, res, next) => {
  var coinFilter = [];
  var limit = 50;
  var offset = 0;
  var whereInfo = {
    clause: '',
    values: []
  };
  var coinWhereInfo = {
    clause: '',
    values: []
  }
  var sortBy = '';
  var includeShippingBoxes = false;


  //default values
  let includeBubble = false;
  let removeProductsWithIssues = false;
  let onlineEligibleLocation = false;
  whereInfo.clause = ' WHERE 1=1 ';
  sortBy = 'p.sku DESC';

  if (req.query.includeBubble && req.query.includeBubble.toUpperCase() === "TRUE") {
    includeBubble = true;
  }
  if (req.query.includeShippingBoxes && req.query.includeShippingBoxes.toUpperCase() === "TRUE") {
    includeShippingBoxes = true;
  }

  if (req.query.isOnline != undefined) {
    if (req.query.isOnline.toUpperCase() === "TRUE") {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.online_shopping = "Y"');
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_product_id > 0');
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_variant_id > 0');
    } else if (req.query.isOnline.toUpperCase() === "FALSE") {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.online_shopping = "N"');
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_product_id > 0');
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_variant_id > 0');
    }
  }
  if (req.query.autoOnlineSkus) {
    if (req.query.autoOnlineSkus.toUpperCase() === 'Y') {
      whereInfo = sqlUtils.appendWhere(whereInfo, `( DATE(CONVERT_TZ(p.date_to_release, '+00:00', '${process.env.UTC_OFFSET}')) < DATE_SUB(CURDATE(), INTERVAL 30 DAY) OR p.date_to_release IS NULL )`);
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.online_shopping = "Y"');
    } else if (req.query.autoOnlineSkus.toUpperCase() === 'N') {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_to_release IS NULL');
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.online_shopping = "N"');
    }
  }
  if (req.query.removeProductsWithIssues && req.query.removeProductsWithIssues.toUpperCase() === 'TRUE') {
    removeProductsWithIssues = true;
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_issue = "N"');
    whereInfo = sqlUtils.appendWhere(whereInfo, '( bi.done = 1 OR ( m.manifest_source = "STS" AND ( bi.done IS NULL OR bi.done = 1 ) ) )');
    whereInfo = sqlUtils.appendWhere(whereInfo, '( piq.resolved = 1 OR piq.resolved IS NULL )');
  }
  if (req.query.onlineEligibleLocation) {
    onlineEligibleLocation = true;
    whereInfo = sqlUtils.appendWhere(whereInfo, 'l.online_eligible = ?', req.query.onlineEligibleLocation);
  }
  if (req.query.rushSku) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku IN (?)');
    whereInfo.values.push(req.query.rushSku.split(","));
  }
  if (req.query.storeId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.store_id = ?', req.query.storeId);
  }
  if (req.query.dropshipType) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_type = ?', req.query.dropshipType);
  }
  if (req.query.inMarketExclusive) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.in_market_exclusive = ?', req.query.inMarketExclusive);
  }
  if (req.query.palletNumber) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.pallet_number = ?', req.query.palletNumber);
  }
  if (req.query.locationNumber) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.location_number IN (?)');
    whereInfo.values.push(req.query.locationNumber.split(','));
  }
  if (req.query.status) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.status IN (?)');
    whereInfo.values.push(req.query.status.split(','));
  }
  if (req.query.createdDateStart && req.query.createdDateStart instanceof Date) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created >= ?', req.query.createdDateStart);
  }
  if (req.query.vendorId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'm.vendor_id = ?', req.query.vendorId);
  }
  if (req.query.sellerProductId) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.seller_product_id IN (?)');
    whereInfo.values.push(req.query.sellerProductId.split(','));
  }
  if (req.query.manifestSource) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'm.manifest_source = ?', req.query.manifestSource);
  }
  if (req.query.vendorProducts) {
    //send in JSON string of vendor objects

    let vendorProducts = JSON.parse(req.query.vendorProducts);
    if (vendorProducts.length) {
      let vendorProductSql = {
        clause: "",
        values: ""
      };
      let addOr = "";
      for (i = 0; i < vendorProducts.length; i++) {
        if (vendorProductSql.clause.length) {
          addOr = "OR";
        }
        if (vendorProducts[i].vendorSku.trim().length && vendorProducts[i].vendorId.trim().length) {
          vendorProductSql.clause = `${vendorProductSql} ${addOr} ( p.seller_product_id = ? AND m.vendor_id = ? ) `;
          vendorProductSql.values.push(vendorProducts[i].vendorSku);
          vendorProductSql.values.push(vendorProducts[i].vendorId);
        }
      }
      if (vendorProductSql.clause.length) {
        whereInfo = sqlUtils.appendWhere(whereInfo, `( ${vendorProductSql.clause} )`, vendorProductSql.values);
      }
    }
  }
  if (req.query.freshnessScoreMin) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.freshness_score >= ?', req.query.freshnessScoreMin);
  }
  if (req.query.freshnessScoreMax) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.freshness_score <= ?', req.query.freshnessScoreMax);
  }
  if (req.query.category1Id) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'c2.category_id = ?', req.query.category1Id);
  }
  if (req.query.category2Id) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'c.category_id = ?', req.query.category2Id);
  }
  if (req.query.featuredCategory) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'c.featured_category IN (?)');
    whereInfo.values.push(req.query.featuredCategory.split(','));
  }
  if (req.query.suppressMarketingCategories) {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'c2.remove_from_marketing_merchandise = "N"');
  }
  //limit, offset, sortby
  if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
    limit = parseInt(req.query.limit);
  }
  if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
    offset = parseInt(req.query.offset);
  }
  if (req.query.sortBy) {
    sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku', 'name']);
    if (sortBy === 'field') {
      respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
    } else if (sortBy === 'direction') {
      respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
    }
  }
  if ((sortBy != 'field') && (sortBy != 'direction')) {
    resp = await getAllProductsLite(includeShippingBoxes, includeBubble, removeProductsWithIssues, onlineEligibleLocation, whereInfo, sortBy, offset, limit, resp);
    respond(resp, res, next);
  }

}




//
//  GET /rushProducts/eddCache/size
//
router.get(`/eddCache/size`, async (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: memberText.get('GET_SUCCESS'),
      data: {

      }
    }

    getEDDCacheSize(resp)

    respond(resp, res, next)
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['data'])
  }
})



//
//  GET /rushProducts/eddCache/clear
//
router.get(`/eddCache/clear`, async (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: memberText.get('GET_SUCCESS'),
      data: {

      }
    }

    clearEDDCache(resp)

    respond(resp, res, next)
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['data'])
  }
})



//
//  GET /rushProducts/state
//
router.get(`/state`, async (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: memberText.get('GET_SUCCESS'),
      data: {
        states: []
      }
    }

    if ((req.query.customerId === undefined) && (req.query.market === undefined) && (req.query.zip === undefined)) {
      respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "customerId or market or zip"));
    } else if ((req.query.coinId === undefined) || (req.query.coinId.length === 0)) {
      respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "coinId"));
    } else {


      resp = await getBulkStateByCoin(req, resp)

      respond(resp, res, next)
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['data'])
  }
})




//
//  GET /rushProducts/pricing
//
router.get(`/pricing`, async (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: memberText.get('GET_SUCCESS'),
      data: {
        partnerSellingPrice: 0.00,
        productCost: 0.00
      }
    }

    if ((req.query.sku === undefined) && ((req.query.vendorId === undefined) || (req.query.vendorSku === undefined) || (req.query.pricingType === undefined))) {
      respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "pricingType, sku or vendorId and vendorSku"));
    } else {

      await calculatePricing(req, resp)

      respond(resp, res, next)
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['data'])
  }
})






//
//  GET /rushProducts/{id}
//
//	TODO will want to verifyToken after Shopify no longer needs rushProducts
//
router.get(`/:id`, async (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: memberText.get('GET_SUCCESS'),
      data: {}
    }

    if ((req.query.customerId === undefined) && (req.query.market === undefined) && (req.query.zip === undefined)) {
      respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "customerId or market or zip"));
    } else {

      resp = await getByCoin(req, resp)

      respond(resp, res, next)
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['data'])
  }
})



//
//  PUT /rushProducts/{id}/cachePurge
//
router.put(`/:id/cachePurge`, async (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: memberText.get('GET_SUCCESS'),
    }

    if (req.get('x-app-type') != 'INT') {
      response.respond(resp, res, next, undefined, 403, 'Access denied.')
    } else {
      resp = await purgeByCoin(req, resp)
    }

    respond(resp, res, next)
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['data'])
  }
})



//
//  GET /rushProducts/{id}/state
//
//	TODO will want to verifyToken after Shopify no longer needs rushProducts
//
router.get(`/:id/state`, async (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: memberText.get('GET_SUCCESS'),
      data: {
        coinId: req.params.id,
        eligibilityFlag: false,
        totalOnHold: 0
      }
    }

    if ((req.query.customerId === undefined) && (req.query.market === undefined) && (req.query.zip === undefined)) {
      respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "customerId or market or zip"));
    } else {

      resp = await getStateByCoin(req, resp)

      respond(resp, res, next)
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['data'])
  }
})






module.exports = router