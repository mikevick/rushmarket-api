'use strict';

const globals = require('../globals');
const mysql = require('promise-mysql');

const colUtils = require('../utils/columnUtils');


exports.addShopifyCustomers = (customers) => {
	return new Promise((resolve, reject) => {

		var id = globals.mongoid.fetch();

		var values = [];
		for (var i = 0; i < customers.length; i++) {
			var v = [];
			v.push(customers[i].storeId);
			if (customers[i].homeCity === 'homeCity:omaha') {
				v.push(1);
			}
			else if (customers[i].homeCity === 'homeCity:lincoln') {
				v.push(2);
			}
			else {
				v.push(0);
			}
			v.push(customers[i].firstName);
			v.push(customers[i].lastName);
			v.push(customers[i].email.toLowerCase());
			v.push(customers[i].zip);
			v.push(customers[i].verifiedFlag);
			values.push(v);
		}

		globals.pool.query("INSERT INTO member_sync_shopify (store_id, city_id, first_name, last_name, email, zip, verified_flag) " +
				"VALUES ?", [values])
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				console.log(JSON.stringify(values, undefined, 2));
				reject(e);
			})
	});
}



exports.addMailchimpSubscribers = (customers) => {
	return new Promise((resolve, reject) => {

		var id = globals.mongoid.fetch();

		var values = [];
		for (var i = 0; i < customers.length; i++) {
			var v = [customers[i].cityId, customers[i].firstName, customers[i].lastName, customers[i].email.toLowerCase(), customers[i].zip, customers[i].verifiedFlag, customers[i].disposition];
			values.push(v);
		}

		globals.pool.query("INSERT INTO member_sync_mailchimp (city_id, first_name, last_name, email, zip, email_verified_flag, disposition) " +
				"VALUES ?", [values])
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				console.log(JSON.stringify(values, undefined, 2));
				reject(e);
			})
	});
}




