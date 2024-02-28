'use strict'

const check = require('check-types')
const express = require('express')
const router = express.Router()
const isValidZipcode = require('is-valid-zipcode');

const metros = require('../actions/metros')

const logUtils = require('../utils/logUtils')
const response = require('../utils/response')
const memberText = require('../utils/memberTextUtils')
const sqlUtils = require('../utils/sqlUtils')


//
// Create Metro (POST)
//
router.post(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		}

		if ((req.body.status === undefined) || (req.body.status === null) || ((req.body.status.toUpperCase() !== 'ACTIVE') && (req.body.status.toUpperCase() !== 'INACTIVE'))) {
			response.respond(resp, res, next, ['id'], 400, 'Market status must be "ACTIVE" or "INACTIVE"')
		} else if ((req.body.name === undefined) ||
			(req.body.cityId === undefined) ||
			(req.body.zip === undefined) ||
			(req.body.marginEligibilityThreshold === undefined) ||
			(req.body.hasPhysicalStoreFlag === undefined)) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'name, cityId, zip, marginEligibilityThreshold, hasPhysicalStoreFlag'));
		} else if (!check.number(parseFloat(req.body.marginEligibilityThreshold)) ||
			((check.number(parseFloat(req.body.marginEligibilityThreshold)) && (parseFloat(req.body.marginEligibilityThreshold) < 1)) ||
				(parseFloat(req.body.marginEligibilityThreshold) > 100))) {
			response.respond(resp, res, next, ['id'], 400, 'Margin Eligibility Threshold must be a number between 1-100')
		} else if ((req.body.hasPhysicalStoreFlag !== true) &&
			(req.body.hasPhysicalStoreFlag !== false) &&
			(req.body.hasPhysicalStoreFlag !== "true") &&
			(req.body.hasPhysicalStoreFlag !== "no")) {
			response.respond(resp, res, next, ['id'], 400, 'Flag hasPhysicalStoreFlag must be true or false')
		} else if (!isValidZipcode(req.body.zip)) {
			response.respond(resp, res, next, ['id'], 400, 'Invalid zip')
		} else {
			await metros.create(req.body.status, req.body.name, req.body.cityId, req.body.zip, req.body.marginEligibilityThreshold, req.body.hasPhysicalStoreFlag, resp);
			response.respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})



//
// Update Metro (PUT)
//
router.put('/:id', (req, res, next) => {
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

		if (req.body.status) {
			// || req.body.targetMarketingContribution || req.body.targetContribution) {
			if ((req.body.status) && !((req.body.status.toUpperCase()) === 'ACTIVE' || (req.body.status.toUpperCase()) === 'INACTIVE')) {
				response.respond(resp, res, next, ['id'], 400, 'Market status must be "ACTIVE" or "INACTIVE"')
				valid = false
			}
		}
		if (req.body.marginEligibilityThreshold !== undefined) {
			if (!check.number(parseFloat(req.body.marginEligibilityThreshold)) ||
				(check.number(parseFloat(req.body.marginEligibilityThreshold)) && (parseFloat(req.body.marginEligibilityThreshold) < 1) || (parseFloat(req.body.marginEligibilityThreshold) > 100))) {
				response.respond(resp, res, next, ['id'], 400, 'Margin Eligibility Threshold must be a number between 1-100')
				valid = false;
			}
		}
		if (req.body.hasPhysicalStoreFlag !== undefined) {
			if ((req.body.hasPhysicalStoreFlag !== true) && 
					(req.body.hasPhysicalStoreFlag != false)) {
				response.respond(resp, res, next, ['id'], 400, 'Flag hasPhysicalStoreFlag must be true or false')
				valid = false;
			}
		}
		if ((req.body.zip !== undefined) && (!isValidZipcode(req.body.zip))) {
			response.respond(resp, res, next, ['id'], 400, 'Invalid zip')
		}

		if (valid) {
			// create setInfo
			if (req.body.status !== undefined) {
				setInfo = sqlUtils.appendSet(setInfo, 'status = ?', req.body.status)
			}
			if (req.body.name !== undefined) {
				setInfo = sqlUtils.appendSet(setInfo, 'name = ?', req.body.name)
			}
			if (req.body.marginEligibilityThreshold !== undefined) {
				setInfo = sqlUtils.appendSet(setInfo, 'margin_eligibility_threshold = ?', req.body.marginEligibilityThreshold)
			}
			if (req.body.zip !== undefined) {
				setInfo = sqlUtils.appendSet(setInfo, 'zip = ?', req.body.zip)
			}
			if (req.body.cityId !== undefined) {
				setInfo = sqlUtils.appendSet(setInfo, 'city_id = ?', req.body.cityId)
			}
			if (req.body.hasPhysicalStoreFlag !== undefined) {
				if (req.body.hasPhysicalStoreFlag === false) {
					setInfo = sqlUtils.appendSet(setInfo, 'has_physical_store_flag = 0')
				}
				else {
					setInfo = sqlUtils.appendSet(setInfo, 'has_physical_store_flag = 1')
				}
			}

			metros.updateById(req.params.id, setInfo, resp)
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
//  Get all Metros (GET)
//
router.get(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		}
		var whereInfo = {
			clause: '',
			values: []
		}

		// limit and offset defaults and query overrides
		var limit = 10
		var offset = 0

		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit)
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset)
		}

		// add where clause to select by name and status
		if (req.query.name) {
			whereInfo = sqlUtils.appendWhere(whereInfo, 'name LIKE ?', '%' + req.query.name + '%')
		}

		if (req.query.status) {
			whereInfo = sqlUtils.appendWhere(whereInfo, 'status = ?', req.query.status)
		}

		metros.getAll(whereInfo, offset, limit, resp)
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
//  Get Metro by id (GET)
//
router.get(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		metros.getById(req.params.id, resp)
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



module.exports = router