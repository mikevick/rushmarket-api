'use strict'

const {
	v1: uuidv1
} = require('uuid');

const jwtUtils = require('../actions/jwtUtils');

const Sessions = require('../models/sessions')



//
//	Create Session
//
var createSession = async (req, resp) => {
	var ip = req.connection.remoteAddress ? req.connection.remoteAddress : req.get('x-forwarded-for');
	var uid = uuidv1();

	resp.data.accessToken = jwtUtils.signToken({
		sessionId: uid
	});

	await Sessions.create(uid, resp.data.accessToken, ip, req.body.zip);

	return resp;
}


//
//	Update Session
//
var updateSession = async (uid, req, resp) => {
	var ip = req.connection.remoteAddress ? req.connection.remoteAddress : req.get('x-forwarded-for');

	await Sessions.update(uid, ip, req.body.zip);

	return resp;
}


module.exports = {
	createSession,
	updateSession
}