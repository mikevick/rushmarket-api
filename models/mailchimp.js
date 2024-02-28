'use strict';

const globals = require('../globals');

exports.log = (req) => {
	return new Promise((resolve, reject) => {

		var values = [req.body.type, req.body.fired_at, req.body["data[action]"], req.body["data[reason]"], req.body["data[id]"], req.body["data[list_id]"],
			req.body["data[email]"], req.body["data[email_type]"], req.body["data[merges_email]"], req.body["data[merges_fname]"], req.body["data[merges_lname]"],
			req.body["data[merges_phone]"], req.body["data[merges_zip]"], req.body["data[merges_interests]"], req.body["data[ip_opt]"], req.body["data[ip_signup]"],
			req.body["data[campaign_id]"], req.body["data[web_id]"], req.body["data[new_id]"], req.body["data[new_email]"], req.body["data[old_email]"],
			req.body["data[subject]"], req.body["data[status]"]
		];
		globals.logPool.query("INSERT INTO webhook_notifications_mailchimp (type, fired_at, action, reason, id, list_id, email, email_type, merges_email, " +
				"merges_fname, merges_lname, merges_phone, merges_zip, merges_interests, ip_opt, ip_signup, campaign_id, web_id, new_id, new_email, old_email, " +
				"subject, status) " +
				"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values)
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

		globals.logPool.query("DELETE FROM webhook_notifications_mailchimp WHERE date_created <= DATE_SUB(NOW(), INTERVAL " + days + " DAY)")
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


