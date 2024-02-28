'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.getInventory = async (coins) => {
	var prom = [];
	var result = [];

	var coinSql = `SELECT coin_id, vendor_id, vendor_sku FROM coins_to_vskus WHERE coin_id = ?`;
	var sql = `SELECT p.status, COUNT(*) AS qty 
					FROM products p
						LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
						LEFT JOIN stores s ON s.store_id = p.store_id
						LEFT JOIN storage_locations sl ON sl.location_number = p.location_number AND sl.store_id = p.store_id
					WHERE p.status IN ('Live', 'Received')
						AND condition_name IN ('Like New', 'New')
						AND m.vendor_id = ?
						AND p.seller_product_id = ?
						AND s.active = 'Y'
						AND s.is_product_location = 'Y'
						AND sl.in_inventory_count = 'Y'
					GROUP BY p.status`;


	for (var i = 0; i < coins.length; i++) {
		// console.log(mysql.format(coinSql, coins[i]));
		var vskus = await globals.pool.query(coinSql, coins[i]);

		var live = 0;
		var received = 0;
		
		for (var j = 0; j < vskus.length; j++) {

			// console.log(mysql.format(sql, [vskus[j].vendor_id, vskus[j].vendor_sku]));
			var quantity = await globals.pool.query(sql, [vskus[j].vendor_id, vskus[j].vendor_sku]);
		
			for (var k = 0; k < quantity.length; k++) {
				if (quantity[k].status.toUpperCase() === 'LIVE') {
					live += quantity[k].qty;
				}
				else {
					received += quantity[k].qty;
				}
			}

			// var rows = colUtils.outboundNaming(rows);
		}

		result.push({
			coinId: coins[i],
			quantity: live + Math.floor((received * .6)),
			liveQuantity: live, 
			receivedQuantity: received
		});
	}


	return result;
}



exports.getListedOns = async () => {
	var prom = [];
	var result = [];

	var sql = `SELECT id, platform FROM listed_on ORDER BY platform ASC`;
	
	var rows = await globals.productROPool.query(sql);

	colUtils.outboundNaming(rows);

	return rows;
}


exports.getNotListedReasons = async () => {
	var prom = [];
	var result = [];

	var sql = 'SELECT id, reason FROM not_listed_reasons ORDER BY `reason` ASC';
	
	var rows = await globals.productROPool.query(sql);

	colUtils.outboundNaming(rows);

	return rows;
}


exports.getNotListedReasonsByReason = async (reason) => {
	var prom = [];
	var result = [];

	var sql = 'SELECT id, reason FROM not_listed_reasons WHERE reason = ? ORDER BY `reason` ASC';
	
	var rows = await globals.productROPool.query(sql, [reason]);

	colUtils.outboundNaming(rows);

	return rows;
}


exports.createNotListedReason = async (reason) => {
	var prom = [];
	var result = [];

	var sql = 'INSERT INTO not_listed_reasons (reason, `order`) VALUES (?, ?)';
	var result = await globals.productPool.query(sql, [reason, 0]);

	return result;
}