'use strict'

const check = require('check-types')
const express = require('express')
const router = express.Router()
const moment = require('moment-timezone');

const markets = require('../actions/markets')

const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const memberText = require('../utils/memberTextUtils')
const sqlUtils = require('../utils/sqlUtils')


//
// Create Market
//
// router.post(`/`, (req, res, next) => {
// 	try {
// 		var resp = {
// 			statusCode: 201,
// 			message: 'Success.',
// 			id: 0
// 		}

// 		if (req.body.name === undefined || req.body.cityId === undefined || req.body.marginEligibilityThreshold === undefined) {
// 			//  || req.body.targetMarketingContribution === undefined || req.body.targetContribution === undefined) {
// 			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'name, cityId, marginEligibilityThreshold'));
// 		} else {
// 			if (!check.number(parseFloat(req.body.marginEligibilityThreshold)) ||
// 				(check.number(parseFloat(req.body.marginEligibilityThreshold)) && (parseFloat(req.body.marginEligibilityThreshold) < 1) || (parseFloat(req.body.marginEligibilityThreshold) > 100))) {
// 				response.respond(resp, res, next, ['id'], 400, 'Margin Eligibility Threshold must be a number between 1-100')
// 				// } else if (!(check.number(parseFloat(req.body.targetMarketingContribution))) || (check.number(parseFloat(req.body.targetMarketingContribution)) && !(parseFloat(req.body.targetMarketingContribution) > 0))) {
// 				//   response.respond(resp, res, next, ['id'], 400, 'Target Marketing Contribution must be a number and greater than 0')
// 				// } else if (!(check.number(parseFloat(req.body.targetContribution))) || (check.number(parseFloat(req.body.targetContribution)) && !(parseFloat(req.body.targetContribution) > 0))) {
// 				//   response.respond(resp, res, next, ['id'], 400, 'Target Contribution must be a number and greater than 0')
// 			} else {
// 				metros.create(req.body.name, req.body.cityId, req.body.marginEligibilityThreshold, req.body.targetMarketingContribution, req.body.targetContribution, resp)
// 					.then((resp) => {
// 						response.respond(resp, res, next)
// 					})
// 					.catch((e) => {
// 						logUtils.routeExceptions(e, req, res, next, resp, undefined)
// 					})
// 			}
// 		}
// 	} catch (e) {
// 		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
// 	}
// })



//
//  Get Markets
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		resp = await markets.getAll(resp);
		response.respond(resp, res, next)
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})





