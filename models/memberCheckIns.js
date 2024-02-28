'use strict';

const globals = require('../globals');



exports.checkin = (id, firstName, lastName, email, verifiedFlag, storeId, inStoreSignup, guestCount) => {
	return new Promise((resolve, reject) => {

		lookupSystemUser()
			.then((systemId) => {
				var columns = "member_id, first_name, last_name, email, verified, store_id, in_store_signup, user_id";
				var slots = "?, ?, ?, ?, ?, ?, ?, ?";
				var values = [id, firstName, lastName, email, verifiedFlag, storeId, inStoreSignup, systemId];
				if (guestCount != undefined) {
					columns = columns + ", guests";
					slots = slots + ", ?";
					values.push(guestCount);
				}
				globals.pool.query("INSERT INTO customer_check_in (" + columns + ") " +
						"VALUES (" + slots + ")", values)
					.then((results) => {
						resolve(results.insertId);
					})
					.catch((e) => {
						reject(e);
					})
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.recordBreakdown = (checkinId, optionId, count) => {
	return new Promise((resolve, reject) => {

		var values = [checkinId, optionId, count];
		globals.pool.query("INSERT INTO customer_check_in_guests (customer_check_in_id, guest_option_id, guest_count) " +
				"VALUES (?, ?, ?)", values)
			.then((results) => {
				resolve(results.insertId);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


var lookupSystemUser = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT user_id FROM users WHERE user_name = 'System'")
			.then((id) => {
				resolve(id[0].user_id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}