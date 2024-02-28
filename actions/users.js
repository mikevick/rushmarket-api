'use strict';

const express = require('express');
const sha1 = require('sha1');

const jwtUtils = require('../actions/jwtUtils');

const Users = require('../models/users');
const UserLogins = require('../models/userLogins');

const memberText = require('../utils/memberTextUtils');
const {
	formatResp
} = require('../utils/response');



var login = async (req, resp) => {

	var rows = await Users.getByEmail(req.body.email);

	//	No vendor with this email.
	if (rows.length === 0) {
		resp = formatResp(resp, ["data"], 401, memberText.get("LOGIN_FAIL"));
	} else {

		//	Password check.
		if (sha1(req.body.password).toUpperCase() != rows[0].password) {
			resp = formatResp(resp, ["data"], 401, memberText.get("LOGIN_FAIL"));
		}
		//	All good so create JWT token and record the login.
		else {
			resp.data.vendorFlag = false;
			resp.data.accessToken = jwtUtils.signToken({
				userId: rows[0].userId
			});

			await setPermissions(rows[0].userId, resp);

			req.tempId = rows[0].userId;
			await UserLogins.recordLogin(req, resp)
		}
	}
}


//	Directly translated from CF code provided from Brad RM-2271
var setPermissions = async (userId, resp) => {
	var perms = await UserLogins.permissionsQuery(userId);

	var types = await UserLogins.getPermissionTypes();

	var p = {};
	for (var i=0; i < types.length; i++) {
		p[types[i]] = {}
	}

	for (var i=0; i < perms.length; i++) {
		p[perms[i].type][perms[i].permission] = {
			hasPermission: perms[i].hasPermission ? 'Y' : 'N',
			active: perms[i].active
		}
	}

	resp.data.userPermissions = p;
}



var getAll = async (whereInfo, sort, offset, limit, resp) => {
  let users = await Users.getAll(whereInfo, sort, offset, limit);
  if (users.length === 0) {
    formatResp(resp, undefined, 404, "No users found.");
  } else {
    resp.metaData.totalCount = users.totalCount;
    resp.data.users = users.rows;
  }
  return resp;
}

module.exports = {
  login,
  getAll
};