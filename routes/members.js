'use strict';

const bcrypt = require('bcrypt');
const check = require('check-types');
const comms = require('../utils/comms');
const emailvalidator = require('email-validator');
const express = require('express');
const router = express.Router();

const {
	v1: uuidv1
} = require('uuid');

const globals = require('../globals');

const axios = require('axios').create({
	timeout: globals.apiTimeout,
	validateStatus: function (status) {
		return ((status === 404) || (status === 400) || (status >= 200 && status < 300));
	}
});

const jwtUtils = require('../actions/jwtUtils');
const {
	captureFeedback,
	captureFeedbackUnknown,
	changeEmail,
	changePassword,
	checkIn,
	createMemberMessage,
	createMemberMessageReply,
	createRecentView,
	createTidbit,
	deleteMemberMessageById,
	generateRMComUrl,
	generateMultipassifyUrl,
	generatePasswordURL,
	getAll,
	getById,
	getByVerificationId,
	getMarketingAttribution,
	getMemberFindById,
	getMemberFinds,
	getMemberMessageById,
	getMemberMessages,
	getMemberRecentViews,
	getOrders,
	getTidbits,
	getTidbitById,
	marketingAttribution,
	remove,
	removeFinds,
	removeFindById,
	removeTidbit,
	setHomeCity,
	setHomeCityByZip,
	setHomeCityByZipByVerificationId,
	signup,
	storeFind,
	update,
	updateByVerificationId,
	updateFindById,
	updateMemberMessageById,
	updateTidbit,
	verifyEmail
} = require('../actions/members');


const {
	moveLincolnInOmaha,
	moveLincolnInOutliers,
	moveLincolnToOmaha,
	moveNationalToOutliers,
	tagAllMembers,
	realignMembersToZips,
	transitionLincolnFinds,
	transitionLincolnToOmahaAdd,
	transitionLincolnToOmahaTag,
	transitionOmahaTag
} = require('../actions/memberMovements');

const Members = require('../models/members');
const MemberLogins = require('../models/memberLogins');
const ProductHolds = require('../models/productHolds');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const memberUtils = require('../utils/memberUtils');
const {
	formatResp,
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  DELETE /members/{id}
//
router.delete(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			remove(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})

		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  DELETE /members/{id}/finds
//
router.delete(`/:id/finds`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Member finds removed successfully."
		};


		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded !== undefined) &&
			(req.decoded.memberId !== undefined)) {
			req.params.id = req.decoded.memberId;
		}


		//	Use this to delete ALL of a member's finds or those limited to a label.
		var result = await removeFinds(req.params.id, req.query.label, resp);
		if (result.affectedRows === 0) {
			resp = formatResp(resp, undefined, 404, "Member finds not found.");
		}

		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  DELETE /members/{id}/finds/{id}
//
router.delete(`/:id/finds/:findId`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Member find removed successfully."
		};

		if (req.query.store === undefined) {
			resp = formatResp(resp, undefined, 400, "Store required.");
			respond(resp, res, next);
		} else {

			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}


			//	Use this to delete ALL of a member's finds or those limited to a label.
			var result = await removeFindById(req.params.id, req.query.store, req.params.findId, resp);
			if (result.affectedRows === 0) {
				resp = formatResp(resp, undefined, 404, "Member find not found.");
			}

			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /members
