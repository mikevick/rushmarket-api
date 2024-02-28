'use strict'

const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

exports.create = async (bubbleId, zipCodeStart, zipCodeEnd) => {
  return new Promise((resolve, reject) => {
    var bubbleRangeId = globals.mongoid.fetch()
    var values = [bubbleRangeId, bubbleId, zipCodeStart, zipCodeEnd]

    globals.productPool.query("SELECT id FROM bubbles WHERE id = '" + bubbleId + "'")
      .then((results) => {
        globals.productPool.query('INSERT INTO bubbles_to_zips (id, bubble_id, zip_start, zip_end) VALUES (?, ?, ?, ?)', values)
          .then((results) => {
            resolve(bubbleRangeId)
          })
          .catch((e) => {
            reject(e)
          })
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.updateById = async (bubbleRangeId, setInfo) => {
  var resp = {
    rows: []
  }
  setInfo.values.push(bubbleRangeId)
  var updateResult = await globals.productPool.query('UPDATE bubbles_to_zips ' + setInfo.clause + ', date_modified = NOW() WHERE id = ?', setInfo.values)
  if (updateResult.affectedRows) {
    var rows = await globals.productPool.query('SELECT * FROM bubbles_to_zips WHERE id = ?', [bubbleRangeId])
    colUtils.outboundNaming(rows)
    resp.rows = rows
  }

  return resp
}
exports.getAll = async (whereInfo, offset, limit) => {
  var resp = {
    totalCount: 0,
    rows: []
  }

  var count = await globals.productPool.query('SELECT count(*) as num FROM bubbles_to_zips ' + whereInfo.clause, whereInfo.values)
  resp.totalCount = count[0].num

  whereInfo.values.push(offset)
  whereInfo.values.push(limit)

  var rows = await globals.productPool.query('SELECT * FROM bubbles_to_zips ' + whereInfo.clause + ' ORDER BY bubble_id, zip_start ASC LIMIT ?,?', whereInfo.values)
  colUtils.outboundNaming(rows)
  resp.rows = rows

  return resp
}

exports.getById = (bubbleRangeId) => {
  return new Promise((resolve, reject) => {
    globals.productPool.query('SELECT * FROM bubbles_to_zips WHERE id = ?', [bubbleRangeId])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.getByBubbleId = (bubbleId) => {
  return new Promise((resolve, reject) => {
    globals.productPool.query('SELECT * FROM bubbles_to_zips WHERE bubble_id = ?', [bubbleId])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.removeById = (bubbleRangeId) => {
  return new Promise((resolve, reject) => {
    globals.productPool.query('DELETE FROM bubbles_to_zips WHERE id = ?', [bubbleRangeId])
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}
