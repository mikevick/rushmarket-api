'use strict';

const mysql = require('promise-mysql');
const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.getMetaData = async (where) => {
	var sql = `SELECT COUNT(*) AS on_hand_qty, SUM(p.cost) as projected_recovery_value
								FROM products p
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status IN ('Live', 'Received')
									AND m.manifest_source IN ('RBR')
									AND p.sku NOT IN (SELECT products_sku FROM orders_internal)
									AND m.vendor_id = ?`;	

	var rows = await globals.poolRO.query(sql, where.values);
	colUtils.outboundNaming(rows);
								
	return rows;
}



exports.getDetail = async (whereInfo) => {
	var sql = `SELECT m.vendor_id, 
								p.date_created AS date_processed, 
								p.seller_product_id AS manifest_sku, 
								p.sku AS rush_sku, 
								p.name, 
								p.condition_name, 
								1 AS quantity, 
								ROUND(p.price, 2) as price,
								ROUND(p.cost*1, 2) AS amount_owed,
								COALESCE(p.tracking_number,'') AS tracking_number,
								p.status,
								COALESCE(p.vendor_supplier_code,'') AS vendor_supplier_code,
								GROUP_CONCAT(DISTINCT(COALESCE(f.url,''))) AS damage_file_list, 
								GROUP_CONCAT(DISTINCT(COALESCE(f2.url,''))) AS shipping_label_list, 
								md.description AS 'channel'
							FROM manifests m, products p
								LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
								LEFT JOIN files f ON f.sku = p.sku AND f.tag = 'damage'
								LEFT JOIN files f2 ON f2.sku = p.sku AND f2.tag = 'shipping label'
								LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
							${whereInfo.clause}
								AND p.status IN ('Live', 'Received') 
								AND m.manifest_id = p.manifest_id
								AND m.manifest_source = "RBR"
								AND ((p.inactive_reason_id IS NULL) OR (ir.reason NOT IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')))
							GROUP BY p.sku
							ORDER BY m.vendor_id, p.date_created`;

	// console.log(mysql.format(sql, whereInfo.values));
	var rows = await globals.poolRO.query(sql, whereInfo.values);

	colUtils.outboundNaming(rows);

	return rows;
}


exports.getReturned = async (whereInfo) => {
	var prom = [];
	var resp = {
		activity: []
	};


	var sql = `SELECT m.vendor_id,
						i.line_item_date_created AS date_returned,
						p.seller_product_id AS manifest_sku,
						p.sku AS rush_sku,
						p.name,
						p.condition_name,
						i.quantity AS quantity_returned,
						IF (o.source_name = 'marketplace', ROUND(p.price * i.quantity, 2), ROUND(i.price * i.quantity, 2)) AS price_per_unit_sold,
						ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2) AS credit_amount, 
						md.description AS 'channel'
					FROM manifests m 
						LEFT JOIN products p ON m.manifest_id = p.manifest_id 
						LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
						LEFT JOIN order_line_items i ON i.sku = p.sku 
						LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
						LEFT JOIN orders o ON i.order_id = o.order_id 
						LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
				${whereInfo.clause}
								AND ((p.inactive_reason_id IS NULL) OR (ir.reason NOT IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')))
								AND m.manifest_source = "RBR"
								AND i.line_type = "return"
								AND i.product_type = "sku"
							ORDER BY m.vendor_id, i.line_item_date_created`;

	// console.log(mysql.format(sql, whereInfo.values));
	var results = await globals.poolRO.query(sql, whereInfo.values);

	resp.activity = results;
	colUtils.outboundNaming(resp.activity);


	return resp;
}



