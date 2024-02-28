'use strict';

const globals = require('../globals');



	exports.check = () => {
		return new Promise((resolve, reject) => {
			globals.pool.query("SELECT TIMESTAMPDIFF(MINUTE, last_run, NOW()) as mins FROM scheduled_tasks WHERE NAME = 'monitor-errors'")
				.then((rows) => {
					resolve(rows);
				})
				.catch((e) => {
					reject(e);
				})
		});
	}
	
	
	
	exports.getAll = (where) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM scheduled_tasks " + where + " ORDER BY name")
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.updateLastRun = (name) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("UPDATE scheduled_tasks SET last_run = now() where name = ?", [name])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

