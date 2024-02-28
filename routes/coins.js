'use strict';

const globals = require('../globals');

const _ = require('lodash');
const check = require('check-types');
const express = require('express');
const router = express.Router();


const rushProductActions = require('../actions/rushProducts');

const Coins = require('../models/coins');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');


const {
	assortmentEligibility,
	createCrossListings,
	dedupe,
	deleteCrossListings,
	deleteMarginThresholds,
	getAll,
	getAllMarginThresholds,
	getById,
	getByManufacturerMPNs,
	getByVendorSkus,
	getCrossListings,
	getCrossListingsById,
	getSiblingsById,
	mergeCoins,
	mergeHistory,
	mintExisting,
	mintNew,
	mintOrMatch,
	remove,
	updateCoin,
	updateCrossListings,
	updateMarginThresholds
} = require('../actions/coins');



//
//  GET /coins/assortmentEligibility
//
router.get(`/assortmentEligibility`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};


		await assortmentEligibility(resp);
		response.respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});




//
//  GET /coins/crossListings
//
router.get(`/crossListings`, async (req, res, next) => {
	try {
		var limit = 10000000;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};
		var whereInfo = {
			join: '',
			clause: 'WHERE 1=1',
			values: []
		};



		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}


			if (req.query.coinIds) {
				if (req.query.coinIds.indexOf(',') >= 0) {
					var s = _.split(req.query.coinIds, ',')
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'cc.coin_id IN (' + placeholders + ')', s);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'cc.coin_id = ?', req.query.coinIds);
				}
			}

			await getCrossListings(whereInfo, offset, limit, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});




//
//  POST /coins/crossListings
//
router.post(`/crossListings`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {
				results: []
			}
		};



		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else if ((req.body.crossListings === undefined) || (req.body.crossListings[0].coinId === undefined) || (req.body.crossListings[0].crossListCategoryId === undefined)) {
			response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "crossListings, coinId, crossListCategoryId"));
		} else {

			await createCrossListings(req, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});



//
//  PUT /coins/crossListings
//
router.put(`/crossListings`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {
				results: []
			}
		};



		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else if ((req.body.crossListings === undefined) || (req.body.crossListings[0].id === undefined) || (req.body.crossListings[0].crossListCategoryId === undefined)) {
			response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "crossListings, id, crossListCategoryId"));
		} else {

			await updateCrossListings(req, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});




//
//  DELETE /coins/crossListings
//
router.delete(`/crossListings`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {
				results: []
			}
		};



		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else if ((req.body.crossListings === undefined) || (req.body.crossListings[0].id === undefined)) {
			response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "crossListings, id"));
		} else {

			await deleteCrossListings(req, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});




