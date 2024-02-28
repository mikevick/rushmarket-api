'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const AvailableRushSkus = require('../actions/availableRushSkus');
const memberText = require('../utils/memberTextUtils');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

//  Get all available rush skus (GET)
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

  // limit and offset defaults and query overrides
  let limit = 10;
  let offset = 0;
  let sortBy = "sku ASC";

  try {
    // add where clause to select by name and status
    if (req.query.sku) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sku = ?', req.query.sku);
    }

    if (req.query.available) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'available = ?', req.query.available);
    }

    if (req.query.productId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'product_id = ?', req.query.productId);
    }

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku', 'available', 'product_id', 'date_created']);

      if (sortBy === 'field') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    AvailableRushSkus.getAll(whereInfo, sortBy, offset, limit, resp)
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


// Create category attributes (POST)
router.post(`/`, (req, res, next) => {
  let resp = {
    statusCode: 201,
    message: 'Success.',
    id: 0
  };
  try {
    if (req.body.sku === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'sku'));
    } else {
      AvailableRushSkus.create(req.body.sku, req.body.available, req.body.productId, resp)
        .then((resp) => {
          response.respond(resp, res, next);
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined);
        })    
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id']);
  }
})

// Update category attributes (PUT)
router.put('/:sku', (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.'
  };
  let setInfo = {
    clause: '',
    values: []
  };

  try {
    // create setInfo
    if (req.body.productId) {
      setInfo = sqlUtils.appendSet(setInfo, 'product_id = ?', req.body.productId);
      setInfo = sqlUtils.appendSet(setInfo, 'available = "N"');
    }

    AvailableRushSkus.updateBySku(req.params.sku, setInfo, resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id']);
  }
})

module.exports = router;
