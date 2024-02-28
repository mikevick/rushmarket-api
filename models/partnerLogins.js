'use strict';

const globals = require('../globals');



exports.logout = async (req, resp) => {
	var conn = null;

	await globals.pool.query("UPDATE partner_logins SET active_flag = false WHERE auth_token = ?", [req.get('x-access-token')]);
}


exports.recordLogin = async (req, resp) => {
	try {
		var conn = null;
		var dev = req.get('X-DEVICE-ID');
		if (dev === 'web') {
			var ip = req.connection.remoteAddress ? req.connection.remoteAddress : req.get('x-forwarded-for');
			dev = dev + "-" + ip;
		}
		var values = [req.partnerId, req.userId, dev, resp.data.accessToken];

		conn = await globals.pool.getConnection();
		if ((req.get('X-DEVICE-ID') === undefined) || (req.get('X-DEVICE-ID') === null)) {
			if (req.userId) {
				await conn.query("UPDATE partner_logins SET active_flag = false WHERE device IS null AND partner_id = ? AND user_id = ?", [req.partnerId, req.userId]);
			}
			else {
				await conn.query("UPDATE partner_logins SET active_flag = false WHERE device IS null AND partner_id = ? AND user_id IS NULL", [req.partnerId]);
			}
		} else {
			if (req.userId) {
				await conn.query("UPDATE partner_logins SET active_flag = false WHERE device = ? AND partner_id = ? AND user_id = ?", [req.get('X-DEVICE-ID'), req.partnerId, req.userId]);
			}
			else {
				await conn.query("UPDATE partner_logins SET active_flag = false WHERE device = ? AND partner_id = ? AND user_id IS NULL", [req.get('X-DEVICE-ID'), req.partnerId]);
			}
		}
		await conn.query("INSERT INTO partner_logins (partner_id, user_id, device, auth_token) VALUES (?, ?, ?, ?)", values);
		await conn.commit();
	} finally {
		await conn.release();
	}
}