//
router.get(`/`, (req, res, next) => {
	try {
		var includeShopifyInfo = false;
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			metaData: {
				totalCount: 0
			},
			data: {}
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			var limit = 50;
			var offset = 0;


			if ((req.get('x-app-type') === 'INT') && (req.query.includeShopifyInfo !== undefined) && (req.query.includeShopifyInfo === "true")) {
				includeShopifyInfo = true;
			}


			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			var sortBy = "last_name ASC, first_name ASC";
			var whereInfo = {
				clause: "",
				values: []
			};

			if (req.query.email) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "email LIKE ?", req.query.email + "%");
			}

			if (req.query.firstName) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "first_name LIKE ?", req.query.firstName + "%");
			}

			if (req.query.dateCreatedStart) {
				if (req.query.dateCreatedStart.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "date_created >= ?", req.query.dateCreatedStart.substring(0, 10) + " " + req.query.dateCreatedStart.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "date_created >= ?", req.query.dateCreatedStart.substring(0, 10) + " 00:00:00");
				}
			}

			if (req.query.dateCreatedEnd) {
				if (req.query.dateCreatedEnd.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "date_created <= ?", req.query.dateCreatedEnd.substring(0, 10) + " " + req.query.dateCreatedEnd.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "date_created <= ?", req.query.dateCreatedEnd.substring(0, 10) + " 00:00:00");
				}
			}

			if (req.query.dateModifiedStart) {
				if (req.query.dateModifiedStart.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "date_modified >= ?", req.query.dateModifiedStart.substring(0, 10) + " " + req.query.dateModifiedStart.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "date_modified >= ?", req.query.dateModifiedStart.substring(0, 10) + " 00:00:00");
				}
			}

			if (req.query.dateModifiedEnd) {
				if (req.query.dateModifiedEnd.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, "date_modified <= ?", req.query.dateModifiedEnd.substring(0, 10) + " " + req.query.dateModifiedEnd.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "date_modified <= ?", req.query.dateModifiedEnd.substring(0, 10) + " 00:00:00");
				}
			}

			if (req.query.lastName) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "last_name LIKE ?", req.query.lastName + "%");
			}

			if (req.query.verificationId) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "verification_id = ?", req.query.verificationId);
			}

			if (req.query.status) {
				whereInfo = sqlUtils.appendWhere(whereInfo, "status = ?", req.query.status);
			}

			if (req.query.emailMarketingStatus) {
				if (req.query.emailMarketingStatus.indexOf(',') >= 0) {
					var inarr = req.query.emailMarketingStatus.split(',');
					var inClause = '';
					for (var i = 0; i < inarr.length; i++) {
						if ((inarr[i] != 'SUBSCRIBED') && (inarr[i] != 'UNSUBSCRIBED') && (inarr[i] != 'REJECTED') && (inarr[i] != 'CLEANED')) {
							respond(resp, res, next, undefined, 400, 'Invalid emailMarketingStatus.')
						} else {
							if (inClause.length > 0) {
								inClause = inClause + ", ";
							}
							inClause = inClause + "'" + inarr[i] + "'";
						}
					}
					if (inClause.length > 0) {
						whereInfo = sqlUtils.appendWhere(whereInfo, "email_marketing_status in (" + inClause + ")");
					}
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "email_marketing_status = ?", req.query.emailMarketingStatus);
				}
			}

			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['dateCreated', 'dateModified', 'email', 'firstName', 'lastName']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}

				// var arr = req.query.sortBy.split(',');
				// sortBy = '';
				// for (var i = 0; i < arr.length; i++) {
				// 	var parts = arr[i].split(':');
				// 	if ((parts[0] != 'dateCreated') && (parts[0] != 'dateModified') && (parts[0] != 'email') && (parts[0] != 'firstName') && (parts[0] != 'lastName')) {
				// 		respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				// 		break;
				// 	} else {
				// 		if ((parts[1] != 'ASC') && (parts[1] != 'DESC')) {
				// 			respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				// 			break;
				// 		} else {
				// 			if (sortBy.length > 0) {
				// 				sortBy = sortBy + ", ";
				// 			}
				// 			if (parts[0] === 'dateCreated') {
				// 				parts[0] = 'date_created';
				// 			}
				// 			if (parts[0] === 'dateModified') {
				// 				parts[0] = 'date_modified';
				// 			}
				// 			if (parts[0] === 'firstName') {
				// 				parts[0] = 'first_name';
				// 			}
				// 			if (parts[0] === 'lastName') {
				// 				parts[0] = 'last_name';
				// 			}
				// 			// console.log(parts[0] + " " + parts[1]);
				// 			sortBy = sortBy + parts[0] + " " + parts[1];
				// 		}
				// 	} 
				// }
			}

			if (req.query.shopifyCustomerId) {
				if (req.query.shopifyCustomerId === 'null') {
					whereInfo = sqlUtils.appendWhere(whereInfo, "shopify_customer_id IS NULL");
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, "shopify_customer_id = ?", req.query.shopifyCustomerId);
				}
			}

			getAll(whereInfo, sortBy, offset, limit, resp, includeShopifyInfo)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})

		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  GET /members/missing
//
router.get(`/missing`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		if (req.query.verificationId === undefined) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "verificationId"));
		} else {

			getByVerificationId(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})

		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  GET /members/{id}
