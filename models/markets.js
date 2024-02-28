'use strict'

const globals = require('../globals')

const colUtils = require('../utils/columnUtils')





exports.clearSkuAlgoStates = async (storeId) => {
	var result = await globals.pool.query(`DELETE FROM gde_sku_algo_state WHERE sku IN (SELECT sku FROM products WHERE store_id = ?)`, [storeId]);

	return result;
}



exports.createAlgoStateCategoryOverride = async (marketId, algoId, categoryId, state, daysInStateOverride) => {
	var result = await globals.pool.query(`INSERT INTO gde_algo_state_category_overrides (algo_id, state, market_id, category_id, days_in_state) VALUES (?, ?, ?, ?, ?)`, [algoId, state, marketId, categoryId, daysInStateOverride]);

	return result;
}


exports.createAlgoStateLocationOverride = async (storeId, algoId, storageArea, state, daysInState) => {
	var result = await globals.pool.query(`INSERT INTO gde_algo_state_location_overrides (algo_id, state, store_id, storage_area, days_in_state) VALUES (?, ?, ?, ?, ?)`, [algoId, state, storeId, storageArea, daysInState]);

	return result;
}


exports.getAlgoState = async (algoId, state) => {
	var rows = await globals.pool.query(`SELECT * FROM gde_algo_states WHERE algo_id = ? and state = ?`, [algoId, state]);

	colUtils.outboundNaming(rows)

	return rows;
}


exports.getAlgoStateOverridesById = async (marketId, algoId) => {
	var rows = await globals.pool.query(`SELECT s.state, default_days_in_state, o.id as override_id, o.days_in_state AS days_in_state_override, 
																					COALESCE(o.days_in_state, default_days_in_state) AS days_in_state
																				FROM gde_algo_states s
																						LEFT JOIN gde_algo_state_market_overrides o ON ((s.algo_id = o.algo_id) AND (s.state = o.state) AND (o.market_id = ?))
																				WHERE s.algo_id = ?
																				ORDER BY s.order`, [marketId, algoId]);
	colUtils.outboundNaming(rows)

	var prom = [];
	for (var i = 0; i < rows.length; i++) {
		prom.push(globals.pool.query(`SELECT o.id, c.category_id, c.name, days_in_state AS category_override
																		FROM categories c 
																			LEFT JOIN gde_algo_state_category_overrides o ON (o.category_id = c.category_id)
																		WHERE o.algo_id = ?
																			AND o.market_id = ?
																			AND o.state = ?`, [algoId, marketId, rows[i].state]));
	}

	var results = await Promise.all(prom);

	for (var i = 0; i < rows.length; i++) {
		rows[i].categoryOverrides = [];
		for (var j = 0; j < results[i].length; j++) {
			rows[i].categoryOverrides.push({
				categoryOverrideId: results[i][j].id,
				categoryId: results[i][j].category_id,
				categoryName: results[i][j].name,
				categoryOverride: results[i][j].category_override
			})
		}
	}

	var skuCount = await globals.pool.query(`SELECT COUNT(*) AS num 
																							FROM gde_sku_algo_state k
																									LEFT JOIN products p ON p.sku = k.sku
																									LEFT JOIN stores s ON s.store_id = p.store_id
																									LEFT JOIN gde_markets m ON m.store_id = p.store_id
																							WHERE m.id = ?`, [marketId])

	return {
		skuCount: skuCount[0].num,
		states: rows
	};
}




exports.getAlgoStateCategoryOverridesByState = async (marketId, algoId, categoryId, state) => {
	var rows = await globals.pool.query(`SELECT * FROM gde_algo_state_category_overrides 
																					WHERE algo_id = ?
																							AND market_id = ?
																							AND category_id = ?
																							AND state = ?`, [algoId, marketId, categoryId, state]);
	colUtils.outboundNaming(rows)

	return rows;
}



