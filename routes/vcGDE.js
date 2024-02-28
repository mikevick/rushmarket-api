'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const vcGDE = require('../actions/vcGDE');

const logUtils = require('../utils/logUtils');
const {
	formatResp,
	respond
} = require('../utils/response');
const memberText = require('../utils/memberTextUtils');



//
//  GET /vcGDE/queueEligibilityAllSkus
//
router.get(`/queueEligibilityAllSkus`, async (req, res, next) => {
	try {
		var categoryId = undefined;
		var cityId = undefined;
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if ((req.query.categoryId !== undefined) && (check.integer(parseInt(req.query.categoryId)))) {
				categoryId = parseInt(req.query.categoryId);
			}

			if ((req.query.cityId !== undefined) && (check.integer(parseInt(req.query.cityId)))) {
				cityId = parseInt(req.query.cityId);
			}

			if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
				storeFlag = true;
			}

			resp = await gde.queueEligibilityAllSkus(cityId, categoryId, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  GET /vcGDE/queueMarginAllSkus
//
router.get(`/queueMarginAllSkus`, async (req, res, next) => {
	try {
		var categoryId = undefined;
		var cityId = undefined;
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if ((req.query.categoryId !== undefined) && (check.integer(parseInt(req.query.categoryId)))) {
				categoryId = parseInt(req.query.categoryId);
			}

			if ((req.query.cityId !== undefined) && (check.integer(parseInt(req.query.cityId)))) {
				cityId = parseInt(req.query.cityId);
			}

			if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
				storeFlag = true;
			}

			resp = await gde.queueMarginAllSkus(cityId, categoryId, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  GET /vcGDE/queueShipCalcAllSkus
//
router.get(`/queueShipCalcAllSkus`, async (req, res, next) => {
	try {
		var categoryId = undefined;
		var cityId = undefined;
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if ((req.query.categoryId !== undefined) && (check.integer(parseInt(req.query.categoryId)))) {
				categoryId = parseInt(req.query.categoryId);
			}

			if ((req.query.cityId !== undefined) && (check.integer(parseInt(req.query.cityId)))) {
				cityId = parseInt(req.query.cityId);
			}

			if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
				storeFlag = true;
			}

			resp = await vcGDE.queueShipCalcAllSkus(cityId, categoryId, req.query.markets, req.query.priority, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  GET /vcGDE/queueShipCalcDropShipSkus
//
router.get(`/queueShipCalcDropShipSkus`, async (req, res, next) => {
	try {
		var categoryId = undefined;
		var cityId = undefined;
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if ((req.query.categoryId !== undefined) && (check.integer(parseInt(req.query.categoryId)))) {
				categoryId = parseInt(req.query.categoryId);
			}

			if ((req.query.cityId !== undefined) && (check.integer(parseInt(req.query.cityId)))) {
				cityId = parseInt(req.query.cityId);
			}

			if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
				storeFlag = true;
			}

			resp = await vcGDE.queueShipCalcDropShipSkus(cityId, categoryId, req.query.markets, req.query.vendorId, req.query.priority, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  GET /vcGDE/queueEligibilityCalc
//
router.get(`/queueEligibilityCalc`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if (req.query.sku === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku"));
				respond(resp, res, next);
			} else {
				resp = await gde.queueEligibilityCalcBySku({
					sku: req.query.sku,
					metros: req.query.metros ? req.query.metros : null,
					batchLabel: req.query.batchLabel
				}, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




//
//  POST /vcGDE/queueEligibilityCalcBulk
//
router.post(`/queueEligibilityCalcBulk`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if (req.body.msgs === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "msgs"));
				respond(resp, res, next);
			} else {
				resp = await gde.queueEligibilityCalcBySkuBulk(req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




//
//  GET /vcGDE/queueMarginCalc
//
router.get(`/queueMarginCalc`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if (req.query.sku === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku"));
				respond(resp, res, next);
			} else {
				resp = await gde.queueMarginCalcBySku({
					sku: req.query.sku,
					metros: req.query.metros ? req.query.metros : null,
					batchLabel: req.query.batchLabel
				}, resp);
				respond(resp, res, next);
			}

		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /vcGDE/queueMarginCalcBulk
//
router.post(`/queueMarginCalcBulk`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if (req.body.msgs === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "msgs"));
				respond(resp, res, next);
			} else {
				resp = await gde.queueMarginCalcBySkuBulk(req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




//
//  GET /vcGDE/queueShipCalc
//
router.get(`/queueShipCalc`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {


			if ((req.query.vendorId === undefined) || (req.query.vendorSku === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "vendorId, vendorSku"));
				respond(resp, res, next);
			} else {
				resp = await vcGDE.queueShipCalcBySku({
					vendorId: req.query.vendorId,
					vendorSku: req.query.vendorSku,
					metros: req.query.metros ? req.query.metros : null,
					batchLabel: req.query.batchLabel,
					priority: req.query.priority ? req.query.priority : 0
				}, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /vcGDE/queueShipCalcBulk
//
router.post(`/queueShipCalcBulk`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if (req.body.msgs === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "msgs"));
				respond(resp, res, next);
			} else {
				resp = await gde.queueShipCalcBySkuBulk(req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




//
//  GET /vcGDE/shipCost
//
router.get(`/shipCost`, async (req, res, next) => {
	try {
		var includeRawFlag = false;
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		}
		var storeFlag = false;

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if ((req.query.vendorId === undefined) || (req.query.vendorSku === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "vendorId, vendorSku"));
				respond(resp, res, next);
			} else {

				if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
					storeFlag = true;
				}

				if ((req.query.includeRawFlag !== undefined) && (req.query.includeRawFlag === 'true')) {
					includeRawFlag = true;
				}

				resp = await vcGDE.calcAvgShipCostBySku({
					vendorId: req.query.vendorId,
					vendorSku: req.query.vendorSku,
					metros: req.query.metros ? req.query.metros : null,
					batchLabel: req.query.batchLabel
				}, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




//
//  GET /gde/calculate
//
router.get(`/calculate`, async (req, res, next) => {
	try {
		var includeRawFlag = false;
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		}
		var storeFlag = false;

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if ((req.query.vendorId === undefined) || (req.query.vendorSku === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "vendorId, vendorSku"));
				respond(resp, res, next);
			} else {

				if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
					storeFlag = true;
				}

				if ((req.query.includeRawFlag !== undefined) && (req.query.includeRawFlag === 'true')) {
					includeRawFlag = true;
				}

				resp = await vcGDE.calculateByVendorSku({
					vendorId: req.query.vendorId,
					vendorSku: req.query.vendorSku,
					metros: req.query.metros ? req.query.metros : null,
				}, resp, storeFlag, includeRawFlag);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




//
//  GET /vcGDE
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') !== 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			resp = await vcGDE.getVCGDEData(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});






//
//  GET /vcGDE/reloadMetros
//
router.get(`/reloadMetros`, async (req, res, next) => {
	try {
		var includeRawFlag = false;
		var resp = {
			statusCode: 200,
			message: "Success.",
		}
		var storeFlag = false;

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			await gde.reloadMetros();
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});






module.exports = router;