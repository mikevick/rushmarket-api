'use strict'

const _ = require('lodash');
const isValidZipcode = require('is-valid-zipcode');
const moment = require('moment');
const fs = require('fs');
const { parse } = require('csv-parse');

const Members = require('../models/members');
const MembersToMove = require('../models/membersToMove');
const MembersToTag = require('../models/membersToTag');
const Metros = require('../models/metros');
const Stores = require('../models/stores');
const TargetedCities = require('../models/targetedCities');
const ZipToCity = require('../models/zipToCity');

const logUtils = require('../utils/logUtils')
const { formatResp } = require('../utils/response')



//
//	Add zip(s) to city
//
var addZips = async (body, resp) => {
	var label = "addzip-" + new moment().format("YYYY-MM-DD") + "-" + new moment().format("HH:mm");
	var prom = [];
	var theType = 'PRIMARY';


	var city = await TargetedCities.getTargetCityById(body.cityId);
	if (city.length === 0) {
		resp.statusCode = 404;
		resp.message = "City not found.";
		delete resp.data;

		return resp;
	}


	resp.data.zips = [];

	var s = _.split(body.zips, ',');
	for (var i = 0; i < s.length; i++) {
		var z = s[i].trim();

		var o = {
			cityId: body.cityId,
			type: body.type,
			zip: z,
			region: body.region,
			population: body.population
		}

		if (isValidZipcode(s[i].trim()) === false) {
			o.successFlag = false;
			o.message = "Invalid zip code.";
		} else {


			//	If there is another mapping for this zip to another city we'll remove it so the new mapping can proceed.
			var checkMapping = await ZipToCity.checkMappingOtherCity(body.cityId, z);
			if (checkMapping.length > 0) {
				await ZipToCity.deleteMapping(checkMapping[0].city_id, checkMapping[0].zip);
			}

			var result = await ZipToCity.addMapping(z, body.cityId, body.type, body.region, body.population);

			if (result.affectedRows === 1) {
				o.successFlag = true;
				o.message = "Success.";
				o.id = result.insertId;

				var members = await Members.getByZip(z);

				for (var j = 0; j < members.length; j++) {
					console.log("Moving: " + members[j].email);

					prom.push(MembersToMove.queue(label, members[j].id, members[j].homeCityId, body.cityId));
				}
			} else {
				o.successFlag = false;
				o.message = "Duplicate zip code.";
			}

			try {
				await Promise.all(prom);
			} catch (e) {
				if (e.message !== 'The requested resource could not be found.') {
					logUtils.log({
						severity: 'ERROR',
						type: 'ZIP2CITY',
						message: "Exception: " + e.message
					})
				}
			}
		}

		resp.data.zips.push(o);
	}

	resp.data.label = label;
	return resp;
}



//
//	Update zip(s) to city
//
var updateZips = async (body, resp) => {
	var label = "updatezip-" + new moment().format("YYYY-MM-DD") + "-" + new moment().format("HH:mm");
	var prom = [];
	var theType = 'PRIMARY';


	var city = await TargetedCities.getTargetCityById(body.cityId);
	if (city.length === 0) {
		resp.statusCode = 404;
		resp.message = "City not found.";
		delete resp.data;

		return resp;
	}


	resp.data.zips = [];

	var s = _.split(body.zips, ',');
	for (var i = 0; i < s.length; i++) {
		var z = s[i].trim();

		var o = {
			cityId: body.cityId,
			type: body.type,
			zip: z,
			region: body.region,
			population: body.population
		}

		if (isValidZipcode(s[i].trim()) === false) {
			o.successFlag = false;
			o.message = "Invalid zip code.";
		} else {

			var result = await ZipToCity.updateMapping(z, body.cityId, body.type, body.region, body.population);

			if (result.affectedRows === 1) {
				o.successFlag = true;
				o.message = "Success.";
				o.id = result.insertId;

				var members = await Members.getByZip(z);

				for (var j = 0; j < members.length; j++) {
					console.log("Moving: " + members[j].email);

					prom.push(MembersToMove.queue(label, members[j].id, members[j].homeCityId, body.cityId));
				}
			} else {
				o.successFlag = false;
				o.message = "Duplicate zip code.";
			}

			try {
				await Promise.all(prom);
			} catch (e) {
				if (e.message !== 'The requested resource could not be found.') {
					logUtils.log({
						severity: 'ERROR',
						type: 'ZIP2CITY',
						message: "Exception: " + e.message
					})
				}
			}
		}

		resp.data.zips.push(o);
	}

	resp.data.label = label;
	return resp;
}



