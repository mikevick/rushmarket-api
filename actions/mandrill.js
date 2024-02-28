'use strict';

const Mandrills = require('../models/mandrill');
const Members = require('../models/members');



//
//	General handler for shopify webhooks.  Will log it and perform logic if required for specific topics.
//
var mandrillWebhook = (req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		// console.log("Mandrill Webook");
		// console.log(JSON.stringify(req.body, undefined, 2));
		// console.log(req.get('x-webhook-verified'));

		var me = JSON.parse(req.body.mandrill_events);

		//
		//	Log the webhook message.
		//
		for (var i = 0; i < me.length; i++) {

			prom.push(Mandrills.log(me[i]));

			if (me[i].event === 'unsub') {
				//	These were originally put in before the concept of more than one list.   Taking these out for now because the status will
				//	get updated eventually via mailchimp.
				// prom.push(Members.updateEmailMarketingStatusByEmail(me[i].msg.email, 'UNSUBSCRIBED'));
				// prom.push(mailchimpUtils.updateMemberStatus(me[i].msg.email, 'UNSUBSCRIBED'))
			} else if (me[i].event === 'hard_bounce') {
				// prom.push(Members.updateEmailMarketingStatusByEmail(me[i].msg.email, 'CLEANED'));
				// prom.push(mailchimpUtils.updateMemberStatus(me[i].msg.email, 'CLEANED'))
			} else if (me[i].event === 'reject') {
				// prom.push(Members.updateEmailMarketingStatusByEmail(me[i].msg.email, 'REJECTED'));
			}
		}
		Promise.all(prom)
			.then(() => {

				resolve(resp);

			})
			.catch((e) => {
				reject(e);
			})
	});
}


//
//  Logic to add customer from webhook notification.
//
var addCustomerFromNotification = (cityInfo, req) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200
			};

			//
			//	Extract zip.
			//
			var tags = extractTags(req);
			req.body.zip = tags.zip;
			req.body.verifiedMemberFlag = tags.verifiedMemberFlag;
			req.body.firstName = req.body.first_name;
			req.body.lastName = req.body.last_name;
			if (req.body.email === null) {
				req.body.email = '';
			}

			//
			//	Call to signup
			//
			memberActions.signup(req, resp, req.get('x-shopify-shop-domain'))
				.then((results) => {
					resolve(results);
				})
				.catch((e) => {
					reject(e);
				})

		} catch (e) {
			reject(e);
		}
	});
};


//
//  Logic to update customer from webhook notification.
//
var updateCustomerFromNotification = (cityInfo, req) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200
			};

			//
			//	Extract zip.
			//
			var tags = extractTags(req);
			req.body.zip = tags.zip;
			req.body.verifiedMemberFlag = tags.verifiedMemberFlag;
			req.body.firstName = req.body.first_name;
			req.body.lastName = req.body.last_name;
			if (req.body.email === null) {
				req.body.email = '';
			}

			Members.getByShopifyCustomerId(cityInfo, req.body.id)
				.then((rows) => {
					if (rows.length === 0) {
						// console.log("Mandrill notification, linking by email.")
						return Members.linkMemberToShopifyStoreByEmail(req.body.email, req.get('x-shopify-shop-domain'), req.body.id);
					} else {
						rows[0];
						req.body.shopifyCustomerId = req.body.id;
						req.params.id = rows[0].id;
					}
				})
				.then(() => {

					//
					//	Call to update
					//
					return memberActions.update(req, resp, req.get('x-shopify-shop-domain'));
				})
				.then((results) => {
					resolve(results);
				})
				.catch((e) => {
					reject(e);
				})

		} catch (e) {
			reject(e);
		}
	});
};




module.exports = {
	mandrillWebhook
};