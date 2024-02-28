'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');




exports.create = async (promoTypeId, promoName, startDate, endDate, promoScope, pricingTypeId, promoDescription) => {
	var cols = "promo_type_id, promo_name, start_date, end_date, promo_scope";
	var placeholders = "?, ?, ?, ?, ?";
	var values = [promoTypeId, promoName, startDate, endDate, promoScope];

	if (pricingTypeId !== undefined) {
		cols += ", pricing_type_id";
		placeholders += ", ?";
		values.push(pricingTypeId);
	}
	if (promoDescription !== undefined) {
		cols += ", promo_description";
		placeholders += ", ?";
		values.push(promoDescription);
	}

	var results = await globals.pool.query("INSERT INTO promotions (" + cols + ") VALUES (" + placeholders +")", values);
	return results.insertId;
}



exports.createScope = async (promoId, scopeId) => {
	var cols = "promo_id, scope_id";
	var placeholders = "?, ?";
	var values = [promoId, scopeId];

	var results = await globals.pool.query("INSERT INTO promotion_scopes (" + cols + ") VALUES (" + placeholders +")", values);
	return results.insertId;
}



exports.delete = async (promoId) => {
	await globals.pool.query("DELETE FROM promotions WHERE id = ?", [promoId]);
}


exports.deleteScope = async (promoId, scopeId) => {
	await globals.pool.query("DELETE FROM promotion_scopes WHERE promo_id = ? AND id = ?", [promoId, scopeId]);
}


exports.getAll = async (whereInfo, sortBy, offset, limit) => {
	var prom = [];
	var resp = {
		totalCount: 0,
		promotions: []
	};

	var countSql = 'SELECT COUNT(*) AS num ' +
										'FROM promotions p ' +
												'LEFT JOIN promotion_types pt ON p.promo_type_id = pt.id ' + whereInfo.clause;
												
	var sql = 'SELECT p.id, pt.type, p.promo_name, p.promo_description, p.start_date, p.end_date, p.promo_scope, ppt.pricing_type  ' +
												'FROM promotions p ' +
														'LEFT JOIN promotion_types pt ON p.promo_type_id = pt.id ' + 
														'LEFT JOIN product_pricing_types ppt ON p.pricing_type_id = ppt.pricing_type_id ' +
														whereInfo.clause;
		
	if (sortBy !== undefined) {
		sql = sql + ' ORDER BY ' + sortBy;
	}
	if (offset !== undefined) {
		sql = sql + ' LIMIT ' + offset + ',' + limit;
	}

	// console.log(mysql.format(sql, whereInfo.values));
	prom.push(globals.poolRO.query(countSql, whereInfo.values));
	prom.push(globals.poolRO.query(sql, whereInfo.values));

	var results = await Promise.all(prom);

	var count = results[0];
	var rows = results[1];

	resp.totalCount = count[0].num;
	resp.promotions = rows;
	colUtils.outboundNaming(resp.promotions);

	prom = [];
	for (var i=0; i < resp.promotions.length; i++) {
		if (resp.promotions[i].type !== 'PRICING') {
			delete resp.promotions[i].pricingType;
		}
		prom.push(globals.poolRO.query("SELECT * FROM promotion_tiers WHERE promo_id = " + resp.promotions[i].id + " ORDER BY min_qty"));
	}

	results = await Promise.all(prom);

	for (var i=0; i < resp.promotions.length; i++) {
		if (results[i].length > 0) {
			if (results[i].length === 1) {
				resp.promotions[i].minQty = results[i][0].min_qty;
				resp.promotions[i].discountAmount = results[i][0].discount_amount;
			}
			else {
				resp.promotions[i].tiers = [];
				for (var j=0; j < results[i].length; j++) {
					resp.promotions[i].tiers.push({minQty: results[i][j].min_qty, discountAmount: results[i][j].discount_amount});
				}
			}
		}
	}

	return resp;
}


