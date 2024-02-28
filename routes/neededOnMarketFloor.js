'use strict';

const express = require('express');
const router = express.Router();

const NeededOnMarketFloor = require('../actions/neededOnMarketFloor');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const memberText = require('../utils/memberTextUtils');

//  GET /marketFeature
router.get(`/`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };
  let vendorSkuDataList = [];

  try {
    if (req.query.storeId === undefined || req.query.vendorSkuData === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'storeId, vendorSkuData'));
    } else {
      //JSON.parse()
      vendorSkuDataList = JSON.parse(req.query.vendorSkuData);
      NeededOnMarketFloor.getNeededOnMarketFloor(req.query.storeId, vendorSkuDataList, resp)
        .then((resp) => {
          response.respond(resp, res, next);
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined);
        })
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

module.exports = router;