exports.getAlgoStateLocationOverridesByState = async (algoId, storeId, storageArea, state) => {
	var rows = await globals.pool.query(`SELECT * FROM gde_algo_state_location_overrides 
																					WHERE algo_id = ?
																							AND store_id = ?
																							AND storage_area = ?
																							AND state = ?`, [algoId, storeId, storageArea, state]);
	colUtils.outboundNaming(rows)

	return rows;
}


//	TODO Move into ripple algorithm library
exports.getEligibility = async (sku) => {
	var sql = `SELECT dest_city_id, COALESCE(eligibility_override, eligibility) AS eligibility
									FROM metro_sku_eligibility
									WHERE sku = ?`;

	// console.log(mysql.format(sql, [marketId, categoryId, marketId, algoId, state]))									
	var rows = await globals.pool.query(sql, [sku]);
	colUtils.outboundNaming(rows)

	return rows;
}




exports.getMarketAlgoSkus = async (marketId, sortBy) => {
	var sql = `SELECT a.sku, p.name, p.category_2 AS category, a.state
								FROM gde_sku_algo_state a
									LEFT JOIN products p ON a.sku = p.sku
									LEFT JOIN gde_markets m ON p.store_id = m.store_id
								WHERE m.id = ?
									AND a.algo_id = m.ripple_algo_id`;

	var rows = await globals.pool.query(sql, [marketId]);

	colUtils.outboundNaming(rows)

	return rows;
}



exports.getAll = async () => {
	var rows = await globals.pool.query(`SELECT s.member_display_name, s.type as store_type, a.name as ripple_algo_name, m.* 
																			FROM gde_markets m
																				LEFT JOIN stores s ON s.store_id = m.store_id
																				LEFT JOIN gde_algos a ON m.ripple_algo_id = a.id`);
	colUtils.outboundNaming(rows)

	return rows;
}





exports.getById = async (id) => {
	var rows = await globals.pool.query(`SELECT s.member_display_name, s.type as store_type, s.online_available, s.curbside_available, 
																				a.name as ripple_algo_name, a.code_module, m.* 
																			FROM gde_markets m
																				LEFT JOIN stores s ON s.store_id = m.store_id
																				LEFT JOIN gde_algos a ON m.ripple_algo_id = a.id
																			WHERE m.id = ?`, [id]);
	colUtils.outboundNaming(rows)

	return rows;
}



exports.getByStoreId = async (id) => {
	var rows = await globals.pool.query(`SELECT s.member_display_name, s.type as store_type, s.online_available, s.curbside_available, 
																				a.name as ripple_algo_name, a.code_module, m.* 
																			FROM gde_markets m
																				LEFT JOIN stores s ON s.store_id = m.store_id
																				LEFT JOIN gde_algos a ON m.ripple_algo_id = a.id
																			WHERE m.store_id = ?`, [id]);
	colUtils.outboundNaming(rows)

	return rows;
}



exports.getMarketRippleCategoryOverrides = async (id, whereInfo, sortBy) => {
	var sql = `SELECT o.*, c.name
								FROM gde_algo_state_category_overrides o
										LEFT JOIN categories c ON c.category_id = o.category_id
								${whereInfo.clause}
								ORDER BY ${sortBy}`;

	var rows = await globals.pool.query(sql, whereInfo.values);
	colUtils.outboundNaming(rows)

	return rows;

}



exports.getMarketRippleLocationOverrides = async (id, whereInfo, sortBy) => {
	var sql = `SELECT o.*, a.storage_area_name
								FROM gde_algo_state_location_overrides o
									LEFT JOIN gde_markets m ON m.store_id = o.store_id
									LEFT JOIN storage_areas l ON ((l.store_id = o.store_id) AND (l.storage_area = o.storage_area))
									LEFT JOIN storage_areas a ON ((a.store_id = o.store_id) AND (a.storage_area = o.storage_area))
								${whereInfo.clause} 
								ORDER BY ${sortBy}`;

	// console.log(mysql.format(sql, whereInfo.values))																					;
	var rows = await globals.pool.query(sql, whereInfo.values);
	colUtils.outboundNaming(rows)

	return rows;

}



