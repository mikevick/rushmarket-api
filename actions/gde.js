'use strict';

const _ = require('lodash');

const amqp = require('amqplib');

const gdeUtils = require('rushutils-gde');

const globals = require('../globals');

const markets = require('../actions/markets');

const Categories = require('../models/categories');
const GDE = require('../models/gdeModel');
const Markets = require('../models/markets');
const Metros = require('../models/metros');
const ProductActionLog = require('../models/productActionLog');
const ProductCostRules = require('../models/productCostRules');
const RushCategories = require('../models/rushCategories');
const RushProducts = require('../models/rushProducts');
const Vendors = require('../models/vendors');
const ZipToCity = require('../models/zipToCity');

const configUtils = require('../utils/configUtils');
const logUtils = require('../utils/logUtils');
const responseUtils = require('../utils/response');




var calcAvgShipCostBySku = async (msg, resp, storeFlag, includeRawFlag) => {
	gdeUtils.initConfig({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});

	resp = await gdeUtils.calculateShippingAverageBySku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag, includeRawFlag);

	return resp;
}


var calcMarginBySku = async (msg, resp, storeFlag) => {
	gdeUtils.initConfig({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});

	resp = await gdeUtils.calculateMarginBySku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag);

	return resp;
}


var calculateBySku = async (msg, resp, storeFlag, includeRawFlag) => {
	gdeUtils.initConfig({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});


	resp = await gdeUtils.calculateShippingAverageBySku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag, includeRawFlag);

	if ((resp.statusCode !== 200) && (resp.statusCode !== 400) && (resp.statusCode !== 412)) {
		return resp;
	}

	resp = await gdeUtils.calculateMarginBySku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag);


	if (resp.statusCode !== 200) {
		return resp;
	}

	resp = await gdeUtils.determineEligibilityBySku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag);


	if (resp.statusCode !== 200) {
		return resp;
	}

	resp = await gdeUtils.calculateEligibilityOverride({
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

		},
		params: {
			id: msg.sku
		}
	}
	resp = await getGDEData(r, resp);

	return resp;
}




var determineEligibilityBySku = async (msg, resp, storeFlag) => {
	gdeUtils.initConfig({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});

	resp = await gdeUtils.determineEligibilityBySku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag);

	return resp;
}


var determineRippleBySku = async (msg, resp, storeFlag) => {
	gdeUtils.initConfig({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	});

	resp = await gdeUtils.determineEligibilityBySku({
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}, msg, resp, storeFlag);

	return resp;
}




