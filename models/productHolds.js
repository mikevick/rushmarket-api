'use strict';

const globals = require('../globals');
const mysql = require('promise-mysql');

const colUtils = require('../utils/columnUtils');
const configUtils = require('../utils/configUtils');



exports.bumpExpiration = async (holdId, associateId, extendDuration) => {
	var values = [associateId, holdId];
	var result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), expire_time = DATE_ADD(now(), INTERVAL " + extendDuration + " MINUTE), associate_id = ?, extended_flag = true WHERE id = ? AND expire_time > now()", values);
	return result;
}



exports.createMemberHold = async (productId, quantity, store, city, holdDuration, context, sessionId, memberId) => {
	var conn = null;
	var limitedHoldFlag = false;
	var limitedHoldMax = 0;
	var products = [];
	var resp = {
		heldProduct: null,
		quantityType: "ONE_OF_ONE",
		held: {
			heldFlag: false,
			selfHeldFlag: false
		},
		rows: null,
		store: store,
		holdFlag: false
	};
	var rows = undefined;

	var shopperIdField = "member_id";
	var shopperIdValue = memberId;
	var quantityType = null;

	if (sessionId !== undefined) {
		shopperIdField = "session_id";
		shopperIdValue = sessionId;
	}


	try {
		conn = await globals.pool.getConnection();

		quantityType = await typeCheck(conn, productId);
		resp.quantityType = quantityType.type;
		var memberLookup = await lookupMember(conn, memberId, store);

		if (memberLookup.length > 0) {
			memberId = memberLookup[0].id;
			if ((configUtils.get("GEO_SUBSTITUTION_TOGGLE") === "ON") && (quantityType.type === 'ONE_OF_ONE')) {
				await closerVariantsCheck(memberLookup[0].homeCityId, productId, products);
			}
		}


		//	Push the selected variant to the back of the array of like variants.  If we can't get any of the closer ones we'll try and grab it.
		products.push({
			productId: productId
		});


		var id = globals.mongoid.fetch();
		var lockName = productId + '-' + store;

		await conn.beginTransaction();

		var lock = await conn.query("SELECT GET_LOCK(?, 2)", lockName);

		//	Loop over each like variant to find one to grab
		for (var i = 0; i < products.length; i++) {

			resp.heldProduct = products[i].productId;
			resp.city = products[i].originSlug;


			//	See if this variant is already held.
			var held = await previouslyHeldCheck(conn, products[i].productId, store, memberId, sessionId);

			//	If limited check to see if we can hold another
			if ((quantityType.type === 'LIMITED') && ((quantityType.quantity - held.heldQuantity) > 0)) {
				limitedHoldFlag = true;
				limitedHoldMax = (quantityType.quantity - held.heldQuantity);
				if (limitedHoldMax < quantity) {
					quantity = limitedHoldMax;
				}
			}

			if ((quantity === undefined) || (quantity === null) || (quantityType.type === 'ONE_OF_ONE')) {
				quantity = 1;
			}


			//	If this is an unlimited sku we're just going to bump quantity
			if ((quantityType.type === 'UNLIMITED') && held.selfHeldFlag) {
				// console.log(mysql.format("UPDATE product_holds SET quantity = quantity + 1 WHERE id = ?", rows[0].id));
				var result = await conn.query("UPDATE product_holds SET quantity = quantity + ? WHERE id = ?", [quantity, held.selfHeldId])
				resp.holdFlag = true;
				resp.quantityAdded = quantity;
				break;
			}
			//	If this is a limited sku and there are more to be held we're just going to bump quantity
			else if ((quantityType.type === 'LIMITED') && limitedHoldFlag && held.selfHeldFlag) {
				var result = await conn.query("UPDATE product_holds SET quantity = quantity + ? WHERE id = ?", [quantity, held.selfHeldId])
				resp.holdFlag = true;
				resp.quantityAdded = quantity;
				break;
			}
			//	No hold action done.
			else if (((quantityType.type === 'LIMITED') && !limitedHoldFlag) || ((quantityType.type === 'ONE_OF_ONE') && held.heldFlag)) {
				colUtils.outboundNaming(held.rows);
			}
			//	If not already held, hold it!
			else {
				var insertFields = `id, ${shopperIdField}, product_id, store, quantity, quantity_type, city, status, expire_time`;
				var insertPlaceholders = "?, ?, ?, ?, ?, ?, ?, 'ACTIVE', DATE_ADD(now(), INTERVAL " + holdDuration + " MINUTE)";
				var insertValues = [id, shopperIdValue, products[i].productId, store, quantity, quantityType.type, city];
				if (context !== undefined) {
					insertFields += ", context";
					insertPlaceholders += ", ?";
					insertValues.push(context);
				}

				// console.log(mysql.format("INSERT INTO product_holds (" + insertFields + ") VALUES (" + insertPlaceholders + ")", insertValues));
				var result = await conn.query("INSERT INTO product_holds (" + insertFields + ") VALUES (" + insertPlaceholders + ")", insertValues);

				if (products[i].productId !== productId) {
					await conn.query("INSERT INTO product_hold_swaps (member_id, selected_product_id, substituted_product_id) VALUES (?, ?, ?, ?)", [memberId, productId, products[i].productId]);
				}

				resp.holdFlag = true;
				resp.quantityAdded = quantity;
				break;
			}
		}


		await conn.commit();
		await conn.query("SELECT RELEASE_LOCK(?)", lockName);

		if (resp.holdFlag) {
			//	Update expirations on all ACTIVE holds for this member to match latest hold.
			// console.log(mysql.format(`UPDATE product_holds SET expire_time = DATE_ADD(now(), INTERVAL ${holdDuration} MINUTE) WHERE ${shopperIdField} = ? AND product_id != ? AND store = ? and STATUS IN ('ACTIVE', 'INCHECKOUT')`, [shopperIdValue, resp.heldProduct, resp.store]));
			await globals.pool.query(`UPDATE product_holds SET expire_time = DATE_ADD(now(), INTERVAL ${holdDuration} MINUTE) WHERE ${shopperIdField} = ?  AND store = ? and STATUS IN ('ACTIVE', 'INCHECKOUT')`, [shopperIdValue, resp.store]);
		}

		if ((((quantityType.type === 'LIMITED') && !limitedHoldFlag) || (quantityType.type === 'ONE_OF_ONE')) && held.heldFlag) {
			resp.held = held;
		}

		return resp;

	} catch (e) {
		conn.rollback();
		await conn.query("SELECT RELEASE_LOCK(?)", lockName);
		throw (e);
	} finally {
		globals.pool.releaseConnection(conn);
	}

}


