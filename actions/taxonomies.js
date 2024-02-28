'use strict'

const TargetedCities = require('../models/targetedCities');
const Taxonomies = require('../models/taxonomies');

const {
	formatResp
} = require('../utils/response')




//
//	GET active taxonomy
//
var getActive = async (req, resp) => {
	var json = "";
	
	if (req.query.market !== undefined) {
		var city = await TargetedCities.getTargetCity(req.query.market);
		if (city.length === 0) {
			formatResp(resp, undefined, 404, "Unrecognized market.");
			return resp;
		}	

		json = await Taxonomies.getCachedTaxonomyByCity(city[0].id);
	}
	else {
		json = await Taxonomies.getCached();
	}

	if (json.length === 0) {
		delete resp.data;
		resp = formatResp(resp, undefined, 404, 'Taxonomy data not found.');

	} else {
		try {
			resp.data = JSON.parse(json[0].json);
		} catch (e) {
			console.log(e);
		}
	}

	return resp;
};



//
//	GET active taxonomy
//
// var getTaxonomyProducts = async (req, resp) => {

// 	var json = await Taxonomies.getCachedTaxonomyProducts(req.query.memberId);

// 	if (json.length === 0) {
// 		delete resp.data;
// 		resp = formatResp(resp, undefined, 404, 'Taxonomy Product data not found.');
// 	} else {
// 		try {
// 			var j = JSON.parse(json[0].json);
// 			resp.data = j;
// 		}
// 		catch (e) {
// 			console.log(e);
// 		}
// 	}

// 	return resp;
// };

var getTaxonomyProductsByCategory = async (categorySlug, req, resp) => {

	var json = await Taxonomies.getCachedTaxonomyProductsByCategory(categorySlug, req.query.memberId);

	if (json.length === 0) {
		delete resp.data;
		resp = formatResp(resp, undefined, 404, `Taxonomy Product data for ${categorySlug} not found.`)
	} else {
		try {
			var j = JSON.parse(json[0].json);
			resp.data = j;
		} catch (e) {
			console.log(e);
		}
	}

	return resp;
};
//
//	GET all categories
//
var getAllCategories = async (resp) => {

	var result = await Taxonomies.getAllCategories();
	if (result.categories.length === 0) {
		formatResp(resp, undefined, 200, 'Categories not found.');
	} else {

		var lastCat = undefined;
		var cat = {

		}

		for (var i = 0; i < result.categories.length; i++) {
			if (lastCat !== result.categories[i].cat1) {
				lastCat = result.categories[i].cat1;

				if (cat.name !== undefined) {
					resp.data.categories.push(cat);
				}

				cat = {
					name: result.categories[i].cat1,
					slug: result.categories[i].cat1Slug,
					subCategories: [{
						name: result.categories[i].cat2,
						slug: result.categories[i].cat2Slug
					}]
				}
			} else {
				cat.subCategories.push({
					name: result.categories[i].cat2,
					slug: result.categories[i].cat2Slug
				});
			}
		}

		if (cat.name !== undefined) {
			resp.data.categories.push(cat);
		}
	}
	return resp;
}


module.exports = {
	getActive,
	//getTaxonomyProducts,
	getTaxonomyProductsByCategory,
	getAllCategories
}