var estimateEligibility = async (body, resp) => {
	gdeUtils.initConfig({
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
	for (var i = 0; i < resp.data.metros.length; i++) {
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

	for (var i = 0; i < resp.data.metros.length; i++) {
		delete resp.data.metros[i].price;
		delete resp.data.metros[i].cost;
	}

	await gdeUtils.processEligibility("TEMPSKU", eligibilityInfo, false, resp);

	delete resp.data.marginThreshold;

	return resp;
}



//
//	Used for RRC return routing shipability check per RM-3171.  
//
var checkShipability = async (originZip, zipToCity, vendor, vendorSku, userType) => {
	var resp = {
		statusCode: 200,
		message: "Success.",
		data: {
			metros: []
		}
	}

	var routingDecision = {
		decisionMade: false,
		label: 'NEAREST_RRC',
		storeId: zipToCity.nearestRrcStoreId,
		originZip: originZip,
		vendorId: vendorSku.vendorId,
		vendorSku: vendorSku.vendorSku,
		message: 'Shippable'
	}

	var determinedBoxes = [];
	var determinedSellingPrice = null;
	var determinedCost = null;


	var category = await categoryLookup(routingDecision, vendorSku.primaryCategory, vendorSku.secondaryCategory);
	if (routingDecision.decisionMade) {
		return await completeRoutingDecision(routingDecision, zipToCity, userType);
	}


	//	If no box dims, route to closest owned RRC.
	determinedBoxes = extractBoxInfo(routingDecision, vendorSku);
	if (routingDecision.decisionMade) {
		return await completeRoutingDecision(routingDecision, zipToCity, userType);
	}

	var dbInfo = {
		dbPool: globals.pool,
		dbProdPool: globals.productPool,
		mongoIdGen: globals.mongoid
	}
	gdeUtils.initConfig(dbInfo);


	determinedSellingPrice = await determineSellingPrice(routingDecision, vendorSku);
	if (routingDecision.decisionMade) {
		return await completeRoutingDecision(routingDecision, zipToCity, userType);
	}

	determinedCost = await determineCost(routingDecision, vendor, vendorSku, determinedSellingPrice);
	if (routingDecision.decisionMade) {
		return await completeRoutingDecision(routingDecision, zipToCity, userType);
	}

	var metro = await Metros.getByCityId(zipToCity.nextNearestMetro);


	//	Ship cost determination
	await determineShipCost(routingDecision, dbInfo, originZip, vendorSku, category, zipToCity, metro, determinedBoxes, resp);
	if (routingDecision.decisionMade) {
		return await completeRoutingDecision(routingDecision, zipToCity, userType);
	}

	//	Margin determination
	await determineMargin(routingDecision, dbInfo, originZip, vendorSku, category, determinedSellingPrice, determinedCost, resp);
	if (routingDecision.decisionMade) {
		return await completeRoutingDecision(routingDecision, zipToCity, userType);
	}


	//	Eligibility determination
	await determineEligibility(routingDecision, dbInfo, resp);
	if (routingDecision.decisionMade) {
		return await completeRoutingDecision(routingDecision, zipToCity, userType);
	}


	return await completeRoutingDecision(routingDecision, zipToCity, userType);
}



var determineEligibility = async (routingDecision, dbInfo, resp) => {
	var eligibilityInfo = resp.data;
	eligibilityInfo.boxCount = resp.data.boxes.length;
	eligibilityInfo.shippable = 'Y';
	eligibilityInfo.localShipping = 'Y';

	for (var i = 0; i < resp.data.metros.length; i++) {
		delete resp.data.metros[i].price;
		delete resp.data.metros[i].cost;
	}

	await gdeUtils.processEligibility("TEMPSKU", eligibilityInfo, false, resp);
	if (resp.statusCode !== 200) {
		var configShipCalcFailRouting = !configUtils.get("NO_SHIP_CALC_FAIL_ROUTING") ? 'NEAREST_OWNED_RRC' : configUtils.get("NO_SHIP_CALC_FAIL_ROUTING");

		routingDecision.label = configShipCalcFailRouting;
		routingDecision.message = `Eligibility calc returned ${resp.statusCode} ${resp.message}`;
		routingDecision.decisionMade = true;
		return 
	}

	delete resp.data.marginThreshold;

	if (resp.data.metros[0].calculatedEligibility !== 'SHIPPABLE') {
		routingDecision.label = 'OMAHA';
		routingDecision.message = 'Not shippable to next nearest metro'
		routingDecision.decisionMade = true;
	}
}


var determineMargin = async (routingDecision, dbInfo, originZip, vendorSku, category, determinedSellingPrice, determinedCost, resp) => {
	var coinThreshold = await GDE.getCoinMarginThresholdByVsku(vendorSku.vendorId, vendorSku.vendorSku);
	if (coinThreshold.length) {
		resp.data.metros[0].coinThreshold = coinThreshold[0].coinThreshold;
	}


	var categoryOverride = await Metros.getCategoryOverride(resp.data.metros[0].destMetroId, category.categoryId);
	resp.data.metros[0].price = determinedSellingPrice;
	resp.data.metros[0].cost = determinedCost;
	resp.data.metros[0].metroThreshold = resp.data.metros[0].marginThreshold;
	resp.data.metros[0].categoryThreshold = null;
	if (categoryOverride.length) {
		resp.data.metros[0].categoryThreshold = categoryOverride[0].marginEligibilityThreshold;
	}


	var marginCalcInfo = {
		dropShipFlag: false,
		dropShipFee: 0,
		manifestSource: 'tool',
		originZip: originZip,
		sellerProductId: vendorSku.vendorSku,
		price: determinedSellingPrice,
		cost: determinedCost,
		skuMarginInfoByMetro: resp.data.metros
	}

	// await gdeUtils.calculateMarginBySku(dbInfo, {sku: "TEMPSKU"}, resp, false);
	await gdeUtils.processMarginCalc("TEMPSKU", marginCalcInfo, resp);
	if (resp.statusCode !== 200) {
		var configShipCalcFailRouting = !configUtils.get("NO_SHIP_CALC_FAIL_ROUTING") ? 'NEAREST_OWNED_RRC' : configUtils.get("NO_SHIP_CALC_FAIL_ROUTING");

		routingDecision.label = configShipCalcFailRouting;
		routingDecision.message = `Margin calc returned ${resp.statusCode} ${resp.message}`;
		routingDecision.decisionMade = true;
	}
}



var determineShipCost = async (routingDecision, dbInfo, originZip, vendorSku, category, zipToCity, metro, determinedBoxes, resp) => {
	//	Create a structure to feed into the GDE rate request call.
	var shipCalcInfo = {
		boxInfo: {
			boxes: determinedBoxes
		},
		categoryId: category.categoryId,
		commercialDeliveryFlag: true,
		dropShipFlag: false,
		missingBoxesFlag: false,
		genBoxHashes: false,
		originZip: originZip,
		shipType: vendorSku.shipType ? vendorSku.shipType : 'Small Parcel',
		largeItemFee: (vendorSku.shipType?.toLowerCase() === 'ltl') ? 50 : 0,
		skuInfo: {
			nonStandardPackagingSurcharge: category.nonStandardPackagingSurcharge,
			shipType: vendorSku.shipType ? vendorSku.shipType : 'Small Parcel',
			sellerProductId: vendorSku.vendorSku,
			status: 'Live',
			onlineShopping: 'Y',
			variantCityId: 0
		},
		boxHashes: [],
		filteredMetros: [{
			cityId: zipToCity.nextNearestMetro,
			zip: metro[0].zip,
			id: metro[0].id
		}],
		skuUpdates: [],
		storeFlag: false
	};

	var rateRequests = {
		count: 0,
		localResponses: [],
		nationalResponses: []
	}

	await gdeUtils.processRateRequests(dbInfo, "TEMPSKU", shipCalcInfo, resp);

	// await gdeUtils.nationalRateRequests(dbInfo, shipCalcInfo, rateRequests);

	if (resp.statusCode !== 200) {
		var configShipCalcFailRouting = !configUtils.get("NO_SHIP_CALC_FAIL_ROUTING") ? 'NEAREST_OWNED_RRC' : configUtils.get("NO_SHIP_CALC_FAIL_ROUTING");

		routingDecision.label = configShipCalcFailRouting;
		routingDecision.message = `Ship calc returned ${resp.statusCode} ${resp.message}`;
		routingDecision.decisionMade = true;
	}
}


var determineSellingPrice = async (routingDecision, vendorSku) => {
	var configNoPriceRouting = !configUtils.get("NO_PRICE_ROUTING") ? 'NEAREST_OWNED_RRC' : configUtils.get("NO_PRICE_ROUTING");
	var determinedSellingPrice = null;

	//	Use inMarketPrice if it's populated.
	if ((vendorSku.inMarketPrice !== null) && (vendorSku.inMarketPrice)) {
		determinedSellingPrice = vendorSku.inMarketPrice;
	}
	// Otherwise use lowest among COIN peers if exists.  
	else {
		determinedSellingPrice = await Vendors.getMinLikeNewPriceFromCoinPeers(vendorSku.vendorId, vendorSku.vendorSku);
	}


	// If no price found, skip and send to closest owned RRC.
	if (!determinedSellingPrice) {
		routingDecision.label = configNoPriceRouting;
		routingDecision.message = 'No selling price found';
		routingDecision.decisionMade = true;
	}

	return determinedSellingPrice;
}



var determineCost = async (routingDecision, vendor, vendorSku, determinedSellingPrice) => {
	var configNoCostRouting = !configUtils.get("NO_COST_ROUTING") ? 'NEAREST_OWNED_RRC' : configUtils.get("NO_COST_ROUTING");
	var determinedCost = null;

	
	
	//	Calculate cost based on vendor contract type.  
	if (vendor.partnerContractType === 'REVENUE_SHARE') {
		determinedCost = Math.round((determinedSellingPrice * (vendor.partnerRevSharePercent / 100)) * 100) / 100;
	} else if (vendor.partnerContractType === 'COST_BASED') {
		var rules = await ProductCostRules.getSpecific(vendor.id, 'Like New');
		if (rules.length > 0) {
			if (rules[0].costBase === 'cost') {
				// If no cost found, skip and send to closest owned RRC.
				if (!vendorSku.productCost) {
					routingDecision.label = configNoCostRouting;
					routingDecision.message = 'No product cost found';
					routingDecision.decisionMade = true;
					return;
				}

				determinedCost = Math.round((vendorSku.productCost * (rules[0].conditionValue / 100)) * 100) / 100;
			} else {
				determinedCost = Math.round((determinedSellingPrice * (rules[0].conditionValue / 100)) * 100) / 100;
			}
		}
	}

	return determinedCost;
}


var completeRoutingDecision = async (routingDecision, zipToCity, userType) => {
	if (routingDecision.label === 'NEAREST_RRC') {
		routingDecision.storeId = zipToCity.nearestRrcStoreId;
	} else if (routingDecision.label === 'NEAREST_OWNED_RRC') {
		routingDecision.storeId = zipToCity.nearestOwnedRrcStoreId;
	}
	//	We're going to Omaha!
	else {
		routingDecision.storeId = 104;
	}

	delete routingDecision.decisionMade;

	await GDE.logRoutingDecision(
		routingDecision.vendorId,
		routingDecision.vendorSku,
		routingDecision.originZip,
		routingDecision.storeId,
		routingDecision.label,
		routingDecision.message,
		userType === 'INTERNAL' ? 'Y' : 'N'
	);

	return routingDecision;
}



var categoryLookup = async (routingDecision, primaryCategory, secondaryCategory) => {
	var configNoMapRouting = !configUtils.get("NO_CATEGORY_ROUTING") ? 'NEAREST_RRC' : configUtils.get("NO_CATEGORY_ROUTING");
	var configCatBasedRouting = !configUtils.get("CATEGORY_ROUTING") ? 'NEAREST_OWNED_RRC' : configUtils.get("CATEGORY_ROUTING");

	//	Lookup rush category.   If can't find it, skip and ship to nearest RRC.
	var mappedCategory = await RushCategories.getMappedByVCCategories(primaryCategory, secondaryCategory);
	if (!mappedCategory.length) {
		routingDecision.label = configNoMapRouting;
		routingDecision.message = `Category mapping not found ${primaryCategory} / ${secondaryCategory}`;
		routingDecision.decisionMade = true;
		return;
	}

	var category = await Categories.getCategoryById(mappedCategory[0].category2Id);

	//	Is this a category we automatically route to one of our RRCs?
	var routeByCategory = await GDE.checkForSpecialLogicCategory(category.categoryId, 'CATEGORY_BASED_ROUTING');
	if (routeByCategory.length) {
		routingDecision.label = configCatBasedRouting;
		routingDecision.message = 'Category based routing';
		routingDecision.decisionMade = true;
	}

	return category;
}



var extractBoxInfo = (routingDecision, vendorSku) => {
	var boxes = [];
	var configNoBoxRouting = !configUtils.get("NO_BOX_DIMS_ROUTING") ? 'NEAREST_OWNED_RRC' : configUtils.get("NO_BOX_DIMS_ROUTING");
	var productWeight = 0;


	productWeight = vendorSku.productWeight;

	//	Grab box dimensions if they exist first from coreleap overrides then from vc then from other vskus in same coin
	checkForBoxDims(vendorSku, boxes, productWeight);

	if (!boxes.length) {
		routingDecision.label = configNoBoxRouting;
		routingDecision.message = 'No box dims';
		routingDecision.decisionMade = true;
	}


	return boxes;
}


var checkForBoxDims = (info, boxes, productWeight) => {
	var weight = null;
	var length = null;
	var width = null;
	var height = null;

	if (info === undefined) {
		return;
	}

	for (var i = 0; i < 20; i++) {
		weight = null;
		length = null;
		width = null;
		height = null;

		//	Use weight from database if available, otherwise use product weight if item ships in only one box.
		if ((info[`shippingWeight${(i + 1)}`] !== null) && (info[`shippingWeight${(i + 1)}`] > 0)) {
			weight = info[`shippingWeight${(i + 1)}`];
		} else if ((info.numberOfBoxes === 1) && (boxes.length === 0) && (productWeight > 0)) {
			weight = productWeight;
		}

		if ((info[`packageLength${(i + 1)}`] !== null) && (info[`packageWidth${(i + 1)}`] !== null) && (info[`packageHeight${(i + 1)}`] !== null)) {
			length = info[`packageLength${(i + 1)}`];
			width = info[`packageWidth${(i + 1)}`];
			height = info[`packageHeight${(i + 1)}`];
		}

		if ((length === null) || (width === null) || (height === null)) {
			return;
		}

		//	If no weight but has box dimensions, set weight to 1 so dimensional weight will be forced.
		if (weight === null) {
			weight = 1;
		}


		boxes.push({
			weight: weight,
			length: length,
			width: width,
			height: height
		})
	}
}



var validateBoxInfo = (boxes, resp) => {
	if ((Array.isArray(boxes)) && (boxes.length > 0)) {
		for (var i = 0; i < boxes.length; i++) {
			if ((boxes[i].height === undefined) || (boxes[i].width === undefined) || (boxes[i].length === undefined) || (boxes[i].weight === undefined)) {
				resp = responseUtils.formatResp(resp, undefined, 400, "Boxes must be an array of box dimensions.");
				return;
			}
		}
	} else {
		resp = responseUtils.formatResp(resp, undefined, 400, "Boxes must be an array of box dimensions.");
	}
}



var getGDEData = async (req, resp) => {
	var prom = [];

	prom.push(GDE.getGDEData(req.params.id, req.query.cityId));
	prom.push(GDE.getGDEDataByCoin(req.params.id, req.query.cityId));

	var results = await Promise.all(prom);

	var rows = null;
	if (results[0].length > 0) {
		rows = results[0];
	} else {
		rows = results[1];
	}

	if (rows.length === 0) {
		resp = responseUtils.formatResp(resp, undefined, 404, "GDE data for this sku or coin not found");
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
	} else {
		resp = responseUtils.formatResp(resp, undefined, 404, "Sku not found.");
	}
}



var queueEligibilityAllSkus = async (cityId, categoryId, priority, resp) => {
	var eligibleSkus = await RushProducts.getAllEligible(cityId, categoryId);
	var msgs = [];

	var queue = process.env.MQ_ELIGIBILITY_Q;
	var batchLabel = 'ALL-ELIGIBILITY-' + new Date().getTime();

	for (var i = 0; i < eligibleSkus.length; i++) {
		msgs.push({
			sku: Number(eligibleSkus[i].sku).toString(),
			batchLabel: batchLabel,
			priority: priority
		})
	}

	await sendToQueueBulk(queue, msgs);

	return resp;
}




var queueMarginAllSkus = async (cityId, categoryId, priority, resp) => {
	var eligibleSkus = await RushProducts.getAllEligible(cityId, categoryId);
	var msgs = [];

	var queue = process.env.MQ_MARGIN_Q;
	var batchLabel = 'ALL-MARGIN-' + new Date().getTime();

	for (var i = 0; i < eligibleSkus.length; i++) {
		msgs.push({
			sku: Number(eligibleSkus[i].sku).toString(),
			batchLabel: batchLabel,
			priority: priority
		});
	}

	await sendToQueueBulk(queue, msgs);

	return resp;
}


var queueShipCalcAllSkus = async (cityId, categoryId, manufacturer, metros, priority, shipType, resp) => {

	//	If processing all skus, remove all of the gde hashes
	if ((cityId === undefined) && (categoryId === undefined) && (manufacturer === undefined)) {
		await GDE.pruneAllHashes();
	}

	if (!shipType || shipType.toLowerCase() === 'ltl') {
		resp = await queueShipCalcAllLTL(cityId, categoryId, manufacturer, metros, priority, resp);
	}

	if (!shipType || shipType.toLowerCase() === 'sp') {
		resp = await queueShipCalcAllSmallParcel(cityId, categoryId, manufacturer, metros, priority, resp);
	}

	return resp;
}


var queueShipCalcAllSmallParcel = async (cityId, categoryId, manufacturer, metros, priority, resp) => {

	//	If processing all skus, remove all of the gde hashes
	if ((cityId === undefined) && (categoryId === undefined) && (manufacturer === undefined)) {
		await GDE.pruneAllHashes();
	}

	var vskus = await Vendors.getVSkuByManufacturer(manufacturer);
	var eligibleSkus = await RushProducts.getAllEligibleSmallParcel(cityId, categoryId, vskus);
	var msgs = [];

	var queue = process.env.MQ_SHIP_Q;
	var batchLabel = 'ALL-SHIP-' + new Date().getTime();

	for (var i = 0; i < eligibleSkus.length; i++) {
		msgs.push({
			sku: Number(eligibleSkus[i].sku).toString(),
			metros: metros ? metros : null,
			batchLabel: batchLabel,
			minimizeRateCallsFlag: (configUtils.get("GDE_MINIMIZE_RATE_CALLS") === "ON") ? true : false,
			priority: priority ? priority : 5
		});
	}

	await sendToQueueBulk(queue, msgs);

	return resp;
}


var queueShipCalcAllLTL = async (cityId, categoryId, manufacturer, metros, priority, resp) => {

	//	If processing all skus, remove all of the gde hashes
	if ((cityId === undefined) && (categoryId === undefined) && (manufacturer === undefined)) {
		await GDE.pruneAllHashes();
	}

	var vskus = await Vendors.getVSkuByManufacturer(manufacturer);
	var eligibleSkus = await RushProducts.getAllEligibleLTL(cityId, categoryId, vskus);
	var msgs = [];

	var queue = process.env.MQ_SHIP_LTL_Q;

	for (var i = 0; i < eligibleSkus.length; i++) {
		msgs.push({
			sku: Number(eligibleSkus[i].sku).toString(),
			metros: metros ? metros : null,
			minimizeRateCallsFlag: (configUtils.get("GDE_MINIMIZE_RATE_CALLS") === "ON") ? true : false,
			priority: priority ? priority : 5
		});
	}

	//	We are now throttling requests for LTL ship calc so as not to overwhelm Freight Club's API.
	await sendToThrottleQueueBulk('LTL', queue, msgs);

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
			batchLabel: req.body.msgs[i].batchLabel,
			priority: req.query.priority ? req.query.priority : 0
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
			batchLabel: req.body.msgs[i].batchLabel,
			priority: req.query.priority ? req.query.priority : 0
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
	let sku = await RushProducts.getByRushSku(msg.sku);
	if (!sku.length) {
		return resp;
	}
	else {
		sku = sku[0];
	}

	let queue = sku.shipType === 'LTL' ? process.env.MQ_SHIP_LTL_Q : process.env.MQ_SHIP_Q;

	//	LTL ship calc needs to be throttled.
	if (sku.shipType === 'LTL') {
		await sendToThrottleQueue('LTL', queue, msg);
	}
	else {
		await sendToQueue(queue, msg);
	}

	return resp;
}



var queueShipCalcBySkuBulk = async (req, resp) => {
	var malformedFlag = false;
	var msgs = [];
	var queue = process.env.MQ_SHIP_Q;


	if (req.body.msgs !== undefined) {
		for (var i = 0; i < req.body.msgs.length; i++) {
			if (req.body.msgs[i].sku === undefined) {
				malformedFlag = true;
				break;
			}

			msgs.push({
				sku: Number(req.body.msgs[i].sku).toString(),
				metros: req.body.msgs[i].metros ? req.body.msgs[i].metros : null,
				batchLabel: req.body.msgs[i].batchLabel,
				minimizeRateCallsFlag: (configUtils.get("GDE_MINIMIZE_RATE_CALLS") === "ON") ? true : false,
				priority: req.query.priority ? req.query.priority : 0
			});
		}
	}

	if (req.body.skus !== undefined) {
		var s = _.split(req.body.skus, ',');
		for (var i = 0; i < s.length; i++) {

			let sku = await RushProducts.getByRushSku(s[i]);
			if (sku.length) {
				sku = sku[0];

				let queue = sku.shipType === 'LTL' ? process.env.MQ_SHIP_LTL_Q : process.env.MQ_SHIP_Q;

				//	LTL ship calc needs to be throttled.
				if (sku.shipType === 'LTL') {
					await sendToThrottleQueue('LTL', queue, {
						sku: Number(s[i]).toString(),
						metros: null
					});
				}
				else {
					msgs.push({
						sku: Number(s[i]).toString(),
						metros: null,
						batchLabel: req.body.batchLabel
					});
				}
			}
		}
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
		await GDE.queueMsg(msg.sku, msg)
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
			await GDE.queueMsg(Number(msgs[i].sku).toString(), msgs[i]);
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


var sendToThrottleQueueBulk = async (configGroup, queue, msgs) => {
	let prom = [];

	try {

		for (var i = 0; i < msgs.length; i++) {
			prom.push(GDE.enqueueThrottled(configGroup, queue, msgs[i].priority ? msgs[i].priority : 0, msgs[i].sku, undefined, msgs[i]));
		}

		await Promise.all(prom);

	} catch (e) {
		await logUtils.log({
			severity: 'ERROR',
			type: 'GDE',
			message: e,
			stackTrace: new Error().stack
		})
	} finally {
	}
}



var sendToThrottleQueue = async (configGroup, queue, msg) => {
	let prom = [];

	try {
		await GDE.enqueueThrottled(configGroup, queue, msg.priority ? msg.priority : 0, msg.sku, undefined, msg);
	} catch (e) {
		await logUtils.log({
			severity: 'ERROR',
			type: 'GDE',
			message: e,
			stackTrace: new Error().stack
		})
	} finally {
	}
}



//
//	Queue up recalcs when a sku is changed in the VC
//
var queueGDERecalc = async (vendorId, vendorSku, batchLabel, userId, userType) => {
	if (configUtils.get("GDE_TOGGLE") === "ON") {
		var rows = await RushProducts.getLiveOrReceivedByVendorSku(vendorId, vendorSku, false);

		for (var i = 0; i < rows.length; i++) {
			queueShipCalcBySku({
				sku: rows[i].sku,
				metros: null,
				batchLabel: batchLabel,
				userId: userId,
				userType: userType,
				minimizeRateCallsFlag: (configUtils.get("GDE_MINIMIZE_RATE_CALLS") === "ON") ? true : false
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


//
//	See if its time to send next batch of ship calcs to the GDE message queue.
//
var throttleGDE = async (req, resp) => {
	let configs = await GDE.getThrottledConfig();

	for (let i = 0; i < configs.length; i++) {
		let config = configs[i];
		let activeMetros = await Metros.getActiveMetroCount();
		let skusPerHour = Math.floor(config.maxReqsPerHour / activeMetros);
		let minutesBetweenSkus = 60 / skusPerHour;

		//	Keep a sliding window of SENT messages, prune the rest.
		await GDE.pruneSentThrottled(config.configGroup, config.pruneAfterHours);


		//	If less than one sku per minute, pace based on last sent.
		if (minutesBetweenSkus >= 1) {
			let lastSentMinutes = await GDE.lastThrottledSent(config.configGroup);

			//	If none or last send was at least minutesBetweenSkus, send the next one.
			if ((lastSentMinutes === null) || (lastSentMinutes >= minutesBetweenSkus)) {
				let sku = await GDE.getNextThrottled(config.configGroup, 1);
				if (sku.length) {
					sku = sku[0];

					console.log(sku.msg, JSON.parse(sku.msg))
					// console.log(`Queuing ${sku.id}`);
					await sendToQueue(sku.mq, JSON.parse(sku.msg));
					await GDE.markThrottledSent(sku.id);
				}
			}
		}

		//	If more than one sku per minute, 
		else {
			console.log('here');
		}
	}

	// let configGroup = 'LTL';
	// let maxReqsPerHour = 330;
	// let pruneAfterHours = 24;
	
}


module.exports = {
	calcAvgShipCostBySku,
	calcMarginBySku,
	calculateBySku,
	checkShipability,
	determineEligibilityBySku,
	determineRippleBySku,
	estimateEligibility,
	getGDEData,
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
	queueShipCalcAllSmallParcel,
	queueShipCalcAllLTL,
	queueShipCalcBySku,
	queueShipCalcBySkuBulk,
	queueSkuDeleteCheck,
	reloadMetros,
	skuMovement,
	throttleGDE,
	validateBoxInfo
}