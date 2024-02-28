'use strict';

const amqp = require('amqplib');

const configUtils = require('../utils/configUtils');

const vcgdeUtils = require('rushutils-vc-gde');

const globals = require('../globals');

const markets = require('../actions/markets');

const Categories = require('../models/categories');
const VCGDE = require('../models/vcGDE');
const Markets = require('../models/markets');
const Metros = require('../models/metros');
const ProductActionLog = require('../models/productActionLog');
const RushProducts = require('../models/rushProducts');
const Vendors = require('../models/vendors');
const ZipToCity = require('../models/zipToCity');

const responseUtils = require('../utils/response');



var calcAvgShipCostBySku = async (msg, resp, storeFlag, includeRawFlag) => {
	vcgdeUtils.initConfig({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});

	resp = await vcgdeUtils.calculateShippingAverageByVendorSku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag, includeRawFlag);

	return resp;
}


var calcMarginBySku = async (msg, resp, storeFlag) => {
	vcgdeUtils.initConfig({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});

	resp = await vcgdeUtils.calculateMarginByVendorSku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag);

	return resp;
}


var determineEligibilityBySku = async (msg, resp, storeFlag) => {
	vcgdeUtils.initConfig({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});

	resp = await vcgdeUtils.determineEligibilityBySku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag);

	return resp;
}



var calculateByVendorSku = async (msg, resp, storeFlag, includeRawFlag) => {
	vcgdeUtils.initConfig({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});

	resp = await vcgdeUtils.calculateShippingAverageByVendorSku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag, includeRawFlag);

	if (resp.statusCode !== 200) {
		return resp;
	}

	resp = await vcgdeUtils.calculateMarginByVendorSku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag);


	if (resp.statusCode !== 200) {
		return resp;
	}

	resp = await vcgdeUtils.determineEligibilityBySku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag);


	if (resp.statusCode !== 200) {
		return resp;
	}


	resp.data = {};
	var r = {
		query: {
			vendorId: msg.vendorId,
			vendorSku: msg.vendorSku
		},
		params: {
		}
	}
	resp = await getVCGDEData(r, resp);

	return resp;
}





var estimateEligibility = async (body, resp) => {
	vcgdeUtils.initConfig({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});

	var dbInfo = {
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}
	var includeRawFlag = (body.includeRawFlag) ? true : false;
	var shipCalcInfo = {
		boxInfo: {
			boxes: body.boxes
		},
		categoryId: body.categoryId,
		dropShipFlag: false,
		missingBoxesFlag: false,
		originZip: body.originZip,
		shipType: body.shipType,
		largeItemFee: (body.shipType.toLowerCase() === 'ltl') ? 50 : 0,
		skuInfo: {
			nonStandardPackagingSurcharge: 'N',
			shipType: body.shipType,
			sellerProductId: 'NOVENDORSKU',
			status: 'Live',
			onlineShopping: 'Y',
			variantCityId: 0
		},
		skuUpdates: []
	};
	var c = await Categories.getCategoryById(body.categoryId);
	if (c !== null) {
		shipCalcInfo.skuInfo.nonStandardPackagingSurcharge = c.nonStandardPackagingSurcharge;
	}
	var metros = await Metros.getMetroInfo(dbInfo);
	var originCity = await ZipToCity.lookupCity(body.originZip);
	if (originCity.length > 0) {
		shipCalcInfo.skuInfo.variantCityId = originCity[0].city_id;
	}


	await gdeUtils.processRateRequests(dbInfo, "TEMPSKU", shipCalcInfo, metros, false, includeRawFlag, resp);


	//	Retrieve category margin threshold for each metro.
	for (var i=0; i < resp.data.metros.length; i++) {
		var category = await Metros.getCategoryOverride(metros[i].id, body.categoryId);
		resp.data.metros[i].price = body.sellingPrice;
		resp.data.metros[i].cost = body.productCost;
		resp.data.metros[i].metroThreshold = resp.data.metros[i].marginThreshold;
		resp.data.metros[i].categoryThreshold = null;
		if (category.length > 0) {
			resp.data.metros[i].categoryThreshold = category[0].marginEligibilityThreshold;
		}

		if (resp.data.metros[i].postalCode === body.originZip) {
			resp.data.originMetroId = resp.data.metros[i].destMetroId;
			resp.data.originCityId = resp.data.metros[i].destCityId;
		}
	}

	var marginCalcInfo = {
		dropShipFlag: false,
		dropShipFee: 0,
		manifestSource: 'tool',
		originZip: body.originZip,
		sellerProductId: 'NOVENDORSKU', 
		price: body.sellingPrice,
		cost: body.productCost,
		skuMarginInfoByMetro: resp.data.metros
	}

	await gdeUtils.processMarginCalc("TEMPSKU", marginCalcInfo, resp);


	var eligibilityInfo = resp.data;
	eligibilityInfo.boxCount = resp.data.boxes.length;
	eligibilityInfo.shippable = 'Y';
	eligibilityInfo.localShipping = 'Y';

	for (var i=0; i < resp.data.metros.length; i++) {
		delete resp.data.metros[i].price;
		delete resp.data.metros[i].cost;
	}

	await gdeUtils.processEligibility("TEMPSKU", eligibilityInfo, false, resp);

	delete resp.data.marginThreshold;

	return resp;
}


