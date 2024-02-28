'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const gde = require('../actions/gde');

const configUtils = require('../utils/configUtils');
const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const {
	formatResp,
	respond
} = require('../utils/response');
const memberText = require('../utils/memberTextUtils');



//
//  GET /gde/eligibility
//
router.get(`/eligibility`, async (req, res, next) => {
	try {
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

			if (req.query.sku === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku"));
				respond(resp, res, next);
			} else {

				if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
					storeFlag = true;
				}

				resp = await gde.determineEligibilityBySku({
					sku: req.query.sku,
					metros: req.query.metros ? req.query.metros : null,
				}, resp, storeFlag);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




//
//  GET /gde/effectiveEligibility
//
router.get(`/effectiveEligibility`, async (req, res, next) => {
	try {
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

			if ((req.query.cityId === undefined) || ((req.query.sku === undefined) && (req.query.coinId === undefined))) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "cityId and sku or coinId"));
				respond(resp, res, next);
			} else {

				resp = await gde.getEffectiveEligibility(req.query.sku, req.query.coin, req.query.cityId);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




//
//  GET /gde/export
//
// router.get(`/export`, async (req, res, next) => {
// 	try {
// 		var resp = {
// 			statusCode: 200,
// 			message: "Success.",
// 			data: {}
// 		}
// 		var storeFlag = false;

// 		//
// 		//	Only allow internal API calls.
// 		//
// 		if (req.get('x-app-type') != 'INT') {
// 			respond(resp, res, next, ["data"], 403, "Access denied.");
// 		} else {
// 			resp = await gdeCalcUtils.processGDEExport(resp, {exportFile: null});
// 		}
// 	} catch (e) {
// 		logUtils.routeExceptions(e, req, res, next, resp, null);
// 	}
// });




//
//  GET /gde/margin
//
router.get(`/margin`, async (req, res, next) => {
	try {
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

			if (req.query.sku === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku"));
				respond(resp, res, next);
			} else {

				if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
					storeFlag = true;
				}

				resp = await gde.calcMarginBySku({
					sku: req.query.sku,
					metros: req.query.metros ? req.query.metros : null,
				}, resp, storeFlag);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




//
//  GET /gde/queueEligibilityAllSkus
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

			resp = await gde.queueEligibilityAllSkus(cityId, categoryId, req.query.priority, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  GET /gde/queueMarginAllSkus
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

			resp = await gde.queueMarginAllSkus(cityId, categoryId, req.query.priority, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});


//
//  GET /gde/queueShipCalcAllSkus
//
router.get(`/queueShipCalcAllSkus`, async (req, res, next) => {
	try {
		let categoryId = undefined;
		let cityId = undefined;
		let manufacturer = undefined;
		let priority = req.query.priority ? req.query.priority : 2;
		let resp = {
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

			if (req.query.manufacturer !== undefined) {
				manufacturer = req.query.manufacturer;
			}

			if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
				storeFlag = true;
			}

			resp = await gde.queueShipCalcAllSkus(cityId, categoryId, manufacturer, req.query.metros, priority, req.query.shipType, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});







//
//  GET /gde/queueEligibilityCalc
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
//  POST /gde/queueEligibilityCalcBulk
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
//  GET /gde/queueMarginCalc
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
//  POST /gde/queueMarginCalcBulk
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
//  GET /gde/queueShipCalc
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


			if (req.query.sku === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku"));
				respond(resp, res, next);
			} else {
				resp = await gde.queueShipCalcBySku({
					sku: req.query.sku,
					metros: req.query.metros ? req.query.metros : null,
					batchLabel: req.query.batchLabel,
					minimizeRateCallsFlag: (configUtils.get("GDE_MINIMIZE_RATE_CALLS") === "ON") ? true : false,
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
//  POST /gde/queueShipCalcBulk
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

			if ((req.body.msgs === undefined) && (req.body.skus === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "msgs or skus"));
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
//  GET /gde/shipCost
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

			if (req.query.sku === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku"));
				respond(resp, res, next);
			} else {

				if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
					storeFlag = true;
				}

				if ((req.query.includeRawFlag !== undefined) && (req.query.includeRawFlag === 'true')) {
					includeRawFlag = true;
				}

				resp = await gde.calcAvgShipCostBySku({
					sku: req.query.sku,
					metros: req.query.metros ? req.query.metros : null,
					includeRaw: ((req.query.includeRaw !== undefined) && (req.query.includeRaw === 'true')) ? true : false
				}, resp, storeFlag, includeRawFlag);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  GET /gde/ripple
//
router.get(`/ripple`, async (req, res, next) => {
	try {
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

			if (req.query.sku === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku"));
				respond(resp, res, next);
			} else {

				if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
					storeFlag = true;
				}

				resp = await gde.determineRippleBySku({
					sku: req.query.sku,
					metros: req.query.metros ? req.query.metros : null,
				}, resp, storeFlag);
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

			if (req.query.sku === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku"));
				respond(resp, res, next);
			} else {

				if ((req.query.storeFlag !== undefined) && (req.query.storeFlag === 'true')) {
					storeFlag = true;
				}

				if ((req.query.includeRawFlag !== undefined) && (req.query.includeRawFlag === 'true')) {
					includeRawFlag = true;
				}

				resp = await gde.calculateBySku({
					sku: req.query.sku,
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
//  GET /gde/reloadMetros
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



//
//  GET /gde/{id}
//
router.get(`/:id`, async (req, res, next) => {
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

			resp = await gde.getGDEData(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /gde/notifySkuMovement
//
router.post(`/notifySkuMovement`, async (req, res, next) => {
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

			if ((req.body.sku === undefined) ||
				(req.body.originStoreId === undefined) || (req.body.originLocation === undefined) ||
				(req.body.destStoreId === undefined) || (req.body.destLocation === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku, originStoreId, originLocation, destStoreId, destLocation"));
				respond(resp, res, next);
			} else {
				await gde.skuMovement(req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  PUT /gde/overrideRipple
//
router.put(`/overrideRipple`, jwtUtils.verifyToken, async (req, res, next) => {
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

			if (req.body.sku === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku"));
				respond(resp, res, next);
			} else {
				await gde.overrideRipple(req, resp);
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});




//
//  POST /gde/estimateEligibility
//
router.post(`/estimateEligibility`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		}

		//
		//	Only allow internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ["data"], 403, "Access denied.");
		} else {

			if ((req.body.originZip === undefined) || (req.body.categoryId === undefined) || (req.body.boxes === undefined) ||
				(req.body.shipType === undefined) || (req.body.sellingPrice === undefined) || (req.body.productCost === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "originZip, categoryId, boxes, shipType, sellingPrice, productCost"));
				respond(resp, res, next);
			} else if ((req.body.shipType.toLowerCase() !== 'small parcel') && (req.body.shipType.toLowerCase() !== 'ltl')) {
				resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "shipType"));
				respond(resp, res, next);
			} else {
				gde.validateBoxInfo(req.body.boxes, resp);

				if (resp.statusCode === 200) {
					await gde.estimateEligibility(req.body, resp);
				}
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});






module.exports = router;