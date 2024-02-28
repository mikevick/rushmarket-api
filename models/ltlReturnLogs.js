'use strict'

const globals = require('../globals')

exports.create = async (productConn, ltlReturnLog) => {
  const conn = productConn || globals.productPool

  const id = globals.mongoid.fetch()
  const { json, ltlReturnId, status, userId, userType } = ltlReturnLog
  await conn.query(`
    INSERT INTO vendors.ltl_return_logs (id, date_created, user_id, user_type, ltl_return_id, status, json)
    VALUES (?, NOW(), ?, ?, ?, ?, ?)
  `, [id, userId, userType, ltlReturnId, status, json])

  return id
}