//
//  GET /coins/crossListings/{id}
//
router.get(`/crossListings/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			await getCrossListingsById(req.params.id, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});




//
//  GET /coins/marginTresholds
//
router.get(`/marginThresholds`, async (req, res, next) => {
	try {
		var coinFilter = null;
		var nameFilter = null;
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};

		if (req.query.coinId) {
			coinFilter = req.query.coinId.trim();
		}

		if (req.query.productName) {
			nameFilter = req.query.productName.trim();
		}

		await getAllMarginThresholds(resp, coinFilter, nameFilter);
		response.respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});



//
//  PUT /coins/marginTresholds
//
router.put(`/marginThresholds`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if ((req.body.coins === undefined) || (req.body.marginThreshold === undefined)) {
				response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "coins, marginThreshold"));
			} else if (!check.number(parseFloat(req.body.marginThreshold)) ||
				((check.number(parseFloat(req.body.marginThreshold)) && (parseFloat(req.body.marginThreshold) < -100)) ||
					(parseFloat(req.body.marginThreshold) > 100))) {
				response.respond(resp, res, next, ['id', 'data'], 400, 'Margin threshold must be a number in the range -100.00-100.00')
			} else {
				await updateMarginThresholds(req, resp)
				response.respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});



//
//  DELETE /coins/marginTresholds
//
router.delete(`/marginThresholds`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if (req.body.coins === undefined) {
				response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "coins"));
			} else {
				await deleteMarginThresholds(req, resp)
				response.respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});






//
//  DELETE /coins/{id}
//
router.delete(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow members to be retrieved for internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			remove(req.params.id, resp)
				.then((resp) => {
					response.respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





//
//  GET /coins
//
router.get(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			metaData: {
				totalCount: 0
			},
			data: {}
		};

		var limit = 10;
		var offset = 0;

		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}

		getAll(offset, limit, resp)
			.then((resp) => {
				response.respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined);
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});



//
//  GET /coins/mintExisting
//
router.get(`/mintExisting`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success.",
			id: 0
		};

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {


			mintExisting(resp)
				.then((resp) => {
					response.respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});



//
//  GET /coins/mintNew
//
router.get(`/mintNew`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success.",
			id: 0
		};

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {


			mintNew(resp)
				.then((resp) => {
					response.respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});



//
//  GET /coins/{id}/mergeHistory
//
router.get(`/:id/mergeHistory`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success.",
			id: 0
		};

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {


			mergeHistory(req.params.id, resp)
				.then((resp) => {
					response.respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});



//
//  GET /coins/{id}
//
router.get(`/:id`, (req, res, next) => {
	try {
		var includeProducts = false;
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};

		if ((req.query.includeProducts != undefined) && (req.query.includeProducts === "true")) {
			includeProducts = true;
		}


		getById(req.params.id, includeProducts, resp)
			.then((resp) => {
				response.respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined);
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});



//
//  GET /coins/{id}/siblings
//
router.get(`/:id/siblings`, (req, res, next) => {
	try {
		var includeProducts = false;
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};

		if ((req.query.includeProducts != undefined) && (req.query.includeProducts === "true")) {
			includeProducts = true;
		}


		getSiblingsById(req.params.id, includeProducts, resp)
			.then((resp) => {
				response.respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, undefined);
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});



//
//  POST /coins
//
router.post(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success.",
			id: 0
		};

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else if (((req.body.upc === undefined) || (req.body.vendorId === undefined) || (req.body.vendorSku === undefined)) &&
			((req.body.manufacturer === undefined) || (req.body.mpn === undefined) || (req.body.vendorId === undefined) || (req.body.vendorSku === undefined)) &&
			(req.body.vendorId === undefined) || (req.body.vendorSku === undefined)) {
			response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "upc + vendorID + vendorSku or manufacturer + mpn + vendorID + vendorSku or vendorId + vendorSku"));
		} else {

			mintOrMatch(req.body, resp)
				.then((resp) => {
					response.respond(resp, res, next);
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
//  POST /coins/lookupByManufacturerMPN
//
router.post(`/lookupByManufacturerMPN`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};


		if ((req.body.manufacturerMPNs === undefined) || (req.body.manufacturerMPNs.length === 0) || (req.body.manufacturerMPNs[0].manufacturer === undefined) || (req.body.manufacturerMPNs[0].mpn === undefined)) {
			response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "manufacturerMPNs"));
		} else {

			getByManufacturerMPNs(req.body.manufacturerMPNs, resp)
				.then((resp) => {
					response.respond(resp, res, next);
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
//  POST /coins/lookupByVendorSku
//
router.post(`/lookupByVendorSku`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};


		if ((req.body.vendorSkus === undefined) || (req.body.vendorSkus.length === 0) || (req.body.vendorSkus[0].vendorId === undefined) || (req.body.vendorSkus[0].vendorSku === undefined)) {
			response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "vendorSkus"));
		} else {

			getByVendorSkus(req.body.vendorSkus, resp)
				.then((resp) => {
					response.respond(resp, res, next);
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
//  PUT /coins/{id}
//
router.put(`/:id`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};


		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else if (req.body.listedOnMarketplace === undefined) {
			response.respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "listedOnMarketplace"));
		} else {
			var result = await updateCoin(req, resp);
			response.respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});




//
//  PUT /coins/{idA}/mergeInto/{idB}
//
router.put(`/:ida/mergeInto/:idb`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};


		if (req.params.ida === req.params.idb) {
			resp.statusCode = 409;
			resp.message = "Can't merge COIN into itself.";
			response.respond(resp, res, next);
		} else {
			mergeCoins(req.params.ida, req.params.idb, resp)
				.then((resp) => {
					response.respond(resp, res, next);
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
//  POST /coins/dedupe
//
router.post(`/dedupe`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success.",
			id: 0
		};


		await dedupe(req, resp);

		response.respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});




//
//  POST /coins/tempCleanup
//
router.post(`/tempCleanup`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success.",
			id: 0
		};


		var dupes = await globals.productPool.query(`SELECT date_created, vendor_sku, GROUP_CONCAT(DISTINCT coin_id) as coins, COUNT(*) AS total
																									FROM coins_to_vendor_skus 
																									WHERE vendor_id = '60f83bc800000111c0012a0a'
																									GROUP BY vendor_id, vendor_sku
																									HAVING total > 1`);

		for (var i = 0; i < dupes.length; i++) {
			var c = _.split(dupes[i].coins, ',');
			for (var j = 0; j < c.length; j += 2) {

				var rq1 = {
					query: {
						bypassFulfillmentOptionsFlag: "true",
						zip: 68134
					},
					params: {
						id: c[j]
					}
				}

				var rp1 = {
					statusCode: 200,
					message: memberText.get('GET_SUCCESS'),
					data: {}
				}

				var rq2 = {
					query: {
						bypassFulfillmentOptionsFlag: "true",
						zip: 68134
					},
					params: {
						id: c[(j + 1)]
					}
				}

				var rp2 = {
					statusCode: 200,
					message: memberText.get('GET_SUCCESS'),
					data: {}
				}

				var product1 = await rushProductActions.getByCoin(rq1, rp2);
				var product2 = await rushProductActions.getByCoin(rq1, rp2);


				var algolia1 = await globals.pool.query(`SELECT * FROM product_search_management WHERE product_data LIKE '%${c[j]}%'`);
				var algolia2 = await globals.pool.query(`SELECT * FROM product_search_management WHERE product_data LIKE '%${c[(j+1)]}%'`);


				var marketplace1 = await globals.productPool.query(`SELECT l.platform, cl.* FROM coins_to_listed_on cl LEFT JOIN listed_on l ON l.id = cl.listed_on_id WHERE coin_id = '${c[j]}'`);
				var marketplace2 = await globals.productPool.query(`SELECT l.platform, cl.* FROM coins_to_listed_on cl LEFT JOIN listed_on l ON l.id = cl.listed_on_id WHERE coin_id = '${c[(j+1)]}'`);

				console.log(`COIN${(j+1)}: ${c[j]}   PDP: ${product1.statusCode}  Algolia: ${algolia1.length > 0}  Marketplace: ${marketplace1.length > 0} `);
				console.log(`COIN${(j+2)}: ${c[(j+1)]}   PDP: ${product2.statusCode}  Algolia: ${algolia2.length > 0}  Marketplace: ${marketplace2.length > 0} `);

				if ((product1.statusCode === 404) && (algolia1.length === 0) && (marketplace1.length === 0) &&
					(product2.statusCode === 404) && (algolia2.length === 0) && (marketplace2.length === 0)) {
					var coin1 = await Coins.getById(c[j]);
					var upc1 = await Coins.getUPCByCoinId(c[j]);
					var vsku1 = await Coins.getVendorSkuByCoinId(c[j]);
					var mpn1 = await Coins.getManuByCoinId(c[j]);

					var coin2 = await Coins.getById(c[(j + 1)]);
					var upc2 = await Coins.getUPCByCoinId(c[(j + 1)]);
					var vsku2 = await Coins.getVendorSkuByCoinId(c[(j + 1)]);
					var mpn2 = await Coins.getManuByCoinId(c[(j + 1)]);

					console.log(`COINS: ${coin1.coin[0].id} ${coin2.coin[0].id}`);
					if ((upc1.length > 0) || (upc2.length > 0)) {
						console.log(`HAS UPC`);
						process.exit(1);
					}

					console.log(`MANUS: `);
					console.log(`        ${mpn1[0].id} ${mpn1[0].manufacturer} ${mpn1[0].mpn}`);
					console.log(`        ${mpn2[0].id} ${mpn2[0].manufacturer} ${mpn2[0].mpn}`);

					console.log(`VSKUS: `);
					console.log(`        ${vsku1[0].id} ${vsku1[0].vendorId} ${vsku1[0].vendorSku}`);
					console.log(`        ${vsku2[0].id} ${vsku2[0].vendorId} ${vsku2[0].vendorSku}`);

					if ((mpn1[0].manufacturer == mpn2[0].manufacturer) && (mpn1[0].mpn == mpn2[0].mpn) &&
						(vsku1[0].vendorId == vsku2[0].vendorId) && (vsku1[0].vendorSku == vsku2[0].vendorSku)) {
						await globals.productPool.query(`DELETE FROM coins WHERE id = '${c[j]}'`);
						await globals.productPool.query(`DELETE FROM coins_to_manufacturer_mpn WHERE id = '${mpn1[0].id}'`);
						await globals.productPool.query(`DELETE FROM coins_to_vendor_skus WHERE id = '${vsku1[0].id}'`);

						console.log("DELETED");
						console.log("WINNER: " + c[(j + 1)]);
					} else {
						console.log("MISMATCH");
						process.exit(1);
					}
				}
			}
			console.log("=================================\n\n");
		}


		response.respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
	}
});








module.exports = router;