var previouslyHeldCheck = async (conn, productId, store, memberId, sessionId) => {
	var result = {
		heldFlag: false,
		heldQuantity: 0,
		rows: [],
		selfHeldId: -1,
		selfHeldFlag: false,
		selfHeldQuantity: 0
	}

	result.rows = await conn.query("SELECT * FROM product_holds WHERE product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", [productId, store]);

	for (var i = 0; i < result.rows.length; i++) {
		result.heldFlag = true;
		result.heldQuantity += result.rows[i].quantity;
		if ((result.rows[i].member_id === memberId) || (result.rows[i].session_id === sessionId)) {
			result.selfHeldId = result.rows[i].id;
			result.selfHeldFlag = true;
			result.selfHeldQuantity += result.rows[i].quantity;
		}
	}

	return result;
}





var closerVariantsCheck = async (homeCityId, productId, products) => {
	products = await getCloserLikeVariants(homeCityId, productId);
}



var lookupMember = async (conn, memberId, store) => {
	if (memberId === null) {
		return [];
	}
	//	Lookup the member ID and home city ID based on shopify customer ID.  Member's home city will be used to determine closer like variants.
	var memberLookup = await conn.query(`SELECT m.id, m.home_city_id
																						FROM members m
																							LEFT JOIN targeted_cities t ON t.shopify_store_id = m.home_city_id
																						WHERE m.id = ?
																							AND t.city_slug = ?`, [memberId, store]);

	colUtils.outboundNaming(memberLookup);
	return memberLookup;
}

