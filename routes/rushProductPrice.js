'use strict';

const express = require('express');
const router = express.Router();

const RushProductPrice = require('../actions/rushProductPrice');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const memberText = require('../utils/memberTextUtils');
const sqlUtils = require('../utils/sqlUtils');

router.put('/:sku', async (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: memberText.get("GET_SUCCESS"),
      data: {}
    };
    var productPriceSetInfo = {
      clause: '',
      values: []
    }
    var stagingProductPriceSetInfo = {
      clause: '',
      values: []
    }

    //Only allow internal access to update price
    if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, undefined, 403, 'Access denied.')
		} else {
      // Required fields
      if (!req.body.newPrice || !req.body.msrp || !req.body.marketPrice || !req.body.newPricingTypeId || !req.body.userId) {
        resp = response.formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "newPrice, msrp, marketPrice, newPricingTypeId, userId"));
        response.respond(resp, res, next);
      } else {
        //validation
        if (req.body.newPrice == undefined || Number.parseFloat(req.body.newPrice) <= 0) {
          resp = formatResp(resp, undefined, 400, "Price must be greater than 0.");
        } else {
          //Values to be set on the product
          productPriceSetInfo = sqlUtils.appendSet(productPriceSetInfo, 'price = ?', Number.parseFloat(req.body.newPrice));
          stagingProductPriceSetInfo = sqlUtils.appendSet(stagingProductPriceSetInfo, 'price = ?', Number.parseFloat(req.body.newPrice));
          if (req.body.msrp) {
            productPriceSetInfo = sqlUtils.appendSet(productPriceSetInfo, 'msrp = ?', Number.parseFloat(req.body.msrp));
            stagingProductPriceSetInfo = sqlUtils.appendSet(stagingProductPriceSetInfo, 'msrp = ?', Number.parseFloat(req.body.msrp));
          }
          if (req.body.marketPrice) {
            productPriceSetInfo = sqlUtils.appendSet(productPriceSetInfo, 'market_price = ?', Number.parseFloat(req.body.marketPrice));
            stagingProductPriceSetInfo = sqlUtils.appendSet(stagingProductPriceSetInfo, 'market_price = ?', Number.parseFloat(req.body.marketPrice));
          }
          if (req.body.disposalFee) {
            productPriceSetInfo = sqlUtils.appendSet(productPriceSetInfo, 'disposql_fee = ?', Number.parseFloat(req.body.disposalFee));
          }
          if (req.body.newPricingTypeId) { 
            productPriceSetInfo = sqlUtils.appendSet(productPriceSetInfo, 'pricing_type_id = ?', Number.parseInt(req.body.newPricingTypeId));
          } 
          if (productPriceSetInfo.clause.length > 0) {
            await RushProductPrice.updateProductPriceBySku(req.params.sku, req.body.userId, req.body.newPrice, req.body.msrp, req.body.newPricingTypeId, productPriceSetInfo, stagingProductPriceSetInfo, resp);
          }
        }
      }
    }
    response.respond(resp, res, next);
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

module.exports = router