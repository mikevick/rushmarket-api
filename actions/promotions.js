'use strict'

const Promotions = require('../models/promotions')

const {
	formatResp
} = require('../utils/response')




var createPromotion = async (req, resp) => {
	var promo = await Promotions.getByName(req.body.promoName);
	var type = await Promotions.getTypeById(req.body.promoTypeId);

	if (promo.length > 0) {
		formatResp(resp, undefined, 409, 'Promotion with that name already exists.');
	} else if (type.length === 0) {
		formatResp(resp, undefined, 400, 'Promotion type not recognized.');
	} else if ((req.body.promoScope !== 'MARKET') && (req.body.promoScope !== 'MEMBER')) {
		formatResp(resp, undefined, 400, 'Promotion scope not recognized.');
	} else {
		resp.id = await Promotions.create(req.body.promoTypeId, req.body.promoName, req.body.startDate, req.body.endDate, req.body.promoScope, req.body.pricingTypeId, req.body.promoDescription);
	}
}


var createPromotionScope = async (req, resp) => {
	var scope = await Promotions.getScopeById(req.params.id, req.body.scopeId);

	if (scope.length > 0) {
		formatResp(resp, undefined, 409, 'Promotion scope with that ID already exists.');
	} else {
		resp.id = await Promotions.createScope(req.params.id, req.body.scopeId);
	}
}


var deletePromotion = async (req, resp) => {
	var promo = await Promotions.getById(req.params.id);

	if (promo === undefined) {
		formatResp(resp, undefined, 404, 'Promotion not found.');
	} else {
		await Promotions.delete(req.params.id);
	}
}



var deletePromotionScope = async (req, resp) => {
	var promo = await Promotions.getScopeById(req.params.id, req.params.sid);

	if (promo === undefined) {
		formatResp(resp, undefined, 404, 'Promotion scope not found.');
	} else {
		await Promotions.deleteScope(req.params.id, req.params.sid);
	}
}




//
//	GET all promotions
//
var getAll = async (req, resp) => {
	var result = await Promotions.getAll(where, sortBy, offset, limit);
	resp.metaData.totalCount = result.totalCount;

	if (result.promotions.length === 0) {
		formatResp(resp, undefined, 200, 'Promotions not found.');
	} else {
		resp.data.promotions = result.promotions;
	}

	return resp;
}


//
//	GET all promotions
//
var getAll = async (where, sortBy, offset, limit, resp) => {
	var result = await Promotions.getAll(where, sortBy, offset, limit);
	resp.metaData.totalCount = result.totalCount;

	if (result.promotions.length === 0) {
		formatResp(resp, undefined, 200, 'Promotions not found.');
	} else {
		resp.data.promotions = result.promotions;
	}

	return resp;
}


//
//	GET by ID
//
var getById = async (promoId, resp) => {
	var result = await Promotions.getById(promoId);

	if (result === undefined) {
		formatResp(resp, undefined, 200, 'Promotion not found.');
	} else {
		resp.data.promotions = result;
	}

	return resp;
}


//
//	GET In Scope
//
var getInScope = async (promoId, resp) => {
	var result = await Promotions.getById(promoId);
	var rows = null;

	if (result === undefined) {
		formatResp(resp, undefined, 200, 'Promotion not found.');
	} else {
		if (result.promoScope === 'MARKET') {
			resp.data.markets = await Promotions.getInScopeMarket(promoId);
		} else if (result.promoScope === 'MEMBER') {
			resp.data.members = await Promotions.getInScopeMember(promoId);
		}
	}

	return resp;
}


//
//	GET Promo Tiers
//
var getPromoTiers = async (promoId, resp) => {
	var result = await Promotions.getById(promoId);
	var rows = null;

	if (result === undefined) {
		formatResp(resp, undefined, 200, 'Promotion not found.');
	} else {

		var rows = await Promotions.getTiers(promoId);
		resp.data.tiers = rows;
	}
	return resp;
}


//
//	GET Types
//
var getTypes = async (resp) => {
	var result = await Promotions.getTypes();

	if (result.length === 0) {
		formatResp(resp, undefined, 200, 'Promotions not found.');
	} else {
		resp.data.types = result;
	}

	return resp;
}



var updatePromotion = async (req, resp) => {
	var promo = await Promotions.getById(req.params.id);
	var name = await Promotions.getByNameNotId(req.body.promoName, req.params.id);
	var type = await Promotions.getTypeById(req.body.promoTypeId);

	if (promo === undefined) {
		formatResp(resp, undefined, 404, 'Promotion not found.');
	} else if ((req.body.promoName !== undefined) && (name.length > 0)) {
		formatResp(resp, undefined, 409, 'Promotion with this name already exists.');
	} else if ((req.body.promoTypeId !== undefined) && (type.length === 0)) {
		formatResp(resp, undefined, 400, 'Promotion type not recognized.');
	} else if ((req.body.promoScope !== undefined) && (req.body.promoScope !== 'MARKET') && (req.body.promoScope !== 'MEMBER')) {
		formatResp(resp, undefined, 400, 'Promotion scope not recognized.');
	} else {
		await Promotions.update(req.params.id, req.body.promoTypeId, req.body.promoName, req.body.startDate, req.body.endDate, req.body.promoScope, req.body.pricingTypeId, req.body.promoDescription);
	}
}






module.exports = {
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
}