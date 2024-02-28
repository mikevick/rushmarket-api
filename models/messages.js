'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');



exports.createMessage = async (fromMemberId, toMemberId, message) => {
	var id = globals.mongoid.fetch();

	await globals.pool.query("INSERT INTO member_messages (id, from_member_id, to_member_id, send_timestamp, status, delivery_type, message) " +
														"VALUES (?, ?, ?, now(), 'UNREAD', 'MESSAGE', ?)", [id, fromMemberId, toMemberId, message]);
}



exports.createNotification = async (toMemberId, sendTimestamp, deliveryType, message, relatedToId) => {
	var id = globals.mongoid.fetch();
	if (relatedToId === undefined) {
		relatedToId = null;
	}

	await globals.pool.query("INSERT INTO member_messages (id, from_member_id, to_member_id, send_timestamp, delivery_type, message) " +
														"VALUES (?, 0, ?, ?, ?, ?)", [id, toMemberId, sendTimestamp, deliveryType, message]);
}



exports.deleteById = async (memberId, messageId) => {
	var result = await globals.pool.query("DELETE FROM member_messages WHERE to_member_id = ? AND id = ?", [memberId, messageId]);

	return result;
}



exports.getById = async (memberId, messageId) => {
	var rows = await globals.pool.query("SELECT * FROM member_messages WHERE to_member_id = ? AND id = ?", [memberId, messageId]);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getByMemberId = async (memberId, offset, limit) => {
	var rows = await globals.pool.query("SELECT * FROM member_messages WHERE status != 'DELETED' AND to_member_id = ? LIMIT ?,?", [memberId, offset, limit]);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.updateStatusById = async (memberId, messageId, status) => {
	var result = await globals.pool.query("UPDATE member_messages SET status = ? WHERE to_member_id = ? AND id = ?", [status, memberId, messageId]);

	return result;
}



