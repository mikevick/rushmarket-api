'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const {
	stores: {
		getRawStoreHours,
		getStoreHours
	},
	zipToCity: {
		runLocationCalculations
	}
} = require('../actions');


const Stores = require('../models/stores');
const StoreHours = require('../models/storeHours');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

const {
	respond
} = require('../utils/response');



//
//  DELETE /stores/{id}
//
router.delete(`/:id`, (req, res, next) => {
	try {
		// var resp = {
		// 	statusCode: 200
		// };

		// //
		// //	Only allow members to be retrieved for internal API calls.
		// //
		// if (req.get('x-app-type') != 'INT') {
		// 	response.respond(resp, res, next, undefined, 403, "Access denied.");
		// } else {

		// 	AppVersions.delById(req.params.id)
		// 		.then((rows) => {
		// 			if (rows.length === 0) {
		// 				response.respond(resp, res, next, undefined, 404);
		// 			} else {
		// 				response.respond(resp, res, next);
		// 			}
		// 		})
		// 		.catch((e) => {
		// 			logUtils.routeExceptions(e, req, res, next, resp);
		// 		})
		// }
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





//
//  GET /stores
//
router.get(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			data: {}
		};

		var includeHoursFlag = false;
		var limit = 1000;
		var offset = 0;
		var sortBy = "store_name ASC";
		var prom = [];
		var whereInfo = {
			clause: "",
			values: []
		};

		//
		//	If this is an external API call we're only returning physical stores.
		//
		if (req.get('x-app-type') != 'INT') {
			// req.query.type = "PHYSICAL";
			whereInfo = sqlUtils.appendWhere(whereInfo, "type IN ('PHYSICAL', 'ONLINE')");

			req.query.includeHoursFlag = true;
		}


		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}

		if (req.query.city) {
			whereInfo = sqlUtils.appendWhere(whereInfo, "city = ?", req.query.city);
		}

		if (req.query.state) {
			whereInfo = sqlUtils.appendWhere(whereInfo, "state = ?", req.query.state);
		}

		if (req.query.onlineAvailable) {
			whereInfo = sqlUtils.appendWhere(whereInfo, "online_available = ?", req.query.onlineAvailable);
		}

		if (req.query.partnerFacility) {
			whereInfo = sqlUtils.appendWhere(whereInfo, "partner_facility = ?", req.query.partnerFacility);
		}

		if (req.query.isProductLocation) {
			whereInfo = sqlUtils.appendWhere(whereInfo, "is_product_location = ?", req.query.isProductLocation);
		}

		if (req.query.type) {
			whereInfo = sqlUtils.appendWhere(whereInfo, "type = ?", req.query.type);
		}

		if (req.query.activeFlag) {
			if (req.query.activeFlag === 'true') {
				whereInfo = sqlUtils.appendWhere(whereInfo, "active = 'Y'");
			} else if (req.query.activeFlag === 'false') {
				whereInfo = sqlUtils.appendWhere(whereInfo, "active = 'N'");
			}
		}

		if (req.query.cityId) {
			whereInfo = sqlUtils.appendWhere(whereInfo, "city_id = ?", req.query.cityId);
		}

		if (req.query.inStoreToken) {
			whereInfo = sqlUtils.appendWhere(whereInfo, "in_store_token = ?", req.query.inStoreToken);
		}

		if (req.query.includeHoursFlag) {
			includeHoursFlag = true;
		}

		if (req.query.sortBy) {
			sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['store_id', 'state', 'city', 'zip', 'store_name']);
			if (sortBy === 'field') {
				respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
			} else if (sortBy === 'direction') {
				respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
			}
		}

		if ((sortBy != 'field') && (sortBy != 'direction')) {
			Stores.getAll(whereInfo, sortBy, offset, limit)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next);
					} else {
						resp.data.stores = rows;

						if (includeHoursFlag === false) {
							response.respond(resp, res, next);
						} else {
							for (var i = 0; i < rows.length; i++) {
								if (req.get('x-app-type') != 'INT') {
									delete resp.data.stores[i].shopifyLocationId;
								}

								prom.push(StoreHours.getByStoreId(rows[i].id));
							}
						}

						return Promise.all(prom);
					}
				})
				.then((hours) => {
					if ((hours != undefined) && (hours.length > 0)) {
						// for (var i = 0; i < hours.length; i++) {
						//   if (hours[i].length > 0) {
						//     resp.data.stores[i].hours = prettyHours(resp.data.stores[i].timezone, hours[i][0]);
						//   } else {
						//     resp.data.stores[i].hours = [];
						//   }
						// }

						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["stores"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["stores"]);
	}
});

