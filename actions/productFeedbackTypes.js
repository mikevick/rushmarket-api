'use strict'

const { formatResp } = require('../utils/response')
const ProductFeedbackTypes = require('../models/productFeedbackTypes')




var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  var types = await ProductFeedbackTypes.getAll(whereInfo, sortBy, offset, limit)

  if (types.rows.length === 0) {
    formatResp(resp, ["data"], 404, 'No feedback types found.')
  } else {
    resp.data.productFeedbackTypes = types.rows
  }

  return resp
}




module.exports = {
  getAll
}
