'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const productDamagePricingRules = require('../actions/productDamagePricingRules');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const memberText = require('../utils/memberTextUtils');
const sqlUtils = require('../utils/sqlUtils');

// Create product damage pricing rules (POST)
router.post(`/`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 201,
      message: 'Success.',
      id: 0
    };

    if (req.body.name === undefined || req.body.damageSeverity === undefined || req.body.damageLocation === undefined || req.body.damageVisibility === undefined || req.body.pricingTypeId === undefined || req.body.damageAdjustmentValue === undefined || req.body.damageMessage === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'name, damageSeverity, damageLocation, damageVisibility, pricingTypeId, damageAdjustmentValue, damageMessage'));
    } else {
      productDamagePricingRules.create(req.body.name, req.body.active, req.body.damageSeverity, req.body.damageLocation, req.body.damageVisibility, req.body.pricingTypeId, req.body.damageAdjustmentValue, req.body.damageMessage, resp)
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

// Update product damage pricing rules (PUT)
router.put('/:id', (req, res, next) => {
  try {
    var valid = true;
    var resp = {
      statusCode: 200,
      message: 'Success.',
      id: 0
    };
    var setInfo = {
      clause: '',
      values: []
    };

    // create setInfo
    // req.body.name, req.body.active, req.body.categoryId, req.body.damageLevel, req.body.damageValue
    if (req.body.name) {
      setInfo = sqlUtils.appendSet(setInfo, 'name = ?', req.body.name);
    }
    if (req.body.active) {
      setInfo = sqlUtils.appendSet(setInfo, 'active = ?', req.body.active);
    }
    if (req.body.damageSeverity) {
      setInfo = sqlUtils.appendSet(setInfo, 'damage_severity = ?', req.body.damageSeverity);
    }
    if (req.body.damageLocation) {
      setInfo = sqlUtils.appendSet(setInfo, 'damage_location = ?', req.body.damageLocation);
    }
    if (req.body.damageVisibility) {
      setInfo = sqlUtils.appendSet(setInfo, 'damage_visibility = ?', req.body.damageVisibility);
    }
    if (req.body.pricingTypeId) {
      setInfo = sqlUtils.appendSet(setInfo, 'pricing_type_id = ?', req.body.pricingTypeId);
    }
    if (req.body.damageAdjustmentValue) {
      setInfo = sqlUtils.appendSet(setInfo, 'damage_adjustment_value = ?', req.body.damageAdjustmentValue);
    }
    if (req.body.damageMessage) {
      setInfo = sqlUtils.appendSet(setInfo, 'damage_message = ?', req.body.damageMessage);
    }

    productDamagePricingRules.updateById(req.params.id, setInfo, resp)
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

//  Get all product damage pricing rules (GET)
router.get(`/`, (req, res, next) => {
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
      clause: '',
      values: []
    };

    // limit and offset defaults and query overrides
    var limit = 10;
    var offset = 0;

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }
    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    // add where clause to select by name
    if (req.query.name) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'name LIKE ?', '%' + req.query.name + '%');
    }
    if (req.query.active) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'active = ?', req.query.active);
    }
    if (req.query.damageSeverity) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'damage_severity = ?', req.query.damageSeverity);
    }
    if (req.query.damageLocation) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'damage_location = ?', req.query.damageLocation);
    }
    if (req.query.damageVisibility) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'damage_visibility = ?', req.query.damageVisibility);
    }
    if (req.query.pricingTypeId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'pricing_type_id = ?', req.query.pricingTypeId);
    }
    if (req.query.damageAdjustmentValue) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'damage_adjustment_value = ?', req.query.damageAdjustmentValue);
    }
    if (req.query.damageMessage) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'damage_message LIKE ?', '%' + req.query.damageMessage + '%');
    }

    productDamagePricingRules.getAll(whereInfo, offset, limit, resp)
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

//  Get product damage pricing rules by id (GET)
router.get(`/:id`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.',
      data: {}
    };

    productDamagePricingRules.getById(req.params.id, resp)
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

// delete product damage pricing rules by id (DELETE)
router.delete(`/:id`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.'
    };

    productDamagePricingRules.remove(req.params.id, resp)
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

module.exports = router
