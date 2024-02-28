'use strict';

const express = require('express');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils');

const { getDashboardCards } = require('../models/dashboardCards');

const logUtils = require('../utils/logUtils');
const { respond } = require('../utils/response')
const { getUserIdAndType } = require('../utils/userUtils');

//
//  GET /dashboardCards
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
  try {
    const { userType } = getUserIdAndType(req);
    const dashboardCards = await getDashboardCards(userType);
    respond({ statusCode: 200, message: 'Success', data: { dashboardCards } }, res, next);
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, {});
  }
});

module.exports = router;
