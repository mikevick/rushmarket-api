'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const Manifests = require('../actions/manifests');

const Partners = require('../models/partners');

const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const { respond } = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//  Get all product display attributes (GET)
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    metaData: {
      totalCount: 0
    },
    data: {}
  };
  let whereInfo = {
    clause: ' WHERE 1=1 ',
    values: []
  };

  // limit and offset defaults and query overrides
  let limit = 10;
  let offset = 0;
  let sortBy = "m.date_created DESC";
  let storeIdRows = [];

  try {
		if (req.get('x-app-type') === 'EXT' && (req.decoded.identity === undefined ||
			(req.decoded.identity.type !== 'PARTNER' && req.decoded.identity.type !== 'PARTNERUSER'))) {
			respond(resp, res, next, [], 403, 'Access denied.');
			return;
		}
    
    
    if ((req.get('x-device-id') === 'rrc') || (req.get('x-app-type') === 'EXT')) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.manifest_source IN (?)');
      whereInfo.values.push('DIRECT_BUY');
      
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.manifest_type = ?', 'Purchase');

      if (req.get('x-app-type') === 'EXT') {
			  if (req.decoded.identity.type === 'PARTNER') {
				  storeIdRows = await Partners.getAllFacilityStoreIdsByPartnerId(req.decoded.identity.partnerId);
			  }
			  if (req.decoded.identity.type === 'PARTNERUSER') {
				  storeIdRows = await Partners.getAllFacilityStoreIdsByPartnerUserId(req.decoded.identity.partnerId, req.decoded.identity.userId);
			  }
      }
      else {
        if (!req.query.storeId) {
          respond(resp, res, next, ["metaData", "data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "storeId"));
          return;  
        }

        storeIdRows.push({storeId: req.query.storeId});
      }

      let storeList = '';
      storeIdRows.map(store => {
        if (storeList.length) {
          storeList += ', ';
        }
        storeList += store.storeId;
      })

      whereInfo = sqlUtils.appendWhere(whereInfo, `m.store_id IN (${storeList})`);

    }


    if (req.query.manifestSource) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.manifest_source IN (?)');
      whereInfo.values.push(req.query.manifestSource.split(","));
    }
    if (req.query.manifestType) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.manifest_type = ?', req.query.manifestType);
    }
    if (req.query.manifestId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.manifest_id = ?', req.query.manifestId);
    }
    if (req.query.archived !== undefined && req.query.archived !== null && (Number.parseInt(req.query.archived) === 1 || Number.parseInt(req.query.archived) === 0)) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.archived = ?', req.query.archived);
    }
    if (req.query.manifestIdentifier) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.manifest_identifier = ?', req.query.manifestIdentifier);
    }
    if (req.query.received !== null && req.query.received !== undefined && (Number.parseInt(req.query.received) === 1 || Number.parseInt(req.query.received) === 0)) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.received = ?', req.query.received);
    }
    if (req.query.dateCreatedFrom) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.date_created >= ?', DATE(CONVERT_TZ(req.query.dateCreatedFrom, '${process.env.UTC_OFFSET}', '+00:00')) );
    }
    if (req.query.dateCreatedTo) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.date_created <= ?', DATE(CONVERT_TZ(req.query.dateCreatedFrom, '${process.env.UTC_OFFSET}', '+00:00')) );
    }
    if (req.query.dateReceivedFrom) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'mr.received_date >= ?', DATE(CONVERT_TZ(req.query.dateCreatedFrom, '${process.env.UTC_OFFSET}', '+00:00')) );
    }
    if (req.query.dateReceivedTo) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'mr.received_date <= ?', DATE(CONVERT_TZ(req.query.dateCreatedFrom, '${process.env.UTC_OFFSET}', '+00:00')) );
    }
    if (req.query.issue) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'mr.issue IN (?)');
      whereInfo.values.push(req.query.issue.split(","));
    }
    if (req.query.manifestSellerId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.manifest_seller_id = ?', req.query.manifestSellerId);
    }
    if (req.query.vendorId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.vendor_id = ?', req.query.vendorId);
    }
    if (req.query.receivedStoreId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'mr.received_store_id = ?', req.query.receivedStoreID);
    }
    if (req.query.expectedStoreId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'm.store_id = ?', req.query.expectedStoreId);
    }

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }
    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }
    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['m.date_created', 'm.manifest_identifier']);
      if (sortBy === 'field') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    Manifests.getAll(whereInfo, sortBy, offset, limit, resp)
      .then((resp) => {
        respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

router.get(`/:id`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };

  try {
    Manifests.getById(req.params.id, resp)
      .then((resp) => {
        respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

module.exports = router;


