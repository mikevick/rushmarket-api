'use strict';

const _ = require('lodash');
const moment = require('moment');

const storeActions = require('../actions/stores');

const Stores = require('../models/stores');


var hours = [];


var getHoursAndCutoffs = (storeId) => {
	var hc = _.find(hours, function (o) {
		return o.storeId === storeId;
	});

	if (hc != undefined) {
		getCutoffs(hc);
		return hc;
	} else {
		return null;
	}
}


var loadHoursAndCutoffs = async () => {
	var storeHours = {
		statusCode: 200,
		days: []
	};


	var stores = await Stores.getActivePhysicalStores();

	for (var i=0; i < stores.length; i++) {
		//	TODO if hours can't be retrieved.	
		//	Get store hours for the store the product lives in.  
		var h = await storeActions.getStoreHours({params: {id: stores[i].storeId}}, storeHours);

		stores[i].days = storeHours.days;

		hours.push(stores[i]);
	}

	console.log(stores.length + " store hours loaded.");
}



//	Pickup and Delivery cutoffs are expressed in CST
var getCutoffs = (hc) => {
	if (hc.deliveryCutoffCst) {
		var hour = hc.deliveryCutoffCst.substring(0, 2);
		var min = hc.deliveryCutoffCst.substring(3, 5);
		var theDay = moment.tz('America/Chicago')
		hc.deliveryCutoffTodayCST = moment(theDay).tz('America/Chicago').hour(hour).minute(min).second(0);
	}

	if (hc.pickupCutoffCst) {
		var hour = hc.pickupCutoffCst.substring(0, 2);
		var min = hc.pickupCutoffCst.substring(3, 5);
		var theDay = moment.tz('America/Chicago')
		hc.pickupCutoffTodayCST = moment(theDay).tz('America/Chicago').hour(hour).minute(min).second(0);
	}

	var theDay = moment.tz('America/Chicago')
	hc.localLTLCutoffTodayCST = moment(theDay).tz('America/Chicago').hour(17).minute(0).second(0);
}



module.exports = {
	loadHoursAndCutoffs,
	getHoursAndCutoffs
}