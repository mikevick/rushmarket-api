'use strict';

const express = require('express');
const fs = require('fs');
const multer = require('multer');
const upload = multer({
  dest: 'upload'
});
const router = express.Router();


const fedexZones = require('../actions/fedexZones');

const memberText = require('../utils/memberTextUtils');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');


//
//  GET /files
//
// router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
//   var resp = {
//     statusCode: 200,
//     message: 'Success.',
//     metaData: {
//       totalCount: 0
//     },
//     data: {}
//   };
//   var whereInfo = {
//     clause: 'where 1=1',
//     values: []
//   };


//   // limit and offset defaults and query overrides
//   let limit = 100;
//   let offset = 0;
//   let sortBy = "sku ASC";

//   try {

// 		//	Only allow images to be created from internal API calls.
// 		if ((req.get('x-app-type') !== 'INT') && (req.get('x-app-type') !== 'EXT') || ((req.get('x-app-type') === 'EXR') && (req.decoded === undefined))) {
// 			response.respond(resp, res, next, undefined, 403, "Access denied.");
// 		} else {

//       // add where clause to select by name and status
//       if (req.query.sku) {
//         whereInfo = sqlUtils.appendWhere(whereInfo, 'sku = ?', req.query.sku);
//       }

//       if (req.query.vendorId) {
//         whereInfo = sqlUtils.appendWhere(whereInfo, 'vendor_id = ?', req.query.vendorId);
//       }

//       if (req.query.vendorSku) {
//         whereInfo = sqlUtils.appendWhere(whereInfo, 'vendor_sku = ?', req.query.vendorSku);
//       }

//       if (req.query.type) {
//         whereInfo = sqlUtils.appendWhere(whereInfo, 'type = ?', req.query.type);
//       }

//       if (req.query.tag) {
//         whereInfo = sqlUtils.appendWhere(whereInfo, 'tag = ?', req.query.tag);
//       }

//       if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
//         limit = parseInt(req.query.limit);
//       }

//       if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
//         offset = parseInt(req.query.offset);
//       }

//       if (req.query.sortBy) {
//         sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku']);

//         if (sortBy === 'field') {
//           respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
//         } else if (sortBy === 'direction') {
//           respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
//         }
//       }

//       var resp = await files.getAll(whereInfo, sortBy, offset, limit, resp);
//       response.respond(resp, res, next);
//     }
//   } catch (e) {
//     logUtils.routeExceptions(e, req, res, next, resp, undefined);
//   }
// })


//
//  POST /fedexZones
//
router.post(`/`, upload.array('zones'), async (req, res, next) => {
  var resp = {
    statusCode: 201,
    message: 'Success.',
    rangeCount: 0
  };


  if (req.get('x-app-type') !== 'INT') {
    response.respond(resp, res, next, undefined, 403, 'Access denied.')
  } else {

    if (!req.files || !req.body.originZip) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'zones, originZip'));

    } else {

      try {
        await fedexZones.processPDF(req.files[0].path, req.body.originZip, resp);
        response.respond(resp, res, next);
      } catch (e) {
        logUtils.routeExceptions(e, req, res, next, resp);
      } finally {
        fs.unlinkSync(req.files[0].path);
      }
    }
  }
})




module.exports = router;