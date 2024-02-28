'use strict';
const moment = require('moment');
const mysql = require('promise-mysql');

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');



exports.create = async (timezone, storeId,
	marketSunOpenFlag, marketSunOpenLocal, marketSunCloseLocal, marketSunDescription,
	marketMonOpenFlag, marketMonOpenLocal, marketMonCloseLocal, marketMonDescription,
	marketTueOpenFlag, marketTueOpenLocal, marketTueCloseLocal, marketTueDescription,
	marketWedOpenFlag, marketWedOpenLocal, marketWedCloseLocal, marketWedDescription,
	marketThuOpenFlag, marketThuOpenLocal, marketThuCloseLocal, marketThuDescription,
	marketFriOpenFlag, marketFriOpenLocal, marketFriCloseLocal, marketFriDescription,
	marketSatOpenFlag, marketSatOpenLocal, marketSatCloseLocal, marketSatDescription,
	bohSunOpenFlag, bohSunOpenLocal, bohSunCloseLocal,
	bohMonOpenFlag, bohMonOpenLocal, bohMonCloseLocal,
	bohTueOpenFlag, bohTueOpenLocal, bohTueCloseLocal,
	bohWedOpenFlag, bohWedOpenLocal, bohWedCloseLocal,
	bohThuOpenFlag, bohThuOpenLocal, bohThuCloseLocal,
	bohFriOpenFlag, bohFriOpenLocal, bohFriCloseLocal,
	bohSatOpenFlag, bohSatOpenLocal, bohSatCloseLocal,
	pickupSunOpenFlag, pickupSunOpenLocal, pickupSunCloseLocal, 
	pickupMonOpenFlag, pickupMonOpenLocal, pickupMonCloseLocal, 
	pickupTueOpenFlag, pickupTueOpenLocal, pickupTueCloseLocal, 
	pickupWedOpenFlag, pickupWedOpenLocal, pickupWedCloseLocal, 
	pickupThuOpenFlag, pickupThuOpenLocal, pickupThuCloseLocal, 
	pickupFriOpenFlag, pickupFriOpenLocal, pickupFriCloseLocal, 
	pickupSatOpenFlag, pickupSatOpenLocal, pickupSatCloseLocal ) => {

	await globals.pool.query("DELETE FROM store_hours WHERE store_id = ?", [storeId]);

	var values = [storeId,
		marketSunOpenFlag, marketSunOpenLocal, marketSunCloseLocal, marketSunDescription,
		marketMonOpenFlag, marketMonOpenLocal, marketMonCloseLocal, marketMonDescription,
		marketTueOpenFlag, marketTueOpenLocal, marketTueCloseLocal, marketTueDescription,
		marketWedOpenFlag, marketWedOpenLocal, marketWedCloseLocal, marketWedDescription,
		marketThuOpenFlag, marketThuOpenLocal, marketThuCloseLocal, marketThuDescription,
		marketFriOpenFlag, marketFriOpenLocal, marketFriCloseLocal, marketFriDescription,
		marketSatOpenFlag, marketSatOpenLocal, marketSatCloseLocal, marketSatDescription,
		bohSunOpenFlag, bohSunOpenLocal, bohSunCloseLocal, 
		bohMonOpenFlag, bohMonOpenLocal, bohMonCloseLocal, 
		bohTueOpenFlag, bohTueOpenLocal, bohTueCloseLocal, 
		bohWedOpenFlag, bohWedOpenLocal, bohWedCloseLocal, 
		bohThuOpenFlag, bohThuOpenLocal, bohThuCloseLocal, 
		bohFriOpenFlag, bohFriOpenLocal, bohFriCloseLocal, 
		bohSatOpenFlag, bohSatOpenLocal, bohSatCloseLocal, 
		pickupSunOpenFlag, pickupSunOpenLocal, pickupSunCloseLocal, 
		pickupMonOpenFlag, pickupMonOpenLocal, pickupMonCloseLocal, 
		pickupTueOpenFlag, pickupTueOpenLocal, pickupTueCloseLocal, 
		pickupWedOpenFlag, pickupWedOpenLocal, pickupWedCloseLocal, 
		pickupThuOpenFlag, pickupThuOpenLocal, pickupThuCloseLocal, 
		pickupFriOpenFlag, pickupFriOpenLocal, pickupFriCloseLocal, 
		pickupSatOpenFlag, pickupSatOpenLocal, pickupSatCloseLocal
	];

	console.log(mysql.format(`INSERT INTO store_hours (store_id, 
		market_sun_open_flag, market_sun_open_local, market_sun_close_local, market_sun_description, 
		market_mon_open_flag, market_mon_open_local, market_mon_close_local, market_mon_description,
		market_tue_open_flag, market_tue_open_local, market_tue_close_local, market_tue_description,
		market_wed_open_flag, market_wed_open_local, market_wed_close_local, market_wed_description,
		market_thu_open_flag, market_thu_open_local, market_thu_close_local, market_thu_description,
		market_fri_open_flag, market_fri_open_local, market_fri_close_local, market_fri_description,
		market_sat_open_flag, market_sat_open_local, market_sat_close_local, market_sat_description,
		boh_sun_open_flag, boh_sun_open_local, boh_sun_close_local,  
		boh_mon_open_flag, boh_mon_open_local, boh_mon_close_local, 
		boh_tue_open_flag, boh_tue_open_local, boh_tue_close_local, 
		boh_wed_open_flag, boh_wed_open_local, boh_wed_close_local, 
		boh_thu_open_flag, boh_thu_open_local, boh_thu_close_local, 
		boh_fri_open_flag, boh_fri_open_local, boh_fri_close_local, 
		boh_sat_open_flag, boh_sat_open_local, boh_sat_close_local, 
		pickup_sun_open_flag, pickup_sun_open_local, pickup_sun_close_local, 
		pickup_mon_open_flag, pickup_mon_open_local, pickup_mon_close_local, 
		pickup_tue_open_flag, pickup_tue_open_local, pickup_tue_close_local, 
		pickup_wed_open_flag, pickup_wed_open_local, pickup_wed_close_local, 
		pickup_thu_open_flag, pickup_thu_open_local, pickup_thu_close_local, 
		pickup_fri_open_flag, pickup_fri_open_local, pickup_fri_close_local, 
		pickup_sat_open_flag, pickup_sat_open_local, pickup_sat_close_local
		)
			VALUES (?, 
				?, ?, ?, ?, 
				?, ?, ?, ?, 
				?, ?, ?, ?, 
				?, ?, ?, ?, 
				?, ?, ?, ?, 
				?, ?, ?, ?, 
				?, ?, ?, ?,
				?, ?, ?,  
				?, ?, ?,  
				?, ?, ?,  
				?, ?, ?,  
				?, ?, ?,  
				?, ?, ?,  
				?, ?, ?, 
				?, ?, ?,  
				?, ?, ?,  
				?, ?, ?,  
				?, ?, ?,  
				?, ?, ?,  
				?, ?, ?,  
				?, ?, ?
				)`, values))
	var results = await globals.pool.query(`INSERT INTO store_hours (store_id, 
			market_sun_open_flag, market_sun_open_local, market_sun_close_local, market_sun_description, 
			market_mon_open_flag, market_mon_open_local, market_mon_close_local, market_mon_description,
			market_tue_open_flag, market_tue_open_local, market_tue_close_local, market_tue_description,
			market_wed_open_flag, market_wed_open_local, market_wed_close_local, market_wed_description,
			market_thu_open_flag, market_thu_open_local, market_thu_close_local, market_thu_description,
			market_fri_open_flag, market_fri_open_local, market_fri_close_local, market_fri_description,
			market_sat_open_flag, market_sat_open_local, market_sat_close_local, market_sat_description,
			boh_sun_open_flag, boh_sun_open_local, boh_sun_close_local,  
			boh_mon_open_flag, boh_mon_open_local, boh_mon_close_local, 
			boh_tue_open_flag, boh_tue_open_local, boh_tue_close_local, 
			boh_wed_open_flag, boh_wed_open_local, boh_wed_close_local, 
			boh_thu_open_flag, boh_thu_open_local, boh_thu_close_local, 
			boh_fri_open_flag, boh_fri_open_local, boh_fri_close_local, 
			boh_sat_open_flag, boh_sat_open_local, boh_sat_close_local, 
			pickup_sun_open_flag, pickup_sun_open_local, pickup_sun_close_local, 
			pickup_mon_open_flag, pickup_mon_open_local, pickup_mon_close_local, 
			pickup_tue_open_flag, pickup_tue_open_local, pickup_tue_close_local, 
			pickup_wed_open_flag, pickup_wed_open_local, pickup_wed_close_local, 
			pickup_thu_open_flag, pickup_thu_open_local, pickup_thu_close_local, 
			pickup_fri_open_flag, pickup_fri_open_local, pickup_fri_close_local, 
			pickup_sat_open_flag, pickup_sat_open_local, pickup_sat_close_local
			)
				VALUES (?, 
					?, ?, ?, ?, 
					?, ?, ?, ?, 
					?, ?, ?, ?, 
					?, ?, ?, ?, 
					?, ?, ?, ?, 
					?, ?, ?, ?, 
					?, ?, ?, ?,
					?, ?, ?,  
					?, ?, ?,  
					?, ?, ?,  
					?, ?, ?,  
					?, ?, ?,  
					?, ?, ?,  
					?, ?, ?, 
					?, ?, ?,  
					?, ?, ?,  
					?, ?, ?,  
					?, ?, ?,  
					?, ?, ?,  
					?, ?, ?,  
					?, ?, ?
					)`, values);
	return results.insertId;
}



