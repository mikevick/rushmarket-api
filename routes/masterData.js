'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const MasterData = require('../actions/masterData');

const memberText = require('../utils/memberTextUtils')
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

//  Get all master data (GET)
router.get(`/`, (req, res, next) => {
  try {
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
    let sortBy = "type ASC";

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    // add where clause to select by name and status
    if (req.query.type) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'type = ?', req.query.type);
    }

    if (req.query.active) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'active = ?', req.query.active);
    }

    if (req.query.value) { 
      whereInfo = sqlUtils.appendWhere(whereInfo, 'value = ?', req.query.value);
    }

    if (req.query.description) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'description = ?', req.query.description);
    }

    if (req.query.custom1) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'custom1 = ?', req.query.custom1);
    }

    if (req.query.custom2) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'custom2 = ?', req.query.custom2);
    }

    if (req.query.custom3) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'custom3 = ?', req.query.custom3);
    }                

    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['type', 'value', 'custom1', 'custom2', 'custom3', 'active']);

      if (sortBy === 'field') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    MasterData.getAll(whereInfo, sortBy, offset, limit, resp)
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

//  Get master data by id (GET)
router.get(`/:id`, (req, res, next) => {
  try {
    let resp = {
      statusCode: 200,
      message: 'Success.',
      data: {}
    };

    MasterData.getById(req.params.id, resp)
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

// Create master data (POST)
router.post(`/`, (req, res, next) => {
  let resp = {
    statusCode: 201,
    message: 'Success.'
  };
  try {
    if (req.body.type === undefined || req.body.value === undefined ) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'type, value'));
    } else {
      MasterData.create(req.body.type, req.body.value, req.body.description, req.body.custom1, req.body.custom2, req.body.custom3, req.body.active, resp)
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

// Update master data (PUT)
router.put('/:id', (req, res, next) => {
  try {
    let valid = true;
    let resp = {
      statusCode: 200,
      message: 'Success.',
      id: 0
    };
    let setInfo = {
      clause: '',
      values: []
    };

    // create setInfo
    if (req.body.type) {
      setInfo = sqlUtils.appendSet(setInfo, 'type = ?', req.body.type);
    }
    if (req.body.value) {
      setInfo = sqlUtils.appendSet(setInfo, 'value = ?', req.body.value);
    }
    if (req.body.description) {
      setInfo = sqlUtils.appendSet(setInfo, 'description = ?', req.body.description);
    }
    if (req.body.custom1) {
      setInfo = sqlUtils.appendSet(setInfo, 'custom1 = ?', req.body.custom1);
    }
    if (req.body.custom2) {
      setInfo = sqlUtils.appendSet(setInfo, 'custom2 = ?', req.body.custom2);
    }
    if (req.body.custom3) {
      setInfo = sqlUtils.appendSet(setInfo, 'custom3 = ?', req.body.custom3);
    }
    if (req.body.active) {
      setInfo = sqlUtils.appendSet(setInfo, 'active = ?', req.body.active);
    }

    MasterData.updateById(req.params.id, setInfo, resp)
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
    MasterData.remove(req.params.id, resp)
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
