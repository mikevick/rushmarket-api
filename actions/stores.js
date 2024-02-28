'use strict'

const moment = require('moment');

const Stores = require('../models/stores');
const StoreHours = require('../models/storeHours');

const {
	formatResp
} = require('../utils/response')




var getRawStoreHours = async (req, resp) => {
	var hours = null;
	var store = null;

	//	Verify storeId.
	var rows = await Stores.getById(req.params.id);
	if (rows.length === 0) {
		formatResp(resp, ["days"], 404, "Referenced store ID doesn't exist.");
		return resp;
	} else {
		store = rows[0];

		rows = await StoreHours.getByStoreId(req.params.id);
		if (rows !== undefined) {
			if (rows.length === 0) {
				formatResp(resp, ["days"], 404, "Store hours for this store don't exist.");
				return resp;
			}

			hours = rows[0];

			resp.hours = hours;
		}
	}
}



var getStoreHours = async (req, resp) => {
	var hours = null;
	var store = null;

	//	Verify storeId.
	var rows = await Stores.getById(req.params.id);
	if (rows.length === 0) {
		formatResp(resp, ["days"], 404, "Referenced store ID doesn't exist.");
		return resp;
	} else {
		store = rows[0];

		rows = await StoreHours.getByStoreId(req.params.id);
		if (rows !== undefined) {
			if (rows.length === 0) {
				formatResp(resp, ["days"], 404, "Store hours for this store don't exist.");
				return resp;
			}

			hours = rows[0];

			resp.days = prettyHours(store.timezone, hours);
		}
	}
}



var formatTime = (localTime) => {
	var hour = parseInt(localTime.substring(0, 2));
	var min = localTime.substring(3, 5);
	var result = null;

	if ((hour >= 0) && (hour < 12)) {
		result = hour + ":" + min + " am";
	} else {
		if (hour > 12) {
			hour = hour - 12;
		}

		result = hour + ":" + min + " pm";
	}

	return result;
}


var prettyHours = (timezone, hours) => {
	var days = [];
	var todayDow = moment.tz(timezone).day();
	var monday = moment.tz(timezone);
	if (todayDow === 0) {
		monday = monday.subtract(6, 'days');
	} else if (todayDow > 1) {
		monday = monday.subtract((todayDow - 1), 'days');
	}
	var tuesday = moment(monday);
	tuesday = tuesday.add(1, 'days');
	var wednesday = moment(tuesday);
	wednesday = wednesday.add(1, 'days');
	var thursday = moment(wednesday);
	thursday = thursday.add(1, 'days');
	var friday = moment(thursday);
	friday = friday.add(1, 'days');
	var saturday = moment(friday);
	saturday = saturday.add(1, 'days');
	var sunday = moment(saturday);
	sunday = sunday.add(1, 'days');



	//	Days are added to the array in their day of week order - see moment.day()
	addDay(days, sunday, hours.marketSunOpenFlag, hours.marketSunOpenLocal, hours.marketSunCloseLocal, hours.marketSunDescription,
		hours.bohSunOpenFlag, hours.bohSunOpenLocal, hours.bohSunCloseLocal,
		hours.pickupSunOpenFlag, hours.pickupSunOpenLocal, hours.pickupSunCloseLocal);

	addDay(days, monday, hours.marketMonOpenFlag, hours.marketMonOpenLocal, hours.marketMonCloseLocal, hours.marketMonDescription,
		hours.bohMonOpenFlag, hours.bohMonOpenLocal, hours.bohMonCloseLocal,
		hours.pickupMonOpenFlag, hours.pickupMonOpenLocal, hours.pickupMonCloseLocal);

	addDay(days, tuesday, hours.marketTueOpenFlag, hours.marketTueOpenLocal, hours.marketTueCloseLocal, hours.marketTueDescription,
		hours.bohTueOpenFlag, hours.bohTueOpenLocal, hours.bohTueCloseLocal,
		hours.pickupTueOpenFlag, hours.pickupTueOpenLocal, hours.pickupTueCloseLocal);

	addDay(days, wednesday, hours.marketWedOpenFlag, hours.marketWedOpenLocal, hours.marketWedCloseLocal, hours.marketWedDescription,
		hours.bohWedOpenFlag, hours.bohWedOpenLocal, hours.bohWedCloseLocal,
		hours.pickupWedOpenFlag, hours.pickupWedOpenLocal, hours.pickupWedCloseLocal);

	addDay(days, thursday, hours.marketThuOpenFlag, hours.marketThuOpenLocal, hours.marketThuCloseLocal, hours.marketThuDescription,
		hours.bohThuOpenFlag, hours.bohThuOpenLocal, hours.bohThuCloseLocal,
		hours.pickupThuOpenFlag, hours.pickupThuOpenLocal, hours.pickupThuCloseLocal);

	addDay(days, friday, hours.marketFriOpenFlag, hours.marketFriOpenLocal, hours.marketFriCloseLocal, hours.marketFriDescription,
		hours.bohFriOpenFlag, hours.bohFriOpenLocal, hours.bohFriCloseLocal,
		hours.pickupFriOpenFlag, hours.pickupFriOpenLocal, hours.pickupFriCloseLocal);

	addDay(days, saturday, hours.marketSatOpenFlag, hours.marketSatOpenLocal, hours.marketSatCloseLocal, hours.marketSatDescription,
		hours.bohSatOpenFlag, hours.bohSatOpenLocal, hours.bohSatCloseLocal,
		hours.pickupSatOpenFlag, hours.pickupSatOpenLocal, hours.pickupSatCloseLocal);

	return days;
}



