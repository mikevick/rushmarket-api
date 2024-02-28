'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');

exports.create = (name, from, subject, textBody, htmlBody) => {
	return new Promise((resolve, reject) => {

		var id = globals.mongoid.fetch();

		var values = [id, name, from, subject, textBody, htmlBody];
		globals.pool.query("INSERT INTO email_templates (id, `name`, `from`, `subject`, text_body, html_body) " +
				"VALUES (?, ?, ?, ?, ?, ?)", values)
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
		globals.pool.query("DELETE FROM email_templates WHERE id = ?", [id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.get = (offset, limit) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM email_templates ORDER BY name ASC LIMIT ?,?", [offset, limit])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getById = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM email_templates WHERE id = ?", [id])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getByName = (name) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM email_templates WHERE name = ?", [name])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows[0]);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.updateById = (id, body) => {
	return new Promise((resolve, reject) => {
		var sql = "UPDATE email_templates SET date_modified = now()";
		var result = {
			updateFlag: false
		}
		var values = [];

		//
		//	Build sets SQL
		//
		if (body.name != undefined) {
			values.push(body.name);
			sql = sql + ", name = ?";
			result.updateFlag = true;
		}

		if (body.from != undefined) {
			values.push(from);
			sql = sql + ", from = ?";
			result.updateFlag = true;
		}

		if (body.subject != undefined) {
			values.push(body.subject);
			sql = sql + ", subject = ?";
			result.updateFlag = true;
		}

		if (body.textBody != undefined) {
			values.push(body.textBody);
			sql = sql + ", text_body = ?";
			result.updateFlag = true;
		}

		if (body.html_body != undefined) {
			values.push(body.htmlBody);
			sql = sql + ", html_body = ?";
			result.updateFlag = true;
		}

		if (!result.updateFlag) {
			resolve(result);
		} else {
			values.push(id);
			globals.pool.query(sql + " WHERE id = ?", values)
				.then((rows) => {
					resolve(result);
				})
				.catch((e) => {
					reject(e);
				})
		}
	});
}