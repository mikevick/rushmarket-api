'use strict'

const { formatResp } = require('../utils/response')
const MarketPreviews = require('../models/marketPreviews')

var getMarketPreviews = async (whereInfo, resp) => {
  var marketPreviews = await MarketPreviews.getMarketPreviews(whereInfo)

  if (marketPreviews.length === 0) {
    formatResp(resp, undefined, 404, 'No market previews found.')
  } else {
    resp.data.marketPreviews = marketPreviews
  }

  return resp
}

module.exports = {
  getMarketPreviews
}
