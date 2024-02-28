'use strict'

const bwipjs = require('bwip-js');
const express = require('express')
const router = express.Router()

const Barcodes = require('../models/barcodes');

const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const memberText = require('../utils/memberTextUtils')


// Create
router.get(`/`, async (req, res, next) => {
  try {
    var barcodeType = process.env.BCODE_TYPE ? process.env.BCODE_TYPE : 'code39';
    var barcodeWidth = process.env.BCODE_WIDTH ? process.env.BCODE_WIDTH : 60;
    var barcodeScaleX = process.env.BCODE_SCALEX ? process.env.BCODE_SCALEX : 1;
    var barcodeScaleY = process.env.BCODE_SCALEY ? process.env.BCODE_SCALEY : 1;

    var resp = {
      statusCode: 201,
      message: 'Success.'
    }

    if (req.query.id === undefined) {
      response.respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "id"));
    } else {


      //  Lookup the passed id.  Can be an email address, a rush member id or a shopify customer id.
      var alias = await Barcodes.lookupAlias(req.query.id);

      if (alias === undefined) {
        response.respond(resp, res, next, undefined, 404, 'ID not recognized.');
      } else {
        //  Format the URL for the bwip request processor.
        req.url += '&bcid=' + barcodeType;
        req.url += '&width=' + barcodeWidth;
        req.url += '&scaleX=' + barcodeScaleX;
        req.url += '&scaleY=' + barcodeScaleY;
        req.url += '&text=' + alias;

        bwipjs.request(req, res);
      }
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined)
  }
})


module.exports = router;