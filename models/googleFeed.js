'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.getCandidateSku = async (sku) => {
	var sql = `SELECT p.sku, p.status, p.online_shopping, p.online_quick_sale, p.shippable, p.condition_name,
									m.vendor_id, p.seller_product_id, \`name\` AS title, s.pct_ship_eligible
								FROM products p
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
									LEFT JOIN metro_sku_eligibility_summary s ON p.sku = s.sku
								WHERE p.sku = ?`;

	// console.log(mysql.format(sql, [offset, limit]));
	var sku = await globals.poolRO.query(sql, [sku]);

	colUtils.outboundNaming(sku);

	return sku;
}


exports.getCandidateSkus = async (offset, limit) => {
	var sql = `SELECT p.sku, pct_ship_eligible, coin_pct_ship_eligible,
								m.vendor_id,
								p.seller_product_id,
								\`name\` AS title 
							FROM products p
								LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								LEFT JOIN metro_sku_eligibility_summary s ON s.sku = p.sku
							WHERE STATUS = 'Live'
								AND online_shopping = 'Y'
								AND online_quick_sale = 'N'
								AND shippable = 'Y'
								AND condition_name IN ('New', 'Like New')
								AND pct_ship_eligible = 100
								AND m.vendor_id NOT IN (SELECT \`value\` FROM master_data WHERE TYPE = 'omitFromGoogleFeed')
							UNION
							SELECT p.sku, pct_ship_eligible, coin_pct_ship_eligible,
								m.vendor_id,
								p.seller_product_id,
								\`name\` AS title 
							FROM products p
								LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								LEFT JOIN metro_sku_eligibility_summary s ON s.sku = p.sku
							WHERE STATUS = 'Live'
								AND online_shopping = 'Y'
								AND online_quick_sale = 'N'
								AND shippable = 'Y'
								AND condition_name IN ('New', 'Like New')
								AND pct_ship_eligible >= 0 
								AND coin_pct_ship_eligible = 0
								AND m.vendor_id NOT IN (SELECT \`value\` FROM master_data WHERE TYPE = 'omitFromGoogleFeed')
							ORDER BY sku`;

	// console.log(mysql.format(sql, [offset, limit]));
	var skus = await globals.poolRO.query(sql, [offset, limit]);

	colUtils.outboundNaming(skus);

	return skus;
}



exports.getPendingUploads = async (sku) => {
	await globals.pool.query(`DELETE FROM google_feed_upload_queue WHERE status = 'SENT' AND send_time < DATE_ADD(NOW(), INTERVAL -7 DAY)`);


	var sql = `SELECT id, origin_filename, dest_filename
								FROM google_feed_upload_queue
								WHERE status = 'PENDING' AND send_time < NOW()`;

	var rows = await globals.poolRO.query(sql);

	colUtils.outboundNaming(rows);

	return rows;
}


exports.markUploadSent = async (id) => {
	await globals.pool.query(`UPDATE google_feed_upload_queue SET status = 'SENT' WHERE id = ?`, [id]);
}


exports.queueUpload = async (originFilename, destFilename, minutes) => {
	await globals.pool.query(`INSERT INTO google_feed_upload_queue (origin_filename, dest_filename, send_time) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`, [originFilename, destFilename, minutes]);
}



exports.checkMetroSku = async (metro, skus) => {
	// console.log(`SELECT p.sku, p.price, p.store_id, p.condition_name, COALESCE(eligibility_override, eligibility) AS effective_eligibility
	// FROM metro_sku_eligibility e LEFT JOIN products p ON e.sku = p.sku
	// 	WHERE e.sku IN (${skus}) 
	// 		AND dest_postal_code = ${metro.zip}
	// 		AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
	// 	ORDER BY ${metro.orderBy} p.price ASC`)
	var rows = await globals.poolRO.query(`SELECT p.sku, p.price, p.store_id, p.condition_name, e.ship_type, COALESCE(eligibility_override, eligibility) AS effective_eligibility
																FROM metro_sku_eligibility e LEFT JOIN products p ON e.sku = p.sku
																	WHERE e.sku IN (${skus}) 
																		AND dest_postal_code = ${metro.zip}
																		AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
																	ORDER BY ${metro.orderBy} p.price ASC`);
	colUtils.outboundNaming(rows);

	return rows;																															
}


