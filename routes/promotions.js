'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const {
	createPromotion,
	createPromotionScope,
	deletePromotion,
	deletePromotionScope,
	getAll,
	getById,
	getInScope,
	getPromoTiers,
	getTypes,
	updatePromotion
} = require('../actions/promotions');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  GET /promotions
//
router.get(`/`, async (req, res, next) => {
	try {
		var inactiveFlag = false;
		var limit = undefined;
		var offset = undefined;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};
		var sortBy = 'start_date ASC';

		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}

		if ((req.query.includeInactiveFlag !== undefined) && (req.query.includeInactiveFlag === "true")) {
			inactiveFlag = true;
		} else {
			whereInfo = sqlUtils.appendWhere(whereInfo, '(p.start_date <= now() AND p.end_date > now())');
		}


		resp = await getAll(whereInfo, sortBy, offset, limit, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})




//
//  GET /promotions/types
//
router.get(`/types`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		resp = await getTypes(resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
//  GET /promotions/{id}
//
router.get(`/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		resp = await getById(req.params.id, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
//  GET /promotions/{id}/inScope
//
router.get(`/:id/inScope`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		resp = await getInScope(req.params.id, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
//  GET /promotions/{id}/tiers
//
router.get(`/:id/tiers`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		resp = await getPromoTiers(req.params.id, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
//  POST /promotions
//
router.post(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success."
		};

		if ((req.body.promoTypeId === undefined) || (req.body.promoName === undefined) || (req.body.promoName === null) || (req.body.promoName.length === 0) ||
				(req.body.startDate === undefined) || (req.body.endDate === 0) ||
				(req.body.promoScope === undefined)) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "promoTypeId, promoName, startDate, endDate, promoScope"));
		} else {

			await createPromotion(req, resp);
			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  PUT /promotions/{id}
//
router.put(`/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success."
		};

		await updatePromotion(req, resp);
		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  DELETE /promotions/{id}
//
router.delete(`/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success."
		};

		await deletePromotion(req, resp);
		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /promotions/{id}/inScope
//
router.post(`/:id/inScope`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success."
		};

		if (req.body.scopeId === undefined) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "scopeId"));
		} else {

			await createPromotionScope(req, resp);
			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  DELETE /promotions/{id}/inScope/{sid}
//
router.delete(`/:id/inScope/:sid`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		await deletePromotionScope(req, resp);
		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





module.exports = router