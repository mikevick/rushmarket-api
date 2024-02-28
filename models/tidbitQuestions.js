'use strict'; 

const globals = require('../globals');

const mysql = require('promise-mysql');

const colUtils = require('../utils/columnUtils');



exports.create = (question, tidbitTypeId, askOnce, sortOrder) => {
	return new Promise((resolve, reject) => {

		var once = askOnce ? askOnce : false;
		var id = globals.mongoid.fetch();
		var sort = sortOrder ? sortOrder: 0;
		var values = [id, question, tidbitTypeId, once, sort];
		globals.pool.query("INSERT INTO tidbit_questions (id, question, answer_tidbit_type, ask_once, sort_order) " +
				"VALUES (?, ?, ?, ?)", values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			}) 
	});
}


exports.delById = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("DELETE FROM tidbit_questions WHERE id = ?", [id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getById = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT q.id, q.status, q.question, q.date_created, q.ask_at_checkin, q.ask_once, q.sort_order, t.name FROM tidbit_questions q LEFT JOIN tidbit_types t ON q.answer_tidbit_type = t.id WHERE q.id = ?", [id])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAll = (whereInfo, offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}

		var sql = mysql.format("SELECT count(*) as num FROM tidbit_questions q " + whereInfo.clause, whereInfo.values);
		globals.pool.query("SELECT count(*) as num FROM tidbit_questions q " + whereInfo.clause, whereInfo.values)
			.then((count) => {
				resp.totalCount = count[0].num;
				whereInfo.values.push(offset);
				whereInfo.values.push(limit);
				return globals.pool.query("SELECT q.id, q.status, q.question, q.date_created, q.ask_at_checkin, q.ask_once, q.sort_order, t.name FROM tidbit_questions q LEFT JOIN tidbit_types t ON q.answer_tidbit_type = t.id " + whereInfo.clause + " ORDER BY sort_order LIMIT ?,?", whereInfo.values);
			})
			.then((rows) => {
				colUtils.outboundNaming(rows);
				rows.forEach((row) => {
					row.answerTidbitType = row.name;
					row.askAtCheckIn = row.askAtCheckin ? true : false;
					row.askOnce = row.askOnce ? true : false;
					delete row.name;
					delete row.askAtCheckin;
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
		var sql = "UPDATE tidbit_questions SET date_modified = now()";
		var result = {
			updateFlag: false
		}
		var values = [];

		//
		//	Build sets SQL
		//
		if (body.question != undefined) {
			values.push(body.question);
			sql = sql + ", question = ?";
			result.updateFlag = true;
		}

		if (body.status != undefined) {
			values.push(body.status);
			sql = sql + ", status = ?";
			result.updateFlag = true;
		}

		if (body.answerTidbitType != undefined) {
			values.push(body.answerTidbitType);
			sql = sql + ", answer_tidbit_type = ?";
			result.updateFlag = true;
		}

		if (body.askAtCheckIn != undefined) {
			values.push(body.askAtCheckIn);
			sql = sql + ", ask_at_checkin = ?";
			result.updateFlag = true;
		}

		if (body.askOnce != undefined) {
			values.push(body.askOnce);
			sql = sql + ", ask_once = ?";
			result.updateFlag = true;
		}

		if (body.sortOrder != undefined) {
			values.push(body.sortOrder);
			sql = sql + ", sort_order = ?";
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


