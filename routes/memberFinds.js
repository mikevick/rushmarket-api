'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const {
	getMemberFindById,
	getMemberFinds,
	notify,
	removeFindById,
	removeFinds,
	storeFind,
	updateFindById
} = require('../actions/members');

const jwtUtils = require('../actions/jwtUtils');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	formatResp,
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  DELETE /membersFinds/
//
router.delete(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Member finds removed successfully."
		};


		//	Use this to delete ALL of a member's finds or those limited to a label.
		var result = await removeFinds(req.decoded.memberId, req.query.label, resp);
		if (result.affectedRows === 0) {
			resp = formatResp(resp, undefined, 404, "Member finds not found.");
		}

		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  DELETE /memberFinds/{findId}
//
router.delete(`/:findId`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Member find removed successfully."
		};



		if (req.query.store === undefined) {
			resp = formatResp(resp, undefined, 400, "Store required.");
			respond(resp, res, next);
		} else {

			//	Use this to delete ALL of a member's finds or those limited to a label.
			var result = await removeFindById(req.decoded.memberId, req.query.store, req.params.findId, resp);
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
//  GET /memberFinds
//
router.get(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};
		var sortBy = 'date_created';

		if (req.query.sortBy) {
			sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['dateCreated', 'sortOrder', 'savings', 'price']);

			if (sortBy === 'field') {
				respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
			} else if (sortBy === 'direction') {
				respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
			}
		}

		if ((sortBy != 'field') && (sortBy != 'direction')) {
			await getMemberFinds(req.decoded.memberId, req.query.store, req.query.label, req.query.coinId, sortBy, resp);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  GET /memberFinds/{findId}
//
router.get(`/:findId`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("GET_SUCCESS"),
			data: {}
		};


		await getMemberFindById(req.decoded.memberId, req.params.findId, resp);

		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /memberFinds
//
router.post(`/`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: memberText.get("GET_SUCCESS"),
		};

		if ((req.query.sortOrder !== undefined) && (!check.integer(parseInt(req.query.sortOrder)))) {
			resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "sortOrder"));
			respond(resp, res, next);
		} else if ((req.query.label === undefined) || (req.query.coinId === undefined) || (req.query.store === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "store, label, coinId"));
			respond(resp, res, next);
		} else if ((req.query.label === null) || (req.query.label.length === 0)) {
			resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "label"));
			respond(resp, res, next);
		} else {
			await storeFind(req.query.store, req.decoded.memberId, req.query.label, req.query.coinId, req.query.sortOrder, resp);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});




//
//  PUT /memberFinds/:findId
//
router.put(`/:findId`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Member find update successfully."
		};


		if ((req.query.label === undefined) && (req.query.sortOrder === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "label and/or sortOrder"));
			respond(resp, res, next);
		} else {

			var result = await updateFindById(req.decoded.memberId, req.params.findId, req.query.label, req.query.sortOrder, resp);
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
//  GET /memberFinds/notify
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: memberText.get("GET_SUCCESS"),
		};

		if ((req.query.productId === undefined) || (req.query.store === undefined)) {
			resp = formatResp(resp, undefined, 400, "ProductId required.");
			respond(resp, res, next);
		} else {
			await notify(req.query.store, req.query.productId, resp);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});




module.exports = router;