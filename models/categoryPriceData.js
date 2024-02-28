'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');



exports.get = async (sku) => {
	var sql = "SELECT p.sku, p.msrp, p.market_price, p.price, cm.category_id, " +
								"c2.name AS category_1, c.name AS category_2, cp.id AS category_price_id, " +
								"cp.price_level, cp.category_price_group_id, cpg.group, cpg.tier_1, cpg.tier_2, " +
								"cpg.tier_3, cpg.tier_4, cpg.tier_5, cpg.tier_6, " +
								"CONCAT('tier', cpl.tier) AS tier, " +
								"COALESCE(MAX(cpda.percent_off_msrp),0) AS percent_off_msrp, " +
								"COALESCE(cpda.adjustment,0) as discount_adjustment " +
							"FROM products p " +
									"LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2 " +
									"LEFT JOIN categories c ON c.category_id = cm.category_id " +
									"LEFT JOIN categories c2 ON c2.category_id = c.parent_id " +
									"LEFT JOIN category_prices cp ON cp.category_id = cm.category_id " +
									"LEFT JOIN category_price_groups cpg ON cpg.id = cp.category_price_group_id " +
									"LEFT JOIN category_price_levels cpl ON cpl.price_level = cp.price_level AND cpl.max_price >= p.msrp " +
									"LEFT JOIN category_price_discount_adjustments cpda ON cpda.percent_off_msrp < ((p.msrp - p.market_price) / p.msrp) " +
							"WHERE p.sku = ?";
	var cpd = await globals.poolRO.query(sql, [sku]);
	colUtils.outboundNaming(cpd);
	return cpd;
}



exports.getWithoutSku = async (categoryId, msrp, compareAt) => {
	var sql = "SELECT cm.category_id, c2.name AS category_1, c.name AS category_2, cp.id AS category_price_id, " +
									"cp.price_level, cp.category_price_group_id, cpg.group, cpg.tier_1, cpg.tier_2, cpg.tier_3, cpg.tier_4, cpg.tier_5, cpg.tier_6, " +
									"CONCAT('tier', cpl.tier) AS tier, " +
									"COALESCE(MAX(cpda.percent_off_msrp),0) AS percent_off_msrp, " +
									"COALESCE(cpda.adjustment,0) AS discount_adjustment " +
								"FROM category_mappings cm " +
										"LEFT JOIN categories c ON c.category_id = cm.category_id " +
										"LEFT JOIN categories c2 ON c2.category_id = c.parent_id " +
										"LEFT JOIN category_prices cp ON cp.category_id = cm.category_id " +
										"LEFT JOIN category_price_groups cpg ON cpg.id = cp.category_price_group_id " +
										"LEFT JOIN category_price_levels cpl ON cpl.price_level = cp.price_level AND cpl.max_price >= ? " +
										"LEFT JOIN category_price_discount_adjustments cpda ON cpda.id = ( " +
											"SELECT MAX(id) AS id " +
											"FROM category_price_discount_adjustments " +
											"WHERE percent_off_msrp < ((? - ?) / ?) " +
										") " +
								"WHERE cm.category_id = ?";
	
	// console.log(mysql.format(sql, [msrp, msrp, compareAt, msrp, categoryId]));
	var cpd = await globals.poolRO.query(sql, [msrp, msrp, compareAt, msrp, categoryId]);
	colUtils.outboundNaming(cpd);
	return cpd;
}


