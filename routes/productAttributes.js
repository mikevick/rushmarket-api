'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const ProductAttributes = require('../actions/productAttributes');
const RushProducts = require('../actions/rushProducts');

const memberText = require('../utils/memberTextUtils')
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

//  Get all product attributes (GET)
router.get(`/`, async (req, res, next) => {  
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.',
      metaData: {
        totalCount: 0
      },
      data: {}
    };
    var whereInfo = {
      clause: 'where 1=1',
      values: []
    };

    // limit and offset defaults and query overrides
    let limit = 10;
    let offset = 0;
    let sortBy = "attribute_name ASC";
    let distinctValuesOnly = false;
    let skusArray = [];
 
    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    // add where clause 
    //use category id or sku list
    if (req.query.categoryId) {
      //call rushProducts by CategoryId
      var rushProductsResp = {
        statusCode: 200,
        message: 'Success.',
        metaData: {
          totalCount: 0
        },
        data: {}
      };
      let rushProductWhereInfo = {
        clause: 'where 1=1',
        values: []
      };
      rushProductWhereInfo = sqlUtils.appendWhere(rushProductWhereInfo, 'cm.category_id IN (?)', req.query.categoryId);
      rushProductsResp = await RushProducts.getAllProducts(undefined, undefined, undefined, rushProductWhereInfo, '', 0, 9999, rushProductsResp);
      rushProductsResp.data.rushProducts.forEach( (prod) => {
        skusArray.push(prod.sku);
      })
      if (!rushProductsResp.metaData.totalCount) {
        respond(resp, res, next, undefined, 404, 'No products found for category id.');
      }
    } else if (req.query.skus) {
      skusArray = req.query.skus.split(","); 
    }

    if (skusArray.length) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sku IN (?)');
      whereInfo.values.push(skusArray);
    }

    if (req.query.attributeName) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'attribute_name = ?', req.query.attributeName);
    }


    if (req.query.distinctValuesOnly && req.query.distinctValuesOnly.toUpperCase() === 'Y') {
      distinctValuesOnly = true;
    }

    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku', 'attribute_name', 'attribute_value']);

      if (sortBy === 'field') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    ProductAttributes.getAll(whereInfo, distinctValuesOnly, sortBy, offset, limit, resp)
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

//  Get product attributes by id (GET)
router.get(`/:id`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };

  try {
    ProductAttributes.getById(req.params.id, resp)
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

// Create product attributes (POST)
router.post(`/`, (req, res, next) => {
  let resp = {
    statusCode: 201,
    message: 'Success.',
    data: {}
  };

  try {
    if (req.body.sku === undefined || req.body.attributeName === undefined || req.body.attributeValue === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'sku, attributeName, attributeValue'));
    } else {
      ProductAttributes.create(req.body.sku, req.body.attributeName, req.body.attributeValue, resp)
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

// Update product attributes (PUT)
router.put('/:id', (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
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

    ProductAttributes.updateById(req.params.id, setInfo, resp)
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

// delete product attributes by id (DELETE)
router.delete(`/:id`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.'
  };

  try{
    ProductAttributes.remove(req.params.id, resp)
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
