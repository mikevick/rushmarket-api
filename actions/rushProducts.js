'use strict'

const _ = require('lodash');
const moment = require('moment');

const configUtils = require('../utils/configUtils');
const fedex = require('rushutils-ship').fedex;
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const {
	formatResp
} = require('../utils/response')
const shopifyUtils = require('../utils/shopifyUtils');
const storeUtils = require('../utils/storeUtils');

const merchActions = require('../actions/merchandising');
const categoryActions = require('../actions/categoryProducts');

const CategoryProducts = require('../models/categoryProducts');
const CarrierSelection = require('../models/carrierSelection');
const GDE = require('../models/gdeModel');
const Members = require('../models/members');
const Metros = require('../models/metros');
const Partners = require('../models/partners');
const ProductHolds = require('../models/productHolds');
const RushOrders = require('../models/rushOrders')
const RushProducts = require('../models/rushProducts')
const Stores = require('../models/stores');
const TargetedCities = require('../models/targetedCities');
const VCGDE = require('../models/vcGDE');
const Vendors = require('../models/vendors');


var globalEDDCache = [];
var rushHolidays = null;



var getMember = async (req, resp) => {
	var member = undefined;
	var openSiteFlag = false;


	//
	//	Putting the "open site" concept on hold for now and opening up rm.com instead
	//	Determine if this is an open site call.
	//
	// if (req.get('x-access-token') !== undefined) {
	// 	resp = await jwtUtils.verifyTokenInline(req, resp);

	// 	if ((req.decoded !== undefined) && (req.decoded.sessionId !== undefined)) {
	// 		openSiteFlag = true;
	// 		//	Simulate a lookup for open site.
	// 		member = {};
	// 		member.homeCityId = 999;
	// 		member.homeShopifyStoreId = 1;
	// 		member.memberStoreId = 106;
	// 		member.memberStoreName = 'National';
	// 		member.memberStoreType = 'ONLINE';
	// 		member.memberStoreZip = '19146';
	// 		member.zip = req.query.zip;
	// 		member.openSite = true;
	// 	}
	// }


	// Whether by customerId or market we need to retrieve shopfiy store ID and store type
	if (req.query.zip !== undefined) {
		if (!openSiteFlag) {
			member = await Stores.getMarketInfoByZip(req.query.zip);
			if (member.length === 0) {
				formatResp(resp, ["data"], 404, "Unrecognized zip.");
				member = undefined;
			} else {
				member = member[0];
			}
		}

		if (member !== undefined) {
			member.zip = req.query.zip;
		}
	} else if (req.query.customerId !== undefined) {
		member = await Members.getShopperByShopifyCustomerId(req.query.customerId);
		if (member.length === 0) {
			formatResp(resp, ["data"], 404, "Unrecognized member.");
			member = undefined;
		} else {
			member = member[0];
		}
	} else if (req.query.market !== undefined) {
		member = await Stores.getMarketInfoBySlug(req.query.market);
		if (member.length === 0) {
			formatResp(resp, ["data"], 404, "Unrecognized market.");
			member = undefined;
		} else {
			member = member[0];
		}
	}

	return member;
}


//
//	GET all Rush products with Customer Id
//
var getAll = async (req, whereInfo, coinWhereInfo, sortBy, offset, limit, resp) => {
	var bypassFulfillmentOptions = false;
	var member = null;
	var onlyEligibleFlag = true;
	var prom = [];
	var results = [];
	var variantFlag = false;


	member = await getMember(req, resp);
	if (resp.statusCode !== 200) {
		return resp;
	}


	if ((req.query.bypassFulfillmentOptionsFlag !== undefined) && (req.query.bypassFulfillmentOptionsFlag === "true")) {
		bypassFulfillmentOptions = true;
	}

	if ((req.query.onlyEligibleFlag !== undefined) && ((req.query.onlyEligibleFlag === "false") || (req.query.onlyEligibleFlag === false))) {
		onlyEligibleFlag = false;
	}


	if (coinWhereInfo.clause.length === 0) {
		variantFlag = true;
		var variantFilters = _.cloneDeep(whereInfo.values);
		var products = await RushProducts.getAll(whereInfo, sortBy, offset, limit);

		for (var i = 0; i < products.tempRushProducts.length; i++) {
			var rp = null;
			if (products.tempRushProducts[i].onlineQuickSale === 'Y') {
				rp = await getByCoinAndConsolidate(products.tempRushProducts[i].sku, member, variantFilters, bypassFulfillmentOptions, undefined, undefined, onlyEligibleFlag);
			} else {
				rp = await getByCoinAndConsolidate(products.tempRushProducts[i].coinId, member, variantFilters, bypassFulfillmentOptions, undefined, undefined, onlyEligibleFlag);
			}
			if (rp !== null) {
				results.push(rp);
			}
		}

	} else {
		for (var i = 0; i < coinWhereInfo.values.length; i++) {
			results.push(await getByCoinAndConsolidate(coinWhereInfo.values[i], member, undefined, bypassFulfillmentOptions, undefined, undefined, onlyEligibleFlag));
		}
	}

	for (var i = 0; i < results.length; i++) {
		if (results[i] !== null) {
			resp.data.rushProducts.push(results[i]);
		}
	}

	if (resp.data.rushProducts.length === 0) {
		formatResp(resp, undefined, 200, 'Rush products not found.');
	}
	return resp;
}

//
//	GET all Rush products
//(req.query.status, req.query.dateModifiedEnd, req.query.attributeId, whereInfo, sortBy, offset, limit, resp);
var getAllProducts = async (includeShippingBoxes, status, dateModifiedEnd, attributeId, whereInfo, sortBy, offset, limit, resp) => {
	let products = await RushProducts.getAllProducts(includeShippingBoxes, status, dateModifiedEnd, attributeId, whereInfo, sortBy, offset, limit);

	resp.metaData.totalCount = products.totalCount;
	resp.data.rushProducts = products.rushProducts;
	if (resp.data.rushProducts.length === 0) {
		formatResp(resp, undefined, 200, 'Rush products not found.');
	}
	return resp;
}



//	GET all Rush products for RRC
var getAllRRC = async (whereInfo, sortBy, offset, limit, resp) => {
	let products = await RushProducts.getAllRRC(whereInfo, sortBy, offset, limit);
	resp.metaData.totalCount = products.totalCount;
	resp.data.rushProducts = products.rushProducts;
	if (resp.data.rushProducts.length === 0) {
		formatResp(resp, undefined, 200, 'Rush products not found.');
	}
}


var getAllProductsLite = async (includeShippingBoxes, includeBubble, removeProductsWithIssues, onlineEligibleLocation, whereInfo, sortBy, offset, limit, resp) => {
	let products = await RushProducts.getAllProductsLite(includeShippingBoxes, includeBubble, removeProductsWithIssues, onlineEligibleLocation, whereInfo, sortBy, offset, limit);
	resp.metaData.totalCount = products.totalCount;
	resp.data.rushProducts = products.rushProducts;
	if (resp.data.rushProducts.length === 0) {
		formatResp(resp, undefined, 200, 'Rush products not found.');
	}
	return resp;
}

//
//	GET product by COIN
//
var getByCoin = async (req, resp) => {
	var bypassFulfillmentOptions = false;
	var onlyEligibleFlag = true;
	var member = null;
	var statusFilters = [];
	var variantFilters = undefined;

	if (req.query.status) {
		if (req.query.status.indexOf(',') > -1) {
			var s = _.split(req.query.status, ',');
			for (var i = 0; i < s.length; i++) {
				statusFilters.push(s[i]);
			}
		} else {
			statusFilters.push(req.query.status);
		}
	}


	if (req.query.variantFilters) {
		var s = _.split(req.query.variantFilters, ',');
		variantFilters = [];
		for (var i = 0; i < s.length; i++) {
			variantFilters.push(s[i]);
		}
	}


	member = await getMember(req, resp);
	if (resp.statusCode !== 200) {
		return resp;
	}

	if ((req.query.bypassFulfillmentOptionsFlag !== undefined) && ((req.query.bypassFulfillmentOptionsFlag === "true") || (req.query.bypassFulfillmentOptionsFlag === true))) {
		bypassFulfillmentOptions = true;
	}

	if ((req.query.onlyEligibleFlag !== undefined) && ((req.query.onlyEligibleFlag === "false") || (req.query.onlyEligibleFlag === false))) {
		onlyEligibleFlag = false;
	}

	// console.log(new moment() + " getting coin " + req.params.id);
	resp.data.rushProducts = await getByCoinAndConsolidate(req.params.id, member, variantFilters ? variantFilters : undefined, bypassFulfillmentOptions, req.query.includeMerchFlag, statusFilters, onlyEligibleFlag);
	// console.log(new moment() + " got coin " + req.params.id);
	if ((resp.data.rushProducts === null) || (resp.data.rushProducts.variantGroups.length === 0)) {
		formatResp(resp, ["data"], 404, 'Products not found.');
	}

	return resp;
}



var getByCoinAndConsolidate = async (coinId, member, variantFilters, bypassFulfillmentOptions, includeMerchFlag, statusFilters, onlyEligibleFlag) => {
	var rushProducts = null;
	var variants = null;


	//	Pull the data from the cache if it exists.
	if ((process.env.PRODUCT_CACHE !== undefined) && (process.env.PRODUCT_CACHE === 'Y')) {
		variants = await RushProducts.getCoinFromCache(coinId, member.homeShopifyStoreId);
	}

	//	If no cached value found, query it up.
	if (variants === null) {
		if (member !== undefined) {
			// console.log(`before model: ${new Date()}`)
			variants = await RushProducts.getByCoin(coinId, member, variantFilters, onlyEligibleFlag);
			// console.log(`after model: ${new Date()}`)
			if ((variants !== null) && (variants.length > 0) && (process.env.PRODUCT_CACHE !== undefined) && (process.env.PRODUCT_CACHE === 'Y')) {
				await RushProducts.storeCoinInCache(coinId, member.homeShopifyStoreId, variants);
			}
		}
	}


	//	Do the work of preparing the response.
	if ((member !== undefined) && (variants.length > 0)) {
		rushProducts = await consolidateVariants(variants, member, variantFilters, bypassFulfillmentOptions, includeMerchFlag, statusFilters, onlyEligibleFlag);
	}


	return rushProducts;
}



