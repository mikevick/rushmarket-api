'use strict';

const globals = require('../globals');
const mysql = require('promise-mysql');

const colUtils = require('../utils/columnUtils');


exports.getPricingTypes = async () => {
	var types = await globals.poolRO.query("SELECT pricing_type_id, pricing_type FROM product_pricing_types");
	colUtils.outboundNaming(types);
	return types;
}


exports.getVignetteClustersByCity = async (cityId) => {
	var rows = await globals.poolRO.query("SELECT lap_cluster_id FROM lap_cluster_cities WHERE targeted_cities_id = ?", [cityId]);
	colUtils.outboundNaming(rows);
	var clusters = [];
	for (var i = 0; i < rows.length; i++) {
		clusters.push(rows[i].lapClusterId);
	}
	return clusters;
}

exports.getNewArrivalClustersByCity = async (cityId) => {
	var rows = await globals.poolRO.query("SELECT id as lap_cluster_id FROM lap_clusters WHERE TYPE = 'NEW_ARRIVAL' AND id IN (SELECT lap_cluster_id FROM lap_cluster_cities WHERE targeted_cities_id = ?)", [cityId]);

	//	Look for national row if not one for this specific city
	if (rows.length === 0) {
		rows = await globals.poolRO.query("SELECT id as lap_cluster_id FROM lap_clusters WHERE TYPE = 'NEW_ARRIVAL' AND id NOT IN (SELECT lap_cluster_id FROM lap_cluster_cities)");
	}
	colUtils.outboundNaming(rows);
	var clusters = [];
	for (var i = 0; i < rows.length; i++) {
		clusters.push(rows[i].lapClusterId);
	}
	return clusters;
}


exports.getSocialClustersByCity = async (cityId) => {
	var rows = await globals.poolRO.query("SELECT id as lap_cluster_id FROM lap_clusters WHERE TYPE = 'SOCIAL' AND id IN (SELECT lap_cluster_id FROM lap_cluster_cities WHERE targeted_cities_id = ?)", [cityId]);

	//	Look for national row if not one for this specific city
	if (rows.length === 0) {
		rows = await globals.poolRO.query("SELECT id as lap_cluster_id FROM lap_clusters WHERE TYPE = 'SOCIAL' AND id NOT IN (SELECT lap_cluster_id FROM lap_cluster_cities)");
	}
	colUtils.outboundNaming(rows);
	var clusters = [];
	for (var i = 0; i < rows.length; i++) {
		clusters.push(rows[i].lapClusterId);
	}
	return clusters;
}


exports.getClustersProductCount = async (clusterId) => {
	var rows = await globals.pool.query("SELECT lap_cluster_id FROM lap_cluster_cities WHERE targeted_cities_id = ?", [cityId]);
	colUtils.outboundNaming(rows);
	var clusters = [];
	for (var i = 0; i < rows.length; i++) {
		clusters.push(rows[i].lapClusterId);
	}
	return clusters;
}





exports.get = async (lapName, lapId, clusterId, sortBy, pruneClusters, bypassGDE, sku, includeArchived) => {
	var vals = [];
	var sql = `SELECT 
											l.id as lap_id,
											l.name AS lap_name,
											l.last_refresh, 
											l.next_refresh,
											lc.type as cluster_type, 
											lc.image_1 as cluster_image_1,
											lc.image_2 as cluster_image_2,
											lc.expiration_date as cluster_expiration_date,
											lc.date_created as cluster_date_created,
											lc.publish_date as cluster_date_published,
											lc.id as cluster_id,
											lc.cluster_name, 
											lc.position AS cluster_position`;

	if (!pruneClusters) {
		sql +=

			`, lcb.sku, 
											p.name, 
											CONCAT('/pages/', REPLACE(p.category_1, ' ', '-')) as category1, 
											CONCAT('/collections/', REPLACE(p.category_2, ' ', '-')) as category2,
											lcb.position AS bubble_position, 
											p.msrp, 
											p.market_price, 
											p.price, 
											p.pricing_type_id, 
											COALESCE(lcb.image, p.image) AS image, 
											p.online_quick_sale, 
											p.seller_product_id, 
											p.shopify_variant_id,
											p.status, 
											p.online_shopping,
											p.condition_name,
											p.freshness_score,
											c.front_end_name, 
											c.front_end_space,
											qs.color, 
											qs.material, 
											qs.size,
											qs.dimensions,
											qs.bullets, 
											vc.coin_id,
											m.manifest_source,
											COUNT(f.member_id) AS likes,
											m.vendor_id `;
	}

	sql +=
		` FROM laps l 
											LEFT JOIN lap_clusters lc ON lc.lap_id = l.id `;

	if (!pruneClusters) {
		sql +=
			` LEFT JOIN lap_cluster_bubbles lcb ON lcb.lap_cluster_id = lc.id 
											LEFT JOIN products p ON p.sku = lcb.sku 
											LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2 
											LEFT JOIN categories c ON c.category_id = cm.category_id 
											LEFT JOIN categories c2 ON c2.category_id = c.parent_id 								
											LEFT JOIN product_quick_sales qs ON qs.sku = p.sku 
											LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
											LEFT JOIN coins_to_vskus vc ON ((vc.vendor_id = m.vendor_id) AND (vc.vendor_sku = p.seller_product_id))
											LEFT JOIN member_finds f ON f.coin_id = vc.coin_id `;
	}

	if (includeArchived) {
		sql +=
			` WHERE lc.on_deck IN ('N', 'A')
			AND lc.position IS NOT NULL `;

	} else {
		sql +=
			` WHERE lc.on_deck = 'N' 
			AND lc.position IS NOT NULL `;

	}

	// if ((!bypassGDE) && (!pruneClusters)) {
	// 	sql +=
	// 											"AND p.online_shopping = 'Y' ";
	// }


	if (!pruneClusters) {
		sql +=
			` AND lcb.delete = 'N' `;
	}

	if (lapName !== undefined) {
		sql += ` AND l.name = ? `;
		vals.push(lapName);
	}
	if (lapId !== undefined) {
		sql += ` AND l.id = ? `;
		vals.push(lapId);
	}

	if (clusterId !== undefined) {
		sql += ` AND lc.id = ? `;
		vals.push(clusterId);
	}

	if (sku !== undefined) {
		sql += ` AND lc.id IN (SELECT lap_cluster_id FROM lap_cluster_bubbles WHERE sku = ?) `;
		vals.push(sku);
	}

	if (!pruneClusters) {
		sql += `GROUP BY lcb.id `;
	}
	sql += `${sortBy}`;

	if (!pruneClusters) {
		sql += `, lcb.position`;
	}

	// console.log(mysql.format(sql, vals));
	var merch = await globals.poolRO.query(sql, vals);
	colUtils.outboundNaming(merch);
	return merch;
}