exports.deleteMailchimpByShopifyStore = (storeId, disposition) => {
	return new Promise((resolve, reject) => {


		globals.pool.query("DELETE FROM member_sync_mailchimp WHERE city_id = ? AND disposition = ?", [storeId, disposition])
			.then((results) => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.deleteShopifyByShopifyStore = (storeId) => {
	return new Promise((resolve, reject) => {

		globals.pool.query("DELETE FROM member_sync_shopify WHERE store_id = ?", [storeId])
			.then((results) => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getIgnore = (id, discrepancy, detail) => {
	return new Promise((resolve, reject) => {
		var resp = {
			rows: []
		}

		globals.pool.query("SELECT * FROM member_sync_ignore WHERE id = ? AND discrepancy LIKE ? AND detail LIKE ?", [id, discrepancy.trim() + "%", detail.trim() + "%"])
			.then((rows) => {
				// console.log("(" + rows.length + ") - SELECT * FROM member_sync_ignore WHERE id = '" + id + "' AND discrepancy LIKE '" + discrepancy.replace(/'/g, "\\'").trim() + "%' AND detail LIKE '" + detail.replace(/'/g, "\\'").trim() + "%'");
		
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getMailchimpByEmail = (email) => {
	return new Promise((resolve, reject) => {
		var resp = {
			rows: []
		}

		globals.pool.query("SELECT * FROM member_sync_mailchimp WHERE email = ?", [email])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getShopifyByEmail = (email) => {
	return new Promise((resolve, reject) => {
		var resp = {
			rows: []
		}

		globals.pool.query("SELECT * FROM member_sync_shopify WHERE email = ?", [email])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAllWithEmail = (offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}

		globals.pool.query("SELECT m.id, m.date_created, LOWER(m.email) as email, m.status, m.first_name, m.last_name, m.zip, m.email_verification_flag AS emailVerificationFlag, " +
				"m.verified_member_flag AS verifiedMemberFlag, m.home_shopify_store_id, m.home_city_id, m.email_marketing_status " +
				"FROM members AS m " +
				"WHERE ((m.email IS NOT NULL) AND (LENGTH(m.email) > 0)) ORDER BY m.email LIMIT ?, ?", [offset, limit])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getMemberData = () => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}

		var sql = "SELECT m.id, m.status, m.first_name AS mbr_fname, m.last_name AS mbr_lname, LOWER(m.email) AS mbr_email, m.zip AS mbr_zip, m.home_shopify_store_id AS mbr_store_id, m.home_city_id AS mbr_city_id, m.email_marketing_status AS mbr_marketing_status, m.verified_member_flag AS mbr_verified_flag, m.email_verification_flag AS mbr_email_flag, " +
							"ms.first_name AS s_fname, ms.last_name AS s_lname, ms.email AS s_email, ms.zip AS s_zip, ms.store_id as s_store_id, ms.city_id AS s_city_id, ms.verified_flag AS s_verified_flag, " +
							"mm.first_name AS c_fname, mm.last_name AS c_lname, mm.email AS c_email, mm.zip AS c_zip, mm.email_verified_flag AS c_email_flag, mm.disposition AS c_marketing_status, mm.city_id as c_city_id, " +
							"sc.shopify_customer_id " +
							"FROM members m " +
								"LEFT JOIN member_sync_shopify ms ON (m.email = ms.email) " +
								"LEFT JOIN member_sync_mailchimp mm ON (m.email = mm.email) " +
								"LEFT JOIN members_to_shopify_customers sc ON ((sc.member_id = m.id) AND (sc.shopify_store_id = m.home_shopify_store_id)) " +
							"WHERE ((m.email IS NOT NULL) AND (LENGTH(TRIM(m.email)) > 0)) " +
							"ORDER BY m.email";

		console.log(mysql.format(sql));							

		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}




exports.getShopifyCustomersWithEmail = (offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}

		globals.pool.query("SELECT m.id, m.date_created, LOWER(m.email) as email, m.status, m.first_name, m.last_name, m.zip, m.email_verification_flag AS emailVerificationFlag, " +
				"m.verified_member_flag AS verifiedMemberFlag, m.home_shopify_store_id, m.email_marketing_status, " +
				"sc.shopify_customer_id AS sc_customer_id, sc.shopify_store_id as sc_store_id " +
				"FROM members AS m " +
				"LEFT JOIN members_to_shopify_customers AS sc ON (m.id = sc.member_id) " +
				"WHERE ((m.email IS NOT NULL) AND (LENGTH(m.email) > 0)) ORDER BY m.email")
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getMailchimpWithEmail = () => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}

		globals.pool.query("SELECT m.id, m.date_created, LOWER(m.email) as email, m.status, m.first_name, m.last_name, m.zip, m.email_verification_flag AS emailVerificationFlag, " +
				"m.verified_member_flag AS verifiedMemberFlag, m.home_shopify_store_id, m.email_marketing_status, " +
				"c.email AS c_email, c.first_name AS c_first, c.last_name AS c_last, c.zip AS c_zip, c.disposition AS c_disposition, c.email_verified_flag AS c_email_verified_flag, c.store_id AS c_store_id " +
				"FROM members AS m " +
				"LEFT JOIN member_sync_mailchimp AS c ON (m.email = c.email) " +
				"WHERE ((m.email IS NOT NULL) AND (LENGTH(m.email) > 0)) ORDER BY m.email")
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getShopifyWithEmail = () => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}

		globals.pool.query("SELECT m.id, m.date_created, LOWER(m.email) as email, m.status, m.first_name, m.last_name, m.zip, m.email_verification_flag AS emailVerificationFlag, " +
				"m.verified_member_flag AS verifiedMemberFlag, m.home_shopify_store_id, m.home_city_id, m.email_marketing_status, " +
				"s.email AS s_email, s.first_name AS s_first, s.last_name AS s_last, s.zip AS s_zip, s.verified_flag AS s_verified_flag, s.store_id AS s_store_id " +
				"FROM members AS m " +
				"LEFT JOIN member_sync_shopify AS s ON m.email = s.email " +
				"WHERE ((m.email IS NOT NULL) AND (LENGTH(m.email) > 0)) ORDER BY m.email")
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getMutipleListMembers = () => {
	return new Promise((resolve, reject) => {
		var resp = {
			rows: []
		}

		globals.pool.query("SELECT email, COUNT(*) AS num FROM member_sync_mailchimp GROUP BY email HAVING num > 1 ORDER BY num DESC")
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}