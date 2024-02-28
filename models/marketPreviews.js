'use strict'

const globals = require('../globals')

exports.getMarketPreviews = (whereInfo) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT mp.title, mp.description, mp.handle FROM members m JOIN stores s ON m.home_shopify_store_id = s.shopify_store_id JOIN market_previews_to_stores mps ON s.store_id = mps.store_id JOIN market_previews mp ON mps.market_preview_id = mp.id ' + whereInfo.clause, whereInfo.values)
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}
