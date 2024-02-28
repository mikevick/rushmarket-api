'use strict';

const util = require('util');

const globals = require('../globals');
const mysql = require('promise-mysql');

const colUtils = require('../utils/columnUtils');


exports.create = (epochMilliseconds, severity, type, msg, sessionId, stack) => {
	return new Promise((resolve, reject) => {

		var id = (globals.mongoid !== undefined) ? globals.mongoid.fetch() : new Date().getTime();

		if (globals.pool === null) {
			console.log("Error: " + msg + "\n\n");
			console.log("Stack: " + stack.split("\n") + "\n\n");
			util.format(stack);
			process.exit(1);
		}
		else {

		var values = [id, epochMilliseconds, severity, type, msg, sessionId, stack];
		globals.pool.query("INSERT INTO api_log (id, epoch_milliseconds, severity, type, message, session_id, stack_trace) " +
				"VALUES (?, ?, ?, ?, ?, ?, ?)", values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
		}
	});
}


exports.get = (whereInfo, offset, limit) => {
	return new Promise((resolve, reject) => {
		let w = whereInfo.clause.length > 0 ? whereInfo.clause : "";
		whereInfo.values.push(offset);
		whereInfo.values.push(limit);
		var sql = mysql.format("SELECT * FROM api_log " + w + " ORDER BY epoch_milliseconds DESC LIMIT ?,?",  whereInfo.values);
		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getById = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM api_log WHERE id = ?", [id])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getRecentErrors = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM api_log WHERE severity = 'ERROR' AND date_created >= DATE_SUB(NOW(), INTERVAL " + 75 + " SECOND)  AND INSTR(message, 'ECONNRESET') = 0 AND INSTR(message, 'ETIMEDOUT') = 0")
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getSlowTelem = () => {
	return new Promise((resolve, reject) => {
		globals.logPool.query("SELECT * FROM telemetry WHERE date_created >= DATE_SUB(NOW(), INTERVAL 180 SECOND) AND url NOT LIKE '/v1/tasks%' AND url NOT LIKE '/v1/rushProducts%' AND url NOT LIKE '/v1/images%' AND url NOT LIKE '/v1/imageResizer%' AND url NOT LIKE '/v1/products/ambiguous%' AND milliseconds > 30000")
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}




exports.prune = (days) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("DELETE FROM api_log WHERE date_created <= DATE_SUB(NOW(), INTERVAL " + days + " DAY)")
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}
