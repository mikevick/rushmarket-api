'use strict'

const check = require('check-types')
const express = require('express')
const router = express.Router()

const memberCheckouts = require('../actions/memberCheckouts')

const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const memberText = require('../utils/memberTextUtils')
const sqlUtils = require('../utils/sqlUtils')


//
// Create Member Checkout
//
router.post(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		}

		if ((req.body.memberId === undefined) && (req.body.sessionId === undefined)) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'memberId or sessionId'));
		}
		else if ((req.body.checkoutId === undefined) || (req.body.firstName === undefined) || (req.body.lastName === undefined) ||
			(req.body.address1 === undefined) || (req.body.city === undefined) || (req.body.state === undefined) || (req.body.zip === undefined) ||
			(req.body.country === undefined) || (req.body.email === undefined)) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'checkoutId, memberId, firstName, lastName, address1, city, state, zip, country, email'));
		} else {
			memberCheckouts.create(req.body.checkoutId, req.body.memberId, req.body.sessionId, req.body.firstName, req.body.lastName,
					req.body.address1, req.body.address2, req.body.city, req.body.state, req.body.zip,
					req.body.country, req.body.email, req.body.phone, req.body.activeFlag, req.body.note, resp)
				.then((resp) => {
					response.respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined)
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})



//
// Update Checkout
//
router.put('/:id', (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			id: 0
		}


		memberCheckouts.updateById(req.params.id, req, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined)
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})



//
//  Get Member Checkout
//
router.get(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		memberCheckouts.getById(req.params.id, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined)
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})



//
// delete Metro by id (DELETE)
//
router.delete(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}
		metros.remove(req.params.id, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ['id'])
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})



//
// Create Metro to Sample Zip mapping POST)
//
router.post(`/:id/sampleZips`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		}

		if (req.body.zip === undefined) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'zip'))
		} else {
			metros.createMetroToSampleZip(req.params.id, req.body.zip, req.body.cityName, req.body.weight, resp)
				.then((resp) => {
					response.respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined)
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})



//
// Update sample zip
//
router.put('/:id/sampleZips/:zid', (req, res, next) => {
	try {
		var valid = true
		var resp = {
			statusCode: 200,
			message: 'Success.',
			id: 0
		}
		var setInfo = {
			clause: '',
			values: []
		}

		// validation: must be changing status or name values and status must be active or inactive
		if (req.body.zip) {
			setInfo = sqlUtils.appendSet(setInfo, 'zip = ?', req.body.zip)
		}
		if (req.body.cityName) {
			setInfo = sqlUtils.appendSet(setInfo, 'city_name = ?', req.body.cityName)
		}
		if (req.body.weight) {
			setInfo = sqlUtils.appendSet(setInfo, 'weight = ?', req.body.weight)
		}
		if (setInfo.clause.length > 0) {
			// create setInfo

			metros.updateSampleZipByMetroId(req.params.id, req.params.zid, setInfo, resp)
				.then((resp) => {
					response.respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined)
				})
		} else {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'zip, city name, or weight'))
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})



//
//	Get sample zip mapping by market id (GET)
//
router.get(`/:id/sampleZips`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		metros.getSampleZipsByMetroId(req.params.id, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined)
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


//
//	Get market sample zip mapping by id (GET)
//
router.get(`/:id/sampleZips/:zid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		metros.getSampleZipBySampleZipId(req.params.zid, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined)
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


//
//	Delete sample zip by id (DELETE)
//
router.delete(`/:id/sampleZips/:zid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}

		metros.removeSampleZipBySampleZipId(req.params.zid, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ['id'])
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})



//
// Create market category override 
//
router.post(`/:id/categoryOverrides`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		}

		if ((req.body.categoryId === undefined) || (req.body.categoryId === null) ||
			(req.body.marginEligibilityThreshold === undefined) || (req.body.marginEligibilityThreshold === null)) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'categoryId, marginEligibilityThreshold'));
		} else {
			if (!check.number(parseFloat(req.body.marginEligibilityThreshold)) ||
				(check.number(parseFloat(req.body.marginEligibilityThreshold)) && (parseFloat(req.body.marginEligibilityThreshold) < 1) || (parseFloat(req.body.marginEligibilityThreshold) > 100))) {
				response.respond(resp, res, next, ['id'], 400, 'marginEligibilityThreshold must be a number between 1-100');
			}

			metros.createCategoryOverride(req.params.id, req.body.categoryId, req.body.marginEligibilityThreshold, resp)
				.then((resp) => {
					response.respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined)
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})



