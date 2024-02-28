'use strict';

const express = require('express');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils');
const { vcpUpdatableImageFields, verifySku } = require('../actions/productsProcessVerify');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const { formatResp, respond } = require('../utils/response');
const { getUserIdAndType } = require('../utils/userUtils');

//
//  PUT /products/process/verify/:rushSku
//
router.put('/:rushSku', jwtUtils.verifyToken, async (req, res, next) => {
  try {
    const resp = {
      statusCode: 200,
      message: 'Success'
    };

    if (req.get('x-app-type') === 'EXT' && (req.decoded.identity === undefined ||
      (req.decoded.identity.type !== 'PARTNER' && req.decoded.identity.type !== 'PARTNERUSER'))) {
      respond(resp, res, next, ['metaData', 'data'], 403, 'Access denied.');
      return;
    }

    const { userId, userType } = getUserIdAndType(req);
    const facilityId = req.decoded.identity?.facilityId || req.body.facilityId;

    const { rushSku } = req.params;
    const { storeId, vendorProductImages, verifications } = req.body;
    const notes = req.body.notes ? req.body.notes.trim() : req.body.notes;

    if (!verifications || !Array.isArray(verifications)) {
      const missingResp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED')
        .replace('%required%', 'verifications'));
      respond(missingResp, res, next);
      return;
    }

    // ensure there are no duplicate keys in the verifications list
    const { duplicateKeys } = verifications.reduce((results, verification) => {
      if (results.processed.has(verification.key)) {
        results.duplicateKeys.add(verification.key);
      } else {
        results.processed.add(verification.key);
      }
      return results;
    }, { processed: new Set(), duplicateKeys: new Set() });

    if (duplicateKeys.size) {
      const keyList = Array.from(duplicateKeys).join(', ');
      respond({}, res, next, [], 400, `verifications with duplicate keys submitted: [${keyList}]`);
      return;
    }

    if (vendorProductImages && (!Array.isArray(vendorProductImages) || vendorProductImages.reduce((invalid, image) =>
        invalid || !vcpUpdatableImageFields.includes(image.field) || !image.url, false))) {
      respond({}, res, next, [], 400, `invalid value for vendorProductImages`);
      return;
    }

    await verifySku(rushSku, verifications, notes, vendorProductImages || [], storeId, facilityId, userId, userType);
    respond({ ...resp, success: true }, res, next);
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, {});
  }
});

module.exports = router