exports.getSold = async (whereInfo) => {
	var prom = [];
	var resp = {
		activity: []
	};


	var sql1 = `
		SELECT m.vendor_id, i.line_item_date_created AS date_sold, p.date_created, p.seller_product_id AS manifest_sku, 
				p.sku AS rush_sku, p.name, p.condition_name, i.quantity AS quantity_sold, 
				IF (o.source_name = 'marketplace', ROUND(p.price * i.quantity, 2), ROUND(i.price * i.quantity, 2)) AS price_per_unit_sold, ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2) AS amount_owed, md.description AS 'channel'
			FROM manifests m 
				LEFT JOIN products p ON m.manifest_id = p.manifest_id 
				LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
				LEFT JOIN order_line_items i ON i.sku = p.sku 
				LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
				LEFT JOIN orders o ON i.order_id = o.order_id 
				LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
			${whereInfo.clause} 
			AND m.manifest_source = "RBR" 
			AND i.line_type = "purchase" 
			AND i.product_type = "sku" 
			AND ((p.inactive_reason_id IS NULL) OR (ir.reason NOT IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')))`;

			var sql2 = `
		SELECT m.vendor_id, pa.date_created AS date_sold, p.date_created, p.seller_product_id AS manifest_sku, 
				p.sku AS rush_sku, p.name, p.condition_name, 1 AS quantity_sold, 
				ROUND(p.price, 2) AS price_per_unit_sold, ROUND(p.cost,2) AS amount_owed, md.description AS 'channel'
			FROM manifests m 
				LEFT JOIN products p ON m.manifest_id = p.manifest_id 
				LEFT JOIN product_action_log pa ON p.sku = pa.sku
				LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
				LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
			${whereInfo.clause} 
			AND m.manifest_source = "RBR" 
			AND ir.reason IN ('Sold To Niche')
			AND pa.json LIKE '%inactiveReasonId":"21"%'`;


	var inside1 = mysql.format(sql1, whereInfo.values);
	var inside2 = mysql.format(sql2, whereInfo.values);
	inside2 = inside2.replace(/line_item_date_created/g, 'pa.date_created');
	var sql = `SELECT * FROM ( ${inside1} UNION ALL ${inside2} ) a ORDER BY vendor_id, date_sold`;
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
	var sql = `SELECT temp1.vendor_id, temp1.total_disposal_fees
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
											AND ((p.inactive_reason_id IS NULL) OR (ir.reason NOT IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU')))
											AND p.condition_name = 'Trash' `
									if (vendorId !== undefined) {
										sql += `AND m.vendor_id = '${vendorId}' `;
									}
	
									sql += `AND COALESCE(pal.date_created,p.date_created) >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND COALESCE(pal.date_created,p.date_created) < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
										GROUP BY m.vendor_id
										ORDER BY m.vendor_id, COALESCE(pal.date_created,p.date_created)
									) temp1`;

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
	var sql = `SELECT temp1.vendor_id, temp1.total_quantity_received, temp1.total_processing_fees
								FROM
									(
										SELECT m.vendor_id, 
											SUM(1) AS total_quantity_received, 
											SUM(p.processing_fee) AS total_processing_fees
										FROM manifests m, products p
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
										WHERE m.manifest_id = p.manifest_id
											AND m.manifest_source = "RBR" 
											AND ((p.inactive_reason_id IS NULL) OR (ir.reason NOT IN ('Used Wrong Manifest', 'Manifested Too Many', 'Used Wrong SKU'))) `

									if (vendorId !== undefined) {
										sql += `AND m.vendor_id = '${vendorId}' `;
									}
	
									sql += `AND p.date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND p.date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
										GROUP BY m.vendor_id
										ORDER BY m.vendor_id, p.date_created
									) temp1`;

	// console.log(mysql.format(sql));
	var results = await globals.poolRO.query(sql);

	resp.totals = results;
	colUtils.outboundNaming(resp.totals);


	return resp;

}


exports.getReturnedTotals = async (vendorId, dateStart, dateEnd, resp) => {
	var resp = {
		totals: []
	};
	var sql = `SELECT temp3.vendor_id, temp3.total_sold_price as sp2, temp3.total_credit_amount
								FROM
									(
										SELECT m.vendor_id, 
											SUM(ROUND(i.price*i.quantity,2)) AS total_sold_price, 
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
											AND i.product_type = "sku"  `;
											
										if (vendorId !== undefined) {
											sql += `AND m.vendor_id = '${vendorId}' `;
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



exports.getSoldTotals = async (vendorId, dateStart, dateEnd, resp) => {
	var resp = {
		totals: []
	};
	var sql = `SELECT temp2.vendor_id, temp2.total_quantity_sold, temp2.total_sold_price, temp2.total_amount_owed
								FROM
									(
										SELECT m.vendor_id, 
											i.line_item_date_created AS date_sold,
											SUM(i.quantity) AS total_quantity_sold,
											SUM(ROUND(i.price*i.quantity, 2)) AS total_sold_price, 
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
										GROUP BY vendor_id
										UNION 
										SELECT m.vendor_id, 
											pa.date_created AS date_sold,
											SUM(1) AS total_quantity_sold,
											SUM(ROUND(p.price, 2)) AS total_sold_price,
											SUM(ROUND(p.cost, 2)) AS total_amount_owed
										FROM manifests m 
											LEFT JOIN products p ON m.manifest_id = p.manifest_id 
											LEFT JOIN product_action_log pa ON p.sku = pa.sku
											LEFT JOIN inactive_reasons ir ON p.inactive_reason_id = ir.inactive_reason_id
											LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel'
										WHERE m.manifest_source = "RBR" 
											AND ir.reason IN ('Sold To Niche')
											AND pa.json LIKE '%inactiveReasonId":"21"%' `;

											if (vendorId !== undefined) {
												sql += `AND m.vendor_id = '${vendorId}' `;
											}
											sql += `AND pa.date_created >= '${dateStart.format('YYYY-MM-DD HH:mm:ss')}' AND pa.date_created < '${dateEnd.format('YYYY-MM-DD HH:mm:ss')}'
											GROUP BY vendor_id
											ORDER BY vendor_id, date_sold
								) temp2`;

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