var consolidateVariants = async (variants, member, variantFilters, bypassFulfillmentOptions, includeMerchFlag, statusFilters, onlyEligibleFlag) => {
	let prom = [];
	let rushProducts = {}
	let variantGroupContext = {
		variantGroupIndex: -1,
		vgAdded: false,
		vgConditionPrice: '',
		vgEligibility: '',
		variantGroups: [],
		vgManifestSource: '',
		vgShipType: '',
		vgShippable: '',
		vgStore: 0
	}


	// console.log(`before consolidate: ${new Date()}`)


	if (bypassFulfillmentOptions === undefined) {
		bypassFulfillmentOptions = false;
	}

	if (onlyEligibleFlag === undefined) {
		onlyEligibleFlag = true;
	}


	variantGroupContext.largeItemFee = await TargetedCities.getLargeItemFee(member.zip);

	variantGroupContext.localCourierCount = await RushProducts.getLocalCourierCount(member.zip);
	variantGroupContext.localCourierAvailableLTL = false;
	variantGroupContext.localCourierAvailableSmallParcel = false;
	for (var l = 0; l < variantGroupContext.localCourierCount.length; l++) {
		if ((variantGroupContext.localCourierCount[l].shipType === 'LTL') && (variantGroupContext.localCourierCount[l].num > 0)) {
			variantGroupContext.localCourierAvailableLTL = true;
		}
		if ((variantGroupContext.localCourierCount[l].shipType === 'Small Parcel') && (variantGroupContext.localCourierCount[l].num > 0)) {
			variantGroupContext.localCourierAvailableSmallParcel = true;
		}
	}

	initializeVariantGroupContext(variantGroupContext);


	//
	//	Process variants
	//
	variants = variants.filter(variant => (variant.attributes || (!onlyEligibleFlag || (onlyEligibleFlag && variant.effectiveEligibility && (variant.effectiveEligibility !== 'NOT_ELIGIBLE')))));

	for (var i = 0; i < variants.length; i++) {

		if (i === 0) {
			populateCoinLevelInfo(rushProducts, variants[i]);
		}

		//	Check if we need to start a new variant group.
		await newVariantGroupCheck(member, variantGroupContext, variants[i], bypassFulfillmentOptions, onlyEligibleFlag);

		//	If the current variantGroup is "added" based on it's eligibility, load up the variants.
		if (variantGroupContext.vgAdded) {
			await addVariant(member, variantGroupContext, variants[i], variantFilters, statusFilters, includeMerchFlag, onlyEligibleFlag);
		}

	}

	//	If filters employed, remove variantGroups with empty variant arrays.
	if ((variantFilters !== undefined) || ((statusFilters !== undefined) && (statusFilters.length > 0))) {
		_.remove(variantGroupContext.variantGroups, function (r) {
			return r.variants.length === 0;
		});
	}

	//	if onlyEligible, get rid of 0 quantities variant groups
	if (onlyEligibleFlag) {
		_.remove(variantGroupContext.variantGroups, function (r) {
			return r.quantity === 0;
		});
	}


	//	If no variantGroups based on eligibility, load the first one regardless of eligibility
	if (onlyEligibleFlag && (variantGroupContext.variantGroups.length === 0)) {
		variantGroupContext.variantGroupIndex = -1;
		initializeVariantGroupContext(variantGroupContext);
		await newVariantGroupCheck(member, variantGroupContext, variants[0], false);
		await addVariant(member, variantGroupContext, variants[0], variantFilters, statusFilters, includeMerchFlag, false);
	}


	rushProducts.variantGroups = variantGroupContext.variantGroups;

	// console.log(`after consolidate: ${new Date()}`)

	return rushProducts
}


var initializeVariantGroupContext = (variantGroupContext) => {
	variantGroupContext.vgConditionPrice = '';
	variantGroupContext.vgEligibility = ''
	variantGroupContext.vgManifestSource = '';
	variantGroupContext.vgShipType = '';
	variantGroupContext.vgShippable = '';
	variantGroupContext.vgStore = 0;
}


var addVariant = async (member, variantGroupContext, variant, variantFilters, statusFilters, includeMerchFlag, onlyEligibleFlag) => {
	// console.log(variantFilters[0] + " " + variant.shopifyVariantId.toString() + " " + _.indexOf(variantFilters, variant.shopifyVariantId.toString()));
	if (((variantFilters === undefined) || (_.indexOf(variantFilters, variant.shopifyVariantId.toString()) > -1)) &&
		((statusFilters === undefined) || ((statusFilters.length === 0) || (_.indexOf(statusFilters, variant.status) > -1)))) {

		// Only increase quantity if Live and online
		if ((variant.status === 'Live') && (variant.onlineShopping === 'Y')) {
			var increment = 1;
			if (variant.dropshipType === 'LIMITED') {
				increment = variant.limitedQuantity;
			} else if (variant.dropshipType === 'UNLIMITED') {
				increment = 99;
			}
			variantGroupContext.variantGroups[variantGroupContext.variantGroupIndex].quantity += increment;

			//	Cap the variant group quantity
			if ((configUtils.get("MAX_VGROUP_QTY") !== null) && (variantGroupContext.variantGroups[variantGroupContext.variantGroupIndex].quantity > parseInt(configUtils.get("MAX_VGROUP_QTY")))) {
				variantGroupContext.variantGroups[variantGroupContext.variantGroupIndex].quantity = parseInt(configUtils.get("MAX_VGROUP_QTY"));
			}
		}

		_.remove(variantFilters, function (v) {
			return v === variant.shopifyVariantId.toString();
		});

		var merchandising = undefined;
		if ((includeMerchFlag === true) || (includeMerchFlag === 'true')) {
			merchandising = await populateMerchandising(member, variant.sku);
		}

		let metrosCount = await Metros.getActiveMetroCount();

		if ((!onlyEligibleFlag) || ((onlyEligibleFlag) && (variant.status === 'Live') && (variant.onlineShopping === 'Y')))
			variantGroupContext.variantGroups[variantGroupContext.variantGroupIndex].variants.push({
				productId: variant.productId,
				sku: variant.sku,
				marketPrice: variant.marketPrice,
				status: variant.status,
				onlineShopping: variant.onlineShopping,
				inMarketExclusive: variant.inMarketExclusive,
				shopifyVariantId: variant.shopifyVariantId,
				showRoomFlag: variant.showRoomFlag,
				// damageTop: variant.damageTop,
				// damageBotton: variant.damageBottom,
				// damageInterior: variant.damageInterior,
				// missingHardware: variant.missingHardware,
				// conditionDescription: variant.conditionDescription,
				// fulfillmentMessage: variant.fulfillmentMessage,
				damageImages: [],
				merchandising: merchandising,
				dropshipType: variant.dropshipType,
				limitedQuantity: variant.limitedQuantity,
				eligibilitySummary: (variant.shipEligible === metrosCount) ? 'National' : (variant.shipEligible > 1) ? 'Regional' : 'Local',
				numberOfBoxes: variant.numberOfBoxes,
				manifestSource: variant.manifestSource
			});


		//	Populate damage images.
		for (var j = 0; j < variant.damageImages.length; j++) {
			if (variantGroupContext.variantGroups[variantGroupContext.variantGroupIndex].variants[(variantGroupContext.variantGroups[variantGroupContext.variantGroupIndex].variants.length - 1)]) {
				variantGroupContext.variantGroups[variantGroupContext.variantGroupIndex].variants[(variantGroupContext.variantGroups[variantGroupContext.variantGroupIndex].variants.length - 1)].damageImages.push(variant.damageImages[j]);
			}
		}
	}
}



var newVariantGroupCheck = async (member, variantGroupContext, variant, bypassFulfillmentOptions, onlyEligibleFlag) => {
	if ((variantGroupContext.vgConditionPrice !== (variant.conditionName + variant.price)) ||
		(variantGroupContext.vgStore !== variant.storeId) ||
		((configUtils.get("GDE_TOGGLE") === "ON") && (variantGroupContext.vgEligibility !== variant.effectiveEligibility)) ||
		((variantGroupContext.vgManifestSource !== variant.manifestSource) && ((variantGroupContext.vgManifestSource === 'STS') || (variantGroupContext.vgManifestSource === 'DS') || (variant.manifestSource === 'STS') || (variant.manifestSource === 'DS'))) ||
		((variantGroupContext.vgShipType !== variant.shipType) && ((variantGroupContext.vgShipType === null) && (variant.shipType !== 'Small Parcel') || (variant.shipType === null) && (variantGroupContext.vgShipType !== 'Small Parcel'))) ||
		(variantGroupContext.vgShippable !== variant.shippable) ||
		(variant.pricingType === 'Priced for Condition')) {

		//	Keep track of key data points about current variant group.
		variantGroupContext.vgConditionPrice = (variant.conditionName + variant.price);
		variantGroupContext.vgStore = variant.storeId;
		variantGroupContext.vgEligibility = variant.effectiveEligibility;
		variantGroupContext.vgManifestSource = variant.manifestSource;
		variantGroupContext.vgShipType = variant.shipType;
		variantGroupContext.vgShippable = variant.shippable;


		var vGroup = {
			quantity: 0,
			conditionName: variant.conditionName,
			conditionTitle: null,
			assemblyMessage: null,
			availabilityMessage: null,
			fulfillmentMessage: null,
			marketInfo: variant.marketInfo,
			shippingMessage: null,
			shipType: variant.shipType,
			localCourierAvailable: false,
			shippableFlag: variant.shippable,
			price: variant.price,
			assemblyRequired: (variant.productDisplay === 'Original Packaging') ? "Y" : "N",
			sizeLabel: null,
			size: null,
			pricingTypeId: variant.pricingTypeId,
			pricingType: variant.pricingType,
			variantCityId: variant.variantCityId,
			variantCity: variant.variantCity,
			variantCitySlug: variant.variantCitySlug,
			storeId: variant.storeId,
			eligibility: variant.effectiveEligibility,
			ripple: variant.ripple,
			nationalShipCost: variant.nationalShipCost,
			localShipCost: variant.localShipCost,
			dropshipFlag: ((variantGroupContext.vgManifestSource === 'STS') || (variantGroupContext.vgManifestSource === 'DS')) ? true : false,
			fulfillmentOptionsEDD: [],
			availabilityConditionBullets: [],
			largeItemBullets: [],
			largeItemFee: ((variant.shipType === 'LTL') && (variantGroupContext.largeItemFee.length)) ? variantGroupContext.largeItemFee[0].largeItemFee : 50,
			variants: []
		}

		//
		//	If requestor only wants eligible groups, filter accordingly.  
		//
		if ((!onlyEligibleFlag) || ((onlyEligibleFlag) && (vGroup.eligibility !== null) && (vGroup.eligibility !== 'NOT_ELIGIBLE'))) {

			if ((vGroup.shipType === 'LTL') && (variantGroupContext.localCourierAvailableLTL) && (!vGroup.dropshipFlag)) {
				vGroup.localCourierAvailable = true;
			} else if ((vGroup.shipType === 'Small Parcel') && (variantGroupContext.localCourierAvailableSmallParcel) && (!vGroup.dropshipFlag)) {
				vGroup.localCourierAvailable = true;
			}

			var hoursAndCutoffs = null;
			if (variant.partnerFacility === 'N') {
				hoursAndCutoffs = storeUtils.getHoursAndCutoffs(variant.storeId);
			} else if (variant.partnerFacility === 'Y') {
				hoursAndCutoffs = await loadPartnerEDDInfo(variant);
			}


			if ((hoursAndCutoffs !== undefined) &&
				(hoursAndCutoffs !== null) &&
				(variant.status === 'Live') &&
				((configUtils.get("GDE_TOGGLE") !== "ON") || ((configUtils.get("GDE_TOGGLE") === "ON") &&
					(vGroup.eligibility !== 'NOT_ELIGIBLE') &&
					(vGroup.eligibility !== null)))) {
				if (!bypassFulfillmentOptions) {
					await populatePickupDeliveryMessaging(variant, vGroup, member, hoursAndCutoffs);
				}
				ltlLargeItemBullets(variant, vGroup, hoursAndCutoffs);
			}

			// lastTime = showTimeDiff('C:AfterPPD', lastTime);

			populateVGroupCondition(variant, vGroup);

			populateDamage(variant, vGroup);

			populateMissingHardware(variant, vGroup);

			variantGroupContext.variantGroupIndex++;
			variantGroupContext.variantGroups.push(vGroup);
			variantGroupContext.vgAdded = true;
		} else {
			variantGroupContext.vgAdded = false;
		}
	}

}



