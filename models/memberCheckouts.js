'use strict'

const globals = require('../globals')

const colUtils = require('../utils/columnUtils')



exports.create = (checkoutId, memberId, sessionId, firstName, lastName,
	address1, address2, city, state, zip,
	country, email, phone, activeFlag, note) => {
	return new Promise((resolve, reject) => {

		var values = [checkoutId, memberId, sessionId, firstName, lastName,
			address1, address2, city, state, zip,
			country, email, phone, activeFlag, note
		]

		globals.pool.query("INSERT INTO member_checkouts (checkout_id, member_id, session_id, first_name, last_name, " +
				"address_1, address_2, city, state, zip, " +
				"country, email, phone, active_flag, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values)
			.then((results) => {
				resolve(checkoutId)
			})
			.catch((e) => {
				if ((e.message !== null) && (e.message.indexOf('ER_DUP_ENTRY') === -1)) {
					reject(e)
				}
				else resolve(null);
			})
	})
}


exports.getByCheckoutId = (checkoutId) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM member_checkouts WHERE checkout_id = ? and active_flag = true", [checkoutId])
			.then((rows) => {
				colUtils.outboundNaming(rows)
				resolve(rows)
			})
			.catch((e) => {
				reject(e)
			})
	})
}


exports.getByMemberId = (memberId) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM member_checkouts WHERE member_id = ? AND active_flag = true", [memberId])
			.then((rows) => {
				colUtils.outboundNaming(rows)
				resolve(rows)
			})
			.catch((e) => {
				reject(e)
			})
	})
}


exports.getBySessionId = (sessionId) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM member_checkouts WHERE session_id = ? AND active_flag = true", [sessionId])
			.then((rows) => {
				colUtils.outboundNaming(rows)
				resolve(rows)
			})
			.catch((e) => {
				reject(e)
			})
	})
}


exports.updateByCheckoutId = async (checkoutId, setInfo) => {
	var resp = {
		rows: []
	}
	setInfo.values.push(checkoutId)

	// console.log(mysql.format('UPDATE member_checkouts ' + setInfo.clause + ', date_modified = NOW() WHERE checkout_id = ?', setInfo.values));
	var updateResult = await globals.pool.query('UPDATE member_checkouts ' + setInfo.clause + ', date_modified = NOW() WHERE checkout_id = ?', setInfo.values)


	return updateResult;
}



exports.markInactive = async (checkoutId) => {
	var updateResult = await globals.pool.query("UPDATE member_checkouts SET active_flag = false, date_modified = NOW() WHERE checkout_id = ? and active_flag = true", [checkoutId]);

	return updateResult;
}


exports.markInactiveByVariant = async (customerId, productId) => {
	var hold = await globals.pool.query("SELECT context FROM product_holds WHERE product_id = ?", [productId]);

	if (hold.length > 0) {
		//	If we can get to the checkoutId, grab it and mark the checkout as inactive.
		if (hold[0].context !== null) {
			try {
				var j = JSON.parse(hold[0].context);

				if ((j.checkoutId !== undefined) && (j.checkoutId !== null)) {
					var updateResult = await globals.pool.query("UPDATE member_checkouts SET active_flag = false, date_modified = NOW() WHERE checkout_id = ? and active_flag = true", [j.checkoutId]);
				}
			} catch (e) {
				console.log(e);
			}
		}
	}

	return updateResult;
}



exports.pruneHistory = async () => {
	var conn = null;
	try {

		conn = await globals.pool.getConnection();
		await conn.beginTransaction();

		var lock = await conn.query("SELECT GET_LOCK(?, 2)", 'MC-PRUNE');

		var result = await conn.query("INSERT INTO member_checkouts_history SELECT * FROM member_checkouts WHERE active_flag = false");
		await conn.query("DELETE FROM member_checkouts WHERE active_flag = false");

		await conn.commit();

		await conn.query("SELECT RELEASE_LOCK(?)", 'MC-PRUNE');

		return result;

	} catch (e) {
		conn.rollback();
		await conn.query("SELECT RELEASE_LOCK(?)", 'MC-PRUNE');
		throw (e);
	} finally {
		globals.pool.releaseConnection(conn);
	}

}