//	See if this is a LIMITED or UNLIMITED dropship sku or a plain old one-of-one.
var typeCheck = async (conn, productId) => {
	var type = {
		type: 'ONE_OF_ONE',
		quantity: 1
	}

	var ds = await conn.query(`SELECT sku, shopify_variant_id, manifest_source, dropship_type, limited_quantity, vendor_id, seller_product_id 
																				FROM products p LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
																				WHERE manifest_source = 'DS' AND shopify_variant_id = ?`, [productId]);
	if (ds.length > 0) {
		type.type = ds[0].dropship_type;
		type.quantity = ds[0].limited_quantity;
	}

	return type;
}




exports.createMarketHold = async (associateId, productId, store, city, holdDuration) => {
	var conn = null;
	try {

		conn = await globals.pool.getConnection();
		await conn.beginTransaction();

		var id = globals.mongoid.fetch();
		var lookupValues = [productId, store];

		var lockName = productId + '-' + store;

		var lock = await conn.query("SELECT GET_LOCK(?, 2)", lockName);
		// console.log(new Date() + "lock: " + memberId + " " + Object.values(lock[0])[0]);
		var rows = await conn.query("SELECT * FROM product_holds WHERE product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", lookupValues);
		if (rows.length > 0) {
			colUtils.outboundNaming(rows);
		} else {
			var result = await conn.query("INSERT INTO product_holds (id, associate_id, product_id, store, city, status, expire_time) VALUES (?, ?, ?, ?, ?, 'ACTIVE', DATE_ADD(now(), INTERVAL " + holdDuration + " MINUTE))", [id, associateId, productId, store, city]);

			//	Update expirations on all ACTIVE holds for this member to match latest hold.
			await conn.query("UPDATE product_holds SET expire_time = DATE_ADD(now(), INTERVAL " + holdDuration + " MINUTE) WHERE shopify_customer_id = ? AND product_id != ? AND store = ? and STATUS IN ('ACTIVE', 'INCHECKOUT')", [associateId, productId, store]);
		}

		await conn.commit();

		await conn.query("SELECT RELEASE_LOCK(?)", lockName);
		if (rows.length) {
			return rows;
		} else {
			return;
		}

	} catch (e) {
		conn.rollback();
		await conn.query("SELECT RELEASE_LOCK(?)", lockName);
		throw (e);
	} finally {
		globals.pool.releaseConnection(conn);
	}

}



exports.enterCheckout = async (shopifyCustomerId, productId, store, extendDuration) => {
	var values = [shopifyCustomerId, productId, store];

	//	Bumping expiration even if item already in checkout.
	var result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), status = 'INCHECKOUT', expire_time = DATE_ADD(now(), INTERVAL " + extendDuration + " MINUTE) WHERE shopify_customer_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()", values);
	await globals.pool.query("UPDATE product_holds SET expire_time = DATE_ADD(now(), INTERVAL " + extendDuration + " MINUTE) WHERE shopify_customer_id = ? AND store = ? AND status IN ('INCHECKOUT') AND expire_time > now()", [shopifyCustomerId, store]);
	return result;
}



exports.enterCheckoutByMemberId = async (memberId, productId, store, extendDuration) => {
	var values = [memberId, productId, store];

	//	Bumping expiration even if item already in checkout.
	var result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), status = 'INCHECKOUT', expire_time = DATE_ADD(now(), INTERVAL " + extendDuration + " MINUTE) WHERE member_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()", values);
	await globals.pool.query("UPDATE product_holds SET expire_time = DATE_ADD(now(), INTERVAL " + extendDuration + " MINUTE) WHERE member_id = ? AND store = ? AND status IN ('INCHECKOUT') AND expire_time > now()", [memberId, store]);
	return result;
}



