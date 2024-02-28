'use strict'

const globals = require('../globals')

const colUtils = require('../utils/columnUtils')



exports.queue = async (label, memberId, fromCityId, toCityId) => {
  await globals.pool.query('INSERT INTO members_to_move (label, member_id, from_city_id, to_city_id) VALUES (?, ?, ?, ?)', [label, memberId, fromCityId, toCityId]);
}

exports.getQueuedMembers = async () => {
	var rows = await globals.pool.query("SELECT * FROM members_to_move WHERE status = 'PENDING' order by date_created LIMIT 0,400");
  colUtils.outboundNaming(rows)

  return rows
}


exports.markActive = async (id) => {
	var updateResult = await globals.pool.query("UPDATE members_to_move SET status = 'ACTIVE' WHERE id = ?", [id]);
	
	return updateResult;
}



exports.markCompleted = async (id) => {
	var updateResult = await globals.pool.query("UPDATE members_to_move SET status = 'COMPLETED' WHERE id = ?", [id]);
	
	return updateResult;
}



exports.prune = async () => {
	var conn = null;
	try {

		conn = await globals.pool.getConnection();
		await conn.beginTransaction();

		var lock = await conn.query("SELECT GET_LOCK(?, 2)", 'M2M-PRUNE');

		var result = await conn.query("INSERT INTO members_to_move_history SELECT * FROM members_to_move WHERE status IN ('COMPLETED', 'ERROR')");
		await conn.query("DELETE FROM members_to_move WHERE status IN ('COMPLETED', 'ERROR')");

		await conn.commit();

		await conn.query("SELECT RELEASE_LOCK(?)", 'M2M-PRUNE');

		return result;

	} catch (e) {
		conn.rollback();
		await conn.query("SELECT RELEASE_LOCK(?)", 'M2M-PRUNE');
		throw (e);
	} finally {
		globals.pool.releaseConnection(conn);
	}

}

