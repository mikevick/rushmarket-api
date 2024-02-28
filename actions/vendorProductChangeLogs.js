'use strict'

const _ = require('lodash');

const VendorProductChangeLogs = require('../models/vendorProductChangeLogs')

const {
	formatResp
} = require('../utils/response')


//
//	GET all products
//
var getAll = async (where, sortBy, offset, limit, resp) => {
	var result = await VendorProductChangeLogs.getAll(where, sortBy, offset, limit);
	resp.metaData.totalCount = result.totalCount;
	if (result.updates.length === 0) {
		formatResp(resp, undefined, 200, 'Products not found.');
	} else {
		resp.data.updates = result.updates;
	}
	return resp;
}



//
//	GET update types
//
var getUpdateTypes = async (resp) => {
	var rows = await VendorProductChangeLogs.getUpdateTypes();
	var types = [];

	if (rows.length > 0) {
		var list = rows[0].column_type.substring(5, (rows[0].column_type.length - 1));
		var s = _.split(list, ',');
		for (var i=0; i < s.length; i++) {
			types.push(s[i].replace(/\'/g, ''));
		}

		types = _.sortBy(types);
	}
	

	resp.data.updateTypes = types;
	return resp;
}


module.exports = {
	getAll,
	getUpdateTypes
}