//
router.get(`/:id`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {


			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}


			resp = await getById(req, resp);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  GET /members/{id}/checkIns    NOTE: commented out - not in use 4/8/2019.
//
// router.get(`/:id/checkIns`, (req, res, next) => {
// 	try {
// 		var resp = {
// 			statusCode: 200,
// 			message: memberText.get("GET_SUCCESS"),
// 			data: {}
// 		};

// 		//
// 		//	Only internal calls allowed.
// 		//
// 		if (req.get('x-app-type') != 'INT') {
// 			respond(resp, res, next, undefined, 403, "Access denied.");
// 		} else {

// 			var limit = 10;
// 			var offset = 0;

// 			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
// 				limit = parseInt(req.query.limit);
// 			}

// 			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
// 				offset = parseInt(req.query.offset);
// 			}


// 			getCheckIns(req, resp, limit, offset)
// 				.then((resp) => {

// 					resolve(resp);

// 				})
// 				.catch((e) => {
// 					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
// 				})

// 		}
// 	} catch (e) {
// 		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
// 	}
// });


//
//  GET /members/{id}/finds
//
router.get(`/:id/finds`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};
		var sortBy = 'date_created';


		//	TODO Do we want this to be a store ID? Was originally store city (i.e. "omaha") because same endpoint would be 
		//	used from Shopify, but not the case any more.
		if (req.query.store === undefined) {
			resp = formatResp(resp, undefined, 400, "Store required.");
			respond(resp, res, next);
		} else {

			//
			//	Internals can't get current, externals can only get current.
			//
			if ((req.get('x-app-type') === 'INT') && (req.params.id === 'current')) {
				respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
			} else {


				//
				//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
				//
				if ((req.get('x-app-type') === 'EXT') &&
					(req.params.id === 'current') &&
					(req.decoded != undefined) &&
					(req.decoded.memberId != undefined)) {
					req.params.id = req.decoded.memberId;
				}


				if (req.query.sortBy) {
					sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['dateCreated', 'savings', 'price', 'sortOrder']);

					if (sortBy === 'field') {
						respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
					} else if (sortBy === 'direction') {
						respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
					}
				}

				await getMemberFinds(req.params.id, req.query.store, req.query.label, req.query.coinId, sortBy, resp);

				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  GET /members/{id}/finds/{findId}
//
router.get(`/:id/finds/:findId`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if ((req.get('x-app-type') === 'INT') && (req.params.id === 'current')) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {


			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}

			await getMemberFindById(req.params.id, req.params.findId, resp);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});

//
//  GET /members/{id}/recentlyViewed
//
router.get(`/:id/recentlyViewed`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		let resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		let limit = 50;
		let offset = 0;

		//store required
		if (req.query.store === undefined) {
			resp = formatResp(resp, undefined, 400, "Store required.");
			respond(resp, res, next);
		} else {

			//
			//	Internals can't get current, externals can only get current.
			//
			if ((req.get('x-app-type') === 'INT') && (req.params.id === 'current')) {
				respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
			} else {

				//
				//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
				//
				if ((req.get('x-app-type') === 'EXT') &&
					(req.params.id === 'current') &&
					(req.decoded != undefined) &&
					(req.decoded.memberId != undefined)) {
					req.params.id = req.decoded.memberId;
				}

				if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
					limit = parseInt(req.query.limit);
				}

				if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
					offset = parseInt(req.query.offset);
				}

				await getMemberRecentViews(req.params.id, req.query.store, limit, offset, resp);

				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  GET /members/{id}/orders
//
router.get(`/:id/orders`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			metaData: {
				totalCount: 0
			},
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {

			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}

			var limit = 10;
			var offset = 0;

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			getOrders(req, resp, offset, limit)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})

		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  GET /members/{id}/resetPasswordURL
//
router.get(`/:id/resetPasswordURL`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		//
		//	Can only be called from an internal key (corelink).
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			var url = await generatePasswordURL(req, resp);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /members
//
router.post(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: memberText.get("SIGNUP_SUCCESS"),
			data: {}
		};


		//	Check for a session
		if (req.get('x-access-token') !== undefined) {
			await jwtUtils.verifyTokenInline(req, resp);
	   }


		signup(req, resp)
			.then((resp) => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			})

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



//
//  POST /members/{id}/captureFeedback
//
router.post(`/:id/captureFeedback`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("CAPTURE_FEEDBACK_SUCCESS")
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {

			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}

			if (req.body.feedback === undefined) {
				resp = formatResp(resp, undefined, 400, "Feedback required.");
				respond(resp, res, next);
			} else {
				captureFeedback(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp);
					});
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  POST /members/{id}/changeEmail
//
// router.post(`/:id/changeEmail`, jwtUtils.verifyToken, (req, res, next) => {
// 	try {
// 		var resp = {
// 			statusCode: 200,
// 			message: memberText.get("VERIFY_EMAIL")
// 		};
// 		var sets = "";


// 		if (req.body.email === undefined) {
// 			respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "email"));
// 		} else {

// 			//
// 			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
// 			//
// 			if ((req.get('x-app-type') === 'EXT') &&
// 				(req.params.id === 'current') &&
// 				(req.decoded != undefined) &&
// 				(req.decoded.memberId != undefined)) {
// 				req.params.id = req.decoded.memberId;
// 			}

// 			changeEmail(req, resp)
// 				.then((resp) => {
// 					respond(resp, res, next);
// 				})
// 				.catch((e) => {
// 					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
// 				})

// 		}
// 	} catch (e) {
// 		logUtils.routeExceptions(e, req, res, next, resp, null);
// 	}
// });



//
//  POST /members/{id}/finds
//
router.post(`/:id/finds`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var order = (req.body.sortOrder === undefined) ? 1 : req.body.sortOrder;
		var resp = {
			statusCode: 201,
			message: memberText.get("GET_SUCCESS"),
		};

		//
		//	Internals can't get current, externals can only get current.  EXCEPT in this case where we're allowing the member id to also be a shopify customer id.
		//
		if ((req.get('x-app-type') === 'INT') && (req.params.id === 'current')) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {


			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}


			if ((req.body.label === undefined) || (req.body.coinId === undefined) || (req.body.store === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "store, label, coinId"));
				respond(resp, res, next);
			}
			if ((req.body.label === null) || (req.body.label.length === 0)) {
				resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "label"));
				respond(resp, res, next);
			} else {
				await storeFind(req.body.store, req.params.id, req.body.label, req.body.coinId, req.body.sortOrder, resp);

				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  POST /members/{id}/marketingAttribution
//
router.post(`/:id/marketingAttribution`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			id: 0,
			statusCode: 201,
			message: memberText.get("GET_SUCCESS"),
		};


		if ((req.body.marketingMedium === undefined) && (req.body.marketingSource === undefined) &&
			(req.body.marketingCampaign === undefined) && (req.body.marketingTerm === undefined) &&
			(req.body.marketingContent === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "marketingMedium, marketingSource, marketingCampaign, marketingTerm, marketingContent"));
		}

		//
		//	Internals can't get current, externals can only get current.  EXCEPT in this case where we're allowing the member id to also be a shopify customer id.
		//
		else if ((req.get('x-app-type') === 'INT') && (req.params.id === 'current')) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {

			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}

			await marketingAttribution(req, resp);
		}

		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});




