'use strict';

const {
	formatResp
} = require('../utils/response');


const CategoryPriceData = require('../models/categoryPriceData');




var get = async (req, resp) => {

	var cpd = null;
	
	if (req.query.sku !== undefined) {
		cpd = await CategoryPriceData.get(req.query.sku);
	}
	else {
		cpd = await(CategoryPriceData.getWithoutSku(req.query.categoryId, req.query.msrp, req.query.compareAt));
	}

	if (cpd.length === 0) {
		delete resp.data;
		resp = formatResp(resp, undefined, 404, 'Category price data not found.');

	} else {
		resp.data.categoryPriceData = cpd;
	}
	
	return resp;
};


module.exports = {
	get
}