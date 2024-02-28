'use strict'

const globals = require('../globals')

const colUtils = require('../utils/columnUtils')



exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  var resp = {
    totalCount: 0,
    rows: []
  }

	whereInfo.values.push(offset);
	whereInfo.values.push(limit);

	// console.log(mysql.format('SELECT * FROM product_feedback_types ' + whereInfo.clause + ' ORDER BY ' + sortBy + ' LIMIT ?,?', whereInfo.values));

  var rows = await globals.pool.query('SELECT * FROM product_feedback_types ' + whereInfo.clause + ' ORDER BY ' + sortBy + ' LIMIT ?,?', whereInfo.values)
  colUtils.outboundNaming(rows)
  resp.rows = rows

  return resp
}

