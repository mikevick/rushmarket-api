'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');


exports.getAll = (resp) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("SELECT * FROM vendor_partner_types")
			.then((rows) => {
				resp.data.vendorPartnerTypes = rows;
				colUtils.outboundNaming(resp.data.vendorPartnerTypes);

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getPartnerTypesByType = async (partnerTypes) => {
	var sql = "SELECT * " +
			  "FROM vendor_partner_types " +
			  "WHERE type IN (?) "
	var values = [];
	values.push(partnerTypes);
	var rows = await globals.productPool.query(sql, values);
	colUtils.outboundNaming(rows);
	return rows;
}

exports.getVendorToPartnerTypesByVendorId = async (vendorId) => {
	var sql = "SELECT * " +
			  "FROM vendor_to_partner_types " +
			  "WHERE vendor_id = ? "
	var values = [];
	values.push(vendorId);
	var rows = await globals.productPool.query(sql, values);
	colUtils.outboundNaming(rows);
	return rows;
}

exports.createVendorToPartnerType = async (vendorId, partnerType) => {
	var sql = "INSERT INTO vendor_to_partner_types " +
			  "(vendor_id, partner_type) " + 
			  "VALUES (?,?) " 
	var values = [];
	values.push(vendorId);
	values.push(partnerType);
	await globals.productPool.query(sql, values);
}

exports.deleteVendorToPartnerType  = async (id) => {
	var sql = "DELETE FROM vendor_to_partner_types " +
			  "WHERE id = ? "
	var values = [];
	values.push(id);
	await globals.productPool.query(sql, values);
}

