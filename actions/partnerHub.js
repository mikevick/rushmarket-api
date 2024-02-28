'use strict';

const partnerActions = require('../actions/partners');
const userActions = require('../actions/users');
const vendorActions = require('../actions/vendors');

const Partners = require('../models/partners');
const Users = require('../models/users');
const Vendors = require('../models/vendors');

const memberText = require('../utils/memberTextUtils');
const {
	formatResp
} = require('../utils/response');



var login = async (req, resp) => {
	var prom = [];

	//	See if this is a vendor or an internal user.
	prom.push(Vendors.getByEmail(req.body.email));
	prom.push(Users.getByEmail(req.body.email));
	prom.push(Partners.getCorporateUsersByEmail(req.body.email));
	prom.push(Partners.getUserByEmail(req.body.email));


	var results = await Promise.all(prom);


	if ((results[0].length === 0) && (results[1].length === 0) && (results[2].length === 0) && (results[3].length === 0)) {
		resp = formatResp(resp, ["data"], 401, memberText.get("LOGIN_FAIL"));
	}
	else {

		//	If vendor...
		if (results[0].length > 0) {
			await vendorActions.login(req, resp);
		}
		//	else if internal user
		else if (results[1].length > 0) {
			await userActions.login(req, resp);
		}
		//	else if partner
		else if (results[2].length > 0) {
			await partnerActions.login(req, resp);
		}
		//	else if partner user
		else if (results[3].length > 0) {
			await partnerActions.login(req, resp);
		}
	}
}


var resetPassword = async (req, resp) => {
	var prom = [];

	//	See if this is a vendor or an internal user.
	prom.push(Vendors.getByEmail(req.body.email));
	prom.push(Partners.getCorporateUsersByEmail(req.body.email));
	prom.push(Partners.getUserByEmail(req.body.email));


	var results = await Promise.all(prom);


	if ((results[0].length === 0) && (results[1].length === 0) && (results[2].length === 0)) {
		resp = formatResp(resp, ["data"], 404, 'Request not recognized.');
	}
	else {

		//	If vendor...
		if (results[0].length > 0) {
			await vendorActions.resetPassword(req, resp);
		}
		//	else if partner
		else if (results[1].length > 0) {
			await partnerActions.resetPassword(req, resp);
		}
		//	else if partner user
		else if (results[2].length > 0) {
			await partnerActions.resetUserPassword(req, resp);
		}
	}
}

var changePassword = async (req, resp) => {
	//	See if this is a vendor or an internal user.
	const vendors = await Vendors.getByVerificationId(req.body.verificationId);
	const partners = await Partners.getByVerificationId(req.body.verificationId);

	if ((vendors.length === 0) && (partners.length === 0)) {
		resp = formatResp(resp, ["data"], 404, 'Email address not recognized.');
	}
	else {
		//	If vendor...
		if (vendors.length > 0) {
			await vendorActions.changePassword(req, resp);
		}
		//	else if corporate user or partner user
		else if (partners.length > 0) {
			await partnerActions.changePassword(req, resp);
		}
	}
}


module.exports = {
	changePassword,
	login,
	resetPassword
};
