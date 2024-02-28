'use strict'


const _ = require('lodash');
const moment = require('moment-timezone');

const CRC = require('../models/crcActivity')
const Vendors = require('../models/vendors')

const sqlUtils = require('../utils/sqlUtils')

const {
	formatResp
} = require('../utils/response');



//
//	GET Received Activity
//
var getActivity = async (type, where, vendorId, source, dateStart, dateEnd, resp) => {
	var index = -1;
	var outlets = '';
	var outletNames = '';
	var outletWhere = _.cloneDeep(where);
	var result = null;
	var vendorWhereInfo = {
		clause: '',
		values: []
	};
	var vendorCache = [];
	var vendorResult = await Vendors.getAll(vendorWhereInfo, 0, 1000000);
	var vendors = [];



	for (var i = 0; i < vendorResult.vendors.length; i++) {
		//	If a vendor specified and it has an outlet store, grab the name.
		if (vendorId !== undefined) {
			if ((vendorResult.vendors[i].id === vendorId) && (vendorResult.vendors[i].outletSiteAddress !== null)) {
				outlets += `'${vendorResult.vendors[i].outletSiteAddress}'`;
				outletNames = vendorResult.vendors[i].partnerOutletName;
			}
		}

		//	If no specific vendor specified, create a list of outlets.
		else {
			if (vendorResult.vendors[i].outletSiteAddress !== null) {
				if (outlets.length > 0) {
					outlets += ', ';
					outletNames += ', ';
				}
				outlets += `'${vendorResult.vendors[i].outletSiteAddress}'`;
				outletNames = `'vendorResult.vendors[i].partnerOutletName'`;
			}
		}

		vendors.push({
			id: vendorResult.vendors[i].id,
			outletSiteAddress: vendorResult.vendors[i].outletSiteAddress,
			name: vendorResult.vendors[i].name,
			partnerOutletName: vendorResult.vendors[i].partnerOutletName
		});
	}


	//	If source is outlet limit queries to include outlet(s).
	if ((type === 'SOLD') || (type === 'RETURNED')) {
		if ((source) && (source === 'outlet') && (outlets.length > 0)) {
			outletWhere = sqlUtils.appendWhere(outletWhere, `o.platform_channel IN (${outlets})`);
		}
		//	If source = rushmarket, limit query to all BUT outlet(s).
		else if ((source) && (source === 'rushmarket') && (outlets.length > 0)) {
			outletWhere = sqlUtils.appendWhere(outletWhere, `((o.platform_channel IS NULL) OR (o.platform_channel NOT IN (${outlets})))`);
		}
	}

	switch (type) {
		case 'RECEIVED':
			result = await CRC.getReceived(where, dateStart, dateEnd);
			// weedOutSameMonthActivityBySku(result);
			break;

		case 'RETURNED':
			result = await CRC.getReturned(where, dateStart, outletWhere, source);
			break;

		case 'SOLD':
			result = await CRC.getSold(where, outletWhere, source, dateStart, dateEnd);
			break;

		case 'DISPOSED':
			result = await CRC.getDisposed(where, dateStart, dateEnd);
			// weedOutSameMonthActivityBySku(result);
			break;
	}

	if (result.activity.length === 0) {
		formatResp(resp, undefined, 200, 'Activity not found.');
	} else {
		resp.data.activity = result.activity;
		for (var i = 0; i < resp.data.activity.length; i++) {
			index = _.findIndex(vendorCache, function (v) {
				return (v.id === resp.data.activity[i].vendorId);
			})

			resp.data.activity[i].vendorName = null;

			if (index > -1) {
				resp.data.activity[i].vendorName = vendorCache[index].name;

				//	If platformChannel is the URL of the outlet, use the outlet store name in response otherwise Rush Market
				if (type === 'SOLD') {
					if ((resp.data.activity[i].platformChannel !== null) && (resp.data.activity[i].platformChannel.length > 0) && (vendorCache[index].outletSiteAddress === resp.data.activity[i].platformChannel)) {
						resp.data.activity[i].platformChannel = vendorCache[index].partnerOutletName;
					} else {
						resp.data.activity[i].platformChannel = 'Rush Market';
					}
				}
			} else {
				index = _.findIndex(vendors, function (v) {
					// console.log(v.id + " " + resp.data.activity[i].vendorId + " " + (v.id === resp.data.activity[i].vendorId));
					return (v.id === resp.data.activity[i].vendorId);
				})

				if (index > -1) {
					vendorCache.push({
						id: vendors[index].id,
						name: vendors[index].name,
						outletSiteAddress: vendors[index].outletSiteAddress,
						partnerOutletName: vendors[index].partnerOutletName
					})
					resp.data.activity[i].vendorName = vendors[index].name;

					//	If platformChannel is the URL of the outlet, use the outlet store name in response otherwise Rush Market
					if (type === 'SOLD') {
					if ((resp.data.activity[i].platformChannel !== null) && (resp.data.activity[i].platformChannel.length > 0) && (vendors[index].outletSiteAddress === resp.data.activity[i].platformChannel)) {
						resp.data.activity[i].platformChannel = vendors[index].partnerOutletName;
					} else {
						resp.data.activity[i].platformChannel = 'Rush Market';
					}
				}
			}
		}
	}
}

return resp;
}



