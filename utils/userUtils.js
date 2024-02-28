'use strict';

const Partners = require('../models/partners');
const Vendors = require('../models/vendors');
const Users = require('../models/users');

exports.getUserIdAndType = (req) => {
	if (!req.decoded) {
		throw new Error("Not authenticated");
	}

	const internalUser = req.get('x-app-type') === 'INT';
	if (internalUser) {
		if (typeof req.decoded.userId !== 'undefined') {
			return { userId: req.decoded.userId, userType: 'INTERNAL' };
		}
		throw new Error("Unknown userId for INT user");
	}

	const externalUser = req.get('x-app-type') === 'EXT';
	if (externalUser) {
		if (typeof req.decoded.identity !== 'undefined') {
			return {
				userId: req.decoded.identity.userId || req.decoded.identity.partnerId,
				userType: req.decoded.identity.type
			};
		}

		if (typeof req.decoded.vendorId !== 'undefined') {
			return {
				userId: req.decoded.vendorId,
				userType: 'VENDOR'
			};
		}

		throw new Error("Unknown userId for EXT user");
	}

	throw new Error("Unknown app type");
};

//
//	User lookup among internal, vendor, partner and partnerusers.
//
exports.userLookup = async (userId, userType) => {
	var user = {
		email: null,
		name: null
	}

		//	Get User
		switch (userType) {
			case 'USER':
			case 'INTERNAL':
				var u = await Users.getById(userId);
				if (u.length > 0) {
					user.email = u[0].email;
					user.name = u[0].userName;
				}
				break;

			case 'PARTNER': 
				var p = await Partners.getCorporateUserById(userId);
				if (p.length > 0) {
					user.email = p[0].email;
					user.name = `${p[0].adminName}`;
				}
				break;

			case 'PARTNERUSER': 
				var p = await Partners.getUserById(userId);
				if (p.length > 0) {
					user.email = p[0].email;
					user.name = `${p[0].firstName} ${p[0].lastName}`;
				}
				break;

			case 'VENDOR': 
				const v = await Vendors.getById(userId);
				if (v.length > 0) {
					user.email = v[0].email;
					user.name = `${v[0].name}`;
				}
				break;
			default:
		}

		return user;
}


exports.userLookups = async (rows) => {
  let userProms = [];
  for (var i = 0; i < rows.length; i++) {
    userProms.push(this.userLookup(rows[i].userId, rows[i].userType));
  }

	var users = await Promise.all(userProms);
	for (let i = 0; i < rows.length; i++) {
		rows[i].userName = users[i].name;
		// products[i].userEmail = rows[i].email;
	}
}

