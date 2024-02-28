'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');

exports.getMappingsById = async (id) => {
	var resp = [];

	//	Determine if ID belongs to cat1 or is a cat2.
	var categories = await globals.pool.query("SELECT * FROM categories WHERE category_id = ?", [id]);

	if (categories.length > 0) {
		if (categories[0].parent_id === 0) {
			categories = await globals.pool.query("SELECT * FROM categories WHERE parent_id = ?", [id]);
		}

		for (var i=0; i < categories.length; i++) {
			var mappings = await globals.pool.query("SELECT * FROM category_mappings WHERE category_id = ?", [categories[i].category_id])
			for (var j=0; j < mappings.length; j++) {
				resp.push({ 
					cat1: mappings[j].category_1,
					cat2: mappings[j].category_2,
				})
			}
		}
	}

	return resp;
}



exports.getMappingsByIds = async (ids) => {
	var resp = [];

	//	Determine if ID belongs to cat1 or is a cat2.
	var categories = await globals.pool.query(`SELECT * FROM categories WHERE category_id IN (${ids})`);

	if (categories.length > 0) {
		if (categories[0].parent_id === 0) {
			categories = await globals.pool.query(`SELECT * FROM categories WHERE parent_id IN (${ids})`);
		}

		for (var i=0; i < categories.length; i++) {
			var mappings = await globals.pool.query("SELECT * FROM category_mappings WHERE category_id = ?", [categories[i].category_id])
			for (var j=0; j < mappings.length; j++) {
				resp.push({ 
					cat1: mappings[j].category_1,
					cat2: mappings[j].category_2,
				})
			}
		}
	}

	return resp;
}


exports.getMappedByVCCategories = async (primaryCategory, secondaryCategory) => {
	var categories = await globals.pool.query(`SELECT c2.category_id as category_1_id, c.category_id as category_2_id,	c2.name as category_1, c.name as category_2
																								FROM category_mappings cm
																									LEFT JOIN categories c ON c.category_id = cm.category_id
																									LEFT JOIN categories c2 ON c2.category_id = c.parent_id
																								WHERE cm.category_1 = ? AND cm.category_2 = ?`, [primaryCategory, secondaryCategory]);

	categories = colUtils.outboundNaming(categories);
	return categories;
}
