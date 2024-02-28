'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');
const cryptoUtils = require('../utils/cryptoUtils');


exports.getKeys = (shopifyStoreId, label) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT info FROM shopify_stores_keys WHERE shopify_store_id = ? AND label = ?", [shopifyStoreId, label])
			.then((rows) => {
				if (rows.length > 0) {
					resolve(JSON.parse(cryptoUtils.decrypt(rows[0].info)));
				}
				else {
					resolve(rows);
				}
			})
			.catch((e) => {
				reject(e);
			})
	});
}




exports.getAll = (label) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT ss.id, shop_name, shop_domain, t.city, t.city_slug, t.id AS city_id, refer_to_url, logo_url, email_list_name, " +
																"info, facebook_url, instagram_url, tidio_url, contact_email, delivery_email, careers_email " +
													"FROM targeted_cities t " + 
															"LEFT JOIN shopify_stores ss ON t.shopify_store_id = ss.id " +
															"LEFT JOIN shopify_stores_keys k ON ss.id = k.shopify_store_id AND label = ? " +
													"WHERE t.shopify_store_id != 0", [label])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getById = (id, label) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT DISTINCT ss.id, ss.shop_name, ss.tidio_url, ss.shop_domain, ss.refer_to_url, t.city, t.logo_url, t.email_list_name, k.info, t.facebook_url, t.instagram_url, t.contact_email, t.delivery_email, t.careers_email " +
													"FROM shopify_stores ss " +
															"LEFT JOIN shopify_stores_keys k ON ss.id = k.shopify_store_id " +
															"LEFT JOIN stores s ON ss.id = s.shopify_store_id " +
															"LEFT JOIN targeted_cities t ON ss.id = t.shopify_store_id " +
													"WHERE label = ? AND ss.id = ? " +
													"GROUP BY ss.id", [label, id])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	}); 
}


exports.storeKeys = (shopifyStoreId, label, keyObj) => {
	return new Promise((resolve, reject) => {
		var conn = null;


		globals.pool.getConnection()
			.then((connection) => {
				conn = connection;

				return conn.query("DELETE FROM shopify_stores_keys WHERE shopify_store_id = ? AND label = ?", [shopifyStoreId, label]);
			})
			.then((results) => {
				var enc = cryptoUtils.encrypt(JSON.stringify(keyObj));
				return conn.query("INSERT INTO shopify_stores_keys (shopify_store_id, label, info) VALUES (?, ?, ?)", [shopifyStoreId, label, enc]);
			})
			.then((results) => {
				if ((results === undefined) || (results === null)) {
					return conn.rollback();
				} else {
					return conn.commit();
				}
			})
			.then(() => {
				resolve();
			})
			.catch((e) => {
				conn.rollback();
				reject(e);
			})
			.finally(() => {
				globals.pool.releaseConnection(conn);
			});
	});
}