//
//	Delete zip(s) to city
//
var deleteZips = async (body, resp) => {
	var label = "delzip-" + new moment().format("YYYY-MM-DD") + "-" + new moment().format("HH:mm");
	var prom = [];

	var city = await TargetedCities.getTargetCityById(body.cityId);
	if (city.length === 0) {
		resp.statusCode = 404;
		resp.message = "City not found.";
		delete resp.data;

		return resp;
	}


	resp.data.zips = [];

	var s = _.split(body.zips, ',');
	for (var i = 0; i < s.length; i++) {
		var z = s[i].trim();

		var o = {
			cityId: body.cityId,
			zip: z
		}

		if (isValidZipcode(z) === false) {
			o.successFlag = false;
			o.message = "Invalid zip code.";
		} else {

			var result = await ZipToCity.deleteMapping(body.cityId, z);

			if (result.affectedRows === 1) {
				o.successFlag = true;
				o.message = "Success.";


				var members = await Members.getByZip(z);

				for (var j = 0; j < members.length; j++) {
					console.log("Moving: " + members[j].email);

					prom.push(MembersToMove.queue(label, members[j].id, members[j].homeCityId, 0));
				}
			} else {
				o.successFlag = false;
				o.message = "Zip code not found.";
			}

			try {
				await Promise.all(prom);
			} catch (e) {
				if (e.message !== 'The requested resource could not be found.') {
					logUtils.log({
						severity: 'ERROR',
						type: 'ZIP2CITY',
						message: "Exception: " + e.message
					})
				}
			}
		}

		resp.data.zips.push(o);
	}

	resp.data.label = label;
	return resp;
}



//
//	GET all zip to city mappings
//
var getAll = async (whereInfo, sortBy, resp) => {
	var prom = [];

	var rows = await ZipToCity.getAll(whereInfo, sortBy);

	resp.data.zipToCity = rows;
	return resp;
}


//
//	GET product by ID
//
var getById = async (req, resp) => {
	if (req.get('x-app-type') != 'INT') {
		response.respond(resp, res, next, undefined, 403, 'Access denied.')
	} else {
		var result = await RushProducts.getById(req.params.id);
		if (result.length === 0) {
			formatResp(resp, undefined, 404, 'Product not found.')
		} else {
			resp.data = result[0]
		}
		return resp;
	}
}


//
//	Update type
//
var updateType = async (body, resp) => {
	var label = "updatezip-" + new moment().format("YYYY-MM-DD") + "-" + new moment().format("HH:mm");
	var prom = [];
	resp.data.zips = [];

	var s = _.split(body.zips, ',');
	for (var i = 0; i < s.length; i++) {
		var z = s[i].trim();

		var o = {
			cityId: body.cityId,
			type: body.type,
			zip: z
		}

		var result = await ZipToCity.updateType(body.type, z);

		if (result.affectedRows === 1) {
			o.successFlag = true;
			o.message = "Success.";

			var members = await Members.getByZip(z);

			for (var j = 0; j < members.length; j++) {
				console.log("Moving: " + members[j].email);

				prom.push(MembersToTag.queue(label, members[j].id, z, body.type));
			}
		} else {
			o.successFlag = false;
			o.message = "Zip code not found or couldn't be updated.";
		}

		try {
			await Promise.all(prom);
		} catch (e) {
			if (e.message !== 'The requested resource could not be found.') {
				logUtils.log({
					severity: 'ERROR',
					type: 'ZIP2CITY',
					message: "Exception: " + e.message
				})
			}
		}

		resp.data.zips.push(o);
	}

	resp.data.label = label;
	return resp;
}