//
// Update Market
//
router.put('/:id', async (req, res, next) => {
	try {
		var valid = true
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}

		if (req.body.storeType !== undefined) {
			if ((req.body.storeType !== 'ONLINE') && (req.body.storeType !== 'PHYSICAL')) {
				response.respond(resp, res, next, ['id'], 400, 'Store type must be ONLINE or PHYSICAL')
				valid = false
			}
		}
		if (req.body.marketType !== undefined) {
			if ((req.body.marketType !== 'FULFILLMENT_CENTER') && (req.body.marketType !== 'OPEN_MARKET')) {
				response.respond(resp, res, next, ['id'], 400, 'Market type must be FULFILLMENT_CENTER or OPEN_MARKET')
				valid = false
			}
		}
		if (req.body.marketOpen !== undefined) {
			if (!moment(req.body.marketOpen).isValid()) {
				response.respond(resp, res, next, ['id'], 400, 'Invalid marketOpenMarket: must be of format YYYY-MM-DD hh:mm:ss')
				valid = false
			}
		}
		if (req.body.onlineAvailable !== undefined) {
			if ((req.body.onlineAvailable !== 'Y') && (req.body.onlineAvailable !== 'N')) {
				response.respond(resp, res, next, ['id'], 400, 'Invalid onlineAvailable: must be Y or N')
				valid = false
			}
		}
		if (req.body.curbsideAvailable !== undefined) {
			if ((req.body.curbsideAvailable !== 'Y') && (req.body.curbsideAvailable !== 'N')) {
				response.respond(resp, res, next, ['id'], 400, 'Invalid curbsideAvailable: must be Y or N')
				valid = false
			}
		}

		if (valid) {
			resp = await markets.updateById(req.params.id, req, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})


//
//  Get Market
//
router.get(`/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		resp = await markets.getById(req.params.id, resp);
		response.respond(resp, res, next)
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})



//
//  Get Market Ripple Settings
//
router.get(`/:id/rippleSettings`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		resp = await markets.getMarketRippleSettings(req.params.id, resp);
		response.respond(resp, res, next)
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})



//
//  Update Market Ripple Settings
//
router.put(`/:id/rippleSettings/:sid`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}


		if ((req.body.activeFlag === undefined) || ((req.body.activeFlag !== true) && (req.body.activeFlag !== false))) {
			response.respond(resp, res, next, ['id'], 400, 'Invalid activeFlag: must be true or false')
		}
		else {
			resp = await markets.updateMarketRippleSettings(req, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})



//
//  Create Market Ripple Category Override
//
router.post(`/:id/categoryOverrides`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		}

		if ((req.body.state === undefined) || (req.body.state === null) ||
				(req.body.categoryId === undefined) || (req.body.categoryId === null) ||
				(req.body.daysInStateOverride === undefined) || (req.body.daysInStateOverride === null)) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'state, categoryId, daysInStateOverride'));
		}
		else {
			resp = await markets.createMarketRippleCategoryOverrides(req.params.id, req, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


//
//  Update Market Ripple Category Override
//
router.put(`/:id/categoryOverrides/:oid`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}

		if ((req.body.daysInStateOverride === undefined) || (req.body.daysInStateOverride === null)) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'daysInStateOverride'));
		}
		else {
			resp = await markets.updateMarketRippleCategoryOverride(req.params.id, req.params.oid, req, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


//
//  Delete Market Ripple Category Override
//
router.delete(`/:id/categoryOverrides/:oid`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}

		resp = await markets.deleteMarketRippleCategoryOverride(req.params.id, req.params.oid, resp);
		response.respond(resp, res, next)
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


//
//  Get Market Category Overrides
//
router.get(`/:id/categoryOverrides`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}
		var sortBy = 'name ASC';
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};



		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {


			whereInfo = sqlUtils.appendWhere(whereInfo, 'market_id = ?', [req.params.id]);

			if (req.query.state) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'state = ?', [req.query.state]);
			}


			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['name', 'daysInState']);

				if (sortBy === 'field') {
					response.respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					response.respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}



			resp = await markets.getMarketRippleCategoryOverrides(req.params.id, whereInfo, sortBy, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})




//
//  Get Market Ripple Location Overrides
//
router.get(`/:id/locationOverrides`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}
		var sortBy = 'storage_area_name ASC';
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};


		whereInfo = sqlUtils.appendWhere(whereInfo, 'm.id = ?', [req.params.id]);

		if (req.query.state) {
			whereInfo = sqlUtils.appendWhere(whereInfo, 'state = ?', [req.query.state]);
		}


		if (req.query.sortBy) {
			sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['storageAreaName', 'daysInState']);

			if (sortBy === 'field') {
				response.respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
			} else if (sortBy === 'direction') {
				response.respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
			}
		}


		resp = await markets.getMarketRippleLocationOverrides(req.params.id, whereInfo, sortBy, resp);
		response.respond(resp, res, next)
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})



//
//  Get Market Ripple Location Overrides
//
router.post(`/:id/locationOverrides`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		}

		if ((req.body.state === undefined) || (req.body.state === null) || 
				(req.body.storageArea === undefined) || (req.body.storageArea === null) ||
				(req.body.daysInStateOverride === undefined) || (req.body.daysInStateOverride === null)) {
 			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'state, storageArea, daysInStateOverride'));
		}
		else {
			resp = await markets.createMarketRippleLocationOverride(req.params.id, req, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})



//
//  Update Market Ripple Location Override
//
router.put(`/:id/locationOverrides/:oid`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}

		if ((req.body.daysInStateOverride === undefined) || (req.body.daysInStateOverride === null)) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'daysInStateOverride'));
		}
		else {
			resp = await markets.updateMarketRippleLocationOverride(req.params.id, req.params.oid, req, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


//
//  Delete Market Ripple Location Override
//
router.delete(`/:id/locationOverrides/:oid`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}

		resp = await markets.deleteMarketRippleLocationOverride(req.params.id, req.params.oid, resp);
		response.respond(resp, res, next)
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})






//
//  Create Market Ripple Override
//
router.post(`/:id/rippleOverrides`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		}

		if ((req.body.state === undefined) || (req.body.state === null) || 
				(req.body.daysInStateOverride === undefined) || (req.body.daysInStateOverride === null)) {
 			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'state, daysInStateOverride'));
		}
		else {
			resp = await markets.createMarketRippleOverride(req.params.id, req, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})



//
//  Update Market Ripple Override
//
router.put(`/:id/rippleOverrides/:oid`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}

		if ((req.body.daysInStateOverride === undefined) || (req.body.daysInStateOverride === null)) {
 			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'daysInStateOverride'));
		}
		else {
			resp = await markets.updateMarketRippleOverride(req.params.id, req.params.oid, req, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


//
//  Delete Market Ripple Override
//
router.delete(`/:id/rippleOverrides/:oid`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}

		resp = await markets.deleteMarketRippleOverride(req.params.id, req.params.oid, resp);
		response.respond(resp, res, next)
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})






//
//  Get Market Ripple Skus
//
router.get(`/:id/rippleSkus`, async (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}
		var sortBy = 'sku ASC';



		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			
			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku', 'name', 'category', 'state']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}


			resp = await markets.getMarketRippleSkus(req.params.id, sortBy, offset, limit, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})




//
//  GET /markets/{id}/resetMarket
//
router.post(`/:id/resetMarket`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			await markets.resetMarket(req.params.id, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /markets/forceNationwide
//
router.post(`/forceNationwide`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//	Only allow from internal API calls.
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		}
		else if (req.query.marketId === undefined) {
			response.respond(resp, res, next, undefined, 400, "Must provide market ID.");
		} else {

			await markets.forceNationwide(req.query.marketId, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /markets/{id}/transitionToFulfillmentCenter
//
router.post(`/:id/transitionToFulfillmentCenter`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//	Only allow from internal API calls.
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		}
		else {
			await markets.transitionToFulfillmentCenter(req.params.id, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





//
//  GET /markets/{id}/transitionToOpenMarket
//
router.post(`/:id/transitionToOpenMarket`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//	Only allow from internal API calls.
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {
			await markets.transitionToOpenMarket(req.params.id, req.query.ripple, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});








module.exports = router