var validateBoxInfo = (boxes, resp) => {
	if ((Array.isArray(boxes)) && (boxes.length > 0)) {
		for (var i=0; i < boxes.length; i++) {
			if ((boxes[i].height === undefined) || (boxes[i].width === undefined) || (boxes[i].length === undefined) || (boxes[i].weight === undefined)) {
				resp = responseUtils.formatResp(resp, undefined, 400, "Boxes must be an array of box dimensions.");
				return;
			}
		}
	}
	else {
		resp = responseUtils.formatResp(resp, undefined, 400, "Boxes must be an array of box dimensions.");
	}
}



var getVCGDEData = async (req, resp) => {
	var rows = await VCGDE.getVCGDEData(req.query.vendorId, req.query.vendorSku)

	if (rows.length === 0) {
		resp = responseUtils.formatResp(resp, undefined, 404, "VC-GDE data for this vendor sku not found");
		delete resp.data;
		return resp;
	} else {
		resp.data.gdeData = rows;
	}

	return resp;
}



var overrideRipple = async (req, resp) => {
	var userId = ((req.decoded) && (req.decoded.userId)) ? req.decoded.userId : 0;
	var userType = req.decoded?.userType ? req.decoded.userType : 'INTERNAL';
	var algos = await Markets.getMarketInRipplesBySku(req.body.sku);
	if (algos.length > 0) {
		var algo = require(`${algos[0].codeModule}`);
		await algo.nationwide(algos[0].algoId, req.body.sku);
		await ProductActionLog.log(req.body.sku, 'RIPPLE_OVERRIDE', userId, userType);
	}
	else {
		resp = responseUtils.formatResp(resp, undefined, 404, "Sku not found.");
	}
}



var queueEligibilityAllSkus = async (cityId, categoryId, resp) => {
	var eligibleSkus = await RushProducts.getAllEligible(cityId, categoryId);
	var msgs = [];

	var queue = process.env.MQ_ELIGIBILITY_Q;
	var batchLabel = 'ALL-ELIGIBILITY-' + new Date().getTime();

	for (var i = 0; i < eligibleSkus.length; i++) {
		msgs.push({
			sku: Number(eligibleSkus[i].sku).toString(),
			batchLabel: batchLabel
		})
	}

	await sendToQueueBulk(queue, msgs);

	return resp;
}




var queueMarginAllSkus = async (cityId, categoryId, resp) => {
	var eligibleSkus = await RushProducts.getAllEligible(cityId, categoryId);
	var msgs = [];

	var queue = process.env.MQ_MARGIN_Q;
	var batchLabel = 'ALL-MARGIN-' + new Date().getTime();

	for (var i = 0; i < eligibleSkus.length; i++) {
		msgs.push({
			sku: Number.toString(eligibleSkus[i].sku).toString(),
			batchLabel: batchLabel
		});
	}

	await sendToQueueBulk(queue, msgs);

	return resp;
}


var queueShipCalcAllSkus = async (cityId, categoryId, metros, priority, resp) => {
	var vendors = await Vendors.getActiveVendors();

	for (var j=0; j < vendors.length; j++) {
		var eligibleSkus = await Vendors.getVendorSkusByVendor(vendors[j].id);
		var msgs = [];

		var queue = process.env.MQ_VC_SHIP_Q;
		var batchLabel = 'ALL-SHIP-' + new Date().getTime();

		for (var i = 0; i < eligibleSkus.length; i++) {
			msgs.push({
				vendorId: eligibleSkus[i].vendorId,
				vendorSku: eligibleSkus[i].vendorSku,
				metros: metros ? metros : null,
				batchLabel: batchLabel, 
				priority: priority ? priority : 5
			});
		}
		
		await sendToQueueBulk(queue, msgs);
	}


	return resp;
}


