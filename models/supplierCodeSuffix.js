'use strict'; 

const globals = require('../globals');

const columnUtils = require('../utils/columnUtils');



exports.getAll = async () => {
	var sql = "SELECT * FROM supplier_code_overrides ORDER BY vendor_supplier_code_suffix";
									

	// console.log(mysql.format(sql, whereInfo.values));
	var rows = await globals.productPool.query(sql);
	columnUtils.outboundNaming(rows);
	return rows;
}