exports.getLapsAndClusters = async (lapName, lapId, clusterId, sortBy, clusterOffset, clusterLimit, includeArchived, destCityId) => {
	var vals = [];
	var sql = `SELECT 
											targeted_cities_id,
											l.id as lap_id,
											l.name AS lap_name,
											l.last_refresh, 
											l.next_refresh,
											lc.type as cluster_type, 
											lc.image_1 as cluster_image_1,
											lc.image_2 as cluster_image_2,
											lc.expiration_date as cluster_expiration_date,
											lc.date_created as cluster_date_created,
											lc.publish_date as cluster_date_published,
											lc.id as cluster_id,
											lc.cluster_name, 
											lc.position AS cluster_position
									 FROM laps l 
											LEFT JOIN lap_clusters lc ON lc.lap_id = l.id 
											LEFT JOIN lap_cluster_cities lcc ON lcc.lap_cluster_id = lc.id
											`;


	if (includeArchived) {
		sql +=
			` WHERE lc.on_deck IN ('N', 'A')
			AND lc.position IS NOT NULL 
			AND ((targeted_cities_id = ${destCityId}) OR (targeted_cities_id IS NULL)) `;

	} else {
		sql +=
			` WHERE lc.on_deck = 'N' 
			AND lc.position IS NOT NULL 
			AND ((targeted_cities_id = ${destCityId}) OR (targeted_cities_id IS NULL)) `;

	}


	if (lapName !== undefined) {
		sql += ` AND l.name = ? `;
		vals.push(lapName);
	}
	if (lapId !== undefined) {
		sql += ` AND l.id = ? `;
		vals.push(lapId);
	}

	if (clusterId !== undefined) {
		sql += ` AND lc.id = ? `;
		vals.push(clusterId);
	}

	sql += `${sortBy}, targeted_cities_id DESC `;


	// sql += ` LIMIT ${clusterOffset}, ${clusterLimit}`

	// console.log(mysql.format(sql, vals));
	var merch = await globals.poolRO.query(sql, vals);
	colUtils.outboundNaming(merch);
	return merch;
}




exports.getProducts = async (clusterIds, sortBy, sku) => {
	var vals = [];

	var sql = `SELECT 
								lc.id as cluster_id,
								lc.position,
								lc.expiration_date as cluster_expiration_date,
								lc.date_created as cluster_date_created,
								lc.publish_date as cluster_date_published,
								lcb.id as product_id,
								lcb.sku, 
								p.name, 
								CONCAT('/pages/', REPLACE(p.category_1, ' ', '-')) as category1, 
								CONCAT('/collections/', REPLACE(p.category_2, ' ', '-')) as category2,
								lcb.position AS bubble_position, 
								p.msrp, 
								p.market_price, 
								p.price, 
								p.pricing_type_id, 
								COALESCE(lcb.image, p.image) AS image, 
								p.online_quick_sale, 
								p.seller_product_id, 
								p.shopify_variant_id,
								p.status, 
								p.online_shopping,
								p.condition_name,
								p.freshness_score,
								c.front_end_name, 
								c.front_end_space,
								qs.color, 
								qs.material, 
								qs.size,
								qs.dimensions,
								qs.bullets, 
								vc.coin_id,
								m.manifest_source,
								COUNT(f.member_id) AS likes,
								m.vendor_id 
					 FROM laps l 
					 	LEFT JOIN lap_clusters lc ON lc.lap_id = l.id
						LEFT JOIN lap_cluster_bubbles lcb ON lcb.lap_cluster_id = lc.id 
						LEFT JOIN products p ON p.sku = lcb.sku 
						LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2 
						LEFT JOIN categories c ON c.category_id = cm.category_id 
						LEFT JOIN categories c2 ON c2.category_id = c.parent_id 								
						LEFT JOIN product_quick_sales qs ON qs.sku = p.sku 
						LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
						LEFT JOIN coins_to_vskus vc ON ((vc.vendor_id = m.vendor_id) AND (vc.vendor_sku = p.seller_product_id))
						LEFT JOIN member_finds f ON f.coin_id = vc.coin_id 
					WHERE lcb.delete = 'N' 
						AND lc.id IN (${clusterIds}) `;

	if (sku !== undefined) {
		sql += ` AND lc.id IN (SELECT lap_cluster_id FROM lap_cluster_bubbles WHERE sku = ?) `;
		vals.push(sku);
	}

	sql += ` GROUP BY lcb.id `;

	sql += ` ${sortBy}, lcb.position`;

	// console.log(mysql.format(sql, vals));
	var products = await globals.poolRO.query(sql, vals);
	colUtils.outboundNaming(products);

	return products;
}