var loadPartnerEDDInfo = async (variant) => {
	var hoursAndCutoffs = {};
	hoursAndCutoffs = storeUtils.getHoursAndCutoffs(variant.storeId);

	var eddInputs = await Partners.getEDDInputs(variant.storeId);
	if (!hoursAndCutoffs || !eddInputs.length) {
		return;
	}


	hoursAndCutoffs.ltlTransitDays = eddInputs[0].ltlTransitDays;
	hoursAndCutoffs.spTransitDays = eddInputs[0].spTransitDays;
	hoursAndCutoffs.deliveryCutoffCst = eddInputs[0].shippingCutoffCst;
	hoursAndCutoffs.storeId = variant.storeId;
	hoursAndCutoffs.timezone = variant.storeTimezone;
	hoursAndCutoffs.partnerId = eddInputs[0].partnerId;
	hoursAndCutoffs.facilityId = eddInputs[0].facilityId;
	hoursAndCutoffs.leadTime = eddInputs[0].leadTime;
	hoursAndCutoffs.spDeliveryDaysMin = eddInputs[0].spDeliveryDaysMin;
	hoursAndCutoffs.spDeliveryDaysMax = eddInputs[0].spDeliveryDaysMax;
	hoursAndCutoffs.spEddText = eddInputs[0].spEddText;
	hoursAndCutoffs.ltlDeliveryDaysMin = eddInputs[0].ltlDeliveryDaysMin;
	hoursAndCutoffs.ltlDeliveryDaysMax = eddInputs[0].ltlDeliveryDaysMax;
	hoursAndCutoffs.ltlEddText = eddInputs[0].ltlEddText;
	hoursAndCutoffs.holidays = await Partners.loadHolidays(eddInputs[0].partnerId);

	return hoursAndCutoffs;
}


var populateCoinLevelInfo = async (rushProducts, variant) => {
	var vcWhereInfo = {
		join: '',
		clause: 'WHERE 1=1 ',
		values: []
	}

	rushProducts.coinId = variant.coinId;
	rushProducts.attributes = variant.attributes;
	rushProducts.noIndexFlag = variant.noIndexFlag ? variants[i].noIndexFlag : false;
	rushProducts.vendorName = variant.vendorName;
	rushProducts.totalLikes = variant.totalLikes;
	rushProducts.name = variant.name;
	rushProducts.promoId = variant.promoId;
	rushProducts.manufacturer = variant.manufacturer;
	rushProducts.upc = variant.upc;
	rushProducts.mpn = variant.mpn;
	rushProducts.weight = variant.weight;
	rushProducts.msrp = variant.msrp;
	rushProducts.originalPrice = variant.originalPrice;
	rushProducts.marketPrice = variant.marketPrice;
	rushProducts.onlineQuickSale = variant.onlineQuickSale;
	rushProducts.freshnessScore = variant.freshnessScore;
	rushProducts.frontEndSpace = variant.frontEndSpace;
	rushProducts.frontEndName = variant.frontEndName;
	rushProducts.category1Name = variant.category1;
	rushProducts.category2Name = variant.category2;
	rushProducts.shopifyProductId = variant.shopifyProductId;
	rushProducts.productDescription = variant.productDescription;
	rushProducts.dimensions = variant.productDimensions;
	rushProducts.size = null;
	rushProducts.sizeLabel = null;
	rushProducts.style = variant.styleTag1;
	rushProducts.primaryMaterial = variant.primaryMaterial;
	rushProducts.secondaryMaterial = variant.secondaryMaterial;
	rushProducts.primaryColor = variant.primaryColor;
	rushProducts.bulletPoints = variant.bulletPoints;
	rushProducts.images = variant.images;
	rushProducts.assemblyInstructions = variant.assemblyInstructions;
	rushProducts.pullForwardVendorSku = variant.pullForwardVendorSku;
	rushProducts.prop65 = variant.prop65;
	rushProducts.prop65Chemicals = variant.prop65Chemicals;
	rushProducts.prop65WarningLabel = variant.prop65WarningLabel;

	rushProducts.variantGroups = [];
}




var populateMerchandising = async (member, sku) => {
	var req = {
		query: {
			sku: sku,
			zip: member.zip
		}
	}
	var resp = {
		statusCode: 200,
		message: 'Success.',
		data: {}
	}

	var resp = await merchActions.get(req, resp, undefined, undefined, undefined, "ORDER BY l.name, lc.position, lcb.position", undefined);
	if ((resp.statusCode !== 200) || (resp.data.laps.length === 0)) {
		return null;
	} else {
		for (var i = 0; i < resp.data.laps.length; i++) {
			delete resp.data.laps[i].lastRefresh;
			delete resp.data.laps[i].nextRefresh;
			for (var j = 0; j < resp.data.laps[i].clusters.length; j++) {
				resp.data.laps[i].clusters[j].images = [];
				if ((resp.data.laps[i].clusters[j].image1 !== null) && (resp.data.laps[i].clusters[j].image1.length > 0)) {
					resp.data.laps[i].clusters[j].images.push(resp.data.laps[i].clusters[j].image1);
				}
				if ((resp.data.laps[i].clusters[j].image2 !== null) && (resp.data.laps[i].clusters[j].image2.length > 0)) {
					resp.data.laps[i].clusters[j].images.push(resp.data.laps[i].clusters[j].image2);
				}
				resp.data.laps[i].clusters[j].totalProducts = resp.data.laps[i].clusters[j].products.length;
				delete resp.data.laps[i].clusters[j].position;
				delete resp.data.laps[i].clusters[j].expirationDate;
				delete resp.data.laps[i].clusters[j].image1;
				delete resp.data.laps[i].clusters[j].image2;
				delete resp.data.laps[i].clusters[j].products;



			}
		}
		return resp.data;
	}
}


var populateDamage = (rawVariant, vGroup) => {
	if (vGroup.conditionTitle === 'New Item') {
		// vGroup.availabilityConditionBullets.push("No physical flaws, scratches, or scuffs");
	} else if (vGroup.conditionTitle === 'Open Box - Like New') {
		vGroup.availabilityConditionBullets.push("Inspected and Verified");
		vGroup.availabilityConditionBullets.push("Open Box Savings");
	} else if (vGroup.conditionTitle === 'Open Box - Good') {
		vGroup.availabilityConditionBullets.push("Inspected and Verified");
	} else if (vGroup.conditionTitle === 'Open Box - Fair') {
		vGroup.availabilityConditionBullets.push("Inspected and Verified");
	}

	if ((rawVariant.damageSeverityTop !== null) && (rawVariant.damageSeverityTop === 'Considerable')) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityTop + " imperfection(s)");
	} else if ((rawVariant.damageSeverityBottom !== null) && (rawVariant.damageSeverityBottom === 'Considerable')) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityBottom + " imperfection(s)");
	} else if ((rawVariant.damageSeverityInterior !== null) && (rawVariant.damageSeverityInterior === 'Considerable')) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityInterior + " imperfection(s)");
	} else if ((rawVariant.damageSeverityTop !== null) && (rawVariant.damageSeverityTop === 'Moderate')) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityTop + " imperfection(s)");
	} else if ((rawVariant.damageSeverityBottom !== null) && (rawVariant.damageSeverityBottom === 'Moderate')) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityBottom + " imperfection(s)");
	} else if ((rawVariant.damageSeverityInterior !== null) && (rawVariant.damageSeverityInterior === 'Moderate')) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityInterior + " imperfection(s)");
	} else if ((rawVariant.damageSeverityTop !== null) && (rawVariant.damageSeverityTop === 'Minor')) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityTop + " imperfection(s)");
	} else if ((rawVariant.damageSeverityBottom !== null) && (rawVariant.damageSeverityBottom === 'Minor')) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityBottom + " imperfection(s)");
	} else if ((rawVariant.damageSeverityInterior !== null) && (rawVariant.damageSeverityInterior === 'Minor')) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityInterior + " imperfection(s)");
	}
}

var populateDamageInterior = (rawVariant, vGroup) => {
	if (rawVariant.damageSeverityInterior !== null) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityInterior + " imperfection(s)");
	}
}


var populateDamageTop = (rawVariant, vGroup) => {
	if (rawVariant.damageSeverityTop !== null) {
		vGroup.availabilityConditionBullets.push(rawVariant.damageSeverityTop + " imperfection(s)");
	}
}



var populateMissingHardware = (rawVariant, vGroup) => {
	switch (rawVariant.missingHardware) {
		case "5dcd84630000012aa8000002":
			vGroup.availabilityConditionBullets.push("Missing some assembly hardware (screws/fasteners) or non-essential materials/parts.");
			break;

		case "5dcd84bd0000012aa8000004":
			vGroup.availabilityConditionBullets.push("Missing most assembly hardware (screws/fasteners) or non-essential materials/parts.");
			break;

		default:
			if ((vGroup.conditionTitle === 'Open Box - Good') || (vGroup.conditionTitle === 'Open Box - Fair')) {
				vGroup.availabilityConditionBullets.push("No missing parts or hardware");
			}
			break;
	}
}


