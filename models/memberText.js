'use strict';

const globals = require('../globals');

exports.create = (label, text) => {
	return new Promise((resolve, reject) => {

		var id = globals.mongoid.fetch();

		var values = [id, label, text];
		globals.pool.query("INSERT INTO member_text (id, label, text) " +
				"VALUES (?, ?, ?)", values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			}) 
	});
}

 
exports.delByLabel = (label) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("DELETE FROM member_text WHERE label = ?", [label])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.get = (whereInfo, offset, limit) => {
	return new Promise((resolve, reject) => {
		let w = whereInfo.clause.length > 0 ? whereInfo.clause : "";
		globals.pool.query("SELECT * FROM member_text WHERE 1=1 " + w + " ORDER BY label ASC LIMIT ?, ?" [offset , limit])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getByLabel = (label) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM member_text WHERE label = ?", [label])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAll = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM member_text")
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}