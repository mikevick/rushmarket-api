'use strict';

const globals = require('../globals');

const cryptoUtils = require('../utils/cryptoUtils');


exports.get = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM file_storage_contexts WHERE id = ?", [id])
			.then((rows) => {
				if (rows.length > 0) {
					rows[0].info = JSON.parse(cryptoUtils.decrypt(rows[0].info));
					outboundNaming(rows);
				}
				resolve(rows);				
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getAll = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM file_storage_contexts")
			.then((rows) => {
				for (var i=0; i < rows.length; i++) {
					rows[i].info = JSON.parse(cryptoUtils.decrypt(rows[i].info));
				}
				outboundNaming(rows);
				resolve(rows);				
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.store = (obj) => {
	return new Promise((resolve, reject) => {
		var conn = null;

		var id = globals.mongoid.fetch();

		globals.pool.getConnection()
			.then((connection) => {
				conn = connection;
				return conn.beginTransaction();
			})
			.then((result) => {
				return conn.query("DELETE FROM file_storage_contexts WHERE name = ?", [obj.name]);
			})
			.then((results) => {
				var enc = cryptoUtils.encrypt(JSON.stringify(obj.keys));
				return conn.query("INSERT INTO file_storage_contexts (id, date_modified, name, base_uri, base_folder, info) VALUES (?, now(), ?, ?, ?, ?)", [id, obj.name, obj.baseUri, obj.baseFolder, enc]);
			})
			.then((results) => {
				if ((results === undefined) || (results === null)) {
					return conn.rollback();
				} else {
					return conn.commit();
				}
			})
			.then(() => {
				resolve(id);
			})
			.catch((e) => {
				conn.rollback();
				reject(e);
			})
			.finally(() => {
				globals.pool.releaseConnection(conn);
			});
	});
}


var outboundNaming = (rows) => {
	rows.forEach((row) => {
		row.dateCreated = row.date_created;
		row.dateModified = row.date_modified;
		row.baseUri = row.base_uri;
		row.baseFolder = row.base_folder;
		row.keys = {};
		row.keys.account = row.info.account;
		row.keys.accountKey = row.info.accountKey;
		delete row.date_created;
		delete row.date_modified;
		delete row.base_uri;
		delete row.base_folder;
		delete row.info;
	})

	return rows
}