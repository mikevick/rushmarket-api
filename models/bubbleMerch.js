'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');


exports.getPricingTypes = async () => {
	var types = await globals.pool.query("SELECT pricing_type_id, pricing_type FROM product_pricing_types");
	colUtils.outboundNaming(types);
	return types;
}


exports.get = async (lapName, lapId) => {
	var vals = [];
	var sql = "SELECT " +
																						"l.name AS lap_name, " +
																						"l.store_id, " +
																						"l.last_refresh, " + 
																						"l.next_refresh, " +
																						"lc.type as cluster_type, " +
																						"lc.image_1 as cluster_image_1, " +
																						"lc.image_2 as cluster_image_2, " +
																						"lc.expiration_date as cluster_expiration_date, " +
																						"lc.cluster_name, " +
																						"lc.position AS cluster_position, " +
																						"lcb.sku, " +
																						"p.name, " +
																						"CONCAT('/pages/', REPLACE(p.category_1, ' ', '-')) as category1, " +
																						"CONCAT('/collections/', REPLACE(p.category_2, ' ', '-')) as category2, " +
																						"lcb.position AS bubble_position, " +
																						"p.msrp, " +
																						"p.market_price, " +
																						"p.price, " +
																						"p.pricing_type_id, " + 
//																						"pt.pricing_type, " +
																						"COALESCE(lcb.image, p.image) AS image, " +
																						"p.online_quick_sale, " +
																						"p.seller_product_id, " +
																						"p.status, " + 
																						"p.online_shopping, " +
																						"p.condition_name, " + 
																						"p.freshness_score, " +
																						"qs.color,  " +
																						"qs.material,  " +
																						"qs.size, " +
																						"qs.dimensions, " +
																						"qs.bullets, " +
																						"m.vendor_id " +
																				"FROM laps l " +
																						"LEFT JOIN stores s ON s.store_id = l.store_id " +
																						"LEFT JOIN lap_clusters lc ON lc.lap_id = l.id " +
																						"LEFT JOIN lap_cluster_bubbles lcb ON lcb.lap_cluster_id = lc.id " +
																						"LEFT JOIN products p ON p.sku = lcb.sku " +
																						"LEFT JOIN product_quick_sales qs ON qs.sku = p.sku " +
																						"LEFT JOIN manifests m ON m.manifest_id = p.manifest_id " +
//																						"LEFT JOIN product_pricing_types pt ON pt.pricing_type_id = p.pricing_type_id "
																				"WHERE lc.on_deck = 'N' " +
																						"AND lc.position IS NOT NULL " +
																						"AND lcb.delete = 'N' ";
	if (lapName !== undefined) {
		sql += "AND l.name = ? ";
		vals.push(lapName);
	}																						
	if (lapId !== undefined) {
		sql += "AND l.id = ? ";
		vals.push(lapId);
	}																						
	
	sql += "ORDER BY l.store_id, l.name, lc.position, lcb.position";

	// console.log(mysql.format(sql, vals));
	var merch = await globals.pool.query(sql, vals);
	colUtils.outboundNaming(merch);
	return merch;
}




exports.getByStoreId = async (id, lapName, lapId, sortBy, pruneClusters) => {
	var vals = [id];
	var sql = "SELECT " +
																						"l.name AS lap_name, " +
																						"l.store_id, " +
																						"l.last_refresh, " + 
																						"l.next_refresh, " +
																						"lc.type as cluster_type, " +
																						"lc.image_1 as cluster_image_1, " +
																						"lc.image_2 as cluster_image_2, " +
																						"lc.expiration_date as cluster_expiration_date, " +
																						"lc.cluster_name, " +
																						"lc.position AS cluster_position, " +
																						"s.store_name, " +
																						"s.shopify_store_id ";
if (!pruneClusters) {
	sql += 																						
																						", lcb.sku, " +
																						"p.name, " +
																						"CONCAT('/pages/', REPLACE(p.category_1, ' ', '-')) as category1, " +
																						"CONCAT('/collections/', REPLACE(p.category_2, ' ', '-')) as category2, " +
																						"lcb.position AS bubble_position, " +
																						"p.msrp, " +
																						"p.market_price, " +
																						"p.price, " +
																						"p.pricing_type_id, " + 
//																						"pt.pricing_type, " +
																						"COALESCE(lcb.image, p.image) AS image, " +
																						"p.online_quick_sale, " +
																						"p.seller_product_id, " +
																						"p.status, " + 
																						"p.online_shopping, " +
																						"p.condition_name, " + 
																						"p.freshness_score, " +
																						"qs.color,  " +
																						"qs.material,  " +
																						"qs.size, " +
																						"qs.dimensions, " +
																						"qs.bullets, " +
																						"m.vendor_id ";
}

	sql += 
																				"FROM laps l " +
																						"LEFT JOIN stores s ON s.store_id = l.store_id " +
																						"LEFT JOIN lap_clusters lc ON lc.lap_id = l.id ";
	if (!pruneClusters) {
		sql += 
																						"LEFT JOIN lap_cluster_bubbles lcb ON lcb.lap_cluster_id = lc.id " +
																						"LEFT JOIN products p ON p.sku = lcb.sku " +
																						"LEFT JOIN product_quick_sales qs ON qs.sku = p.sku " +
																						"LEFT JOIN manifests m ON m.manifest_id = p.manifest_id ";
	}																						

	sql +=
																				"WHERE " +
																				"s.store_id = ? " +
																				"AND lc.on_deck = 'N' " +
																				"AND lc.position IS NOT NULL ";
	if (!pruneClusters)	{
		sql += 
																						"AND lcb.delete = 'N' ";
	}

	if (lapName !== undefined) {
		sql += "AND l.name = ? ";
		vals.push(lapName);
	}																						
	if (lapId !== undefined) {
		sql += "AND l.id = ? ";
		vals.push(lapId);
	}																						
	
	sql += sortBy;

	// console.log(mysql.format(sql, vals));
	var merch = await globals.pool.query(sql, vals);
	colUtils.outboundNaming(merch);
	return merch;
}


