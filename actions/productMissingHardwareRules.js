'use strict';

const { formatResp } = require('../utils/response');
const ProductMissingHardwareRules = require('../models/productMissingHardwareRules');

// Create disposal fee rule
var create = async (name, active, missingHardwareSeverity, pricingTypeId, damageAdjustmentValue, damageMessage, resp) => {
  var result = await ProductMissingHardwareRules.create(name, active, missingHardwareSeverity, pricingTypeId, damageAdjustmentValue, damageMessage);
  resp.id = result;
  return resp;
}

var updateById = async (id, setInfo, resp) => {
  var productMissingHardwareRules = await ProductMissingHardwareRules.getById(id);

  if (productMissingHardwareRules.length === 0) {
    formatResp(resp, undefined, 404, 'No missing hardware rule found.');
  } else {
    var updateMissingHardware = await ProductMissingHardwareRules.updateById(id, setInfo);

    if (updateMissingHardware.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Missing hardware rule not updated.');
    } else {
      resp.data = updateMissingHardware.rows;
    }
  }
  return resp;
}

var getAll = async (whereInfo, offset, limit, resp) => {
  var productMissingHardwareRules = await ProductMissingHardwareRules.getAll(whereInfo, offset, limit);

  resp.metaData.totalCount = productMissingHardwareRules.totalCount;
  if (productMissingHardwareRules.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No missing hardware rule found.');
  } else {
    resp.data.missingHardwareRules = productMissingHardwareRules.rows;
  }
  return resp;
}

var getById = async (id, resp) => {
  var productMissingHardwareRules = await ProductMissingHardwareRules.getById(id);

  if (productMissingHardwareRules.length === 0) {
    formatResp(resp, undefined, 404, 'No missing hardware rule found.');
  } else {
    resp.data = productMissingHardwareRules[0];
  }
  return resp;
}

var remove = async (id, resp) => {
  var productMissingHardwareRules = await ProductMissingHardwareRules.getById(id);

  if (productMissingHardwareRules.length === 0) {
    formatResp(resp, undefined, 404, 'Missing hardware rule not found.');
  } else {
    await ProductMissingHardwareRules.removeById(id);
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
