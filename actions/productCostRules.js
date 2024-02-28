'use strict'

const { formatResp } = require('../utils/response')
const ProductCostRules = require('../models/productCostRules')

// Create disposal fee rule
var create = async (name, active, vendorId, conditionId, conditionName, conditionValue, costBase, resp) => {
  var result = await ProductCostRules.create(name, active, vendorId, conditionId, conditionName, conditionValue, costBase)
  resp.id = result
  return resp
}

var updateById = async (productCostRulesId, setInfo, resp) => {
  var productCostRules = await ProductCostRules.getById(productCostRulesId)

  if (productCostRules.length === 0) {
    formatResp(resp, undefined, 404, 'No cost pricing rule found.')
  } else {
    var updateCostPricing = await ProductCostRules.updateById(productCostRulesId, setInfo)

    if (updateCostPricing.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Cost pricing rule not updated.')
    } else {
      resp.data = updateCostPricing.rows
    }
  }
  return resp
}

var getAll = async (whereInfo, offset, limit, resp) => {
  var productCostRules = await ProductCostRules.getAll(whereInfo, offset, limit)

  resp.metaData.totalCount = productCostRules.totalCount
  if (productCostRules.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No cost pricing rule found.')
  } else {
    resp.data.costPricingRules = productCostRules.rows
  }
  return resp
}

var getById = async (productCostRulesId, resp) => {
  var productCostRules = await ProductCostRules.getById(productCostRulesId)

  if (productCostRules.length === 0) {
    formatResp(resp, undefined, 404, 'No cost pricing rule found.')
  } else {
    resp.data = productCostRules[0]
  }
  return resp
}

var remove = async (productCostRulesId, resp) => {
  var productCostRules = await ProductCostRules.getById(productCostRulesId)

  if (productCostRules.length === 0) {
    formatResp(resp, undefined, 404, 'Cost pricing rule not found.')
  } else {
    await ProductCostRules.removeById(productCostRulesId)
  }
  return resp
}

module.exports = {
  create,
  updateById,
  getAll,
  getById,
  remove
}
