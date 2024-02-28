'use strict';

const globals = require('../globals');



exports.create = (name, data) => {
	return new Promise((resolve, reject) => {
		if (data === undefined) {
			data = null;
		}
		var values = [name, data];
		globals.logPool.query("INSERT INTO scheduled_task_log (date_created, name, data) VALUES (now(), ?, ?)", values)
			.then((results) => {
				resolve(results.insertId);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.prune = (days) => {
	return new Promise((resolve, reject) => {
		globals.logPool.query("DELETE FROM scheduled_task_log WHERE date_created <= DATE_SUB(NOW(), INTERVAL ? DAY)", days)
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



