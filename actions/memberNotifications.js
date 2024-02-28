'use strict';

const	Members = require('../models/members');
const Messages = require('../models/messages');


//
//	Queue a member notification.
//
var queueNotification = async (toMemberId, sendTimestamp, deliveryType, message, relatedToId, resp) => {

	var member = await Members.getById(toMemberId);

	if (member.length === 0) {
		resp.statusCode = 404;
		resp.message = "Member not found";
		return resp;
	}

	await Messages.createNotification(toMemberId, sendTimestamp, deliveryType, message, relatedToId);

	return resp;
};



module.exports = {
	queueNotification
}