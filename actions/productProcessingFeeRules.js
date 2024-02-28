'use strict'

const { formatResp } = require('../utils/response')
const ProductProcessingFeeRules = require('../models/productProcessingFeeRules')

// Create processing fee rule
var create = async (name, active, vendorId, boxSizeMin, boxSizeMax, processingFee, resp) => {
  var result = await ProductProcessingFeeRules.create(name, active, vendorId, boxSizeMin, boxSizeMax, processingFee)
  resp.id = result
  return resp
}

var updateById = async (productProcessingFeeRulesId, setInfo, resp) => {
  var productProcessingFeeRules = await ProductProcessingFeeRules.getById(productProcessingFeeRulesId)

  if (productProcessingFeeRules.length === 0) {
    formatResp(resp, undefined, 404, 'No processing fee rule found.')
  } else {
    var updateProcessingFee = await ProductProcessingFeeRules.updateById(productProcessingFeeRulesId, setInfo)

    if (updateProcessingFee.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Processing fee rule not updated.')
    } else {
      resp.data = updateProcessingFee.rows
    }
  }
  return resp
}

var getAll = async (whereInfo, offset, limit, resp) => {
  var productProcessingFeeRules = await ProductProcessingFeeRules.getAll(whereInfo, offset, limit)

  resp.metaData.totalCount = productProcessingFeeRules.totalCount
  if (productProcessingFeeRules.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No processing fee rule found.')
  } else {
    resp.data.processingFeeRules = productProcessingFeeRules.rows
  }
  return resp
}

var getById = async (productProcessingFeeRulesId, resp) => {
  var productProcessingFeeRules = await ProductProcessingFeeRules.getById(productProcessingFeeRulesId)

  if (productProcessingFeeRules.length === 0) {
    formatResp(resp, undefined, 404, 'No processing fee rule found.')
  } else {
    resp.data = productProcessingFeeRules[0]
  }
  return resp
}

var remove = async (productProcessingFeeRulesId, resp) => {
  var productProcessingFeeRules = await ProductProcessingFeeRules.getById(productProcessingFeeRulesId)

  if (productProcessingFeeRules.length === 0) {
    formatResp(resp, undefined, 404, 'Processing fee rule not found.')
  } else {
    await ProductProcessingFeeRules.removeById(productProcessingFeeRulesId)
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
