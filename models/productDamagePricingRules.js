'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');

exports.create = (name, active, damageSeverity, damageLocation, damagevisibility, pricingTypeId, damageAdjustmentValue, damageMessage) => {
  return new Promise((resolve, reject) => {
    var damagePricingRuleId = globals.mongoid.fetch();
    var values = [damagePricingRuleId, name, active, damageSeverity, damageLocation, damagevisibility, pricingTypeId, damageAdjustmentValue, damageMessage];

    globals.pool.query('INSERT INTO product_damage_pricing_rules (product_damage_pricing_rules_id, name, active, damage_severity, damage_location, damage_visibility, pricing_type_id, damage_adjustment_value, damage_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', values)
      .then((results) => {
        resolve(damagePricingRuleId);
      })
      .catch((e) => {
        reject(e);
      })
  })
}

exports.updateById = async (damagePricingRuleId, setInfo) => {
  var resp = {
    rows: []
  };
  setInfo.values.push(damagePricingRuleId);
  var updateResult = await globals.pool.query('UPDATE product_damage_pricing_rules ' + setInfo.clause + ', date_modified = NOW() WHERE product_damage_pricing_rules_id  = ?', setInfo.values);
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query('SELECT * FROM product_damage_pricing_rules WHERE product_damage_pricing_rules_id  = ?', [damagePricingRuleId]);
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

  var count = await globals.pool.query('SELECT count(*) as num FROM product_damage_pricing_rules ' + whereInfo.clause, whereInfo.values);
  resp.totalCount = count[0].num;
  whereInfo.values.push(offset);
  whereInfo.values.push(limit);
  var rows = await globals.pool.query('SELECT * FROM product_damage_pricing_rules ' + whereInfo.clause + ' ORDER BY name ASC LIMIT ?,?', whereInfo.values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;
  return resp;
}

exports.getById = (damagePricingRuleId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM product_damage_pricing_rules WHERE product_damage_pricing_rules_id  = ?', [damagePricingRuleId])
      .then((rows) => {
        colUtils.outboundNaming(rows);
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      })
  })
}

exports.removeById = (damagePricingRuleId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('DELETE FROM product_damage_pricing_rules WHERE product_damage_pricing_rules_id  = ?', [damagePricingRuleId])
      .then((rows) => {
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      })
  })
}
