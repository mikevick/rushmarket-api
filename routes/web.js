'use strict'

const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')

const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const sqlUtils = require('../utils/sqlUtils')
const Web = require('../actions/web')

//  Get all pages (GET)
router.get(`/pages`, (req, res, next) => {
  var resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  }
  var whereInfo = {
    clause: '',
    values: []
  }
  var memberWhereInfo = {
    clause: '',
    values: []
  }
  try {
    if (req.query.showInFooter) {
      whereInfo = sqlUtils.appendWhere(whereInfo, ' show_in_footer = "Y" ')
    }
    whereInfo = sqlUtils.appendWhere(whereInfo, ' active = "Y" ')
    // check for member token
    if (req.get('x-access-token')) {
      var decoded = jwt.verify(req.get('x-access-token'), process.env.JWT_SECRET_KEY)
      // console.log(decoded)
      if (decoded.memberId !== undefined) {
        Web.getMemberStores(sqlUtils.appendWhere(memberWhereInfo, ' m.id = ? ', decoded.memberId), resp)
          .then((rows) => {
            if (rows.length) {
              whereInfo = sqlUtils.appendWhere(whereInfo, ' (store_id IS NULL OR store_id = ?) ', rows[0].storeId)
            }
            Web.getAllPages(whereInfo, resp)
              .then((resp) => {
                response.respond(resp, res, next)
              })
              .catch((e) => {
                logUtils.routeExceptions(e, req, res, next, resp, undefined)
              })
          })
          .catch((e) => {
            logUtils.routeExceptions(e, req, res, next, resp, undefined)
          })
      } else {
        whereInfo = sqlUtils.appendWhere(whereInfo, ' store_id IS NULL ')
        Web.getAllPages(whereInfo, resp)
          .then((resp) => {
            response.respond(resp, res, next)
          })
          .catch((e) => {
            logUtils.routeExceptions(e, req, res, next, resp, undefined)
          })
      }
    } else {
      whereInfo = sqlUtils.appendWhere(whereInfo, ' store_id IS NULL ')
      Web.getAllPages(whereInfo, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined)
        })
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined)
  }
})

//  Get all bubble samples (GET)
router.get(`/pages/:handle`, (req, res, next) => {
  var resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  }
  var whereInfo = {
    clause: '',
    values: []
  }
  var memberWhereInfo = {
    clause: '',
    values: []
  }
  var fallBackWhereInfo = {
    clause: '',
    values: []
  }
  
  try {
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.active = "Y"')
    whereInfo = sqlUtils.appendWhere(whereInfo, 'p.handle = ?', req.params.handle)
    // check for member token
    if (req.get('x-access-token')) {
      var decoded = jwt.verify(req.get('x-access-token'), process.env.JWT_SECRET_KEY)
      if (decoded.memberId !== undefined) {
        Web.getMemberStores(sqlUtils.appendWhere(memberWhereInfo, ' m.id = ? ', decoded.memberId), resp)
          .then((rows) => {
            if (rows.length) {
            // we have a valid member, give them logged in infos
              whereInfo = sqlUtils.appendWhere(whereInfo, 'p.store_id = ?', rows[0].storeId)
            }
            Web.getPageContents(whereInfo, resp)
              .then((resp) => {
                if (resp.data.pageContents.length) {
                  response.respond(resp, res, next)
                } else {
                  fallBackWhereInfo = sqlUtils.appendWhere(fallBackWhereInfo, 'p.active = "Y"')
                  fallBackWhereInfo = sqlUtils.appendWhere(fallBackWhereInfo, 'p.handle = ?', req.params.handle)
                  fallBackWhereInfo = sqlUtils.appendWhere(fallBackWhereInfo, 'p.store_id IS NULL')
                  Web.getPageContents(fallBackWhereInfo, resp)
                    .then((resp) => {
                      response.respond(resp, res, next)
                    })
                    .catch((e) => {
                      logUtils.routeExceptions(e, req, res, next, resp, undefined)
                    })
                }
              })
              .catch((e) => {
                logUtils.routeExceptions(e, req, res, next, resp, undefined)
              })
          })
          .catch((e) => {
            logUtils.routeExceptions(e, req, res, next, resp, undefined)
          })
      } else {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'p.store_id IS NULL')
        Web.getPageContents(whereInfo, resp)
          .then((resp) => {
            response.respond(resp, res, next)
          })
          .catch((e) => {
            logUtils.routeExceptions(e, req, res, next, resp, undefined)
          })
      }
    } else {
      // whereInfo = sqlUtils.appendWhere(whereInfo, 'requires_auth = "N"')
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.store_id IS NULL')
      Web.getPageContents(whereInfo, resp)
        .then((resp) => {
          response.respond(resp, res, next)
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined)
        })
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined)
  }
})

module.exports = router
