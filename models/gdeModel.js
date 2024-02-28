'use strict';

const globals = require('../globals');

const mysql = require('promise-mysql');

const colUtils = require('../utils/columnUtils');




exports.getDataCheck = async () => {
	var rows = await globals.poolRO.query("SELECT DISTINCT(sku), message FROM gde_data_check_queue WHERE notified_flag = 0");
	colUtils.outboundNaming(rows);

	return rows;
}


exports.markDataCheckNotified = async (rows) => {
	for (var i = 0; i < rows.length; i++) {
		await globals.pool.query("UPDATE gde_data_check_queue SET notified_flag = true WHERE sku = ? ", [rows[i].sku]);
	}
}




exports.getGDEData = async (sku, cityId) => {
	var where = `WHERE mse.sku = ?`;
	var values = [sku];
	if (cityId !== undefined) {
		where = `WHERE mse.sku = ? AND mse.dest_city_id = ? `;
		values = [sku, cityId];
	}

	var sql = `SELECT mse.sku, c1.name AS category_1_name, c2.name AS category_2_name, f.manifest_id, f.manifest_source, mse.ship_type, mse.box_count, 
									mse.shippable, mse.local_shipping, om.name AS origin_market, dm.name AS destination_market, mse.price, mse.threshold_shipping, 
									mse.large_item_fee, mse.product_cost, mse.drop_ship_fee, mse.ship_calc_status, mse.national_ship_cost, mse.local_ship_cost, 
									mse.national_margin_pct, mse.local_margin_pct, dm.margin_eligibility_threshold, mr.margin_eligibility_threshold AS category_margin_threshold,
									mse.dest_city_id, mse.eligibility, mse.eligibility_override, COALESCE(mse.eligibility_override, mse.eligibility) as effective_eligibility,
									a.state as current_ripple, a.state_expire as ripple_expiration
								FROM metro_sku_eligibility mse 
									LEFT JOIN products p ON p.sku = mse.sku 
									LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2 
									LEFT JOIN categories c2 ON c2.category_id = cm.category_id 
									LEFT JOIN categories c1 ON c1.category_id = c2.parent_id 
									LEFT JOIN metros om ON om.id = mse.origin_metro_id 
									LEFT JOIN metros dm ON dm.id = mse.dest_metro_id
									LEFT JOIN manifests f ON p.manifest_id = f.manifest_id 
									LEFT JOIN metro_category_margin_rules mr ON ((mr.metro_id = dm.id) AND (mr.category_id = mse.category_id))
									LEFT JOIN gde_sku_algo_state a ON a.sku = mse.sku
								${where}
								ORDER BY category_1_name, category_2_name, destination_market`;
	// console.log(mysql.format(sql, values));
	var rows = await globals.poolRO.query(sql, values);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getGDEDataByCoin = async (coin, cityId) => {
	var list = "";
	var rows = await globals.productROPool.query("SELECT vendor_sku FROM coins_to_vendor_skus WHERE coin_id = ?", [coin]);

	for (var i = 0; i < rows.length; i++) {
		if (list.length > 0) {
			list += ", ";
		}
		list += "'" + rows[i].vendor_sku + "'";
	}

	if (list.length > 0) {
		var where = `WHERE p.seller_product_id IN (${list})`;
		if (cityId !== undefined) {
			where = `WHERE p.seller_product_id IN (${list}) AND dest_city_id = ?`;
		}

		var sql = `SELECT mse.sku, c1.name AS category_1_name, c2.name AS category_2_name, f.manifest_id, f.manifest_source, mse.ship_type, mse.box_count, 
										mse.shippable, mse.local_shipping, om.name AS origin_market, dm.name AS destination_market, mse.price, mse.threshold_shipping, 
										mse.large_item_fee, mse.product_cost, mse.drop_ship_fee, mse.ship_calc_status, mse.national_ship_cost, mse.local_ship_cost, 
										mse.national_margin_pct, mse.local_margin_pct, dm.margin_eligibility_threshold, mr.margin_eligibility_threshold AS category_margin_threshold, 
										mse.dest_city_id, mse.eligibility, mse.eligibility_override, COALESCE(mse.eligibility_override, mse.eligibility) as effective_eligibility,
										a.state as current_ripple, a.state_expire as ripple_expiration
									FROM metro_sku_eligibility mse 
										LEFT JOIN products p ON p.sku = mse.sku 
										LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2 
										LEFT JOIN categories c2 ON c2.category_id = cm.category_id 
										LEFT JOIN categories c1 ON c1.category_id = c2.parent_id 
										LEFT JOIN metros om ON om.id = mse.origin_metro_id 
										LEFT JOIN metros dm ON dm.id = mse.dest_metro_id 
										LEFT JOIN manifests f ON p.manifest_id = f.manifest_id 
										LEFT JOIN metro_category_margin_rules mr ON ((mr.metro_id = dm.id) AND (mr.category_id = mse.category_id)) 
										LEFT JOIN gde_sku_algo_state a ON a.sku = mse.sku
									${where}
									ORDER BY category_1_name, category_2_name`;

		// console.log(mysql.format(sql, [cityId]));
		var rows = await globals.poolRO.query(sql, [cityId]);
	}
	colUtils.outboundNaming(rows);

	return rows;
}






exports.getExportInfo = async (dbInfo) => {
	var sql = "SELECT mse.sku, c1.name AS category_1_name, c2.name AS category_2_name, f.manifest_id, f.manifest_source, mse.ship_type, mse.box_count, mse.shippable, mse.local_shipping, " +
		"om.name AS origin_market, dm.name AS destination_market, mse.price, mse.threshold_shipping, mse.large_item_fee, mse.product_cost, mse.drop_ship_fee, " +
		"mse.national_ship_cost, mse.local_ship_cost, mse.national_margin_pct, mse.local_margin_pct, dm.margin_eligibility_threshold, mse.eligibility " +
		"FROM metro_sku_eligibility mse " +
		"LEFT JOIN products p ON p.sku = mse.sku " +
		"LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2  " +
		"LEFT JOIN categories c2 ON c2.category_id = cm.category_id " +
		"LEFT JOIN categories c1 ON c1.category_id = c2.parent_id " +
		"LEFT JOIN metros om ON om.id = mse.origin_metro_id " +
		"LEFT JOIN metros dm ON dm.id = mse.dest_metro_id " +
		"LEFT JOIN manifests f ON p.manifest_id = f.manifest_id " +
		"ORDER BY category_1_name, category_2_name";

	var rows = await dbInfo.dbPool.query(sql);
	colUtils.outboundNaming(rows);
	return rows;
}


exports.getQueuedMsgs = async () => {
	var rows = await globals.pool.query("SELECT * FROM gde_failover_queue ORDER BY date_created LIMIT 0,1000");
	colUtils.outboundNaming(rows);
	return rows;
}

exports.queueMsg = async (sku, msg) => {
	var result = null;
	msg = JSON.stringify(msg, undefined, 2);
	// console.log("SQL: " + mysql.format("INSERT INTO gde_failover_queue (sku, msg) VALUES (?, ?)", [sku, msg]));
	result = await globals.pool.query("INSERT INTO gde_failover_queue (sku, msg) VALUES (?, ?)", [sku, msg]);

	return result;
}

exports.deleteQueuedMsg = async (id) => {
	var result = await globals.pool.query("DELETE FROM gde_failover_queue WHERE id = ?", [id]);

	return result;
}



exports.prune = async (dbInfo) => {
	var result = await dbInfo.dbPool.query("DELETE FROM metro_sku_eligibility WHERE sku IN (SELECT sku FROM products WHERE status != 'Live' OR online_shopping = 'N')");

	return result;
}




exports.intelliPrune = async (dbInfo) => {
	var rows = await dbInfo.dbPool.query(`
				SELECT * FROM metro_sku_eligibility 
					WHERE sku NOT IN (SELECT sku FROM products WHERE (STATUS = 'Received') OR (STATUS = 'Live' AND online_shopping = 'Y'))
					AND sku NOT IN (SELECT sku FROM lap_cluster_bubbles)
					AND sku NOT IN (SELECT sku FROM order_line_static WHERE date_created >= DATE_ADD(NOW(), INTERVAL -10 DAY))`);

	for (let i=0; i < rows.length; i++) {
		try {
			let result = await dbInfo.dbLogPool.query(`INSERT INTO metro_sku_eligibility_archive
																(date_created, date_modified, sku, coin_id, vendor_id, vendor_sku, category_id, ship_type, shippable, local_shipping,
																	ship_calc_status, box_count, boxes, box_hash, origin_metro_id, origin_postal_code, origin_city_id,
																	dest_metro_id, dest_postal_code, dest_city_id, price, threshold_shipping, large_item_fee, product_cost,
																	drop_ship_fee, national_ship_cost, national_margin_dollars, national_margin_pct, national_profitable,
																	local_ship_cost, local_margin_dollars, local_margin_pct, local_profitable, eligibility, eligibility_override,
																	error_message, raw_response)
																VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
																				?, ?, ?, ?, ?, ?, ?,
																				?, ?, ?, ?, ?, ?, ?,
																				?, ?, ?, ?, ?, 
																				?, ?, ?, ?, ?, ?, 
																				?, ?)`, 
																	[rows[i].date_created, rows[i].date_modified, rows[i].sku, rows[i].coin_id, rows[i].vendor_id, rows[i].vendor_sku, rows[i].category_id, 
																		rows[i].ship_type, rows[i].shippable, rows[i].local_shipping,	rows[i].ship_calc_status, rows[i].box_count, rows[i].boxes, rows[i].box_hash, 
																		rows[i].origin_metro_id, rows[i].origin_postal_code, rows[i].origin_city_id, rows[i].dest_metro_id, rows[i].dest_postal_code, rows[i].dest_city_id, 
																		rows[i].price, rows[i].threshold_shipping, rows[i].large_item_fee, rows[i].product_cost, rows[i].drop_ship_feel, 
																		rows[i].national_ship_cost, rows[i].national_margin_dollars, rows[i].national_margin_pct, rows[i].national_profitable,
																		rows[i].local_ship_cost, rows[i].local_margin_dollars, rows[i].local_margin_pct, rows[i].local_profitable, 
																		rows[i].eligibility, rows[i].eligibility_override, rows[i].error_message, rows[i].raw_response]);
			}
			catch (e) {
		}
	}		

	var result = await dbInfo.dbPool.query(`
				DELETE FROM metro_sku_eligibility 
					WHERE sku NOT IN (SELECT sku FROM products WHERE (STATUS = 'Received') OR (STATUS = 'Live' AND online_shopping = 'Y'))
					AND sku NOT IN (SELECT sku FROM lap_cluster_bubbles)
					AND sku NOT IN (SELECT sku FROM order_line_static WHERE date_created >= DATE_ADD(NOW(), INTERVAL -10 DAY))`);

	await dbInfo.dbPool.query('DELETE FROM metro_sku_eligibility_summary WHERE sku NOT IN (SELECT sku FROM metro_sku_eligibility)');
	await dbInfo.dbPool.query('DELETE FROM metro_sku_eligibility_summary_by_city WHERE sku NOT IN (SELECT sku FROM metro_sku_eligibility)');
	await dbInfo.dbPool.query('DELETE FROM gde_sku_algo_state WHERE sku NOT IN (SELECT sku FROM metro_sku_eligibility)');

	return result;
}


exports.pruneAllHashes = async () => {
	var result = await globals.pool.query("DELETE FROM gde_box_hashes");

	return result;
}



exports.pruneHashes = async (dbInfo) => {
	var result = await dbInfo.dbPool.query("DELETE FROM gde_box_hashes WHERE date_created < DATE_ADD(NOW(), INTERVAL -24 HOUR)");

	return result;
}





exports.getRecentlyCalculated = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT count(*) num FROM metro_sku_eligibility WHERE (date_created >= DATE_SUB(NOW(), INTERVAL 6 HOUR)) OR (date_modified >= DATE_SUB(NOW(), INTERVAL 6 HOUR))")
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.addCategoryGrouping = async (dow, categoryId) => {
	var result = await globals.pool.query(`INSERT INTO gde_category_groupings (day_of_week, category_id) VALUES (?, ?)`, [dow, categoryId]);
	return result;
}


exports.clearCategoryGroupings = async () => {
	var result = await globals.pool.query(`DELETE FROM gde_category_groupings`);
	return result;
}


exports.getTodaysCategories = async (dow) => {
	var rows = await globals.pool.query(`SELECT category_id FROM gde_category_groupings WHERE day_of_week = ?`, [dow]);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getSkuCountsByCategory = async () => {
	var result = {
		totalCount: 0,
		rows: []
	}
	var rows = await globals.poolRO.query(`SELECT category_id, COUNT(DISTINCT(e.sku)) AS num 
																						FROM metro_sku_eligibility e
																							LEFT JOIN products p ON p.sku = e.sku
																							LEFT JOIN stores s ON s.store_id = p.store_id 
																						WHERE ((STATUS = 'Live' AND online_shopping = 'Y') OR (STATUS = 'Received')) 
																							AND s.active = 'Y' 
																							AND s.shopify_store_id != 999
																						GROUP BY category_id ORDER BY num`);
	colUtils.outboundNaming(rows);
	for (var i=0; i < rows.length; i++) {
		result.totalCount += rows[i].num;
	}

	result.rows = rows;
	return result;
}



exports.transitionVendorFromLocalToAll = async (vendorId) => {
	var prom = [];

	var skus = await globals.pool.query(`SELECT s.sku 
													FROM coreleap.gde_sku_algo_state s
														LEFT JOIN coreleap.products p ON p.sku = s.sku
														LEFT JOIN coreleap.manifests m ON p.manifest_id = m.manifest_id
													WHERE m.vendor_id = ?
														AND s.state = 'LOCAL' 
														AND s.state_expire IS NULL
													`, [vendorId]);

	for (var i = 0; i < skus.length; i++) {
		prom.push(globals.pool.query(`UPDATE gde_sku_algo_state SET date_modified = now(), state_expire = NOW() WHERE sku = ?`, [skus[i].sku]));
	}

	await Promise.all(prom);
}


exports.transitionVendorFromAllToLocal = async (vendorId) => {
	var prom = [];

	var skus = await globals.pool.query(`SELECT s.sku 
													FROM coreleap.gde_sku_algo_state s
														LEFT JOIN coreleap.products p ON p.sku = s.sku
														LEFT JOIN coreleap.manifests m ON p.manifest_id = m.manifest_id
														WHERE m.vendor_id = ?`, [vendorId]);

	for (var i = 0; i < skus.length; i++) {
		prom.push(globals.pool.query(`UPDATE gde_sku_algo_state SET date_modified = now(), state = 'LOCAL', state_expire = NULL WHERE sku = ?`, [skus[i].sku]));
	}

	await Promise.all(prom);
}



exports.getAverages = async (skus) => {
	let sql = `SELECT ROUND(AVG(national_margin_dollars), 2) AS dollars, ROUND(AVG(national_margin_pct), 2) AS pct
								FROM metro_sku_eligibility 
										WHERE sku IN (${skus}) AND COALESCE(eligibility_override, eligibility) IN ('SHIPPABLE', 'BOPIS_ONLY', 'LOCAL_ONLY')`;

	// console.log(sql);
	let results = await globals.pool.query(sql);
	return results;
}



exports.getMarginHighestShipping = async (skus) => {
	let sql = `SELECT COALESCE(eligibility_override, eligibility) AS effective_eligibility, 
									price, threshold_shipping, large_item_fee, product_cost, drop_ship_fee, local_profitable, local_ship_cost, national_profitable, national_ship_cost, avg_national_ship_cost AS category_avg,
									(ROUND(((price - product_cost) / price), 2) * 100) AS bopis_pct,
									(ROUND(( ((price + threshold_shipping + large_item_fee) - (product_cost + local_ship_cost)) / (price + threshold_shipping + large_item_fee)), 2) * 100) AS local_pct, 
									(ROUND((((price + threshold_shipping + large_item_fee) - (product_cost + avg_national_ship_cost + drop_ship_fee)) / (price + threshold_shipping + large_item_fee)), 2) * 100) AS no_ship_cost_shippable_pct,
									(ROUND((((price + threshold_shipping + large_item_fee) - (product_cost + drop_ship_fee)) / (price + threshold_shipping + large_item_fee)), 2) * 100) AS no_ship_cost_pct,
									ROUND(MIN(national_margin_pct), 2) AS pct
							FROM metro_sku_eligibility e
								LEFT JOIN categories c ON e.category_id = c.category_id
							WHERE sku IN (${skus}) AND COALESCE(eligibility_override, eligibility) IN ('SHIPPABLE', 'BOPIS_ONLY', 'LOCAL_ONLY')`;

	// console.log(sql);
	let results = await globals.pool.query(sql);
	return results;
}




exports.getShippable = async (skus) => {
	let sql = `SELECT p.sku, p.price, dest_postal_code, COALESCE(eligibility_override, eligibility) AS eligibility 
	FROM metro_sku_eligibility e
		LEFT JOIN products p ON p.sku = e.sku
	WHERE e.sku IN (${skus}) AND COALESCE(eligibility_override, eligibility) IN ('SHIPPABLE', 'BOPIS_ONLY', 'LOCAL_ONLY') 
	GROUP BY dest_postal_code, eligibility
	ORDER BY dest_city_id`;

	let results = await globals.pool.query(sql);
	return results;
}



exports.getShippablePct = async (skus) => {
	let sql = `SELECT sku, pct_ship_eligible FROM metro_sku_eligibility_summary WHERE sku IN (${skus}) ORDER BY pct_ship_eligible DESC`;

	let results = await globals.pool.query(sql);
	return results;
}


exports.getByVendorSku = async (vendorSku) => {
	let sql = `SELECT distinct(sku) as sku FROM metro_sku_eligibility WHERE vendor_sku = ?`;

	let results = await globals.poolRO.query(sql, [vendorSku]);
	return results;
}


exports.getAverageShippingByCategory = async () => {
	let sql = `SELECT category_id, ROUND(AVG(national_ship_cost), 2) AS avg_ship_cost 
								FROM metro_sku_eligibility e
									LEFT JOIN products p ON e.sku = p.sku
								WHERE STATUS = 'Live' AND online_shopping = 'Y'
								GROUP BY category_id`;

	let rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.checkForSpecialLogicCategory = async (categoryId, label) => {
	let sql = `SELECT slc.category_id 
								FROM gde_special_logic_categories slc
										LEFT JOIN gde_special_logic sl ON sl.id = slc.special_id
								WHERE label = ?
									AND category_id = ?`;

	// console.log(mysql.format(sql, [hash]))									
	let rows = await globals.pool.query(sql, [label, categoryId]);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getCoinMarginThresholdByVsku = async (vendorId, vendorSku) => {
	let sql = `SELECT margin_eligibility_threshold as coin_threshold 
								FROM gde_coin_margin_rules m
										LEFT JOIN coins_to_vskus c ON c.coin_id = m.coin_id
								WHERE vendor_id = ?
									AND vendor_sku = ?`;

	// console.log(mysql.format(sql, [hash]))									
	let rows = await globals.pool.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.logRoutingDecision = async (vendorId, vendorSku, originZip, routeToStoreId, decisionLabel, message, isInternal) => {
	return globals.logPool.query(`
		INSERT INTO rrc_routing_log
		    (vendor_id, vendor_sku, origin_zip, route_to_store_id, decision_label, message, internal_flag)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[vendorId, vendorSku, originZip, routeToStoreId, decisionLabel, message, isInternal]);
}

exports.updateProductPrice = async (sku, pricingTypeId, fromPrice, toPrice, userId, userType) => {
	await globals.pool.query("UPDATE metro_sku_eligibility SET date_modified = NOW(), price = ? WHERE sku = ?", [toPrice, sku])

	await globals.pool.query("UPDATE products SET date_modified = NOW(), price = ? WHERE sku = ?", [toPrice, sku])

	await globals.pool.query("INSERT INTO product_pricing_log (user_id, user_type, sku, price_from, price_to, pricing_type_id_from, pricing_type_id_to) VALUES (?, ?, ?, ?, ?, ?, ?)", [userId, userType, sku, fromPrice, toPrice, pricingTypeId, pricingTypeId])
}


exports.updateProductCost = async (sku, cost) => {
	await globals.pool.query("UPDATE metro_sku_eligibility SET date_modified = NOW(), product_cost = ? WHERE sku = ?", [cost, sku])

	await globals.pool.query("UPDATE products SET date_modified = NOW(), cost = ? WHERE sku = ?", [cost, sku])
}



exports.getMaxShipCost = async(sku) => {
	var sql = `SELECT MAX(national_ship_cost) as ship_cost
								FROM metro_sku_eligibility
								WHERE sku = ? `;

	var rows = await globals.poolRO.query(sql, [sku]);
	colUtils.outboundNaming(rows);
								
	return rows;								
}
exports.getThrottledConfig = async () => {
	let rows = await globals.pool.query(`SELECT * FROM gde_throttle_config`);	

	colUtils.outboundNaming(rows);

	return rows;
}


exports.enqueueThrottled = async (configGroup, queue, priority, sku, metroId, msg) => {
	await globals.pool.query(`INSERT INTO gde_throttle_queue (config_group, mq, priority, sku, metro_id, msg) VALUES (?, ?, ?, ?, ?, ?)`, [configGroup, queue, priority, sku, metroId, JSON.stringify(msg)]);	
}


exports.getNextThrottled = async (configGroup, limit) => {
	let rows = await globals.pool.query(`SELECT * FROM gde_throttle_queue WHERE config_group = ? AND status = 'PENDING' ORDER BY priority DESC, date_created ASC LIMIT 0,?`, [configGroup, limit]);	

	colUtils.outboundNaming(rows);

	return rows;
}


exports.lastThrottledSent = async (configGroup) => {
	let last = await globals.pool.query(`SELECT TIMESTAMPDIFF(MINUTE, MAX(date_to_mq), NOW()) AS diff FROM gde_throttle_queue WHERE config_group = ? AND status = 'SENT'`, [configGroup]);	

	return last[0].diff;
}


exports.markThrottledSent = async (id) => {
	await globals.pool.query(`UPDATE gde_throttle_queue SET status = 'SENT', date_to_mq = NOW() WHERE id = ?`, [id]);	
}


exports.pruneSentThrottled = async (configGroup, hoursAgo) => {
	var result = await globals.pool.query(`DELETE FROM gde_throttle_queue WHERE status = 'SENT' AND config_group = '${configGroup}' AND date_to_mq < DATE_ADD(NOW(), INTERVAL -${hoursAgo} HOUR)`);

	return result;
}
