'use strict';

const _ = require('lodash');
const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.getAll = async (whereInfo, sortBy, offset, limit) => {
	var prom = [];
	var resp = {
		totalCount: 0,
		updates: []
	};
	var userIdList = '';
	var users = [];
	

	var countSql = `SELECT count(*) as num 
						FROM vendor_product_change_log  
						${whereInfo.clause}`;
	var sql = `SELECT l.*, v.name as updater_name
					FROM vendors.vendor_product_change_log l
						LEFT JOIN vendors.vendors v ON ((l.updater_type = 'VENDOR') AND (v.id = l.updater_id))
						${whereInfo.clause}`;

	if (sortBy !== undefined) {
		sql = sql + ' ORDER BY ' + sortBy;
	}
	if (offset !== undefined) {
		sql = sql + ' LIMIT ' + offset + ',' + limit;
	}

	// console.log(mysql.format(sql, whereInfo.values));

	prom.push(globals.productROPool.query(countSql, whereInfo.values));
	prom.push(globals.productROPool.query(sql, whereInfo.values));

	var results = await Promise.all(prom);

	prom = [];

	var count = results[0];
	var rows = results[1];

	resp.totalCount = count[0].num;
	resp.updates = rows;
	colUtils.outboundNaming(resp.updates);


	for (var i=0; i < resp.updates.length; i++) {
		if (resp.updates[i].updaterType === 'USER') {
			if (userIdList.length > 0) {
				userIdList += ', ';
			}
			userIdList += resp.updates[i].updaterId;
		}
	}


	if (userIdList.length > 0) {
		rows = await globals.poolRO.query(`SELECT user_id, user_name FROM USERS where user_id IN (${userIdList})`);

		for (var i=0; i < rows.length; i++) {
			users.push({
				id: rows[i].user_id,
				name: rows[i].user_name
			})
		}

		for (var i=0; i < resp.updates.length; i++) {
			if (resp.updates[i].updaterType === 'USER') {
				var u = _.find(users, function (u) {
					return u.id.toString() === resp.updates[i].updaterId;
				})				

				if (u !== undefined) {
					resp.updates[i].updaterName = u.name;
				}
			}
		}
	}


	return resp;
}




exports.getUpdateTypes = async () => {
	var rows = await globals.productROPool.query(`SELECT column_type FROM information_schema.columns WHERE table_schema = 'vendors' AND table_name = 'vendor_product_change_log' AND column_name = 'update_type'`);

	return rows;
}