var queueShipCalcDropShipSkus = async (cityId, categoryId, metros, vendorId, priority, resp) => {
	var eligibleSkus = await Vendors.getAllDropshipVendorSkus(cityId, categoryId, vendorId);
	var msgs = [];

	var queue = process.env.MQ_VC_SHIP_Q;
	var batchLabel = 'ALL-DROPSHIP-' + new Date().getTime();

	for (var i = 0; i < eligibleSkus.length; i++) {

		if ((vendorId === undefined) || ((vendorId !== undefined) && (vendorId === eligibleSkus[i].vendorId))) {
			msgs.push({
				vendorId: eligibleSkus[i].vendorId,
				vendorSku: eligibleSkus[i].vendorSku,
				metros: metros ? metros : null,
				batchLabel: batchLabel, 
				priority: priority ? priority : 5
			});
		}
	}

	await sendToQueueBulk(queue, msgs);

	return resp;
}


var queueEligibilityCalcBySku = async (msg, resp) => {
	var queue = process.env.MQ_ELIGIBILITY_Q;

	await sendToQueue(queue, msg);

	return resp;
}


var queueEligibilityCalcBySkuBulk = async (req, resp) => {
	var malformedFlag = false;
	var msgs = [];
	var queue = process.env.MQ_ELIGIBILITY_Q;


	for (var i = 0; i < req.body.msgs.length; i++) {
		if (req.body.msgs[i].sku === undefined) {
			malformedFlag = true;
			break;
		}

		msgs.push({
			sku: Number(req.body.msgs[i].sku).toString(),
			metros: req.body.msgs[i].metros ? req.body.msgs[i].metros : null,
			batchLabel: req.body.msgs[i].batchLabel
		})
	}

	if (malformedFlag) {
		resp = responseUtils.formatResp(resp, undefined, 400, "Body format invalid");
	} else {
		await sendToQueueBulk(queue, msgs);
	}

	return resp;
}



var queueMarginCalcBySku = async (msg, resp) => {
	var queue = process.env.MQ_MARGIN_Q;

	await sendToQueue(queue, msg);

	return resp;
}


var queueMarginCalcBySkuBulk = async (req, resp) => {
	var malformedFlag = false;
	var msgs = [];
	var queue = process.env.MQ_MARGIN_Q;

	for (var i = 0; i < req.body.msgs.length; i++) {
		if (req.body.msgs[i].sku === undefined) {
			malformedFlag = true;
			break;
		}

		msgs.push({
			sku: Number(req.body.msgs[i].sku).toString(),
			metros: req.body.msgs[i].metros ? req.body.msgs[i].metros : null,
			batchLabel: req.body.msgs[i].batchLabel
		});
	}

	if (malformedFlag) {
		resp = responseUtils.formatResp(resp, undefined, 400, "Body format invalid");
	} else {
		await sendToQueueBulk(queue, msgs);
	}

	return resp;
}



var queueShipCalcBySku = async (msg, resp) => {
	var queue = process.env.MQ_VC_SHIP_Q;

	await sendToQueue(queue, msg);

	return resp;
}



var queueShipCalcBySkuBulk = async (req, resp) => {
	var malformedFlag = false;
	var msgs = [];
	var queue = process.env.MQ_SHIP_Q;

	for (var i = 0; i < req.body.msgs.length; i++) {
		if (req.body.msgs[i].sku === undefined) {
			malformedFlag = true;
			break;
		}

		msgs.push({
			sku: Number(req.body.msgs[i].sku).toString(),
			metros: req.body.msgs[i].metros ? req.body.msgs[i].metros : null,
			batchLabel: req.body.msgs[i].batchLabel
		});
	}

	if (malformedFlag) {
		resp = responseUtils.formatResp(resp, undefined, 400, "Body format invalid");
	} else {
		await sendToQueueBulk(queue, msgs);
	}

	return resp;
}



var queueSkuDeleteCheck = async (msg, resp) => {
	var queue = process.env.MQ_GOOGLE_Q;

	await sendToQueue(queue, msg);

	return resp;
}







var reloadMetros = async () => {
	await gdeUtils.initMetros({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});
	return;
}