//
//  GET /members/{id}/marketingAttribution
//
router.get(`/:id/marketingAttribution`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			metaData: {
				totalCount: 0
			},
			data: {}
		};


		var limit = 1;
		var offset = 0;

		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}

		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}

		getMarketingAttribution(req, offset, limit, resp)
			.then((resp) => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			})

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /members/{id}/recentlyViewed
//
router.post(`/:id/recentlyViewed`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: memberText.get("GET_SUCCESS"),
		};

		//
		//	Internals can't get current, externals can only get current.  EXCEPT in this case where we're allowing the member id to also be a shopify customer id.
		//
		if ((req.get('x-app-type') === 'INT') && (req.params.id === 'current')) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {

			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}


			if ((req.body.coinId === undefined) || (req.body.store === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "store, coinId"));
				respond(resp, res, next);
			} else {
				await createRecentView(req.params.id, req.body.store, req.body.coinId, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});




//
//  POST /members/captureFeedback
//
router.post(`/captureFeedback`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("CAPTURE_FEEDBACK_SUCCESS")
		};

		if ((req.body.feedback === undefined) || (req.body.email === undefined)) {
			resp = formatResp(resp, undefined, 400, "Feedback and email required.");
			respond(resp, res, next);
		} else {
			captureFeedbackUnknown(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /members/checkIn
//
//	Could also be /members/{id}/checkIn but I didn't want to assume we'd have the member id - maybe we have email or something else.
//
router.post(`/checkIn`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("CHECK_IN_SUCCESS")
		};

		//
		//	Only internal calls allowed.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if ((req.body.memberId === undefined) || (req.body.physicalStoreId === undefined) || (!check.integer(parseInt(req.body.physicalStoreId)) || (req.body.shopifyStoreId < 1))) {
				respond(resp, res, next, undefined, 400, "Member ID and physical store ID is required.");
			} else {

				checkIn(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp);
					});
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /members/{id}/multipassURL
//
router.post(`/:id/rmComURL`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var member = null;

		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		//
		//	Only internal calls allowed.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, undefined, 403, "Access denied.");
		} else {
			generateRMComUrl(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  POST /members/{id}/multipassURL
//
router.post(`/:id/multipassUrl`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var member = null;

		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}


			generateMultipassifyUrl(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
				});

		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  POST /members/{id}/setHomeCity
//
router.post(`/:id/setHomeCity`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("HOME_CITY_SUCCESS")
		};


		//
		//	Only internal calls allowed.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, undefined, 403, "Access denied.");
		} else {
			if ((req.body.cityId === undefined) || (!check.integer(parseInt(req.body.cityId)) || (req.body.cityId < 0))) {
				respond(resp, res, next, undefined, 400, "City id is required.");
			} else {

				req.body.cityId = parseInt(req.body.cityId);
				setHomeCity(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp);
					});
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /members/{id}/setHomeCityByZip
//
router.post(`/:id/setHomeCityByZip`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("HOME_CITY_SUCCESS")
		};


		//
		//	Only internal calls should be allowed, but we're treating this as an exception.
		//
		// if (req.get('x-app-type') != 'INT') {
		// 	respond(resp, res, next, undefined, 403, "Access denied.");
		// } else {

		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}

		if (req.body.zip === undefined) {
			respond(resp, res, next, undefined, 400, "Zip is required.");
		} else {


			setHomeCityByZip(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				});
		}
		// }
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /members/setHomeCityByZip
//
router.post(`/setHomeCityByZip`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("HOME_CITY_SUCCESS")
		};

		if (req.query.verificationId === undefined) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "verificationId"));
		} else {


			setHomeCityByZipByVerificationId(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				});
		}
		// }
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /members/{id}/tidbits
//
router.post(`/:id/tidbits`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var member = null;

		var resp = {
			statusCode: 201,
			message: memberText.get("TIDBIT_SUCCESS"),
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}

			if ((req.body.tidbitType === undefined) || (req.body.value === undefined)) {
				respond(resp, res, next, undefined, 400, "Tidbit type and value are required.");
			} else {


				createTidbit(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
					});
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



//
//  GET /members/{id}/tidbits
//
router.get(`/:id/tidbits`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var member = null;

		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			metaData: {
				totalCount: 0
			},
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}

			var limit = 10;
			var offset = 0;

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			getTidbits(req, resp, offset, limit)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});


