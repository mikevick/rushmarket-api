'use strict';

const express = require('express');
const router = express.Router();

const	targetedCitiesActions = require('../actions/targetedCities');

const TargetedCities = require('../models/targetedCities');

const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');



//
//  GET /targetedCities
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success",
			data: {}
		}

		var cities = await TargetedCities.getAll();
		if ((cities === undefined) || (cities === null)) {
			resp.statusCode = 404;
			resp.message = "No targeted cities found.";
		} else {
			resp.data.targetedCities = cities;
		}
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  GET /targetedCities/validate
//
router.get(`/validate`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			data: {}
		};


		if (req.query.city === undefined) {
			resp.statusCode = 404;
		} else {
			var row = await TargetedCities.getTargetCity(req.query.city);
			if (row.length === 0) {
				resp.statusCode = 404;
				delete resp.data;
			}
			else {
				resp.data.targetedCity = row[0];
			}
		}

		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["stores"]);
	}
});


//
// Create Targeted City
//
router.post(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		}

		if ((req.body.city === undefined) ||
			(req.body.citySlug === undefined) ||
			(req.body.shopifyStoreId === undefined) ||
			(req.body.deliveryCutoffCst === undefined) ||
			(req.body.pickupCutoffCst === undefined)) {
			response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'city, citySlug, shopifyStoreId, deliveryCutoffCst, pickupCutoffCst'));
		} else {
			await targetedCitiesActions.create(req.body.city, req.body.citySlug, req.body.shopifyStoreId, req.body.deliveryCutoffCst, req.body.pickupCutoffCst, 
																					req.body.logoUrl, req.body.emailListName, req.body.facebookUrl, req.body.facebookPixelId,
																					req.body.instagramUrl, req.body.contactEmail, req.body.deliveryEmail, req.body.careersEmail,
																					req.body.mainContent, req.body.metaTitle, req.body.metaDescription, req.body.metaAuthor,
																					req.body.metaRobots, resp);
			respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})




//
// Update Targeted City
//
router.put('/:id', async (req, res, next) => {
	try {
		var valid = true
		var resp = {
			statusCode: 200,
			message: 'Success.',
		}

		await targetedCitiesActions.updateById(req, resp);
		respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['id'])
	}
})





module.exports = router;