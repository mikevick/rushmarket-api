'use strict'

const SupplierCodeSuffix = require('../models/supplierCodeSuffix');



//
//	Get
//
var getAll = async (req, resp) => {

	var rows = await SupplierCodeSuffix.getAll();
	if (rows.length === 0) {
		resp.statusCode = 404;
		resp.message = "Overrides not found.";
		delete resp.data;

		return resp;
	}


	resp.data.overrides = rows;
	return resp;
}


module.exports = {
	getAll
}