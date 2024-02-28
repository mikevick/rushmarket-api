'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');



exports.update = async (code, storeId) => {
	var sql = `UPDATE vendor_supplier_codes SET store_id = ? WHERE supplier_code = ?`;

	// console.log(mysql.format(sql, [offset, limit]));
	var result = await globals.productPool.query(sql, [storeId, code]);

	return result;
}

exports.get = async (code) => {
	var sql = `SELECT vendor_id, store_id, type, supplier_code, charge_disposal_fees, charge_processing_fees, default_condition FROM vendor_supplier_codes WHERE supplier_code = ?`;

	// console.log(mysql.format(sql, [offset, limit]));
	var codes = await globals.productPool.query(sql, [code]);

	colUtils.outboundNaming(codes);

	if (codes.length === 1) {
		codes[0].code = codes[0].supplierCode;
		delete codes[0].supplierCode;
	}

	return codes;
}

