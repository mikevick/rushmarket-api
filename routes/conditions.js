'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const Conditions = require('../actions/conditions');
const memberText = require('../utils/memberTextUtils');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

//  Get all conditions (GET)
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
  let sortBy = "sort_order ASC";

  try {
    if (req.query.conditionId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'condition_id = ?', req.query.conditionId);
    }

    if (req.query.conditionName) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'condition_name = ?', req.query.conditionName);
    }

    if (req.query.active) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'active = ?', req.query.active);
    }

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sort_order', 'condition_name', 'active']);

      if (sortBy === 'field') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    Conditions.getAll(whereInfo, sortBy, offset, limit, resp)
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

//  Get conditions by id (GET)
router.get(`/:id`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };

  try {
    Conditions.getById(req.params.id, resp)
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

// Create conditions (POST)
router.post(`/`, (req, res, next) => {
  let resp = {
    statusCode: 201,
    message: 'Success.',
    id: 0
  };
  try {
    if (req.body.conditionName === undefined || req.body.sortOrder === undefined || req.body.active === undefined || req.body.costMarkup === undefined || req.body.pctOfMsrp === undefined || req.body.pctOfPrice === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'conditionName, sortOrder, active, costMarkup, pctOfMsrp, pctOfPrice'));
    } else {
      Conditions.create(req.body.conditionName, req.body.sortOrder, req.body.active, req.body.costMarkup, req.body.pctOfMsrp, req.body.pctOfPrice, resp)
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

// Update conditions (PUT)
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
    if (req.body.conditionName) {
      setInfo = sqlUtils.appendSet(setInfo, 'condition_name = ?', req.body.conditionName);
    }
    if (req.body.sortOrder) {
      setInfo = sqlUtils.appendSet(setInfo, 'sort_order = ?', req.body.sortOrder);
    }
    if (req.body.active) {
      setInfo = sqlUtils.appendSet(setInfo, 'active = ?', req.body.active);
    }
    if (req.body.costMarkup) {
      setInfo = sqlUtils.appendSet(setInfo, 'cost_markup = ?', req.body.costMarkup);
    }
    if (req.body.pctOfMsrp) {
      setInfo = sqlUtils.appendSet(setInfo, 'pct_of_msrp = ?', req.body.pctOfMsrp);
    }
    if (req.body.pctOfPrice) {
      setInfo = sqlUtils.appendSet(setInfo, 'pct_of_price = ?', req.body.pctOfPrice);
    }

    Conditions.updateById(req.params.id, setInfo, resp)
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

// delete conditions by id (DELETE)
router.delete(`/:id`, (req, res, next) => {
  try {
    let resp = {
      statusCode: 200,
      message: 'Success.'
    };
    Conditions.remove(req.params.id, resp)
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
