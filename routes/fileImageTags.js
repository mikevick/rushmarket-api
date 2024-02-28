'use strict';

const express = require('express');
const router = express.Router();

const FileImageTags = require('../actions/fileImageTags');

const memberText = require('../utils/memberTextUtils')
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');


//  Get all file images (GET)
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
  let sortBy = "tag ASC";

  try {
    // add where clause 
    if (req.query.active) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'active = ?', req.query.active);
    }

    FileImageTags.getAll(whereInfo, sortBy, resp)
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

router.get(`/:fileImageTagId`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };

  try {
    FileImageTags.getById(req.params.fileImageTagId, resp)
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


router.post(`/`, (req, res, next) => {
  let resp = {
    statusCode: 201,
    message: 'Success.'
  };
  try {
    if (req.body.tag === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'tag'))
    } else {
      FileImageTags.create(req.body.tag, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined)
        })
    }
    
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id'])
  }
})

router.put(`/:fileImageTagId`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
  }
  let setInfo = {
    clause: '',
    values: []
  }
  try {
    if (req.body.tag === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'tag'))
    } else {
      if (req.body.tag) {
        setInfo = sqlUtils.appendSet(setInfo, 'tag = ?', req.body.tag);
      }
      if (req.body.active) {
        setInfo = sqlUtils.appendSet(setInfo, 'active = ?', req.body.active);
      }
  
      FileImageTags.updateById(req.params.fileImageTagId, setInfo, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined)
        })
    }
    
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id'])
  }
})

module.exports = router;