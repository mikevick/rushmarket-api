'use strict';

const express = require('express');
const router = express.Router();

const IsReadyForOnline = require('../actions/isReadyForOnline');
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
    if (req.query.sku === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'sku'));
    } else {
      IsReadyForOnline.getIsReadyForOnline(req.query.sku, req.query.SkipReleaseDate, resp)
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