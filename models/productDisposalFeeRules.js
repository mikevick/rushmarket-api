'use strict'

const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

exports.create = (name, active, vendorId, boxSizeMin, boxSizeMax, disposalFee) => {
  return new Promise((resolve, reject) => {
    var disposalFeeRuleId = globals.mongoid.fetch()
    var values = [disposalFeeRuleId, name, active, vendorId, boxSizeMin, boxSizeMax, disposalFee]

    globals.pool.query('INSERT INTO product_disposal_fee_rules (disposal_fee_rules_id, name, active, vendor_id, box_size_min, box_size_max, disposal_fee) VALUES (?, ?, ?, ?, ?, ?, ?)', values)
      .then((results) => {
        resolve(disposalFeeRuleId)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.updateById = async (disposalFeeRuleId, setInfo) => {
  var resp = {
    rows: []
  }
  setInfo.values.push(disposalFeeRuleId)
  var updateResult = await globals.pool.query('UPDATE product_disposal_fee_rules ' + setInfo.clause + ', date_modified = NOW() WHERE disposal_fee_rules_id = ?', setInfo.values)
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query('SELECT * FROM product_disposal_fee_rules WHERE disposal_fee_rules_id  = ?', [disposalFeeRuleId])
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

  var count = await globals.pool.query('SELECT count(*) as num FROM product_disposal_fee_rules ' + whereInfo.clause, whereInfo.values)
  resp.totalCount = count[0].num
  whereInfo.values.push(offset)
  whereInfo.values.push(limit)
  var rows = await globals.pool.query('SELECT * FROM product_disposal_fee_rules ' + whereInfo.clause + ' ORDER BY name ASC LIMIT ?,?', whereInfo.values)
  colUtils.outboundNaming(rows)
  resp.rows = rows
  return resp
}

exports.getById = (disposalFeeRuleId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM product_disposal_fee_rules WHERE disposal_fee_rules_id  = ?', [disposalFeeRuleId])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.removeById = (disposalFeeRuleId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('DELETE FROM product_disposal_fee_rules WHERE disposal_fee_rules_id  = ?', [disposalFeeRuleId])
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}
