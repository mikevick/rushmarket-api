'use strict'; 

const globals = require('../globals');
const mysql = require('promise-mysql');

const colUtils = require('../utils/columnUtils');



exports.create = (version, platform, statusCode, forceFlag) => {
	return new Promise((resolve, reject) => {

		var id = globals.mongoid.fetch();

		var values = [id, version, platform, statusCode, forceFlag];
		globals.pool.query("INSERT INTO app_versions (id, version, platform, status_code, force_flag) " +
				"VALUES (?, ?, ?, ?, ?)", values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			}) 
	});
}

 


exports.delById = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("DELETE FROM app_versions WHERE id = ?", [id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getById = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM app_versions WHERE id = ?", [id])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getSpecificVersion = (platform, version) => {
	return new Promise((resolve, reject) => {
		var sql = mysql.format("SELECT * FROM app_versions WHERE platform = ? AND version = ?", [platform, version])
		console.log(sql);
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAll = (offset, limit) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM app_versions ORDER BY version, platform ASC LIMIT ?, ?", [offset, limit])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


