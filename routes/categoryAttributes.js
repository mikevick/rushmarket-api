'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const CategoryAttributes = require('../actions/categoryAttributes');

const CategoryAttributesModel = require('../models/categoryAttributes');

const memberText = require('../utils/memberTextUtils');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');


//  Get all category attributes (GET)
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
  let sortBy = "c.category_id ASC";

  try {
    // add where clause to select by name and status
    if (req.query.categoryId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'c.category_id = ?', req.query.categoryId);
    }

    if (req.query.attributeId1) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'ca.attribute_id_1 = ?', req.query.attributeId1);
    }

    if (req.query.attributeId2) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'ca.attribute_id_2 = ?', req.query.attributeId2);
    }

    if (req.query.attributeId3) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'ca.attribute_id_3 = ?', req.query.attributeId3);
    }


    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['c.category_id', 'ca.attribute_id_1', 'ca.attribute_id_2', 'ca.attribute_id_3']);

      if (sortBy === 'field') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    CategoryAttributes.getAll(whereInfo, sortBy, offset, limit, resp)
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



//  Get all required attributes by category name
router.get(`/required`, async (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };

  try {

    if (req.query.categoryName === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'categoryName'));
    }
    else {

      await CategoryAttributes.getRequired(req.query.categoryName, resp);
      response.respond(resp, res, next);
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

//  Get all suspect variable values
router.get(`/suspectValues`, async (req, res, next) => {
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
  let sortBy = "coin_id, attribute_name ASC";

  try {
    if (req.query.coinId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'coin_id = ?', req.query.coinId);
    }

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    resp = await CategoryAttributes.getSuspectValues(whereInfo, sortBy, offset, limit, resp);
    response.respond(resp, res, next);
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})


//  Get all attribute values by name
router.get(`/values`, async (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };

  try {

    if (req.query.name === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'name'));
    }
    else {

      await CategoryAttributes.getByName(req.query.name, resp);
      response.respond(resp, res, next);
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})


//  Delete suspect variable values
router.delete(`/suspectValues`, async (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success'
  };

  if ((req.body.coinId === undefined) || (req.body.category2Name === undefined) || (req.body.attributeName === undefined) || (req.body.suspectValue === undefined)) {
    response.respond(resp, res, next, ["data", "metaData"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "coinId, category2Name, attributeName, suspectValue"));
  }
  else {
    let result = await CategoryAttributesModel.deleteSuspectValue(req.body.coinId, req.body.category2Name, req.body.attributeName, req.body.suspectValue);
    if (result.affectedRows === 0) {
      resp.statusCode = 404;
      resp.message = 'Value not found.'
    }
    response.respond(resp, res, next);
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
    CategoryAttributes.getById(req.params.id, resp)
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
    if (req.body.categoryId === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'categoryId'));
    } else {
      CategoryAttributes.create(req.body.categoryId, req.body.attributeId1, req.body.attributeId2, req.body.attributeId3, resp)
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
    if (req.body.attributeId1) {
      setInfo = sqlUtils.appendSet(setInfo, 'attribute_id_1 = ?', req.body.attributeId1);
    }
    if (req.body.attributeId2) {
      setInfo = sqlUtils.appendSet(setInfo, 'attribute_id_2 = ?', req.body.attributeId2);
    }
    if (req.body.attributeId3) {
      setInfo = sqlUtils.appendSet(setInfo, 'attribute_id_3 = ?', req.body.attributeId3);
    }

    CategoryAttributes.updateById(req.params.id, setInfo, resp)
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
    CategoryAttributes.remove(req.params.id, resp)
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
