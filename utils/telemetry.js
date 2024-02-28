'use strict';

const Telemetries = require('../models/telemetries');

const comms = require('../utils/comms');
const logUtils = require('../utils/logUtils');


var log = (req, body) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 201,
				id: 0
			};

			var headers = req.headers ? JSON.stringify(req.headers, undefined, 2) : null;
			var ip = req.connection.remoteAddress ? req.connection.remoteAddress : req.get('x-forwarded-for');
			var appId = req.get('x-app-id') ? `${req.get('x-app-id')}` : null;
			var sessionId = req.query.sessionId ? `'${req.query.sessionId}'` : null;

			Telemetries.create(new Date().getTime(), req.method, req.url, appId, ip, sessionId, headers, JSON.stringify(req.body))
				.then((id) => {
					req.headers['x-start-time'] = new Date().getTime();

					resp.id = id;
					req.headers['x-telem-id'] = resp.id;
					resolve(resp);

				})
				.catch((e) => {
					switch (e.name) {
						case 'ValidationError':
							resp.statusCode = 400;
							resp.errorMessage = e;
							delete resp.id;
							resolve(resp);
							break;
						default:
							logUtils.handleExceptions(e, resp, ["id"], resolve, reject, req);
							break;
					}
				})

		} catch (e) {
			comms.sendEmail('matt@rushmarket.com', 'Telem Logging Exception', e, e);

			logUtils.handleExceptions(e, resp, ["id"], resolve, reject, req);
		}
	});
};


var logResponse = (req, res, body) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
			};

			if (req.get('x-telem-id') === undefined) {
				resolve(resp);
			} else {
				var milliseconds = new Date().getTime() - req.get('x-start-time');

				Telemetries.updateById(req.get('x-telem-id'), JSON.stringify(body), res.statusCode, milliseconds)
					.then((result) => {
						if (result.affectedRows === 1) {} else {
							resp.statusCode = 404;
						}
						resolve(resp);
					})
					.catch((e) => {
						logUtils.handleExceptions(e, resp, undefined, resolve, reject, req);
					});
			}
		} catch (e) {
			logUtils.handleExceptions(e, resp, undefined, resolve, reject, req);
		}
	});
};


module.exports = {
	log,
	logResponse
}