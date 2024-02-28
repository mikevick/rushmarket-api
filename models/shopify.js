'use strict';

const globals = require('../globals');

exports.log = (req) => {
	return new Promise((resolve, reject) => {

		if (req.headers['x-customer-import'] != undefined) {
			resolve();
		} else {

			var values = [req.headers['x-shopify-shop-domain'], req.headers['x-shopify-topic'], req.body.id, req.body.email, req.body.accepts_marketing, req.body.created_at, req.body.updated_at,
				req.body.first_name, req.body.last_name, req.body.orders_count, req.body.state, req.body.total_spent,
				req.body.last_order_id, req.body.note, req.body.verified_email, req.body.multipass_identifier, req.body.tax_exempt,
				req.body.phone, req.body.tags, req.body.last_order_name
			];
			globals.logPool.query("INSERT INTO webhook_notifications_shopify (shop_name, event, id, email, accepts_marketing, created_at, updated_at, first_name, last_name, " +
					"orders_count, state, total_spent, last_order_id, note, verified_email, multipass_identifier, tax_exempt, phone, tags, last_order_name) " +
					"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values)
				.then((results) => {
					resolve();
				})
				.catch((e) => {
					reject(e);
				})
		}
	});
}


exports.logOrder = (req) => {
	return new Promise((resolve, reject) => {

		var values = [req.headers['x-shopify-shop-domain'], req.headers['x-shopify-topic'], req.body.id, req.body.email, req.body.created_at, req.body.updated_at,
			req.body.name, req.body.financial_status, JSON.stringify(req.body, undefined, 2)
		];
		globals.logPool.query("INSERT INTO webhook_notifications_shopify_orders (shop_name, event, id, email, created_at, updated_at, name, financial_status, notification) " +
				"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", values)
			.then((results) => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.prune = (days) => {
	return new Promise((resolve, reject) => {

		globals.logPool.query("DELETE FROM webhook_notifications_shopify WHERE date_created <= DATE_SUB(NOW(), INTERVAL " + days + " DAY)")
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.pruneOrders = (days) => {
	return new Promise((resolve, reject) => {

		globals.logPool.query("DELETE FROM webhook_notifications_shopify_orders WHERE date_created <= DATE_SUB(NOW(), INTERVAL " + days + " DAY)")
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}