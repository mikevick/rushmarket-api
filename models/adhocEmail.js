'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');

exports.create = async (to, subject, plainText, htmlText, from, cc, bcc, filename, path) => {
	if (globals.logPool === undefined) {
		console.log("EARLY EXCEPTION: " + plainText);
		return;
	}
	await globals.logPool.query("INSERT INTO adhoc_email (`from`, `to`, cc, bcc, subject, filename, path, plain_text, html_text) " +
				"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [from, to, cc, bcc, subject, filename, path, plainText, htmlText]);
}



exports.getBatch = async (count) => {
	var rows = await globals.logPool.query("SELECT * FROM adhoc_email WHERE status = 'QUEUED' ORDER BY date_created LIMIT 0,?", [count]);
	colUtils.outboundNaming(rows)

	return rows;
}



exports.markSent = async (rows) => {

	for (var i=0; i < rows.length; i++) {
		if ((rows[i].sentFlag !== undefined) && (rows[i].sentFlag)) {
			await globals.logPool.query("UPDATE adhoc_email SET status = 'SENT', date_sent = now() WHERE id = ?", [rows[i].id]);
		}
	}
}

