'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');


exports.get = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT id, label, display_order, active FROM guest_options")
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


