'use strict';

const express = require('express');
const router = express.Router();
const check = require('check-types');

const categoryQuantities = require('../actions/categoryQuantities');
const memberText = require('../utils/memberTextUtils')
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

//  GET /marketCategories/
router.get(`/`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {},
    metaData: {
      totalCount: 0
    }
  };

  let whereInfo = {
    clause: 'where 1=1',
    values: []
  };
  let sortBy = "cq.category_id";

  // limit and offset defaults and query overrides
  let limit = 10;
  let offset = 0;

  try {

    if (req.query.storeId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'cq.store_id = ?', req.query.storeId);
    }
    if (req.query.categoryId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'cq.category_id = ?', req.query.categoryId);
    }
    //
    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }
    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }
    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['cq.category_id', 'cq.store_id']);
      if (sortBy === 'field') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    if ((sortBy != 'field') && (sortBy != 'direction')) {
      categoryQuantities.getAll(whereInfo, sortBy, offset, limit, resp)
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


//  GET /marketCategories/:id
router.get(`/:id`, (req, res, next) => {
  try {
    let resp = {
      statusCode: 200,
      message: 'Success.',
      data: {}
    };

    categoryQuantities.getById(req.params.id, resp)
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

// POST /marketCategories/
router.post(`/`, (req, res, next) => {
  var resp = {
    statusCode: 201,
    message: 'Success.',
    id: 0
  };
  try {
    if (req.body.categoryId === undefined || req.body.storeId === undefined ) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'categoryId, storeId'));
    } else {
      categoryQuantities.create(req.body.categoryId, req.body.storeId, req.body.maxQtyOnFloor, req.body.maxQtyPerCoin, resp)
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

// PUT marketCategories/:id
router.put('/:id', (req, res, next) => {
  try {
    let valid = true;
    let resp = {
      statusCode: 200,
      message: 'Success.'
    };
    let setInfo = {
      clause: '',
      values: []
    };

    // create setInfo
    if (req.body.categoryId) {
      setInfo = sqlUtils.appendSet(setInfo, 'category_id = ?', req.body.categoryId);
    }
    if (req.body.storeId) {
      setInfo = sqlUtils.appendSet(setInfo, 'store_id = ?', req.body.storeId);
    }
    if (req.body.maxQtyOnFloor) {
      setInfo = sqlUtils.appendSet(setInfo, 'max_qty_on_floor = ?', req.body.maxQtyOnFloor);
    }
    if (req.body.maxQtyPerCoin) {
      setInfo = sqlUtils.appendSet(setInfo, 'max_qty_per_coin = ?', req.body.maxQtyPerCoin);
    }

    categoryQuantities.updateById(req.params.id, setInfo, resp)
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

// delete master data by id (DELETE)
router.delete(`/:id`, (req, res, next) => {
  try {
    let resp = {
      statusCode: 200,
      message: 'Success.'
    };
    categoryQuantities.remove(req.params.id, resp)
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