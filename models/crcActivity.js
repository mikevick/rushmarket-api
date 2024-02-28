'use strict';

const _ = require('lodash');
const moment = require('moment-timezone');
const mysql = require('promise-mysql');
const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.getDisposed = async (whereInfo, dateStart, dateEnd) => {
	var prom = [];
	var resp = {
		activity: []
	};


	var sql1 = `SELECT m.vendor_id, 
								p.date_created AS date_processed, 
								CONVERT_TZ(COALESCE(pal.date_created,p.date_created), '+00:00', 'US/Central') AS date_trashed,
								p.seller_product_id AS manifest_sku, 
								p.sku AS rush_sku, 
								p.name, 
								p.condition_name, 
								bi.build_inspect_notes,
								1 AS quantity_received, 
								COALESCE(p.tracking_number,'') AS tracking_number,
								p.status,
								p.disposal_fee,
								COALESCE(p.vendor_supplier_code,'') AS vendor_supplier_code,
								GROUP_CONCAT(DISTINCT(COALESCE(f.url,''))) AS damage_file_list, 
								md.description AS 'channel',
								damageTop.damage_location as damageLocation1, 
								damageTop.damage_severity as damageSeverity1, 
      					damageTop.damage_visibility as damageVisibility1, 
								damageBottom.damage_location as damageLocation2, 
      					damageBottom.damage_severity as damageSeverity2, 
								damageBottom.damage_visibility as damageVisibility2, 
      					damageInterior.damage_location as damageLocation3, 
								damageInterior.damage_severity as damageSeverity3, 
      					damageInterior.damage_visibility as damageVisibility3, 
								missingHardware.missing_hardware_severity as missingHardware
							FROM manifests m
								LEFT JOIN products p on m.manifest_id = p.manifest_id
								LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
								LEFT JOIN files f ON f.sku = p.sku AND f.tag = 'damage'
								LEFT JOIN product_build_inspects bi ON p.sku = bi.sku
								LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
								LEFT JOIN product_action_log pal ON pal.id = (
									SELECT id
									FROM product_action_log
									WHERE ACTION = 'TRASHED' AND sku = p.sku
									ORDER BY id DESC
									LIMIT 1
								)
								LEFT JOIN product_damage_pricing_rules damageTop ON p.damage_top = damageTop.product_damage_pricing_rules_id 
								LEFT JOIN product_damage_pricing_rules damageBottom ON p.damage_bottom = damageBottom.product_damage_pricing_rules_id 
								LEFT JOIN product_damage_pricing_rules damageInterior ON p.damage_interior = damageInterior.product_damage_pricing_rules_id 
								LEFT JOIN product_missing_hardware_rules missingHardware ON p.missing_hardware = missingHardware.product_missing_hardware_rules_id 
					
							${whereInfo.clause}
								AND m.manifest_source = "RBR"
								AND p.status = 'inactive'
								AND p.condition_name = 'Trash'
								AND p.sku NOT IN (
									SELECT p2.sku
										FROM products p2 
											LEFT JOIN manifests m ON m.manifest_id = p2.manifest_id 
											LEFT JOIN product_action_log pa ON p2.sku = pa.sku
										WHERE ((pa.inactive_reason_id = 17) OR (pa.inactive_reason_id = 18) OR (pa.inactive_reason_id = 19))
											AND pa.date_created >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}' 
											AND pa.date_created < '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
											AND MONTH(pal.date_created) = MONTH(pa.date_created)
								)
							GROUP BY p.sku `;

	var sql2 = `SELECT m.vendor_id, 
							p.date_created AS date_processed, 
							CONVERT_TZ(COALESCE(pal.date_created,p.date_created), '+00:00', 'US/Central') AS date_trashed,
							p.seller_product_id AS manifest_sku, 
							p.sku AS rush_sku, 
							CONCAT(p.name, ' (CREDIT)') AS NAME, 
							p.condition_name, 
							bi.build_inspect_notes,
							0 AS quantity_received, 
							COALESCE(p.tracking_number,'') AS tracking_number,
							p.status,
							(-1 * p.disposal_fee),
							COALESCE(p.vendor_supplier_code,'') AS vendor_supplier_code,
							GROUP_CONCAT(DISTINCT(COALESCE(f.url,''))) AS damage_file_list, 
							md.description AS 'channel',
							damageTop.damage_location as damageLocation1, 
							damageTop.damage_severity as damageSeverity1, 
							damageTop.damage_visibility as damageVisibility1, 
							damageBottom.damage_location as damageLocation2, 
							damageBottom.damage_severity as damageSeverity2, 
							damageBottom.damage_visibility as damageVisibility2, 
							damageInterior.damage_location as damageLocation3, 
							damageInterior.damage_severity as damageSeverity3, 
							damageInterior.damage_visibility as damageVisibility3, 
							missingHardware.missing_hardware_severity as missingHardware
						FROM manifests m
							LEFT JOIN products p on m.manifest_id = p.manifest_id
							LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
							LEFT JOIN files f ON f.sku = p.sku AND f.tag = 'damage'
							LEFT JOIN product_build_inspects bi ON p.sku = bi.sku
							LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
							LEFT JOIN product_action_log pal ON pal.sku = p.sku
							LEFT JOIN product_damage_pricing_rules damageTop ON p.damage_top = damageTop.product_damage_pricing_rules_id 
							LEFT JOIN product_damage_pricing_rules damageBottom ON p.damage_bottom = damageBottom.product_damage_pricing_rules_id 
							LEFT JOIN product_damage_pricing_rules damageInterior ON p.damage_interior = damageInterior.product_damage_pricing_rules_id 
							LEFT JOIN product_missing_hardware_rules missingHardware ON p.missing_hardware = missingHardware.product_missing_hardware_rules_id 
				
						${whereInfo.clause}
							AND m.manifest_source = "RBR"
							AND p.status = 'inactive'
							AND p.inactive_reason_id IS NOT NULL
							AND ir.reason IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')
							AND ((pal.inactive_reason_id = 17) OR (pal.inactive_reason_id = 18) OR (pal.inactive_reason_id = 19))
							AND p.condition_name = 'Trash'
							AND p.sku NOT IN (
								SELECT p2.sku
									FROM products p2 
										LEFT JOIN manifests m ON m.manifest_id = p2.manifest_id 
										LEFT JOIN product_action_log pa ON p2.sku = pa.sku
									WHERE pa.action = 'TRASHED'
										AND pa.date_created >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}' 
										AND pa.date_created < '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
										AND MONTH(pal.date_created) = MONTH(pa.date_created)
							)
						GROUP BY p.sku	`;

	var inside1 = mysql.format(sql1, whereInfo.values);
	var inside2 = mysql.format(sql2, whereInfo.values);

	var sql = `SELECT * FROM ( ${inside1} UNION ${inside2} ) a ORDER BY vendor_id, date_processed`;

	// console.log(mysql.format(sql, whereInfo.values));
	var results = await globals.poolRO.query(sql, whereInfo.values);

	resp.activity = results;
	colUtils.outboundNaming(resp.activity);


	return resp;
}


