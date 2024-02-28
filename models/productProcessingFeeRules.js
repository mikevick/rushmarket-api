'use strict'

const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

exports.create = (name, active, vendorId, boxSizeMin, boxSizeMax, processingFee) => {
  return new Promise((resolve, reject) => {
    var processingFeeRuleId = globals.mongoid.fetch()
    var values = [processingFeeRuleId, name, active, vendorId, boxSizeMin, boxSizeMax, processingFee]

    globals.pool.query('INSERT INTO product_processing_fee_rules (id, name, active, vendor_id, box_size_min, box_size_max, processing_fee) VALUES (?, ?, ?, ?, ?, ?, ?)', values)
      .then((results) => {
        resolve(processingFeeRuleId)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.updateById = async (processingFeeRuleId, setInfo) => {
  var resp = {
    rows: []
  }
  setInfo.values.push(processingFeeRuleId)
  var updateResult = await globals.pool.query('UPDATE product_processing_fee_rules ' + setInfo.clause + ', date_modified = NOW() WHERE id = ?', setInfo.values)
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query('SELECT * FROM product_processing_fee_rules WHERE id  = ?', [processingFeeRuleId])
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

  var count = await globals.pool.query('SELECT count(*) as num FROM product_processing_fee_rules ' + whereInfo.clause, whereInfo.values)
  resp.totalCount = count[0].num
  whereInfo.values.push(offset)
  whereInfo.values.push(limit)
  var rows = await globals.pool.query('SELECT * FROM product_processing_fee_rules ' + whereInfo.clause + ' ORDER BY name ASC LIMIT ?,?', whereInfo.values)
  colUtils.outboundNaming(rows)
  resp.rows = rows
  return resp
}

exports.getById = (processingFeeRuleId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM product_processing_fee_rules WHERE id  = ?', [processingFeeRuleId])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.removeById = (processingFeeRuleId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('DELETE FROM product_processing_fee_rules WHERE id  = ?', [processingFeeRuleId])
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}
