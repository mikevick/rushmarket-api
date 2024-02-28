'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');

exports.create = (name, active, missingHardwareSeverity, pricingTypeId, damageAdjustmentValue, damageMessage) => {
  return new Promise((resolve, reject) => {
    var id = globals.mongoid.fetch();
    var values = [id, name, active, missingHardwareSeverity, pricingTypeId, damageAdjustmentValue, damageMessage];

    globals.pool.query('INSERT INTO product_missing_hardware_rules (product_missing_hardware_rules_id, name, active, missing_hardware_severity, pricing_type_id, damage_adjustment_value, damage_message) VALUES (?, ?, ?, ?, ?, ?, ?)', values)
      .then((results) => {
        resolve(id);
      })
      .catch((e) => {
        reject(e);
      })
  })
}

exports.updateById = async (id, setInfo) => {
  var resp = {
    rows: []
  };
  setInfo.values.push(id);
  var updateResult = await globals.pool.query('UPDATE product_missing_hardware_rules ' + setInfo.clause + ', date_modified = NOW() WHERE product_missing_hardware_rules_id  = ?', setInfo.values);
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query('SELECT * FROM product_missing_hardware_rules WHERE product_missing_hardware_rules_id  = ?', [id]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}

exports.getAll = async (whereInfo, offset, limit) => {
  var resp = {
    totalCount: 0,
    rows: []
  };

  var count = await globals.pool.query('SELECT count(*) as num FROM product_missing_hardware_rules ' + whereInfo.clause, whereInfo.values);
  resp.totalCount = count[0].num;
  whereInfo.values.push(offset);
  whereInfo.values.push(limit);
  var rows = await globals.pool.query('SELECT * FROM product_missing_hardware_rules ' + whereInfo.clause + ' ORDER BY name ASC LIMIT ?,?', whereInfo.values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;
  return resp;
}

exports.getById = (id) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM product_missing_hardware_rules WHERE product_missing_hardware_rules_id  = ?', [id])
      .then((rows) => {
        colUtils.outboundNaming(rows);
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      })
  })
}

exports.removeById = (id) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('DELETE FROM product_missing_hardware_rules WHERE product_missing_hardware_rules_id  = ?', [id])
      .then((rows) => {
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      })
  })
}
