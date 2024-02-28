'use strict';

const express = require('express');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils');
const { locateSku } = require('../actions/productsProcessLocate');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils')
const { formatResp, respond } = require('../utils/response');
const { getUserIdAndType } = require('../utils/userUtils')

//
//  PUT /products/process/locate/:rushSku
//
router.put('/:rushSku', jwtUtils.verifyToken, async (req, res, next) => {
  try {
    const resp = {
      statusCode: 200,
      message: 'Success'
    };

    if (
      (req.get('x-app-type') === 'EXT' && !req.decoded.identity?.partnerId) ||
      (req.get('x-app-type') === 'INT' && !req.body.partnerId)) {
      respond({}, res, next, [], 403, "Access denied.");
    }

    const { userId, userType } = getUserIdAndType(req);
    const partnerId = req.decoded.identity?.partnerId || req.body.partnerId;
    const facilityId = req.decoded.identity?.facilityId || req.body.facilityId;

    const { rushSku } = req.params;
    const { location } = req.body;
    const { storeId } = req.body; 
    const notes = req.body.notes ? req.body.notes.trim() : req.body.notes;

    if (!location.area || !location.zone || !location.location) {
      const missingResp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED')
        .replace('%required%', 'location.area, location.zone, location.location'));
      respond(missingResp, res, next);
      return;
    }

    if (typeof location.area !== 'number' || location.area.toString().length !== 3) {
      respond({}, res, next, [], 400, `invalid value for location.area`);
      return;
    }

    if (location.zone.length !== 1 || !/\w/.test(location.zone)) {
      respond({}, res, next, [], 400, `invalid value for location.zone`);
      return;
    }

    if (location.location.length !== 4 || !/\d{4}/.test(location.location)) {
      respond({}, res, next, [], 400, `invalid value for location.location`);
      return;
    }

    const adjustedLocation = { ...location, zone: location.zone.toUpperCase() };
    await locateSku(rushSku, adjustedLocation, notes, partnerId, facilityId, userId, userType, storeId);
    respond({ ...resp, success: true }, res, next);
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, {});
  }
});

module.exports = router
