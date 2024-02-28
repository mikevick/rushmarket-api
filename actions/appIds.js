'use strict';

const globals = require('../globals');
const exceptions = require('../utils/logUtils');



var appIdCheck = (req, id) => {
	return new Promise((resolve, reject) => {
		try {
			var conn = null;
			var prom = [];
			var result = false;

			//	Load app Ids if they haven't been.
			if (globals.appIds.length === 0) {
				prom.push(loadIds());
			}

			Promise.all(prom)
				.then(() => {

					//
					//  Check for a webhook call coming from Shopify
					//
					if (req.headers['x-shopify-topic'] != undefined) {
						result = true;
					}

					if (req.originalUrl === '/v1/mailchimpWebhook') {
						result = true;
					}
					
					if (req.originalUrl === '/v1/mandrillWebhook') {
						result = true;
					}
					
					if (req.originalUrl === '/v1/ping') {
						result = true;
					}
					
					if (req.originalUrl === '/v1/products/exportJobs') {
						result = true;
					}
					
					// if (req.originalUrl.startsWith('/v1/adsFeed')) {
					// 	result = true;
					// }
					
					// if (req.originalUrl.startsWith('/v1/adRegions')) {
					// 	result = true;
					// }
					
					if (req.originalUrl === '/v1/ids') {
						result = true;
					}
					
					if (req.originalUrl.startsWith('/v1/barcodes')) {
						result = true;
					}

					if (req.originalUrl.startsWith('/v1/imageResizer')) {
						result = true;
					}

					for (var i=0; i < globals.appIds.length; i++) {
						if (globals.appIds[i].id === id) {
							result = true;
							req.headers['x-app-name'] = globals.appIds[i].app_name.toLowerCase();
							if (globals.appIds[i].internal) {
								req.headers['x-app-type'] = 'INT'
							}
							else {
								req.headers['x-app-type'] = 'EXT'								
							}
						}
					}

					resolve(result);
				})

				.catch((e) => {
					if (conn && conn.end) conn.release();

					exceptions.handleExceptions(e, null, null, resolve, reject, req);
				});

		} catch (e) {
			exceptions.handleExceptions(e, null, null, resolve, reject, null);
		}
	});
};


var loadIds = () => {
	return new Promise((resolve, reject) => {
		try {
			var conn = null;

			globals.pool.getConnection()
				.then((connection) => {
					conn = connection;

					return conn.query("SELECT * FROM app_ids");
				})
				.then((rows) => {
					conn.release();


					for (var i = 0; i < rows.length; i++) {
						globals.appIds.push(rows[i]);
					}
					resolve();
				})
				.catch((e) => {
					if (conn && conn.end) conn.release();

					exceptions.handleExceptions(e, null, null, resolve, reject, null);
				});
		} catch (e) {
			exceptions.handleExceptions(e, null, null, resolve, reject, null);
		}
	});
}

module.exports = {
	appIdCheck
}