exports.getReceived = async (whereInfo, dateStart, dateEnd) => {
	var prom = [];
	var resp = {
		activity: []
	};

	var paWhereInfo = _.cloneDeep(whereInfo);


	var sql1 = `SELECT m.vendor_id, 
								p.date_created AS date_processed, 
								p.seller_product_id AS manifest_sku, 
								p.sku AS rush_sku, 
								p.name, 
								p.condition_name,
								bi.build_inspect_notes, 
								1 AS quantity_received, 
								p.processing_fee,
								COALESCE(p.tracking_number,'') AS tracking_number,
								p.status,
								COALESCE(p.vendor_supplier_code,'') AS vendor_supplier_code,
								GROUP_CONCAT(DISTINCT(COALESCE(f.url,''))) AS damage_file_list, 
								GROUP_CONCAT(DISTINCT(COALESCE(f2.url,''))) AS shipping_label_list, 
								md.description AS 'channel',
								damageTop.damage_location as damageLocation1, 
								damageTop.damage_severity as damageSeverity1, 
      					damageTop.damage_visibility as damageVisibility1, 
								damageBottom.damage_location as damageLocation2, 
      					damageBottom.damage_severity as damageSeverity2, 
								damageBottom.damage_visibility as damageVisibility2, 
      					damageInterior.damage_location as damageLocation3, 
								damageInterior.damage_severity as damageSeverity3, 
      					damageInterior.damage_visibility as damageVisibility3, 
								missingHardware.missing_hardware_severity as missingHardware
							FROM manifests m, products p
								LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
								LEFT JOIN files f ON f.sku = p.sku AND f.tag = 'damage'
								LEFT JOIN files f2 ON f2.sku = p.sku AND f2.tag = 'shipping label'
								LEFT JOIN product_build_inspects bi ON p.sku = bi.sku
								LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
								LEFT JOIN product_damage_pricing_rules damageTop ON p.damage_top = damageTop.product_damage_pricing_rules_id 
								LEFT JOIN product_damage_pricing_rules damageBottom ON p.damage_bottom = damageBottom.product_damage_pricing_rules_id 
								LEFT JOIN product_damage_pricing_rules damageInterior ON p.damage_interior = damageInterior.product_damage_pricing_rules_id 
								LEFT JOIN product_missing_hardware_rules missingHardware ON p.missing_hardware = missingHardware.product_missing_hardware_rules_id 
					
							${whereInfo.clause}
								AND m.manifest_id = p.manifest_id
								AND m.manifest_source = "RBR"
								AND p.sku NOT IN (
									SELECT p.sku
										FROM products p 
											LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
											LEFT JOIN product_action_log pa ON p.sku = pa.sku
										WHERE ((pa.inactive_reason_id = 17) OR (pa.inactive_reason_id = 18) OR (pa.inactive_reason_id = 19))
											AND pa.date_created >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}' 
											AND pa.date_created < '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
											AND MONTH(p.date_created) = MONTH(pa.date_created)
								)
							GROUP BY p.sku `;


	whereInfo.clause = whereInfo.clause.replace(/p.date_created/g, 'pa.date_created');							

	var sql2 = `SELECT m.vendor_id, 
								pa.date_created AS date_processed, 
								p.seller_product_id AS manifest_sku, 
								p.sku AS rush_sku, 
								CONCAT(p.name, ' (CREDIT)') AS NAME, 
								p.condition_name,
								bi.build_inspect_notes, 
								0 AS quantity_received, 
								(-1 * p.processing_fee) AS processing_fee,
								COALESCE(p.tracking_number,'') AS tracking_number,
								p.status,
								COALESCE(p.vendor_supplier_code,'') AS vendor_supplier_code,
								GROUP_CONCAT(DISTINCT(COALESCE(f.url,''))) AS damage_file_list, 
								GROUP_CONCAT(DISTINCT(COALESCE(f2.url,''))) AS shipping_label_list, 
								md.description AS 'channel',
								damageTop.damage_location as damageLocation1, 
								damageTop.damage_severity as damageSeverity1, 
      					damageTop.damage_visibility as damageVisibility1, 
								damageBottom.damage_location as damageLocation2, 
      					damageBottom.damage_severity as damageSeverity2, 
								damageBottom.damage_visibility as damageVisibility2, 
      					damageInterior.damage_location as damageLocation3, 
								damageInterior.damage_severity as damageSeverity3, 
      					damageInterior.damage_visibility as damageVisibility3, 
								missingHardware.missing_hardware_severity as missingHardware
							FROM manifests m, products p
								LEFT JOIN product_action_log pa ON p.sku = pa.sku
								LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
								LEFT JOIN files f ON f.sku = p.sku AND f.tag = 'damage'
								LEFT JOIN files f2 ON f2.sku = p.sku AND f2.tag = 'shipping label'
								LEFT JOIN product_build_inspects bi ON p.sku = bi.sku
								LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
								LEFT JOIN product_damage_pricing_rules damageTop ON p.damage_top = damageTop.product_damage_pricing_rules_id 
								LEFT JOIN product_damage_pricing_rules damageBottom ON p.damage_bottom = damageBottom.product_damage_pricing_rules_id 
								LEFT JOIN product_damage_pricing_rules damageInterior ON p.damage_interior = damageInterior.product_damage_pricing_rules_id 
								LEFT JOIN product_missing_hardware_rules missingHardware ON p.missing_hardware = missingHardware.product_missing_hardware_rules_id 
					
							${whereInfo.clause}
								AND m.manifest_id = p.manifest_id
								AND m.manifest_source = "RBR"
								AND p.inactive_reason_id IS NOT NULL 
								AND ir.reason IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')
								AND ((pa.inactive_reason_id = 17) OR (pa.inactive_reason_id = 18) OR (pa.inactive_reason_id = 19))
								AND p.sku NOT IN (
									SELECT p.sku
										FROM products p 
											LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
											LEFT JOIN product_action_log pa ON p.sku = pa.sku
										WHERE ((pa.inactive_reason_id = 17) OR (pa.inactive_reason_id = 18) OR (pa.inactive_reason_id = 19))
											AND pa.date_created >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}' 
											AND pa.date_created < '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
											AND MONTH(p.date_created) = MONTH(pa.date_created)
								)
							GROUP BY p.sku`;


	var inside1 = mysql.format(sql1, whereInfo.values);
	var inside2 = mysql.format(sql2, whereInfo.values);

	var sql = `SELECT * FROM ( ${inside1} UNION ${inside2} ) a ORDER BY vendor_id, date_processed`;

	// console.log(mysql.format(sql));
	var results = await globals.poolRO.query(sql);

	resp.activity = results;
	colUtils.outboundNaming(resp.activity);


	return resp;
}