exports.create_orig = (timezone, storeId,
	sunDisplayOrder, sunOpenFlag, sunOpen, sunClose, sunDescription,
	monDisplayOrder, monOpenFlag, monOpen, monClose, monDescription,
	tueDisplayOrder, tueOpenFlag, tueOpen, tueClose, tueDescription,
	wedDisplayOrder, wedOpenFlag, wedOpen, wedClose, wedDescription,
	thuDisplayOrder, thuOpenFlag, thuOpen, thuClose, thuDescription,
	friDisplayOrder, friOpenFlag, friOpen, friClose, friDescription,
	satDisplayOrder, satOpenFlag, satOpen, satClose, satDescription) => {
	return new Promise((resolve, reject) => {


		var sunOpenEpoch = moment(sunOpen).unix();
		var sunCloseEpoch = moment(sunClose).unix();

		// console.log(sunOpen + 
		//   "\n Chicago: " + moment.tz(moment.unix(sunOpenEpoch), 'America/Chicago').format('dddd MMM Do h:mm a') + 
		// 	"\n New York: " + moment.tz(moment.unix(sunOpenEpoch), 'America/New_York').format('dddd MMM Do h:mm a') +
		// 	"\n Denver: " + moment.tz(moment.unix(sunOpenEpoch), 'America/Denver').format('dddd MMM Do h:mm a') +
		// 	"\n Los Angeles: " + moment.tz(moment.unix(sunOpenEpoch), 'America/Los_Angeles').format('dddd MMM Do h:mm a'));

		var values = [storeId,
			sunDisplayOrder, sunOpenFlag, moment.tz(sunOpen, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), sunOpenEpoch, moment.tz(sunClose, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), sunCloseEpoch, sunDescription,
			monDisplayOrder, monOpenFlag, moment.tz(monOpen, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), moment.tz(monClose, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), monDescription,
			tueDisplayOrder, tueOpenFlag, moment.tz(tueOpen, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), moment.tz(tueClose, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), tueDescription,
			wedDisplayOrder, wedOpenFlag, moment.tz(wedOpen, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), moment.tz(wedClose, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), wedDescription,
			thuDisplayOrder, thuOpenFlag, moment.tz(thuOpen, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), moment.tz(thuClose, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), thuDescription,
			friDisplayOrder, friOpenFlag, moment.tz(friOpen, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), moment.tz(friClose, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), friDescription,
			satDisplayOrder, satOpenFlag, moment.tz(satOpen, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), moment.tz(satClose, 'America/Chicago').format('YYYY-MM-DD HH:mm:ss'), satDescription
		];
		globals.pool.query("INSERT INTO store_hours (store_id, " +
				"sun_display_order, sun_open_flag, sun_open, sun_open_epoch, sun_close, sun_close_epoch, sun_description, " +
				"mon_display_order, mon_open_flag, mon_open, mon_close, mon_description, " +
				"tue_display_order, tue_open_flag, tue_open, tue_close, tue_description, " +
				"wed_display_order, wed_open_flag, wed_open, wed_close, wed_description, " +
				"thu_display_order, thu_open_flag, thu_open, thu_close, thu_description, " +
				"fri_display_order, fri_open_flag, fri_open, fri_close, fri_description, " +
				"sat_display_order, sat_open_flag, sat_open, sat_close, sat_description) " +
				"VALUES (?, " +
				"?, ?, ?, ?, ?, ?, ?, " +
				"?, ?, ?, ?, ?, " +
				"?, ?, ?, ?, ?, " +
				"?, ?, ?, ?, ?, " +
				"?, ?, ?, ?, ?, " +
				"?, ?, ?, ?, ?, " +
				"?, ?, ?, ?, ?)", values)
			.then((results) => {
				resolve(results.insertId);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getByStoreId = (storeId) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM store_hours WHERE store_id = ?", [storeId])
			.then((rows) => {
				colUtils.outboundNaming(rows);

				var storeHours = [];
				for (var i = 0; i < rows.length; i++) {
					storeHours.push({
						sunOpenFlag: rows[i].sun_open_flag,
						sunOpenLocal: rows[i].sun_open_local,
						sunCloseLocal: rows[i].sun_close_local,
						sunDescription: rows[i].sun_description,
						monOpenFlag: rows[i].mon_open_flag,
						monOpenLocal: rows[i].mon_open_local,
						monCloseLocal: rows[i].mon_close_local,
						monDescription: rows[i].mon_description,
						tueOpenFlag: rows[i].tue_open_flag,
						tueOpenLocal: rows[i].tue_open_local,
						tueCloseLocal: rows[i].tue_close_local,
						tueDescription: rows[i].tue_description,
						wedOpenFlag: rows[i].wed_open_flag,
						wedOpenLocal: rows[i].wed_open_local,
						wedCloseLocal: rows[i].wed_close_local,
						wedDescription: rows[i].wed_description,
						thuOpenFlag: rows[i].thu_open_flag,
						thuOpenLocal: rows[i].thu_open_local,
						thuCloseLocal: rows[i].thu_close_local,
						thuDescription: rows[i].thu_description,
						friOpenFlag: rows[i].fri_open_flag,
						friOpenLocal: rows[i].fri_open_local,
						friCloseLocal: rows[i].fri_close_local,
						friDescription: rows[i].fri_description,
						satOpenFlag: rows[i].sat_open_flag,
						satOpenLocal: rows[i].sat_open_local,
						satCloseLocal: rows[i].sat_close_local,
						satDescription: rows[i].sat_description,
					})
				}
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getByName = (name) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM stores WHERE store_name = ?", [name])
			.then((rows) => {
				var stores = [];
				for (var i = 0; i < rows.length; i++) {
					stores.push({
						storeId: rows[i].store_id,
						name: rows[i].store_name,
						address: rows[i].address,
						city: rows[i].city,
						state: rows[i].state,
						zip: rows[i].zip,
						onlineAvailable: rows[i].online_available,
						shopifyLocationId: rows[i].shopify_location_id,
						type: rows[i].type,
						timezone: rows[i].timezone,
						description: rows[i].description
					})
				}
				resolve(stores);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAll = (whereInfo, offset, limit) => {
	return new Promise((resolve, reject) => {
		whereInfo.values.push(offset);
		whereInfo.values.push(limit);
		console.log("clause: " + whereInfo.clause);
		var sql = mysql.format("SELECT * FROM stores " + whereInfo.clause + " ORDER BY store_name ASC LIMIT ?, ?", whereInfo.values);
		console.log(sql);
		globals.pool.query(sql)
			.then((rows) => {
				var stores = [];
				for (var i = 0; i < rows.length; i++) {
					stores.push({
						storeId: rows[i].store_id,
						name: rows[i].store_name,
						address: rows[i].address,
						city: rows[i].city,
						state: rows[i].state,
						zip: rows[i].zip,
						onlineAvailable: rows[i].online_available,
						shopifyLocationId: rows[i].shopify_location_id,
						type: rows[i].type,
						timezone: rows[i].timezone,
						description: rows[i].description
					})
				}
				resolve(stores);
			})
			.catch((e) => {
				reject(e);
			})
	});
}