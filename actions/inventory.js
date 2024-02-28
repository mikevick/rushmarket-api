'use strict'


const Inventory = require('../models/inventory')

const {
	formatResp
} = require('../utils/response')



//
//	GET inventory by ID
//
var getInventory = async (req, resp, vendorSkus) => {
	if (req.get('x-app-type') != 'INT') {
		response.respond(resp, res, next, undefined, 403, 'Access denied.')
	} else {
		var inventory = await Inventory.getInventory(vendorSkus);
		if (inventory.length === 0) {
			formatResp(resp, undefined, 404, 'Inventory not found.')
		}
		else {
			resp.data.inventory = inventory;
		}
	}
	
	return resp;
}



module.exports = {
	getInventory
}