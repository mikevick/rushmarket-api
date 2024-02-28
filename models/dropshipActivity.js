'use strict';

const _ = require('lodash');
const mysql = require('promise-mysql');
const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.getReturned = async (whereInfo, outletWhereInfo, source) => {
	var prom = [];
	var resp = {
		activity: []
	};


	var sql = `SELECT m.vendor_id,
						i.line_item_date_created AS date_returned,
						p.seller_product_id AS manifest_sku,
						p.name,
						i.quantity AS quantity_returned,
						ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2) AS credit_amount, 
						md.description AS 'channel'
					FROM manifests m 
						LEFT JOIN products p ON m.manifest_id = p.manifest_id 
						LEFT JOIN order_line_items i ON i.sku = p.sku 
						LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
						LEFT JOIN orders o ON i.order_id = o.order_id 
						LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel' `;
				if (source) {
					sql += `${outletWhereInfo.clause} `;
				}
				else {
					sql += `${whereInfo.clause} `;
				}

				sql += `
								AND m.manifest_source = "DS"
								AND i.line_type = "return"
								AND i.product_type = "sku"
							ORDER BY m.vendor_id, i.line_item_date_created`;

	console.log(mysql.format(sql, whereInfo.values));
	var results = await globals.poolRO.query(sql, whereInfo.values);

	resp.activity = results;
	colUtils.outboundNaming(resp.activity);


	return resp;
}



exports.getSold = async (whereInfo, outletWhereInfo, source) => {
	var prom = [];
	var resp = {
		activity: []
	};


	//	Get skus that have been purchased and not converted to niche.
	var sql = `
		SELECT m.vendor_id, i.line_item_date_created AS date_sold, p.seller_product_id AS manifest_sku, 
				p.name, i.quantity AS quantity_sold, 
				ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2) AS amount_owed, 
				md.description AS 'channel'
			FROM manifests m 
				LEFT JOIN products p ON m.manifest_id = p.manifest_id 
				LEFT JOIN order_line_items i ON i.sku = p.sku 
				LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
				LEFT JOIN orders o ON i.order_id = o.order_id 
				LEFT JOIN master_data md ON SUBSTRING_INDEX(p.vendor_supplier_code,'-',-1) = md.value AND md.type = 'supplierChannel' `;
			
			if (source) {
				sql += `${outletWhereInfo.clause} `;
			}
			else {
				sql += `${whereInfo.clause} `;
			}

			sql += `
			AND m.manifest_source = "DS" 
			AND i.line_type = "purchase" 
			AND i.product_type = "sku" 
			ORDER BY vendor_id, date_sold `;


	console.log(mysql.format(sql, whereInfo.values));
	var results = await globals.poolRO.query(sql, whereInfo.values);

	resp.activity = results;
	colUtils.outboundNaming(resp.activity);

	return resp;
}



exports.getReturnedTotals = async (vendorId, dateStart, dateEnd, source, outlets, resp) => {
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
											LEFT JOIN order_line_items i ON i.sku = p.sku 
											LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
											LEFT JOIN orders o ON i.order_id = o.order_id 
										WHERE m.manifest_id = p.manifest_id
											AND m.manifest_source = "DS"
											AND i.line_type = "return"
											AND i.product_type = "sku"  `;
											
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

	console.log(mysql.format(sql));
	var results = await globals.poolRO.query(sql);

	resp.totals = results;
	colUtils.outboundNaming(resp.totals);


	return resp;

}



exports.getSoldTotals = async (vendorId, dateStart, dateEnd, source, outlets, resp) => {
	var resp = {
		totals: []
	};
	var sql = `SELECT temp2.vendor_id, SUM(temp2.total_quantity_sold) AS total_quantity_sold, SUM(temp2.total_sold_price) AS otal_sold_price, SUM(temp2.total_amount_owed) AS total_amount_owed
								FROM
									(
										SELECT m.vendor_id, 
											i.line_item_date_created AS date_sold,
											SUM(i.quantity) AS total_quantity_sold,
											SUM(ROUND(i.price*i.quantity, 2)) AS total_sold_price, 
											SUM(ROUND(COALESCE(s.product_cost, p.cost)*i.quantity,2)) AS total_amount_owed
										FROM manifests m
											LEFT JOIN products p ON m.manifest_id = p.manifest_id
											LEFT JOIN order_line_items i ON i.sku = p.sku 
											LEFT JOIN order_line_static s ON ((s.sku = i.sku) AND (i.source_line_id = s.source_line_id))
											LEFT JOIN orders o ON i.order_id = o.order_id 
										WHERE m.manifest_id = p.manifest_id
											AND m.manifest_source = "DS"
											AND i.line_type = "purchase"
											AND i.product_type = "sku" `;

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
										GROUP BY vendor_id 
								) temp2
								GROUP BY vendor_id`;

	console.log(mysql.format(sql));
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
											AND m.manifest_source = "DS" `
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
											AND m.manifest_source = "DS"
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
											AND m.manifest_source = "DS"
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