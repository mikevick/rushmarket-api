'use strict';

const {
	IncomingWebhook
} = require('@slack/webhook');

const Stores = require('../models/stores');




var notify = async (req, resp) => {
	var storeInfo = await Stores.getActiveByCity(req.query.city);

	if (storeInfo.length > 0) {

		const slackUrl = storeInfo[0].onlinePickupSlackUrl;
		const slackWebhook = new IncomingWebhook(slackUrl);
		const name = ((req.query.name !== undefined) && (req.query.name.trim().length > 0)) ? req.query.name : "N/A";
		const order = ((req.query.orderId !== undefined) && (req.query.orderId.trim().length > 0)) ? req.query.orderId : "N/A";
		const model = ((req.query.model !== undefined) && (req.query.model.trim().length > 0)) ? req.query.model : "N/A";
		const color = ((req.query.color !== undefined) && (req.query.color.trim().length > 0)) ? req.query.color : "N/A";

		(async () => {
			await slackWebhook.send({
				text: "Name: " + name + "   Order: " + order + "   Make/Model: " + model + "   Color: " + color
			});
		})();
	}

};



module.exports = {
	notify
};