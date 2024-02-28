'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const CategoryMappings = require('../actions/categoryMappings');
const memberText = require('../utils/memberTextUtils');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

//  Get all category mappings (GET)
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
  let sortBy = "category_id ASC";

  try {
    if (req.query.categoryId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'category_id = ?', req.query.categoryId);
    }

    if (req.query.category1) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'category_1 = ?', req.query.category1);
    }

    if (req.query.category2) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'category_2 = ?', req.query.category2);
    }

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['category_id', 'category_1', 'category_2']);

      if (sortBy === 'field') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    CategoryMappings.getAll(whereInfo, sortBy, offset, limit, resp)
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

//  Get category Attributes by id (GET)
router.get(`/:id`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };

  try {
    CategoryMappings.getById(req.params.id, resp)
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
    if (req.body.categoryId === undefined || req.body.category1 === undefined || req.body.category2 === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'categoryId'));
    } else {
      CategoryMappings.create(req.body.categoryId, req.body.category1, req.body.category2, resp)
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
    if (req.body.categoryId) {
      setInfo = sqlUtils.appendSet(setInfo, 'category_id = ?', req.body.categoryId);
    }
    if (req.body.category1) {
      setInfo = sqlUtils.appendSet(setInfo, 'category_1 = ?', req.body.category1);
    }
    if (req.body.category2) {
      setInfo = sqlUtils.appendSet(setInfo, 'category_2 = ?', req.body.category2);
    }

    CategoryMappings.updateById(req.params.id, setInfo, resp)
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

// delete category attribute by id (DELETE)
router.delete(`/:id`, (req, res, next) => {
  try {
    let resp = {
      statusCode: 200,
      message: 'Success.'
    };
    CategoryMappings.remove(req.params.id, resp)
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
