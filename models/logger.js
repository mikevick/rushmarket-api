'use strict';

exports.create = (dbInfo, epochMilliseconds, severity, type, msg, sessionId, stack) => {
	return new Promise((resolve, reject) => {

		var id = dbInfo.mongoIdGen.fetch();

		var values = [id, epochMilliseconds, severity, type, msg, sessionId, stack];
		dbInfo.dbPool.query("INSERT INTO api_log (id, epoch_milliseconds, severity, type, message, session_id, stack_trace) " +
				"VALUES (?, ?, ?, ?, ?, ?, ?)", values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