exports.getReturned = async (whereInfo, dateStart, outletWhereInfo, source) => {
	var prom = [];
	var resp = {
		activity: []
	};

	var excludeMarketplaceStart = new moment('2022-05-01 05:00');
	var streamline = new moment(dateStart).isSameOrAfter(excludeMarketplaceStart);

	var sql = `SELECT m.vendor_id,
						i.line_item_date_created AS date_returned,
						p.seller_product_id AS manifest_sku,
						p.sku AS rush_sku,
						p.name,
						p.condition_name,
						i.quantity AS quantity_returned,
						IF (o.source_name = 'marketplace', ROUND(p.price * i.quantity, 2), ROUND(i.price * i.quantity, 2)) AS price_per_unit_sold,
						ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2) AS credit_amount, 
						md.description AS 'channel',
						damageTop.damage_location as damageLocation1, 
						damageTop.damage_severity as damageSeverity1, 
						damageTop.damage_visibility as damageVisibility1, 
						damageBottom.damage_location as damageLocation2, 
						damageBottom.damage_severity as damageSeverity2, 
						damageBottom.damage_visibility as damageVisibility2, 
						damageInterior.damage_location as damageLocation3, 
						damageInterior.damage_severity as damageSeverity3, 
						damageInterior.damage_visibility as damageVisibility3, 
						missingHardware.missing_hardware_severity as missingHardware
					FROM manifests m 
						LEFT JOIN products p ON m.manifest_id = p.manifest_id 
						LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
						LEFT JOIN order_line_items i ON i.sku = p.sku 
						LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
						LEFT JOIN orders o ON i.order_id = o.order_id 
						LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
						LEFT JOIN product_damage_pricing_rules damageTop ON p.damage_top = damageTop.product_damage_pricing_rules_id 
						LEFT JOIN product_damage_pricing_rules damageBottom ON p.damage_bottom = damageBottom.product_damage_pricing_rules_id 
						LEFT JOIN product_damage_pricing_rules damageInterior ON p.damage_interior = damageInterior.product_damage_pricing_rules_id 
						LEFT JOIN product_missing_hardware_rules missingHardware ON p.missing_hardware = missingHardware.product_missing_hardware_rules_id 
			
						`;
				if (source) {
					sql += `${outletWhereInfo.clause} `;
				}
				else {
					sql += `${whereInfo.clause} `;
				}

				sql += `
								AND ((p.inactive_reason_id IS NULL) OR (ir.reason NOT IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')))
								AND m.manifest_source = "RBR"
								AND i.line_type = "return"
								AND i.product_type = "sku"
								AND i.sku NOT IN (SELECT products_sku FROM orders_internal WHERE i.line_item_date_created >= '2022-03-01 06:00:00' AND i.line_item_date_created > date_created) 
								`;

				if (streamline) {
					sql += ` AND o.source_name != 'marketplace' `;
				}
				else {								
					sql += `	
									AND i.sku NOT IN (
									SELECT sku 
										FROM order_line_items li
											LEFT JOIN orders o ON o.order_id = li.order_id
										WHERE o.source_name = 'marketplace' AND line_type = 'return' AND product_type = 'sku' AND line_item_date_created >= '2022-05-01 05:00'
								)
							ORDER BY m.vendor_id, i.line_item_date_created`;
				}

	// console.log(mysql.format(sql, whereInfo.values));
	var results = await globals.poolRO.query(sql, whereInfo.values);

	resp.activity = results;
	colUtils.outboundNaming(resp.activity);


	return resp;
}



