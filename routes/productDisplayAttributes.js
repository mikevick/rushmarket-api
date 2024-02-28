'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const ProductDisplayAttributes = require('../actions/productDisplayAttributes');
const memberText = require('../utils/memberTextUtils');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

//  Get all product display attributes (GET)
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
    if (req.query.sku) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sku = ?', req.query.sku);
    }

    if (req.query.attributeName) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'attribute_name = ?', req.query.attributeName);
    }

    if (req.query.attributeValue) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'attribute_value = ?', req.query.attributeValue);
    }


    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku', 'attribute_name', 'attribute_value']);

      if (sortBy === 'field') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    ProductDisplayAttributes.getAll(whereInfo, sortBy, offset, limit, resp)
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

//  Get product display attributes by id (GET)
router.get(`/:id`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };

  try {
    ProductDisplayAttributes.getById(req.params.id, resp)
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

// Create product display attributes (POST)
router.post(`/`, (req, res, next) => {
  let resp = {
    statusCode: 201,
    message: 'Success.',
    id: 0
  };
  try {
    if (req.body.sku === undefined && req.body.attributeName === undefined && req.body.attributeValue === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'sku, attributeName, and attributeValue'));
    } else {
      ProductDisplayAttributes.create(req.body.sku, req.body.attributeName, req.body.attributeValue, resp)
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

// Update product display attributes (PUT)
router.put('/:id', (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    id: 0
  };
  let setInfo = {
    clause: '',
    values: []
  };

  try {
    // create setInfo
    if (req.body.sku) {
      setInfo = sqlUtils.appendSet(setInfo, 'sku = ?', req.body.sku);
    }
    if (req.body.attributeName) {
      setInfo = sqlUtils.appendSet(setInfo, 'attribute_name = ?', req.body.attributeName);
    }
    if (req.body.attributeValue) {
      setInfo = sqlUtils.appendSet(setInfo, 'attribute_value = ?', req.body.attributeValue);
    }

    ProductDisplayAttributes.updateById(req.params.id, setInfo, resp)
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

// delete product display attribute by id (DELETE)
router.delete(`/:id`, (req, res, next) => {
  try {
    let resp = {
      statusCode: 200,
      message: 'Success.'
    };
    ProductDisplayAttributes.remove(req.params.id, resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, ['id']);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp);
  }
})

module.exports = router;


