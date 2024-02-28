'use strict';

const globals = require('../globals');



exports.log = async (sku, action, userId, userType) => {
	var sql = `INSERT INTO product_action_log (sku, action, user_id, user_type) VALUES (?, ?, ?, ?)`;

	await globals.pool.query(sql, [sku, action, userId, userType]);
}


