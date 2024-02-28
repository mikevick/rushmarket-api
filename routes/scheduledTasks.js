'use strict';

const axios = require('axios').create({
	timeout: 5000,
	validateStatus: function (status) {
		return ((status == 404) || (status >= 200 && status < 300));
	}
});

require('../utils/keyinjector').injectKey(axios);

const express = require('express');
const router = express.Router();
const moment = require('moment');

const gdeActions = require('../actions/gde');
const googleFeedActions = require('../actions/googleFeed');
const partnerActions = require('../actions/partners');
const vendorActions = require('../actions/vendors');

const comms = require('../utils/comms');
const configUtils = require('../utils/configUtils');
const logUtils = require('../utils/logUtils');
const globals = require('../globals');
const response = require('../utils/response');
const {
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

const GDE = require('../models/gdeModel');
const Logging = require('../models/logging');
const Mailchimps = require('../models/mailchimp');
const Mandrills = require('../models/mandrill');
const MemberCheckouts = require('../models/memberCheckouts');
const Members = require('../models/members');
const MembersToMove = require('../models/membersToMove');
const MembersToTag = require('../models/membersToTag');
const ProductHolds = require('../models/productHolds');
const RushProducts = require('../models/rushProducts');
const ScheduledTasks = require('../models/scheduledTasks');
const ScheduledTaskLog = require('../models/scheduledTaskLog');
const Shopifys = require('../models/shopify');
const Telemetries = require('../models/telemetries');
const Vendors = require('../models/vendors');

const {
	averageShippingByCategory,
	captureDnPMessaging,
	copyCoinsToCoreleap,
	copyVendorsToCoreleap,
	dataCheckNotifications,
	dataIntegrity,
	downloadAndStoreImages,
	generateAttributeNameValues,
	generateCatNav,
	generateTaxonomyProducts,
	generateMemberAliases,
	generatePrefixes,
	generateVendorPOs,
	rippleTransitions,
	moveMembers,
	processCatalogJobs,
	processExportJobs,
	processInventoryJobs,
	processInventoryShortages,
	processMandrillResends,
	sendAdhoc,
	stageProductDataforSearch,
	SyncSearchWithAlgolia,
	tagMembers,
	queueImagesToConvert
} = require('../actions/scheduledTasks');



//
//  GET /tasks/buildGoogleFeed
//
router.get(`/buildGoogleFeed`, async (req, res, next) => {
	try {
		req.query.max = (req.query.max) ? req.query.max : 500;
		var resp = {
			count: 0,
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			resp = await googleFeedActions.buildGoogleFeed(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /tasks/uploadGoogleFeed
//
router.get(`/uploadGoogleFeed`, async (req, res, next) => {
	try {
		req.query.max = (req.query.max) ? req.query.max : 500;
		var resp = {
			count: 0,
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			await googleFeedActions.uploadFeed(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});






//
//  GET /tasks/captureDnPMessaging
//
router.get(`/captureDnPMessaging`, async (req, res, next) => {
	try {
		var resp = {
			count: 0,
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			resp = await captureDnPMessaging(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /tasks/averageShippingByCategory
//
router.get(`/averageShippingByCategory`, async (req, res, next) => {
	try {
		var resp = {
			count: 0,
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			resp = await averageShippingByCategory(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /tasks/catalogJobs
//
router.get(`/catalogJobs`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
				data: {
					jobsProcessed: 0
				}
			};

			processCatalogJobs(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/copyCoinsToCoreleap
//
router.get(`/copyCoinsToCoreleap`, async (req, res, next) => {
	try {
		var resp = {
			count: 0,
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow vendors to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			resp = await copyCoinsToCoreleap(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /tasks/copyVendorsToCoreleap
//
router.get(`/copyVendorsToCoreleap`, async (req, res, next) => {
	try {
		var resp = {
			count: 0,
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow vendors to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			resp = await copyVendorsToCoreleap(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





//
//  GET /tasks/dataCheckNotifications
//
router.get(`/dataCheckNotifications`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
				data: {}
			};

			dataCheckNotifications(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});




//
//  GET /tasks/dataIntegrity
//
router.get(`/dataIntegrity`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
				data: {}
			};

			dataIntegrity(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/downloadAndStoreProductImages
//
router.get(`/downloadAndStoreProductImages`, async (req, res, next) => {
	try {
		var resp = {
			count: 0,
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			resp = await downloadAndStoreImages(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /tasks/queueImagesToConvert
//
router.get(`/queueImagesToConvert`, async (req, res, next) => {
	try {
		var resp = {
			count: 0,
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			resp = await queueImagesToConvert(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /tasks/catchupMemberAliases
//
router.get(`/catchupMemberAliases`, async (req, res, next) => {
	try {
		var resp = {
			count: 0,
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow vendors to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			await generateMemberAliases({
				query: {
					count: 1000
				}
			}, {});
			resp.count = await Members.getAllWithoutAlias();
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /tasks/generateAttributeNameValues
//
router.get(`/generateAttributeNameValues`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow vendors to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			generateAttributeNameValues(req, resp)
				.then((resp) => {
					respond(resp, res, next);
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
//  POST /tasks/generateCatNav
//
router.get(`/generateCatNav`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow vendors to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			generateCatNav(req, resp)
				.then((resp) => {
					respond(resp, res, next);
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
//  GET /tasks/generateTaxonomyProducts
//
router.get(`/generateTaxonomyProducts`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//	Only allow for internal API calls.
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			generateTaxonomyProducts(req, resp)
				.then((resp) => {
					respond(resp, res, next);
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
//  POST /tasks/generateMemberAliases
//
router.get(`/generateMemberAliases`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow vendors to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			generateMemberAliases(req, resp)
				.then((resp) => {
					respond(resp, res, next);
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
//  POST /tasks/generatePrefixess
//
router.get(`/generatePrefixes`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow vendors to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			generatePrefixes(req, resp)
				.then((resp) => {
					respond(resp, res, next);
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
//  GET /tasks/inventoryJobs
//
router.get(`/inventoryJobs`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
				data: {
					jobsProcessed: 0
				}
			};

			processInventoryJobs(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/inventoryShortages
//
router.get(`/inventoryShortages`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
				data: {
					shortProducts: 0
				}
			};

			processInventoryShortages(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/exportJobs
//
router.get(`/exportJobs`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
				data: {
					jobsProcessed: 0
				}
			};

			processExportJobs(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/mandrillResend
//
router.get(`/mandrillResend`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
				data: {
					jobsProcessed: 0
				}
			};

			processMandrillResends(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/rippleTransitions
//
router.get(`/rippleTransitions`, async (req, res, next) => {
	try {
		var resp = {
			count: 0,
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			resp = await rippleTransitions(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





//
//  GET /tasks/moveMembers
//
router.get(`/moveMembers`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
				data: {
					jobsProcessed: 0
				}
			};

			moveMembers(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/tagMembers
//
router.get(`/tagMembers`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
				data: {
					processed: 0
				}
			};

			tagMembers(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
				})
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/monitorLogEvents
//
router.get(`/monitorLogEvents`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
			};

			Logging.getRecentErrors()
				.then((events) => {
					if (events.length > 0) {
						comms.sendEmail(configUtils.get("ALERT_EMAIL"), 'Rush ERROR Logged', events[0].message, events[0].message);
					}

					response.respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				});
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/monitorGDE
//
router.get(`/monitorGDE`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
			};

			GDE.getRecentlyCalculated()
				.then((events) => {
					if (events[0].num === 0) {
						comms.sendEmail(configUtils.get("ALERT_EMAIL"), 'GDE INACTIVITY', '', '');
					}

					response.respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				});
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/scheduleGDERecalc
//
router.get(`/scheduleGDERecalc`, async (req, res, next) => {
	try {
		var calcStartDay = (configUtils.get("GDE_FULL_CALC_START_DOW") !== null) ? configUtils.get("GDE_FULL_CALC_START_DOW") : 3;
		var calcDays = (configUtils.get("GDE_FULL_CALC_NUM_DAYS") !== null) ? configUtils.get("GDE_FULL_CALC_NUM_DAYS") : 2;
		var resp = {
			statusCode: 200,
		};

		var categories = await GDE.getSkuCountsByCategory();
		var perDay = Math.round(categories.totalCount / calcDays);

		await GDE.clearCategoryGroupings();

		var allDays = 0;
		var thisDay = 0;
		for (var i = 0; i < categories.rows.length; i++) {
			await GDE.addCategoryGrouping(calcStartDay, categories.rows[i].categoryId);
			thisDay += categories.rows[i].num;
			if (thisDay > perDay) {
				allDays += thisDay;
				thisDay = 0;

				calcStartDay++;
				if (calcStartDay > 7) {
					calcStartDay = 0;
				}
			}
		}

		response.respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  GET /tasks/dailyGDERecalc
//
router.get(`/dailyGDERecalc`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		console.log(new moment().day());

		var rows = await GDE.getTodaysCategories(moment().day());

		for (var i=0; i < rows.length; i++) {
			if (rows[i].categoryId === null) {
				await gdeActions.queueShipCalcAllSkus(undefined, rows[i].categoryId, resp);
			}
			else {
				await gdeActions.queueShipCalcAllSkus(undefined, rows[i].categoryId, resp);
			}
		}

		
		response.respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /tasks/dailyCategoryExports
//
router.get(`/dailyCategoryExports`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
		}

		console.log(`Day: ${moment().day()} Hour: ${moment().hour()}`);
		var rows = await Vendors.getTodaysCategories(moment().day(), moment().hour());

		for (var i=0; i < rows.length; i++) {
			let url = `${process.env.RUSH_API_BASE_URL}/v1/products/exportJobs`;

			let options = {
					method: 'post',
					json: true,
					resolveWithFullResponse: true,
					headers: {
							// 'X-Shopify-Access-Token': shopifyCreds.sharedSecret,
							'content-type': 'application/json',
							'accept': 'application/json'
					},
			};
	
			let shopifyResponse = await axios.post(url, JSON.parse(rows[i].jobJson));
	
			// var id = await Products.createExportJob(111, 'CATALOG', rows[i].jobJson.format, rows[i].jobJson, rows[i].whereClause, rows[i].jobJson.label);
		}

		
		response.respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /tasks/monitorSlowTelem
//
router.get(`/monitorSlowTelem`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
			};

			Logging.getSlowTelem()
				.then((events) => {
					if (events.length > 0) {
						console.log("SENDING SLOW TELEM EMAIL");
						comms.sendEmail(configUtils.get("ALERT_EMAIL"), 'Slow Telem', events[0].url, events[0].url);
					}

					response.respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				});
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/pruneGDE
//
router.get(`/pruneGDE`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		GDE.intelliPrune({
				dbPool: globals.pool,
				dbProdPool: globals.productPool,
				dbLogPool: globals.logPool,
				mongoIdGen: globals.mongoid
			})
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/pruneGDEHashes
//
router.get(`/pruneGDEHashes`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		GDE.pruneHashes({
				dbPool: globals.pool,
				dbProdPool: globals.productPool,
				mongoIdGen: globals.mongoid
			})
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/queueFailedGDEMsgs
//
router.get(`/queueFailedGDEMsgs`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		var msgs = await GDE.getQueuedMsgs();
		for (var i = 0; i < msgs.length; i++) {
			gdeActions.queueShipCalcBySku(JSON.parse(msgs[i].msg), resp);
			GDE.deleteQueuedMsg(msgs[i].id);
		}
		response.respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});



//
//  GET /tasks/pruneMemberMovements
//
router.get(`/pruneMemberMovements`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		MembersToMove.prune()
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/pruneMemberTagging
//
router.get(`/pruneMemberTagging`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		MembersToTag.prune()
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/pruneHolds
//
router.get(`/pruneHolds`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		ProductHolds.prune()
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/pruneProductCache
//
router.get(`/pruneProductCache`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		RushProducts.removeExpiredInCache()
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/pruneHoldsHistory
//
router.get(`/pruneHoldsHistory`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		ProductHolds.pruneHistory()
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/pruneMemberCheckoutsHistory
//
router.get(`/pruneMemberCheckoutsHistory`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		MemberCheckouts.pruneHistory()
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/pruneLogs
//
router.get(`/pruneLogs`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		Logging.prune(30)
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});


//
//  GET /tasks/pruneTaskLogs
//
router.get(`/pruneTaskLogs`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		ScheduledTaskLog.prune(14)
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});


//
//  GET /tasks/pruneTelemetry
//
router.get(`/pruneTelemetry`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		Telemetries.prune(15)
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/pruneVerificationIds
//
router.get(`/pruneVerificationIds`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		Members.pruneVerificationIds()
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/pruneWebhooks
//
router.get(`/pruneWebhooks`, (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			pruned: 0
		};

		prom.push(Shopifys.prune(30));
		prom.push(Shopifys.pruneOrders(30));
		prom.push(Mandrills.prune(30));
		prom.push(Mailchimps.prune(30));

		Promise.all(prom)
			.then((result) => {
				if (result.affectedRows != undefined)
					resp.pruned = result.affectedRows;
				response.respond(resp, res, next);
			}).catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
			});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});



//
//  GET /tasks/scheduledTasks
//
router.get(`/scheduledTasks`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
				data: {}
			};

			var where = "";

			where = sqlUtils.addToWhere(where, "status = 'A'");


			ScheduledTasks.getAll(where)
				.then((rows) => {
					if (rows.length === 0) {
						response.respond(resp, res, next, undefined, 404, "No tasks found.")
					} else {
						resp.data.scheduledTasks = rows;
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
				});
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
		}
	});
});



//
//  GET /tasks/sendAdhoc
//
router.get(`/sendAdhoc`, async (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			sent: 0
		};


		resp.sent = await sendAdhoc();
		response.respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["pruned"]);
	}
});





//
//  GET /tasks/updateLastRun
//
router.get(`/updateLastRun`, (req, res, next) => {
	return new Promise((resolve, reject) => {
		try {
			var resp = {
				statusCode: 200,
			};


			ScheduledTasks.updateLastRun(req.query.name)
				.then((task) => {
					return ScheduledTaskLog.create(req.query.name, req.query.data);
				})
				.then((result) => {
					if (result != null) {
						response.respond(resp, res, next);
					} else {
						resp.statusCode = 404;
						response.respond(resp, res, next);
					}
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp);
				});
		} catch (e) {
			logUtils.routeExceptions(e, req, res, next, resp);
		}
	});
});



//
//  GET /tasks/generateVendorPOs
//
router.get(`/generateVendorPOs`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success."
		};

		//
		//	Only allow purchase orders to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			generateVendorPOs(req, resp)
				.then((resp) => {
					respond(resp, res, next);
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
//  GET /tasks/stageProductDataforSearch
//
router.get(`/stageProductDataforSearch`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};

		//	Only allow for internal API calls.
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			stageProductDataforSearch(req, resp)
				.then((resp) => {
					respond(resp, res, next);
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
//  GET /tasks/SyncSearchWithAlgolia
//
router.get('/SyncSearchWithAlgolia', (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};

		//	Only allow for internal API calls.
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {
			SyncSearchWithAlgolia(req, resp)
				.then((resp) => {
					respond(resp, res, next);
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
//  GET /tasks/vendorOrderEmails 
//
router.get(`/vendorOrderEmails`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};


		await vendorActions.processInvoiceAndShippedEmail(req, resp);

		// // Load client secrets from a local file.
		// fs.readFile('creds/tracking-email-credentials.json', (err, content) => {
		// 	if (err) return console.log('Error loading client secret file:', err);
		// 	// Authorize a client with credentials, then call the Gmail API.
		// 	authorize(JSON.parse(content), processMessages);
		// });



		response.respond(resp, res, next);

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}

});


//
//  GET /tasks/capturePartnerStorageFees
//
router.get('/capturePartnerStorageFees', async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		//	Only allow for internal API calls.
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {
			await partnerActions.captureStorageFees(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  GET /tasks/throttleGDE
//
router.get('/throttleGDE', async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		//	Only allow for internal API calls.
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {
			await gdeActions.throttleGDE(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





module.exports = router;