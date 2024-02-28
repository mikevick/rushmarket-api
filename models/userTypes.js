'use strict';

const _ = require('lodash');

const globals = require('../globals');


exports.get = async () => {

	var rows = await globals.pool.query(`SELECT SUBSTRING(COLUMN_TYPE,5) AS type_list
																					FROM information_schema.COLUMNS
																					WHERE TABLE_SCHEMA = 'coreleap'
																							AND TABLE_NAME = 'product_action_log'
																					AND COLUMN_NAME = 'user_type'`)

	var types = [];
	if (rows.length > 0) {
		rows[0].type_list = rows[0].type_list.replace(/'/g, '');
		rows[0].type_list = rows[0].type_list.replace('(', '');
		rows[0].type_list = rows[0].type_list.replace(')', '');
		var s = _.split(rows[0].type_list, ',');
		for (var i = 0; i < s.length; i++) {
			types.push(s[i]);
		}
	}

	return types;
}


exports.getUsers = async (list) => {
	let internalFlag = false;
	let partnerFlag = false;
	let partnerUserFlag = false;
	let prom = [];
	let vendorFlag = false;
	let vendorUserFlag = false;
	let users = [];


	
	if (list) {
		// if (list.indexOf(',') > -1) {
			let s = _.split(list, ',');
			for (var i = 0; i < s.length; i++) {
				switch (s[i].trim()) {
					case 'INTERNAL':
						internalFlag = true;
						break;

					case 'PARTNER': 
						partnerFlag = true;
						break;

					case 'PARTNERUSER':
						partnerUserFlag = true;
						break;

					case 'VENDOR':
						vendorFlag = true;
						break;

					case 'VENDORUSER':
						vendorUserFlag = true;
						break;
				};
			}
		// }
	}


	if (internalFlag) {
		prom.push(globals.pool.query(`SELECT 'INTERNAL' as user_type, user_id, user_name, email, IF(deleted = 0, 'ACTIVE', 'INACTIVE') as status
																					FROM users
																					ORDER BY user_name`));
	}
	if (partnerFlag) {
		prom.push(globals.productPool.query(`SELECT 'PARTNER' as user_type, id as user_id, name as user_name, email, status
																						FROM partners 
																						ORDER BY admin_name`));
	}
	if (partnerUserFlag) {
		prom.push(globals.productPool.query(`SELECT 'PARTNERUSER' as user_type, id as user_id, CONCAT(first_name, ' ', last_name) as user_name, email, status
																						FROM rrc_facility_users
																						ORDER BY user_name`));
	}
	if (vendorFlag) {
		prom.push(globals.productPool.query(`SELECT 'VENDOR' as user_type, id as user_id, name as user_name, email, status
																							FROM vendors
																							ORDER BY user_name`));
	}
								
	
	let results = await Promise.all(prom);
	let index = 0;

	if (internalFlag) {
		let internals = results[index++];
		for (var i=0; i < internals.length; i++) {
			users.push({
				userType: internals[i].user_type,
				userId: internals[i].user_id,
				userName: internals[i].user_name,
				email: internals[i].email,
				status: internals[i].status
			})
		}
	}
	if (partnerFlag) {
		let partners = results[index++];
		for (var i=0; i < partners.length; i++) {
			users.push({
				userType: partners[i].user_type,
				userId: partners[i].user_id,
				userName: partners[i].user_name,
				email: partners[i].email,
				status: partners[i].status
			})
		}
	}
	if (partnerUserFlag) {
		let partnerUsers = results[index++];
		for (var i=0; i < partnerUsers.length; i++) {
			users.push({
				userType: partnerUsers[i].user_type,
				userId: partnerUsers[i].user_id,
				userName: partnerUsers[i].user_name,
				email: partnerUsers[i].email,
				status: partnerUsers[i].status
			})
		}
	}
	if (vendorFlag) {
		let vendors = results[index++];
		for (var i=0; i < vendors.length; i++) {
			users.push({
				userType: vendors[i].user_type,
				userId: vendors[i].user_id,
				userName: vendors[i].user_name,
				email: vendors[i].email,
				status: vendors[i].status
			})
		}
	}
								

	return users;
}