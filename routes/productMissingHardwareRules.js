'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const ProductMissingHardwareRules = require('../actions/productMissingHardwareRules');
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

    if (req.body.name === undefined || req.body.missingHardwareSeverity === undefined || req.body.pricingTypeId === undefined || req.body.damageAdjustmentValue === undefined || req.body.damageMessage === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'name, missingHardwareSeverity, pricingTypeId, damageAdjustmentValue, damageMessage'));
    } else {
      ProductMissingHardwareRules.create(req.body.name, req.body.active, req.body.missingHardwareSeverity, req.body.pricingTypeId, req.body.damageAdjustmentValue, req.body.damageMessage, resp)
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
    if (req.body.name) {
      setInfo = sqlUtils.appendSet(setInfo, 'name = ?', req.body.name);
    }
    if (req.body.active) {
      setInfo = sqlUtils.appendSet(setInfo, 'active = ?', req.body.active);
    }
    if (req.body.missingHardwareSeverity) {
      setInfo = sqlUtils.appendSet(setInfo, 'missing_hardware_severity = ?', req.body.missingHardwareSeverity);
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

    ProductMissingHardwareRules.updateById(req.params.id, setInfo, resp)
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
    if (req.query.missingHardwareSeverity) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'missing_hardware_severity = ?', req.query.missingHardwareSeverity);
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

    ProductMissingHardwareRules.getAll(whereInfo, offset, limit, resp)
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

    ProductMissingHardwareRules.getById(req.params.id, resp)
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

    ProductMissingHardwareRules.remove(req.params.id, resp)
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