exports.getSold = async (whereInfo, outletWhereInfo, source, dateStart, dateEnd) => {
	var prom = [];
	var resp = {
		activity: []
	};


	//	Get skus that have been purchased and not internal orders.
	var sql1 = `
					SELECT m.vendor_id, i.line_item_date_created AS date_sold, p.date_created, p.seller_product_id AS manifest_sku, 
							p.sku AS rush_sku, p.name, p.condition_name, i.quantity AS quantity_sold, 
							IF (o.source_name = 'marketplace', ROUND(p.price * i.quantity, 2), ROUND(i.price * i.quantity, 2)) AS price_per_unit_sold, 
							ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2) AS amount_owed, 
							o.platform_channel,
							damageTop.damage_location as damageLocation1, 
							damageTop.damage_severity as damageSeverity1, 
							damageTop.damage_visibility as damageVisibility1, 
							damageBottom.damage_location as damageLocation2, 
							damageBottom.damage_severity as damageSeverity2, 
							damageBottom.damage_visibility as damageVisibility2, 
							damageInterior.damage_location as damageLocation3, 
							damageInterior.damage_severity as damageSeverity3, 
							damageInterior.damage_visibility as damageVisibility3, 
							missingHardware.missing_hardware_severity as missingHardware
					FROM manifests m 
						LEFT JOIN products p ON m.manifest_id = p.manifest_id 
						LEFT JOIN order_line_items i ON i.sku = p.sku 
						LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
						LEFT JOIN orders o ON i.order_id = o.order_id 
						LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
						LEFT JOIN product_damage_pricing_rules damageTop ON p.damage_top = damageTop.product_damage_pricing_rules_id 
						LEFT JOIN product_damage_pricing_rules damageBottom ON p.damage_bottom = damageBottom.product_damage_pricing_rules_id 
						LEFT JOIN product_damage_pricing_rules damageInterior ON p.damage_interior = damageInterior.product_damage_pricing_rules_id 
						LEFT JOIN product_missing_hardware_rules missingHardware ON p.missing_hardware = missingHardware.product_missing_hardware_rules_id 
			
						`;

						if (source) {
							sql1 += `${outletWhereInfo.clause} `;
						}
						else {
							sql1 += `${whereInfo.clause} `;
						}
			
			
			sql1 += `	AND m.manifest_source = 'RBR' 
								AND i.line_type = 'purchase' 
								AND i.product_type = 'sku'
								AND i.sku NOT IN (SELECT products_sku FROM orders_internal WHERE i.line_item_date_created >= '2022-03-01 06:00:00' AND i.line_item_date_created > date_created) `;

			//	Internal Orders
			var sql2 = `
							SELECT oi.vendor_id, oi.date_sold, oi.date_created, oi.seller_product_id AS manifest_sku, 
									oi.sku AS rush_sku, oi.name, oi.condition_name, 1 AS quantity_sold, 
									ROUND(oi.price * 1, 2) AS price_per_unit_sold, 
									ROUND(oi.cost * 1,2) AS amount_owed, 
									'' AS platform_channel,
									damageTop.damage_location as damageLocation1, 
									damageTop.damage_severity as damageSeverity1, 
									damageTop.damage_visibility as damageVisibility1, 
									damageBottom.damage_location as damageLocation2, 
									damageBottom.damage_severity as damageSeverity2, 
									damageBottom.damage_visibility as damageVisibility2, 
									damageInterior.damage_location as damageLocation3, 
									damageInterior.damage_severity as damageSeverity3, 
									damageInterior.damage_visibility as damageVisibility3, 
									missingHardware.missing_hardware_severity as missingHardware
							FROM orders_internal oi 
								LEFT JOIN products p ON p.sku = oi.products_sku
								LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
								LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
								LEFT JOIN product_damage_pricing_rules damageTop ON p.damage_top = damageTop.product_damage_pricing_rules_id 
								LEFT JOIN product_damage_pricing_rules damageBottom ON p.damage_bottom = damageBottom.product_damage_pricing_rules_id 
								LEFT JOIN product_damage_pricing_rules damageInterior ON p.damage_interior = damageInterior.product_damage_pricing_rules_id 
								LEFT JOIN product_missing_hardware_rules missingHardware ON p.missing_hardware = missingHardware.product_missing_hardware_rules_id 
					
								 `;

				sql2 += `${whereInfo.clause} `;

				sql2 += `
								AND m.manifest_source = 'RBR' `;

				sql2 = sql2.replace(/line_item_date_created/g, 'oi.date_sold');

	var sql = null;

	var inside1 = mysql.format(sql1, whereInfo.values);
	if ((source === undefined) || (source !== 'outlet')) {
		var inside2 = mysql.format(sql2, whereInfo.values);
	}
	if ((source === undefined) || (source !== 'outlet')) {
		sql = `SELECT * FROM ( ${inside1} UNION ALL ${inside2} ) a ORDER BY vendor_id, date_sold`;
	}
	else {
		sql = `SELECT * FROM ( ${inside1} ) a ORDER BY vendor_id, date_sold`; 
	}
	// console.log(sql);
	var results = await globals.poolRO.query(sql);

	resp.activity = results;
	colUtils.outboundNaming(resp.activity);


	return resp;
}



