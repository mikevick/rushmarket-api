'use strict';

const express = require('express');
const router = express.Router();

const Members = require('../models/members');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');



//
//  POST /imports/cleaned
//
router.post(`/cleaned`, (req, res, next) => {
  try {
    var prom = [];
    var resp = {
      statusCode: 200
    };

		Members.updateEmailMarketingStatusByEmail(req.body.email, 'CLEANED')
		.then(() => {
			response.respond(resp, res, next);
		})
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp);
  }
});


//
//  POST /imports/unsubscribed
//
router.post(`/unsubscribed`, (req, res, next) => {
  try {
    var prom = [];
    var resp = {
      statusCode: 200
    };

		Members.updateEmailMarketingStatusByEmail(req.body.email, 'UNSUBSCRIBED')
		.then(() => {
			response.respond(resp, res, next);
		})
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp);
  }
});


module.exports = router;