var populateVGroupCondition = (rawVariant, vGroup) => {
	switch (vGroup.conditionName) {
		case "New":
			vGroup.conditionTitle = "New Item";
			break;

		case "Like New":
			vGroup.conditionTitle = "Open Box - Like New";
			break;

		case "Good":
			vGroup.conditionTitle = "Open Box - Good";
			break;

		case "Fair":
			vGroup.conditionTitle = "Open Box - Fair";
			break;

		case "Damaged":

			//
			//	No missing parts
			//
			if (rawVariant.missingHardwareSeverity === null) {

				vGroup.conditionTitle = "Open Box - Good";

				//	Minor damage
				if ((rawVariant.damageSeverityBottom === 'Minor') || (rawVariant.damageSeverityInterior === 'Minor') || (rawVariant.damageSeverityTop === 'Minor')) {

					//	Damage visibility
					if (((rawVariant.damageVisibilityBottom !== null) && (rawVariant.damageVisibilityBottom.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityInterior !== null) && (rawVariant.damageVisibilityInterior.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityTop !== null) && (rawVariant.damageVisibilityTop.indexOf('Clearly') > -1))) {
						vGroup.conditionTitle = "Open Box - Good"
					} else {
						vGroup.conditionTitle = "Open Box - Good"
					}
				}

				//	Moderate damage
				if ((rawVariant.damageSeverityBottom === 'Moderate') || (rawVariant.damageSeverityInterior === 'Moderate') || (rawVariant.damageSeverityTop === 'Moderate')) {

					//	Damage visibility
					if (((rawVariant.damageVisibilityBottom !== null) && (rawVariant.damageVisibilityBottom.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityInterior !== null) && (rawVariant.damageVisibilityInterior.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityTop !== null) && (rawVariant.damageVisibilityTop.indexOf('Clearly') > -1))) {
						vGroup.conditionTitle = "Open Box - Fair"
					} else {
						vGroup.conditionTitle = "Open Box - Good"
					}
				}

				//	Moderate damage
				if ((rawVariant.damageSeverityBottom === 'Considerable') || (rawVariant.damageSeverityInterior === 'Considerable') || (rawVariant.damageSeverityTop === 'Considerable')) {

					//	Damage visibility
					if (((rawVariant.damageVisibilityBottom !== null) && (rawVariant.damageVisibilityBottom.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityInterior !== null) && (rawVariant.damageVisibilityInterior.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityTop !== null) && (rawVariant.damageVisibilityTop.indexOf('Clearly') > -1))) {
						vGroup.conditionTitle = "Open Box - Fair"
					} else {
						vGroup.conditionTitle = "Open Box - Fair"
					}
				}

			}


			//
			//	Some missing parts
			//
			else if (rawVariant.missingHardwareSeverity === 'Some/Few') {

				vGroup.conditionTitle = "Open Box - Good";

				//	Minor damage
				if ((rawVariant.damageSeverityBottom === 'Minor') || (rawVariant.damageSeverityBottom === 'Minor') || (rawVariant.damageSeverityInterior === 'Minor') || (rawVariant.damageSeverityTop === 'Minor')) {

					//	Damage visibility
					if (((rawVariant.damageVisibilityBottom !== null) && (rawVariant.damageVisibilityBottom.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityInterior !== null) && (rawVariant.damageVisibilityInterior.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityTop !== null) && (rawVariant.damageVisibilityTop.indexOf('Clearly') > -1))) {
						vGroup.conditionTitle = "Open Box - Fair"
					} else {
						vGroup.conditionTitle = "Open Box - Good"
					}
				}

				//	Moderate damage
				if ((rawVariant.damageSeverityBottom === 'Moderate') || (rawVariant.damageSeverityInterior === 'Moderate') || (rawVariant.damageSeverityTop === 'Moderate')) {

					//	Damage visibility
					if (((rawVariant.damageVisibilityBottom !== null) && (rawVariant.damageVisibilityBottom.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityInterior !== null) && (rawVariant.damageVisibilityInterior.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityTop !== null) && (rawVariant.damageVisibilityTop.indexOf('Clearly') > -1))) {
						vGroup.conditionTitle = "Open Box - Fair"
					} else {
						vGroup.conditionTitle = "Open Box - Fair"
					}
				}

				//	Moderate damage
				if ((rawVariant.damageSeverityBottom === 'Considerable') || (rawVariant.damageSeverityInterior === 'Considerable') || (rawVariant.damageSeverityTop === 'Considerable')) {

					//	Damage visibility
					if (((rawVariant.damageVisibilityBottom !== null) && (rawVariant.damageVisibilityBottom.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityInterior !== null) && (rawVariant.damageVisibilityInterior.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityTop !== null) && (rawVariant.damageVisibilityTop.indexOf('Clearly') > -1))) {
						vGroup.conditionTitle = "Open Box - Fair"
					} else {
						vGroup.conditionTitle = "Open Box - Fair"
					}
				}

			}


			//
			//	Most all missing parts
			//
			else {

				vGroup.conditionTitle = "Open Box - Fair";

				//	Minor damage
				if ((rawVariant.damageSeverityBottom === 'Minor') || (rawVariant.damageSeverityInterior === 'Minor') || (rawVariant.damageSeverityTop === 'Minor')) {

					//	Damage visibility
					if (((rawVariant.damageVisibilityBottom !== null) && (rawVariant.damageVisibilityBottom.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityInterior !== null) && (rawVariant.damageVisibilityInterior.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityTop !== null) && (rawVariant.damageVisibilityTop.indexOf('Clearly') > -1))) {
						vGroup.conditionTitle = "Open Box - Fair"
					} else {
						vGroup.conditionTitle = "Open Box - Fair"
					}
				}

				//	Moderate damage
				if ((rawVariant.damageSeverityBottom === 'Moderate') || (rawVariant.damageSeverityInterior === 'Moderate') || (rawVariant.damageSeverityTop === 'Moderate')) {

					//	Damage visibility
					if (((rawVariant.damageVisibilityBottom !== null) && (rawVariant.damageVisibilityBottom.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityInterior !== null) && (rawVariant.damageVisibilityInterior.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityTop !== null) && (rawVariant.damageVisibilityTop.indexOf('Clearly') > -1))) {
						vGroup.conditionTitle = "Open Box - Fair"
					} else {
						vGroup.conditionTitle = "Open Box - Fair"
					}
				}

				//	Moderate damage
				if ((rawVariant.damageSeverityBottom === 'Considerable') || (rawVariant.damageSeverityInterior === 'Considerable') || (rawVariant.damageSeverityTop === 'Considerable')) {

					//	Damage visibility
					if (((rawVariant.damageVisibilityBottom !== null) && (rawVariant.damageVisibilityBottom.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityInterior !== null) && (rawVariant.damageVisibilityInterior.indexOf('Clearly') > -1)) ||
						((rawVariant.damageVisibilityTop !== null) && (rawVariant.damageVisibilityTop.indexOf('Clearly') > -1))) {
						vGroup.conditionTitle = "Open Box - Fair"
					} else {
						vGroup.conditionTitle = "Open Box - Fair"
					}
				}

			}
			break;

	}
}



var ltlLargeItemBullets = (variant, vGroup, hoursAndCutoffs) => {
	var now = moment.tz('America/Chicago');

	if (variant.shipType === 'LTL') {
		vGroup.largeItemBullets.push(memberText.get("LTL_LARGE_ITEM_FEE"));
		vGroup.largeItemBullets.push(memberText.get("LTL_LARGE_ITEM_ADDITIONAL"));
		vGroup.largeItemBullets.push(memberText.get("LTL_LARGE_ITEM_APPT"));

		if (vGroup.localCourierAvailable) {
			if (now.day() === 0) {
				if (now.isAfter(hoursAndCutoffs.localLTLCutoffTodayCST)) {
					vGroup.largeItemBullets.push(memberText.get("LTL_LARGE_ITEM_SCHED_NEXT_SUNDAY"));
				} else {
					vGroup.largeItemBullets.push(memberText.get("LTL_LARGE_ITEM_SCHED_TODAY"));

				}
			} else {
				vGroup.largeItemBullets.push(memberText.get("LTL_LARGE_ITEM_SCHED_SUNDAY"));
			}
		} else {
			vGroup.largeItemBullets.push(memberText.get("LTL_LARGE_ITEM_SCHED_CALL"));
		}

		vGroup.largeItemBullets.push(memberText.get("LTL_LARGE_ITEM_THRESHOLD"));
		vGroup.largeItemBullets.push(memberText.get("LTL_LARGE_ITEM_STAIRS"));
		// vGroup.largeItemBullets.push(memberText.get("LTL_LARGE_ITEM_WHITE_GLOVE"));
	}
}


//	LTL Dropship
var ltlPickupAndDeliveryDropship = (variant, vGroup, member, hoursAndCutoffs, deliveryFlag) => {
	var pickupFlag = false;

	//	If there's a physical location in the member's City, pickup is an option.
	// if ((variant.marketInfo.instorePickupAvailable === 'Y') && (member.memberStoreType === 'PHYSICAL')) {
	// 	pickupFlag = true;
	// 	vGroup.availabilityMessage = memberText.get("AVAILMSG_DS");
	// }

	//	'Usually ships in' fulfillment messaging
	vGroup.fulfillmentMessage = memberText.get("FULMSG_LTL_DS");

	//	Ships to store or home messaging
	if (pickupFlag) {
		vGroup.shippingMessage = memberText.get("SHIPMSG_DS");
	} else {
		vGroup.shippingMessage = memberText.get("SHIPMSG_DS_NO_PICKUP");
	}


	//	Green bolded pickup and delivery messaging.
	if (pickupFlag) {
		vGroup.fulfillmentOptionsEDD.push({
			type: "PICKUP",
			label: memberText.get("SO_PICKUP"),
			edd: new moment().add(10, 'days').format("YYYY-MM-DD"),
			estimatedShipDate: new moment().add(5, 'days').format("YYYY-MM-DD"),
			estimatedShipCost: vGroup.nationalShipCost,
			enhancedEdd: memberText.get("EDD_LTL_DS_PICKUP")
		});
	}

	if (deliveryFlag) {
		vGroup.fulfillmentOptionsEDD.push({
			type: "DELIVERY",
			label: memberText.get("SO_DELIVERY"),
			edd: new moment().add(10, 'days').format("YYYY-MM-DD"),
			estimatedShipDate: new moment().add(5, 'days').format("YYYY-MM-DD"),
			estimatedShipCost: vGroup.nationalShipCost,
			enhancedEdd: memberText.get("EDD_LTL_DS_DELIVERY")
		});
	}
}



//	LTL Product in Different City Than Member
var ltlPickupAndDeliveryDiffMarket = async (variant, vGroup, member, hoursAndCutoffs, deliveryFlag) => {
	var now = moment.tz('America/Chicago');

	//	RM-3202 removed the transferring of product from one physical location to another for pickup.

	vGroup.fulfillmentMessage = memberText.get("FULMSG_LTL_H2S_DELIVERY");
	vGroup.shippingMessage = memberText.get("SHIPMSG_LTL_H2S_DELIVERY");


	//	If partner facility, convey ranges for now.
	// if ((variant.partnerFacility === 'Y') && (deliveryFlag)) {
	// 	{
	// 		vGroup.fulfillmentOptionsEDD.push({
	// 			type: "DELIVERY",
	// 			label: memberText.get("SO_DELIVERY"),
	// 			edd: new moment().add(hoursAndCutoffs.ltlDeliveryDaysMax, 'days').format("YYYY-MM-DD"),
	// 			estimatedShipDate: new moment().add(hoursAndCutoffs.ltlDeliveryDaysMin, 'days').format("YYYY-MM-DD"),
	// 			estimatedShipCost: vGroup.nationalShipCost,
	// 			enhancedEdd: hoursAndCutoffs.ltlEddText
	// 		});
	// 	}

	// } else {


		//	Get shipper and delivery EDD
		var delivery = await determineLTLShipperAndEDD(variant, member, hoursAndCutoffs);

		if (deliveryFlag) {
			//	20211011 - if in metros outside physicals, extend delivery range to 5-10
			var deliveryMsg = memberText.get("LTL_EXTENDED_DELIVERY");
			if ((member.homeCityId === 1) || (member.homeCityId === 5) || (member.homeCityId === 6)) {
				deliveryMsg = memberText.get("LTL_DELIVERY");
			}

			if (variant.partnerFacility === 'Y') {
				vGroup.fulfillmentOptionsEDD.push({
					type: "DELIVERY",
					label: memberText.get("SO_DELIVERY"),
					edd: new moment().add(hoursAndCutoffs.ltlDeliveryDaysMax, 'days').format("YYYY-MM-DD"),
					estimatedShipDate: new moment().add(hoursAndCutoffs.ltlDeliveryDaysMin, 'days').format("YYYY-MM-DD"),
					estimatedShipCost:  delivery.estimatedShipCost,
					enhancedEdd: hoursAndCutoffs.ltlEddText
				});
			}
			else {

				vGroup.fulfillmentOptionsEDD.push({
					type: "DELIVERY",
					label: memberText.get("SO_DELIVERY"),
					edd: (delivery.range === null) ? (variant.partnerFacility === 'Y') ? delivery.edd.format('YYYY-MM-DD') : new moment().add(5, 'days').format("YYYY-MM-DD") : delivery.fri.format("YYYY-MM-DD"),
					estimatedShipDate: new moment().add(2, 'days').format("YYYY-MM-DD"),
					estimatedShipCost: vGroup.nationalShipCost,
					enhancedEdd: (delivery.range === null) ? deliveryMsg : memberText.get("LTL_RANGE_DELIVERY").replace('%deliveryrange%', delivery.range)
				});
			}
		}
}




