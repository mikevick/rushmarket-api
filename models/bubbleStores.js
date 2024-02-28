'use strict'

const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

exports.create = (bubbleId, shopifyStoreId) => {
  return new Promise((resolve, reject) => {
    var id = globals.mongoid.fetch()
    var values = [id, bubbleId, shopifyStoreId]

    globals.productPool.query('INSERT INTO bubbles_to_shopify_stores (id, bubble_id, shopify_store_id) VALUES (?, ?, ?)', values)
      .then((results) => {
        resolve(id)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.updateById = async (id, setInfo) => {
  var resp = {
    rows: []
  }
  setInfo.values.push(id)
  var updateResult = await globals.productPool.query('UPDATE bubbles_to_shopify_stores ' + setInfo.clause + ', date_modified = NOW() WHERE id = ?', setInfo.values)
  if (updateResult.affectedRows) {
    var rows = await globals.productPool.query('SELECT * FROM bubbles_to_shopify_stores WHERE id = ?', [id])
    colUtils.outboundNaming(rows)
    resp.rows = rows
  }

  return resp
}

exports.getAll = async (whereInfo, offset, limit) => {
  var resp = {
    totalCount: 0,
    rows: []
  }

  var count = await globals.productPool.query('SELECT count(*) as num FROM bubbles_to_shopify_stores ' + whereInfo.clause, whereInfo.values)
  resp.totalCount = count[0].num
  whereInfo.values.push(offset)
  whereInfo.values.push(limit)
  var rows = await globals.productPool.query('SELECT * FROM bubbles_to_shopify_stores ' + whereInfo.clause + ' ORDER BY shopify_store_id ASC LIMIT ?,?', whereInfo.values)
  colUtils.outboundNaming(rows)
  resp.rows = rows

  return resp
}

exports.getById = (id) => {
  return new Promise((resolve, reject) => {
    globals.productPool.query('SELECT * FROM bubbles_to_shopify_stores WHERE id = ?', [id])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.getByBubbleId = (bubbleId) => {
  return new Promise((resolve, reject) => {
    globals.productPool.query('SELECT * FROM bubbles_to_shopify_stores WHERE bubble_id = ?', [bubbleId])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.removeById = (id) => {
  return new Promise((resolve, reject) => {
    globals.productPool.query('DELETE FROM bubbles_to_shopify_stores WHERE id = ?', [id])
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}

exports.getByBubbleIdAndShopifyStoreId = (bubbleId, shopifyStoreId) => {
  return new Promise((resolve, reject) => {
    globals.productPool.query('SELECT * FROM bubbles_to_shopify_stores WHERE bubble_id = ? AND shopify_store_id = ?', [bubbleId, shopifyStoreId])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}
exports.removeByBubbleIdAndShopifyStoreId = (bubbleId, shopifyStoreId) => {
  return new Promise((resolve, reject) => {
    globals.productPool.query('DELETE FROM bubbles_to_shopify_stores WHERE bubble_id = ? AND shopify_store_id = ?', [bubbleId, shopifyStoreId])
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}