//
//  GET /stores/validateTargetedCity
//
router.get(`/validateTargetedCity`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		if (req.query.city === undefined) {
			resp.statusCode = 404;
		} else {
			var row = await Stores.getTargetCity(req.query.city);
			if (row.length === 0) {
				resp.statusCode = 404;
			}
		}

		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["stores"]);
	}
});

//
//  GET /stores/{id}
//
router.get(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			data: {}
		};

		Stores.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					response.respond(resp, res, next, ["stores"], 404);
				} else {
					resp.data = rows[0];
					if (req.get('x-app-type') != 'INT') {
						delete resp.data.shopifyLocationId;
						delete resp.data.type;
					}

					response.respond(resp, res, next);
				}
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["stores"]);
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["stores"]);
	}
});




//
//  POST /stores
//
router.post(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			id: 0
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["id"], 403, "Access denied.");
		} else if ((req.body.name === undefined) ||
			(req.body.address === undefined) || (req.body.city === undefined) || (req.body.state === undefined) || (req.body.zip === undefined) ||
			(req.body.type === undefined)) {
			response.respond(resp, res, next, 400, ["id"], memberText.get("MISSING_REQUIRED").replace('%required%', "name, address, city, state, zip, type"));
		} else {

			//
			//	Verify a store with this name hasn't already been used.
			//
			Stores.getByName(req.body.name)
				.then((rows) => {
					//
					//	Name already exists.
					//
					if (rows.length > 0) {
						response.respond(resp, res, next, ["id"], 409, "Store by this name already exists.");
					}
					//
					//	We have not seen this name before.
					//
					else {
						Stores.create(req.body.name, req.body.address, req.body.city, req.body.state, req.body.zip, req.body.onlineAvailable, req.body.shopifyLocationId, req.body.type, req.body.timezone, req.body.lat, req.body.lng, req.body.description)
							.then((id, rejected) => {
								return runLocationCalculations().then(() => {
									resp.id = id;
									response.respond(resp, res, next);
								});
							})
							.catch((e) => {
								logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
							})
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});


//
//  POST /stores/{id}/hours
//
router.post(`/:id/hours`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			id: 0
		};
		var timezone = 'America/Chicago';

		//
		//	Only allow store hours to be added for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, ["id"], 403, "Access denied.");
		} else if ((req.params.id === undefined) ||
			(req.body.marketSunOpenFlag === undefined) || (req.body.marketSunOpenLocal === undefined) || (req.body.marketSunCloseLocal === undefined) ||
			(req.body.marketMonOpenFlag === undefined) || (req.body.marketMonOpenLocal === undefined) || (req.body.marketMonCloseLocal === undefined) ||
			(req.body.marketTueOpenFlag === undefined) || (req.body.marketTueOpenLocal === undefined) || (req.body.marketTueCloseLocal === undefined) ||
			(req.body.marketWedOpenFlag === undefined) || (req.body.marketWedOpenLocal === undefined) || (req.body.marketWedCloseLocal === undefined) ||
			(req.body.marketThuOpenFlag === undefined) || (req.body.marketThuOpenLocal === undefined) || (req.body.marketThuCloseLocal === undefined) ||
			(req.body.marketFriOpenFlag === undefined) || (req.body.marketFriOpenLocal === undefined) || (req.body.marketFriCloseLocal === undefined) ||
			(req.body.marketSatOpenFlag === undefined) || (req.body.marketSatOpenLocal === undefined) || (req.body.marketSatCloseLocal === undefined) ||
			(req.body.bohSunOpenFlag === undefined) || (req.body.bohSunOpenLocal === undefined) || (req.body.bohSunCloseLocal === undefined) ||
			(req.body.bohMonOpenFlag === undefined) || (req.body.bohMonOpenLocal === undefined) || (req.body.bohMonCloseLocal === undefined) ||
			(req.body.bohTueOpenFlag === undefined) || (req.body.bohTueOpenLocal === undefined) || (req.body.bohTueCloseLocal === undefined) ||
			(req.body.bohWedOpenFlag === undefined) || (req.body.bohWedOpenLocal === undefined) || (req.body.bohWedCloseLocal === undefined) ||
			(req.body.bohThuOpenFlag === undefined) || (req.body.bohThuOpenLocal === undefined) || (req.body.bohThuCloseLocal === undefined) ||
			(req.body.bohFriOpenFlag === undefined) || (req.body.bohFriOpenLocal === undefined) || (req.body.bohFriCloseLocal === undefined) ||
			(req.body.bohSatOpenFlag === undefined) || (req.body.bohSatOpenLocal === undefined) || (req.body.bohSatCloseLocal === undefined) ||
			(req.body.pickupSunOpenFlag === undefined) || (req.body.pickupSunOpenLocal === undefined) || (req.body.pickupSunCloseLocal === undefined) ||
			(req.body.pickupMonOpenFlag === undefined) || (req.body.pickupMonOpenLocal === undefined) || (req.body.pickupMonCloseLocal === undefined) ||
			(req.body.pickupTueOpenFlag === undefined) || (req.body.pickupTueOpenLocal === undefined) || (req.body.pickupTueCloseLocal === undefined) ||
			(req.body.pickupWedOpenFlag === undefined) || (req.body.pickupWedOpenLocal === undefined) || (req.body.pickupWedCloseLocal === undefined) ||
			(req.body.pickupThuOpenFlag === undefined) || (req.body.pickupThuOpenLocal === undefined) || (req.body.pickupThuCloseLocal === undefined) ||
			(req.body.pickupFriOpenFlag === undefined) || (req.body.pickupFriOpenLocal === undefined) || (req.body.pickupFriCloseLocal === undefined) ||
			(req.body.pickupSatOpenFlag === undefined) || (req.body.pickupSatOpenLocal === undefined) || (req.body.pickupSatCloseLocal === undefined)
		) {
			response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "see documentation"));
		} else {

			//
			//	Verify storeId.
			//
			var rows = await Stores.getById(req.params.id);
			if (rows.length === 0) {
				response.respond(resp, res, next, ["id"], 404, "Referenced store ID doesn't exist.");
			} else {
				timezone = rows[0].timezone;

				var id = await StoreHours.create(timezone, req.params.id,
					req.body.marketSunOpenFlag, req.body.marketSunOpenLocal, req.body.marketSunCloseLocal, req.body.marketSunDescription,
					req.body.marketMonOpenFlag, req.body.marketMonOpenLocal, req.body.marketMonCloseLocal, req.body.marketMonDescription,
					req.body.marketTueOpenFlag, req.body.marketTueOpenLocal, req.body.marketTueCloseLocal, req.body.marketTueDescription,
					req.body.marketWedOpenFlag, req.body.marketWedOpenLocal, req.body.marketWedCloseLocal, req.body.marketWedDescription,
					req.body.marketThuOpenFlag, req.body.marketThuOpenLocal, req.body.marketThuCloseLocal, req.body.marketThuDescription,
					req.body.marketFriOpenFlag, req.body.marketFriOpenLocal, req.body.marketFriCloseLocal, req.body.marketFriDescription,
					req.body.marketSatOpenFlag, req.body.marketSatOpenLocal, req.body.marketSatCloseLocal, req.body.marketSatDescription,
					req.body.bohSunOpenFlag, req.body.bohSunOpenLocal, req.body.bohSunCloseLocal, 
					req.body.bohMonOpenFlag, req.body.bohMonOpenLocal, req.body.bohMonCloseLocal, 
					req.body.bohTueOpenFlag, req.body.bohTueOpenLocal, req.body.bohTueCloseLocal, 
					req.body.bohWedOpenFlag, req.body.bohWedOpenLocal, req.body.bohWedCloseLocal, 
					req.body.bohThuOpenFlag, req.body.bohThuOpenLocal, req.body.bohThuCloseLocal, 
					req.body.bohFriOpenFlag, req.body.bohFriOpenLocal, req.body.bohFriCloseLocal, 
					req.body.bohSatOpenFlag, req.body.bohSatOpenLocal, req.body.bohSatCloseLocal, 
					req.body.pickupSunOpenFlag, req.body.pickupSunOpenLocal, req.body.pickupSunCloseLocal, 
					req.body.pickupMonOpenFlag, req.body.pickupMonOpenLocal, req.body.pickupMonCloseLocal, 
					req.body.pickupTueOpenFlag, req.body.pickupTueOpenLocal, req.body.pickupTueCloseLocal, 
					req.body.pickupWedOpenFlag, req.body.pickupWedOpenLocal, req.body.pickupWedCloseLocal, 
					req.body.pickupThuOpenFlag, req.body.pickupThuOpenLocal, req.body.pickupThuCloseLocal, 
					req.body.pickupFriOpenFlag, req.body.pickupFriOpenLocal, req.body.pickupFriCloseLocal, 
					req.body.pickupSatOpenFlag, req.body.pickupSatOpenLocal, req.body.pickupSatCloseLocal 
				);
				resp.id = id;
				response.respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});


//
//  GET /stores/{id}/rawHours
//
router.get(`/:id/rawHours`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			hours: []
		};


		await getRawStoreHours(req, resp);
		response.respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["days"]);
	}
});


//
//  GET /stores/{id}/hours
//
router.get(`/:id/hours`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			hours: []
		};


		await getStoreHours(req, resp);
		response.respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["days"]);
	}
});



module.exports = router;