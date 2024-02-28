'use strict'

const globals = require('../globals')

exports.create = async (productConn, ltlReturnItem) => {
  const conn = productConn || globals.productPool

  const id = globals.mongoid.fetch()
  const { condition, ltlReturnId, notes, onPallet, vendorSku } = ltlReturnItem
  await conn.query(`
    INSERT INTO vendors.ltl_return_items
        (id, ltl_return_id, vendor_sku, on_pallet, \`condition\`, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, ltlReturnId, vendorSku, onPallet || null, condition, notes])

  return id
}
