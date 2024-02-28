'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');


exports.create = (mid, tidbitTypeId, value, questionId, needsReviewFlag) => {
	return new Promise((resolve, reject) => {

		var id = globals.mongoid.fetch();
		var q = questionId ? questionId : null;
		var f = needsReviewFlag ? needsReviewFlag : false;
		var values = [id, mid, tidbitTypeId, value, q, f];
		globals.pool.query("INSERT INTO member_profile_tidbits (id, member_id, tidbit_type_id, value, tidbit_question_id, needs_review_flag) " +
				"VALUES (?, ?, ?, ?, ?, ?)", values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.deleteById = (id, tid) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("DELETE FROM member_profile_tidbits WHERE id = ? AND member_id = ?", [tid, id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getAll = (id, offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}
		globals.pool.query("SELECT count(*) as num FROM member_profile_tidbits WHERE member_id = ?", [id])
			.then((count) => {
				resp.totalCount = count[0].num;
				return globals.pool.query("SELECT m.id, m.tidbit_type_id, t.name, m.tidbit_question_id, q.question, m.value FROM member_profile_tidbits m LEFT JOIN tidbit_types t ON m.tidbit_type_id = t.id " +
					" LEFT JOIN tidbit_questions q ON m.tidbit_question_id = q.id WHERE member_id = ? ORDER BY name LIMIT ?, ?",  [id, offset, limit]);
			})
			.then((rows) => {
				colUtils.outboundNaming(rows);
				rows.forEach((row) => {
					row.tidbitType = row.name;
					delete row.name;
				})
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAll = (id, offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}
		globals.pool.query("SELECT count(*) as num FROM member_profile_tidbits WHERE member_id = ?", [id])
			.then((count) => {
				resp.totalCount = count[0].num;
				return globals.pool.query("SELECT m.id, m.tidbit_type_id, m.needs_review_flag, t.name, m.tidbit_question_id, q.question, m.value FROM member_profile_tidbits m LEFT JOIN tidbit_types t ON m.tidbit_type_id = t.id " +
					" LEFT JOIN tidbit_questions q ON m.tidbit_question_id = q.id WHERE member_id = ? ORDER BY name LIMIT ?, ?", [id, offset, limit]);
			})
			.then((rows) => {
				colUtils.outboundNaming(rows);
				rows.forEach((row) => {
					row.tidbitType = row.name;
					delete row.name;
				})
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getById = (id, tid) => {
	return new Promise((resolve, reject) => {
		var resp = {
			rows: []
		}

		globals.pool.query("SELECT m.id, m.tidbit_type_id, t.name, m.tidbit_question_id, q.question, m.value FROM member_profile_tidbits m LEFT JOIN tidbit_types t ON m.tidbit_type_id = t.id " +
				" LEFT JOIN tidbit_questions q ON m.tidbit_question_id = q.id WHERE member_id = ? AND m.id = ?", [id, tid])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				rows.forEach((row) => {
					row.tidbitType = row.name;
					delete row.name;
				})
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.updateById = (id, body) => {
	return new Promise((resolve, reject) => {
		var result = {
			updateFlag: false
		}
		var sql = "UPDATE member_profile_tidbits SET date_modified = now()";
		var values = [];

		//
		//	Build sets SQL
		//
		if (body.value != undefined) {
			sql = sql + ", value = ?";
			values.push(body.value);
			result.updateFlag = true;
		}

		if (body.needsReviewFlag != undefined) {
			sql = sql + ", needs_review_flag = ?";
			values.push(body.needsReviewFlag);
			result.updateFlag = true;
		}

		if (!result.updateFlag) {
			resolve(result);
		}
		else {
			values.push(id);
			globals.pool.query(sql + " WHERE id = ?", values)
			.then((rows) => {
				resolve(result);
			})
			.catch((e) => {
				reject(e);
			})
		}
	});
}

