'use strict'

const globals = require('../globals')

const colUtils = require('../utils/columnUtils')



exports.queue = async (label, memberId, zip, type) => {
  await globals.pool.query('INSERT INTO members_to_tag (label, member_id, zip, to_type) VALUES (?, ?, ?, ?)', [label, memberId, zip, type]);
}

exports.getQueuedMembers = async () => {
	var rows = await globals.pool.query("SELECT t.id as tag_id, t.*, m.* FROM members_to_tag t LEFT JOIN members m ON t.member_id = m.id WHERE t.status = 'PENDING' order by t.date_created LIMIT 0,400");
  colUtils.outboundNaming(rows)

  return rows
}


exports.markActive = async (id) => {
	var updateResult = await globals.pool.query("UPDATE members_to_tag SET status = 'ACTIVE' WHERE id = ?", [id]);
	
	return updateResult;
}

exports.markCompleted = async (id) => {
	var updateResult = await globals.pool.query("UPDATE members_to_tag SET status = 'COMPLETED' WHERE id = ?", [id]);
	
	return updateResult;
}


exports.prune = async () => {
	var conn = null;
	try {

		conn = await globals.pool.getConnection();
		await conn.beginTransaction();

		var lock = await conn.query("SELECT GET_LOCK(?, 2)", 'M2M-PRUNE');

		var result = await conn.query("INSERT INTO members_to_tag_history SELECT * FROM members_to_tag WHERE status IN ('COMPLETED', 'ERROR')");
		await conn.query("DELETE FROM members_to_tag WHERE status IN ('COMPLETED', 'ERROR')");

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