exports.getRippleSettings = async (id) => {
	var rows = await globals.pool.query(`SELECT r.id, r.date_created, r.state, r.active_flag
																					FROM gde_markets m
																						LEFT JOIN gde_algo_states_market_settings r ON ((m.id = r.market_id) AND (m.ripple_algo_id = r.algo_id)) 
																						LEFT JOIN gde_algo_states s ON ((s.algo_id = r.algo_id) AND (s.state = r.state))
																					WHERE m.id = ?
																					ORDER BY s.order ASC`, [id]);
	colUtils.outboundNaming(rows)

	return rows;
}



exports.updateRippleSettingsById = async (id, activeFlag) => {
	var result = await globals.pool.query(`UPDATE gde_algo_states_market_settings SET active_flag = ? WHERE id = ?`, [activeFlag, id]);

	return result;
}




exports.getUnsuppressedMarketSkus = async (storeId) => {
	var rows = await globals.pool.query(`SELECT COUNT(DISTINCT(e.sku)) AS num 
																					FROM metro_sku_eligibility e
																						LEFT JOIN products p ON p.sku = e.sku
																					WHERE store_id = ?
																						AND STATUS = 'Live' 
																						AND online_shopping = 'Y'
																						AND ((eligibility_override IS NULL) OR (eligibility_override != 'NOT_ELIGIBLE'))`, [storeId]);
	return rows[0].num;
}


exports.getSuppressedMarketSkus = async (storeId) => {
	var rows = await globals.pool.query(`SELECT distinct(e.sku) as sku,  p.store_id, sl.storage_area, e.category_id 
																					FROM metro_sku_eligibility e
																						LEFT JOIN products p ON p.sku = e.sku
																					 	LEFT JOIN storage_locations sl ON p.location_number = sl.location_number
																					WHERE p.store_id = ?
																						AND STATUS = 'Live' 
																						AND online_shopping = 'Y'
																						AND eligibility_override = 'NOT_ELIGIBLE'`, [storeId]);
	colUtils.outboundNaming(rows);

	return rows;
}


//
//	DEPRECATED
//
// exports.getExpiredBOPISOnly = async () => {
// 	var rows = await globals.pool.query(`SELECT s.city_id, a.code_module, m.*
// 																					FROM gde_markets m
// 																						LEFT JOIN gde_algos a ON a.id = m.ripple_algo_id
// 																						LEFT JOIN stores s ON s.store_id = m.store_id
// 																					WHERE eligibility_phase = 'BOPIS_ONLY' 
// 																						AND bopis_only_end < now()`);
// 	colUtils.outboundNaming(rows)

// 	return rows;
// }



//
//	DEPRECATED
//
// exports.getExpiredMarketExclusive = async () => {
// 	var rows = await globals.pool.query(`SELECT s.city_id, a.code_module, m.* 
// 																					FROM gde_markets m
// 																						LEFT JOIN gde_algos a ON a.id = m.ripple_algo_id
// 																						LEFT JOIN stores s ON s.store_id = m.store_id
// 																					WHERE eligibility_phase = 'MARKET_EXCLUSIVE' 
// 																						AND market_exclusive_end < NOW()`);
// 	colUtils.outboundNaming(rows)

// 	return rows;
// }



exports.getPhaseInfo = async (marketId) => {
	var rows = await globals.pool.query(`SELECT s.city_id, a.code_module, eligibility_phase, market_exclusive_flag, market_exclusive_end, bopis_only_flag, bopis_only_end, m.store_id, ripple_algo_id 
																					FROM gde_markets m
																						LEFT JOIN gde_algos a ON a.id = m.ripple_algo_id
																						LEFT JOIN stores s ON s.store_id = m.store_id
																					WHERE m.id = ?`, [marketId]);
	colUtils.outboundNaming(rows)

	if (rows.length === 1) {
		return rows[0];
	} else {
		return rows;
	}
}