//	LTL Product in Same City As Member
var ltlPickupAndDeliverySameMarket = async (variant, vGroup, member, hoursAndCutoffs, deliveryFlag) => {
	var now = moment.tz('America/Chicago');
	var pickupFlag = false;


	// If there's a physical location in the member's City
	if ((variant.marketInfo.instorePickupAvailable === 'Y') && (member.memberStoreType === 'PHYSICAL')) {
		pickupFlag = true;
		if (variant.showRoomFlag) {
			vGroup.availabilityMessage = memberText.get("LTL_SHOWROOM_AVAILMSG_PICKUP").replace("%city%", member.memberCity);
		} else {
			vGroup.availabilityMessage = memberText.get("LTL_NOT_SHOWROOM_AVAILMSG_PICKUP").replace("%city%", member.memberCity);
		}
	}


	//	Fulfillment messaging
	vGroup.fulfillmentMessage = variant.marketInfo.memberDisplayName;


	//	Figure shipper and EDD to member for delivery option
	var delivery = await determineLTLShipperAndEDD(variant, member, hoursAndCutoffs);
	delivery.marketEdd = delivery.edd;

	//	Figure pickup day.
	var pickup = await determinePickupDay(delivery, variant, member, hoursAndCutoffs);



	//	Green bolded pickup and delivery messaging.
	if (pickupFlag) {
		vGroup.fulfillmentOptionsEDD.push({
			type: "PICKUP",
			label: memberText.get("SO_PICKUP"),
			edd: pickup.pickupDate.format("YYYY-MM-DD"),
			estimatedShipDate: null,
			estimatedShipCost: 0,
			enhancedEdd: memberText.get("DAY_PICKUP").replace('%pickupday%', pickup.pickupDay).replace('%store%', member.memberStoreName)
		});

	}

	if (deliveryFlag) {
		//	20211011 - if in metros outside physicals, extend delivery range to 5-10
		var deliveryMsg = memberText.get("LTL_EXTENDED_DELIVERY");
		if (member.homeCityId === 1) {
			deliveryMsg = memberText.get("LTL_DELIVERY");
		}

		vGroup.fulfillmentOptionsEDD.push({
			type: "DELIVERY",
			label: memberText.get("SO_DELIVERY"),
			edd: (delivery.range === null) ? new moment().add(5, 'days').format("YYYY-MM-DD") : delivery.fri.format("YYYY-MM-DD"),
			estimatedShipDate: delivery.shipDay.format('YYYY-MM-DD'),
			estimatedShipCost: delivery.estimatedShipCost,
			enhancedEdd: (delivery.range === null) ? deliveryMsg : memberText.get("LTL_RANGE_DELIVERY").replace('%deliveryrange%', delivery.range)
		});
	}
}



//	Small Parcel Dropship
var spPickupAndDeliveryDropship = (variant, vGroup, member, hoursAndCutoffs, deliveryFlag) => {
	var pickupFlag = false;


	//	1/3/2022 - Don't allow pickup for DS
	//	If there's a physical location in the member's City, pickup is an option.
	// if (member.memberStoreType === 'PHYSICAL') {
	// 	pickupFlag = true;
	// 	vGroup.availabilityMessage = memberText.get("AVAILMSG_DS");
	// }

	//	'Usually ships in' fulfillment messaging
	vGroup.fulfillmentMessage = memberText.get("FULMSG_SP_DS");

	//	Ships to store or home messaging
	if (pickupFlag) {
		vGroup.shippingMessage = memberText.get("SHIPMSG_DS");
	} else {
		vGroup.shippingMessage = memberText.get("SHIPMSG_DS_NO_PICKUP");
	}


	//	Green bolded pickup and delivery messaging.
	if (pickupFlag) {
		vGroup.fulfillmentOptionsEDD.push({
			type: "PICKUP",
			label: memberText.get("SO_PICKUP"),
			edd: new moment().add(10, 'days').format("YYYY-MM-DD"),
			estimatedShipDate: new moment().add(5, 'days').format("YYYY-MM-DD"),
			estimatedShipCost: vGroup.nationalShipCost,
			enhancedEdd: memberText.get("EDD_SP_DS_PICKUP")
		});
	}

	if (deliveryFlag) {
		vGroup.fulfillmentOptionsEDD.push({
			type: "DELIVERY",
			label: memberText.get("SO_DELIVERY"),
			edd: new moment().add(10, 'days').format("YYYY-MM-DD"),
			estimatedShipDate: new moment().add(5, 'days').format("YYYY-MM-DD"),
			estimatedShipCost: vGroup.nationalShipCost,
			enhancedEdd: memberText.get("EDD_SP_DS_DELIVERY")
		});
	}
}



//	Small Parcel Product in Different City Than Member
var spPickupAndDeliveryDiffMarket = async (variant, vGroup, member, hoursAndCutoffs, deliveryFlag) => {
	var now = moment.tz('America/Chicago'); //	Cutoffs are in CST

	//	RM-3202 removed the transferring of product from one physical location to another for pickup.


	//	Ships to store or home messaging + fulfillment messaging
	vGroup.fulfillmentMessage = memberText.get("FULMSG_SP_H2S_DELIVERY");
	vGroup.shippingMessage = memberText.get("SHIPMSG_SP_H2S_DELIVERY");



	//	If partner facility, convey ranges for now.
	// if ((variant.partnerFacility === 'Y') && (deliveryFlag)) {
	// 	{
	// 		vGroup.fulfillmentOptionsEDD.push({
	// 			type: "DELIVERY",
	// 			label: memberText.get("SO_DELIVERY"),
	// 			edd: new moment().add(hoursAndCutoffs.spDeliveryDaysMax, 'days').format("YYYY-MM-DD"),
	// 			estimatedShipDate: new moment().add(hoursAndCutoffs.spDeliveryDaysMin, 'days').format("YYYY-MM-DD"),
	// 			estimatedShipCost: vGroup.nationalShipCost,
	// 			enhancedEdd: hoursAndCutoffs.spEddText
	// 		});
	// 	}

	// } else {

		//	Get shipper and delivery EDD
		var delivery = await determineSmallParcelShipperAndEDD(variant, member, hoursAndCutoffs);

		// console.log("Member Delivery: " + delivery.edd.format("YYYY-MM-DD"));

		if (deliveryFlag) {
			var now = new moment();
			var day = delivery.edd.format("dddd");

			//	Make sure the edd is not a week out before doing the DoW logic.
			if (delivery.edd.diff(now, 'days') <= 2) {
				if (((now.day() === 7) && (delivery.edd.day() === 1)) || (delivery.edd.day() === (now.day() + 1))) {
					day = 'Tomorrow'
				}
			}

			if (variant.partnerFacility === 'Y') {
				vGroup.fulfillmentOptionsEDD.push({
					type: "DELIVERY",
					label: memberText.get("SO_DELIVERY"),
					edd: new moment().add(hoursAndCutoffs.spDeliveryDaysMax, 'days').format("YYYY-MM-DD"),
					estimatedShipDate: delivery.shipDay.format("YYYY-MM-DD"),
					estimatedShipCost: delivery.estimatedShipCost,
					enhancedEdd: hoursAndCutoffs.spEddText
				});
			}
			else {
				vGroup.fulfillmentOptionsEDD.push({
					type: "DELIVERY",
					label: memberText.get("SO_DELIVERY"),
					edd: delivery.edd.format("YYYY-MM-DD"),
					esd: delivery.shipDay.format("YYYY-MM-DD"),
					estimatedShipCost: delivery.estimatedShipCost,
					enhancedEdd: memberText.get("SP_DIFF_MARKET_DELIVERY_DATE").replace("%deliveryday%", day).replace("%month%", delivery.edd.format("M")).replace("%day%", delivery.edd.format("D"))
				});
			}
		}
	// }
}


//
//	Small Parcel Product in Same City As Member
//
var spPickupAndDeliverySameMarket = async (variant, vGroup, member, hoursAndCutoffs, deliveryFlag) => {
	var now = moment.tz('America/Chicago'); //	Cutoffs are in CST
	var pickupFlag = false;


	// If there's a physical location in the member's City
	if ((variant.marketInfo.instorePickupAvailable === 'Y') && (member.memberStoreType === 'PHYSICAL')) {
		pickupFlag = true;
		if (variant.showRoomFlag) {
			vGroup.availabilityMessage = memberText.get("SP_SHOWROOM_AVAILMSG_PICKUP").replace("%city%", member.memberCity);
		} else {
			vGroup.availabilityMessage = memberText.get("SP_NOT_SHOWROOM_AVAILMSG_PICKUP").replace("%city%", member.memberCity);
		}
	}


	//	Fulfillment messaging
	vGroup.fulfillmentMessage = variant.marketInfo.memberDisplayName;


	//	Figure shipper and EDD for delivery option
	var delivery = await determineSmallParcelShipperAndEDD(variant, member, hoursAndCutoffs);
	delivery.marketEdd = delivery.edd;

	//	Figure pickup day.
	var pickup = await determinePickupDay(delivery, variant, member, hoursAndCutoffs);

	//	Green bolded pickup and delivery messaging.
	if (pickupFlag) {
		vGroup.fulfillmentOptionsEDD.push({
			type: "PICKUP",
			label: memberText.get("SO_PICKUP"),
			edd: pickup.pickupDate.format("YYYY-MM-DD"),
			estimatedShipDay: null,
			estinatedShipCost: 0,
			enhancedEdd: memberText.get("DAY_PICKUP").replace('%pickupday%', pickup.pickupDay).replace('%store%', member.memberStoreName)
		});
	}

	if (deliveryFlag) {
		var now = new moment();
		var day = delivery.edd.format("dddd");

		//	Make sure the edd is not a week out before doing the DoW logic.
		if (delivery.edd.diff(now, 'days') <= 2) {
			if (((now.day() === 7) && (delivery.edd.day() === 1)) || (delivery.edd.day() === (now.day() + 1))) {
				day = 'Tomorrow'
			}
		}


		vGroup.fulfillmentOptionsEDD.push({
			type: "DELIVERY",
			label: memberText.get("SO_DELIVERY"),
			edd: delivery.edd.format("YYYY-MM-DD"),
			estimatedShipDay: delivery.shipDay.format("YYYY-MM-DD"),
			estimatedShipCost: delivery.estimatedShipCost,
			enhancedEdd: memberText.get("SP_SAME_MARKET_DELIVERY_DATE").replace("%deliveryday%", day).replace("%month%", delivery.edd.format("M")).replace("%day%", delivery.edd.format("D"))
		});
	}
}




var determineLTLShipperAndEDD = async (variant, member, hoursAndCutoffs) => {

	//	Is this variant at a partner facility?  See if the partner can do local delivery to member's zip.
	if (variant.partnerFacility === 'Y') {
		var result = {
			mon: null,
			fri: null,
			edd: null,
			shipDay: moment().tz(hoursAndCutoffs.timezone), //	Default is today
			range: null,
			estimatedShipCost: 0
		}

		await partnerLTLFulfillment(variant, member, hoursAndCutoffs, result);
	} else {
		var result = {
			mon: null,
			fri: null,
			edd: moment().add(10, 'days'),
			shipDay: moment().add(2, 'days'),
			range: null,
			estimatedShipCost: 0
		}

		await ownedLTLFulfillment(variant, member, hoursAndCutoffs, result);
	}

	return result;

}


var partnerLTLFulfillment = async (variant, member, hoursAndCutoffs, result) => {
	var partnerDeliveryFlag = false;
	var zipCheck = await Partners.zipCheck(variant.storeId, variant.shipType, member.zip);    //	This is checking the handle_ flags and the zips in the partner tables
	if (zipCheck.length) {
		partnerDeliveryFlag = true;
	}

	//	Find the first day that boh personel are working and we're before delivery cutoff.
	findPartnerShipDay(result.shipDay, hoursAndCutoffs);

	// console.log("After findShipDay: " + shipDay.format("YYYY-MM-DD HH:MM"));

	//	If a local carrier will handle this, walk the dates to find the delivery day.
	if (partnerDeliveryFlag) {
		let localShipCost = await Partners.getLocalShipCost(variant.sku, variant.shipType, member.zip);
		if (localShipCost.length) {

			result.estimatedShipCost = localShipCost[0].extendedFlag ? localShipCost[0].ltlExtendedRate : localShipCost[0].ltlBaseRate;
			result.edd = findPartnerDeliveryDay(result.shipDay, hoursAndCutoffs, (variant.shipType === 'Small Parcel') ? hoursAndCutoffs.spTransitDays : hoursAndCutoffs.ltlTransitDays);
		}
	}
	
	if (result.estimatedShipCost === 0) {
		// console.log("Ship Day: " + shipDay.format("YYYY-MM-DD HH:MM"));
		result.estimatedShipCost = (variant.nationalShipCost !== null) ? variant.nationalShipCost : 0;
		result.edd = await eddCacheLookup(result.shipDay, variant.variantZip, member.zip);
	}

	return result;
}