//
//  GET /members/{id}/tidbits/{tid}
//
router.get(`/:id/tidbits/:tid`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var member = null;

		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}


			getTidbitById(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  DELETE /members/{id}/tidbits/{tid}
//
router.delete(`/:id/tidbits/:tid`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var member = null;

		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS")
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}


			removeTidbit(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  PUT /members/{id}/finds/{id}
//
router.put(`/:id/finds/:findId`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Member find update successfully."
		};


		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}

		if ((req.body.label === undefined) && (req.body.sortOrder === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "label and/or sortOrder"));
			respond(resp, res, next);
		} else {

			var result = await updateFindById(req.params.id, req.params.findId, req.body.label, req.body.sortOrder, resp);
			if (result.affectedRows === 0) {
				resp = formatResp(resp, undefined, 404, "Member find not found.");
			}

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  PUT /members/{id}/tidbits/{tid}
//
router.put(`/:id/tidbits/:tid`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var member = null;

		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS")
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.memberId != undefined)) {
				req.params.id = req.decoded.memberId;
			}


			updateTidbit(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /members/updateDateCreated
//
router.post(`/updateDateCreated`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		Members.updateDateCreatedByEmail(req.query.email, req.query.dateCreated)
			.then((id) => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});


//
//  POST /members/updateShopifyId
//
router.post(`/updateShopifyId`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
		};



		Members.updateShopifyIdByEmail(req.query.email, req.query.firstName, req.query.lastName, req.query.shopifyCustomerId)
			.then((id) => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});


//
//  POST /members/fbLogin
//
router.post(`/fbLogin`, async (req, res, next) => {
	try {
		// console.log("in fblogin");
		var appAccessToken = null;
		var createFlag = false;
		var me = null;
		var member = null;
		var memberId = null;
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGIN_SUCCESS"),
			data: {}
		};
		var responseFlag = false;
		var fbresult = null;
		var result = null;


		//	Check for a session
		if (req.get('x-access-token') !== undefined) {
			await jwtUtils.verifyTokenInline(req, resp);
	 }


		if (req.body.accessToken === undefined) {
			respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "accessToken"));
		}

		// console.log("initiating interaction");

		//
		//	Obtain access token for app
		//
		var app = await axios.get(`https://graph.facebook.com/oauth/access_token?client_id=${process.env.FB_APP_ID}&client_secret=${process.env.FB_CLIENT_SECRET}&grant_type=client_credentials`);
		if (app.status != 200) {
			respond(resp, res, next, ["data"], 400, "Unable to acquire app access token.");
		} else {

			appAccessToken = app.data.access_token;
			// console.log("step 2");

			//
			//	Validate the user access token.
			//
			var user = await axios.get(`https://graph.facebook.com/debug_token?input_token=${req.body.accessToken}&access_token=${appAccessToken}`);
			if (user.status != 200) {
				console.log("Error: " + user.data.error.message);
				respond(resp, res, next, ["data"], 401, memberText.get("LOGIN_FAIL"));
			} else {

				//
				//	Pluck the info we need from the user's profile.
				//
				result = await axios.get(`https://graph.facebook.com/v3.0/me?fields=email,first_name,last_name,picture&access_token=${req.body.accessToken}`);
				if ((result === undefined) || (result === undefined) || (result.status != 200)) {
					console.log("Error2: ");
					respond(resp, res, next, ["data"], 401, memberText.get("LOGIN_FAIL"));
				} else {

					me = result;
					// console.log('Facebook data: ' + JSON.stringify(me.data, undefined, 2));

					//
					//	If we have a member with this email already, link this facebook user to it.  Otherwise add member.
					//
					result = await Members.getByEmail(me.data.email);
					// console.log("Lookup by email: " + result.length);
					fbresult = await Members.getByFacebookId(me.data.id);
					// console.log("Lookup by id: " + fbresult.length);
					if ((result.length === 0) && (fbresult.length === 0)) {
						createFlag = true;

						// console.log('Facebook data: ' + JSON.stringify(me.data, undefined, 2));

						req.body.firstName = me.data.first_name;
						req.body.lastName = me.data.last_name;
						req.body.email = me.data.email;
						req.body.facebookId = me.data.id;
						req.body.photoUrl = me.data.picture.data.url;

						await signup(req, resp, undefined);
						resp.data.newMemberFlag = true;

						respond(resp, res, next);

					} else {
						if (result.length > 0) {
							member = result[0];
						} else {
							member = fbresult[0];
						}

						resp.data.newMemberFlag = false;

						memberId = member.id;

						console.log("Updating: " + memberId);

						result = await Members.updateById(memberId, true, {
							facebookId: me.data.id,
							photoUrl: me.data.picture.data.url,
							fbLinkedFlag: true,
							emailVerificationFlag: true
						}, member);

						if (member.status === 'OUTSIDE_GEOGRAPHIC') {
							await memberUtils.generateAccessToken(req, resp, memberId);

							//	If there's a session ID, attempt to link cart with the member.
							if ((req.decoded !== undefined) && (req.decoded.sessionId !== undefined) && (req.decoded.sessionId !== null)) {
								await ProductHolds.linkCart(req.decoded.sessionId, memberId);
							}

							respond(resp, res, next, undefined, 202, memberText.get("SIGNUP_OUTSIDE_SUCCESS"));
							responseFlag = true;
						}
						else {
							if (!responseFlag) {
								await memberUtils.generateAccessToken(req, resp, memberId);


							// req.tempId = memberId;
							// await MemberLogins.recordLogin(req, resp);
							respond(resp, res, next);
							}

						}

					}

					// if (createFlag === true) {
					// 	memberId = result;
					// 	result = await Members.getById(memberId);
					// 	member = result[0];
					// 	result = await Members.updateById(memberId, true, {
					// 		emailVerificationFlag: true
					// 	}, member);

					// 	comms.sendYoureInEmail(member);

					// } else {}

				}
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}

});


