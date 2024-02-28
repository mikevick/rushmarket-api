'use strict';

const express = require('express');
const router = express.Router();

const regionActions = require('../actions/adRegions');

const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');



//
//  GET /adRegions
//
router.get(`/`, async (req, res, next) => {
  try {
    var limit = 0;
    var offset = 0;
    var resp = {
      statusCode: 200,
      message: 'Success.',
      data: {
        regions: []
      }
    };

      

    await regionActions.getAll(req, resp);
    respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})


//
//  GET /adRegions/{id}
//
router.get(`/:id`, async (req, res, next) => {
  try {
    var limit = 0;
    var offset = 0;
    var resp = {
      statusCode: 200,
      message: 'Success.',
      data: {
        regions: []
      }
    };

      

    await regionActions.getById(req, resp);
    respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})




module.exports = router