var weedOutSameMonthActivityBySku = (result) => {
	var	skus = [];
	var skusToDelete = [];

	for (var i=0; i < result.activity.length; i++) {
		var index = _.findIndex(skus, function (s) {
			return s.sku === result.activity[i].rushSku;
		});
		if (index === -1) {
			var s = {
				sku: result.activity[i].rushSku,
				count: 1,
				month: new moment(result.activity[i].dateProcessed).format('YYYYMM')
			}
			skus.push(s);
		}
		else {
			skus[index].count++;
			if (skus[index].month === new moment(result.activity[i].dateProcessed).format('YYYYMM')) {
				skusToDelete.push(result.activity[i].rushSku);
			}
		}

	}

	result.activity = _.remove(result.activity, function(r) {
		var i = _.findIndex(skusToDelete, function(s) {
			return s === r.rushSku;
		})
		return i === -1;
	})

}

//
//	GET Totals
//
var getTotals = async (vendorId, dateStart, dateEnd, source, resp) => {
	var index = -1;
	var disposedResult = null;
	var prom = [];
	var outlets = '';
	var receivedResult = null;
	var returnedResult = null;
	var soldResult = null;
	var vendorWhereInfo = {
		clause: '',
		values: []
	};
	var vendorCache = [];
	var vendorIds = [];
	var vendorResult = await Vendors.getAll(vendorWhereInfo, 0, 1000000);
	var vendors = [];

	for (var i = 0; i < vendorResult.vendors.length; i++) {
		//	If a vendor specified and it has an outlet store, grab the name.
		if (vendorId !== undefined) {
			if ((vendorResult.vendors[i].id === vendorId) && (vendorResult.vendors[i].outletSiteAddress !== null)) {
				outlets += `'${vendorResult.vendors[i].outletSiteAddress}'`;
			}
		}

		//	If no specific vendor specified, create a list of outlets.
		else {
			if (vendorResult.vendors[i].outletSiteAddress !== null) {
				if (outlets.length > 0) {
					outlets += ', ';
				}
				outlets += `'${vendorResult.vendors[i].outletSiteAddress}'`;
			}
		}

		vendors.push({
			id: vendorResult.vendors[i].id,
			outletSiteAddress: vendorResult.vendors[i].outletSiteAddress,
			name: vendorResult.vendors[i].name
		});
	}

	prom.push(CRC.getDisposedTotals(vendorId, dateStart, dateEnd));
	prom.push(CRC.getReceivedTotals(vendorId, dateStart, dateEnd));
	prom.push(CRC.getReturnedTotals(vendorId, dateStart, dateEnd, source, outlets));
	prom.push(CRC.getSoldTotals(vendorId, dateStart, dateEnd, source, outlets));

	var results = await Promise.all(prom);

	disposedResult = results[0];
	receivedResult = results[1];
	returnedResult = results[2];
	soldResult = results[3];

	//	Compile an ordered list of vendorIds from the results
	for (var i = 0; i < disposedResult.totals.length; i++) {
		vendorIds.push(disposedResult.totals[i].vendorId);
	}
	for (var i = 0; i < receivedResult.totals.length; i++) {
		vendorIds.push(receivedResult.totals[i].vendorId);
	}
	for (var i = 0; i < returnedResult.totals.length; i++) {
		vendorIds.push(returnedResult.totals[i].vendorId);
	}
	for (var i = 0; i < soldResult.totals.length; i++) {
		vendorIds.push(soldResult.totals[i].vendorId);
	}

	//	Get to a sorted list of unique vendorIds from the results of the 3 totals queries.
	vendorIds = _.uniq(vendorIds);
	vendorIds = _.orderBy(vendorIds);


	if (vendorIds.length === 0) {
		formatResp(resp, undefined, 200, 'Totals not found.');
	} else {

		resp.data.totals = [];

		// Create stub objects for each vendorId
		for (var i = 0; i < vendorIds.length; i++) {
			resp.data.totals.push({
				vendorId: vendorIds[i],
				totalQuantityReceived: 0,
				totalQuantitySold: 0,
				totalProcessingFees: 0,
				totalDisposalFees: 0,
				totalAmountOwed: 0,
				totalCreditAmount: 0,
				vendorName: null
			});

			index = _.findIndex(vendorCache, function (v) {
				return (v.id === resp.data.totals[i].vendorId);
			})
			if (index > -1) {
				resp.data.totals[i].vendorName = vendorCache[index].name;
			} else {
				index = _.findIndex(vendors, function (v) {
					// console.log(v.id + " " + resp.data.activity[i].vendorId + " " + (v.id === resp.data.activity[i].vendorId));
					return (v.id === resp.data.totals[i].vendorId);
				})

				if (index > -1) {
					vendorCache.push({
						id: vendors[index].id,
						name: vendors[index].name
					})
					resp.data.totals[i].vendorName = vendors[index].name;
				}
			}
		}

		//	Process the totals query results and plug in the numbers.
		for (var i = 0; i < disposedResult.totals.length; i++) {
			index = _.findIndex(resp.data.totals, function (v) {
				return (v.vendorId === disposedResult.totals[i].vendorId);
			})

			if (index > -1) {
				resp.data.totals[index].totalDisposalFees = disposedResult.totals[i].totalDisposalFees;
			}
		}

		for (var i = 0; i < receivedResult.totals.length; i++) {
			index = _.findIndex(resp.data.totals, function (v) {
				return (v.vendorId === receivedResult.totals[i].vendorId);
			})

			if (index > -1) {
				resp.data.totals[index].totalQuantityReceived = receivedResult.totals[i].totalQuantityReceived;
				resp.data.totals[index].totalProcessingFees = receivedResult.totals[i].totalProcessingFees;
			}
		}

		for (var i = 0; i < soldResult.totals.length; i++) {
			index = _.findIndex(resp.data.totals, function (v) {
				return (v.vendorId === soldResult.totals[i].vendorId);
			})

			if (index > -1) {
				resp.data.totals[index].totalQuantitySold = soldResult.totals[i].totalQuantitySold;
				resp.data.totals[index].totalAmountOwed = soldResult.totals[i].totalAmountOwed;
			}
		}

		for (var i = 0; i < returnedResult.totals.length; i++) {
			index = _.findIndex(resp.data.totals, function (v) {
				return (v.vendorId === returnedResult.totals[i].vendorId);
			})

			if (index > -1) {
				resp.data.totals[index].totalCreditAmount = returnedResult.totals[i].totalCreditAmount;
			}
		}
	}

	return resp;
}



module.exports = {
	getActivity,
	getTotals
}