exports.enterCheckoutBySessionId = async (sessionId, productId, store, extendDuration) => {
	var values = [sessionId, productId, store];

	//	Bumping expiration even if item already in checkout.
	var result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), status = 'INCHECKOUT', expire_time = DATE_ADD(now(), INTERVAL " + extendDuration + " MINUTE) WHERE session_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()", values);
	await globals.pool.query("UPDATE product_holds SET expire_time = DATE_ADD(now(), INTERVAL " + extendDuration + " MINUTE) WHERE session_id = ? AND store = ? AND status IN ('INCHECKOUT') AND expire_time > now()", [sessionId, store]);
	return result;
}



exports.getActiveByAssociateStore = async (whereInfo, sortBy) => {
	var sql = mysql.format("SELECT * FROM product_holds " + whereInfo.clause + " AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now() ORDER BY " + sortBy, whereInfo.values);
	var rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getActiveByCustomerStore = async (whereInfo, sortBy) => {
	var sql = mysql.format("SELECT * FROM product_holds " + whereInfo.clause + " AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now() ORDER BY " + sortBy, whereInfo.values);
	var rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getActiveByMemberStore = async (whereInfo, sortBy) => {
	var sql = mysql.format("SELECT * FROM product_holds " + whereInfo.clause + " AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now() ORDER BY " + sortBy, whereInfo.values);
	var rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getActiveByMemberProductStore = async (memberId, productId, store) => {
	var values = [memberId, productId, store];
	var rows = await globals.pool.query("SELECT * FROM product_holds WHERE member_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()", values);
	colUtils.outboundNaming(rows);
	return rows;
}


exports.getActiveBySessionProductStore = async (sessionId, productId, store) => {
	var values = [sessionId, productId, store];
	var rows = await globals.pool.query("SELECT * FROM product_holds WHERE session_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()", values);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getActiveByProductStore = async (whereInfo, sortBy, productId, store) => {
	var sql = mysql.format("SELECT * FROM product_holds h " +
		whereInfo.clause + " AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", whereInfo.values);

	if (productId === undefined) {
		sql = mysql.format("SELECT h.*, CONCAT(CONCAT(m.first_name, ' '), m.last_name) AS member_name, u.user_name, p.name FROM product_holds h " +
			"LEFT JOIN members m ON m.id = h.member_id " +
			"LEFT JOIN users u ON u.user_id = h.associate_id " +
			"LEFT JOIN products p ON h.product_id = p.shopify_variant_id " +
			whereInfo.clause + " AND h.status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now() ORDER BY " + sortBy, whereInfo.values);
	}

	console.log(sql);
	var rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);
	for (var i = 0; i < rows.length; i++) {
		if (rows[i].userName !== null) {
			rows[i].holderName = rows[i].userName;
			rows[i].marketHoldFlag = true;
		} else {
			rows[i].holderName = rows[i].memberName;
			rows[i].marketHoldFlag = false;
		}
	}
	return rows;
}




//	Get count of active holds on any products in the list.
exports.countActiveByProductList = async (productIds) => {
	var rows = await globals.pool.query("SELECT COUNT(*) AS num FROM product_holds h " +
		"WHERE product_id in (" + productIds + ") AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()");
	colUtils.outboundNaming(rows);
	return rows;
}



//	See if there are like variants that are closer to member than the one selected.
var getCloserLikeVariants = async (destCityId, productId) => {
	var alternatives = [];

	// Look up variant added to cart 
	var sql = mysql.format(`SELECT p.sku, p.condition_name, p.price, p.store_id, p.status, p.online_shopping, origin.city as origin_city, origin.city_slug as origin_slug, dest.city as dest_city, dest.city_slug as dest_slug, e.national_ship_cost, m.vendor_id, p.seller_product_id
														FROM products p 
															LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
															LEFT JOIN metro_sku_eligibility e ON e.sku = p.sku
															LEFT JOIN targeted_cities origin ON origin.id = e.origin_city_id
															LEFT JOIN targeted_cities dest ON dest.id = e.dest_city_id
														WHERE shopify_variant_id = ?		
															AND dest_city_id = ?	
															AND condition_name IN ('New', 'Like New')`, [productId, destCityId]);
	// console.log(sql);															
	var rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	if (rows.length > 0) {
		// Look for like skus that might cost less to ship 
		sql = mysql.format(`SELECT p.shopify_variant_id, p.sku, p.condition_name, p.price, p.store_id, p.status, p.online_shopping, origin.city as origin_city, origin.city_slug as origin_slug, dest.city as dest_city, dest.city_slug as dest_slug, e.national_ship_cost 
													FROM products p
															LEFT JOIN metro_sku_eligibility e ON e.sku = p.sku
															LEFT JOIN targeted_cities origin ON origin.id = e.origin_city_id
															LEFT JOIN targeted_cities dest ON dest.id = e.dest_city_id
													WHERE STATUS = 'Live' 
															AND online_shopping = 'Y'
															AND condition_name = ?	
															AND p.price = ?
															AND COALESCE(e.eligibility_override, e.eligibility) != 'NOT_ELIGIBLE'
															AND e.dest_city_id = ?	
															AND national_ship_cost < ?	
															AND seller_product_id IN (
																	SELECT vendor_sku 			/* find all vendor_skus for same coin as sku ATC */
																		FROM coins_to_vskus 
																		WHERE coin_id IN (
																			SELECT coin_id 
																				FROM coins_to_vskus 
																				WHERE vendor_id = ?
																					AND vendor_sku = ?	
																			)
																	) ORDER BY national_ship_cost`, [rows[0].conditionName, rows[0].price, destCityId, rows[0].nationalShipCost, rows[0].vendorId, rows[0].sellerProductId]);
		// console.log(mysql.format(sql, [rows[0].conditionName, rows[0].price, destCityId, rows[0].nationalShipCost, rows[0].vendorId, rows[0].sellerProductId]));															
		rows = await globals.pool.query(sql);
		colUtils.outboundNaming(rows);
		for (var i = 0; i < rows.length; i++) {
			alternatives.push({
				productId: Number(rows[i].shopifyVariantId).toString()
			});
		}
	}

	return alternatives;
}





exports.getInCartByMember = async (memberId) => {
	var sql = `SELECT h.product_id as shopify_variant_id, p.product_id, p.sku, p.online_quick_sale, v.coin_id, pm.id as promo_id, 0 as discount_amount, expire_time as cart_expire,
						h.id as hold_id, h.context, h.product_id , h.store, h.quantity 
					FROM product_holds h 
						LEFT JOIN products p ON p.shopify_variant_id = h.product_id 
						LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
						LEFT JOIN promotion_products pp ON pp.sku = p.sku 
						LEFT JOIN promotions pm ON ((start_date <= NOW()) AND (end_date > NOW()) AND (pm.id = pp.promo_id)) 
						LEFT JOIN coins_to_vskus v ON ((v.vendor_id = m.vendor_id) AND (v.vendor_sku = p.seller_product_id))
					WHERE member_id = ? AND h.status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()
					ORDER BY v.coin_id`;
	var values = [memberId];

	// console.log(mysql.format(sql, values));

	var rows = await globals.pool.query(sql, values);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getInCartBySession = async (sessionId) => {
	var sql = `SELECT h.product_id as shopify_variant_id, p.product_id, p.sku,  p.online_quick_sale, v.coin_id, pm.id as promo_id, 0 as discount_amount, expire_time as cart_expire,
					h.id as hold_id, h.context, h.product_id, h.store, h.quantity 
				FROM product_holds h 
					LEFT JOIN products p ON p.shopify_variant_id = h.product_id 
					LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
					LEFT JOIN promotion_products pp ON pp.sku = p.sku 
					LEFT JOIN promotions pm ON ((start_date <= NOW()) AND (end_date > NOW()) AND (pm.id = pp.promo_id)) 
					LEFT JOIN coins_to_vskus v ON ((v.vendor_id = m.vendor_id) AND (v.vendor_sku = p.seller_product_id))
				WHERE session_id = ? AND h.status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()
				ORDER BY v.coin_id`;
	var values = [sessionId];

	// console.log(mysql.format(sql, values));

	var rows = await globals.pool.query(sql, values);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getCheckoutCartEligibility = async (cityId, cartField, cartId) => {
	var sql = `SELECT h.status, h.member_id, h.product_id, h.context, p.shopify_variant_id, p.sku, e.ship_type, COALESCE(e.eligibility_override, e.eligibility) as eligibility, s.city_id 
							FROM product_holds h 
								LEFT JOIN products p ON p.shopify_variant_id = h.product_id 
								LEFT JOIN metro_sku_eligibility e ON ((e.sku = p.sku) AND (e.dest_city_id = ?))
								LEFT JOIN stores s ON s.store_id = p.store_id
							WHERE ${cartField} = ? AND h.status IN ('ACTIVE', 'INCHECKOUT')`;
	var values = [cityId, cartId];

	// console.log(mysql.format(sql, values));

	var rows = await globals.pool.query(sql, values);
	colUtils.outboundNaming(rows);
	return rows;
}




exports.purchase = async (shopifyCustomerId, productId, store) => {
	var sqlCurrent = "UPDATE product_holds SET date_modified = now(), status = 'PURCHASED' " +
		"WHERE product_id = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()";
	var sqlHistory = "UPDATE product_holds_history SET date_modified = now(), status = 'PURCHASED' " +
		"WHERE product_id = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()";
	var values = [productId.toString()];

	if (store !== undefined) {
		sqlCurrent = sqlCurrent + " AND store = ?"
		sqlHistory = sqlHistory + " AND store = ?"
		values.push(store);
	}

	// console.log(mysql.format(sqlCurrent, values))
	var result = await globals.pool.query(sqlCurrent, values);
	if (result.affectedRows === 0) {
		// console.log(mysql.format(sqlHistory, values))
		result = await globals.pool.query(sqlHistory, values);
	}

	return result;
}


exports.purchaseBySessionId = async (sessionId, productId, store) => {
	var sqlCurrent = "UPDATE product_holds SET date_modified = now(), status = 'PURCHASED' " +
		"WHERE session_id = ? AND product_id = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()";
	var sqlHistory = "UPDATE product_holds_history SET date_modified = now(), status = 'PURCHASED' " +
		"WHERE session_id = ? AND product_id = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()";
	var values = [sessionId, productId];

	if (store !== undefined) {
		sqlCurrent = sqlCurrent + " AND store = ?"
		sqlHistory = sqlHistory + " AND store = ?"
		values.push(store);
	}

	var result = await globals.pool.query(sqlCurrent, values);
	if (result.affectedRows === 0) {
		result = await globals.pool.query(sqlHistory, values);
	}

	return result;
}


exports.purchaseByMemberId = async (memberId, productId, store) => {
	var sqlCurrent = "UPDATE product_holds SET date_modified = now(), status = 'PURCHASED' " +
		"WHERE member_id = ? AND product_id = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()";
	var sqlHistory = "UPDATE product_holds_history SET date_modified = now(), status = 'PURCHASED' " +
		"WHERE member_id = ? AND product_id = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND expire_time > now()";
	var values = [memberId, productId];

	if (store !== undefined) {
		sqlCurrent = sqlCurrent + " AND store = ?"
		sqlHistory = sqlHistory + " AND store = ?"
		values.push(store);
	}

	var result = await globals.pool.query(sqlCurrent, values);
	if (result.affectedRows === 0) {
		result = await globals.pool.query(sqlHistory, values);
	}

	return result;
}


exports.refund = async (shopifyCustomerId, productId, store) => {
	var sqlCurrent = "UPDATE product_holds SET date_modified = now(), status = 'REFUNDED' WHERE shopify_customer_id = ? AND product_id = ? AND status IN ('PURCHASED')";
	var sqlHistory = "UPDATE product_holds_history SET date_modified = now(), status = 'REFUNDED' WHERE shopify_customer_id = ? AND product_id = ? AND status IN ('PURCHASED')";
	if (shopifyCustomerId !== null) {
		shopifyCustomerId = shopifyCustomerId.toString();
	}
	if (productId !== null) {
		productId = productId.toString()
	}
	var values = [shopifyCustomerId, productId];

	if (store !== undefined) {
		sqlCurrent = sqlCurrent + " AND store = ?"
		sqlHistory = sqlHistory + " AND store = ?"
		values.push(store);
	}
	var result = await globals.pool.query(sqlCurrent, values);
	var result = await globals.pool.query(sqlHistory, values);

	return result;
}



exports.releaseActiveHoldByCustomerProductStore = async (shopifyCustomerId, productId, store) => {
	var values = [shopifyCustomerId, productId, store];
	var result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), status = 'RELEASED' WHERE shopify_customer_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", values);
	return result;
}



exports.releaseActiveHoldById = async (id) => {
	var values = [id];
	var result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), status = 'RELEASED' WHERE id = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", values);
	return result;
}



exports.releaseActiveHoldByMemberProductStore = async (memberId, productId, quantity, store) => {
	var result = null;
	var values = [memberId, productId, store];

	if ((quantity === undefined) || (quantity === null)) {
		quantity = 1;
	}

	var active = await globals.pool.query("SELECT * FROM product_holds WHERE member_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", values);
	if (active.length > 0) {
		if (active[0].quantity <= quantity) {
			result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), status = 'RELEASED' WHERE member_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", values);
		}
		else {
			result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), quantity = quantity - ? WHERE member_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", [quantity, memberId, productId, store]);
		}
	}
	return result;
}



exports.releaseActiveHoldBySessionProductStore = async (sessionId, productId, quantity, store) => {
	var result = null;
	var values = [sessionId, productId, store];

	if ((quantity === undefined) || (quantity === null)) {
		quantity = 1;
	}

	var active = await globals.pool.query("SELECT * FROM product_holds WHERE session_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", values);
	if (active.length > 0) {
		if (active[0].quantity <= quantity) {
			result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), status = 'RELEASED' WHERE session_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", values);
		}
		else {
			result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), quantity = quantity - ? WHERE session_id = ? AND product_id = ? AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", [quantity, sessionId, productId, store]);
		}
	}
	return result;
}