var ownedLTLFulfillment = async (variant, member, hoursAndCutoffs, result) => {
	//	If a local carrier will handle this, walk the dates to find the delivery day.
	var carrier = await CarrierSelection.findEligibleCarrier(member.zip, variant.shipType, member.homeCityId, variant.variantCityId);
	if (carrier.length > 0) {
		result.estimatedShipCost = carrier[0].extendedFlag ? carrier[0].ltlExtendedRate : carrier[0].ltlBaseRate;

		var today = moment().tz('America/Chicago');
		result.mon = moment(today);
		result.fri = moment(today);

		//	If today not Sunday 
		if (today.day() !== 0) {
			result.mon.add(8 - today.day(), 'days');
			result.fri = moment(result.mon).add(4, 'days');
		}
		//	Sunday
		else {
			if (today.hour() >= 17) {
				result.mon.add(8, 'days');
				result.fri = moment(result.mon).add(4, 'days');
			} else {
				result.mon.add(1, 'days');
				result.fri = moment(result.mon).add(4, 'days');
			}
		}
		// console.log(today.day() + " " + today.hour() + " " + today.format('M/D/YYYY') + " " + delivery.mon.format('M/D/YYYY') + " " + delivery.fri.format('M/D/YYYY'));
		result.range = result.mon.format("MMM D") + "-" + result.fri.format("MMM D");

		//	Hard code to set the range messaging for locals outside of Omaha
		if (variant.variantCityId !== 1) {
			result.range = `in 2-5 business days`;
		}
		result.shipDay = result.mon;
	} else {
		result.estimatedShipCost = (variant.nationalShipCost !== null) ? variant.nationalShipCost : 0;
	}

	return result;
}

var determinePickupDay = async (delivery, variant, member, hoursAndCutoffs) => {
	var today = moment.tz(hoursAndCutoffs.timezone);
	var theDay = moment.tz(hoursAndCutoffs.timezone);
	var pickup = {
		pickupDay: "Today",
		pickupDate: new moment()
	}


	// console.log("Delivery EDD: " + delivery.edd.format('YYYY-MM-DD HH:MM'));
	// console.log("Market Delivery EDD: " + delivery.marketEdd.format('YYYY-MM-DD HH:MM'));
	// console.log(theDay.format("YYYY-MM-DD"));


	//	If delivery edd is not today, set time to morning so that day won't be skipped.
	if ((delivery.marketEdd != undefined) && (delivery.marketEdd.date() !== today.date())) {
		delivery.marketEdd.hour(10).minute(0);
	}


	if (rushHolidays === null) {
		rushHolidays = await RushOrders.loadHolidays();
	}


	if (variant.variantCityId === member.homeCityId) {
		//	Find the first day that pickup personel are working and we're before pickup cutoff.
		findPickupDay(theDay, hoursAndCutoffs, rushHolidays);
	} else {
		//	Start pickup day at delivery day assumming this is the day it would arrive in member's city.
		theDay = moment(delivery.edd);
		findPickupDay(theDay, hoursAndCutoffs, rushHolidays);
	}

	// console.log(theDay.format("YYYY-MM-DD HH:MM") + " " + today.format("YYYY-MM-DD HH:MM") + " " + theDay.diff(today, 'days') + " " + theDay.diff(today, 'hours'));
	if (theDay.date() === today.date()) {
		pickup.pickupDay = "Today";
	} else if ((theDay.diff(today, 'days') <= 1) && (theDay.diff(today, 'hours') <= 24)) {
		pickup.pickupDay = "Tomorrow";
	} else {
		pickup.pickupDay = theDay.format("dddd");
	}

	pickup.pickupDate = theDay;

	// console.log("Pickup day: " + pickup.pickupDay + " " + theDay.format("YYYY-MM-DD"));

	return pickup;
}



var determineSmallParcelShipperAndEDD = async (variant, member, hoursAndCutoffs) => {
	var result = {
		shipDay: moment().tz(hoursAndCutoffs.timezone), //	Default is today
		edd: null,
		estimatedShipCost: 0
	}

	// console.log("Start shipDay: " + shipDay.format("YYYY-MM-DD HH:MM"));

	//	Is this variant at a partner facility?  See if the partner can do local delivery to member's zip.
	//	This determines specific dates.   It is meant for FUTURE.
	if (variant.partnerFacility === 'Y') {
		await partnerFulfillment(variant, member, hoursAndCutoffs, result);
	} else {
		await ownedFulfillment(variant, member, hoursAndCutoffs, result);
	}

	return result;
}


var partnerFulfillment = async (variant, member, hoursAndCutoffs, result) => {
	var partnerDeliveryFlag = false;
	var zipCheck = await Partners.zipCheck(variant.storeId, variant.shipType, member.zip);    //	This is checking the handle_ flags and the zips in the partner tables
	if (zipCheck.length) {
		partnerDeliveryFlag = true;
	}

	//	Find the first day that boh personel are working and we're before delivery cutoff.
	findPartnerShipDay(result.shipDay, hoursAndCutoffs);

	// console.log("After findShipDay: " + shipDay.format("YYYY-MM-DD HH:MM"));

	//	If a local carrier will handle this, walk the dates to find the delivery day.
	if (partnerDeliveryFlag) {
		let localShipCost = await Partners.getLocalShipCost(variant.sku, variant.shipType, member.zip);
		if (localShipCost.length) {

			result.estimatedShipCost = localShipCost[0].extendedFlag ? (variant.numberOfBoxes * localShipCost[0].smallParcelExtendedRate) : (variant.numberOfBoxes * localShipCost[0].smallParcelBaseRate);
			if (localShipCost[0].extendedFlag) {
				if (result.estimatedShipCost > localShipCost[0].smallParcelExtendedRateMax) {
					result.estimatedShipCost = localShipCost[0].smallParcelExtendedRateMax;
				}
			}
			else {
				if (result.estimatedShipCost > localShipCost[0].smallParcelBaseRateMax) {
					result.estimatedShipCost = localShipCost[0].smallParcelBaseRateMax;
				}
			}
			result.edd = findPartnerDeliveryDay(result.shipDay, hoursAndCutoffs, (variant.shipType === 'Small Parcel') ? hoursAndCutoffs.spTransitDays : hoursAndCutoffs.ltlTransitDays);
		}
	}
	
	if (result.estimatedShipCost === 0) {
		// console.log("Ship Day: " + shipDay.format("YYYY-MM-DD HH:MM"));
		result.estimatedShipCost = (variant.nationalShipCost !== null) ? variant.nationalShipCost : 0;
		result.edd = await eddCacheLookup(result.shipDay, variant.variantZip, member.zip);
	}

	return result;
}


var ownedFulfillment = async (variant, member, hoursAndCutoffs, result) => {
	var carrier = null;

	//	If not a partner facility, see if there's a local carrier
	carrier = await CarrierSelection.findEligibleCarrier(member.zip, variant.shipType, member.homeCityId, variant.variantCityId);

	if (rushHolidays === null) {
		rushHolidays = await RushOrders.loadHolidays();
	}

	// Pad the ship day if necessary.
	applyFedExShipPad(result.shipDay);

	// console.log("padded ship date: " + shipDay.format("YYYY-MM-DD HH:MM"));

	//	Find the first day that boh personel are working and we're before delivery cutoff.
	findShipDay(result.shipDay, hoursAndCutoffs, rushHolidays);

	// console.log("After findShipDay: " + shipDay.format("YYYY-MM-DD HH:MM"));

	//	If a local carrier will handle this, walk the dates to find the delivery day.
	if (carrier.length > 0) {
		//	TODO no carrier holidays
		result.estimatedShipCost = variant.localShipCost;
		result.estimatedShipCost = carrier[0].extendedFlag ? (variant.numberOfBoxes * carrier[0].smallParcelExtendedRate) : (variant.numberOfBoxes * carrier[0].smallParcelBaseRate);
		if (carrier[0].extendedFlag) {
			if (result.estimatedShipCost > carrier[0].smallParcelExtendedRateMax) {
				result.estimatedShipCost = carrier[0].smallParcelExtendedRateMax;
			}
		}
		else {
			if (result.estimatedShipCost > carrier[0].smallParcelBaseRateMax) {
				result.estimatedShipCost = carrier[0].smallParcelBaseRateMax;
			}
		}


		carrier.holidays = await CarrierSelection.getCarrierHolidays(carrier[0].carrierId);
		result.edd = findDeliveryDay(result.shipDay, carrier);
	} else {
		// console.log("Ship Day: " + shipDay.format("YYYY-MM-DD HH:MM"));
		result.estimatedShipCost = (variant.nationalShipCost !== null) ? variant.nationalShipCost : 0;
		// var lastTime = showTimeDiff(`**** EDD:B:${variant.sku} ${shipDay.format("YYYY-MM-DD")} ${variant.variantZip} ${member.zip}`, lastTime);
		result.edd = await eddCacheLookup(result.shipDay, variant.variantZip, member.zip);
		// console.log("EDD " + variant.variantZip + " to " + member.zip + ": " + edd.format("YYYY-MM-DD HH:MM"));
		// lastTime = showTimeDiff(`**** EDD:A:${variant.sku} ${shipDay.format("YYYY-MM-DD")} ${variant.variantZip} ${member.zip} ${edd.format("YYYY-MM-DD")}`, lastTime);
	}

	return result;
}



var applyFedExShipPad = (shipDay) => {
	var shipPad = 0;
	if (configUtils.get("FEDEX_SHIP_PAD") !== null) {
		shipPad = parseInt(configUtils.get("FEDEX_SHIP_PAD"));
		if (isNaN(shipPad)) {
			shipPad = 0;
		}

		shipDay.add(shipPad, 'days');
	}
}


var eddCacheLookup = async (shipDay, fromZip, toZip) => {
	var cached = undefined;
	var edd = null;


	if (configUtils.get("EDD_CACHE") === "ON") {
		cached = _.find(globalEDDCache, function (c) {
			return (
				(c.shipDay.format("YYYY-MM-DD") === shipDay.format("YYYY-MM-DD")) &&
				(c.fromZip === fromZip) && (c.toZip === toZip));
		});
	}

	if (cached !== undefined) {
		// console.log("cache HIT!");
		return cached.edd;
	} else {
		edd = await fedex.calculateEDD((configUtils.get("FEDEX_TOGGLE") === "ON"), shipDay, {
			zip: fromZip
		}, {
			zip: toZip
		});

		if (configUtils.get("EDD_CACHE") === "ON") {
			globalEDDCache.push({
				shipDay: shipDay,
				fromZip: fromZip,
				toZip: toZip,
				edd: edd
			})
		}

		return edd;
	}
}



var getEDDCacheSize = (resp) => {
	resp.data.eddCacheSize = globalEDDCache.length;
}


var clearEDDCache = (resp) => {
	globalEDDCache = [];
	resp.data.eddCacheSize = globalEDDCache.length;
}


var findDeliveryDay = (shipDay, carrier) => {
	var bizDaysSkipped = 0;
	var edd = moment(shipDay);

	do {
		bizDaysSkipped++;
		// console.log("Advancing business day: " + bizDaysSkipped);
		bumpDeliveryDay(edd, carrier.holidays);

	} while (bizDaysSkipped < carrier[0].transitDays);

	// console.log("Carrier: " + carrier[0].name + " ship date: " + shipDay.format('M/D/YYYY') + " EDD date: " + edd.format('M/D/YYYY') + " week day " + edd.format('dddd'));

	return edd;
}


