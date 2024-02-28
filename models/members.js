'use strict';

const bcrypt = require('bcrypt'),
	SALT_WORK_FACTOR = 10;
const moment = require('moment');
const mysql = require('promise-mysql');


const globals = require('../globals');

const colUtils = require('../utils/columnUtils');



var assignMemberAlias = async (conn, memberId) => {
	var alias = null;

	var result = await conn.query("SELECT alias FROM member_aliases WHERE member_id IS NULL ORDER BY date_created LIMIT 0,1");
	if (result.length === 0) {
		throw new Error("No free member aliases.  This should never happen.");
	}

	alias = result[0].alias;

	result = await conn.query("UPDATE member_aliases SET member_id = ? WHERE alias = ?", [memberId, alias]);

	if (result.changedRows != 1) {
		throw new Error("Error assigning alias " + alias + " to member " + memberId);
	}

	return alias;
}



exports.checkVerificationIdHistory = (verificationId) => {
	return new Promise((resolve, reject) => {
		var prom = [];
		var result = null;
		var resp = {
			emailVerificationFlag: 0
		}

		globals.pool.query("SELECT m.id, email_verification_flag FROM members m LEFT JOIN members_verification_ids i ON m.id = i.member_id WHERE i.verification_id = ? OR m.verification_id = ?", [verificationId, verificationId])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.count = () => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			subscribedCount: 0
		}
		globals.pool.query("SELECT count(*) as num FROM members ")
			.then((count) => {
				resp.totalCount = count[0].num;

				return globals.pool.query("SELECT COUNT(*) as num FROM members WHERE email_marketing_status = 'SUBSCRIBED' AND email != ''");
			})
			.then((count) => {
				resp.subscribedCount = count[0].num;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.create = async (status, firstName, lastName, email, password, zip, homeShopifyStoreId, homeCityId, verificationId, verifiedMemberFlag, internalNotes, 
													facebookId, photoUrl, marketingMedium, marketingSource, marketingCampaign, marketingTerm, marketingContent, inStoreFlag, rushInsiderFlag) => {
	try {
		var fbLinkedFlag = (facebookId !== undefined) ? 1 : 0;
		// var verificationFlag = verificationId === null ? true : false;
		var inStore = (inStoreFlag) ? 'Y' : 'N';

		if ((marketingMedium !== undefined) && (marketingMedium !== null) && (marketingMedium.length > 25)) {
			marketingMedium = marketingMedium.substring(0, 25);
		}
		if ((marketingSource !== undefined) && (marketingSource !== null) && (marketingSource.length > 25)) {
			marketingSource = marketingSource.substring(0, 25);
		}
		if ((marketingCampaign !== undefined) && (marketingCampaign !== null) && (marketingCampaign.length > 50)) {
			marketingCampaign = marketingCampaign.substring(0, 50);
		}
		if ((marketingTerm !== undefined) && (marketingTerm !== null) && (marketingTerm.length > 100)) {
			marketingTerm = marketingTerm.substring(0, 100);
		}
		if ((marketingContent !== undefined) && (marketingContent !== null) && (marketingContent.length > 50)) {
			marketingContent = marketingContent.substring(0, 50);
		}

		var id = globals.mongoid.fetch();
		var values = [id, status, firstName, lastName, email, password, zip, homeShopifyStoreId, homeCityId, verificationId, verifiedMemberFlag, internalNotes, 
									facebookId, photoUrl, fbLinkedFlag, marketingMedium, marketingSource, marketingCampaign, marketingTerm, marketingContent, inStore, rushInsiderFlag];

		var conn = await globals.pool.getConnection();
		await conn.beginTransaction();
		await assignMemberAlias(conn, id);
		await conn.query("INSERT INTO members (id, status, first_name, last_name, email, password, zip, home_shopify_store_id, home_city_id, verification_id, verified_member_flag, internal_notes, " +
																						"facebook_id, photo_url, fb_linked_flag, marketing_medium, marketing_source, marketing_campaign, marketing_term, marketing_content, in_store_signup, rush_insider_flag) " +
			"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values);

		await conn.commit();
		return id;
	} catch (e) {
		conn.rollback();
		throw (e);
	} finally {
		globals.pool.releaseConnection(conn);
	};
}



exports.createMemberAlias = (alias) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("INSERT INTO member_aliases (alias) VALUES ('" + alias + "')")
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.createPartialFromShopify = (shopifyShopName, shopifyCustomerId, firstName, lastName, email, zip, verifiedMemberFlag, internalNotes, verificationId) => {
	return new Promise((resolve, reject) => {
		var conn = null;
		var id = globals.mongoid.fetch();
		var prom = [];

		globals.pool.getConnection()
			.then((connection) => {
				conn = connection;
				return conn.beginTransaction();
			})
			.then((results) => {
				return conn.query("SELECT id FROM shopify_stores WHERE shop_name = ?", [shopifyShopName]);
			})
			.then((results) => {
				if (results.length > 0) {

					var memberValues = [id, 'PARTIAL', firstName, lastName, email, zip, verifiedMemberFlag, internalNotes, results[0].id, verificationId];
					prom.push(conn.query("INSERT INTO members (id, status, first_name, last_name, email, zip, verified_member_flag, internal_notes, home_shopify_store_id, verification_id) " +
						"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", memberValues));

					var mapValues = [id, results[0].id, shopifyCustomerId];
					prom.push(conn.query("INSERT INTO members_to_shopify_customers (member_id, shopify_store_id, shopify_customer_id) VALUES (?, ?, ?)", mapValues));

					return Promise.all(prom);
				} else {
					throw new Error("Shop " + shopifyShopName + " could not be looked up.");
				}
			})
			.then((results) => {
				return conn.commit();
			})
			.then((results) => {
				resolve(id);
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



exports.delById = (id) => {
	return new Promise((resolve, reject) => {
		var prom = [];
		var rows = 0;

		globals.pool.query("DELETE FROM members WHERE id = ?", [id])
			.then((r) => {
				rows = r;
				prom.push(globals.pool.query("DELETE FROM members WHERE email = ?", [id]));
				prom.push(globals.pool.query("DELETE FROM members_to_shopify_customers WHERE member_id = ?", [id]));
				return Promise.all(prom);
			})
			.then(() => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.delFindById = async (id, findId) => {
	var memberOrCustomerCol = determineMemberCustomerColumn(id);
	var sql = "DELETE FROM member_finds WHERE " + memberOrCustomerCol + " = ? AND id = ?";

	// console.log(mysql.format(sql, [id, findId]))
	var result = await globals.pool.query(sql, [id, findId]);

	return result;
}


exports.delFinds = async (id, label) => {
	var memberOrCustomerCol = determineMemberCustomerColumn(id);
	var sql = (label !== undefined) ? "DELETE FROM member_finds WHERE " + memberOrCustomerCol + " = ? AND label = ?" : "DELETE FROM member_finds WHERE " + memberOrCustomerCol + " = ?";

	var result = await globals.pool.query(sql, [id, label]);

	return result;
}


exports.getAll = async (whereInfo, sortBy, offset, limit, includeShopifyInfo) => {
	var resp = {
		totalCount: 0,
		rows: []
	}

	var count = await globals.pool.query("SELECT count(*) as num FROM members " + whereInfo.clause, whereInfo.values);
	resp.totalCount = count[0].num;
	whereInfo.values.push(offset);
	whereInfo.values.push(limit);
	var sql = mysql.format("SELECT * FROM members " + whereInfo.clause + " ORDER BY " + sortBy + " LIMIT ?,?", whereInfo.values);
	var rows = await globals.pool.query(sql);

	if (includeShopifyInfo) {
		rows = await populateShopifyCustomerInfo(rows)
	}

	colUtils.outboundNaming(rows);
	resp.rows = rows;
	return resp;
}


exports.getMemberFindById = async (id, findId) => {
	var memberOrCustomerCol = determineMemberCustomerColumn(id);
	var sql = "SELECT * FROM member_finds WHERE " + memberOrCustomerCol + " = ? AND id = ?";

	var rows = await globals.pool.query(sql, [id, findId]);
	colUtils.outboundNaming(rows);
	return rows;
}


exports.getMemberFinds = async (id, store, label, coinId, sortBy) => {
	var sql = "SELECT * FROM member_finds";
	var whereClause = " WHERE ";
	var values = [];

	if ((store !== undefined) && (store !== null)) {
		whereClause += " store = ?";
		values.push(store);
	}

	if (id !== undefined) {
		var memberOrCustomerCol = determineMemberCustomerColumn(id);
		if (values.length > 0) {
			whereClause += " AND ";
		}
		values.push(id);
		whereClause += memberOrCustomerCol + " = ?";
	}

	if (label !== undefined) {
		if (values.length > 0) {
			whereClause += " AND ";
		}
		whereClause += " label = ?";
		values.push(label);
	};

	if (coinId !== undefined) {
		if (values.length > 0) {
			whereClause += " AND ";
		}
		whereClause += " coin_id = ?";
		values.push(coinId);
	};

	if (values.length > 0) {
		sql += whereClause;
	}

	if (sortBy !== undefined) {
		sql += " ORDER BY " + sortBy;
	}

	// console.log(mysql.format(sql, values))
	var rows = await globals.pool.query(sql, values);
	colUtils.outboundNaming(rows);
	return rows;
}


exports.countFindsByCoin = async (coinId) => {
	var sql = "SELECT COUNT(*) AS num FROM member_finds WHERE coin_id = ?";

	var rows = await globals.pool.query(sql, [coinId]);
	colUtils.outboundNaming(rows);
	return rows;
}


exports.countFindsByCoins = async (coins) => {
	var sql = `SELECT coin_id, COUNT(*) AS num FROM member_finds WHERE coin_id IN (${coins}) GROUP BY coin_id`;

	// console.log(mysql.format(sql));
	var rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);
	return rows;
}




exports.getMemberRecentViews = async (id, store, limit, offset) => {
	let resp = {
		totalCount: 0,
		rows: []
	};
	var sqlCount = "SELECT count(*) as num FROM member_recent_views WHERE member_id = ? and store = ? ";
	var values = [id, store];
	var rowCount = await globals.pool.query(sqlCount, values);
	resp.totalCount = rowCount[0].num;

	values.push(limit);
	values.push(offset);
	var sql = "SELECT IF(date_modified > 0, date_modified, date_created) AS recent_view_date, coin_id, store " +
			  "FROM member_recent_views " +
			  "WHERE member_id = ? and store = ? " +
			  " ORDER BY recent_view_date DESC LIMIT ? OFFSET ? ";
	var rows = await globals.pool.query(sql, values);
	colUtils.outboundNaming(rows);
	resp.rows = rows;
	return resp;
}

exports.getMembersToNotify = async (productId, store) => {
	var memberOrCustomerCol = determineMemberCustomerColumn(id);

	//	TODO - JOIN in member data when defined.
	var sql = (label === undefined) ? "SELECT * FROM members WHERE member FROM member_finds WHERE product_id = 	" + memberOrCustomerCol + " = ? AND store = ?" : "SELECT * FROM member_finds WHERE " + memberOrCustomerCol + " = ? AND store = ? AND label = ?";

	if (sortBy !== undefined) {
		sql = sql + " ORDER BY " + sortBy;
	}

	var rows = await globals.pool.query(sql, [id, store, label]);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getShopperByShopifyCustomerId = async (customerId) => {	
	var sql = "SELECT t.id AS member_city_id, t.city AS member_city, t.city_slug AS member_city_slug, tt.id AS hub_city_id, tt.city AS hub_city, tt.city_slug AS hub_city_slug, " +
										"ms.member_display_name as member_store_name, ms.store_id as member_store_id, ms.address as member_store_address, ms.city as member_store_city, ms.state as member_store_state, ms.zip as member_store_zip, ms.type as member_store_type, " +
										"m.* " +
								"FROM members m " +
									"LEFT JOIN targeted_cities t ON t.id = m.home_city_id " +
									"LEFT JOIN shopify_stores ss ON ss.id = m.home_shopify_store_id " + 
									"LEFT JOIN stores s ON ss.primary_store_id = s.store_id " + 
									"LEFT JOIN targeted_cities tt ON tt.id = s.city_id " +
									"LEFT JOIN stores ms ON ((ms.city_id = m.home_city_id) AND (ms.type IN ('PHYSICAL', 'ONLINE'))) " +
								"WHERE m.id IN (SELECT member_id FROM members_to_shopify_customers WHERE shopify_customer_id = ?)";

	var rows = await globals.pool.query(sql, [customerId]);
	colUtils.outboundNaming(rows);
	return rows;
}





var determineMemberCustomerColumn = (id) => {
	var convertedId = Number(id);
	var memberOrCustomerCol = '';

	//	Determine if id is a member id or shopify customer id.
	if (Number.isInteger(convertedId)) {
		memberOrCustomerCol = 'shopify_customer_id';
	} else {
		memberOrCustomerCol = 'member_id';
	}

	return memberOrCustomerCol;
}


var populateShopifyCustomerInfo = async (rows) => {
	var prom = [];

	for (var i = 0; i < rows.length; i++) {
		prom.push(globals.pool.query("SELECT shopify_store_id, shopify_customer_id FROM members_to_shopify_customers WHERE member_id = ?", rows[i].id));
	};

	var shopifyRows = await Promise.all(prom);
	prom = [];

	for (var i = 0; i < rows.length; i++) {
		rows[i].shopifyInfo = [];
		for (var j = 0; j < shopifyRows[i].length; j++) {
			var s = {
				shopifyStoreId: shopifyRows[i][j].shopify_store_id,
				shopifyCustomerId: shopifyRows[i][j].shopify_customer_id
			}

			rows[i].shopifyInfo.push(s);
		}
	}

	return rows;
}


exports.getAllWithEmail = (offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}
		globals.pool.query("SELECT count(*) as num FROM members WHERE ((email IS NOT NULL) AND (LENGTH(email) > 0)) ORDER BY last_name, first_name")
			.then((count) => {
				resp.totalCount = count[0].num;
				return globals.pool.query("SELECT * FROM members WHERE ((email IS NOT NULL) AND (LENGTH(email) > 0)) ORDER BY last_name, first_name LIMIT ?,?", [offset, limit]);
			})
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



exports.getAllWithoutAlias = async () => {
	try {
		var count = 0;

		var conn = await globals.pool.getConnection();
		await conn.beginTransaction();

		var rows = await conn.query("SELECT m.id, a.alias FROM members m LEFT JOIN member_aliases a ON m.id = a.member_id WHERE alias IS NULL LIMIT 0,1000");

		for (var i = 0; i < rows.length; i++) {
			count++;
			await assignMemberAlias(conn, rows[i].id);
		}
		await conn.commit();
		return count;
	} catch (e) {
		conn.rollback();
		throw (e);
	} finally {
		globals.pool.releaseConnection(conn);
	};

}



exports.getByAlias = async (id) => {
	var rows = await globals.pool.query("SELECT member_id FROM member_aliases WHERE alias = ?", [id]);

	if (rows.length === 0) {
		return id;
	} else {
		return rows[0].member_id;
	}
}



exports.getById = async (id, includeShopifyInfo) => {
	var result = null;
	var sql = "SELECT m.*, z.type as member_type, t.city as home_city, a.alias as member_alias FROM members m " +
								"LEFT JOIN targeted_cities t ON m.home_city_id = t.id " +
								"LEFT JOIN member_aliases a ON m.id = a.member_id " +
								"LEFT JOIN zip_to_city z ON m.zip = z.zip " +
								"WHERE m.id = ?";

	var rows = await globals.pool.query(sql, [id]);

	colUtils.outboundNaming(rows);

	rows.forEach((row) => {
		row.emailVerificationFlag = (row.emailVerificationFlag === 1) ? true : false;
		row.verifiedMemberFlag = (row.verifiedMemberFlag === 1) ? true : false;
		row.fbLinkedFlag = (row.fbLinkedFlag === 1) ? true : false;
	});

	if (includeShopifyInfo) {
		rows = await populateShopifyCustomerInfo(rows)
	}

	if ((rows.length > 0) && (includeShopifyInfo !== undefined) && (includeShopifyInfo === true)) {
		rows[0].storeInfo = await exports.populateStoreInfo(rows[0].id);
		rows[0].storeId = rows[0].homeShopifyStoreId;
		rows[0].shopifyStoreId = rows[0].homeShopifyStoreId;
		rows[0].tidioUrl = rows[0].storeInfo.tidioUrl ? rows[0].storeInfo.tidioUrl : null;
	}


	result = rows;

	rows = await globals.pool.query("SELECT description, path FROM shopify_store_previews p LEFT JOIN members m ON m.home_shopify_store_id = p.shopify_store_id WHERE m.id = ?", [id]);
	colUtils.outboundNaming(rows);
	if ((result.length > 0) && (result[0].storeInfo !== undefined)) {
		result[0].storeInfo.previews = [];
		rows.forEach((row) => {
			result[0].storeInfo.previews.push(row);
		});
	}


	return result;
}




exports.getByZip = async (zip) => {
	var result = null;
	var sql = "SELECT m.* FROM members m " +
								"WHERE LEFT(zip, 5) = ?";

	var rows = await globals.poolRO.query(sql, [zip]);

	colUtils.outboundNaming(rows);

	return rows;
}


exports.getOutliersByZip = async (zip) => {
	var result = null;
	var sql = "SELECT m.* FROM members m " +
								"WHERE LEFT(zip, 5) = ? AND status = 'OUTSIDE_GEOGRAPHIC'";

	var rows = await globals.poolRO.query(sql, [zip]);

	colUtils.outboundNaming(rows);

	return rows;
}




exports.populateStoreInfo = async (memberId) => {
	var storeInfo = {};
	var sql = "SELECT tt.city AS hub_city, tt.city_slug AS hub_city_slug, hs.store_id AS hub_city_store_id, ss.id, m.home_shopify_store_id, m.home_city_id, s.shopify_store_id, m.id, m.date_created, m.date_modified, email, STATUS, tester, first_name, last_name, m.zip, " +
	"verified_member_flag, home_shopify_store_id, email_marketing_status, email_verification_flag, fb_linked_flag, photo_url, facebook_id, " +
	"shopify_customer_id, new_email, verification_id, internal_notes, " +
	"t.city AS home_city, t.city_slug AS home_city_slug, ss.id AS storeid, ss.refer_to_url, ss.shop_name, ss.shop_domain, ss.tidio_url, " +
	"t.logo_url, t.facebook_url, t.facebook_pixel_id, t.instagram_url, t.contact_email, t.city_slug, t.email_list_name, " +
	"t.delivery_email, t.careers_email, t.id AS targeted_id, t.shopify_store_id AS targeted_store_id, t.main_content, t.meta_author, t.meta_description, t.meta_robots, t.meta_title, " +
	"s.store_name, s.member_display_name, s.active, s.address, s.city, s.state, s.zip AS store_zip, s.online_available, s.curbside_available, s.lat, s.lng, s.description, s.store_id, s.type " +
	"FROM members m " +
	"LEFT JOIN targeted_cities t ON m.home_city_id = t.id " +
	"LEFT JOIN stores s ON t.id = s.city_id AND (s.type = 'PHYSICAL' OR s.type = 'ONLINE') " +
	"LEFT JOIN shopify_stores ss ON s.shopify_store_id = ss.id " +
	"LEFT JOIN stores hs ON ss.primary_store_id = hs.store_id " + 
	"LEFT JOIN targeted_cities tt ON hs.city_id = tt.id " +
	"WHERE m.id = ?";

	var row = await globals.pool.query(sql, [memberId]);
	if (row.length > 0) {
		storeInfo = {};
		storeInfo.shopify = {};
		storeInfo.store = {};
		storeInfo.targetedCity = {};

		storeInfo.id = row[0].home_shopify_store_id;
		storeInfo.referToUrl = row[0].refer_to_url;
		storeInfo.shopName = row[0].shop_name;
		storeInfo.shopDomain = row[0].shop_domain;
		storeInfo.tidioUrl = row[0].tidio_url;
		storeInfo.shopify.id = row[0].home_shopify_store_id;
		storeInfo.shopify.referToUrl = row[0].refer_to_url;
		storeInfo.shopify.shopName = row[0].shop_name;
		storeInfo.shopify.shopDomain = row[0].shop_domain;
		storeInfo.shopify.tidioUrl = row[0].tidio_url;

		storeInfo.active = row[0].active;
		storeInfo.address = row[0].address;
		storeInfo.city = row[0].city;
		storeInfo.description = row[0].description;
		storeInfo.storeId = row[0].store_id;
		storeInfo.lat = row[0].lat;
		storeInfo.lng = row[0].lng;
		storeInfo.onlineAvailable = row[0].online_available;
		storeInfo.curbsideAvailable = row[0].curbside_available;
		storeInfo.state = row[0].state;
		storeInfo.storeName = row[0].store_name;
		storeInfo.type = row[0].type;
		storeInfo.zip = row[0].store_zip;
		storeInfo.store.active = row[0].active;
		storeInfo.store.address = row[0].address;
		storeInfo.store.city = row[0].city;
		storeInfo.store.description = row[0].description;
		storeInfo.store.id = row[0].store_id;
		storeInfo.store.lat = row[0].lat;
		storeInfo.store.lng = row[0].lng;
		storeInfo.store.onlineAvailable = row[0].online_available;
		storeInfo.store.curbsideAvailable = row[0].curbside_available;
		storeInfo.store.state = row[0].state;
		storeInfo.store.storeName = row[0].store_name;
		storeInfo.store.memberDisplayName = row[0].member_display_name;
		storeInfo.store.type = row[0].type;
		storeInfo.store.zip = row[0].store_zip;

		storeInfo.homeCity = row[0].home_city;
		storeInfo.homeCityId = row[0].home_city_id;

		storeInfo.careersEmail = row[0].careers_email;
		storeInfo.contactEmail = row[0].contact_email;
		storeInfo.deliveryEmail = row[0].delivery_email;
		storeInfo.facebookUrl = row[0].facebook_url;
		storeInfo.instagramUrl = row[0].instagram_url;
		storeInfo.logoUrl = row[0].logo_url;
		storeInfo.targetedCity.careersEmail = row[0].careers_email;
		storeInfo.targetedCity.city = row[0].home_city;
		storeInfo.targetedCity.citySlug = row[0].city_slug;
		storeInfo.targetedCity.hubCity = row[0].hub_city;
		storeInfo.targetedCity.hubCitySlug = row[0].hub_city_slug;
		storeInfo.targetedCity.hubCityStoreId = row[0].hub_city_store_id;
		storeInfo.targetedCity.contactEmail = row[0].contact_email;
		storeInfo.targetedCity.deliveryEmail = row[0].delivery_email;
		storeInfo.targetedCity.emailListName = row[0].email_list_name;
		storeInfo.targetedCity.facebookUrl = row[0].facebook_url;
		storeInfo.targetedCity.facebookPixelId = row[0].facebook_pixel_id;
		storeInfo.targetedCity.id = row[0].targeted_id;
		storeInfo.targetedCity.instagramUrl = row[0].instagram_url;
		storeInfo.targetedCity.logoUrl = row[0].logo_url;
		storeInfo.targetedCity.mainContent = row[0].main_content;
		storeInfo.targetedCity.metaAuthor = row[0].meta_author;
		storeInfo.targetedCity.metaDescription = row[0].meta_description;
		storeInfo.targetedCity.metaRobots = row[0].meta_robots;
		storeInfo.targetedCity.metaTitle = row[0].meta_title;
		storeInfo.targetedCity.storeId = row[0].targeted_store_id;


	}

	return storeInfo;
}


exports.populateStoreInfoByZip = async (zip) => {
	var storeInfo = {};
	var sql = "SELECT tt.city AS hub_city, tt.city_slug AS hub_city_slug, hs.store_id AS hub_city_store_id, ss.id, NULL AS home_shopify_store_id, NULL AS home_city_id, s.shopify_store_id,  " +
	"NULL AS id, NULL AS date_created, NULL AS date_modified, NULL AS email, NULL AS STATUS, NULL AS tester, NULL AS first_name, NULL AS last_name, NULL AS zip, " +
	"NULL AS verified_member_flag, NULL AS home_shopify_store_id, NULL AS email_marketing_status, NULL AS email_verification_flag, NULL AS fb_linked_flag, NULL AS photo_url, NULL AS facebook_id, " +
	"NULL AS shopify_customer_id, NULL AS new_email, NULL AS verification_id, NULL AS internal_notes, " +
	"t.city AS home_city, t.city_slug AS home_city_slug, ss.id AS storeid, ss.refer_to_url, ss.shop_name, ss.shop_domain, ss.tidio_url, " +
	"t.logo_url, t.facebook_url, t.facebook_pixel_id, t.instagram_url, t.contact_email, t.city_slug, t.email_list_name, " +
	"t.delivery_email, t.careers_email, t.id AS targeted_id, t.shopify_store_id AS targeted_store_id, t.main_content, t.meta_author, t.meta_description, t.meta_robots, t.meta_title, " +
	"s.store_name, s.member_display_name, s.active, s.address, s.city, s.state, s.zip AS store_zip, s.online_available, s.curbside_available, s.lat, s.lng, s.description, s.store_id, s.type, " +
	"z.type as member_type " +
	"FROM zip_to_city z " +
	"LEFT JOIN targeted_cities t ON z.city_id = t.id " +
	"LEFT JOIN stores s ON t.id = s.city_id AND (s.type = 'PHYSICAL' OR s.type = 'ONLINE') " +
	"LEFT JOIN shopify_stores ss ON s.shopify_store_id = ss.id " +
	"LEFT JOIN stores hs ON ss.primary_store_id = hs.store_id " +
	"LEFT JOIN targeted_cities tt ON hs.city_id = tt.id " +
	"WHERE z.zip = ?"

	var row = await globals.pool.query(sql, [zip]);
	if (row.length > 0) {
		storeInfo = {};
		storeInfo.shopify = {};
		storeInfo.store = {};
		storeInfo.targetedCity = {};
		storeInfo.zip = {};

		storeInfo.shopify.id = row[0].shopify_store_id;
		storeInfo.shopify.referToUrl = row[0].refer_to_url;
		storeInfo.shopify.shopName = row[0].shop_name;
		storeInfo.shopify.shopDomain = row[0].shop_domain;
		storeInfo.shopify.tidioUrl = row[0].tidio_url;

		storeInfo.store.active = row[0].active;
		storeInfo.store.address = row[0].address;
		storeInfo.store.city = row[0].city;
		storeInfo.store.description = row[0].description;
		storeInfo.store.id = row[0].store_id;
		storeInfo.store.lat = row[0].lat;
		storeInfo.store.lng = row[0].lng;
		storeInfo.store.onlineAvailable = row[0].online_available;
		storeInfo.store.curbsideAvailable = row[0].curbside_available;
		storeInfo.store.state = row[0].state;
		storeInfo.store.storeName = row[0].store_name;
		storeInfo.store.memberDisplayName = row[0].member_display_name;
		storeInfo.store.type = row[0].type;
		storeInfo.store.zip = row[0].store_zip;

		storeInfo.targetedCity.careersEmail = row[0].careers_email;
		storeInfo.targetedCity.city = row[0].home_city;
		storeInfo.targetedCity.citySlug = row[0].city_slug;
		storeInfo.targetedCity.hubCity = row[0].hub_city;
		storeInfo.targetedCity.hubCitySlug = row[0].hub_city_slug;
		storeInfo.targetedCity.hubCityStoreId = row[0].hub_city_store_id;
		storeInfo.targetedCity.contactEmail = row[0].contact_email;
		storeInfo.targetedCity.deliveryEmail = row[0].delivery_email;
		storeInfo.targetedCity.emailListName = row[0].email_list_name;
		storeInfo.targetedCity.facebookUrl = row[0].facebook_url;
		storeInfo.targetedCity.facebookPixelId = row[0].facebook_pixel_id;
		storeInfo.targetedCity.id = row[0].targeted_id;
		storeInfo.targetedCity.instagramUrl = row[0].instagram_url;
		storeInfo.targetedCity.logoUrl = row[0].logo_url;
		storeInfo.targetedCity.mainContent = row[0].main_content;
		storeInfo.targetedCity.metaAuthor = row[0].meta_author;
		storeInfo.targetedCity.metaDescription = row[0].meta_description;
		storeInfo.targetedCity.metaRobots = row[0].meta_robots;
		storeInfo.targetedCity.metaTitle = row[0].meta_title;
		storeInfo.targetedCity.storeId = row[0].targeted_store_id;

		storeInfo.zip.type = row[0].member_type;
	}

	return storeInfo;
}



exports.getByEmail = (email, includeShopifyInfo) => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM members where email = ?";

		if ((includeShopifyInfo != undefined) && (includeShopifyInfo === true)) {
			sql = "SELECT m.id, m.date_created, m.date_modified, email, password, status, first_name, last_name, zip, verified_member_flag, home_city_id, home_shopify_store_id, " +
				"email_marketing_status, email_verification_flag, fb_linked_flag, photo_url, facebook_id, shopify_customer_id, new_email, verification_id, internal_notes, " +
				"t.city, s.id AS storeid, t.logo_url, s.refer_to_url, s.shop_name, s.shop_domain, s.tidio_url, t.facebook_url, t.instagram_url, t.contact_email, t.delivery_email, t.careers_email " +
				"FROM members m " +
				"LEFT JOIN targeted_cities t ON m.home_city_id = t.id " +
				"LEFT JOIN shopify_stores s ON m.home_shopify_store_id = s.id " +
				"WHERE m.email = ?", [email]
		}

		globals.pool.query(sql, [email])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				rows.forEach((row) => {
					row.emailVerificationFlag = (row.emailVerificationFlag === 1) ? true : false;
					row.verifiedMemberFlag = (row.verifiedMemberFlag === 1) ? true : false;
					row.fbLinkedFlag = (row.fbLinkedFlag === 1) ? true : false;

					if (row.shopName != undefined) {
						row.storeInfo = {};
						row.storeInfo.id = row.homeShopifyStoreId;
						row.storeInfo.city = row.city;
						row.storeInfo.logoUrl = row.logoUrl;
						row.storeInfo.tidioUrl = row.tidioUrl;
						row.storeInfo.referToUrl = row.referToUrl;
						row.storeInfo.shopName = row.shopName;
						row.storeInfo.shopDomain = row.shopDomain;
						row.storeInfo.facebookUrl = row.facebookUrl;
						row.storeInfo.instagramUrl = row.instagramUrl;
						row.storeInfo.contactEmail = row.contactEmail;
						row.storeInfo.deliveryEmail = row.deliveryEmail;
						row.storeInfo.careersEmail = row.careersEmail;
						delete row.city;
						delete row.logoUrl;
						delete row.referToUrl;
						delete row.shopName;
						delete row.shopDomain;
						delete row.facebookUrl;
						delete row.instagramUrl;
						delete row.contactEmail;
						delete row.deliveryEmail;
						delete row.careersEmail;
					}
				});
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getByFacebookId = (fbid) => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM members where facebook_id = ?";

		globals.pool.query(sql, [fbid])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				rows.forEach((row) => {
					row.emailVerificationFlag = (row.emailVerificationFlag === 1) ? true : false;
					row.verifiedMemberFlag = (row.verifiedMemberFlag === 1) ? true : false;
					row.fbLinkedFlag = (row.fbLinkedFlag === 1) ? true : false;
				});
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getShopifyCustomerId = (cityInfo, memberId) => {
	return new Promise((resolve, reject) => {

		globals.pool.query("SELECT * FROM members_to_shopify_customers WHERE member_id = ? AND shopify_store_id = ?", [memberId, cityInfo.id])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.updateFindsCustomer = async (memberId, customerId, store) => {
	var sql = "UPDATE member_finds SET shopify_customer_id = ?, store = ? WHERE member_id = ? AND store = 'lincoln'";

	// console.log(mysql.format(sql, [customerId, memberId, store]));
	var result = await globals.pool.query(sql, [customerId, store, memberId]);
	return result;
}



exports.getByShopifyCustomerId = (cityInfo, id) => {
	return new Promise((resolve, reject) => {

		globals.pool.query("SELECT * FROM members WHERE id IN (SELECT member_id FROM members_to_shopify_customers WHERE shopify_store_id = ? AND shopify_customer_id = ?)", [cityInfo.id, id])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getByVerificationId = (verificationId) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM members WHERE verification_id = ?", [verificationId])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getFreeAliases = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT count(*) as num FROM member_aliases WHERE member_id IS NULL")
			.then((count) => {
				resolve(count[0].num);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getLincolnInOmaha = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM members WHERE home_shopify_store_id = 1 AND SUBSTRING(zip, 1, 5) IN (SELECT zip FROM zip_to_city WHERE city = 'Lincoln')";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getLincolnFinds = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT member_id, shopify_customer_id, COUNT(*) AS num FROM member_finds WHERE store = 'lincoln' GROUP BY member_id, shopify_customer_id ORDER BY num DESC";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}




exports.getNational = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM members WHERE home_shopify_store_id = 999";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}




exports.getLincolnInOutliers = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM members WHERE home_shopify_store_id = 0 AND SUBSTRING(zip, 1, 5) IN (SELECT zip FROM zip_to_city WHERE city = 'Lincoln')";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getLincolnMembers = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM members WHERE home_shopify_store_id = 2 ORDER BY date_modified";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getOmahaMembers = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM members WHERE home_shopify_store_id = 1 ORDER BY date_modified";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getLincolnMembersNotInOmaha = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM members WHERE home_shopify_store_id = 2 AND id NOT IN (SELECT member_id FROM members_to_shopify_customers WHERE shopify_store_id = 1) ORDER BY date_created";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getMattMembers = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM members WHERE email like 'mattoma6@rushmarket.com'";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getSlottedOutliers = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM members WHERE home_shopify_store_id != 0 AND SUBSTRING(zip, 1, 5) NOT IN (SELECT zip FROM zip_to_city)";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}





exports.getLinkedShopifyStores = (memberId, sourceStoreId) => {
	return new Promise((resolve, reject) => {
		var values = [];
		var sql = "SELECT * FROM members_to_shopify_customers WHERE member_id = ?";
		values.push(memberId);
		if (sourceStoreId > 0) {
			sql = sql + " AND shopify_store_id != ?";
			values.push(sourceStoreId);
		}
		globals.pool.query(sql, values)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


//
//	Check to see if this member is linked to the shopify store related to the physical store.
//
exports.getLinkedShopifyStoreByPhysStore = (memberId, physStoreId) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT shopify_customer_id FROM members_to_shopify_customers c LEFT JOIN shopify_stores ss ON c.shopify_store_id = ss.id LEFT JOIN stores s ON ss.id = s.shopify_store_id WHERE s.store_id = ? AND c.member_id = ?", [physStoreId, memberId])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.linkMemberToShopifyStore = (memberId, shopifyShopName, shopifyCustomerId) => {
	return new Promise((resolve, reject) => {
		var conn = null;
		var shopId = null;
		var values = [];

		globals.pool.getConnection()
			.then((connection) => {
				conn = connection;
				return conn.beginTransaction();
			})
			.then((results) => {
				return conn.query("SELECT id FROM shopify_stores WHERE shop_name = ?", [shopifyShopName]);
			})
			.then((results) => {
				if (results.length > 0) {
					shopId = results[0].id;
					// return conn.query("DELETE FROM members_to_shopify_customers WHERE member_id = '" + memberId + "' AND shopify_store_id = '" + shopId + "'");
					values = [memberId, shopId, shopifyCustomerId];
					// console.log("insert ignore " + memberId + " " + shopId + " " + shopifyCustomerId + " " + new Date());
					return conn.query("INSERT IGNORE INTO members_to_shopify_customers (member_id, shopify_store_id, shopify_customer_id) VALUES (?, ?, ?)", values);
				} else {
					throw new Error("Shop " + shopifyShopName + " could not be looked up.");
				}
			})
			.then((results) => {
				// console.log("insert id: " + results.insertId);
				return conn.commit();
			})
			.then((results) => {
				resolve(memberId);
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


exports.linkMemberToShopifyStoreByEmail = (email, shopifyShopName, shopifyCustomerId) => {
	return new Promise((resolve, reject) => {
		var conn = null;
		var memberId = null;
		var shopId = null;
		var values = [];

		globals.pool.getConnection()
			.then((connection) => {
				conn = connection;
				return conn.beginTransaction();
			})
			.then((results) => {
				return conn.query("SELECT id FROM members WHERE email = ?", [email]);
			})
			.then((results) => {
				if (results.length > 0) {
					memberId = results[0].id;
					return conn.query("SELECT id FROM shopify_stores WHERE shop_name = ?", [shopifyShopName]);
				} else {
					throw new Error("Update received for non-existent member email: " + email + " " + shopifyShopName + " " + shopifyCustomerId);
				}
			})
			.then((results) => {
				if (results.length > 0) {
					shopId = results[0].id;
					values = [memberId, shopId, shopifyCustomerId];
					// console.log("insert ignore by email " + memberId + " " + shopId + " " + shopifyCustomerId + " " + new Date());
					return conn.query("INSERT IGNORE INTO members_to_shopify_customers (member_id, shopify_store_id, shopify_customer_id) VALUES (?, ?, ?)", values);
					// return conn.query("DELETE FROM members_to_shopify_customers WHERE member_id = '" + memberId + "' AND shopify_store_id = '" + shopId + "'");
				} else {
					throw new Error("Shop " + shopifyShopName + " could not be looked up.");
				}
			})
			.then((results) => {
				// console.log("insert id by email: " + results.insertId);
				return conn.commit();
			})
			.then((results) => {
				resolve(memberId);
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


exports.markEmailVerified = (member, verificationId) => {
	return new Promise((resolve, reject) => {
		var prom = [];
		var result = null;

		exports.updateById(member.id, false, {
				emailVerificationFlag: true,
				verificationId: null
			}, member)
			.then((results) => {
				result = results;

				return globals.pool.query("INSERT INTO members_verification_ids (verification_id, member_id, type) VALUES (?, ?, 'EMAIL')", [verificationId, member.id]);
			})
			.then((results) => {
				resolve(result);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.pruneVerificationIds = (days) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("DELETE FROM members_verification_ids WHERE date_created <= DATE_SUB(NOW(), INTERVAL 90 DAY)")
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.recordVerificationId = (member, verificationId) => {
	return new Promise((resolve, reject) => {
		var result = null;

		globals.pool.query("INSERT INTO members_verification_ids (verification_id, member_id, type) VALUES (?, ?, 'EMAIL')", [verificationId, member.id])
			.then((results) => {
				resolve(result);
			})
			.catch((e) => {
				reject(e);
			})
	});
}





var snapshot = (row) => {
	return new Promise((resolve, reject) => {
		var values = [row.id, row.email, row.status, row.first_name, row.last_name, 
			row.zip, row.password, row.verified_member_flag, row.home_shopify_store_id, row.home_city_id, row.email_marketing_status, 
			row.fb_linked_flag, row.photo_url, row.facebook_id,	row.shopify_customer_id, 
			row.new_email, row.email_verification_flag, row.verification_id, 
			row.marketing_medium, row.marketing_source, row.marketing_campaign, row.marketing_term, row.marketing_content, row.internal_notes
		];
		globals.pool.query("INSERT INTO members_log (id, email, status, first_name, last_name, " +
				"zip, password, verified_member_flag, home_shopify_store_id, home_city_id, email_marketing_status, " +
				"fb_linked_flag, photo_url, facebook_id, shopify_customer_id, " +
				"new_email, email_verification_flag, verification_id, " +
				"marketing_medium, marketing_source, marketing_campaign, marketing_term, marketing_content, internal_notes) " +
				"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values)
			.then(() => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.snapshotMemberByEmail = (email) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM members WHERE email = ?", [email])
			.then((rows) => {
				if (rows.length === 0) {
					return;
				} else {
					return snapshot(rows[0]);
				}
			})
			.then(() => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.snapshotMemberById = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM members WHERE id = ?", [id])
			.then((rows) => {
				if (rows.length === 0) {
					return;
				} else {
					return snapshot(rows[0]);
				}
			})
			.then(() => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.snapshotMemberByShopifyId = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM members WHERE shopify_customer_id = ?", [id])
			.then((rows) => {
				if (rows.length === 0) {
					return;
				} else {
					return snapshot(rows[0]);
				}
			})
			.then(() => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.storeFindByMember = async (store, memberOrCustomerId, label, coinId, sortOrder) => {
	var convertedId = Number(memberOrCustomerId);
	var id = globals.mongoid.fetch();
	var memberId = null;
	var prom = [];
	var resp = {
		id: id,
		findsCount: 0
	}
	var result = null;
	var shopifyCustomerId = null;


	//	Determine if id is a member id or shopify customer id and look up the other.
	if (Number.isInteger(convertedId)) {
		shopifyCustomerId = memberOrCustomerId;
		result = await globals.pool.query("SELECT member_id FROM members_to_shopify_customers sc LEFT JOIN shopify_stores s ON s.id = sc.shopify_store_id WHERE shopify_customer_id = ?", [shopifyCustomerId, store]);
		if (result.length > 0) {
			memberId = result[0].member_id;
		}
	} else {
		memberId = memberOrCustomerId;
		result = await globals.pool.query("SELECT shopify_customer_id FROM members_to_shopify_customers sc LEFT JOIN shopify_stores s ON s.id = sc.shopify_store_id WHERE member_id = ?", [memberId, store]);
		if (result.length > 0) {
			shopifyCustomerId = result[0].shopify_customer_id;
		}
	}


	//	Let's see if this product is already in finds with the same label for the same member while also getting a count of finds held by this member.
	if (memberId === null) {
		result = await globals.pool.query("SELECT * FROM member_finds WHERE store = ? AND shopify_customer_id = ?", [store, shopifyCustomerId]);
	} else {
		result = await globals.pool.query("SELECT * FROM member_finds WHERE store = ? AND member_id = ?", [store, memberId]);
	}
	var found = false;
	for (var i = 0; i < result.length; i++) {
		if ((result[i].label === label) && (result[i].coin_id === coinId)) {
			found = true;
		}
	}

	if (!found) {
		resp.id = id;
		resp.findsCount = result.length + 1;
		result = await globals.pool.query("INSERT INTO member_finds (id, shopify_customer_id, member_id, label, coin_id, sort_order, store) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, shopifyCustomerId, memberId, label, coinId.toUpperCase(), sortOrder, store]);
		return resp;
	} else {
		resp.id = undefined;
		resp.findsCount = result.length;
		return resp;
	}
}

exports.createRecentViewByMember = async (memberId, store, coinId) => {
	let id = globals.mongoid.fetch();
	let resp = {
		id: id,
	}
	
	//	Let's see if this product is already in recent views for this member.
	let sql = "SELECT * FROM member_recent_views WHERE member_id = ? AND store = ? AND coin_id = ?";
	let values = [memberId, store, coinId];
	let result = await globals.pool.query(sql, values);

	
	if (result.length > 0) {
		//This is already in recent views, so we just want to update the modified date:
		let sqlUpdate = "UPDATE member_recent_views SET date_modified = NOW() WHERE member_id = ? AND store = ? AND coin_id = ?";
		let resultUpdate = await globals.pool.query(sqlUpdate, values);
		resp.id = undefined;
	} else {
		//This is a new view:
		let sqlInsert = "INSERT INTO member_recent_views (id, member_id, store, coin_id) VALUES (?,?,?,?)"
		let valuesInsert = [id, memberId, store, coinId];
		let resultInsert = await globals.pool.query(sqlInsert, valuesInsert);
		resp.id = id
	}
	return resp;
}

exports.updateById = (id, internalFlag, body, original, validationErrors) => {
	return new Promise((resolve, reject) => {
		var result = {
			reverifyFlag: false,
			updateFlag: false
		}
		var sql = "UPDATE members SET date_modified = now()";
		var updatingVerified = false;
		var values = [];

		//
		//	Build sets SQL
		//
		if ((body.email !== undefined) && (body.email !== null) && (body.email !== original.email)) {
			sql = sql + ", email = ?, new_email = null";
			values.push(body.email);
			// if (body.updatingEmailFlag === undefined) {
			// 	sql = sql + ", email_verification_flag = false";
			// 	result.reverifyFlag = true;
			// }
			result.updateFlag = true;
		}

		if ((body.newEmail !== undefined) && (body.newEmail !== null) && (body.newEmail !== original.email)) {
			sql = sql + ", new_email = ?";
			values.push(body.newEmail);
			result.reverifyFlag = true;
			result.updateFlag = true;
		}

		if ((body.verificationId !== undefined) && (body.verificationId !== null)) {
			sql = sql + ", verification_id = ?";
			values.push(body.verificationId);
			result.updateFlag = true;
		} else if (body.verificationId === null) {
			sql = sql + ", verification_id = null";
			result.updateFlag = true;
		}

		if ((body.password !== undefined) && (body.password !== null)) {
			var hash = bcrypt.hashSync(body.password, SALT_WORK_FACTOR);
			sql = sql + ", password = ?";
			values.push(hash);
			result.updateFlag = true;
		}

		if ((body.emailVerificationFlag !== undefined) && (body.emailVerificationFlag !== null)) {
			sql = sql + ", email_verification_flag = ?";
			values.push(body.emailVerificationFlag);
			result.updateFlag = true;
		}

		if ((body.verifiedMemberFlag !== undefined) && (body.verifiedMemberFlag !== null) && (body.verifiedMemberFlag !== original.verifiedMemberFlag)) {
			sql = sql + ", verified_member_flag = ?";
			values.push(body.verifiedMemberFlag);
			result.updateFlag = true;
			updatingVerified = true;
		}

		if ((body.fbLinkedFlag !== undefined) && (body.fbLibkedFlag !== null)) {
			sql = sql + ", fb_linked_flag = ?";
			values.push(body.fbLinkedFlag);
			result.updateFlag = true;
		}

		if (internalFlag && (body.status !== undefined) && (body.status !== null)) {
			sql = sql + ", status = ?";
			values.push(body.status);
			result.updateFlag = true;
		}

		if (internalFlag && (body.internalNotes === null)) {
			sql = sql + ", internal_notes = null";
			result.updateFlag = true;
		} else if (internalFlag && (body.internalNotes !== undefined) && (body.internalNotes !== null)) {
			sql = sql + ", internal_notes = ?";
			values.push(body.internalNotes);
			result.updateFlag = true;
		}

		if (internalFlag && (body.emailMarketingStatus !== undefined) && (body.emailMarketingStatus !== null)) {
			sql = sql + ", email_marketing_status = ?";
			values.push(body.emailMarketingStatus);
			result.updateFlag = true;
		}

		if (internalFlag && (body.homeShopifyStoreId !== undefined) && (body.homeShopifyStoreId !== null)) {
			sql = sql + ", home_shopify_store_id = ?";
			values.push(body.homeShopifyStoreId);
			result.updateFlag = true;
		}

		if (internalFlag && (body.homeCityId !== undefined) && (body.homeCityId !== null)) {
			sql = sql + ", home_city_id = ?";
			values.push(body.homeCityId);
			result.updateFlag = true;
		}

		if ((body.zip !== undefined) && (body.zip !== null) && (body.zip !== original.zip)) {
			sql = sql + ", zip = ?";
			values.push(body.zip);
			result.updateFlag = true;
		}

		if ((body.facebookId === null)) {
			sql = sql + ", facebook_id = null";
			result.updateFlag = true;
		} else if (body.facebookId !== undefined) {
			sql = sql + ", facebook_id = ?";
			values.push(body.facebookId);
			result.updateFlag = true;
		}

		if ((body.firstName !== undefined) && (body.firstName !== null) && (body.firstName !== original.firstName)) {
			sql = sql + ", first_name = ?";
			values.push(body.firstName);
			result.updateFlag = true;
		}

		if ((body.lastName !== undefined) && (body.lastName !== null) && (body.lastName !== original.lastName)) {
			sql = sql + ", last_name = ?";
			values.push(body.lastName);
			result.updateFlag = true;
		}

		if ((body.photoUrl === null) && (body.photoUrl !== original.photoUrl)) {
			sql = sql + ", photo_url = null";
			result.updateFlag = true;
		} else if (body.photoUrl !== undefined) {
			sql = sql + ", photo_url = ?";
			values.push(body.photoUrl);
			result.updateFlag = true;
		}

		if ((body.marketingMedium === null) && (body.marketingMedium !== original.marketingMedium)) {
			sql = sql + ", marketing_medium = null";
			result.updateFlag = true;
		} else if (body.marketingMedium !== undefined) {
			sql = sql + ", marketing_medium = ?";
			values.push(body.marketingMedium);
			result.updateFlag = true;
		}

		if ((body.marketingSource === null) && (body.marketingSource !== original.marketingSource)) {
			sql = sql + ", marketing_source = null";
			result.updateFlag = true;
		} else if (body.marketingSource !== undefined) {
			sql = sql + ", marketing_source = ?";
			values.push(body.marketingSource);
			result.updateFlag = true;
		}

		if ((body.marketingCampaign === null) && (body.marketingCampaign !== original.marketingCampaign)) {
			sql = sql + ", marketing_campaign = null";
			result.updateFlag = true;
		} else if (body.marketingCampaign !== undefined) {
			sql = sql + ", marketing_campaign = ?";
			values.push(body.marketingCampaign);
			result.updateFlag = true;
		}

		if ((body.marketingTerm === null) && (body.marketingTerm !== original.marketingTerm)) {
			sql = sql + ", marketing_term = null";
			result.updateFlag = true;
		} else if (body.marketingTerm !== undefined) {
			sql = sql + ", marketing_term = ?";
			values.push(body.marketingTerm);
			result.updateFlag = true;
		}
		
		if ((body.marketingContent === null) && (body.marketingContent !== original.marketingContent)) {
			sql = sql + ", marketing_content = null";
			result.updateFlag = true;
		} else if (body.marketingContent !== undefined) {
			sql = sql + ", marketing_content = ?";
			values.push(body.marketingContent);
			result.updateFlag = true;
		}
		
		if (validationErrors === null) {
			sql = sql + ", internal_notes = null";
			result.updateFlag = true;
		} else if (validationErrors !== undefined) {
			sql = sql + ", internal_notes = ?";
			values.push(validationErrors.message);
		}

		if (!result.updateFlag) {
			resolve(result);
		} else {
			// console.log("Upating by id: " + sql);
			exports.snapshotMemberById(id)
				.then(() => {
					//
					//	If we're updating the verified_member_flag, update in check_ins table as well.
					//
					if (updatingVerified) {
						var e = original.email;
						if (body.email != undefined) {
							e = body.email;
						}
						if (body.verifiedMemberFlag) {
							return globals.pool.query("UPDATE customer_check_in SET verified = 'Y' WHERE email = ?", [e]);
						} else {
							return globals.pool.query("UPDATE customer_check_in SET verified = 'N' WHERE email = ?", [e]);
						}
					}
					return;
				})
				.then(() => {
					values.push(id);
					var theSql = mysql.format(sql + " WHERE id = ?", values)
					return globals.pool.query(theSql);
				})
				.then((rows) => {
					resolve(result);
				})
				.catch((e) => {
					reject(e);
				})
		}
	});
}


exports.updateEmailMarketingStatusByEmail = (email, status) => {
	return new Promise((resolve, reject) => {
		exports.snapshotMemberByEmail(email)
			.then(() => {
				return globals.pool.query("UPDATE members SET date_modified = now(), email_marketing_status = ? WHERE email = ?", [status, email]);
			})
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.updateFindById = async (id, findId, label, sortOrder) => {
	var memberOrCustomerCol = determineMemberCustomerColumn(id);
	var result = undefined;
	var set = " ";
	var values = [];

	if (label !== undefined) {
		set = set + "label = ?";
		values.push(label);
	}
	if (sortOrder !== undefined) {
		if (set.length > 1) {
			set += ", ";
		}
		set = set + "sort_order = ?";
		values.push(sortOrder);
	}

	if (set.length > 1) {
		values.push(id);
		values.push(findId);
		var sql = "UPDATE member_finds SET date_modified = now(), " + set + " WHERE " + memberOrCustomerCol + " = ? AND id = ?";

		result = await globals.pool.query(sql, values);
	}

	return result;
}






// exports.updatePartialFromShopify = (shopifyCustomerId, firstName, lastName, email, zip, verifiedMemberFlag, internalNotes) => {
// 	return new Promise((resolve, reject) => {

// 		var id = globals.mongoid.fetch();
// 		var sql = "UPDATE members SET first_name = '" + firstName + "', last_name = '" + lastName + "', email = '" + email + "', zip = '" + zip + "', verified_member_flag = " + verifiedMemberFlag + ", internal_notes = '" + internalNotes + "' WHERE shopify_customer_id = '" + shopifyCustomerId + "'";
// 		exports.snapshotMemberByShopifyId(shopifyCustomerId)
// 			.then(() => {
// 				return globals.pool.query(sql);
// 			})
// 			.then((rows) => {
// 				resolve(rows);
// 			})
// 			.catch((e) => {
// 				comms.sendEmail('matt@rushmarket.com', 'Possible Bad SQL', sql);
// 				reject(e);
// 			})
// 	});
// }




//
//	Used for one-time import of shopify export.
//
exports.updateDateCreatedByEmail = (email, dateCreated) => {
	return new Promise((resolve, reject) => {
		var sql = "UPDATE members SET date_created = ? WHERE email = ?";
		globals.pool.query(sql, [moment(dateCreated).format('YYYY-MM-DD HH:mm:ss'), email])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}





//
//	Used for one-time import of shopify export.
//
exports.updateShopfiyIdById = (id, sid) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("UPDATE members SET shopify_customer_id = ? WHERE id = ?", [sid, id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


//
//	Used for one-time import of shopify export.
//
exports.updateShopifyIdByEmail = (email, firstName, lastName, sid) => {
	return new Promise((resolve, reject) => {
		var values = [];
		var sql = "UPDATE members SET shopify_customer_id = ? WHERE email = ? AND first_name = ? AND last_name = ?";
		values.push(sid);
		values.push(email);
		values.push(firstName);
		values.push(lastName);

		if (email === 'null') {
			values = [];
			sql = "UPDATE members SET shopify_customer_id = ? WHERE email = '' AND first_name = ? AND last_name = ?";
			values.push(sid);
			values.push(firstName);
			values.push(lastName);
		}
		globals.pool.query(sql, values)
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.updateVerificationIdById = (id, vid) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("UPDATE members SET date_modified = now(), verification_id = ? WHERE id = ?", [vid, id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getHomeShopifyCustomerId = async (member) => {
	var rows = await	globals.pool.query("SELECT shopify_customer_id FROM members_to_shopify_customers WHERE member_id = ? AND shopify_store_id = ?", [member.id, member.homeShopifyStoreId]);
	if (rows.length > 0) {
		colUtils.outboundNaming(rows);
		return rows[0].shopifyCustomerId;
	}
	else {
		return null;
	}
}


exports.getMemberIdForMarket = async (market) => {
	var rows = await	globals.pool.query("SELECT m.id  " +
																					"FROM members m " +
																							"LEFT JOIN targeted_cities t ON m.home_city_id = t.id " +
																							"LEFT JOIN stores s ON s.city_id = t.id " +
																					"WHERE m.status = 'ACTIVE' AND t.city_slug = ? " +
																					"LIMIT 0,1", [market]);

	if (rows.length > 0) {
		return rows[0].id;
	}
	else{
		return undefined;
	}
}


exports.logMarketingAttribution = async (memberId, marketingMedium, marketingSource, marketingCampaign,	marketingTerm, marketingContent) => {

	var results = await	globals.pool.query("INSERT INTO marketing_attribution_log (member_id, marketing_medium, marketing_source, marketing_campaign, marketing_term, marketing_content) " +
							" VALUES (?, ?, ?, ?, ?, ?)", [memberId, marketingMedium, marketingSource, marketingCampaign, marketingTerm, marketingContent]);
	return results.insertId;
}



exports.getMarketingAttribution = async (memberId, offset, limit) => {
	var resp = {
		totalCount: 0,
		rows: []
	}

	var count = await globals.pool.query("SELECT COUNT(*) AS num FROM marketing_attribution_log WHERE member_id = ?", [memberId]);
	var rows = await	globals.pool.query("SELECT * FROM marketing_attribution_log WHERE member_id = ? ORDER BY date_created DESC LIMIT ?,?", [memberId, offset, limit]);
	colUtils.outboundNaming(rows);

	resp.rows = rows;
	if (count.length > 0) {
		resp.totalCount = count[0].num;
	}
	
	return resp;
}



//	This query finds all members who seem mis-slotted based on their zip code and their current home city.   It ignores
//	mis-slotted members who should be moved to a new home city if that new home city doesn't have a shoppable expierence.
exports.getMisSlotted = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT tn.id as new_id, tn.city AS new_city, tc.id as current_id, tc.city AS current_city, m.email, m.id as member_id, m.zip " +
										"FROM members m " +
												"LEFT JOIN zip_to_city z ON m.zip = z.zip " +
												"LEFT JOIN targeted_cities tc ON tc.id = m.home_city_id " +
												"LEFT JOIN targeted_cities tn ON (tn.id = z.city_id) " +
										"WHERE z.city_id != tc.id " +
												"AND m.email IS NOT NULL AND TRIM(m.email) != '' " +
												"AND tn.id IN (	" +
														"SELECT id " +
																"FROM targeted_cities t	" +
																		"LEFT JOIN stores s ON s.city_id = t.id " +
																"WHERE (s.active = 'Y') AND ((s.type = 'PHYSICAL') OR ((s.type = 'ONLINE') AND (s.online_available = 'Y'))) " +
																"GROUP BY id	" +
												") " +
										"ORDER BY current_city, new_city, email";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getMisSlottedSummary = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT tc.id AS current_id, tc.city AS current_city, tn.id AS new_id,  tn.city AS new_city, COUNT(*) as num " +
										"FROM members m " +
												"LEFT JOIN zip_to_city z ON m.zip = z.zip " +
												"LEFT JOIN targeted_cities tc ON tc.id = m.home_city_id " +
												"LEFT JOIN targeted_cities tn ON (tn.id = z.city_id) " +
										"WHERE z.city_id != tc.id " +
												"AND m.email IS NOT NULL AND TRIM(m.email) != '' " +
												"AND tn.id IN ( " +
														"SELECT id " +
																"FROM targeted_cities t	" +
																			"LEFT JOIN stores s ON s.city_id = t.id " +
																"WHERE (s.active = 'Y') AND ((s.type = 'PHYSICAL') OR ((s.type = 'ONLINE') AND (s.online_available = 'Y'))) " +
														"GROUP BY id	" +
												") " +
										"GROUP BY tn.id, tc.id " +
										"ORDER BY current_city, new_city";
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getMemberByEmail = (email) => {
	// add member alias to match getById?
	// SELECT ... a.alias as member_alias
	// LEFT JOIN member_aliases a ON m.id = a.member_id
	return globals.poolRO.query(`
		SELECT m.*, z.type as member_type, t.city as home_city
		FROM members m
		LEFT JOIN targeted_cities t ON m.home_city_id = t.id
		LEFT JOIN zip_to_city z ON m.zip = z.zip
		WHERE m.email = ?
		ORDER BY last_name, first_name
		LIMIT 1`, [email])
		.then(rows => colUtils.outboundNaming(rows))
		.then(rows => rows?.[0]);
}
