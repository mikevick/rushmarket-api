'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



//
// Global Taxonomy Cache 
//
exports.getCached = async () => {

	var rows = await globals.poolRO.query("SELECT json FROM taxonomy_cache");

	return rows;
}



exports.updateTaxonomyCache = async (json) => {
	await globals.pool.query("UPDATE taxonomy_cache SET date_modified = now(), json = ?", [JSON.stringify(json)]);
}

exports.createTaxonomyCache = async (json) => {
	await globals.pool.query("INSERT INTO taxonomy_cache (date_modified, json) values (now(), ?)", [JSON.stringify(json)]);
}


//
// Area specific Taxonomy Cache with Products embedded
//
// exports.getCachedTaxonomyProducts = async (memberId) => {
//   var sql = "SELECT json " +
//             "FROM taxonomy_product_cache t " +
//             "LEFT JOIN members m ON m.home_city_id = t.targeted_cities_id AND m.home_shopify_store_id = t.shopify_store_id " + 
//             "WHERE m.id = ?"
//   var values = [];
//   values.push(memberId);
// 	var rows = await globals.poolRO.query(sql, values);

// 	return rows;
// }

exports.getCachedTaxonomyProductsByCategory = async (categorySlug, memberId) => {
  var sql = "SELECT json " +
            "FROM taxonomy_product_cache t " +
            "LEFT JOIN members m ON m.home_city_id = t.targeted_cities_id AND m.home_shopify_store_id = t.shopify_store_id " + 
            "WHERE category_slug = ? " +
            "AND m.id = ?"
  var values = [];
  values.push(categorySlug);
  values.push(memberId);
	var rows = await globals.poolRO.query(sql, values);

	return rows;
}

exports.updateTaxonomyProductCache = async (targetCitiesId, shopifyStoreId, categorySlug, json) => {
	await globals.pool.query("UPDATE taxonomy_product_cache SET date_modified = now(), json = ? WHERE targeted_cities_id = ? AND shopify_store_id = ? and category_slug = ?", [JSON.stringify(json), targetCitiesId, shopifyStoreId, categorySlug]);
}

exports.createTaxonomyProductCache = async (targetCitiesId, shopifyStoreId, categorySlug, json) => {
  await globals.pool.query("INSERT INTO taxonomy_product_cache (date_modified, json, targeted_cities_id, shopify_store_id, category_slug) values (now(), ?, ?, ?, ?)", [JSON.stringify(json), targetCitiesId, shopifyStoreId, categorySlug]);
}


//
// Categories available for Taxonomy
//
exports.getAllCategories = async () => {
  return new Promise((resolve, reject) => {
    var resp = {
      totalCount: 0,
      categories: []
		};
		
		var sql = "SELECT front_end_space AS cat1, LOWER(REPLACE(REPLACE(REPLACE(front_end_space, '&', ''), ' ', '-'), '--', '-')) AS cat1_slug, " +
												"front_end_name AS cat2, LOWER(REPLACE(REPLACE(REPLACE(front_end_name, '&', ''), ' ', '-'), '--', '-')) AS cat2_slug " +
										"FROM categories " +
										"WHERE front_end_space IS NOT NULL " +
										"GROUP BY front_end_space, front_end_name " +
										"ORDER BY front_end_space";

    globals.pool.query(sql)
      .then((rows) => {
        resp.categories = rows;
        colUtils.outboundNaming(resp.categories);

        resolve(resp);
      })
      .catch((e) => {
        reject(e);
      })
  })
}



exports.getCachedTaxonomyByCity = async (cityId) => {
	var rows = await globals.poolRO.query("SELECT json FROM taxonomy_cache_by_city WHERE city_id = ?", cityId);

	return rows;
}



exports.updateCachedTaxonomyByCity = async (cityId, json) => {
	await globals.pool.query("INSERT INTO taxonomy_cache_by_city (city_id, json) VALUES (?, ?) ON DUPLICATE KEY UPDATE date_modified = now(), json = ?", [cityId, json, json]);
}

