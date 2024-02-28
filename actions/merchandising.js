'use strict';

const _ = require('lodash');

const configUtils = require('../utils/configUtils');
const {
	formatResp
} = require('../utils/response');

const Merchandising = require('../models/merchandising');
const CategoryProducts = require('../models/categoryProducts');
const Members = require('../models/members');
const RushProducts = require('../models/rushProducts');
const Vendors = require('../models/vendors');
const ZipToCity = require('../models/zipToCity');




var getTurbo = async (req, resp, clusterOffset, clusterLimit, productLimit, sortBy, bypassGDE, includeArchived, includeProductConditions) => {
	var o = (clusterOffset !== undefined) ? clusterOffset : 0;
	var destCityId = 0;
	var prom = [];


	if (req.query.zip !== undefined) {
		var destCity = await ZipToCity.lookupCity(req.query.zip);
		if (destCity.length === 0) {
			formatResp(resp, undefined, 404, "No merchandising data found.")
			delete resp.data;
			return resp;
		} else {
			destCityId = destCity[0].city_id;
		}
	} else if ((req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
		var mbr = await Members.getById(req.decoded.memberId);
		if (mbr.length === 0) {
			formatResp(resp, undefined, 404, "No merchandising data found.")
			delete resp.data;
			return resp;
		} else {
			destCityId = mbr[0].homeCityId;
		}
	}


	var context = {
		coins: '',
		pfRequested: 0,
		totalProducts: 0,
		vendorSkus: [],
		vendorSkuPlaceholders: ''
	}

	var lastTime = showTimeDiff('Start', lastTime);
	// var merch = await Merchandising.get(req.query.lapName, req.query.lapId, req.query.clusterId, sortBy, (clusterLimit === 0), bypassGDE, req.query.sku, includeArchived);

	var merch = await constructLapsAndClusters(lastTime, context, req.query.lapName, req.query.lapId, req.query.clusterId, sortBy, clusterOffset, clusterLimit, includeArchived, destCityId, resp);

	if (merch.length === 0) {
		formatResp(resp, undefined, 404, "No merchandising data found.")
		delete resp.data;
		return resp;
	}


	lastTime = showTimeDiff('Pre-Offset-Limit', lastTime);

	//	Limit and offset manipulation
	if (resp.data.laps !== undefined) {
		for (var i = 0; i < resp.data.laps.length; i++) {
			var l = (clusterLimit !== undefined) ? clusterLimit : 100;
			if ((l + o) >= resp.data.laps[i].clusters.length) {
				l = resp.data.laps[i].clusters.length;
			}

			var clen = resp.data.laps[i].clusters.length;
			for (var j = 0; j < clen; j++) {
				if (j < o) {
					resp.data.laps[i].clusters.shift();
				}

				if (j >= (o + l)) {
					resp.data.laps[i].clusters.pop();
				}
			}
		}
	}
	lastTime = showTimeDiff('Post-Offset-Limit', lastTime);


	if (clusterLimit > 0) {
		await constructProducts(lastTime, context, productLimit, bypassGDE, req.query.sku, sortBy, resp);
	}

	//	prom:
	//	EligibleQuantity
	//	Member likes by COIN (disabled)
	//	Pull Forward Products by COIN
	//	Conditions by COIN
	var quantityPromises = prom.length;

	lastTime = showTimeDiff('Pre-Lookups', lastTime);

	//	TODO include vendor ID in eligible quantity lookup
	//	Have to pull quantity seperately because merchandising doesn't care about live and online, but eligible quantity does.
	if (context.vendorSkus.length) {
		prom.push(RushProducts.getEligibleQuantityByVendorSkus(context, destCityId));
	}

	if (context.coins.length > 0) {
		// prom.push(Members.countFindsByCoins(coins));
		prom.push(Vendors.getPullForwardProductByCoins(context.coins));
		if (includeProductConditions) {
			prom.push(conditionsByCoins(context.coins));
		}
	}


	var results = await Promise.all(prom);
	var quantityResults = [];
	if (context.vendorSkus.length) {
		quantityResults = results[0];
	}

	// var findResults = [];
	var pfResults = [];
	var conditionResults = [];

	if (context.coins.length > 0) {
		// findResults = results[1];
		pfResults = results[1];
		if (includeProductConditions) {
			conditionResults = results[2].conditions;
		}
	}

	prom = [];

	for (var i = 0; i < resp.data.laps.length; i++) {
		for (var j = 0; j < resp.data.laps[i].clusters.length; j++) {
			for (var k = 0; k < resp.data.laps[i].clusters[j].products.length; k++) {

				//	Populate eligible quantity;
				var obj = _.find(quantityResults, function (o) {
					return o.vendorSku === resp.data.laps[i].clusters[j].products[k].vendorSku;
				})

				if (obj !== undefined) {
					resp.data.laps[i].clusters[j].products[k].quantity = obj.quantity;
				}


				// //	Populate total likes
				// if (resp.data.laps[i].clusters[j].products[k].coinId !== null) {
				// 	//	If we can find the coinId in the results, store the totalLikes.
				// 	var obj = _.find(findResults, function (o) {
				// 		return o.coinId === resp.data.laps[i].clusters[j].products[k].coinId;
				// 	})

				// 	if (obj !== undefined) {
				// 		resp.data.laps[i].clusters[j].products[k].totalLikes = obj.num;

				// 	}
				// }


				//	Populate data from pull forward vendor sku
				if (resp.data.laps[i].clusters[j].products[k].coinId !== null) {
					//	If we can find the coinId in the results, store the totalLikes.
					var obj = _.find(pfResults, function (o) {
						return o.coinId === resp.data.laps[i].clusters[j].products[k].coinId;
					})

					if (obj !== undefined) {
						if ((obj.msrp !== undefined) && (obj.msrp !== null)) {
							resp.data.laps[i].clusters[j].products[k].msrp = obj.msrp;
						}
						if ((obj.productName !== undefined) && (obj.productName !== null)) {
							resp.data.laps[i].clusters[j].products[k].name = obj.productName;
						}
					}
				}


				if (includeProductConditions) {
					//	Populate conditions
					if (resp.data.laps[i].clusters[j].products[k].coinId !== null) {
						//	If we can find the vendor sku in the results, store the conditions.
						var obj = _.find(conditionResults, function (o) {
							return o.vendorSku === resp.data.laps[i].clusters[j].products[k].vendorSku;
						})

						if (obj !== undefined) {
							resp.data.laps[i].clusters[j].products[k].conditions = obj.conditions;

						}
					}
				}

			}
		}
	}

	lastTime = showTimeDiff('Post-Lookups', lastTime);


	lastTime = showTimeDiff('Pre-0 Qantity Prune', lastTime);

	//	If GDE active, remove skus with 0 quantity
	if ((configUtils.get("GDE_TOGGLE") === "ON") && (resp.data.laps !== undefined) && (bypassGDE === undefined)) {
		for (var i = 0; i < resp.data.laps.length; i++) {
			for (var j = 0; j < resp.data.laps[i].clusters.length; j++) {
				// console.log("removing product");
				_.remove(resp.data.laps[i].clusters[j].products, function (b) {
					return b.quantity === 0;
				});
			}
		}
	}

	lastTime = showTimeDiff('Post-0 Qantity Prune', lastTime);



	return resp;
};


var constructLapsAndClusters = async (lastTime, context, lapName, lapId, clusterId, sortBy, clusterOffset, clusterLimit, includeArchived, destCityId, resp) => {
	//	Pull laps and clusters without limits so we can get cluster totals
	var merch = await Merchandising.getLapsAndClusters(lapName, lapId, clusterId, sortBy, clusterOffset, clusterLimit, includeArchived, destCityId);

	//	SOCIAL, VIGNETTE and NEW_ARRIVAL clusters are associated with destination cities.
	await filterByDestCity(lastTime, merch, destCityId);


	resp.data.laps = [];
	var product = {};
	var lastProduct = null;
	var cluster = {};
	var lastCluster = null;
	var lastLap = null;
	var lap = {};
	var clusterProductCount = 0;


	lastTime = showTimeDiff('Pre-JSON Loop', lastTime);
	for (var i = 0; i < merch.length; i++) {

		//	See if we're starting a new lap.
		if (lastLap !== merch[i].lapName) {
			if ((product.name !== undefined) && ((productLimit === undefined) || (cluster.products.length < productLimit))) {
				cluster.products.push(product);
				cluster.totalProducts = cluster.products.length;
			}
			if (cluster.name !== undefined) {
				lap.clusters.push(cluster);
				lap.totalClusters = lap.clusters.length;
			}
			if (lap.name !== undefined) {
				resp.data.laps.push(lap);
			}

			lastLap = merch[i].lapName;

			//	Start new lap.
			lap = {};
			cluster = {};
			lastCluster = null;
			product = {};
			lastProduct = null;

			lap.id = merch[i].lapId;
			lap.name = merch[i].lapName;
			lap.shopifyStoreId = merch[i].shopifyStoreId;
			lap.storeId = merch[i].storeId;
			lap.storeName = merch[i].storeName;
			lap.lastRefresh = merch[i].lastRefresh;
			lap.nextRefresh = merch[i].nextRefresh;
			lap.clusters = [];
		}

		//	See if we're starting a new cluster.
		if (lastCluster !== merch[i].clusterId) {
			if (product.name !== undefined) {
				if ((productLimit === undefined) || (cluster.products.length < productLimit)) {
					cluster.products.push(product);
					cluster.totalProducts = cluster.products.length;
				}
				cluster.totalProducts = cluster.products.length;
			}
			if (cluster.name !== undefined) {
				lap.clusters.push(cluster);
			}

			lastCluster = merch[i].clusterId;

			cluster = {};
			product = {};
			lastProduct = null;

			cluster.id = merch[i].clusterId;
			cluster.targetedCitiesId = merch[i].targetedCitiesId;
			cluster.name = merch[i].clusterName;
			cluster.position = merch[i].clusterPosition;
			cluster.type = merch[i].clusterType;
			cluster.image1 = merch[i].clusterImage1;
			cluster.image2 = merch[i].clusterImage2;
			cluster.expirationDate = merch[i].clusterExpirationDate;
			cluster.products = [];
		}

	}

	if ((product.name !== undefined) && ((productLimit === undefined) || (cluster.products.length < productLimit))) {
		cluster.products.push(product);
		cluster.totalProducts = cluster.products.length;
	}

	if (cluster.name !== undefined) {
		lap.clusters.push(cluster);
		lap.totalClusters = lap.clusters.length;
	}

	if (lap.name !== undefined) {
		resp.data.laps.push(lap);
	}

	lastTime = showTimeDiff('Post-JSON Loop', lastTime);

	return merch;
}



var constructProducts = async (lastTime, context, productLimit, bypassGDE, sku, sortBy, resp) => {
	var clusterIds = '';
	var pricingTypes = await Merchandising.getPricingTypes();

	for (var i = 0; i < resp.data.laps.length; i++) {
		for (var j = 0; j < resp.data.laps[i].clusters.length; j++) {
			if (clusterIds.length > 0) {
				clusterIds += ',';
			}

			clusterIds += resp.data.laps[i].clusters[j].id;
		}
	}

	if (clusterIds.length > 0) {
		var lastProduct = null;
		var product = {};
		var prods = await Merchandising.getProducts(clusterIds, sortBy, sku);
		var prodCount = 0;

		for (var i = 0; i < resp.data.laps.length; i++) {
			for (var j = 0; j < resp.data.laps[i].clusters.length; j++) {

				while ((prodCount < prods.length) && (prods[prodCount].clusterId === resp.data.laps[i].clusters[j].id)) {
					//	See if we're starting a new product.
					if ((lastProduct !== prods[prodCount].name) && ((productLimit === undefined) || (resp.data.laps[i].clusters[j].products.length < productLimit))) {
						if (product.name !== undefined) {
							resp.data.laps[i].clusters[j].products.push(product);
							resp.data.laps[i].clusters[j].totalProducts = resp.data.laps[i].clusters[j].products.length;
						}

						lastProduct = prods[prodCount].name;

						product = {};

						product.name = prods[prodCount].name;
						product.onlineQuickSale = prods[prodCount].onlineQuickSale;
						if (product.onlineQuickSale === 'Y') {
							product.conditions = [{
								name: prods[prodCount].conditionName,
								price: prods[prodCount].price
							}];
						} else {
							product.conditions = [];
						}
						// product.productId = prods[prodCount].productId;
						product.sku = prods[prodCount].sku;
						product.vendorSku = prods[prodCount].sellerProductId;
						product.coinId = prods[prodCount].coinId;
						product.dropshipFlag = ((prods[prodCount].manifestSource === 'DS') || (prods[prodCount].manifestSource === 'STS')) ? true : false;
						product.shopifyVariantId = prods[prodCount].shopifyVariantId;
						product.position = prods[prodCount].bubblePosition;
						product.msrp = prods[prodCount].msrp;
						product.marketPrice = prods[prodCount].marketPrice;
						product.price = prods[prodCount].price;
						product.quantity = 0;
						product.pricingTypeId = prods[prodCount].pricingTypeId;
						product.pricingType = pricingTypes[_.findIndex(pricingTypes, function (pt) {
							return pt.pricingTypeId == product.pricingTypeId;
						})] ? pricingTypes[_.findIndex(pricingTypes, function (pt) {
							return pt.pricingTypeId == product.pricingTypeId;
						})].pricingType : '';
						product.images = [prods[prodCount].image];
						product.status = prods[prodCount].status;
						product.onlineShopping = prods[prodCount].onlineShopping;
						product.conditionName = prods[prodCount].conditionName;
						product.freshnessScore = prods[prodCount].freshnessScore;
						product.frontEndName = prods[prodCount].frontEndName;
						product.frontEndSpace = prods[prodCount].frontEndSpace;
						product.totalLikes = prods[prodCount].likes;

						//	If GDE active, keep a list of vendor skus
						if (configUtils.get("GDE_TOGGLE") === "ON") {
							if (context.vendorSkuPlaceholders.length > 0) {
								context.vendorSkuPlaceholders += ', ';
							}
							context.vendorSkuPlaceholders += `?`;
							context.vendorSkus.push(prods[prodCount].sellerProductId);
						}

						//	Keep a list of COINS for non-quick sales.
						if (product.onlineQuickSale === 'N') {
							context.pfRequested++;
							product.pfRequested = true;
							if (context.coins.length > 0) {
								context.coins += ', ';
							}
							context.coins += `'${prods[prodCount].coinId}'`;
						}

					}

					prodCount++;
				}

				// Push last product in the cluster
				if ((product.name !== undefined) && ((productLimit === undefined) || (resp.data.laps[i].clusters[j].products.length < productLimit))) {
					resp.data.laps[i].clusters[j].products.push(product);
					resp.data.laps[i].clusters[j].totalProducts = resp.data.laps[i].clusters[j].products.length;
					product = {}
				}
			}
		}
	}
}



var filterByDestCity = async (lastTime, merch, destCityId) => {
	var filterableClustersVignette = await Merchandising.getVignetteClustersByCity(destCityId);
	var filterableClustersSocial = await Merchandising.getSocialClustersByCity(destCityId);
	var filterableClustersNewArrival = await Merchandising.getNewArrivalClustersByCity(destCityId);

	lastTime = showTimeDiff(`Pre-Cluster Filter - Length: ${merch.length}`, lastTime);

	for (var i = 0; i < merch.length; i++) {

		//	Filter VIGNETTES by city
		if (merch[i].clusterType === 'VIGNETTE') {
			if (_.findIndex(filterableClustersVignette, function (c) {
					return c === merch[i].clusterId;
				}) === -1) {
				var preLength = merch.length;
				_.remove(merch, function (c) {
					return c.clusterId === merch[i].clusterId
				});
				var postLength = merch.length;
				if (postLength !== preLength) {
					i = -1;
				}
			}
		}

		//	Filter NEW_ARRIVAL clusters by city
		if (i > -1) {
			if (merch[i].clusterType === 'NEW_ARRIVAL') {
				if (_.findIndex(filterableClustersNewArrival, function (c) {
						return c === merch[i].clusterId;
					}) === -1) {
					var preLength = merch.length;
					_.remove(merch, function (c) {
						return c.clusterId === merch[i].clusterId
					});
					var postLength = merch.length;
					if (postLength !== preLength) {
						i = -1;
					}
				}
			}
		}

		//	Filter SOCIAL clusters by city
		if (i > -1) {
			if (merch[i].clusterType === 'SOCIAL') {
				if (_.findIndex(filterableClustersSocial, function (c) {
						return c === merch[i].clusterId;
					}) === -1) {
					var preLength = merch.length;
					_.remove(merch, function (c) {
						return c.clusterId === merch[i].clusterId
					});
					var postLength = merch.length;
					if (postLength !== preLength) {
						i = -1;
					}
				}
			}
		}

	}

	lastTime = showTimeDiff(`Post-Cluster Filter - Length: ${merch.length}`, lastTime);
}






var get = async (req, resp, offset, limit, productLimit, sortBy, bypassGDE, includeArchived, includeProductConditions) => {
	var o = (offset !== undefined) ? offset : 0;
	var pfRequested = 0;


	var destCityId = 0;
	var prom = [];


	if (req.query.zip !== undefined) {
		var destCity = await ZipToCity.lookupCity(req.query.zip);
		if (destCity.length === 0) {
			formatResp(resp, undefined, 404, "No merchandising data found.")
			delete resp.data;
			return resp;
		} else {
			destCityId = destCity[0].city_id;
		}
	} else if ((req.decoded !== undefined) && (req.decoded.memberId !== undefined)) {
		var mbr = await Members.getById(req.decoded.memberId);
		if (mbr.length === 0) {
			formatResp(resp, undefined, 404, "No merchandising data found.")
			delete resp.data;
			return resp;
		} else {
			destCityId = mbr[0].homeCityId;
		}
	}

	var lastTime = showTimeDiff('Start', lastTime);
	//	TODO Execute these asynchronously
	var pricingTypes = await Merchandising.getPricingTypes();
	var merch = await Merchandising.get(req.query.lapName, req.query.lapId, req.query.clusterId, sortBy, (limit === 0), bypassGDE, req.query.sku, includeArchived);
	var filterableClustersSocialAndVignette = await Merchandising.getClustersByCity(destCityId);
	var filterableClustersNewArrival = await Merchandising.getNewArrivalClustersByCity(destCityId);


	lastTime = showTimeDiff(`Pre-Cluster Filter - Length: ${merch.length}`, lastTime);

	for (var i = 0; i < merch.length; i++) {

		//	Filter SOCIAL and VIGNETTES by city
		if ((merch[i].clusterType === 'SOCIAL') || (merch[i].clusterType === 'VIGNETTE')) {
			if (_.findIndex(filterableClustersSocialAndVignette, function (c) {
					return c === merch[i].clusterId;
				}) === -1) {
				var preLength = merch.length;
				_.remove(merch, function (c) {
					return c.clusterId === merch[i].clusterId
				});
				var postLength = merch.length;
				if (postLength !== preLength) {
					i = -1;
				}
			}
		}

		//	Filter NEW_ARRIVAL clusters by city
		if (i > -1) {
			if (merch[i].clusterType === 'NEW_ARRIVAL') {
				if (_.findIndex(filterableClustersNewArrival, function (c) {
						return c === merch[i].clusterId;
					}) === -1) {
					var preLength = merch.length;
					_.remove(merch, function (c) {
						return c.clusterId === merch[i].clusterId
					});
					var postLength = merch.length;
					if (postLength !== preLength) {
						i = -1;
					}
				}
			}
		}
	}

	lastTime = showTimeDiff(`Post-Cluster Filter - Length: ${merch.length}`, lastTime);


	if (merch.length === 0) {
		formatResp(resp, undefined, 404, "No merchandising data found.")
		delete resp.data;
		return resp;
	}

	var coins = '';
	var vendorSkus = '';
	var totalProducts = 0;

	resp.data.laps = [];
	var product = {};
	var cluster = {};
	var lastProduct = null;
	var lastCluster = null;
	var lastLap = null;
	var lap = {};
	var clusterProductCount = 0;

	// console.log(`merch length: ${merch.length}`);
	lastTime = showTimeDiff('Pre-JSON Loop', lastTime);
	for (var i = 0; i < merch.length; i++) {

		//	See if we're starting a new lap.
		if (lastLap !== merch[i].lapName) {
			if ((product.name !== undefined) && ((productLimit === undefined) || (cluster.products.length < productLimit))) {
				cluster.products.push(product);
				cluster.totalProducts = cluster.products.length;
			}
			if (cluster.name !== undefined) {
				lap.clusters.push(cluster);
				lap.totalClusters = lap.clusters.length;
			}
			if (lap.name !== undefined) {
				resp.data.laps.push(lap);
			}

			lastLap = merch[i].lapName;

			//	Start new lap.
			lap = {};
			cluster = {};
			lastCluster = null;
			product = {};
			lastProduct = null;

			lap.id = merch[i].lapId;
			lap.name = merch[i].lapName;
			lap.shopifyStoreId = merch[i].shopifyStoreId;
			lap.storeId = merch[i].storeId;
			lap.storeName = merch[i].storeName;
			lap.lastRefresh = merch[i].lastRefresh;
			lap.nextRefresh = merch[i].nextRefresh;
			lap.clusters = [];
		}

		//	See if we're starting a new cluster.
		if (lastCluster !== merch[i].clusterId) {
			if (product.name !== undefined) {
				if ((productLimit === undefined) || (cluster.products.length < productLimit)) {
					cluster.products.push(product);
					cluster.totalProducts = cluster.products.length;
				}
				cluster.totalProducts = cluster.products.length;
			}
			if (cluster.name !== undefined) {
				lap.clusters.push(cluster);
			}

			lastCluster = merch[i].clusterId;

			cluster = {};
			product = {};
			lastProduct = null;

			cluster.id = merch[i].clusterId;
			cluster.name = merch[i].clusterName;
			cluster.position = merch[i].clusterPosition;
			cluster.type = merch[i].clusterType;
			cluster.image1 = merch[i].clusterImage1;
			cluster.image2 = merch[i].clusterImage2;
			cluster.expirationDate = merch[i].clusterExpirationDate;
			cluster.products = [];
		}

		//	See if we're starting a new product.
		if ((lastProduct !== merch[i].name) && ((productLimit === undefined) || (cluster.products.length < productLimit))) {
			if (product.name !== undefined) {
				cluster.products.push(product);
				cluster.totalProducts = cluster.products.length;
			}

			lastProduct = merch[i].name;

			product = {};

			product.name = merch[i].name;
			product.onlineQuickSale = merch[i].onlineQuickSale;
			if (product.onlineQuickSale === 'Y') {
				product.conditions = [{
					name: merch[i].conditionName,
					price: merch[i].price
				}];
			} else {
				product.conditions = [];
			}
			product.sku = merch[i].sku;
			product.vendorSku = merch[i].sellerProductId;
			product.coinId = merch[i].coinId;
			product.dropshipFlag = ((merch[i].manifestSource === 'DS') || (merch[i].manifestSource === 'STS')) ? true : false;
			product.shopifyVariantId = merch[i].shopifyVariantId;
			product.position = merch[i].bubblePosition;
			product.msrp = merch[i].msrp;
			product.marketPrice = merch[i].marketPrice;
			product.price = merch[i].price;
			product.quantity = 0;
			product.pricingTypeId = merch[i].pricingTypeId;
			product.pricingType = pricingTypes[_.findIndex(pricingTypes, function (pt) {
				return pt.pricingTypeId == product.pricingTypeId;
			})] ? pricingTypes[_.findIndex(pricingTypes, function (pt) {
				return pt.pricingTypeId == product.pricingTypeId;
			})].pricingType : '';
			product.images = [merch[i].image];
			product.status = merch[i].status;
			product.onlineShopping = merch[i].onlineShopping;
			product.conditionName = merch[i].conditionName;
			product.freshnessScore = merch[i].freshnessScore;
			product.frontEndName = merch[i].frontEndName;
			product.frontEndSpace = merch[i].frontEndSpace;
			product.totalLikes = merch[i].likes;

			//	If GDE active, keep a list of vendor skus
			if (configUtils.get("GDE_TOGGLE") === "ON") {
				if (vendorSkus.length > 0) {
					vendorSkus += ', ';
				}
				vendorSkus += `'${merch[i].sellerProductId}'`
			}

			//	Keep a list of COINS for non-quick sales.
			if (product.onlineQuickSale === 'N') {
				pfRequested++;
				product.pfRequested = true;
				if (coins.length > 0) {
					coins += ', ';
				}
				coins += `'${merch[i].coinId}'`;
			}

		}
	}

	if ((product.name !== undefined) && ((productLimit === undefined) || (cluster.products.length < productLimit))) {
		cluster.products.push(product);
		cluster.totalProducts = cluster.products.length;
	}

	if (cluster.name !== undefined) {
		lap.clusters.push(cluster);
		lap.totalClusters = lap.clusters.length;
	}

	if (lap.name !== undefined) {
		resp.data.laps.push(lap);
	}

	lastTime = showTimeDiff('Post-JSON Loop', lastTime);


	//	prom:
	//	EligibleQuantity
	//	Member likes by COIN (disabled)
	//	Pull Forward Products by COIN
	//	Conditions by COIN
	var quantityPromises = prom.length;

	lastTime = showTimeDiff('Pre-Lookups', lastTime);

	//	TODO include vendor ID in eligible quantity lookup
	//	Have to pull quantity seperately because merchandising doesn't care about live and online, but eligible quantity does.
	prom.push(RushProducts.getEligibleQuantityByVendorSkus(vendorSkus, destCityId));

	if (coins.length > 0) {
		// prom.push(Members.countFindsByCoins(coins));
		prom.push(Vendors.getPullForwardProductByCoins(coins));
		if (includeProductConditions) {
			prom.push(conditionsByCoins(coins));
		}
	}


	var results = await Promise.all(prom);
	var quantityResults = results[0];

	// var findResults = [];
	var pfResults = [];
	var conditionResults = [];

	if (coins.length > 0) {
		// findResults = results[1];
		pfResults = results[1];
		if (includeProductConditions) {
			conditionResults = results[2].conditions;
		}
	}

	prom = [];

	for (var i = 0; i < resp.data.laps.length; i++) {
		for (var j = 0; j < resp.data.laps[i].clusters.length; j++) {
			for (var k = 0; k < resp.data.laps[i].clusters[j].products.length; k++) {

				//	Populate eligible quantity;
				var obj = _.find(quantityResults, function (o) {
					return o.vendorSku === resp.data.laps[i].clusters[j].products[k].vendorSku;
				})

				if (obj !== undefined) {
					resp.data.laps[i].clusters[j].products[k].quantity = obj.quantity;
				}


				// //	Populate total likes
				// if (resp.data.laps[i].clusters[j].products[k].coinId !== null) {
				// 	//	If we can find the coinId in the results, store the totalLikes.
				// 	var obj = _.find(findResults, function (o) {
				// 		return o.coinId === resp.data.laps[i].clusters[j].products[k].coinId;
				// 	})

				// 	if (obj !== undefined) {
				// 		resp.data.laps[i].clusters[j].products[k].totalLikes = obj.num;

				// 	}
				// }


				//	Populate data from pull forward vendor sku
				if (resp.data.laps[i].clusters[j].products[k].coinId !== null) {
					//	If we can find the coinId in the results, store the totalLikes.
					var obj = _.find(pfResults, function (o) {
						return o.coinId === resp.data.laps[i].clusters[j].products[k].coinId;
					})

					if (obj !== undefined) {
						if ((obj.msrp !== undefined) && (obj.msrp !== null)) {
							resp.data.laps[i].clusters[j].products[k].msrp = obj.msrp;
						}
						if ((obj.productName !== undefined) && (obj.productName !== null)) {
							resp.data.laps[i].clusters[j].products[k].name = obj.productName;
						}
					}
				}


				if (includeProductConditions) {
					//	Populate conditions
					if (resp.data.laps[i].clusters[j].products[k].coinId !== null) {
						//	If we can find the vendor sku in the results, store the conditions.
						var obj = _.find(conditionResults, function (o) {
							return o.vendorSku === resp.data.laps[i].clusters[j].products[k].vendorSku;
						})

						if (obj !== undefined) {
							resp.data.laps[i].clusters[j].products[k].conditions = obj.conditions;

						}
					}
				}

			}
		}
	}

	lastTime = showTimeDiff('Post-Lookups', lastTime);


	lastTime = showTimeDiff('Pre-0 Qantity Prune', lastTime);

	//	If GDE active, remove skus with 0 quantity
	if ((configUtils.get("GDE_TOGGLE") === "ON") && (resp.data.laps !== undefined) && (bypassGDE === undefined)) {
		for (var i = 0; i < resp.data.laps.length; i++) {
			for (var j = 0; j < resp.data.laps[i].clusters.length; j++) {
				// console.log("removing product");

				_.remove(resp.data.laps[i].clusters[j].products, function (b) {
					return b.quantity === 0;
				});
			}
		}
	}

	lastTime = showTimeDiff('Post-0 Qantity Prune', lastTime);


	lastTime = showTimeDiff('Pre-Offset-Limit', lastTime);

	//	Limit and offset manipulation
	if (resp.data.laps !== undefined) {
		for (var i = 0; i < resp.data.laps.length; i++) {
			var l = (limit !== undefined) ? limit : 100;
			if ((l + o) >= resp.data.laps[i].clusters.length) {
				l = resp.data.laps[i].clusters.length;
			}

			var clen = resp.data.laps[i].clusters.length;
			for (var j = 0; j < clen; j++) {
				if (j < o) {
					resp.data.laps[i].clusters.shift();
				}

				if (j >= (o + l)) {
					resp.data.laps[i].clusters.pop();
				}
			}
		}
	}
	lastTime = showTimeDiff('Post-Offset-Limit', lastTime);

	return resp;
};



var conditionsByCoins = async (coins) => {
	var resp = {
		conditions: []
	}
	var c = null;

	c = await CategoryProducts.getConditionsByCoins(coins);
	for (var i = 0; i < c.length; i++) {
		var conditions = [];
		var totalQuantity = 0;
		var newFlag = false;
		var newPrice = 0.00;
		var likeNewFlag = false;
		var likeNewPrice = 0.00;
		var goodFlag = false;
		var goodPrice = 0.00;
		var fairFlag = false;
		var fairPrice = 0.00;
		var damagedFlag = false;
		var damagedPrice = 0.00;

		var s = _.split(c[i].conditions, ',');
		for (var j = 0; j < s.length; j++) {
			var colonIndex = s[j].indexOf(':');
			var name = s[j].substring(0, colonIndex);
			var lastIndex = colonIndex + 1;
			colonIndex = s[j].indexOf(':', lastIndex);
			var price = parseFloat(s[j].substring(lastIndex, colonIndex));
			var lastIndex = colonIndex + 1;
			colonIndex = s[j].indexOf(':', lastIndex);
			var status = s[j].substring(lastIndex, colonIndex);
			var lastIndex = colonIndex + 1;
			var online = s[j].substring(lastIndex);

			if ((status === 'Live') && (online = 'Y')) {

				switch (name) {
					case 'Like New':
						totalQuantity++;
						if (!likeNewFlag || (price < likeNewPrice)) {
							likeNewFlag = true;
							likeNewPrice = price;
						}
						break;

					case 'New':
						totalQuantity++;
						if (!newFlag || (price < newPrice)) {
							newFlag = true;
							newPrice = price;
						}
						break;

					case 'Good':
						if (!goodFlag || (price < goodPrice)) {
							goodFlag = true;
							goodPrice = price;
						}
						break;

					case 'Fair':
						if (!fairFlag || (price < fairPrice)) {
							fairFlag = true;
							fairPrice = price;
						}
						break;

					case 'Damaged':
						totalQuantity++;
						if (!damagedFlag || (price < damagedPrice)) {
							damagedFlag = true;
							damagedPrice = price;
						}
						break;
				}
			}
		}


		if (likeNewFlag) {
			var o = {
				name: 'Like New',
				price: likeNewPrice
			}

			conditions.push(o);
		}
		if (newFlag) {
			var o = {
				name: 'New',
				price: newPrice
			}

			conditions.push(o);
		}
		if (goodFlag) {
			var o = {
				name: 'Good',
				price: goodPrice
			}

			conditions.push(o);
		}
		if (fairFlag) {
			var o = {
				name: 'Fair',
				price: fairPrice
			}

			conditions.push(o);
		}
		if (damagedFlag) {
			var o = {
				name: 'Damaged',
				price: damagedPrice
			}

			conditions.push(o);
		}

		resp.conditions.push({
			vendorSku: c[i].vendorSku,
			conditions: conditions
		});
	}

	// conditions.totalQuantity = totalQuantity;
	return resp;

}



var showTimeDiff = (label, lastTime) => {
	var newTime = new Date().getTime();
	// console.log(`${label} - ${newTime - lastTime}`);
	return newTime;
}


var addCluster = (filterableClustersSocialAndVignette, clusters, cluster) => {
	if ((cluster.type === 'SOCIAL') || (cluster.type === 'VIGNETTE') || (cluster.type === 'NEW_ARRIVAL')) {
		if (_.findIndex(filterableClustersSocialAndVignette, function (c) {
				return c === cluster.id;
			}) > -1) {
			// console.log('adding social cluster ' + cluster.id);
			clusters.push(cluster);
		}
	} else {
		// console.log('adding cluster ' + cluster.id);
		clusters.push(cluster);
	}
}


module.exports = {
	get,
	getTurbo
}