//
// Update category override
//
router.put('/:id/categoryOverrides/:oid', async (req, res, next) => {
	try {
		var valid = true
		var resp = {
			statusCode: 200,
			message: 'Success.',
		}
		var setInfo = {
			clause: '',
			values: []
		}


		if (((req.body.categoryId === undefined) || (req.body.categoryId === null)) &&
			((req.body.marginEligibilityThreshold === undefined) || (req.body.marginEligibilityThreshold === null))) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'marketId, categoryId, marginEligibilityThreshold'))
		} else {
			if (req.body.categoryId != undefined) {

				if ((!check.number(parseFloat(req.body.categoryId))) || (parseFloat(req.body.categoryId) < 1)) {
					response.respond(resp, res, next, ['id'], 400, 'categoryId must be a positive integer')
					valid = false;
				} else {
					setInfo = sqlUtils.appendSet(setInfo, 'category_id = ?', req.body.categoryId);
				}
			}

			if (req.body.marginEligibilityThreshold != undefined) {
				if ((!check.number(parseFloat(req.body.marginEligibilityThreshold)) ||
						(check.number(parseFloat(req.body.marginEligibilityThreshold)) && (parseFloat(req.body.marginEligibilityThreshold) < 1) || (parseFloat(req.body.marginEligibilityThreshold) > 100)))) {
					response.respond(resp, res, next, ['id'], 400, 'marginEligibilityThreshold must be a number between 1-100')
					valid = false;
				} else {
					setInfo = sqlUtils.appendSet(setInfo, 'margin_eligibility_threshold = ?', req.body.marginEligibilityThreshold);
				}
			}


			if ((valid) && (setInfo.clause.length > 0)) {
				resp = await metros.updateCategoryOverride(req.params.id, req.params.oid, setInfo, resp);
				response.respond(resp, res, next)
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})



//
//	Get category overrides by market
//
router.get(`/:id/categoryOverrides`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		metros.getCategoryOverrides(req.params.id, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined)
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


//
//	Get category overrides by id
//
router.get(`/:id/categoryOverrides/:oid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		metros.getCategoryOverridesById(req.params.oid, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined)
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


//
//	Delete override
//
router.delete(`/:id/categoryOverrides/:oid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}

		metros.removeCategoryOverride(req.params.oid, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ['id'])
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})












/** ***********************Shopify Stores*****************************/
// Create bubble to shopify store (POST)
router.post(`/:id/shopifyStores`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		}

		if (req.body.shopifyStoreId === undefined) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'shopify store id'))
		} else {
			Bubbles.createBubbleToShopifyStore(req.params.id, req.body.shopifyStoreId, resp)
				.then((resp) => {
					response.respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined)
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})

// Update Bubble to shopify store (PUT)
router.put('/:id/shopifyStores', (req, res, next) => {
	try {
		var valid = true
		var resp = {
			statusCode: 200,
			message: 'Success.',
			id: 0
		}
		var setInfo = {
			clause: '',
			values: []
		}

		// validation: must be changing status or name values and status must be active or inactive
		if (req.body.shopifyStoreId === undefined) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'shopify store id'))
		} else {
			// create setInfo
			setInfo = sqlUtils.appendSet(setInfo, 'shopify_store_id = ?', req.body.shopifyStoreId)

			Bubbles.updateShopifyStoreIdByBubbleId(req.params.id, req.body.shopifyStoreId, setInfo, resp)
				.then((resp) => {
					response.respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined)
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})

//  Get bubble shopify store mapping by id (GET)
router.get(`/:id/shopifyStores`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		Bubbles.getShopifyStoreByBubbleId(req.params.id, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined)
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})

//  Get bubble shopify store mapping by id (GET)
router.get(`/:id/shopifyStores/:sid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		Bubbles.getShopifyStoreByBubbleId(req.params.id, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined)
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})
// delete bubble by id (DELETE)
router.delete(`/:id/shopifyStores/:sid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}
		console.log('id: ' + req.params.id + ' sid: ' + req.params.sid)

		Bubbles.removeBubbleToShopifyStoreByBubbleIdAndShopifyStoreId(req.params.id, req.params.sid, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ['id'])
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})

/** ***********************Zips*****************************/
// Create bubble to Zip (POST)
router.post(`/:id/zips`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		}

		if (req.body.zipStart === undefined || req.body.zipEnd === undefined) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'zip start, zip end'))
		} else {
			Bubbles.createBubbleToZip(req.params.id, req.body.zipStart, req.body.zipEnd, resp)
				.then((resp) => {
					response.respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined)
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})

// Update Bubble to zip (PUT)
router.put('/:id/zips/:zid', (req, res, next) => {
	try {
		var valid = true
		var resp = {
			statusCode: 200,
			message: 'Success.',
			id: 0
		}
		var setInfo = {
			clause: '',
			values: []
		}

		// validation: must be changing status or name values and status must be active or inactive
		if (req.body.zipStart) {
			setInfo = sqlUtils.appendSet(setInfo, 'zip_start = ?', req.body.zipStart)
		}
		if (req.body.zipEnd) {
			setInfo = sqlUtils.appendSet(setInfo, 'zip_end = ?', req.body.zipEnd)
		}
		if (setInfo.clause.length > 0) {
			// create setInfo

			Bubbles.updateZipByZipId(req.params.zid, setInfo, resp)
				.then((resp) => {
					response.respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined)
				})
		} else {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'zip start or zip end'))
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})

//  Get zips by bubble id (GET)
router.get(`/:id/zips`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		Bubbles.getZipsByBubbleId(req.params.id, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined)
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})

//  Get bubble shopify store mapping by id (GET)
router.get(`/:id/zips/:zid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		Bubbles.getZipByZipId(req.params.zid, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined)
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})
// delete bubble by id (DELETE)
router.delete(`/:id/zips/:zid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		}

		Bubbles.removeBubbleZipByZipId(req.params.zid, resp)
			.then((resp) => {
				response.respond(resp, res, next)
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ['id'])
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})

module.exports = router