exports.getScoringRules = async () => {
	var rows = await globals.pool.query(`SELECT * FROM google_sku_scoring_criteria ORDER BY criteria, range_start, value`);

	colUtils.outboundNaming(rows);

	return rows;
}



exports.storeRow = async (timestamp, worksheet, row) => {
	var sql = `INSERT INTO google_feed_retention (last_update, id, item_group, title, description, price, \`condition\`, link, availability, image_link, google_product_category,
										product_category, brand, gtin, mpn, identifier_exists, color, material, size, product_detail, ads_redirect, product_highlight, msrp, 
										main_lifestyle_image, alt_image3, alt_image4, alt_image5, attribute_name1, attribute_name2, attribute_name3, attribute_name4, attribute_name5, attribute_name6,
										attribute_value1, attribute_value2, attribute_value3, attribute_value4, attribute_value5, attribute_value6,
										bullet_point1, bullet_point2, bullet_point3, bullet_point4, color_specific, material_specific, shipping, 
										avg_margin_dollars, avg_margin_pct, category2, price_discount_score, net_margin_score, inventory_depth_score,
										evergreen_score, condition_score, brand_score, total_score) 
										VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
										ON DUPLICATE KEY UPDATE last_update = ?, 
										item_group = ?, title = ?, description = ?, price = ?, \`condition\` = ?, link = ?, availability = ?, image_link = ?, google_product_category = ?,
										product_category = ?, brand = ?, gtin = ?, mpn = ?, identifier_exists = ?, color = ?, material = ?, size = ?, product_detail = ?, ads_redirect = ?, product_highlight = ?, msrp = ?,
										main_lifestyle_image = ?, alt_image3 = ?, alt_image4 = ?, alt_image5 = ?, attribute_name1 = ?, attribute_name2 = ?, attribute_name3 = ?, attribute_name4 = ?, attribute_name5 = ?, attribute_name6 = ?,
										attribute_value1 = ?, attribute_value2 = ?, attribute_value3 = ?, attribute_value4 = ?, attribute_value5 = ?, attribute_value6 = ?, 
										bullet_point1 = ?, bullet_point2 = ?, bullet_point3 = ?, bullet_point4 = ?, color_specific = ?, material_specific = ?, shipping = ?, 
										avg_margin_dollars = ?, avg_margin_pct = ?, category2 = ?, price_discount_score = ?, net_margin_score = ?, inventory_depth_score = ?, 
										evergreen_score = ?, condition_score = ?, brand_score = ?, total_score = ?`;

	// console.log(`ID: ${worksheet.getCell(row, 1).value} ${worksheet.getCell(row, 3).value} ${worksheet.getCell(row, 3).text} `);
	// console.log(mysql.format(sql, [worksheet.getCell(row, 1).value, worksheet.getCell(row, 2).value, worksheet.getCell(row, 3).value,
	// 	worksheet.getCell(row, 4).value, worksheet.getCell(row, 5).value, worksheet.getCell(row, 6).value, worksheet.getCell(row, 7).value, worksheet.getCell(row, 8).value, 
	// 	worksheet.getCell(row, 9).value, worksheet.getCell(row, 10).value, worksheet.getCell(row, 11).value, worksheet.getCell(row, 12).value, worksheet.getCell(row, 13).value,
	// 	worksheet.getCell(row, 14).value, worksheet.getCell(row, 15).value, worksheet.getCell(row, 16).value, worksheet.getCell(row, 17).value, worksheet.getCell(row, 18).value,
	// 	worksheet.getCell(row, 19).value, worksheet.getCell(row, 20).value, worksheet.getCell(row, 21).value, worksheet.getCell(row, 22).value, worksheet.getCell(row, 23).value,
	// 	worksheet.getCell(row, 24).value, worksheet.getCell(row, 25).value, worksheet.getCell(row, 26).value, worksheet.getCell(row, 27).value, worksheet.getCell(row, 28).value,
	// 	worksheet.getCell(row, 29).value, worksheet.getCell(row, 30).value, worksheet.getCell(row, 31).value, worksheet.getCell(row, 32).value, worksheet.getCell(row, 33).value,
	// 	worksheet.getCell(row, 34).value, worksheet.getCell(row, 35).value, worksheet.getCell(row, 36).value, worksheet.getCell(row, 37).value, worksheet.getCell(row, 38).value,
	// 	worksheet.getCell(row, 39).value, worksheet.getCell(row, 40).value, worksheet.getCell(row, 41).value, worksheet.getCell(row, 42).value, worksheet.getCell(row, 43).value,
	// 	worksheet.getCell(row, 44).value, worksheet.getCell(row, 45).value, worksheet.getCell(row, 46).value, worksheet.getCell(row, 47).value, worksheet.getCell(row, 48).value,
	// 	worksheet.getCell(row, 49).value, worksheet.getCell(row, 50).value, worksheet.getCell(row, 51).value, worksheet.getCell(row, 52).value, worksheet.getCell(row, 53).value,
	// 	worksheet.getCell(row, 54).value, worksheet.getCell(row, 55).value,
	// 	worksheet.getCell(row, 2).value, worksheet.getCell(row, 3).value,
	// 	worksheet.getCell(row, 4).value, worksheet.getCell(row, 5).value, worksheet.getCell(row, 6).value, worksheet.getCell(row, 7).value, worksheet.getCell(row, 8).value, 
	// 	worksheet.getCell(row, 9).value, worksheet.getCell(row, 10).value, worksheet.getCell(row, 11).value, worksheet.getCell(row, 12).value, worksheet.getCell(row, 13).value,
	// 	worksheet.getCell(row, 14).value, worksheet.getCell(row, 15).value, worksheet.getCell(row, 16).value, worksheet.getCell(row, 17).value, worksheet.getCell(row, 18).value,
	// 	worksheet.getCell(row, 19).value, worksheet.getCell(row, 20).value, worksheet.getCell(row, 21).value, worksheet.getCell(row, 22).value, worksheet.getCell(row, 23).value,
	// 	worksheet.getCell(row, 24).value, worksheet.getCell(row, 25).value, worksheet.getCell(row, 26).value, worksheet.getCell(row, 27).value, worksheet.getCell(row, 28).value,
	// 	worksheet.getCell(row, 29).value, worksheet.getCell(row, 30).value, worksheet.getCell(row, 31).value, worksheet.getCell(row, 32).value, worksheet.getCell(row, 33).value,
	// 	worksheet.getCell(row, 34).value, worksheet.getCell(row, 35).value, worksheet.getCell(row, 36).value, worksheet.getCell(row, 37).value, worksheet.getCell(row, 38).value,
	// 	worksheet.getCell(row, 39).value, worksheet.getCell(row, 40).value, worksheet.getCell(row, 41).value, worksheet.getCell(row, 42).value, worksheet.getCell(row, 43).value,
	// 	worksheet.getCell(row, 44).value, worksheet.getCell(row, 45).value, worksheet.getCell(row, 46).value, worksheet.getCell(row, 47).value, worksheet.getCell(row, 48).value,
	// 	worksheet.getCell(row, 49).value, worksheet.getCell(row, 50).value, worksheet.getCell(row, 51).value, worksheet.getCell(row, 52).value, worksheet.getCell(row, 53).value,
	// 	worksheet.getCell(row, 54).value, worksheet.getCell(row, 55).value
	// ]));

	var result = await globals.pool.query(sql, [timestamp.format("YYYY-MM-DD HH-mm-ss"), worksheet.getCell(row, 1).value, worksheet.getCell(row, 2).value, worksheet.getCell(row, 3).value,
		worksheet.getCell(row, 4).value, worksheet.getCell(row, 5).value, worksheet.getCell(row, 6).value, worksheet.getCell(row, 7).value, worksheet.getCell(row, 8).value, 
		worksheet.getCell(row, 9).value, worksheet.getCell(row, 10).value, worksheet.getCell(row, 11).value, worksheet.getCell(row, 12).value, worksheet.getCell(row, 13).value,
		worksheet.getCell(row, 14).value, worksheet.getCell(row, 15).value, worksheet.getCell(row, 16).value, worksheet.getCell(row, 17).value, worksheet.getCell(row, 18).value,
		worksheet.getCell(row, 19).value, worksheet.getCell(row, 20).value, worksheet.getCell(row, 21).value, worksheet.getCell(row, 22).value, worksheet.getCell(row, 23).value,
		worksheet.getCell(row, 24).value, worksheet.getCell(row, 25).value, worksheet.getCell(row, 26).value, worksheet.getCell(row, 27).value, worksheet.getCell(row, 28).value,
		worksheet.getCell(row, 29).value, worksheet.getCell(row, 30).value, worksheet.getCell(row, 31).value, worksheet.getCell(row, 32).value, worksheet.getCell(row, 33).value,
		worksheet.getCell(row, 34).value, worksheet.getCell(row, 35).value, worksheet.getCell(row, 36).value, worksheet.getCell(row, 37).value, worksheet.getCell(row, 38).value,
		worksheet.getCell(row, 39).value, worksheet.getCell(row, 40).value, worksheet.getCell(row, 41).value, worksheet.getCell(row, 42).value, worksheet.getCell(row, 43).value,
		worksheet.getCell(row, 44).value, worksheet.getCell(row, 45).value, worksheet.getCell(row, 46).value, worksheet.getCell(row, 47).value, worksheet.getCell(row, 48).value,
		worksheet.getCell(row, 49).value, worksheet.getCell(row, 50).value, worksheet.getCell(row, 51).value, worksheet.getCell(row, 52).value, worksheet.getCell(row, 53).value,
		worksheet.getCell(row, 54).value, worksheet.getCell(row, 55).value,
		timestamp.format("YYYY-MM-DD HH-mm-ss"), worksheet.getCell(row, 2).value, worksheet.getCell(row, 3).value,
		worksheet.getCell(row, 4).value, worksheet.getCell(row, 5).value, worksheet.getCell(row, 6).value, worksheet.getCell(row, 7).value, worksheet.getCell(row, 8).value, 
		worksheet.getCell(row, 9).value, worksheet.getCell(row, 10).value, worksheet.getCell(row, 11).value, worksheet.getCell(row, 12).value, worksheet.getCell(row, 13).value,
		worksheet.getCell(row, 14).value, worksheet.getCell(row, 15).value, worksheet.getCell(row, 16).value, worksheet.getCell(row, 17).value, worksheet.getCell(row, 18).value,
		worksheet.getCell(row, 19).value, worksheet.getCell(row, 20).value, worksheet.getCell(row, 21).value, worksheet.getCell(row, 22).value, worksheet.getCell(row, 23).value,
		worksheet.getCell(row, 24).value, worksheet.getCell(row, 25).value, worksheet.getCell(row, 26).value, worksheet.getCell(row, 27).value, worksheet.getCell(row, 28).value,
		worksheet.getCell(row, 29).value, worksheet.getCell(row, 30).value, worksheet.getCell(row, 31).value, worksheet.getCell(row, 32).value, worksheet.getCell(row, 33).value,
		worksheet.getCell(row, 34).value, worksheet.getCell(row, 35).value, worksheet.getCell(row, 36).value, worksheet.getCell(row, 37).value, worksheet.getCell(row, 38).value,
		worksheet.getCell(row, 39).value, worksheet.getCell(row, 40).value, worksheet.getCell(row, 41).value, worksheet.getCell(row, 42).value, worksheet.getCell(row, 43).value,
		worksheet.getCell(row, 44).value, worksheet.getCell(row, 45).value, worksheet.getCell(row, 46).value, worksheet.getCell(row, 47).value, worksheet.getCell(row, 48).value,
		worksheet.getCell(row, 49).value, worksheet.getCell(row, 50).value, worksheet.getCell(row, 51).value, worksheet.getCell(row, 52).value, worksheet.getCell(row, 53).value,
		worksheet.getCell(row, 54).value, worksheet.getCell(row, 55).value
	]);

	return result;
}


exports.pruneRetainedRows = async () => {
	var results = await globals.pool.query(`DELETE FROM google_feed_retention WHERE last_update <= DATE_SUB(NOW(), INTERVAL 90 DAY)`);

	return results;
}


exports.getRetainedRows = async () => {
	var rows = await globals.pool.query(`SELECT * FROM google_feed_retention WHERE last_update NOT IN (SELECT MAX(last_update) FROM google_feed_retention)`);

	colUtils.outboundNaming(rows);

	return rows;
}

