'use strict';

const check = require('check-types');
const emailvalidator = require('email-validator');
const express = require('express');
const router = express.Router();

const {
	changePassword,
	create,
	createPartnerFacility,
	createPartnerFacilityUser,
	fulfill,
	getAll,
	getAllFacilities,
	getAllUsers,
	getById,
	getFacilityById,
	getPartnerSchema,
	getUserById,
	login,
	removeFacility,
	removeUser,
	resetPassword,
	update,
	updateFacility,
	updateUser
} = require('../actions/partners');

const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');
const {
	formatResp,
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');
const vendorUtils = require('../utils/vendorUtils');


const PartnerLogins = require('../models/partnerLogins');



//
//  POST /partners
//
router.post(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.'
		};

		//	Only allow LPs to be created from internal API calls.
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			await create(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /partners
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var sortBy = 'name ASC';
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};

		//	Only allow LPs to be retrieved from internal API calls.
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			if ((req.query.rrcStatus !== undefined) &&
				((req.query.rrcStatus === 'ACTIVE') || (req.query.rrcStatus === 'INACTIVE'))) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.rrc_status = ?', req.query.rrcStatus.trim());
			}

			if (req.query.name) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.name LIKE ?', req.query.name.trim() + '%');
			}

			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['name', 'rrcStatus']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}

			await getAll(whereInfo, offset, limit, resp, sortBy);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});






//
//  GET /partners/{id}
//
router.get(`/:id`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};


		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.identity != undefined)) {
				req.params.id = req.decoded.identity.partnerId;
			}

			if ((req.get('x-app-type') === 'INT') || (req.decoded.identity.role === 'ADMIN') || (req.decoded.identity.role === 'MANAGER') || (req.decoded.identity.role === 'WORKER')) {
				await getById(req, resp);
			} else {
				formatResp(resp, ['data'], 403, 'Access denied.');
			}
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  PUT /partners/{id}
//
router.put(`/:id`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Update successful.'
		};


		req.params.internalFlag = true;

		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.partnerId != undefined)) {
				req.params.id = req.decoded.partnerId;
				req.params.internalFlag = false;
			}

			if ((req.get('x-app-type') === 'INT') || (req.decoded.identity.role === 'ADMIN')) {
				await update(req, resp);
			} else {
				formatResp(resp, ['data'], 403, 'Access denied.');
			}
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /partners/login
//
router.post(`/login`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGIN_SUCCESS"),
			data: {}
		};

		if (req.get('x-app-type') !== 'EXT') {
			response.respond(resp, res, next, ['data'], 403, 'Access denied.');
		} else {

			if (!req.body.email || (emailvalidator.validate(req.body.email) === false) || !req.body.password || (req.body.password.trim().length === 0)) {
				respond(resp, res, next, ["id", "data"], 401, memberText.get("LOGIN_FAIL"));
			} else {

				await login(req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /partners/{id}/logout
//
router.post(`/:id/logout`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGOUT_SUCCESS")
		};


		if (req.get('x-app-type') !== 'EXT') {
			response.respond(resp, res, next, ['data'], 403, 'Access denied.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.partnerId != undefined)) {
				req.params.id = req.decoded.partnerId;
			}

			//
			//	Couldn't decode JWT token, simply respond logged out.
			//
			if ((req.decoded === undefined) || (req.decoded.partnerId === undefined)) {
				respond(resp, res, next);

			}
			//
			//	Mark the token invalid.
			//
			else {
				var results = await PartnerLogins.logout(req);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /partners/resetPassword
//
router.post(`/resetPassword`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("PSWD_RESET_SUCCESS")
		};

		if ((req.body.email === undefined) || (emailvalidator.validate(req.body.email) === false)) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "Email"));
		} else {
			await resetPassword(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /partners/changePassword
//
router.post(`/changePassword`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("CHANGE_PSWD_SUCCESS")
		};

		var validationErrors = await vendorUtils.validateVendor(req, false);
		if (validationErrors.errorDetails.length > 0) {
			respond(resp, res, next, undefined, 400, validationErrors.message, validationErrors.errorDetails)
		} else if ((req.body.verificationId === undefined) || (req.body.password === undefined)) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "Verification ID, Password"));
		} else {

			resp = await changePassword(req, resp);
			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /partners/{id}/facilities
//
router.post(`/:id/facilities`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		req.createdBy = 0;
		var resp = {
			statusCode: 201,
			id: 0,
			message: 'Success.'
		};

		//	Internals can't use current, externals can only use current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['id'], 404, 'Partner not found.');
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the partner ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded !== undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
			}


			if ((req.get('x-app-type') === 'INT') && (req.decoded === undefined)) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN')) {
				respond(resp, res, next, ['data', 'id'], 403, 'Access denied.');
			} else {
				await createPartnerFacility(req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /partners/{id}/facilities
//
router.get(`/:id/facilities`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var partnerId = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var sortBy = 'name ASC';
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};


		//	Internals can't use current, externals can only use current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data', 'metaData'], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the partner ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded !== undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
			}


			if ((req.get('x-app-type') === 'INT') && (req.decoded === undefined)) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN')) {
				respond(resp, res, next, ['data', 'metaData'], 403, 'Access denied.');
			} else {


				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.affiliated_with_id = ?', req.params.id);


				if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
					limit = parseInt(req.query.limit);
				}

				if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
					offset = parseInt(req.query.offset);
				}

				if (req.query.name) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.name LIKE ?', req.query.name.trim() + '%');
				}

				if (req.query.sortBy) {
					sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['name']);

					if (sortBy === 'field') {
						respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
					} else if (sortBy === 'direction') {
						respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
					}
				}

				await getAllFacilities(req.params.id, whereInfo, offset, limit, resp, sortBy);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /partners/{id}/facilities/{fid}