exports.getDisposedTotals = async (vendorId, dateStart, dateEnd, resp) => {
	var resp = {
		totals: []
	};
	var sql = `SELECT temp1.vendor_id, sum(temp1.total_disposal_fees) AS total_disposal_fees
								FROM
									(
										SELECT m.vendor_id, 
											SUM(p.disposal_fee) AS total_disposal_fees
										FROM manifests m
											LEFT JOIN products p ON m.manifest_id = p.manifest_id
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
											LEFT JOIN product_action_log pal ON pal.id = (
												SELECT id
												FROM product_action_log
												WHERE ACTION = 'TRASHED' AND sku = p.sku
												ORDER BY id DESC
												LIMIT 1
											)
										WHERE m.manifest_source = 'RBR' 
											AND p.status = 'Inactive' 
											AND p.condition_name = 'Trash' 
											AND p.sku NOT IN (
												SELECT p2.sku
													FROM products p2 
														LEFT JOIN manifests m ON m.manifest_id = p2.manifest_id 
														LEFT JOIN product_action_log pa ON p2.sku = pa.sku
													WHERE ((pa.inactive_reason_id = 17) OR (pa.inactive_reason_id = 18) OR (pa.inactive_reason_id = 19))
														AND pa.date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' 
														AND pa.date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
														AND MONTH(pal.date_created) = MONTH(pa.date_created)
											) `;
			

											if (vendorId !== undefined) {
												sql += `AND m.vendor_id = '${vendorId}' `;
											}
	
											sql += `AND COALESCE(pal.date_created,p.date_created) >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND COALESCE(pal.date_created,p.date_created) < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
										GROUP BY m.vendor_id
										UNION
										SELECT m.vendor_id, 
												SUM((-1 * p.disposal_fee)) AS total_disposal_fees
										FROM manifests m
											LEFT JOIN products p ON m.manifest_id = p.manifest_id
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
											LEFT JOIN product_action_log pal ON pal.sku = p.sku
									WHERE m.manifest_source = 'RBR' 
										AND p.status = 'Inactive' 
										AND p.inactive_reason_id IS NOT NULL
										AND ir.reason IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU') 
										AND ((pal.inactive_reason_id = 17) OR (pal.inactive_reason_id = 18) OR (pal.inactive_reason_id = 19))
										AND p.condition_name = 'Trash'
										AND p.sku NOT IN (
											SELECT p2.sku
												FROM products p2 
													LEFT JOIN manifests m ON m.manifest_id = p2.manifest_id 
													LEFT JOIN product_action_log pa ON p2.sku = pa.sku
												WHERE pa.action = 'TRASHED'
													AND pa.date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' 
													AND pa.date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
													AND MONTH(pal.date_created) = MONTH(pa.date_created)
										)	 `

										if (vendorId !== undefined) {
											sql += `AND m.vendor_id = '${vendorId}' `;
										}

										sql += `AND COALESCE(pal.date_created,p.date_created) >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND COALESCE(pal.date_created,p.date_created) < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
									GROUP BY m.vendor_id

									) temp1 
									GROUP BY vendor_id
									ORDER BY vendor_id `;

	// console.log(mysql.format(sql));
	var results = await globals.poolRO.query(sql);

	resp.totals = results;
	colUtils.outboundNaming(resp.totals);


	return resp;

}





