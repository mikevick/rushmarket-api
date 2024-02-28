'use strict'

const check = require('check-types')
const express = require('express')
const router = express.Router()

const BubbleRanges = require('../actions/bubbleRanges')
const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const memberText = require('../utils/memberTextUtils')
const sqlUtils = require('../utils/sqlUtils')

// Create bubble range (POST)
router.post(`/`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 201,
      message: 'Success.',
      id: 0
    }

    if (req.body.bubbleId === undefined || req.body.zipCodeStart === undefined || req.body.zipCodeEnd === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'bubbleId, zipCodeStart, zipCodeEnd'))
    } else {
      BubbleRanges.create(req.body.bubbleId, req.body.zipCodeStart, req.body.zipCodeEnd, resp)
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

// Update Bubble Range (PUT)
router.put('/:id', (req, res, next) => {
  try {
    var valid = true
    var resp = {
      statusCode: 200,
      message: 'Success.',
      id: 0
    }
    var setInfo = {
      clause: '',
      values: []
    }

    // validation: must be changing status or name values and status must be active or inactive
    if (req.body.zipCodeStart || req.body.zipCodeEnd || req.body.bubbleId) {
      if ((req.body.zipCodeStart) && (req.body.zipCodeStart.length > 5)) {
        response.respond(resp, res, next, ['id'], 400, 'Please check the length of the begin zip code.  Must not be longer than 5 chars.')
        valid = false
      }
      if ((req.body.zipCodeEnd) && (req.body.zipCodeEnd.length > 5)) {
        response.respond(resp, res, next, ['id'], 400, 'Please check the length of the end zip code.  Must not be longer than 5 chars.')
        valid = false
      }
    } else {
      response.respond(resp, res, next, ['id'], 400, 'Please update the begin and end zip codes or the bubble id for the Bubble Range')
      valid = false
    }
    if (valid) {
      // create setInfo
      if (req.body.zipCodeStart) {
        setInfo = sqlUtils.appendSet(setInfo, 'zip_start = ?', req.body.zipCodeStart)
      }
      if (req.body.zipCodeEnd) {
        setInfo = sqlUtils.appendSet(setInfo, 'zip_end = ?', req.body.zipCodeEnd)
      }
      if (req.body.bubbleId) {
        setInfo = sqlUtils.appendSet(setInfo, 'bubble_id = ?', req.body.bubbleId)
      }

      BubbleRanges.updateById(req.params.id, setInfo, resp)
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

//  Get all bubble ranges (GET)
router.get(`/`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.',
      metaData: {
        totalCount: 0
      },
      data: {}
    }
    var whereInfo = {
      clause: '',
      values: []
    }

    var limit = 10
    var offset = 0

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit)
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset)
    }

    BubbleRanges.getAll(whereInfo, offset, limit, resp)
      .then((resp) => {
        response.respond(resp, res, next)
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined)
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined)
  }
})

//  Get bubble range by id (GET)
router.get(`/:id`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.',
      data: {}
    }

    BubbleRanges.getById(req.params.id, resp)
      .then((resp) => {
        response.respond(resp, res, next)
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined)
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined)
  }
})

// delete bubble range by id (DELETE)
router.delete(`/:id`, (req, res, next) => {
  try {
    var resp = {
      statusCode: 200,
      message: 'Success.'
    }

    BubbleRanges.remove(req.params.id, resp)
      .then((resp) => {
        response.respond(resp, res, next)
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, ['id'])
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp)
  }
})

module.exports = router