exports.getById = async (promoId) => {
	var prom = [];
	var resp = {
	};

	var sql = 'SELECT p.id, pt.type, p.promo_name, p.promo_description, p.start_date, p.end_date, p.promo_scope, ppt.pricing_type  ' +
												'FROM promotions p ' +
														'LEFT JOIN promotion_types pt ON p.promo_type_id = pt.id ' + 
														'LEFT JOIN product_pricing_types ppt ON p.pricing_type_id = ppt.pricing_type_id ' +
														'WHERE p.id = ?';
		

	var rows = await globals.poolRO.query(sql, [promoId]);

	if (rows.length === 1) {
		resp.promotions = rows;
		colUtils.outboundNaming(resp.promotions);

		prom = [];
		for (var i=0; i < resp.promotions.length; i++) {
			if (resp.promotions[i].type !== 'PRICING') {
				delete resp.promotions[i].pricingType;
			}
			prom.push(globals.poolRO.query("SELECT * FROM promotion_tiers WHERE promo_id = " + resp.promotions[i].id + " ORDER BY min_qty"));
		}
	
		var results = await Promise.all(prom);
	
		for (var i=0; i < resp.promotions.length; i++) {
			if (results[i].length > 0) {
				if (results[i].length === 1) {
					resp.promotions[i].minQty = results[i][0].min_qty;
					resp.promotions[i].discountAmount = results[i][0].discount_amount;
				}
				else {
					resp.promotions[i].tiers = [];
					for (var j=0; j < results[i].length; j++) {
						resp.promotions[i].tiers.push({minQty: results[i][j].min_qty, discountAmount: results[i][j].discount_amount});
					}
				}
			}
		}
	
		resp = resp.promotions[0];
	}
	else {
		resp = undefined;
	}
	return resp;
}



exports.getByName = async (name) => {
	var rows = await globals.poolRO.query("SELECT * FROM promotions WHERE promo_name = ?", [name]);

	if (rows.length > 0) {
		colUtils.outboundNaming(rows);
	}

	return rows;
}



exports.getByNameNotId = async (name, promoId) => {
	var rows = await globals.poolRO.query("SELECT * FROM promotions WHERE promo_name = ? AND id != ?", [name, promoId]);

	if (rows.length > 0) {
		colUtils.outboundNaming(rows);
	}

	return rows;
}



exports.getInScopeMarket = async (promoId) => {
	var sql = "SELECT s.id, s.scope_id as city_id, t.city " +
								"FROM promotion_scopes s " +
										"LEFT JOIN targeted_cities t ON s.scope_id = t.id " +
								"WHERE s.promo_id = " + promoId + " " +
								"ORDER BY city";
	var rows = await globals.poolRO.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getInScopeMember = async (promoId) => {
	var sql = "SELECT s.id, s.scope_id as member_id, m.first_name, m.last_name, m.email " +
								"FROM promotion_scopes s " +
										"LEFT JOIN members m ON s.scope_id = m.id " +
								"WHERE s.promo_id = " + promoId + " " +
								"ORDER BY last_name, first_name";
	var rows = await globals.poolRO.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getScopeById = async (promoId, scopeId) => {
	var rows = await globals.poolRO.query("SELECT * FROM promotion_scopes WHERE promo_id = ? AND scope_id = ?", [promoId, scopeId]);

	if (rows.length > 0) {
		colUtils.outboundNaming(rows);
	}

	return rows;
}





exports.getTiers = async (promoId) => {
	var tiers = await globals.poolRO.query("SELECT * FROM promotion_tiers WHERE promo_id = " + promoId + " ORDER BY min_qty");
	colUtils.outboundNaming(tiers);

	return tiers;
}

exports.getTypes = async () => {
	var types = await globals.poolRO.query("SELECT * FROM promotion_types ORDER BY type");
	colUtils.outboundNaming(types);

	return types;
}


exports.getTypeById = async (id) => {
	var rows = await globals.poolRO.query("SELECT * FROM promotion_types WHERE id = ?", [id]);

	if (rows.length > 0) {
		colUtils.outboundNaming(rows);
	}

	return rows;
}



exports.update = async (promoId, promoTypeId, promoName, startDate, endDate, promoScope, pricingTypeId, promoDescription) => {
	var sql = "UPDATE promotions SET "
	var values = [];

	if (promoTypeId !== undefined) {
		sql += "promo_type_id = ?";
		values.push(promoTypeId);
	}

	if (promoName !== undefined) {
		if (values.length > 0) {
			sql += ", ";
		}
		sql += "promo_name = ?";
		values.push(promoName);
	}
	
	if (startDate !== undefined) {
		if (values.length > 0) {
			sql += ", ";
		}
		sql += "start_date = ?";
		values.push(startDate);
	}

	if (endDate !== undefined) {
		if (values.length > 0) {
			sql += ", ";
		}
		sql += "end_date = ?";
		values.push(endDate);
	}
	
	if (promoScope !== undefined) {
		if (values.length > 0) {
			sql += ", ";
		}
		sql += "promo_scope = ?";
		values.push(promoScope);
	}
	
	if (pricingTypeId !== undefined) {
		if (values.length > 0) {
			sql += ", ";
		}
		sql += "pricing_type_id = ?";
		values.push(pricingTypeId);
	}
	
	if (promoDescription !== undefined) {
		if (values.length > 0) {
			sql += ", ";
		}
		sql += "promo_description = ?";
		values.push(promoDescription);
	}
	
	var results = null;
	if (values.length > 0) {
		sql += " WHERE id = ?";
		values.push(promoId);
		results = await globals.pool.query(sql, values);
	}

	return results;
}