exports.releaseActiveHoldByStore = async (store) => {
	var values = [store];
	var result = await globals.pool.query("UPDATE product_holds SET date_modified = now(), status = 'RELEASED' WHERE member_id IS NULL AND associate_id IS NOT NULL AND store = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()", values);
	return result;
}



exports.prune = async () => {
	var conn = null;
	try {

		conn = await globals.pool.getConnection();
		await conn.beginTransaction();

		var lock = await conn.query("SELECT GET_LOCK(?, 2)", 'PH-PRUNE');

		var result = await conn.query("UPDATE product_holds SET date_modified = now(), status = 'EXPIRED' WHERE status = 'ACTIVE' AND expire_time <= now()");
		var result = await conn.query("UPDATE product_holds SET date_modified = now(), status = 'ABANDONED' WHERE status = 'INCHECKOUT' AND expire_time <= now()");

		await conn.commit();

		await conn.query("SELECT RELEASE_LOCK(?)", 'PH-PRUNE');


		return result;

	} catch (e) {
		conn.rollback();
		await conn.query("SELECT RELEASE_LOCK(?)", 'PH-PRUNE');
		throw (e);
	} finally {
		globals.pool.releaseConnection(conn);
	}
}


exports.pruneHistory = async () => {
	var conn = null;
	try {

		conn = await globals.pool.getConnection();
		await conn.beginTransaction();

		var lock = await conn.query("SELECT GET_LOCK(?, 2)", 'PH-PRUNE');

		var result = await conn.query("INSERT INTO product_holds_history SELECT * FROM product_holds WHERE STATUS IN ('ABANDONED', 'EXPIRED', 'PURCHASED', 'RELEASED', 'REFUNDED')");
		await conn.query("DELETE FROM product_holds WHERE STATUS IN ('ABANDONED', 'EXPIRED', 'PURCHASED', 'RELEASED', 'REFUNDED')");

		await conn.commit();

		await conn.query("SELECT RELEASE_LOCK(?)", 'PH-PRUNE');

		return result;

	} catch (e) {
		conn.rollback();
		await conn.query("SELECT RELEASE_LOCK(?)", 'PH-PRUNE');
		throw (e);
	} finally {
		globals.pool.releaseConnection(conn);
	}

}


