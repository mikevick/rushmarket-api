'use strict';

const express = require('express');
const router = express.Router();

const fullInspectionRequired = require('../actions/fullInspectionRequired');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const memberText = require('../utils/memberTextUtils');



router.get(`/`, async (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };
  let vendorSkuDataList = [];

  try {
    if ((req.query.vendorSkuData === undefined) || (req.query.storeId === undefined)) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'storeId, vendorSkuData'));
    } else {
      //JSON.parse()
      vendorSkuDataList = JSON.parse(req.query.vendorSkuData);
      if (vendorSkuDataList[0].vendorId === undefined || vendorSkuDataList[0].vendorSku === undefined || vendorSkuDataList[0].quantity === undefined) {
        response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'vendorSkuData must contain vendorId, vendorSku and quantity'));
      } else {
        resp = await fullInspectionRequired.getFullInspectionRequired(req.query.storeId, vendorSkuDataList, resp);
        response.respond(resp, res);
      }
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

module.exports = router;