var findPartnerDeliveryDay = (shipDay, partnerInfo, transitDays) => {
	var bizDaysSkipped = 0;
	var edd = moment(shipDay);

	do {
		bizDaysSkipped++;
		// console.log("Advancing business day: " + bizDaysSkipped);
		bumpDeliveryDay(edd, partnerInfo.holidays);

	} while (bizDaysSkipped < transitDays);

	// console.log("Carrier: " + carrier[0].name + " ship date: " + shipDay.format('M/D/YYYY') + " EDD date: " + edd.format('M/D/YYYY') + " week day " + edd.format('dddd'));

	return edd;
}



var findPickupDay = (theDay, hoursAndCutoffs, holidays) => {
	var bumpFlag = false;


	var count = 0;


	do {
		var hour = hoursAndCutoffs.pickupCutoffCst.substring(0, 2);
		var min = hoursAndCutoffs.pickupCutoffCst.substring(3, 5);
		var pickupCutoffToday = moment(theDay).tz('America/Chicago').hour(hour).minute(min).second(0);
		// console.log("theDay: " + theDay.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss') + " pickup cutoff: " + pickupCutoffToday.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss') + "\n\n");

		// console.log(theDay.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss') + " " + JSON.stringify(hoursAndCutoffs.days[theDay.day()].pickup, undefined, 2));
		bumpFlag = false;

		//	Is this a pickup day?
		if (!hoursAndCutoffs.days[theDay.day()].pickup.openFlag) {
			// console.log("not pickup\n\n");
			bumpFlag = true;
			bumpPickupDay(theDay, hoursAndCutoffs);
		}
		//	Bump past holidays
		else if (isHoliday(theDay, holidays)) {
			// console.log("holiday\n\n");
			bumpFlag = true;
			bumpPickupDay(theDay, hoursAndCutoffs);
		}
		//	If we're in the pickup and but after cutoff bump it
		else if (theDay.tz('America/Chicago').isAfter(pickupCutoffToday)) {
			// console.log("after cutoff\n\n");
			bumpFlag = true;
			bumpPickupDay(theDay, hoursAndCutoffs);
		}

		//	Circuit breaker to prevent infinite loop if there's a timezone issue or something.
		count++;
		if (count > 21) {
			break;
		}

	}
	while (bumpFlag);

	// console.log("Pickup Day: " + theDay.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss'))
}


var findShipDay = (theDay, hoursAndCutoffs, holidays) => {
	var bumpFlag = false;
	var count = 0;

	do {
		var hour = hoursAndCutoffs.deliveryCutoffCst.substring(0, 2);
		var min = hoursAndCutoffs.deliveryCutoffCst.substring(3, 5);
		var deliveryCutoffToday = moment(theDay).tz('America/Chicago').hour(hour).minute(min).second(0);
		// console.log("Current day: " + theDay.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss') + " " + deliveryCutoffToday.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss'));

		// console.log(theDay.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss') + " " + JSON.stringify(hoursAndCutoffs.days[theDay.day()].backOfHouse, undefined, 2));
		bumpFlag = false;

		//	Is this a boh work day?
		if (!hoursAndCutoffs.days[theDay.day()].backOfHouse.openFlag) {
			// console.log("not boh day")
			bumpFlag = true;
			bumpShipDay(theDay, hoursAndCutoffs);
		}
		//	Bump past holidays
		else if (isHoliday(theDay, holidays)) {
			// console.log("holiday")
			bumpFlag = true;
			bumpShipDay(theDay, hoursAndCutoffs);
		}
		//	If we're in the boh window and but after cutoff bump it
		else if (theDay.tz('America/Chicago').isAfter(deliveryCutoffToday)) {
			// console.log("after cutoff")
			bumpFlag = true;
			bumpShipDay(theDay, hoursAndCutoffs);
		}

		//	Circuit breaker to prevent infinite loop if there's a timezone issue or something.
		count++;
		if (count > 21) {
			break;
		}
	}
	while (bumpFlag);

	// console.log("Ship Day: " + theDay.format('YYYY-MM-DD HH:mm:ss'))
}


var findPartnerShipDay = (theDay, hoursAndCutoffs) => {
	var bumpFlag = false;
	var bizCount = 0;
	var count = 0;
	var leadTimeCount = 0;


	//	Account for partner lead time.
	// theDay.add(hoursAndCutoffs.leadTime, 'days');

	do {
		var hour = hoursAndCutoffs.deliveryCutoffCst.substring(0, 2);
		var min = hoursAndCutoffs.deliveryCutoffCst.substring(3, 5);
		var deliveryCutoffToday = moment(theDay).tz('America/Chicago').hour(hour).minute(min).second(0);
		// console.log("Current day: " + theDay.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss') + " " + deliveryCutoffToday.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss'));

		// console.log(theDay.tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss') + " " + JSON.stringify(hoursAndCutoffs.days[theDay.day()].backOfHouse, undefined, 2));
		bumpFlag = false;

		//	Is this a boh work day?
		if (!hoursAndCutoffs.days[theDay.day()].backOfHouse.openFlag) {
			// console.log("not boh day")
			bumpFlag = true;
			bumpShipDay(theDay, hoursAndCutoffs);
		}
		//	Bump past holidays
		else if (isHoliday(theDay, hoursAndCutoffs.holidays)) {
			// console.log("holiday")
			bumpFlag = true;
			bumpShipDay(theDay, hoursAndCutoffs);
		}
		//	If we're in the boh window and but after cutoff bump it
		else if (theDay.tz('America/Chicago').isAfter(deliveryCutoffToday)) {
			// console.log("after cutoff")
			bumpFlag = true;
			bumpShipDay(theDay, hoursAndCutoffs);
		}
		// account for lead time
		else if (bizCount < hoursAndCutoffs.leadTime) {
			bizCount++;
			bumpFlag = true;
			bumpShipDay(theDay, hoursAndCutoffs);
		}

		//	Circuit breaker to prevent infinite loop if there's a timezone issue or something.
		count++;
		if (count > 21) {
			break;
		}
	}
	while (bumpFlag);

	// console.log("Ship Day: " + theDay.format('YYYY-MM-DD HH:mm:ss'))
}


//	Bump delivery day past carrier holidays and weekends.
var bumpDeliveryDay = (theDay, holidays) => {
	var bumpFlag = false;
	theDay.add(1, 'days');

	do {
		bumpFlag = false;
		//	Bump past weekends
		if ((theDay.weekday() === 0) || (theDay.weekday() === 6)) {
			// console.log("Skipping weekend: " + theDay.format('YYYY-MM-DD HH:mm:ss') + " week day " + theDay.weekday());
			bumpFlag = true;
			theDay.add(1, 'days');
		}
		//	Bump past holidays
		else if (isHoliday(theDay, holidays)) {
			// console.log("Skipping holiday: " + theDay.format('YYYY-MM-DD HH:mm:ss') + " week day " + theDay.weekday());
			bumpFlag = true;
			theDay.add(1, 'days');
		}
	}
	while (bumpFlag);

	// console.log("     now: " + theDay.format('YYYY-MM-DD HH:mm:ss'))
}


//	Bump the day and set the hour and minute to the start of the pickup hours for that day.
var bumpPickupDay = (theDay, hoursAndCutoffs) => {
	theDay.add(1, 'days');
	var open = moment(hoursAndCutoffs.days[theDay.day()].pickup.openTimestamp).tz(hoursAndCutoffs.timezone);
	theDay.hour(open.hour()).minute(open.minute()).second(0);
}



//	Bump the day and set the hour and minute to the start of the BoH hours for that day.
var bumpShipDay = (theDay, hoursAndCutoffs) => {
	theDay.add(1, 'days');
	var open = moment(hoursAndCutoffs.days[theDay.day()].backOfHouse.openTimestamp).tz(hoursAndCutoffs.timezone);
	theDay.hour(open.hour()).minute(open.minute()).second(0);
}


var isHoliday = (now, holidays) => {
	for (var i = 0; i < holidays.length; i++) {
		var h = moment(holidays[i].day).hour(now.hour()).minute(now.minute()).second(now.second());
		// console.log(now.month() + "/" + now.date() + " " + h.month() + "/" + h.date())
		if ((now.month() === h.month()) && (now.date() === h.date())) {
			return true;
		}
	}

	return false;
}




//
//	Pickup and Delivery Messaging
//
var populatePickupDeliveryMessaging = async (variant, vGroup, member, hoursAndCutoffs) => {
	var deliveryFlag = false;


	if (configUtils.get("GDE_TOGGLE") === "ON") {
		switch (variant.effectiveEligibility) {
			case 'SHIPPABLE':
			case null: //	This shouldn't happen but assume shippable if no eligibiltiy on a live item.
				deliveryFlag = true;
				break;

			case 'LOCAL_ONLY':
				if (vGroup.localCourierAvailable) {
					deliveryFlag = true;
				}
				break;

			case 'BOPIS_ONLY':
			case 'NOT_ELIGIBLE':
				break;
		}
	} else {
		deliveryFlag = true;
	}


	switch (variant.shipType) {
		case null:
		case '':
		case 'Small Parcel':
			//	Drop ship
			if (vGroup.dropshipFlag) {
				spPickupAndDeliveryDropship(variant, vGroup, member, hoursAndCutoffs, deliveryFlag);
			}
			//	Product and member in different markets
			else if ((variant.variantCityId !== member.homeCityId) && (variant.locationNumber !== variant.marketInfo.virtualLocation)) {
				await spPickupAndDeliveryDiffMarket(variant, vGroup, member, hoursAndCutoffs, deliveryFlag);
			}
			//	Product and member in same market
			else if ((variant.variantCityId === member.homeCityId) && (variant.locationNumber !== variant.marketInfo.virtualLocation)) {
				await spPickupAndDeliverySameMarket(variant, vGroup, member, hoursAndCutoffs, deliveryFlag);
			}
			break;


		case 'LTL':
			//	Drop ship
			if (variant.locationNumber === variant.marketInfo.virtualLocation) {
				vGroup.dropshipFlag = true;
				ltlPickupAndDeliveryDropship(variant, vGroup, member, hoursAndCutoffs, deliveryFlag);
			}
			//	Physical Location to Physical Location
			else if ((variant.variantCityId !== member.homeCityId) && (variant.locationNumber !== variant.marketInfo.virtualLocation)) {
				await ltlPickupAndDeliveryDiffMarket(variant, vGroup, member, hoursAndCutoffs, deliveryFlag);
			}
			//	Product and member in same market
			else if ((variant.variantCityId === member.homeCityId) && (variant.locationNumber !== variant.marketInfo.virtualLocation)) {
				await ltlPickupAndDeliverySameMarket(variant, vGroup, member, hoursAndCutoffs, deliveryFlag);
			}
			break;
	}

	//	If not in a box and requires assembly, add assembled messaging.
	if (variant.conditionName !== 'New') {
		if ((variant.inBox === 0) || (variant.inBox === '0') || (variant.inBox === null)) {
			if (variant.assemblyRequired === 'Y') {
				vGroup.assemblyMessage = memberText.get("ASSEMBLED");
			}
		}
	}
}



//
//	GET product by ID
//
var getByProductId = async (req, resp) => {
	var result = await RushProducts.getByProductId(req.params.id);
	if (result.length === 0) {
		formatResp(resp, undefined, 404, 'Product not found.')
	} else {
		resp.data = result[0]
	}
	return resp;
}



var purgeByCoin = async (req, resp) => {
	RushProducts.invalidateCoinInCacheByCoin(req.params.id);
}