var sendToQueue = async (queue, msg) => {
	var open = null;
	var conn = null;
	var channel = null;

	try {
		open = amqp.connect(process.env.MQ_URL);
		conn = await open;
		channel = await conn.createChannel();

		var ok = await channel.assertQueue(queue, {
			durable: true,
			maxPriority: 10
		});
		await channel.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), {
			persistent: true,
			priority: msg.priority ? parseInt(msg.priority) : 0
		});
	} catch (e) {
		console.log('Exception: ' + e);
		// await GDE.queueMsg(msg.sku, msg)
	} finally {
		if (channel !== null) {
			await channel.close();
		}
		if (conn !== null) {
			await conn.close();
		}
	}
}


var sendToQueueBulk = async (queue, msgs) => {
	var open = null;
	var conn = null;
	var channel = null;
	var exceptionFlag = false;

	try {
		open = amqp.connect(process.env.MQ_URL);
		conn = await open;
		channel = await conn.createChannel();

		var ok = await channel.assertQueue(queue, {
			durable: true,
			maxPriority: 10
		});

		for (var i = 0; i < msgs.length; i++) {
			await channel.sendToQueue(queue, Buffer.from(JSON.stringify(msgs[i])), {
				persistent: true,
				priority: msgs[i].priority ? parseInt(msgs[i].priority) : 0
			});
		}
	} catch (e) {
		console.log('Exception: ' + e);
		for (var i = 0; i < msgs.length; i++) {
			// await GDE.queueMsg(Number(msgs[i].sku).toString(), msgs[i]);
		}
	} finally {
		if (channel !== null) {
			await channel.close();
		}
		if (conn !== null) {
			await conn.close();
		}
	}

}


//
//	Queue up recalcs when a sku is changed in the VC
//
var queueGDERecalc = async (vendorId, vendorSku) => {
	if (configUtils.get("GDE_TOGGLE") === "ON") {
		var rows = await RushProducts.getLiveByVendorSku(vendorId, vendorSku, false);

		for (var i = 0; i < rows.length; i++) {
			queueShipCalcBySku({
				sku: rows[i].sku,
				metros: null,
				batchLabel: undefined
			})
		}
	}
}



//
//	Requeue GDE calc for all drop ship skus from this vendor.
//
var queueGDEVendorRecalc = async (vendorId) => {
	if (configUtils.get("GDE_TOGGLE") === "ON") {
		var vskus = await Vendors.getVendorSkusByVendorId(vendorId);

		for (var i = 0; i < vskus.length; i++) {

			var prods = await RushProducts.getLiveByVendorSku(vendorId, vskus[i].vendorSku, true);

			for (var j = 0; j < prods.length; j++) {
				queueMarginCalcBySku({
					sku: prods[j].sku,
					metros: null,
					batchLabel: undefined
				})
			}
		}
	}
}


//
//	Adjust ripple and expiration as appropriate based on location change.
//
var skuMovement = async (req, resp) => {
	console.log(req.body.sku + " " + req.body.originStoreId + " " + req.body.originLocation + " " + req.body.destStoreId + " " + req.body.destLocation);

	//	If this is not a move within a market, skip.
	if (req.body.originStoreId === req.body.destStoreId) {
		var origStorageArea = parseInt(req.body.originLocation.substring(0, 3));
		var destStorageArea = parseInt(req.body.destLocation.substring(0, 3));

		if ((origStorageArea !== NaN) && (destStorageArea !== NaN) && (origStorageArea < destStorageArea)) {
			await markets.resetToLowestRipple(req.body.sku, req.body.originStoreId, destStorageArea);
		}
	}

}


module.exports = {
	calcAvgShipCostBySku,
	calcMarginBySku,
	calculateByVendorSku,
	determineEligibilityBySku,
	estimateEligibility,
	getVCGDEData,
	overrideRipple,
	queueEligibilityAllSkus,
	queueEligibilityCalcBySku,
	queueEligibilityCalcBySkuBulk,
	queueGDERecalc,
	queueGDEVendorRecalc,
	queueMarginAllSkus,
	queueMarginCalcBySku,
	queueMarginCalcBySkuBulk,
	queueShipCalcAllSkus,
	queueShipCalcDropShipSkus,
	queueShipCalcBySku,
	queueShipCalcBySkuBulk,
	queueSkuDeleteCheck,
	reloadMetros,
	skuMovement,
	validateBoxInfo
}