//
//  POST /members/current/fbLink
//
router.post(`/:id/fbLink`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var appAccessToken = null;
		var fbUser = null;
		var member = null;
		var prom = [];
		var resp = {
			statusCode: 200,
			message: memberText.get("FB_LINK_SUCCESS"),
		};



		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}


		if (req.body.accessToken === undefined) {
			respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "accessToken"));
		} else {
			//
			//	Obtain access token for app
			//
			axios.get(`https://graph.facebook.com/oauth/access_token?client_id=${process.env.FB_APP_ID}&client_secret=${process.env.FB_CLIENT_SECRET}&grant_type=client_credentials`)
				.then((app) => {
					if (app.status != 200) {
						throw new Error("Cannot acquire app access token.")
					}

					appAccessToken = app.data.access_token;

					//
					//	Validate the user access token.
					//
					return axios.get(`https://graph.facebook.com/debug_token?input_token=${req.body.accessToken}&access_token=${appAccessToken}`);
				})
				.then((user) => {

					if (user.status != 200) {
						respond(resp, res, next, undefined, 401, memberText.get("LOGIN_FAIL"));
					} else {
						fbUser = user;

						return Members.getById(req.params.id);
					}
				})
				.then((rows) => {
					if (rows.length === 0) {
						respond(resp, res, next, undefined, 404, memberText.get("MEMBER_404"));
					} else {
						member = rows[0];

						return Members.updateById(req.params.id, true, {
							facebookId: fbUser.data.data.user_id,
							fbLinkedFlag: true
						}, member);
					}
				})
				.then((result) => {
					respond(resp, res, next);
				})

				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  POST /members/current/fbUnlink
//
router.post(`/:id/fbUnlink`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var member = null;
		var resp = {
			statusCode: 200,
			message: memberText.get("FB_UNLINK_SUCCESS"),
		};


		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}


		Members.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					respond(resp, res, next, undefined, 404, memberText.get("MEMBER_404"));
				} else {
					member = rows[0];

					Members.updateById(req.params.id, true, {
							facebookId: null,
							fbLinkedFlag: false,
							photoUrl: null
						}, member)
						.then((results) => {

							respond(resp, res, next);
						})
				}
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  POST /members/login
//
router.post(`/login`, async (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGIN_SUCCESS"),
			data: {}
		};


		//	Check for a session
		if (req.get('x-access-token') !== undefined) {
	 		await jwtUtils.verifyTokenInline(req, resp);
		}


		if ((req.body.email === undefined) || (emailvalidator.validate(req.body.email) === false) || (req.body.password === undefined) || (req.body.password.trim().length === 0)) {
			respond(resp, res, next, ["id", "data"], 401, memberText.get("LOGIN_FAIL"));
		} else {
			var rows = await Members.getByEmail(req.body.email, true);

			//	No member with this email.
			if (rows.length === 0) {
				respond(resp, res, next, ["id", "data"], 401, memberText.get("LOGIN_FAIL"));
			} else {

				//	NULL password check
				if (rows[0].password === null) {
					respond(resp, res, next, ["data"], 412, memberText.get("MUST_SET_PSWD"));
				}

				//	Password check.
				else if (bcrypt.compareSync(req.body.password, rows[0].password) === false) {
					respond(resp, res, next, ["data"], 401, memberText.get("LOGIN_FAIL"));
				}

				//	All good so create JWT token and record the login.
				else {

					//	2020-07-23 Kyle wants removed.
					//	If haven't verified email yet...
					// if (rows[0].emailVerificationFlag === false) {
					// 	comms.sendVerificationEmail(rows[0]);
					// }

					await memberUtils.generateAccessToken(req, resp, rows[0].id);
					
					//	If there's a session ID, attempt to link cart with the member.
					if ((req.decoded !== undefined) && (req.decoded.sessionId !== undefined) && (req.decoded.sessionId !== null)) {
						await ProductHolds.linkCart(req.decoded.sessionId, rows[0].id);
					}

					if (rows[0].status === 'OUTSIDE_GEOGRAPHIC') {
						respond(resp, res, next, undefined, 202, memberText.get("SIGNUP_OUTSIDE_SUCCESS"));
					} else {
						respond(resp, res, next);
					}
				}
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


//
//  POST /members/{id}/logout
//
router.post(`/:id/logout`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGOUT_SUCCESS")
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}

		//
		//	Couldn't decode JWT token, simply respond logged out.
		//
		if ((req.decoded === undefined) || (req.decoded.memberId === undefined)) {
			respond(resp, res, next);

		}
		//
		//	Mark the token invalid.
		//
		else {
			MemberLogins.logout(req)
				.then((results) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /members/changePassword
//
router.post(`/changePassword`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("CHANGE_PSWD_SUCCESS")
		};

		var validationErrors = await memberUtils.validateMember(req, false);
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
//  GET /members/{id}/messages
//
router.get(`/:id/messages`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}


		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}

		var results = await getMemberMessages(req.params.id, offset, limit, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  GET /members/{id}/messages/{messageId}
//
router.get(`/:id/messages/:messageId`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}

		var results = await getMemberMessageById(req.params.id, req.params.messageId, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  DELETE /members/{id}/messages/{messageId}
//
router.delete(`/:id/messages/:messageId`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}

		var results = await deleteMemberMessageById(req.params.id, req.params.messageId, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  PUT /members/{id}/messages/{messageId}/markUnread
//
router.put(`/:id/messages/:messageId/markUnread`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}

		var results = await updateMemberMessageById(req.params.id, req.params.messageId, {
			status: 'UNREAD'
		}, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  PUT /members/{id}/messages/{messageId}/markRead
//
router.put(`/:id/messages/:messageId/markRead`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}

		var results = await updateMemberMessageById(req.params.id, req.params.messageId, {
			status: 'READ'
		}, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  PUT /members/{id}/messages/{messageId}/markDeleted
//
router.put(`/:id/messages/:messageId/markDeleted`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}

		var results = await updateMemberMessageById(req.params.id, req.params.messageId, {
			status: 'DELETED'
		}, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /members/{id}/messages/{messageId}/reply
//
router.post(`/:id/messages/:messageId/reply`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: memberText.get("GET_SUCCESS"),
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}


		if (req.body.message === undefined) {
			resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "message"));
			respond(resp, res, next);
		} else {
			var results = await createMemberMessageReply(req.params.id, req.params.messageId, req.body.message, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /members/{id}/messages
//
router.post(`/:id/messages`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Message created successfully."
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
		}

		if ((req.body.toMemberId === undefined) || (req.body.message === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "toMemberId, message"));
			respond(resp, res, next);
		} else {
			resp = await createMemberMessage(req.params.id, req.body.toMemberId, req.body.message, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /members/resetPassword
//
router.post(`/resetPassword`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("PSWD_RESET_SUCCESS")
		};

		if ((req.body.email === undefined) || (emailvalidator.validate(req.body.email) === false)) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "Email"));
		} else {
			Members.getByEmail(req.body.email, true)
				.then((rows) => {

					if (rows.length > 0) {
						var id = rows[0].id;
						var vid = uuidv1();
						var member = rows[0];

						//
						//	Only set an ID if there isn't one already.
						//
						if ((member.verificationId === null) || (member.verificationId.trim().length === 0)) {
							member.verificationId = vid;
						}

						//
						//	If password is null send special message for the one-time switch from shopify to rushmarket.com.
						//
						if (rows[0].password === null) {
							resp.message = memberText.get("ONCE_PSWD_RESET");
							comms.sendChangeEmail(member);
						} else {
							comms.sendResetEmail(member);
						}
						return Members.updateVerificationIdById(id, member.verificationId);
					}
				})
				.then(() => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /members/setPassword
//
router.post(`/setPassword`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("PSWD_SET_SUCCESS")
		};

		if ((req.body.email === undefined) || (emailvalidator.validate(req.body.email) === false)) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "Email"));
		} else {
			Members.getByEmail(req.body.email, true)
				.then((rows) => {

					if (rows.length > 0) {
						var id = rows[0].id;
						var vid = uuidv1();
						var member = rows[0];

						//
						//	Only set an ID if there isn't one already.
						//
						if ((member.verificationId === null) || (member.verificationId.trim().length === 0)) {
							member.verificationId = vid;
						}

						//
						//	If password is null send special message for the one-time switch from shopify to rushmarket.com.
						//
						comms.sendSetPasswordEmail(member);
						return Members.updateVerificationIdById(id, member.verificationId);
					}
					else {
						resp = formatResp(resp, undefined, 404, memberText.get("MEMBER_404"));
					}
				})
				.then(() => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});





//
//  POST /members/verifiyEmail
//
router.post(`/verifyEmail`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("EMAIL_VERIFIED")
		};

		if (req.query.verificationId === undefined) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "verificationId"));
		} else {

			resp = await verifyEmail(req, resp);
			if (resp.data != undefined) {
				resp.message = memberText.get("EMAIL_VERIFIED_MISSING_INFO");
			}
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  PUT /members  
//
router.put(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("UPDATE_SUCCESS")
		};

		if (req.query.verificationId === undefined) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "verificationId"));
		} else {

			updateByVerificationId(false, req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});


//
//  PUT /members/{id}
//
router.put(`/:id`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var internalFlag = true;
		var resp = {
			statusCode: 200,
			message: memberText.get("UPDATE_SUCCESS")
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
			internalFlag = false;
		}

		update(internalFlag, req, resp)
			.then((resp) => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			})

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});


