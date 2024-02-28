'use strict';

const express = require('express');
const router = express.Router();
const check = require('check-types');

const Pallets = require('../actions/pallets');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

//  GET /pallets/
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
  let groupBy = "sp.ext_pallet_number";
  let sortBy = "sp.ext_pallet_number";

  // limit and offset defaults and query overrides
  let limit = 10;
  let offset = 0;

  try {
    // add where clause to select by name and status
    if (req.query.storeId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sp.store_id = ?', req.query.storeId);
    }
    if (req.query.currentStoreId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sp.current_store_id = ?', req.query.currentStoreId);
    }
    if (req.query.pallet) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sp.pallet_number IN (?)');
      whereInfo.values.push(req.query.pallet.split(','));
    }
    if (req.query.extPalletNumber) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sp.ext_pallet_number IN (?)');
      whereInfo.values.push(req.query.extPalletNumber.split(','));
    }
    if (req.query.palletPrefix) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sp.pallet_prefix = ?', req.query.palletPrefix);
    }
    if (req.query.palletId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sp.pallet_id = ?', req.query.palletId);
    }
    if (req.query.storageArea) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sl.storage_area = ?', req.query.storageArea);
    }
    if (req.query.storageZone) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sl.storage_zone = ?', req.query.storageZone);
    }
    if (req.query.storageLocation) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sl.storage_location = ?', req.query.storageLocation);
    }
    
    //
    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }
    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }
    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sp.ext_pallet_number', sp.storeId]);
      if (sortBy === 'field') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    if ((sortBy != 'field') && (sortBy != 'direction')) {
      Pallets.getAll(whereInfo, sortBy, groupBy, offset, limit, resp)
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