'use strict'

const { formatResp } = require('../utils/response')
const MarketPreviewItems = require('../models/marketPreviewItems')

var verifyMemberMarketPreviewConnection = async (whereInfo, resp) => {
  var memberMarketPreviewConnection = await MarketPreviewItems.verifyMemberMarketPreviewConnection(whereInfo)
  if (memberMarketPreviewConnection.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No market previews available for this member.')
  } else {
    resp.data.memberMarketPreviewConnection = memberMarketPreviewConnection.rows[0]
  }
  return resp
}

var getMarketPreviewItems = async (whereInfo, offset, limit, resp) => {
  var marketPreviewItems = await MarketPreviewItems.getMarketPreviewItems(whereInfo, offset, limit)

  if (marketPreviewItems.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No market preview items found.')
  } else {
    resp.data.marketPreviewItems = marketPreviewItems.rows
    resp.metaData.totalCount = marketPreviewItems.totalCount
  }

  return resp
}

module.exports = {
  verifyMemberMarketPreviewConnection,
  getMarketPreviewItems
}