var addDay = (days, day, marketOpenFlag, marketOpenLocal, marketCloseLocal, marketDescription,
	bohOpenFlag, bohOpenLocal, bohCloseLocal,
	pickupOpenFlag, pickupOpenLocal, pickupCloseLocal) => {
	var bohOpen = moment(day);
	var bohClose = moment(day);
	var marketOpen = moment(day);
	var marketClose = moment(day);
	var pickupOpen = moment(day);
	var pickupClose = moment(day);
	days.push({
		dayIndex: day.day(),
		month: day.format("MMMM"),
		dayOfMonth: day.format("Do"),
		dayOfWeek: day.format("dddd"),

		market: {
			openFlag: marketOpenFlag === 1 ? true : false,
			open: formatTime(marketOpenLocal),
			openTimestamp: marketOpen.hour(marketOpenLocal.substring(0, 2)).minute(marketOpenLocal.substring(3)).second(0).utc().format('YYYY-MM-DDTHH:mm:ss.000') + 'Z',
			close: formatTime(marketCloseLocal),
			closeTimestamp: marketClose.hour(marketCloseLocal.substring(0, 2)).minute(marketCloseLocal.substring(3)).second(0).utc().format('YYYY-MM-DDTHH:mm:ss.000') + 'Z',
			description: marketDescription
		},

		backOfHouse: {
			openFlag: bohOpenFlag === 1 ? true : false,
			open: formatTime(bohOpenLocal),
			openTimestamp: bohOpen.hour(bohOpenLocal.substring(0, 2)).minute(bohOpenLocal.substring(3)).second(0).utc().format('YYYY-MM-DDTHH:mm:ss.000') + 'Z',
			close: formatTime(bohCloseLocal),
			closeTimestamp: bohClose.hour(bohCloseLocal.substring(0, 2)).minute(bohCloseLocal.substring(3)).second(0).utc().format('YYYY-MM-DDTHH:mm:ss.000') + 'Z',
		},

		pickup: {
			openFlag: pickupOpenFlag === 1 ? true : false,
			open: formatTime(pickupOpenLocal),
			openTimestamp: pickupOpen.hour(pickupOpenLocal.substring(0, 2)).minute(pickupOpenLocal.substring(3)).second(0).utc().format('YYYY-MM-DDTHH:mm:ss.000') + 'Z',
			close: formatTime(pickupCloseLocal),
			closeTimestamp: pickupClose.hour(pickupCloseLocal.substring(0, 2)).minute(pickupCloseLocal.substring(3)).second(0).utc().format('YYYY-MM-DDTHH:mm:ss.000') + 'Z',
		}
	});



}


module.exports = {
	getRawStoreHours,
	getStoreHours
}