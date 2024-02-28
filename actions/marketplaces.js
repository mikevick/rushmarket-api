'use strict'

const Marketplaces = require('../models/marketplaces')

const {
	formatResp
} = require('../utils/response')



//
//	GET inventory by COIN(s)
//
var getInventory = async (req, resp, coins) => {
	var inventory = await Marketplaces.getInventory(coins);
	if (inventory.length === 0) {
		formatResp(resp, undefined, 404, 'Inventory not found.')
	}
	else {
		resp.data.inventory = inventory;
	}
	
	return resp;
}



//
//	GET Listed On Platforms
//
var getListedOns = async (req, resp) => {
	var listedOns = await Marketplaces.getListedOns();
	if (listedOns.length === 0) {
		formatResp(resp, undefined, 404, 'Listed Ons not found.')
	}
	else {
		resp.data.listedOns = listedOns;
	}
	
	return resp;
}



//
//	GET Not Listed Reasons
//
var getNotListedReasons = async (req, resp) => {
	var notListedReasons = await Marketplaces.getNotListedReasons();
	if (notListedReasons.length === 0) {
		formatResp(resp, undefined, 404, 'Not Listed Reasons not found.')
	}
	else {
		resp.data.notListedReasons = notListedReasons;
	}
	
	return resp;
}


//
//	POST Not Listed Reasons
//
var createNotListedReason = async (req, resp) => {
	var notListedReasons = await Marketplaces.getNotListedReasonsByReason(req.body.reason);
	if (notListedReasons.length > 0) {
		formatResp(resp, undefined, 409, 'Reason already exists.')
	}
	else {
		await Marketplaces.createNotListedReason(req.body.reason);
	}
	
	return resp;
}





module.exports = {
	createNotListedReason,
	getInventory,
	getListedOns,
	getNotListedReasons
}