exports.getReceivedTotals = async (vendorId, dateStart, dateEnd, resp) => {
	var resp = {
		totals: []
	};
	var sql = `SELECT temp1.vendor_id, SUM(temp1.total_quantity_received) as total_quantity_received, SUM(temp1.total_processing_fees) as total_processing_fees
								FROM
									(
										SELECT m.vendor_id, 
											SUM(1) AS total_quantity_received, 
											SUM(p.processing_fee) AS total_processing_fees
										FROM manifests m, products p
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
										WHERE m.manifest_id = p.manifest_id
											AND m.manifest_source = "RBR"
											AND p.sku NOT IN (
												SELECT p.sku
													FROM products p 
														LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
														LEFT JOIN product_action_log pa ON p.sku = pa.sku
													WHERE ((pa.inactive_reason_id = 17) OR (pa.inactive_reason_id = 18) OR (pa.inactive_reason_id = 19))
														AND pa.date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' 
														AND pa.date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
														AND MONTH(p.date_created) = MONTH(pa.date_created)
											)	 `

									if (vendorId !== undefined) {
										sql += `AND vendor_id = '${vendorId}' `;
									}
	
									sql += `AND p.date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND p.date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
										GROUP BY vendor_id
										UNION
										SELECT m.vendor_id, 
											SUM(0) AS total_quantity_received, 
											SUM((-1 * p.processing_fee)) AS total_processing_fees
										FROM manifests m, products p
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
											LEFT JOIN product_action_log pa ON p.sku = pa.sku
										WHERE m.manifest_id = p.manifest_id
											AND m.manifest_source = "RBR" 
											AND p.inactive_reason_id IS NOT NULL
											AND ir.reason IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')
											AND ((pa.inactive_reason_id = 17) OR (pa.inactive_reason_id = 18) OR (pa.inactive_reason_id = 19))
											AND p.sku NOT IN (
												SELECT p.sku
													FROM products p 
														LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
														LEFT JOIN product_action_log pa ON p.sku = pa.sku
													WHERE ((pa.inactive_reason_id = 17) OR (pa.inactive_reason_id = 18) OR (pa.inactive_reason_id = 19))
														AND pa.date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' 
														AND pa.date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
														AND MONTH(p.date_created) = MONTH(pa.date_created)
											)
			 `

								if (vendorId !== undefined) {
									sql += `AND vendor_id = '${vendorId}' `;
								}

								sql += `AND pa.date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND pa.date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
										GROUP BY vendor_id

									) temp1
									GROUP BY vendor_id
									ORDER BY vendor_id`;

	// console.log(mysql.format(sql));
	var results = await globals.poolRO.query(sql);

	resp.totals = results;
	colUtils.outboundNaming(resp.totals);


	return resp;

}


