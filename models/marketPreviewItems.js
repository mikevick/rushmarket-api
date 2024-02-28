'use strict'

const globals = require('../globals')

exports.verifyMemberMarketPreviewConnection = async (whereInfo) => {
  var resp = {
    rows: []
  }

  var rows = await globals.pool.query('SELECT m.id FROM members m JOIN stores s ON m.home_shopify_store_id = s.shopify_store_id JOIN market_previews_to_stores mps ON s.store_id = mps.store_id JOIN market_previews mp ON mps.market_preview_id = mp.id ' + whereInfo.clause, whereInfo.values)
  resp.rows = rows

  return resp
}

exports.getMarketPreviewItems = async (whereInfo, offset, limit) => {
  var resp = {
    totalCount: 0,
    rows: []
  }

  // Get the number of skus for pagination
  var count = await globals.pool.query('SELECT count(*) as num FROM market_previews mp JOIN market_preview_instances mpi ON mp.id = mpi.market_preview_id JOIN market_preview_items i ON mpi.id = i.market_preview_instance_id JOIN products p ON i.sku = p.sku ' + whereInfo.clause, whereInfo.values)
  resp.totalCount = count[0].num

  if (resp.totalCount) {
    whereInfo.values.push(offset)
    whereInfo.values.push(limit)
    var rows = await globals.pool.query('SELECT p.sku, p.name, p.status, p.image, p.msrp, p.price, p.market_price FROM market_previews mp JOIN market_preview_instances mpi ON mp.id = mpi.market_preview_id JOIN market_preview_items i ON mpi.id = i.market_preview_instance_id JOIN products p ON i.sku = p.sku ' + whereInfo.clause + ' ORDER BY i.sequence ASC LIMIT ?,? ', whereInfo.values)
    resp.rows = rows
  }
  return resp
}
