'use strict';

const globals = require('../globals');


exports.getQueuedResends = () => {
	return new Promise((resolve, reject) => {

		globals.pool.query("SELECT * FROM mandrill_queue WHERE status = 'QUEUED' ORDER BY date_created")
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.log = (event) => {
	return new Promise((resolve, reject) => {
		var desc = event.msg.bounce_description != undefined ? event.msg.bounce_description : null;
		var values = [event.event, event.ts, event._id, event.msg.email, desc, JSON.stringify(event.msg)];
		globals.logPool.query("INSERT INTO webhook_notifications_mandrill (event, ts, id, email, description, msg) " +
				"VALUES (?, ?, ?, ?, ?, ?)", values)
			.then((results) => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.prune = (days) => {
	return new Promise((resolve, reject) => {

		globals.logPool.query("DELETE FROM webhook_notifications_mandrill WHERE date_created <= DATE_SUB(NOW(), INTERVAL " + days + " DAY)")
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.queueResend = (email, name, contexts) => {
	return new Promise((resolve, reject) => {

		globals.pool.query("INSERT INTO mandrill_queue (email, name, contexts) VALUES (?, ?, ?)", [email, name, contexts])
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.resend = (id) => {
	return new Promise((resolve, reject) => {

		globals.pool.query("UPDATE mandrill_queue SET status = 'RESENT' WHERE id = ?", [id])
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


