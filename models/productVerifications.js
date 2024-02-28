'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.get = async (sku) => {
	// console.log(mysql.format("SELECT `key`, `value` FROM product_verifications WHERE sku = ?", [sku]));
	let rows = await globals.poolRO.query("SELECT `key`, `value`, `done`, `done_by`, `date_done` FROM product_verifications WHERE sku = ?", [sku]);
	
  colUtils.outboundNaming(rows);
  return rows;
}

exports.clear = async (conn, sku) => {
  const poolConnection = conn ? conn : globals.pool;
  await poolConnection.query("DELETE FROM product_verifications WHERE sku = ?", [sku]);
}

exports.create = async (conn, sku, key, value, userId, userType) => {
  const poolConnection = conn ? conn : globals.pool;
  await poolConnection.query("INSERT INTO product_verifications SET sku = ?, `key` = ?, `value` = ?, user_id = ?, user_type = ?", [sku, key, value, userId, userType]);
}

exports.update = async (sku, key, setInfo) => {
	return await globals.pool.query(
		`UPDATE product_verifications ${setInfo.clause} WHERE sku = ? AND \`key\` = ?`,
		[...setInfo.values, sku, key]
	);
}