//
// Update location
//
async function updateLocations(zipDataCsvFile) {
	const csvParser = fs.createReadStream(zipDataCsvFile.path)
		.pipe(parse({
			delimiter: ',',
			trim: true,
			columns: header => header.map(column => column.trim().toLowerCase())
		}));

	let updatedRecordCount = 0;
	for await (const row of csvParser) {
		const result = await ZipToCity.updateLocation(row.zip, parseFloat(row.lat), parseFloat(row.long));
		updatedRecordCount += result.affectedRows;
	}

	return updatedRecordCount;
}

function distance(lat1, lng1, lat2, lng2) {
	// convert degrees to radians
	lng1 = lng1 * Math.PI / 180;
	lng2 = lng2 * Math.PI / 180;
	lat1 = lat1 * Math.PI / 180;
	lat2 = lat2 * Math.PI / 180;

	// Haversine formula
	const dlng = lng2 - lng1;
	const dlat = lat2 - lat1;
	const a = Math.pow(Math.sin(dlat / 2), 2) +
		Math.cos(lat1) * Math.cos(lat2) *
		Math.pow(Math.sin(dlng / 2), 2);

	const c = 2 * Math.asin(Math.sqrt(a));

	// Radius of earth in kilometers. Use 3956 for miles
	const r = 6371;

	// calculate the result
	return c * r;
}

function nearestMetro(metros, theCity, lat, lng) {
	const nearestMetro = metros
		.filter(metro => ((typeof metro.lat === "number" && typeof metro.lng === "number") && (metro.cityId !== theCity)))
		.map(metro => ({
			cityId: metro.cityId,
			distance: distance(metro.lat, metro.lng, lat, lng)
		}))
		.reduce((nearestMetro, metro) =>
			!nearestMetro || metro.distance < nearestMetro.distance ? metro : nearestMetro, null);
	return nearestMetro ? nearestMetro.cityId : null;
}

function nearestStore(stores, lat, lng) {
	const nearestStore = stores
		.filter(store => typeof store.lat === "number" && typeof store.lng === "number")
		.map(store => ({
			storeId: store.storeId,
			distance: distance(store.lat, store.lng, lat, lng)
		}))
		.reduce((nearestStore, store) =>
			!nearestStore || store.distance < nearestStore.distance ? store : nearestStore, null);
	return nearestStore ? nearestStore.storeId : null;
}

//
// Run Location Calculations
//
async function runLocationCalculations() {
	const rrcStores = await Stores.getActiveRRCs();
	const ownedRrcStores = await Stores.getActiveOwnedRRCs();
	const metros = await Metros.getMetroZipAndStoreId();

	let updatedRecordCount = 0;
	await ZipToCity.streamAll(async (zipToCity) => {
		if (typeof zipToCity.lat !== 'number' || typeof zipToCity.lng !== 'number') {
			return;
		}

		const nearestRrcStoreId = nearestStore(rrcStores, zipToCity.lat, zipToCity.lng);
		const nearestOwnedRrcStoreId = nearestStore(ownedRrcStores, zipToCity.lat, zipToCity.lng);
		const nextNearestMetro = nearestMetro(metros, zipToCity.city_id, zipToCity.lat, zipToCity.lng);

		if (
			nearestRrcStoreId !== zipToCity.nearest_rrc_store_id ||
			nearestOwnedRrcStoreId !== zipToCity.nearest_owned_rrc_store_id ||
			nextNearestMetro !== zipToCity.next_nearest_metro
		) {
			const result = await ZipToCity.updateNearestRrcStores(zipToCity.zip, nearestRrcStoreId, nearestOwnedRrcStoreId, nextNearestMetro);
			updatedRecordCount += result.affectedRows;
		}
	});

	return updatedRecordCount;
}



module.exports = {
	addZips,
	deleteZips,
	getAll,
	getById,
	updateType,
	updateLocations,
	updateZips,
	runLocationCalculations
}