exports.updateHold = async (holdId, context, quantity) => {
	var values = [];
	var sql = `UPDATE product_holds SET date_modified = now() `;
	if (context !== undefined) {
		values.push(context);
		sql += `, context = ?`;
	}
	if (quantity !== undefined) {
		values.push(quantity);
		sql += `, quantity = ?`;
	}

	values.push(holdId);
	sql += ` WHERE id = ?`;

	if (quantity !== undefined) {
		sql += ` AND unlimited_flag = 1`;
	}
	// console.log(mysql.format(sql, values));
	var result = await globals.pool.query(sql, values);
	return result;
}


exports.updateCustomerHoldByProductId = async (customerId, productId, context, quantity) => {
	var values = [];
	var sql = `UPDATE product_holds SET date_modified = now() `;
	if (context !== undefined) {
		values.push(context);
		sql += `, context = ?`;
	}
	if (quantity !== undefined) {
		values.push(quantity);
		sql += `, quantity = ?`;
	}

	values.push(customerId);
	values.push(productId);
	sql += ` WHERE shopify_customer_id = ? AND product_id = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()`;

	if (quantity !== undefined) {
		sql += ` AND unlimited_flag = 1`;
	}

	// console.log(mysql.format(sql, values));
	var result = await globals.pool.query(sql, values);
	return result;
}


