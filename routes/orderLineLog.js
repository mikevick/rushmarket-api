'use strict';

const express = require('express');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils')

const { getOrderLineLog } = require('../models/rushOrders')

const logUtils = require('../utils/logUtils')
const { respond } = require('../utils/response')

//
// GET /orderLineLog/{orderLineStaticId}
//
router.get(`/:id`, jwtUtils.verifyToken, async (req, res, next) => {
  const resp = {
    statusCode: 200,
    message: 'Success'
  };

  try {
    if (req.get('x-app-type') === 'EXT' && (req.decoded.identity === undefined ||
      (req.decoded.identity.type !== 'PARTNER' && req.decoded.identity.type !== 'PARTNERUSER'))) {
      respond(resp, res, next, [], 403, 'Access denied.');
      return;
    }

    const orderLineStaticId = safeParseInteger(req.params.id);
    if (typeof orderLineStaticId !== 'number') {
      respond({}, res, next, [], 400, `invalid value for orderLineStaticId`);
      return;
    }

    const orderLineLogs = await getOrderLineLog(orderLineStaticId);
    if (orderLineLogs) {
      respond({ ...resp, data: { orderLineLogs } }, res, next);
    } else {
      respond({}, res, next, [], 404, 'Not found.');
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp);
  }
})

function safeParseInteger(string) {
  if (!string) {
    return;
  }
  try {
    return parseInt(string);
  } catch (e) {
    return false;
  }
}

module.exports = router;
