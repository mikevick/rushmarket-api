'use strict'

const _ = require('lodash');

const OnHand = require('../models/onHand')
const Vendors = require('../models/vendors')

const {
	formatResp
} = require('../utils/response');



//
//	GET On Hand
//
var getOnHand = async (vendorId, where, resp) => {
	var index = -1;
	var result = null;
	var vendorWhereInfo = {
		clause: '',
		values: []
	};
	var vendorCache = [];
	var vendorResult = await Vendors.getAll(vendorWhereInfo, 0, 1000000);
	var vendors = [];


	var metaData = await OnHand.getMetaData(where);
	if (metaData.length > 0) {
		resp.data.onHandQuantity = metaData[0].onHandQty;
		resp.data.projectedRecoveryValue = metaData[0].projectedRecoveryValue ? metaData[0].projectedRecoveryValue : 0;
	}


	// var rows = await OnHand.getDetail(where);
	// resp.data.onHand = rows;

	return resp;

	for (var i=0; i < vendorResult.vendors.length; i++) {
		vendors.push({id: vendorResult.vendors[i].id, name: vendorResult.vendors[i].name});
	}
	
	switch(type) {
		case 'RECEIVED':
			result = await CRC.getReceived(where);
			break;

		case 'RETURNED':
			result = await CRC.getReturned(where);
			break;

		case 'SOLD':
			result = await CRC.getSold(where);
			break;

		case 'DISPOSED':
			result = await CRC.getDisposed(where);
			break;
	}
		
	if (result.activity.length === 0) {
		formatResp(resp, undefined, 200, 'Activity not found.');
	} else {
		resp.data.activity = result.activity;
		for (var i=0; i < resp.data.activity.length; i++) {
			index = _.findIndex(vendorCache, function(v) {
				return (v.id === resp.data.activity[i].vendorId);
			})

			resp.data.activity[i].vendorName = null;

			if (index > -1) {
				resp.data.activity[i].vendorName = vendorCache[index].name;
			}
			else {
				index = _.findIndex(vendors, function(v) {
					// console.log(v.id + " " + resp.data.activity[i].vendorId + " " + (v.id === resp.data.activity[i].vendorId));
					return (v.id === resp.data.activity[i].vendorId);
				})

				if (index > -1) {
					vendorCache.push({id: vendors[index].id, name: vendors[index].name})
					resp.data.activity[i].vendorName = vendors[index].name;
				}
			}
		}
	}

	return resp;
}



module.exports = {
	getOnHand
}