exports.updateMemberHoldByProductId = async (memberId, productId, context) => {
	var values = [];
	var sql = `UPDATE product_holds SET date_modified = now() `;
	if (context !== undefined) {
		values.push(context);
		sql += `, context = ?`;
	}
	values.push(memberId);
	values.push(productId);
	sql += ` WHERE member_id = ? AND product_id = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()`;

	// console.log(mysql.format(sql, values));
	var result = await globals.pool.query(sql, values);
	return result;
}


exports.updateSessionHoldByProductId = async (sessionId, productId, context) => {
	var values = [];
	var sql = `UPDATE product_holds SET date_modified = now() `;
	if (context !== undefined) {
		values.push(context);
		sql += `, context = ?`;
	}

	values.push(sessionId);
	values.push(productId);
	sql += ` WHERE session_id = ? AND product_id = ? AND status IN ('ACTIVE', 'INCHECKOUT') AND  expire_time > now()`;

	// console.log(mysql.format(sql, values));
	var result = await globals.pool.query(sql, values);
	return result;
}



exports.linkCart = async (sessionId, memberId) => {
	var customerId = null;
	var customer = await globals.pool.query("SELECT shopify_customer_id FROM members_to_shopify_customers WHERE member_id = ?", [memberId]);
	if (customer.length > 0) {
		customerId = customer[0].shopify_customer_id;
	}
	var result = await globals.pool.query("UPDATE product_holds SET member_id = ?, shopify_customer_id = ? WHERE session_id = ?", [memberId, customerId, sessionId]);
	return result;
}