'use strict'

const { formatResp } = require('../utils/response')
const ProductDisposalFeeRules = require('../models/productDisposalFeeRules')

// Create disposal fee rule
var create = async (name, active, vendorId, boxSizeMin, boxSizeMax, disposalFee, resp) => {
  var result = await ProductDisposalFeeRules.create(name, active, vendorId, boxSizeMin, boxSizeMax, disposalFee)
  resp.id = result
  return resp
}

var updateById = async (productDisposalFeeRulesId, setInfo, resp) => {
  var productDisposalFeeRules = await ProductDisposalFeeRules.getById(productDisposalFeeRulesId)

  if (productDisposalFeeRules.length === 0) {
    formatResp(resp, undefined, 404, 'No disposal fee rule found.')
  } else {
    var updateDisposalFee = await ProductDisposalFeeRules.updateById(productDisposalFeeRulesId, setInfo)

    if (updateDisposalFee.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Disposal fee rule not updated.')
    } else {
      resp.data = updateDisposalFee.rows
    }
  }
  return resp
}

var getAll = async (whereInfo, offset, limit, resp) => {
  var productDisposalFeeRules = await ProductDisposalFeeRules.getAll(whereInfo, offset, limit)

  resp.metaData.totalCount = productDisposalFeeRules.totalCount
  if (productDisposalFeeRules.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No disposal fee rule found.')
  } else {
    resp.data.disposalFeeRules = productDisposalFeeRules.rows
  }
  return resp
}

var getById = async (productDisposalFeeRulesId, resp) => {
  var productDisposalFeeRules = await ProductDisposalFeeRules.getById(productDisposalFeeRulesId)

  if (productDisposalFeeRules.length === 0) {
    formatResp(resp, undefined, 404, 'No disposal fee rule found.')
  } else {
    resp.data = productDisposalFeeRules[0]
  }
  return resp
}

var remove = async (productDisposalFeeRulesId, resp) => {
  var productDisposalFeeRules = await ProductDisposalFeeRules.getById(productDisposalFeeRulesId)

  if (productDisposalFeeRules.length === 0) {
    formatResp(resp, undefined, 404, 'Disposal fee rule not found.')
  } else {
    await ProductDisposalFeeRules.removeById(productDisposalFeeRulesId)
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
