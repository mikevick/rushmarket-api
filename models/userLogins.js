'use strict';

const globals = require('../globals');

const _ = require('lodash');

const colUtils = require('../utils/columnUtils');



exports.logout = async (req, resp) => {
	var conn = null;

	await globals.pool.query("UPDATE user_logins SET active_flag = false WHERE auth_token = ?", [req.get('x-access-token')]);
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
			await conn.query("UPDATE user_logins SET active_flag = false WHERE device IS null AND user_id = ?", [req.tempId]);
		} else {
			await conn.query("UPDATE user_logins SET active_flag = false WHERE device = ? AND user_id = ?", [req.get('X-DEVICE-ID'), req.tempId]);
		}
		await conn.query("INSERT INTO user_logins (user_id, device, auth_token) VALUES (?, ?, ?)", values);
		await conn.commit();
	} finally {
		await conn.release();
	}
}




exports.updateToken = async (id, oldToken, newToken) => {
	await globals.pool.query("UPDATE user_logins SET auth_token = ? WHERE user_id = ? AND auth_token = ?", [newToken, id, oldToken]);
}



exports.permissionsQuery = async (userId) => {
	var rows = await globals.pool.query(`SELECT p.permission_id, p.type, p.permission, p.description, p.active,
								p.date_created as date_created,
								up.user_permission_id, COALESCE(up.user_permission_id, MAX(IF(ur.role_id IS NULL, 0, ur.role_id))) as has_permission
								FROM permissions p
									LEFT JOIN user_permissions up ON up.permission_id = p.permission_id
										AND up.user_id = ?
									LEFT JOIN permissions_to_roles pr ON pr.permission_id = p.permission_id
									LEFT JOIN users_to_roles ur ON ur.role_id = pr.role_id AND ur.user_id = ?
								WHERE p.active = 'Y'
								GROUP BY p.permission_id`, [userId, userId]);

	rows = colUtils.outboundNaming(rows);

	return rows;
}



exports.getPermissionTypes = async () => {
	var rows = await globals.pool.query(`SELECT SUBSTRING(COLUMN_TYPE,5) as type_list
											FROM information_schema.COLUMNS
											WHERE TABLE_SCHEMA = 'coreleap'
												AND TABLE_NAME = 'permissions'
												AND COLUMN_NAME = 'type'`)	

	var types = [];
	if (rows.length > 0) {
		rows[0].type_list = rows[0].type_list.replace(/'/g, '');
		rows[0].type_list = rows[0].type_list.replace('(', '');
		rows[0].type_list = rows[0].type_list.replace(')', '');
		var s = _.split(rows[0].type_list, ',');
		for (var i=0; i < s.length; i++) {
			types.push(s[i]);
		}
	}

	return types;
}