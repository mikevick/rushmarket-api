'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');
const comms = require('../utils/comms');



exports.create = (epochMilliseconds, httpMethod, url, appId, ip, sessionId, headers, body) => {
	return new Promise((resolve, reject) => {

		var id = globals.mongoid.fetch();

		var values = [id, epochMilliseconds, httpMethod, url, appId, ip, sessionId, headers, body];
		globals.logPool.query("INSERT INTO telemetry (id, epoch_milliseconds, http_method, url, app_id, ip, session_id, headers, req_body) " +
				"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.get = (whereInfo, offset, limit) => { 
	return new Promise((resolve, reject) => {
		let w = whereInfo.clause.length > 0 ? whereInfo.clause : "";
		whereInfo.values.push(offset);
		whereInfo.values.push(limit);
		globals.logPool.query("SELECT * FROM telemetry " + w + " ORDER BY epoch_milliseconds DESC LIMIT ?,?", whereInfo.values)
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
		globals.logPool.query("DELETE FROM telemetry WHERE date_created <= DATE_SUB(NOW(), INTERVAL " + days + " DAY)")
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.updateById = (id, respBody, httpStatus, milliseconds) => {
	return new Promise((resolve, reject) => {
		globals.logPool.query("UPDATE telemetry SET " +
		"resp_body = ?, " +
		"http_status = ?, " +
		"milliseconds= ? " +
		" WHERE id = ?", [respBody, httpStatus, milliseconds, id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				comms.sendEmail('matt@rushmarket.com', 'Bad Telem', e.message + " " + id + " " + respBody + " " + httpStatus + " " + milliseconds);


				reject(e);
			})
	});
}



