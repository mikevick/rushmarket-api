'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const files = require('../actions/files');
const jwtUtils = require('../actions/jwtUtils');

const fileUtils = require('../utils/fileUtils');
const memberText = require('../utils/memberTextUtils');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');


//
//  GET /files
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
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
  let limit = 100;
  let offset = 0;
  let sortBy = "sku ASC";

  try {

		//	Only allow images to be created from internal API calls.
		if ((req.get('x-app-type') !== 'INT') && (req.get('x-app-type') !== 'EXT') || ((req.get('x-app-type') === 'EXR') && (req.decoded === undefined))) {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

      // add where clause to select by name and status
      if (req.query.sku) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'sku = ?', req.query.sku);
      }

      if (req.query.vendorId) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'vendor_id = ?', req.query.vendorId);
      }

      if (req.query.vendorSku) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'vendor_sku = ?', req.query.vendorSku);
      }

      if (req.query.type) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'type = ?', req.query.type);
      }

      if (req.query.tag) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'tag = ?', req.query.tag);
      }

      if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
        limit = parseInt(req.query.limit);
      }

      if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
        offset = parseInt(req.query.offset);
      }

      if (req.query.sortBy) {
        sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku']);

        if (sortBy === 'field') {
          respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
        } else if (sortBy === 'direction') {
          respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
        }
      }
    
      var resp = await files.getAll(whereInfo, sortBy, offset, limit, resp);
      response.respond(resp, res, next);
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})


//
//  POST /files
//
router.post(`/`, async (req, res, next) => {
  var resp = {
    statusCode: 201,
    message: 'Success.',
    id: 0
  };
  try {
    if ((req.body.sku === undefined) && ((req.body.vendorId === undefined) || (req.body.vendorSku === undefined))) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'sku OR vendorId + vendorSku'));
    }
    else if  ((req.body.originalName === undefined) || (req.body.name === undefined) || (req.body.url === undefined) ||
        (req.body.context === undefined) || (req.body.context === null) ||
        (req.body.relativePath === undefined) || (req.body.relativePath === null) ||
        (req.body.nameCollision === undefined) || (req.body.nameCollision === null)) {

      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'originalName, name, url, context, relativePath, nameCollision'));
    } else {
      resp = await fileUtils.createFile(req.body.originalName, req.body.name, req.body.url, req.body.context,
                                req.body.relativePath, req.body.nameCollision, req.body.sku, 
                                req.body.vendorId, req.body.vendorSku, req.body.type, req.body.tag, resp);
      response.respond(resp, res, next);
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id']);
  }
})



//
//  PUT /files/:id
router.put('/:id', (req, res, next) => {
  var resp = {
    statusCode: 200,
    message: 'Success.'
  };

  try {
    if (req.body.tag === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'tag'));
    }

    files.updateById(req.params.id, req.body.tag, resp)
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


//
//  DELETE /files/{id}
//
router.delete('/:id', (req, res, next) => {
  var resp = {
    statusCode: 200,
    message: 'Success.'
  };


  try {
    files.deleteById(req.params.id, resp)
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



module.exports = router;
