'use strict'

const {
	formatResp
} = require('../utils/response')
const TargetedCities = require('../models/targetedCities');



// Create metro
var create = async (city, citySlug, shopifyStoreId,
	deliveryCutoffCst, pickupCutoffCst,
	logoUrl, emailListName, facebookUrl, facebookPixelId,
	instagramUrl, contactEmail, deliveryEmail, careersEmail,
	mainContent, metaTitle, metaDescription,
	metaAuthor, metaRobots, resp) => {
	var rows = await TargetedCities.getByName(city);

	if (rows.length > 0) {
		formatResp(resp, ["id"], 409, 'City with that name already exists.');
	} else {
		var result = await TargetedCities.create(city, citySlug, shopifyStoreId,
			deliveryCutoffCst, pickupCutoffCst,
			logoUrl, emailListName, facebookUrl, facebookPixelId,
			instagramUrl, contactEmail, deliveryEmail, careersEmail,
			mainContent, metaTitle, metaDescription,
			metaAuthor, metaRobots);
		resp.id = result;
	}

	return resp;
}


var updateById = async (req, resp) => {
	var cities = await TargetedCities.getById(req.params.id)

	if (cities.length === 0) {
		formatResp(resp, undefined, 404, 'City not found.');
	} else {


		if (req.body.deliveryCutoffCst !== undefined) {
			if ((req.body.deliveryCutoffCst.length !== 5) ||
				(req.body.deliveryCutoffCst[2] !== ':') ||
				(!validateCSTField(req.body.deliveryCutoffCst))) {
				formatResp(resp, undefined, 400, 'Invalid cutoff.');
				return resp;
			}
		}

		if (req.body.pickupCutoffCst !== undefined) {
			if ((req.body.pickupCutoffCst.length !== 5) ||
				(req.body.pickupCutoffCst[2] !== ':') ||
				(!validateCSTField(req.body.pickupCutoffCst))) {
				formatResp(resp, undefined, 400, 'Invalid cutoff.');
				return resp;
			}
		}

		var updateCity = await TargetedCities.updateById(req.params.id, req.body);

		if (updateCity === null) {
			formatResp(resp, undefined, 404, 'City not updated.');
		}
	}
	return resp;
}


var validateCSTField = (value, msg) => {
	var valid = true;

	// TODO

	return valid;
}



module.exports = {
	create,
	updateById
}