'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');

exports.getAll = async (storeId) => {
	var sql = "SELECT c.name AS `name`, c.label_name AS label, c.front_end_space AS page, LOWER(REPLACE(REPLACE(REPLACE(c.front_end_space, '&', ''), ' ', '-'), '--', '-')) AS slug, " +
										"c.front_end_name AS collection, LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) AS collection_slug " +
								"FROM products p " +
										"LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) " +
										"LEFT JOIN categories c ON c.category_id = cm.category_id " +
								"WHERE p.store_id = ? " +
										"AND p.status = 'Live' " +
										"AND c.front_end_space IS NOT NULL " +
								"GROUP BY front_end_space, front_end_name " +
								"ORDER BY front_end_space";
	var cats = await globals.poolRO.query(sql, [storeId]);
	colUtils.outboundNaming(cats);
	return cats;
}





exports.getCached = async (storeId) => {

	var rows = await globals.poolRO.query("SELECT json FROM cat_nav_cache WHERE store_id = ?", [storeId]);

	return rows;
}



exports.updateCache = async (storeId, json) => {

	await globals.pool.query("UPDATE cat_nav_cache SET date_modified = now(), json = ? WHERE store_id = ?", [JSON.stringify(json), storeId]);
}

exports.getCategories = async (whereInfo) => {
  let categoriesSql = `SELECT * 
    FROM categories 
    ${whereInfo.clause}`;
  let categoryRows = await globals.poolRO.query(categoriesSql, whereInfo.values);
  colUtils.outboundNaming(categoryRows);
	return categoryRows;
}



exports.getCategoryById = async (categoryId) => {
  let categoriesSql = `SELECT * FROM categories WHERE category_id = ?`;
  let category = await globals.poolRO.query(categoriesSql, categoryId);
	if (category.length > 0) {
  	colUtils.outboundNaming(category);
		category = category[0];
	}
	else {
		category = null;
	}
	return category;
}


exports.getCategoriesByName = async (categoryName) => {
  let categoriesSql = `SELECT * 
    										FROM categories  c 
														LEFT JOIN category_mappings cm ON cm.category_id = c.category_id
												WHERE cm.category_2 = ?`;
  let categoryRows = await globals.poolRO.query(categoriesSql, categoryName);
  colUtils.outboundNaming(categoryRows);
	return categoryRows;
}


exports.storeAverageShipping = async (categoryId, avgShipCost) => {
  let sql = `UPDATE categories SET avg_national_ship_cost = ? WHERE category_id = ?`; 

	let result = await globals.pool.query(sql, [avgShipCost, categoryId]);
	return result;
}

exports.getAllChildren = async () => {
	const result = await globals.poolRO.query(`
		SELECT parent.name AS category_1, child.name AS category_2, child.category_id, child.parent_id
		FROM categories child
					 JOIN categories parent ON parent.category_id = child.parent_id
		WHERE child.parent_id != 0
		ORDER BY parent.name, child.name;`);
	colUtils.outboundNaming(result);
	return result;
}
