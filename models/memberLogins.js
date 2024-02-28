'use strict';

const globals = require('../globals');



exports.logout = (req, resp) => {
	return new Promise((resolve, reject) => {
		var conn = null;

	globals.pool.query("UPDATE member_logins SET active_flag = false WHERE auth_token = ?", [req.get('x-access-token')])
		.then((connection) => {
			resolve();
		})
		.catch((e) => {
			reject(e);
		})
	});
}


exports.recordLogin = (req, resp) => {
	return new Promise((resolve, reject) => {
		var conn = null;
		var dev = req.get('X-DEVICE-ID');
		if (dev === 'web') {
			var ip = req.connection.remoteAddress ? req.connection.remoteAddress : req.get('x-forwarded-for');
			dev = dev + "-" + ip;
		}
		var values = [req.tempId, dev, resp.data.accessToken];

	globals.pool.getConnection()
		.then((connection) => {
			conn = connection;
			if ((req.get('X-DEVICE-ID') === null) || (req.get('X-DEVICE-ID') === undefined)) {
				return conn.query("UPDATE member_logins SET active_flag = false WHERE device IS null AND member_id = ?", [req.tempId]);
			}
			else {
				return conn.query("UPDATE member_logins SET active_flag = false WHERE device = ? AND member_id = ?", [req.get('X-DEVICE-ID'), req.tempId]);
			}
		})
		.then(() => {
			return conn.query("INSERT INTO member_logins (member_id, device, auth_token) VALUES (?, ?, ?)", values);
		})
		.then(() => {
			conn.release();
			
			resolve();
		})
		.catch((e) => {
			if (conn && conn.end) conn.release();
			reject(e);
		})
	});
}