var getStateByCoin = async (req, resp) => {
	var findProms = [];
	req.query.bypassFulfillmentOptionsFlag = true;
	req.query.onlyEligibleFlag = true;
	var rushProduct = await getByCoin(req, resp);
	if (rushProduct.statusCode !== 200) {
		resp.statusCode = 404;
		delete resp.data;
		return resp;
	}



	var products = "";
	for (var i = 0; i < rushProduct.data.rushProducts.variantGroups.length; i++) {

		//	If at least one variant group is eligibile, mark eligible.
		if (rushProduct.data.rushProducts.variantGroups[i].eligibility !== 'NOT_ELIGIBLE') {
			resp.data.eligibilityFlag = true;
		}

		for (var j = 0; j < rushProduct.data.rushProducts.variantGroups[i].variants.length; j++) {
			if (products.length > 0) {
				products += ", ";
			}
			products += rushProduct.data.rushProducts.variantGroups[i].variants[j].shopifyVariantId;
		}
	}

	var holds = await ProductHolds.countActiveByProductList(products);
	if (holds.length > 0) {
		resp.data.totalOnHold = holds[0].num;
	}

	delete resp.data.rushProducts;

	return resp;
}



var getBulkStateByCoin = async (req, resp) => {
	var coinList = [];
	var placeholders = '';
	var prom = [];
	var member = await getMember(req, resp);

	if (member === undefined) {
		return resp;
	}


	if (req.query.coinId) {
		if (req.query.coinId.indexOf(',') >= 0) {
			var s = _.split(req.query.coinId, ',')
			for (var i = 0; i < s.length; i++) {
				if (placeholders.length > 0) {
					placeholders += ', ';
				}
				placeholders += '?';
				coinList.push(s[i]);
			}
		} else {
			placeholders = '?'
			coinList.push(req.query.coinId);
		}
	}

	var coins = _.concat(coinList, coinList);

	var eligible = await RushProducts.getEligibileByCoin(member.homeCityId, coins, placeholders);
	var held = await RushProducts.getHeldByCoin(member.homeCityId, coins, placeholders);

	for (var i = 0; i < coinList.length; i++) {
		var state = {
			coinId: coinList[i],
			eligibilityFlag: false,
			totalOnHold: 0
		}

		//	Mark eligibility those coins with eligible skus for the zip
		if (_.find(eligible, function (e) {
				return e.id === coinList[i]
			}) !== undefined) {
			state.eligibilityFlag = true;
		}

		//	Mark number skus held for those coins with eligible skus for the zip
		var count = _.find(held, function (h) {
			return h.id === coinList[i]
		});

		if (count !== undefined) {
			state.totalOnHold = count.held;
		}

		resp.data.states.push(state);
	}

	return resp;
}


// var getBulkStateByCoinOriginal = async (req, resp) => {
// 	var prom = [];

// 	if (req.query.coinId) {
// 		if (req.query.coinId.indexOf(',') >= 0) {
// 			var s = _.split(req.query.coinId, ',')
// 			var placeholders = '';
// 			for (var i = 0; i < s.length; i++) {
// 				prom.push(sendStateRequest(req, s[i]));
// 			}
// 		} else {
// 			prom.push(sendStateRequest(req, req.query.coinId));
// 		}
// 	}

// 	var results = await Promise.all(prom);
// 	for (var i = 0; i < results.length; i++) {
// 		if (results[i].statusCode === 200) {
// 			resp.data.states.push({
// 				coinId: results[i].data.coinId,
// 				eligibilityFlag: results[i].data.eligibilityFlag,
// 				totalOnHold: results[i].data.totalOnHold
// 			})
// 		}
// 	}

// 	return resp;
// }


var sendStateRequest = async (req, coinId) => {
	var tempReq = _.cloneDeep(req);
	tempReq.params.id = coinId;

	var tempResp = {
		statusCode: 200,
		message: memberText.get('GET_SUCCESS'),
		data: {
			coinId: coinId,
			eligibilityFlag: false,
			totalOnHold: 0
		}
	}

	await getStateByCoin(tempReq, tempResp);

	return tempResp;
}



var limitedQuantityDSPurchase = async (shopifyVariantId, quantity) => {
	var sku = await RushProducts.getByShopifyVariantId(shopifyVariantId);

	if ((sku.length > 0) && (sku[0].manifestSource === 'DS') && (sku[0].dropshipType === 'LIMITED')) {
		await RushProducts.decrementLimitedDSQauntity(sku[0].sku, quantity);

		//	Deactivate the sku if we've sold through the quantity
		if ((sku[0].limitedQuantity - quantity) <= 0) {
			await RushProducts.deactivateLimitedDS(sku[0].sku);
		}

	}
}



var calculatePricing = async (req, resp) => {

	if (req.query.vendorId) {
		await calculatePricingByVendorSku(req.query.storeFlag, req.query.vendorId, req.query.vendorSku, req.query.pricingType, resp);
	} else if (req.query.sku) {
		await calculatePricingByRushSku(req.query.storeFlag, req.query.sku, req.query.pricingType, req.query.userId, req.query.userType, resp);
	}

}


var calculatePricingByRushSku = async (storeFlag, rushSku, pricingType, userId, userType, resp) => {
	var alwaysUpdateShopify = (configUtils.get("ALWAYS_UPDATE_SHOPIFY_ON_PRICING") === 'ON') ? true : false;
	var sku = null;
	var skuRows = await RushProducts.getSku(rushSku);
	if (skuRows.length === 0) {
		formatResp(resp, ["data"], 404, "Sku not found.");
		return;
	} else {
		sku = skuRows[0];
	}
	

	//	If the price has been overridden for this sku, jump out.
	if (sku.manualPriceOverride === 'Y') {
		return;
	}

	//	For now only doing pricing logic for LIMITED QTY DS skus
	if (sku.dropshipType === 'LIMITED') {
		var fromPrice = sku.price;
		var fromCost = sku.cost;
		var gdeShipCost = undefined;
		var pricingTypeId = sku.pricingTypeId;

		var shipCostRow = await GDE.getMaxShipCost(sku.sku);
		if (shipCostRow.length) {
			gdeShipCost = shipCostRow[0].shipCost;
		} 

		await calculatePricingByVendorSku(sku.vendorId, sku.sellerProductId, 'LIMITED_QTY_DS', resp, gdeShipCost);
		if (resp.statusCode === 200) {
			resp.data.vendorId = sku.vendorId;
			resp.data.vendorSku = sku.sellerProductId;


			if ((storeFlag) && ((storeFlag === "true") || (storeFlag === true))) {
				var priceUpdatedFlag = await updatePriceAndCost(rushSku, fromPrice, resp.data.partnerSellingPrice, fromCost, resp.data.productCost, sku.pricingTypeId, userId, userType);

				if (priceUpdatedFlag || alwaysUpdateShopify) {
					try {
						var si = shopifyUtils.getCityInfoByCity("Omaha");
						var variant = await si.shopify.productVariant.get(sku.shopifyVariantId);
						var result = await si.shopify.productVariant.update(sku.shopifyVariantId, {
							price: resp.data.partnerSellingPrice
						});
					} catch (e) {
						if (!e.message.startsWith('Response code 404')) {
							await logUtils.log({
								severity: 'ERROR',
								type: 'PRICING',
								message: `Params: ${variant.sku} ${sku.shopifyVariantId} from: ${variant.price} to: ${resp.data.partnerSellingPrice}`,
								stackTrace: new Error().stack
							})
						}
					}
				}
			}
		}
	}
}



var updatePriceAndCost = async (sku, fromPrice, toPrice, fromCost, toCost, pricingTypeId, userId, userType) => {
	if ((!userId) || (userId === 'undefined')) {
		userId = 0;
	}
	if ((!userType) || (userType === 'undefined')) {
		userType = 'INTERNAL';
	}


	if ((toPrice) && (toPrice !== fromPrice)) {
		await GDE.updateProductPrice(sku, pricingTypeId, fromPrice, toPrice, userId, userType);
	}

	if ((toCost) && (toCost !== fromCost)) {
		await GDE.updateProductCost(sku, toCost);
	}

	return (toPrice !== fromPrice);
}




var calculatePricingByVendorSku = async (vendorId, vendorSku, pricingType, resp, gdeShipCost) => {

	//	Only calculates price for limited quantity DS for now.
	if (pricingType !== 'LIMITED_QTY_DS') {
		formatResp(resp, ["data"], 409, "This pricing type not supported at this time.");
		return;
	}

	var ceiling = 0;
	var floor = 0;
	var sellingPrice = 0;
	var createDSCompareDiscount = parseInt(configUtils.get("CREATE_DS_COMPARE_DISCOUNT")) / 100;
	var createDSCompareMargin = parseInt(configUtils.get("CREATE_DS_COMPARE_MARGIN")) / 100;
	var createDSComparePrice = parseInt(configUtils.get("CREATE_DS_COMPARE_PRICE")) / 100;
	var createDSMSRPDiscount = parseInt(configUtils.get("CREATE_DS_MSRP_DISCOUNT")) / 100;
	var createDSMSRPMargin = parseInt(configUtils.get("CREATE_DS_MSRP_MARGIN")) / 100;
	var createDSMSRPPrice = parseInt(configUtils.get("CREATE_DS_MSRP_PRICE")) / 100;
	var shipCost = gdeShipCost ? gdeShipCost : 0.0;
	var vendorProduct = null;
	var vsku = await Vendors.getByVendorSku(vendorId, vendorSku);
	if (vsku.length === 0) {
		formatResp(resp, ["data"], 404, "Vendor Catalog Product not found.");
		return;
	} else {
		vendorProduct = vsku[0];
	}

	if (!gdeShipCost) {
		var shipCostRow = await VCGDE.getMaxShipCost(vendorId, vendorSku);
		if (shipCostRow === 0) {
			formatResp(resp, ["data"], 409, "No ship cost available.");
			return;
		} else {
			if (shipCost !== null) {
				//	Set highest national ship cost across regions
				shipCost = shipCostRow[0].shipCost;
			}
		}
	}

	if (!vendorProduct.eligibleForDropship) {
		formatResp(resp, ["data"], 409, "Vendor Catalog Product is not eligible for Drop Ship.");
		return;
	}

	//	Adjust product cost with discount off wholesale
	vendorProduct.productCost = Math.round(((vendorProduct.productCost) * (1 - (vendorProduct.dsPercentOffWholesale / 100))) * 100) / 100;

	var compare = vendorProduct.partnerSellingPrice;
	var msrp = vendorProduct.msrp;

	//	RM-3355 Updates
	if (compare && (compare === msrp)) {
		floor = ((vendorProduct.productCost + shipCost) / (1 - createDSCompareMargin));
		sellingPrice = floor;
	} else if (compare && (compare < msrp)) {
		ceiling = (compare * (1 - createDSCompareDiscount));
		floor = ((vendorProduct.productCost + shipCost) / (1 - createDSCompareMargin));
		sellingPrice = ((ceiling - floor) * createDSComparePrice) + floor;
	} else if (msrp) {
		ceiling = msrp * (1 - createDSMSRPDiscount);
		floor = (vendorProduct.productCost + shipCost) / (1 - createDSMSRPMargin);
		sellingPrice = ((ceiling - floor) * createDSMSRPPrice) + floor;
	} else {
		formatResp(resp, ["data"], 409, "Vendor Catalog Product has no Partner Selling Price or MSRP.");
		return;
	}

	//	Round up to nearest dollar and subtract a penny
	sellingPrice = Math.ceil(sellingPrice) - 0.01;

	vendorProduct.shipToMarketPrice = sellingPrice;

	resp.data.partnerSellingPrice = vendorProduct.shipToMarketPrice;
	resp.data.productCost = vendorProduct.productCost;
	// resp.data.vendorProduct = vendorProduct;

	resp.message = `Selling Price: ${sellingPrice}... `;
}



module.exports = {
	calculatePricing,
	clearEDDCache,
	getAll,
	getAllProducts,
	getAllProductsLite,
	getAllRRC,
	getBulkStateByCoin,
	getByCoin,
	getByProductId,
	getEDDCacheSize,
	getMember,
	getStateByCoin,
	limitedQuantityDSPurchase,
	purgeByCoin
}
