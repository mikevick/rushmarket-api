'use strict';

const _ = require('lodash');


const configUtils = require('../utils/configUtils');
const { formatResp } = require('../utils/response');


const BubbleMerch = require('../models/bubbleMerch');
const Coins = require('../models/coins');
const RushProducts = require('../models/rushProducts');
const Stores = require('../models/stores');



var getByStoreId = async (req, resp, offset, limit, sortBy) => {
	var o = (offset !== undefined) ? offset : 0;


	var destCityId = 0;
	var prom = [];

	var pStoreIds = await Stores.getStoreIdAndHubStoreId(req.query.storeId);
	var productStoreIds = [];
	if (pStoreIds.length > 0) {
		productStoreIds.push(pStoreIds[0].hub_store_id);
		productStoreIds.push(pStoreIds[0].store_id);
		destCityId = pStoreIds[0].city_id;
	}
	var pricingTypes = await BubbleMerch.getPricingTypes();
	var merch = await BubbleMerch.getByStoreId(req.query.storeId, req.query.lapName, req.query.lapId, sortBy, (limit === 0));


	if (merch.length === 0) {
		formatResp(resp, undefined, 404, "No bubble merch data found.")
	} else {
		resp.data.laps = [];
		var bubble = {};
		var cluster = {};
		var lastBubble = null;
		var lastCluster = null;
		var lastLap = null;
		var lap = {};

		for (var i = 0; i < merch.length; i++) {

			//	See if we're starting a new lap.
			if (lastLap !== merch[i].lapName) {
				if (bubble.name !== undefined) {
					cluster.bubbles.push(bubble);
				}
				if (cluster.name !== undefined) {
					lap.clusters.push(cluster);
				}
				if (lap.name !== undefined) {
					resp.data.laps.push(lap);
				}

				lastLap = merch[i].lapName;

				//	Start new lap.
				lap = {};
				cluster = {};
				lastCluster = null;
				bubble = {};
				lastBubble = null;

				lap.name = merch[i].lapName;
				lap.shopifyStoreId = merch[i].shopifyStoreId;
				lap.storeId = merch[i].storeId;
				lap.storeName = merch[i].storeName;
				lap.lastRefresh = merch[i].lastRefresh;
				lap.nextRefresh = merch[i].nextRefresh;
				lap.clusters = [];
			}

			//	See if we're starting a new cluster.
			if (lastCluster !== merch[i].clusterPosition) {
				if (bubble.name !== undefined) {
					cluster.bubbles.push(bubble);
				}
				if (cluster.name !== undefined) {
					lap.clusters.push(cluster);
				}

				lastCluster = merch[i].clusterPosition;

				cluster = {};
				bubble = {};
				lastBubble = null;

				cluster.name = merch[i].clusterName;
				cluster.position = merch[i].clusterPosition;
				cluster.type = merch[i].clusterType;
				cluster.image1 = merch[i].clusterImage1;
				cluster.image2 = merch[i].clusterImage2;
				cluster.expirationDate = merch[i].clusterExpirationDate;
				cluster.bubbles = [];
			}

			//	See if we're starting a new bubble.
			if (lastBubble !== merch[i].name) {
				if (bubble.name !== undefined) {
					cluster.bubbles.push(bubble);
				}

				lastBubble = merch[i].name;

				bubble = {};

				// Commenting out per Drey's request 1/15/21 but assuming this might come back.
				// prom.push(Vendors.getProductByVendorSku(merch[i].vendorId, merch[i].sellerProductId));
				prom.push(Coins.getByVendorSku(merch[i].vendorId, merch[i].sellerProductId));

				if (configUtils.get("GDE_TOGGLE") === "ON") {
					prom.push(RushProducts.getEligibleQuantity(merch[i].sellerProductId, destCityId));
				} else {
					prom.push(RushProducts.getProductQuantity(merch[i].sellerProductId, productStoreIds));
				}


				bubble.name = merch[i].name;
				bubble.onlineQuickSale = merch[i].onlineQuickSale;
				bubble.sku = merch[i].sku;
				bubble.coinId = null;
				bubble.position = merch[i].bubblePosition;
				bubble.msrp = merch[i].msrp;
				bubble.marketPrice = merch[i].marketPrice;
				bubble.price = merch[i].price;
				bubble.quantity = 0;
				bubble.pricingTypeId = merch[i].pricingTypeId;
				bubble.pricingType = pricingTypes[_.findIndex(pricingTypes, function (pt) {
					return pt.pricingTypeId == bubble.pricingTypeId;
				})] ? pricingTypes[_.findIndex(pricingTypes, function (pt) {
					return pt.pricingTypeId == bubble.pricingTypeId;
				})].pricingType : '';
				bubble.images = [merch[i].image];
				bubble.status = merch[i].status;
				bubble.conditionName = merch[i].conditionName;
				bubble.freshnessScore = merch[i].freshnessScore;
				bubble.category1Url = merch[i].category1;
				bubble.category2Url = merch[i].category2;
				// bubble.vendorCatalogProduct = {};

				//	Commenting out per Drey's request 1/15/21 but assuming this might come back.
				// bubble.onlineQuickSaleData = {
				// 	color: merch[i].color,
				// 	material: merch[i].material,
				// 	size: merch[i].size,
				// 	dimensions: merch[i].dimensions,
				// 	bullets: merch[i].bullets
				// }
			}

		}

		if (bubble.name !== undefined) {
			cluster.bubbles.push(bubble);
		}

		if (cluster.name !== undefined) {
			lap.clusters.push(cluster);
		}

		if (lap.name !== undefined) {
			resp.data.laps.push(lap);
		}

		var vc = await Promise.all(prom);
		var vcIndex = 0;

		for (var i = 0; i < resp.data.laps.length; i++) {
			resp.data.laps[i].totalClusters = resp.data.laps[i].clusters.length;
			for (var j = 0; j < resp.data.laps[i].clusters.length; j++) {
				for (var k = 0; k < resp.data.laps[i].clusters[j].bubbles.length; k++) {
					if (vc[vcIndex].length > 0) {
						if (vc[(vcIndex + 1)].length > 0) {
							resp.data.laps[i].clusters[j].bubbles[k].coinId = vc[(vcIndex)][0].coinId;

							// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.coinId = vc[(vcIndex + 1)][0].coinId;
						} else {
							// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.coinId = vc[vcIndex][0].vendorId + '-' + vc[vcIndex][0].vendorSku;
						}

						if (vc[(vcIndex + 1)].length > 0) {
							resp.data.laps[i].clusters[j].bubbles[k].quantity = vc[(vcIndex + 1)][0].quantity;
						}
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.primaryMaterial = vc[vcIndex][0].primaryMaterial;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.secondaryMaterial = vc[vcIndex][0].secondaryMaterial;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.materialSpecific = vc[vcIndex][0].materialSpecific;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.primaryColor = vc[vcIndex][0].primaryColor;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.colorSpecific = vc[vcIndex][0].colorSpecific;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeName1 = vc[vcIndex][0].attributeName1;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeName2 = vc[vcIndex][0].attributeName2;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeName3 = vc[vcIndex][0].attributeName3;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeName4 = vc[vcIndex][0].attributeName4;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeName5 = vc[vcIndex][0].attributeName5;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeName6 = vc[vcIndex][0].attributeName6;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeValue1 = vc[vcIndex][0].attributeValue1;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeValue2 = vc[vcIndex][0].attributeValue2;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeValue3 = vc[vcIndex][0].attributeValue3;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeValue4 = vc[vcIndex][0].attributeValue4;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeValue5 = vc[vcIndex][0].attributeValue5;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.attributeValue6 = vc[vcIndex][0].attributeValue6;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.productWidth = vc[vcIndex][0].productWidth;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.productDepth = vc[vcIndex][0].productDepth;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.productHeight = vc[vcIndex][0].productHeight;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.additionalDims = vc[vcIndex][0].additionalDims;
						// resp.data.laps[i].clusters[j].bubbles[k].vendorCatalogProduct.productDescription = vc[vcIndex][0].productDescription
					}
					vcIndex += 2;
				}
			}
		}
	}


	//	If GDE active, remove skus with 0 quantity
	if ((configUtils.get("GDE_TOGGLE") === "ON") && (resp.data.laps !== undefined)) {
		for (var i = 0; i < resp.data.laps.length; i++) {
			for (var j = 0; j < resp.data.laps[i].clusters.length; j++) {
				_.remove(resp.data.laps[i].clusters[j].bubbles, function(b) { 
					return b.quantity === 0;
				});
			}
		}
	}



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

	return resp;
};





module.exports = {
	getByStoreId
}