'use strict'

const globals = require('../globals')

const colUtils = require('../utils/columnUtils')




exports.getByNameAndState = async (name, state) => {
	var sql = `SELECT * 
							FROM gde_algos a
								LEFT JOIN gde_algo_states s ON a.id = s.algo_id
	 						WHERE name = ? `;

	if (state !== undefined) {
		sql += ` AND s.state = ? `; 
	}							 
	else {
		sql += ` AND s.order = 1`;
	}

  var rows = await globals.pool.query(sql, [name, state]);
  colUtils.outboundNaming(rows)

  return rows;
}


exports.getDaysInState = async (algoId, state, marketId, storeId, storageArea, categoryId) => {
	var sql = `SELECT s.state, c.category_id, s.default_days_in_state AS def, l.days_in_state AS loc, c.days_in_state AS cat,
								 COALESCE(c.days_in_state, l.days_in_state, s.default_days_in_state) AS days_in_state
								FROM gde_algo_states s 
									LEFT JOIN gde_algo_state_location_overrides l ON ((s.algo_id = l.algo_id) AND (s.state = l.state) AND (l.store_id = ?) AND (l.storage_area = ?))
									LEFT JOIN gde_algo_state_category_overrides c ON ((s.algo_id = c.algo_id) AND (s.state = c.state) AND (category_id = ?) AND (c.market_id = ?))
								WHERE s.algo_id = ?
									AND s.state = ?`;
								
	// console.log(mysql.format(sql, [storeId, storageArea, categoryId, marketId, algoId, state]))									
	var rows = await globals.pool.query(sql, [storeId, storageArea, categoryId, marketId, algoId, state]);
	colUtils.outboundNaming(rows)
								
	return rows;
}								


exports.getExpiredRipples = async () => {
	var sql = `SELECT sas.sku, a.name, a.code_module, sas.state AS current_state, gas.next_state, m.id AS market_id, l.storage_area, e.category_id, p.store_id, p.condition_name
								FROM gde_sku_algo_state sas
									LEFT JOIN products p ON p.sku = sas.sku
									LEFT JOIN storage_locations l ON ((p.store_id = l.store_id) AND (p.location_number = l.location_number))
									LEFT JOIN metro_sku_eligibility e ON ((p.sku = e.sku) AND (e.origin_city_id = e.dest_city_id))
									LEFT JOIN gde_markets m ON m.store_id = p.store_id
									LEFT JOIN gde_algos a ON a.id = sas.algo_id
									LEFT JOIN gde_algo_states gas ON ((sas.algo_id = gas.algo_id) AND (sas.state = gas.state))
								WHERE sas.state_expire < NOW()`;

	var rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getMarketRipples = async () => {
	var sql = `SELECT sas.sku, a.name, a.code_module, sas.state AS current_state, gas.next_state, m.id AS market_id
								FROM gde_sku_algo_state sas
									LEFT JOIN products p ON p.sku = sas.sku
									LEFT JOIN gde_markets m ON m.store_id = p.store_id
									LEFT JOIN gde_algos a ON a.id = sas.algo_id
									LEFT JOIN gde_algo_states gas ON ((sas.algo_id = gas.algo_id) AND (sas.state = gas.state))
								WHERE sas.state_expire < NOW()`;

	var rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.dsCheck = async (sku) => {
	var rows = await globals.pool.query(`SELECT manifest_source
																					FROM products p
																						LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
																					WHERE p.sku = ?`, [sku]);

	colUtils.outboundNaming(rows);

	//	Find the first active state
	if (rows.length === 1)  {
		if ((rows[0].manifestSource === 'STS') || (rows[0].manifestSource === 'DS')) {
			return true;
		}
		else {
			return false;
		}
	}

	return false;
}





exports.getNextActiveState = async (marketId, currState) => {
	var rows = await globals.pool.query(`SELECT s.state, skippable_flag, ms.state AS market_state, active_flag
																					FROM gde_algo_states s
																						LEFT JOIN gde_markets m ON m.ripple_algo_id = s.algo_id
																						LEFT JOIN gde_algo_states_market_settings ms ON ((s.algo_id = ms.algo_id) AND (m.id = ms.market_id) AND (s.state = ms.state))
																					WHERE m.id = ?
																						AND ((active_flag = 1) OR (skippable_flag = 0))
																					ORDER BY s.order`, [marketId]);

	colUtils.outboundNaming(rows);

	//	Find the first active state
	if (currState === null) {
		return rows[0].state;
	}
	else {
		for (var i=0; i < rows.length; i++) {
			if (rows[i].state === currState) {
				if ((i + 1) < rows.length) {
					return rows[(i + 1)].state;
				}
				else {
					return null;
				}
			}
		}
	}
}




exports.getShippingRipples = async (sku) => {
	var sql = `SELECT p.store_id, e.origin_city_id as city_id, e.category_id, national_ship_cost, COUNT(*) AS num
							FROM metro_sku_eligibility e
								LEFT JOIN products p ON p.sku = e.sku
							WHERE e.sku = ?
								AND dest_city_id != origin_city_id
							GROUP BY national_ship_cost`;

	var rows = await globals.pool.query(sql, [sku]);
	colUtils.outboundNaming(rows);

	return rows;
}




exports.updateSkuState = async (sku, algoId, state, stateExpire) => {
	var sql = `INSERT INTO gde_sku_algo_state (sku, algo_id, state, state_expire)
									VALUES (?, ?, ?, ?) 
									ON DUPLICATE KEY 
									UPDATE date_modified = now(), state = ?, state_expire = ?`;
	
	var result = await globals.pool.query(sql, [sku, algoId, state, stateExpire, state, stateExpire]);
																
	return result;								
}