exports.getReadyToOpen = async () => {
	var rows = await globals.pool.query(`SELECT s.city_id, s.type, a.code_module, m.* 
																					FROM gde_markets m
																						LEFT JOIN gde_algos a ON a.id = m.ripple_algo_id
																						LEFT JOIN stores s ON s.store_id = m.store_id
																					WHERE status = 'PREOPEN' AND market_open < now()`);
	colUtils.outboundNaming(rows)

	return rows;
}


exports.getSkusInCoin = async (vendorSku) => {
	var resp = {
		skusInCoin: 0,
		shippableInCoin: 0,
		skuList: ""
	}
	var list = "";

	// console.log(mysql.format("SELECT vendor_sku FROM coins_to_vendor_skus WHERE coin_id IN (SELECT coin_id FROM coins_to_vendor_skus WHERE vendor_sku = ?)", [vendorSku]))
	var rows = await globals.productPool.query("SELECT vendor_sku FROM coins_to_vendor_skus WHERE coin_id IN (SELECT coin_id FROM coins_to_vendor_skus WHERE vendor_sku = ?)", [vendorSku]);

	for (var i = 0; i < rows.length; i++) {
		if (list.length > 0) {
			list += ", ";
		}
		list += "'" + rows[i].vendor_sku + "'";
	}

	if (list.length > 0) {
		// console.log(mysql.format("SELECT sku, seller_product_id FROM products WHERE status = 'Live' and online_shopping = 'Y' and online_quick_sale = 'N' and seller_product_id in (" + list + ")"));
		rows = await globals.pool.query("SELECT sku, seller_product_id FROM products WHERE status = 'Live' and online_shopping = 'Y' and online_quick_sale = 'N' and seller_product_id in (" + list + ")");

		resp.skusInCoin = rows.length;

		list = "";
		for (var i = 0; i < rows.length; i++) {
			if (list.length > 0) {
				list += ", ";
			}
			list += rows[i].sku;
		}

		if (list.length > 0) {
			// console.log(mysql.format("SELECT COUNT(*) AS num FROM metro_sku_eligibility_summary WHERE pct_ship_eligible = 100 AND sku IN (" + list + ")"));
			rows = await globals.pool.query("SELECT COUNT(*) AS num FROM metro_sku_eligibility_summary WHERE pct_ship_eligible = 100 AND sku IN (" + list + ")");
			resp.skuList = list;
		}
		if (rows[0] !== undefined) {
			resp.shippableInCoin = rows[0].num;
		}
	}

	return resp;
}


exports.getMarketSkus = async (storeId) => {
	var sql = `SELECT p.sku, e.category_id
								FROM metro_sku_eligibility e
									LEFT JOIN products p ON p.sku = e.sku
								WHERE p.status = 'Live' 
									AND p.online_shopping = 'Y' 
									AND p.store_id = ?
								GROUP BY p.sku`;

	var skus = await globals.pool.query(sql, [storeId]);
	colUtils.outboundNaming(skus);
	return skus;
}



exports.getVendorSku = async (sku) => {
	var sql = `SELECT seller_product_id 
								FROM products
								WHERE sku = ?`;

	var rows = await globals.pool.query(sql, [sku]);
	colUtils.outboundNaming(rows)

	return rows;
}



exports.getEligibilityDataBySku = async (sku) => {
	var sql = `SELECT * 
					FROM metro_sku_eligibility
					WHERE sku = ?`;

	var rows = await globals.pool.query(sql, [sku]);
	colUtils.outboundNaming(rows)

	return rows;
}




exports.nationwideSkuAlgoStates = async (marketId, storeId, rippleAlgoId) => {
	var result = await globals.pool.query(`DELETE FROM gde_sku_algo_state WHERE sku IN (SELECT sku FROM products WHERE store_id = ?)`, [storeId]);

	var rows = await globals.pool.query(`SELECT DISTINCT(e.sku) 
																						FROM metro_sku_eligibility e
																							LEFT JOIN products p ON p.sku = e.sku
																						WHERE p.status = 'Live'
																							AND p.online_shopping = 'Y'
																							AND p.store_id = ?`, [storeId]);

	for (var i = 0; i < rows.length; i++) {
		await globals.pool.query(`INSERT INTO gde_sku_algo_state (sku, algo_id, state, state_expire) VALUES (?, ?, 'NATIONWIDE', NULL)`, [rows[i].sku, rippleAlgoId]);
	}

	return result;
}