//
router.get(`/:id/facilities/:fid`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};


		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
				if (req.params.fid === 'current') {
					req.params.fid = req.decoded.identity.facilityId;
				}
			}

			if ((req.get('x-app-type') === 'INT') && (req.decoded === undefined)) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN') &&
				((req.decoded.identity.role !== 'MANAGER') || (req.decoded.identity.facilityId !== req.params.fid)) &&
				((req.decoded.identity.role !== 'WORKER') || (req.decoded.identity.facilityId !== req.params.fid))) {
				respond(resp, res, next, ['data', 'metaData'], 403, 'Access denied.');
			} else {
				await getFacilityById(req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  PUT /partners/{id}/facilities/{fid}
//
router.put(`/:id/facilities/:fid`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Update successful.'
		};


		req.params.internalFlag = true;

		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
				req.params.internalFlag = false;
				if (req.params.fid === 'current') {
					req.params.fid = req.decoded.identity.facilityId;
				}
			}

			if ((req.get('x-app-type') === 'INT') && (req.decoded === undefined)) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN')) {
				respond(resp, res, next, ['data', 'metaData'], 403, 'Access denied.');
			} else {
				await updateFacility(req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  DELETE /partners/{id}/facilities/{fid}
//
router.delete(`/:id/facilities/:fid`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};

		//	Internals can't use current, externals can only use current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the partner ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded !== undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
				if (req.params.fid === 'current') {
					req.params.fid = req.decoded.identity.facilityId;
				}
			}

			if ((req.decoded === undefined) || ((req.get('x-app-type') === 'INT') && (req.decoded.userId === undefined))) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN')) {
				respond(resp, res, next, ['data'], 403, 'Access denied.');
			} else {
				await removeFacility(req.params.id, req.params.fid, req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});







//
//  POST /partner/{id}/facilities/{fid}/users
//
router.post(`/:id/facilities/:fid/users`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		req.createdBy = 0;
		var resp = {
			statusCode: 201,
			message: 'Success.'
		};

		//	Internals can't use current, externals can only use current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the partner ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded !== undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
				if (req.params.fid === 'current') {
					req.params.fid = req.decoded.identity.facilityId;
				}
			}

			if ((req.decoded === undefined) || ((req.get('x-app-type') === 'INT') && (req.decoded.userId === undefined))) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN') &&
				((req.decoded.identity.role !== 'MANAGER') || (req.decoded.identity.facilityId !== req.params.fid))) {
				respond(resp, res, next, ['data'], 403, 'Access denied.');
			} else {
				if (req.createdBy === 0) {
					req.createdBy = req.decoded.userId;
				}

				await createPartnerFacilityUser(req.params.id, req.params.fid, req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /partners/{id}/facilities/{fid}/users
//
router.get(`/:id/facilities/:fid/users`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var partnerId = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var sortBy = 'last_name ASC';
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};


		//	Internals can't use current, externals can only use current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data', 'metaData'], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the partner ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded !== undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
				if (req.params.fid === 'current') {
					req.params.fid = req.decoded.identity.facilityId;
				}
			}


			if ((req.get('x-app-type') === 'INT') && (req.decoded === undefined)) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN') &&
				((req.decoded.identity.role !== 'MANAGER') || (req.decoded.identity.facilityId !== req.params.fid))) {
				respond(resp, res, next, ['data', 'metaData'], 403, 'Access denied.');
			} else {


				whereInfo = sqlUtils.appendWhere(whereInfo, 'facility_id = ?', req.params.fid);

				if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
					limit = parseInt(req.query.limit);
				}

				if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
					offset = parseInt(req.query.offset);
				}

				if (req.query.name) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'name LIKE ?', req.query.name.trim() + '%');
				}

				if (req.query.sortBy) {
					sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['name']);

					if (sortBy === 'field') {
						respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
					} else if (sortBy === 'direction') {
						respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
					}
				}

				await getAllUsers(req.params.id, req.params.fid, whereInfo, offset, limit, resp, sortBy);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /partners/{id}/facilities/{fid}/users/{uid}
