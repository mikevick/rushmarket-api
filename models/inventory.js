'use strict';

const mysql = require('promise-mysql');
const globals = require('../globals');

exports.getInventory = async (vendorSkus) => {
	var prom = [];
	var result = [];

	var sql = `SELECT c.coin_id AS coin, p.seller_product_id, COUNT(sku) AS quantity
						FROM products p
							LEFT JOIN coins_to_vskus c ON c.vendor_sku = p.seller_product_id
						WHERE STATUS IN ('Live', 'Received') 
							AND seller_product_id = ?`;

	for (var i = 0; i < vendorSkus.length; i++) {
		console.log(mysql.format(sql, vendorSkus[i]));
		prom.push(globals.pool.query(sql, vendorSkus[i]));
	}

	var results = await Promise.all(prom);

	for (var i = 0; i < results.length; i++) {
		var rows = results[i];
		console.log('Row: ' + JSON.stringify(rows, undefined, 2));
		result.push({
			vendorSku: vendorSkus[i],
			coinId: rows[0].coin,
			quantity: rows[0].quantity
		});
		// var rows = colUtils.outboundNaming(rows);
	}

	return result;
}