//
//  POST /members/{id}/changeEmail
//
router.post(`/:id/changeEmail`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var internalFlag = true;
		var member = null;
		var prom = [];
		var resp = {
			statusCode: 200,
			message: memberText.get("VERIFY_EMAIL")
		};
		var sets = "";

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId;
			internalFlag = false;
		}

		changeEmail(internalFlag, req, resp)
			.then((resp) => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			})

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /members/moveLincolnInOmaha
//
//	Pull members from our member table who have their home city set to Omaha but 
//	have a zip in the Lincoln list and set their home city to Lincoln.
//
router.post(`/moveLincolnInOmaha`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		moveLincolnInOmaha(resp)
			.then(() => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



//
//  POST /members/moveLincolnInOutliers
//
//	Pull members from our member table who are slotted as Outliers but 
//	have a zip in the Lincoln list and set their home city to Lincoln.
//
router.post(`/moveLincolnInOutliers`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		moveLincolnInOutliers(resp)
			.then(() => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



//
//  POST /members/moveOutliers
//
//	Pull members from our member table who have outlier zips but are slotted in 
//	Omaha or Lincoln and move them to Outliers.
//
router.post(`/moveOutliers`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		moveOutliers(resp)
			.then(() => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



//
//  POST /members/moveLincolnToOmaha
//
//	Pull members with home city set to Lincoln and set home city to Omaha.  
//
router.post(`/moveLincolnToOmaha`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		moveLincolnToOmaha(resp)
			.then(() => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



//
//  POST /members/transitionLincolnToOmahaAdd,

//
//	Pull members with home city set to Lincoln and add to Omaha Shopify store.  
//
router.post(`/transitionLincolnToOmahaAdd`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		transitionLincolnToOmahaAdd(resp)
			.then(() => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});




//
//	Convert Lincoln member finds to the Omaha store.
//
router.post(`/transitionLincolnFinds`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		transitionLincolnFinds(resp)
			.then(() => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});





//
//  POST /members/transitionLincolnToOmahaTag,

//
//	Pull members with home city set to Lincoln and add to Omaha Shopify store.  
//
router.post(`/transitionLincolnToOmahaTag`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		await transitionLincolnToOmahaTag(resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



//
//  POST /members/transitionLincolnToOmahaTag,
//
//	Pull members with home city set to Lincoln and add to Omaha Shopify store.  
//
router.post(`/transitionOmahaTag`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		await transitionOmahaTag(resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



//
//  POST /members/moveNationalToOutliers
//
//	Pull members with home city set to Lincoln and set home city to Omaha.  
//
router.post(`/moveNationalToOutliers`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		moveNationalToOutliers(resp)
			.then(() => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});



//
//  POST /members/realignMembersToZips
//
//	Align member home cities with zip_to_city table.
//
router.post(`/realignMembersToZips`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		realignMembersToZips(resp)
			.then(() => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});




//
//  POST /members/tagAll
//
router.post(`/tagAll`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		tagAllMembers(req, resp)
			.then(() => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			});
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});





module.exports = router;