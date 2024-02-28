'use strict'


const _ = require('lodash');

const DSActivity = require('../models/dropshipActivity')
const Vendors = require('../models/vendors')

const sqlUtils = require('../utils/sqlUtils')

const {
	formatResp
} = require('../utils/response');



//
//	GET Received Activity
//
var getActivity = async (type, where, vendorId, source, resp) => {
	var index = -1;
	var outlets = '';
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
		case 'RETURNED':
			result = await DSActivity.getReturned(where, outletWhere, source);
			break;

		case 'SOLD':
			result = await DSActivity.getSold(where, outletWhere, source);
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
			} else {
				index = _.findIndex(vendors, function (v) {
					// console.log(v.id + " " + resp.data.activity[i].vendorId + " " + (v.id === resp.data.activity[i].vendorId));
					return (v.id === resp.data.activity[i].vendorId);
				})

				if (index > -1) {
					vendorCache.push({
						id: vendors[index].id,
						name: vendors[index].name
					})
					resp.data.activity[i].vendorName = vendors[index].name;
				}
			}
		}
	}

	return resp;
}


//
//	GET Totals
//
var getTotals = async (vendorId, dateStart, dateEnd, source, resp) => {
	var index = -1;
	var disposedResult = null;
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

	returnedResult = await DSActivity.getReturnedTotals(vendorId, dateStart, dateEnd, source, outlets);
	soldResult = await DSActivity.getSoldTotals(vendorId, dateStart, dateEnd, source, outlets);

	//	Compile an ordered list of vendorIds from the results
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
				totalQuantitySold: 0,
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