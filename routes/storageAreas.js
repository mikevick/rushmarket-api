'use strict';

const express = require('express');
const router = express.Router();
const check = require('check-types');

const StorageAreas = require('../actions/storageAreas');
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');


//  GET /storageAreas/
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

  let sortBy = "sort_order ASC";

  // limit and offset defaults and query overrides
  let limit = 10;
  let offset = 0;

  try {
    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    // add where clause to select by name and status
    if (req.query.storeId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sa.store_id = ?', req.query.storeId);
    }

    if (req.query.partnerFacility) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 's.partner_facility = ?', req.query.partnerFacility);
    }

    if (req.query.storageArea) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'storage_area = ?', req.query.storageArea);
    }

    if (req.query.itemType) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'storage_area IN (SELECT storage_area FROM storage_locations WHERE item_type = ?)', req.query.itemType);
    }


    if (req.query.defaultArea) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'default_area = ?', req.query.defaultArea);
    }

    if (req.query.active) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'sa.active = ?', req.query.active);
    }

    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['storage_area_name']);
      if (sortBy === 'field') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }

    if ((sortBy != 'field') && (sortBy != 'direction')) {
      StorageAreas.getAll(whereInfo, sortBy, offset, limit, resp)
        .then((resp) => {
          response.respond(resp, res, next);
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined);
        })
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})


//
//  GET /storageAreas/{storageAreaId}/{storeId}
//
router.get(`/:storageAreaId/:storeId`, (req, res, next) => {
  try {
    let resp = {
      statusCode: 200,
      message: 'Success.',
      data: {}
    };

    let whereInfo = {
      clause: 'where 1=1',
      values: []
    };

    let sortBy = "sort_order ASC";

    if (req.query.active) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'active = ?', req.query.active);
    }

    StorageAreas.getByIds(req.params.storageAreaId, req.params.storeId, whereInfo, sortBy, resp)
      .then((result) => {
        if (result.data.storageAreas.length === 0) {
          response.respond(resp, res, next, ["storageArea"], 404);
        } else {
          response.respond(resp, res, next);
        }
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, ["storageArea"]);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ["storageArea"]);
  }
});




//
//  POST /storageAreas
//
router.post(`/`, async (req, res, next) => {
  try {
    let resp = {
      statusCode: 201,
      message: 'Success.'
    };

    if ((req.body.storeId === undefined) || (req.body.storeId === null) ||
      (req.body.storageArea === undefined) || (req.body.storageArea === null) ||
      (req.body.storageAreaName === undefined) || (req.body.storageAreaName === null) ||
      (req.body.defaultArea === undefined) || (req.body.defaultArea === null) ||
      (req.body.defaultLocation === undefined) || (req.body.defaultLocation === null) ||
      (req.body.payStorageFees === undefined) || (req.body.payStorageFees === null) ||
      (req.body.active === undefined) || (req.body.active === null)) {
      response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "storeId, storageArea, storageAreaName, defaultArea, defaultLocation, payStorageFees and active"));
    } else if (((req.body.active !== 'Y') && (req.body.active !== 'N')) || ((req.body.payStorageFees !== 'Y') && (req.body.payStorageFees !== 'N')) || ((req.body.defaultArea !== 'Y') && (req.body.defaultArea !== 'N'))) {
      response.respond(resp, res, next, ["id"], 400, memberText.get("INVALID").replace('%invalid%', "active, payStorageFees and defaultArea must be Y or N"));
    } else {
      var result = await StorageAreas.create(req.body.storeId, req.body.storageArea, req.body.storageAreaName, req.body.webLocationAlias, req.body.defaultArea, req.body.defaultZone, req.body.defaultLocation, req.body.payStorageFees, req.body.active, resp);
      response.respond(resp, res, next);
    }

  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ["storageArea"]);
  }
});



//
//  PUT /storageAreas/{storeId}/{storageArea}
//
router.put(`/:storeId/:storageArea`, async (req, res, next) => {
  try {
    let resp = {
      statusCode: 200,
      message: 'Success.'
    };

    if (((req.body.active !== undefined) && (req.body.active !== 'Y') && (req.body.active !== 'N')) ||
      ((req.body.payStorageFees !== undefined) && (req.body.payStorageFees !== 'Y') && (req.body.payStorageFees !== 'N')) ||
      ((req.body.defaultArea !== undefined) && (req.body.defaultArea !== 'Y') && (req.body.defaultArea !== 'N'))) {
    response.respond(resp, res, next, ["id"], 400, memberText.get("INVALID").replace('%invalid%', "active, payStorageFees and defaultArea must be Y or N"));
  } else {
      var result = await StorageAreas.update(req.params.storeId, req.params.storageArea, req.body.storageAreaName, req.body.webLocationAlias, req.body.defaultArea, req.body.defaultZone, req.body.defaultLocation, req.body.payStorageFees, req.body.active, resp);
      response.respond(resp, res, next);
    }

  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ["storageArea"]);
  }
});


//
//  DELETE /storageAreas/{storeId}/{storageArea}
//
router.delete(`/:storeId/:storageArea`, async (req, res, next) => {
  try {
    let resp = {
      statusCode: 200,
      message: 'Success.'
    };

    var result = await StorageAreas.remove(req.params.storeId, req.params.storageArea, resp);
    response.respond(resp, res, next);

  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ["storageArea"]);
  }
});



module.exports = router;