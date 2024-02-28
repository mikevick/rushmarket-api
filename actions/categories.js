'use strict';

const Categories = require('../models/categories');

const { formatResp } = require('../utils/response');


exports.getAll = async (req, resp) => {
	var json = await Categories.getCached(req.query.storeId);

	if (json.length === 0) {
		delete resp.data;
		resp = formatResp(resp, undefined, 404, 'Category nav data not found.');

	} else {
		resp.data.categories = JSON.parse(json[0].json);
	}
	
	return resp;
};

exports.getAllChildren = async () => {
	return Categories.getAllChildren();
}
