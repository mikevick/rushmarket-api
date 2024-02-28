'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');




exports.getDistinctDestCities = async ()=> {
	var rows = await globals.poolRO.query(`SELECT DISTINCT(dest_city_id), LOWER(REPLACE(REPLACE(t.city, ' ', '_'), '.', '')) AS city
																						FROM coreleap.metro_vsku_eligibility e
																							LEFT JOIN coreleap.targeted_cities t ON e.dest_city_id = t.id
																						ORDER BY dest_city_id`);
	return rows;
}


exports.getExportDataByVendorSku = async (vendorId, vendorSku) => {
	var rows = await globals.poolRO.query(`SELECT LOWER(REPLACE(REPLACE(t.city, ' ', '_'), '.', '')), national_ship_cost AS ship_cost, min_suggested_selling_price AS min_selling_price
																									FROM coreleap.metro_vsku_eligibility e
																										LEFT JOIN coreleap.targeted_cities t ON e.dest_city_id = t.id
																									WHERE vendor_id = ? AND vendor_sku = ? 
																									ORDER BY dest_city_id `, [vendorId, vendorSku]);

	return rows;
}


exports.getVCGDEData = async (vendorId, vendorSku, cityId) => {
	var sql = `SELECT mse.vendor_id, mse.vendor_sku, mse.ship_type, mse.box_count, 
								mse.origin_postal_code AS original_postal_code, mse.dest_postal_code AS dest_postal_code, dm.name AS destination_market, 
								mse.min_suggested_selling_price, mse.threshold_shipping, mse.large_item_fee, 
								mse.product_cost, mse.drop_ship_fee, mse.ship_calc_status, 
								mse.national_ship_cost, mse.national_margin_pct, dm.margin_eligibility_threshold, 
								mse.dest_city_id, mse.eligibility
						FROM metro_vsku_eligibility mse 
							LEFT JOIN metros dm ON dm.id = mse.dest_metro_id
						WHERE mse.vendor_id = ? AND mse.vendor_sku = ?
						ORDER BY destination_market`;
	// console.log(mysql.format(sql, values));
	var rows = await globals.poolRO.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getMaxShipCost = async(vendorId, vendorSku) => {
	var sql = `SELECT MAX(national_ship_cost) as ship_cost
								FROM metro_vsku_eligibility
								WHERE vendor_id = ?
									AND vendor_sku = ? `;

	// console.log(mysql.format(sql, [vendorId, vendorSku]));
	var rows = await globals.poolRO.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rows);
								
	return rows;								
}