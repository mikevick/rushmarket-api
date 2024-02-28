'use strict'

const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

exports.create = (name, active, vendorId, conditionId, conditionName, conditionValue, costBase) => {
  return new Promise((resolve, reject) => {
    var productCostRulesId = globals.mongoid.fetch()
    var values = [productCostRulesId, name, active, vendorId, conditionId, conditionName, conditionValue, costBase]

    globals.pool.query('INSERT INTO product_cost_rules (product_cost_rules_id, name, active, vendor_id, condition_id, condition_name, condition_value, cost_base) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', values)
      .then((results) => {
        resolve(productCostRulesId)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.updateById = async (productCostRulesId, setInfo) => {
  var resp = {
    rows: []
  }
  setInfo.values.push(productCostRulesId)
  var updateResult = await globals.pool.query('UPDATE product_cost_rules ' + setInfo.clause + ', date_modified = NOW() WHERE product_cost_rules_id  = ?', setInfo.values)
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query('SELECT * FROM product_cost_rules WHERE product_cost_rules_id  = ?', [productCostRulesId])
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

  var count = await globals.pool.query('SELECT count(*) as num FROM product_cost_rules ' + whereInfo.clause, whereInfo.values)
  resp.totalCount = count[0].num
  whereInfo.values.push(offset)
  whereInfo.values.push(limit)
  var rows = await globals.pool.query('SELECT * FROM product_cost_rules ' + whereInfo.clause + ' ORDER BY name ASC LIMIT ?,?', whereInfo.values)
  colUtils.outboundNaming(rows)
  resp.rows = rows
  return resp
}

exports.getById = (productCostRulesId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM product_cost_rules WHERE product_cost_rules_id  = ?', [productCostRulesId])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.removeById = (productCostRulesId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('DELETE FROM product_cost_rules WHERE product_cost_rules_id  = ?', [productCostRulesId])
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}


exports.getSpecific = async (vendorId, conditionName) => {
  var rows = await globals.pool.query(`SELECT * FROM product_cost_rules WHERE active = 'Y' AND vendor_id = ? AND condition_name = ?`, [vendorId, conditionName]);
  colUtils.outboundNaming(rows)
  return rows;
}