exports.overrideEligibilityBySku = async (sku, overrideEligibility, destCities) => {
	var sql = `UPDATE metro_sku_eligibility 
								SET date_modified = NOW(), eligibility_override = ?
								WHERE sku = ?`;

	if ((destCities !== undefined) && (destCities.length > 0)) {
		sql += ` AND dest_city_id IN (`;
		for (var j = 0; j < destCities.length; j++) {
			sql += destCities[j];
			if (j !== (destCities.length - 1)) {
				sql += ', ';
			}
		}
		sql += `)`;
	}

	// console.log(mysql.format(sql, [overrideEligibility, sku.sku]))
	var result = await globals.pool.query(sql, [overrideEligibility, sku]);

	return result;
}



exports.overrideEligibilityByShipCost = async (sku, overrideEligibility, nationalShipCost) => {
	var sql = `UPDATE metro_sku_eligibility 
						SET date_modified = NOW(), eligibility_override = ?
						WHERE sku = ?
							AND national_ship_cost <= ?`;

	// console.log(mysql.format(sql, [overrideEligibility, sku, nationalShipCost]));
	var result = await globals.pool.query(sql, [overrideEligibility, sku, nationalShipCost]);

	return result;
}


//
// DEPRECATED
//
// exports.updateMarketPhase = async (id, eligibilityPhase) => {
// 	var result = await globals.pool.query(`UPDATE gde_markets SET eligibility_phase = ? WHERE id = ?`, [eligibilityPhase, id]);
// 	return result;
// }



exports.updateMarketStatus = async (id, status) => {
	var result = await globals.pool.query(`UPDATE gde_markets SET status = ? WHERE id = ?`, [status, id]);
	return result;
}



exports.getMarketInRipplesBySku = (sku) => {
	return new Promise((resolve, reject) => {
		globals.pool.query(`SELECT a.id AS algo_id, code_module, s.store_id 
													FROM gde_markets m 
														LEFT JOIN gde_algos a ON m.ripple_algo_id = a.id 
														LEFT JOIN stores s ON m.store_id = s.store_id
														LEFT JOIN products p ON p.store_id = s.store_id
													WHERE m.status = 'ACTIVE'
														AND s.type = 'PHYSICAL'
														AND p.sku = ?
													GROUP BY code_module`, [sku])
			.then((rows) => {
				colUtils.outboundNaming(rows)
				resolve(rows)
			})
			.catch((e) => {
				reject(e)
			})
	})
}



exports.getMarketsInRipples = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query(`SELECT a.id as algo_id, code_module 
													FROM gde_markets m 
														LEFT JOIN gde_algos a ON m.ripple_algo_id = a.id 
														LEFT JOIN stores s ON m.store_id = s.store_id
													WHERE m.status = 'ACTIVE'
														AND s.type = 'PHYSICAL'
													GROUP BY code_module`)
			.then((rows) => {
				colUtils.outboundNaming(rows)
				resolve(rows)
			})
			.catch((e) => {
				reject(e)
			})
	})
}


exports.updateById = async (id, marketOpen, marketType) => {
	var results = null;
	var sets = "";
	var values = [];


	if (marketOpen !== undefined) {
		sets += "market_open = ?";
		values.push(marketOpen);
	}

	if (marketType !== undefined) {
		if (sets.length > 0) {
			sets += ", ";
		}
		sets += "market_type = ?";
		values.push(marketType);
	}


	if (sets.length > 0) {
		values.push(id);
		results = await globals.pool.query("UPDATE gde_markets SET " + sets + " WHERE id = ?", values);
	}

	return results;
}


exports.deleteAlgoStateOverride = async (overrideId) => {
	var result = await globals.pool.query(`DELETE FROM gde_algo_state_market_overrides WHERE id = ?`, [overrideId]);

	return result;
}