exports.getReturnedTotals = async (vendorId, dateStart, dateEnd, source, outlets, resp) => {
	var resp = {
		totals: []
	};

	var excludeMarketplaceStart = new moment('2022-05-01 05:00');
	var streamline = new moment(dateStart).isSameOrAfter(excludeMarketplaceStart);


	var sql = `SELECT temp3.vendor_id, temp3.total_sold_price as sp2, temp3.total_credit_amount
								FROM
									(
										SELECT m.vendor_id, 
											SUM(IF (o.source_name = 'marketplace', ROUND(p.price * i.quantity, 2), ROUND(i.price*i.quantity,2))) AS total_sold_price, 
											SUM(ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2)) AS total_credit_amount
										FROM manifests m
											LEFT JOIN products p ON m.manifest_id = p.manifest_id
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
											LEFT JOIN order_line_items i ON i.sku = p.sku 
											LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
											LEFT JOIN orders o ON i.order_id = o.order_id 
										WHERE m.manifest_id = p.manifest_id
											AND m.manifest_source = "RBR"
											AND i.line_type = "return"
											AND ((p.inactive_reason_id IS NULL) OR (ir.reason NOT IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')))
											AND i.product_type = "sku"
											AND i.sku NOT IN (SELECT products_sku FROM orders_internal WHERE i.line_item_date_created >= '2022-03-01 06:00:00' AND i.line_item_date_created > date_created) 
										`;

										if (streamline) {
											sql += ` AND o.source_name != 'marketplace' `;
										}
										else {								
											sql += `	
															AND i.sku NOT IN (
															SELECT sku 
																FROM order_line_items li
																	LEFT JOIN orders o ON o.order_id = li.order_id
																WHERE o.source_name = 'marketplace' AND line_type = 'return' AND product_type = 'sku' AND line_item_date_created >= '2022-05-01 05:00'
														) `;
										}
						
											
										if (vendorId !== undefined) {
											sql += `AND m.vendor_id = '${vendorId}' `;
										}

										if ((outlets.length > 0) && (source === 'outlet')) {
											sql += `AND o.platform_channel IN (${outlets}) `;
										}
										else if ((outlets.length > 0) && (source === 'rushmarket')) {
											sql += `AND ((o.platform_channel IS NULL) OR (o.platform_channel NOT IN (${outlets}))) `;
										}
									sql += `AND i.line_item_date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND i.line_item_date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
										GROUP BY m.vendor_id
										ORDER BY m.vendor_id, i.line_item_date_created
									) temp3`;

	// console.log(mysql.format(sql));
	var results = await globals.poolRO.query(sql);

	resp.totals = results;
	colUtils.outboundNaming(resp.totals);


	return resp;

}



exports.getSoldTotals = async (vendorId, dateStart, dateEnd, source, outlets, resp) => {
	var resp = {
		totals: []
	};
	var sql = `SELECT temp2.vendor_id, SUM(temp2.total_quantity_sold) AS total_quantity_sold, SUM(temp2.total_sold_price) AS total_sold_price, SUM(temp2.total_amount_owed) AS total_amount_owed
								FROM
									(
										SELECT m.vendor_id, 
											i.line_item_date_created AS date_sold,
											SUM(i.quantity) AS total_quantity_sold,
											SUM(IF (o.source_name = 'marketplace', ROUND(p.price * i.quantity, 2), ROUND(i.price*i.quantity, 2))) AS total_sold_price, 
											SUM(ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2)) AS total_amount_owed
										FROM manifests m
											LEFT JOIN products p ON m.manifest_id = p.manifest_id
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
											LEFT JOIN order_line_items i ON i.sku = p.sku 
											LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
											LEFT JOIN orders o ON i.order_id = o.order_id 
										WHERE m.manifest_id = p.manifest_id
											AND m.manifest_source = "RBR"
											AND i.line_type = "purchase"
											AND i.product_type = "sku" 
											AND i.sku NOT IN (SELECT products_sku FROM orders_internal WHERE i.line_item_date_created >= '2022-03-01 06:00:00' AND i.line_item_date_created > date_created) 
										 `;

										if (vendorId !== undefined) {
											sql += `AND m.vendor_id = '${vendorId}' `;
										}
										if ((outlets.length > 0) && (source === 'outlet')) {
											sql += `AND o.platform_channel IN (${outlets}) `;
										}
										else if ((outlets.length > 0) && (source === 'rushmarket')) {
											sql += `AND ((o.platform_channel IS NULL) OR (o.platform_channel NOT IN (${outlets}))) `;
										}

										sql += `AND i.line_item_date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND i.line_item_date_created <= '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
										GROUP BY vendor_id `;

										if (source === undefined) {
											sql += `
												UNION 
												SELECT oi.vendor_id, 
														oi.date_sold, 
														SUM(1) AS total_quantity_sold, 
														SUM(ROUND(oi.price * 1, 2)) AS total_sold_price, 
														SUM(ROUND(oi.cost * 1,2)) AS total_amount_owed
												FROM orders_internal oi 
													LEFT JOIN products p ON p.sku = oi.products_sku
													LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
												WHERE m.manifest_source = "RBR"  `;

													if (vendorId !== undefined) {
														sql += `AND m.vendor_id = '${vendorId}' `;
													}
	
													sql += `AND oi.date_sold >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND oi.date_sold <= '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
												GROUP BY vendor_id `;
										}

										sql += `
											) temp2
											GROUP BY vendor_id
											ORDER BY vendor_id, date_sold`;

	// console.log(mysql.format(sql));
	var results = await globals.poolRO.query(sql);

	resp.totals = results;
	colUtils.outboundNaming(resp.totals);


	return resp;

}



