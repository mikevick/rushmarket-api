'use strict'

const _ = require('lodash')

const columnUtils = require('./columnUtils')

var addToWhere = (where, clause) => {
  if (clause != null) {
    if ((where === null) || (where.length < 6)) {
      where = 'WHERE '
    }

    if (where.length > 6) {
      where = where + ' AND '
    }

    where = where + clause
  }

  return where
}

//
//	Build WHERE clause piece by piece while parsing query params.  Keep SQL and values array separately in object whereInfo.
//
var appendWhere = (whereInfo, snippet, val) => {
  if (snippet != null) {
    if ((whereInfo.clause === null) || (whereInfo.clause.length < 6)) {
      whereInfo.clause = 'WHERE '
    }

    if (whereInfo.clause.length > 6) {
      whereInfo.clause = whereInfo.clause + ' AND '
    }

    whereInfo.clause = whereInfo.clause + snippet

    if (val != undefined) {
      if (Array.isArray(val)) {
        for (var i=0; i < val.length; i++) {
          whereInfo.values.push(val[i]);
        }
      }
      else {
        whereInfo.values.push(val)
      }
    }
  }

  return whereInfo
}

var appendSet = (setInfo, snippet, val) => {
  if (snippet != null) {
    if ((setInfo.clause === null) || (setInfo.clause.length < 4)) {
      setInfo.clause = 'SET '
    }

    if (setInfo.clause.length > 4) {
      setInfo.clause += ','
    }

    setInfo.clause += snippet
    if (val != undefined) {
      setInfo.values.push(val)
    }
  }

  return setInfo
}

var parseSortBy = (passed, allowed) => {
  var arr = passed.split(',')
  var idx = 0
  var sortBy = ''

  for (var i = 0; i < arr.length; i++) {
    var parts = arr[i].split(':')

    idx = _.indexOf(allowed, parts[0])
    if (idx === -1) {
      return ('field')
    } else {
      if ((parts[1] != 'ASC') && (parts[1] != 'DESC')) {
        return 'direction'
      } else {
        if (sortBy.length > 0) {
          sortBy = sortBy + ', '
        }
        parts[0] = columnUtils.keyToCol(allowed[idx])

        // console.log(parts[0] + " " + parts[1]);
        sortBy = sortBy + parts[0] + ' ' + parts[1]
      }
    }
  }

  return sortBy
}

module.exports = {
  addToWhere,
  appendWhere,
  appendSet,
  parseSortBy
}
