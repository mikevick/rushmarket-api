'use strict';

const { formatResp } = require('../utils/response');
const ProductDamagePricingRules = require('../models/productDamagePricingRules');

// Create disposal fee rule
var create = async (name, active, damageSeverity, damageLocation, damagevisibility, pricingTypeId, damageAdjustmentValue, damageMessage, resp) => {
  var result = await ProductDamagePricingRules.create(name, active, damageSeverity, damageLocation, damagevisibility, pricingTypeId, damageAdjustmentValue, damageMessage);
  resp.id = result;
  return resp;
}

var updateById = async (productDamagePricingRulesId, setInfo, resp) => {
  var productDamagePricingRules = await ProductDamagePricingRules.getById(productDamagePricingRulesId);

  if (productDamagePricingRules.length === 0) {
    formatResp(resp, undefined, 404, 'No damage pricing rule found.');
  } else {
    var updateDamagePricing = await ProductDamagePricingRules.updateById(productDamagePricingRulesId, setInfo);

    if (updateDamagePricing.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Damage pricing rule not updated.');
    } else {
      resp.data = updateDamagePricing.rows;
    }
  }
  return resp;
}

var getAll = async (whereInfo, offset, limit, resp) => {
  var productDamagePricingRules = await ProductDamagePricingRules.getAll(whereInfo, offset, limit);

  resp.metaData.totalCount = productDamagePricingRules.totalCount;
  if (productDamagePricingRules.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No damage pricing rule found.');
  } else {
    resp.data.damagePricingRules = productDamagePricingRules.rows;
  }
  return resp;
}

var getById = async (productDamagePricingRulesId, resp) => {
  var productDamagePricingRules = await ProductDamagePricingRules.getById(productDamagePricingRulesId);

  if (productDamagePricingRules.length === 0) {
    formatResp(resp, undefined, 404, 'No damage pricing rule found.');
  } else {
    resp.data = productDamagePricingRules[0];
  }
  return resp;
}

var remove = async (productDamagePricingRulesId, resp) => {
  var productDamagePricingRules = await ProductDamagePricingRules.getById(productDamagePricingRulesId);

  if (productDamagePricingRules.length === 0) {
    formatResp(resp, undefined, 404, 'Damage pricing rule not found.');
  } else {
    await ProductDamagePricingRules.removeById(productDamagePricingRulesId);
  }
  return resp;
}

module.exports = {
  create,
  updateById,
  getAll,
  getById,
  remove
}