exports.getTotals = async (vendorId, dateStart, dateEnd, resp) => {
	var resp = {
		totals: []
	};
	var sql = `SELECT temp1.vendor_id, temp1.total_quantity_sold, temp1.total_quantity_received, temp1.total_processing_fees, temp1.total_disposal_fees, temp2.total_sold_price, temp2.total_amount_owed, temp3.toal_sold_price as sp2, temp3.total_credit_amount
								FROM
									(
										SELECT m.vendor_id, 
										SUM(1) AS total_quantity_sold, 
										SUM(1) AS total_quantity_received, 
											SUM(p.processing_fee) AS total_processing_fees,
											SUM(p.disposal_fee) AS total_disposal_fees
										FROM manifests m, products p
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
										WHERE m.manifest_id = p.manifest_id
											AND ir.reason NOT IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')
											AND m.manifest_source = "RBR" `
									if (vendorId !== undefined) {
										sql += `AND m.vendor_id = '${vendorId}' `;
									}
	
									sql += `AND p.date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND p.date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
										GROUP BY m.vendor_id
										ORDER BY m.vendor_id, p.date_created
									) temp1
								LEFT JOIN
									(
										SELECT m.vendor_id, 
											SUM(i.price) AS total_sold_price, 
											SUM(ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2)) AS total_amount_owed
										FROM manifests m
											LEFT JOIN products p ON m.manifest_id = p.manifest_id
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
											LEFT JOIN order_line_items i ON i.sku = p.sku 
											LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
										WHERE m.manifest_id = p.manifest_id
											AND m.manifest_source = "RBR"
											AND i.line_type = "purchase"
											AND ((p.inactive_reason_id IS NULL) OR (ir.reason NOT IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')))
											AND i.product_type = "sku" `;

										if (vendorId !== undefined) {
												sql += `AND m.vendor_id = '${vendorId}' `;
											}
										sql += `AND i.line_item_date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND i.line_item_date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
										GROUP BY m.vendor_id
										ORDER BY m.vendor_id, i.line_item_date_created
									) temp2 ON temp1.vendor_id = temp2.vendor_id
								LEFT JOIN
									(
										SELECT m.vendor_id, 
											SUM(i.price) AS total_sold_price, 
											SUM(ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2)) AS total_credit_amount
										FROM manifests m
											LEFT JOIN products p ON m.manifest_id = p.manifest_id
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
											LEFT JOIN order_line_items i ON i.sku = p.sku 
											LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
										WHERE m.manifest_id = p.manifest_id
											AND m.manifest_source = "RBR"
											AND i.line_type = "return"
											AND ((p.inactive_reason_id IS NULL) OR (ir.reason NOT IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')))
											AND i.product_type = "sku" `;
										if (vendorId !== undefined) {
											sql += `AND m.vendor_id = '${vendorId}' `;
										}
									sql += `AND i.line_item_date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND i.line_item_date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
										GROUP BY m.vendor_id
										ORDER BY m.vendor_id, i.line_item_date_created
									) temp3 ON temp1.vendor_id = temp3.vendor_id`;

	// console.log(mysql.format(sql));
	var results = await globals.poolRO.query(sql);

	resp.totals = results;
	colUtils.outboundNaming(resp.totals);


	return resp;

}