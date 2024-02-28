'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');


exports.getOrdersByEmail = (email, offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}

		var sql = `SELECT o.customer_email, o.order_id, o.source_order_id, o.financial_status, s.store_name, o.source_name, 
										o.order_date_created, o.subtotal_price, o.total_tax, o.total_price 
									FROM orders o LEFT JOIN stores s ON o.store_id = s.store_id 
									WHERE o.customer_email = ? 
										AND o.source_name != 'open_box_platform'
									ORDER BY o.order_date_created DESC 
									LIMIT ?,?`;

		var values = [];
		values.push(email);
		values.push(offset);
		values.push(limit);

		globals.pool.query("SELECT count(*) as num FROM orders WHERE customer_email = ?", [email])
			.then((count) => {
				resp.totalCount = count[0].num;

				return globals.pool.query(sql, values);
			})
			.then((rows) => {
				resp.rows = colUtils.outboundNaming(rows);
				rows.forEach((row) => {
					row.dateCreated = row.orderDateCreated;
					delete row.orderDateCreated;
					row.lineItems = [];
				})
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getLineItemsByOrder = (orderId) => {
	return new Promise((resolve, reject) => {
		var resp = {
			rows: []
		}

		var sql = `SELECT l.order_line_item_id, p.name, p.condition_name, m.manifest_source, p.image, l.line_type, 
										l.product_type, l.sku, l.shopify_product_id, 
										l.quantity, l.total_discount, l.total_tax, l.price, l.line_item_date_created, l.fulfillment_method, 
										l.tracking_company, l.tracking_numbers, l.tracking_urls, l.shipment_status, 
										ls.fulfilled, ls.ship_type, ls.carrier, ls.edd, ls.edd_text 
									FROM orders o LEFT JOIN order_line_items l ON o.order_id = l.order_id 
										LEFT JOIN order_line_static ls ON l.source_line_id = ls.source_line_id
										LEFT JOIN skus k ON l.sku = k.sku 
										LEFT JOIN products p ON k.product_id = p.product_id 
										LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
										WHERE o.order_id = ? 
										ORDER BY l.line_item_date_created`;

		globals.pool.query(sql, [orderId])
			.then((rows) => {
				resp.rows = colUtils.outboundNaming(rows);
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


