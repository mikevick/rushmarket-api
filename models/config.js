'use strict';

const globals = require('../globals');


exports.getAll = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM api_config")
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}