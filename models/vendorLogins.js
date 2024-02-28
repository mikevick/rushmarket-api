'use strict';

const globals = require('../globals');



exports.logout = async (req, resp) => {
	var conn = null;

	await globals.pool.query("UPDATE vendor_logins SET active_flag = false WHERE auth_token = ?", [req.get('x-access-token')]);
}


exports.recordLogin = async (req, resp) => {
	try {
		var conn = null;
		var dev = req.get('X-DEVICE-ID');
		if (dev === 'web') {
			var ip = req.connection.remoteAddress ? req.connection.remoteAddress : req.get('x-forwarded-for');
			dev = dev + "-" + ip;
		}
		var values = [req.tempId, dev, resp.data.accessToken];

		conn = await globals.pool.getConnection();
		if ((req.get('X-DEVICE-ID') === undefined) || (req.get('X-DEVICE-ID') === null)) {
			await conn.query("UPDATE vendor_logins SET active_flag = false WHERE device IS null AND vendor_id = ?", [req.tempId]);
		} else {
			await conn.query("UPDATE vendor_logins SET active_flag = false WHERE device = ? AND vendor_id = ?", [req.get('X-DEVICE-ID'), req.tempId]);
		}
		await conn.query("INSERT INTO vendor_logins (vendor_id, device, auth_token) VALUES (?, ?, ?)", values);
		await conn.commit();
	} finally {
		await conn.release();
	}
}