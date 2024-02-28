'use strict';

const express = require('express');
const router = express.Router();
const check = require('check-types');

const StorageLocations = require('../actions/storageLocations');

const memberText = require('../utils/memberTextUtils')
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');


//  Get all storage locations (GET)
router.get(`/`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    metaData: {
      totalCount: 0
    },
    data: {}
  };

  let whereInfo = {
    clause: 'where 1=1',
    values: []
  };

  let sortBy = "storage_zone, storage_location ASC";

  // limit and offset defaults and query overrides
  let limit = 10;
  let offset = 0;

  try {
    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }
    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }
    // add where clause
    if (req.query.storeId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.store_id = ?', req.query.storeId);
    }
    if (req.query.partnerFacility) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 's.partner_facility = ?', req.query.partnerFacility);
    }
    if (req.query.storageArea) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.storage_area = ?', req.query.storageArea);
    }
    if (req.query.itemType) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.item_type = ?', req.query.itemType);
    }
    if (req.query.storageZone) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.storage_zone = ?', req.query.storageZone);
    }
    if (req.query.storageLocation) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.storage_location = ?', req.query.storageLocation);
    }
    if (req.query.active) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.active = ?', req.query.active);
    }
    if (req.query.onlineEligible) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.online_eligible = ?', req.query.onlineEligible);
    }
    if (req.query.marketFloor) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.market_floor = ?', req.query.marketFloor);
    }
    if (req.query.locationNumber) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.location_number = ?', req.query.locationNumber);
    }
    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['storage_zone', 'storage_location', 'storage_area', 'location_number']);
      if (sortBy === 'field') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    if ((sortBy != 'field') && (sortBy != 'direction')) {
      StorageLocations.getAll(whereInfo, sortBy, offset, limit, resp)
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

//GET all storage zones
router.get(`/storageZones`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    metaData: {
      totalCount: 0
    },
    data: {}
  };

  let whereInfo = {
    clause: 'where 1=1',
    values: []
  };
  let groupBy = "l.store_id, storage_zone, storage_location";
  let sortBy = "l.store_id, storage_zone, storage_location";

  // limit and offset defaults and query overrides
  let limit = 10;
  let offset = 0;

  try {
    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }
    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }
    if (req.query.storeId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.store_id = ?', req.query.storeId);
    }
    if (req.query.partnerFacility) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 's.partner_facility = ?', req.query.partnerFacility);
    }
    if (req.query.storageArea) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'storage_area = ?', req.query.storageArea);
    }
    if (req.query.storageZone) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'storage_zone = ?', req.query.storageZone);
    }
    if (req.query.onlineEligible) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'online_eligible = ?', req.query.onlineEligible);
    }
    if (req.query.marketFloor) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'market_floor = ?', req.query.marketFloor);
    }
    if (req.query.itemType) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'item_type = ?', req.query.itemType);
    }
    if (req.query.active) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'l.active = ?', req.query.active);
    }
    StorageLocations.getStorageZones(whereInfo, sortBy, offset, limit, resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

//GET storage zones for area and store
router.get(`/storageZones/:storageAreaId/:storeId/`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    metaData: {
      totalCount: 0
    },
    data: {}
  };

  let whereInfo = {
    clause: 'where 1=1',
    values: []
  };

  let sortBy = "store_id, storage_zone, storage_location";

  // limit and offset defaults and query overrides
  let limit = 10;
  let offset = 0;

  try {
    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }
    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }
    //required fields
    whereInfo = sqlUtils.appendWhere(whereInfo, 'storage_area = ?', req.params.storageAreaId);
    whereInfo = sqlUtils.appendWhere(whereInfo, 'store_id = ?', req.params.storeId);
    if (req.query.active) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'active = ?', req.query.active);
    }
    StorageLocations.getStorageZones(whereInfo, sortBy, offset, limit, resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})


router.post(`/`, (req, res, next) => {
  let resp = {
    statusCode: 201,
    message: 'Success.',
    id: 0
  };
  let itemType = 'Product';
  let inInventoryCount = 'N';
  let onlineEligible = 'Y';
  let marketFloor = 'Y';
  let checkBuildStatus = 'N';
  let printLabel = 'N';
  try {
    if ((req.body.storeId === undefined) || (req.body.storageArea === undefined) || (req.body.storageZone === undefined) || 
        (req.body.storageLocation === undefined) || (req.body.locationType === undefined)) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'storeId, storageArea, storageZone, storageLocation, locationType'))
    }
    else if ((req.body.itemType) && (req.body.itemType !== 'Box') && (req.body.itemType !== 'Product')) {
      response.respond(resp, res, next, ['id'], 400, 'Invalid value for itemType.  Must be Box or Product.');
    }
    else if ((req.body.inInventoryCount) && (req.body.inInventoryCount !== 'Y') && (req.body.inInventoryCount !== 'N')) {
      response.respond(resp, res, next, ['id'], 400, 'Invalid value for inInventoryCount.  Must be Y or N.');
    }
    else if ((req.body.checkBuildStatus) && (req.body.checkBuildStatus !== 'Y') && (req.body.checkBuildStatus !== 'N')) {
      response.respond(resp, res, next, ['id'], 400, 'Invalid value for checkBuildStatus.  Must be Y or N.');
    }
    else if ((req.body.printLabel) && (req.body.printLabel !== 'Y') && (req.body.printLabel !== 'N')) {
      response.respond(resp, res, next, ['id'], 400, 'Invalid value for printLabel.  Must be Y or N.');
    }
    else {
      if (req.body.onlineEligible) {
        onlineEligible = req.body.onlineEligible;
      }
      if (req.body.marketFloor) {
        marketFloor = req.body.marketFloor;
      }
      if (req.body.itemType) {
        itemType = req.body.itemType;
      }
      if (req.body.inInventoryCount) {
        inInventoryCount = req.body.inInventoryCount;
      }
      if (req.body.checkBuildStatus) {
        checkBuildStatus = req.body.checkBuildStatus;
      }
      if (req.body.printLabel) {
        printLabel = req.body.printLabel;
      }
      StorageLocations.create(req.body.storeId, req.body.storageArea, req.body.storageZone, req.body.storageLocation, req.body.locationType, onlineEligible, marketFloor, itemType, inInventoryCount, checkBuildStatus, printLabel, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined)
        })
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id'])
  }
})

module.exports = router;