//
router.get(`/:id/facilities/:fid/users/:uid`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};


		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
				if (req.params.fid === 'current') {
					req.params.fid = req.decoded.identity.facilityId;
				}
				if (req.params.uid === 'current') {
					req.params.uid = req.decoded.identity.userId;
				}
			}

			if ((req.get('x-app-type') === 'INT') && (req.decoded === undefined)) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN') &&
				((req.decoded.identity.role !== 'MANAGER') || (req.decoded.identity.facilityId !== req.params.fid)) &&
				((req.decoded.identity.role !== 'WORKER') || (req.decoded.identity.facilityId !== req.params.fid) || (req.decoded.identity.userId !== req.params.uid))) {
				respond(resp, res, next, ['data', 'metaData'], 403, 'Access denied.');
			} else {
				await getUserById(req.params.uid, req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  PUT /partners/{id}/facilities/{fid}/users/{uid}
//
router.put(`/:id/facilities/:fid/users/:uid`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};


		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
				if (req.params.fid === 'current') {
					req.params.fid = req.decoded.identity.facilityId;
				}
				if (req.params.uid === 'current') {
					req.params.uid = req.decoded.identity.userId;
				}
			}

			if ((req.get('x-app-type') === 'INT') && (req.decoded === undefined)) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN') &&
				((req.decoded.identity.role !== 'MANAGER') || (req.decoded.identity.facilityId !== req.params.fid)) &&
				(req.decoded.identity.role !== 'WORKER')) {
				respond(resp, res, next, ['data', 'metaData'], 403, 'Access denied.');
			} else {
				await updateUser(req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  DELETE /partner/{id}/facilities/{lid}/users/{uid}
//
router.delete(`/:id/facilities/:lid/users/:uid`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};

		//	Internals can't use current, externals can only use current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the partner ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded !== undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
			}

			if ((req.decoded === undefined) || ((req.get('x-app-type') === 'INT') && (req.decoded.userId === undefined))) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN') &&
				((req.decoded.identity.role !== 'MANAGER') || (req.decoded.identity.facilityId !== req.params.fid))) {
				respond(resp, res, next, ['data'], 403, 'Access denied.');
			} else {
				await removeUser(req.params.id, req.params.fid, req.params.uid, req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});






//
//  POST /partner/{id}/facilities/{fid}/fulfill
//
router.post(`/:id/facilities/:fid/fulfill`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		req.createdBy = 0;
		var resp = {
			statusCode: 201,
			message: 'Success.',
			data: {}
		};

		//	Internals can't use current, externals can only use current.
		if (((req.get('x-app-type') === 'EXT') && ((req.params.id !== 'current') || (req.decoded.identity === undefined))) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, 'Partner not found.');
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the partner ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded !== undefined) &&
				(req.decoded.identity !== undefined)) {
				req.params.id = req.decoded.identity.partnerId;
				if (req.params.fid === 'current') {
					req.params.fid = req.decoded.identity.facilityId;
				}
			}

			if ((req.body.skus === undefined) || (req.body.skus === null)) {
				respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "skus"));
			} else if ((req.decoded === undefined) || ((req.get('x-app-type') === 'INT') && (req.decoded.userId === undefined))) {
				respond(resp, res, next, ['data'], 403, 'Please log in.');
			} else if ((req.get('x-app-type') === 'EXT') && (req.decoded.identity.role !== 'ADMIN') &&
				(req.decoded.identity.facilityId !== req.params.fid)) {
				respond(resp, res, next, ['data'], 403, 'Access denied.');
			} else {
				if (req.createdBy === 0) {
					req.createdBy = req.decoded.userId;
				}

				await fulfill(req.params.id, req.params.fid, req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /partners/schema
//
router.get(`/schema`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		//
		//	Only allow schema to be retrieved from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			await getPartnerSchema(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



module.exports = router;