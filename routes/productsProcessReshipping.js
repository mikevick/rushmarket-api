'use strict';

const express = require('express');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils');
const { reshipSku } = require('../actions/productsProcessReshipping');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils')
const { formatResp, respond } = require('../utils/response');
const { getUserIdAndType } = require('../utils/userUtils')

const validBooleanValues = ['Y', 'N'];

//
//  PUT /products/process/reshipping/:rushSku
//
router.put('/:rushSku', jwtUtils.verifyToken, async (req, res, next) => {
  try {
    const resp = {
      statusCode: 200,
      message: 'Success'
    };

    const { userId, userType } = getUserIdAndType(req);
    const facilityId = req.decoded.identity?.facilityId || req.body.facilityId;

    const { rushSku } = req.params;
    const { storeId } = req.body; 
    const { inOriginalBoxes, boxes, reusePackaging, incorrectBoxDims } = req.body;
    const notes = req.body.notes ? req.body.notes.trim() : req.body.notes;

    if (!inOriginalBoxes || !boxes || !Array.isArray(boxes) || !reusePackaging || !incorrectBoxDims) {
      const missingResp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED')
        .replace('%required%', 'inOriginalBoxes, boxes, reusePackaging, incorrectBoxDims'));
      respond(missingResp, res, next);
      return;
    }

    // validate booleans
    if (!validBooleanValues.includes(inOriginalBoxes)) {
      respond({}, res, next, [], 400, `invalid value for inOriginalBoxes`);
      return;
    }
    if (!validBooleanValues.includes(reusePackaging)) {
      respond({}, res, next, [], 400, `invalid value for reusePackaging`);
      return;
    }
    if (!validBooleanValues.includes(incorrectBoxDims)) {
      respond({}, res, next, [], 400, `invalid value for incorrectBoxDims`);
      return;
    }

    // ensure all boxes are valid
    const boxesValid = boxes.reduce((results, box) => results &&
        validDecimal(box.shippingWeight) &&
        validDecimal(box.packageHeight) &&
        validDecimal(box.packageWidth) &&
        validDecimal(box.packageLength)
      , true);

    if (!boxesValid) {
      respond({}, res, next, [], 400, `boxes with invalid data submitted`);
      return;
    }

    // round up to 2 decimals, e.g. 2.05 -> 2.05 and 2.051 -> 2.06
    const roundedBoxes = boxes.map(box => ({
      shippingWeight: roundUpToTwoDecimals(box.shippingWeight),
      packageHeight: roundUpToTwoDecimals(box.packageHeight),
      packageWidth: roundUpToTwoDecimals(box.packageWidth),
      packageLength: roundUpToTwoDecimals(box.packageLength)
    }));

    await reshipSku(rushSku, inOriginalBoxes, roundedBoxes, reusePackaging, incorrectBoxDims, notes, facilityId, userId, userType, storeId);
    respond({ ...resp, success: true }, res, next);
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, {});
  }
});

function validDecimal(number) {
  return typeof number === 'number' && number > 0;
}

function roundUpToTwoDecimals(number) {
  return Math.ceil((number - 4 * Number.EPSILON) * 100) / 100;
}

module.exports = router