exports.updateAlgoStateOverride = async (overrideId, daysInStateOverride) => {
	var result = await globals.pool.query(`UPDATE gde_algo_state_market_overrides SET days_in_state = ? WHERE id = ?`, [daysInStateOverride, overrideId]);

	return result;
}


exports.deleteAlgoStateCategoryOverride = async (overrideId) => {
	var result = await globals.pool.query(`DELETE FROM gde_algo_state_category_overrides WHERE id = ?`, [overrideId]);

	return result;
}




exports.updateAlgoStateCategoryOverride = async (overrideId, daysInStateOverride) => {
	var result = await globals.pool.query(`UPDATE gde_algo_state_category_overrides SET days_in_state = ? WHERE id = ?`, [daysInStateOverride, overrideId]);

	return result;
}


exports.deleteAlgoStateLocationOverride = async (overrideId) => {
	var result = await globals.pool.query(`DELETE FROM gde_algo_state_location_overrides WHERE id = ?`, [overrideId]);

	return result;
}




exports.updateAlgoStateLocationOverride = async (overrideId, daysInStateOverride) => {
	var result = await globals.pool.query(`UPDATE gde_algo_state_location_overrides SET days_in_state = ? WHERE id = ?`, [daysInStateOverride, overrideId]);

	return result;
}



exports.storeSummary = (sku, shippableCount, totalMetros, shippablePct) => {
	return new Promise((resolve, reject) => {
		if (isNaN(shippablePct)) {
			shippablePct = 0;
		}
		var values = [sku, shippableCount, totalMetros, shippablePct, shippableCount, totalMetros, shippablePct];
		var sql = "INSERT INTO metro_sku_eligibility_summary (sku, ship_eligible, total_metros, pct_ship_eligible) " +
			"VALUES (?, ?, ?, ?) " +
			"ON DUPLICATE KEY UPDATE date_modified = now(), ship_eligible = ?, total_metros = ?, pct_ship_eligible = ?";

		globals.pool.query(sql, values)
			.then((result) => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.storeCoinByCity = async (dbInfo, skuArray, skusInCoin, byCity) => {
	var sql = `INSERT INTO metro_sku_eligibility_summary_by_city (sku, city_id, coin_skus, coin_skus_ship_eligible, coin_pct_ship_eligible) 
								VALUES (?, ?, ?, ?, ?) 
								ON DUPLICATE KEY UPDATE date_modified = now(), coin_skus = ?, coin_skus_ship_eligible = ?, coin_pct_ship_eligible = ?  `;

	for (var i=0; i < skuArray.length; i++) {
		for (var j=0; j < byCity.length; j++) {
			// console.log(mysql.format(sql, [skuArray[i], byCity[j].cityId, skusInCoin, byCity[j].shippableInCoin, Math.round((byCity[j].shippableInCoin / skuArray.length) * 100.0), skusInCoin, byCity[j].shippableInCoin, Math.round((byCity[j].shippableInCoin / skuArray.length) * 100.0), skuArray[i], byCity[j].cityId]));
			await dbInfo.dbPool.query(sql, [skuArray[i], byCity[j].cityId, skusInCoin, byCity[j].shippableInCoin, Math.round((byCity[j].shippableInCoin / skuArray.length) * 100.0), skusInCoin, byCity[j].shippableInCoin, Math.round((byCity[j].shippableInCoin / skuArray.length) * 100.0), skuArray[i], byCity[j].cityId]);
		}
	}
}



exports.storeCoinSummary = (skuList, skusInCoin, shippableInCoin, shippablePct) => {
	return new Promise((resolve, reject) => {
		var values = [skusInCoin, shippableInCoin, shippablePct];
		var sql = "UPDATE metro_sku_eligibility_summary SET coin_skus = ?, coin_skus_ship_eligible = ?, coin_pct_ship_eligible = ? WHERE sku in (" + skuList + ")";

		// console.log(mysql.format(sql, values));
		globals.pool.query(sql, values)
			.then((result) => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	});
}


