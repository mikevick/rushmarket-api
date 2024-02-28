'use strict';

const numeral = require('numeral');

const {
	formatResp
} = require('../utils/response');

const rushProductActions = require('./rushProducts');

const CategoryAttributes = require('../models/categoryAttributes');
const Coins = require('../models/coins');
const Members = require('../models/members');
const Metros = require('../models/metros');
const RushProducts = require('../models/rushProducts');
const SearchProducts = require('../models/searchProducts');
const Stores = require('../models/stores');

const logUtils = require('../utils/logUtils')
const memberText = require('../utils/memberTextUtils')

const _ = require('lodash');
const CategoryProductActions = require('../actions/categoryProducts');



var getSearchProducts = async (whereInfo, sortBy, offset, limit, resp) => {
	let searchResults = await SearchProducts.getAllSearchProducts(whereInfo, sortBy, offset, limit);

	if (searchResults.rows.length === 0) {
		formatResp(resp, undefined, 404, 'No products found.');
	} else {
		resp.metaData.totalCount = searchResults.totalCount;
		resp.data.searchProducts = searchResults.rows;
	}
	return resp;
}



var manageSearchProducts = async (req, taxonomyCat, taxonomySlug, soldTimeFrame, resp) => {
	let productJson = {};
	let prom = [];
	let results = [];
	let k, m, r;
	let offset = 0;
	let limit = 99999;
	let catProdResp = {
		statusCode: 200,
		message: 'Success.',
		metaData: {
			totalCount: 0
		},
		data: {},
	};
	let vcWhereInfo = {
		join: '',
		clause: 'WHERE 1=1 ',
		values: []
	};
	let taxArray = [];
	let productDescription = "";
	let storedProductJson = {};
	let productString = "";
	let eligibleCityIds = [];
	let skuData = [];

	//current search products
	var searchProductResp = {
		statusCode: 200,
		message: 'Success.',
		metaData: {
			totalCount: 0
		},
		data: {},
	};
	let searchProductWhereInfo = {
		clause: ' WHERE category_slug = ? ',
		values: [taxonomySlug]
	};
	let searchProductSortBy = 'sku ASC';
	let currentProductList = [];
	let categoryProductList = [];

	//get current managed skus
	let currentProducts = await getSearchProducts(searchProductWhereInfo, searchProductSortBy, offset, limit, searchProductResp);
	if (currentProducts.metaData.totalCount > 0) {
		currentProductList = currentProducts.data.searchProducts;
	}

	//get fresh category products so we can create new and update current
	console.log(taxonomySlug);

	// if ((taxonomySlug !== 'adirondack-chairs') &&
	// 	(taxonomySlug !== 'conversation-sets') &&
	// 	(taxonomySlug !== 'hammocks-and-stands') &&
	// ) {
	// 	return;
	// }


	var lastTime = logUtils.showTimeDiff('Start', lastTime);

	req.query.categorySlug = taxonomySlug;
	req.query.sortBy = 'freshnessScore:DESC';
	let categoryProductsResult = await CategoryProductActions.getCategoryProductsBySlug(req, soldTimeFrame, vcWhereInfo, req.query.sortBy, offset, limit, catProdResp);
	if (categoryProductsResult.metaData.totalCount > 0) {
		categoryProductList = categoryProductsResult.data.categoryProducts;
		let updateProductsList = [];
		let newProductsList = [];
		let removeProductsList = [];
		let skuFilter = [];


		//determine skus that will be updated, added, removed
		// if (currentProductList.length > 0) {
		updateProductsList = _.intersectionBy(categoryProductList, currentProductList, "sku");
		newProductsList = _.differenceBy(categoryProductList, currentProductList, "sku");
		removeProductsList = _.differenceBy(currentProductList, categoryProductList, "sku");
		// }


		//remove 
		if (removeProductsList.length > 0) {
			prom = [];
			for (r = 0; r < removeProductsList.length; r++) {
				//	TODO TEMP FOR DEV 
				// if (removeProductsList[r].coinId !== '17F8F6C9F1A') {
				// 	continue;
				// }

				prom.push(SearchProducts.updateStatusSearchProduct(removeProductsList[r].id, 'REMOVE'));
			}
			if (prom.length)
				results = await Promise.all(prom);
		}

		//add and update
		if (updateProductsList.length > 0 || newProductsList.length > 0) {

			let attributeSizeLabel = categoryProductsResult.metaData.attributes.size.label;
			taxArray.push(taxonomyCat.name);
			prom = [];
			for (k = 0; k < newProductsList.length; k++) {


				//	TODO TEMP FOR DEV 
				// if (newProductsList[k].coinId !== '17F8F6C9F1A') {
				// 	continue;
				// }


				productDescription = (newProductsList[k].description == null) ? newProductsList[k].vendorCatalogProduct.productDescription : newProductsList[k].description;
				eligibleCityIds = [];
				if (newProductsList[k].targetedCityList != null) {
					newProductsList[k].targetedCityList.split(',').forEach(cityId => eligibleCityIds.push(Number.parseInt(cityId)));
				}

				var color = [];
				if (newProductsList[k].color != null) {
					var s = _.split(newProductsList[k].color, ',');
					for (var j = 0; j < s.length; j++) {
						if (_.findIndex(color, s[j].trim()) === -1) {
							color.push(s[j].trim());
						}
					}
					// } else {
					// 	color = '';
				}

				var style = [];
				if (newProductsList[k].vendorCatalogProduct.styleTag1 != null) {
					style.push(newProductsList[k].vendorCatalogProduct.styleTag1.trim());
				}
				if (newProductsList[k].vendorCatalogProduct.styleTag2 != null) {
					style.push(newProductsList[k].vendorCatalogProduct.styleTag2.trim());
				}

				productJson = {
					assemblyRequired: (newProductsList[k].productDisplay === 'Original Packaging') ? "Y" : "N",
					brandName: (newProductsList[k].brand != null) ? newProductsList[k].brand : '',
					bulletPoints: (newProductsList[k].vendorCatalogProduct.bullets != null) ? newProductsList[k].vendorCatalogProduct.bullets : '',
					bullets: (newProductsList[k].bullets != null) ? newProductsList[k].bullets : '',
					categorization: [],
					category1: (newProductsList[k].category1 != null) ? newProductsList[k].category1 : '',
					category2: (newProductsList[k].mappedCategory2 != null) ? newProductsList[k].mappedCategory2 : '',
					citySlug: (newProductsList[k].citySlug != null) ? newProductsList[k].citySlug : '',
					coinId: (newProductsList[k].coinId != null) ? newProductsList[k].coinId : '',
					color: (newProductsList[k].color != null) ? color : '',
					// conditionName: (newProductsList[k].conditionName != null) ? newProductsList[k].conditionName : '',
					// conditionTitle: populateConditionTitle(newProductsList[k].conditionName),
					// conditions: (newProductsList[k].conditions != null) ? newProductsList[k].conditions : [],
					// newConditions: [],
					dateOnline: (newProductsList[k].dateOnline != null) ? newProductsList[k].dateOnline : '',
					description: (productDescription != null) ? productDescription : '',
					dimensions: (newProductsList[k].dimensions != null) ? newProductsList[k].dimensions : '',
					eligibleCityIds: eligibleCityIds,
					eligibleCitiesData: [],
					freshnessScore: (newProductsList[k].freshnessScore != null) ? newProductsList[k].freshnessScore : '',
					frontEndName: (newProductsList[k].frontEndName != null) ? newProductsList[k].frontEndName : '',
					frontEndSpace: (newProductsList[k].frontEndSpace != null) ? newProductsList[k].frontEndSpace : '',
					images: (newProductsList[k].images != null) ? newProductsList[k].images : '',
					marketPrice: (newProductsList[k].marketPrice != null) ? newProductsList[k].marketPrice : '',
					material: (newProductsList[k].material != null) ? newProductsList[k].material : '',
					mpns: [],
					msrp: (newProductsList[k].msrp != null) ? newProductsList[k].msrp : '',
					name: (newProductsList[k].name != null) ? newProductsList[k].name : '',
					objectID: (newProductsList[k].sku != null) ? newProductsList[k].sku : '',
					onlineQuickSale: (newProductsList[k].onlineQuickSale != null) ? newProductsList[k].onlineQuickSale : '',
					packaging: (newProductsList[k].productDisplay == 'In Market') ? 'unboxed' : 'boxed',
					price: (newProductsList[k].price != null) ? newProductsList[k].price : '',
					pricingType: (newProductsList[k].pricingType != null) ? newProductsList[k].pricingType : '',
					primarySpace: (newProductsList[k].frontEndSpace != null) ? newProductsList[k].frontEndSpace : '',
					productDepth: (newProductsList[k].vendorCatalogProduct.productDepth != null) ? newProductsList[k].vendorCatalogProduct.productDepth : '',
					productHeight: (newProductsList[k].vendorCatalogProduct.productHeight != null) ? newProductsList[k].vendorCatalogProduct.productHeight : '',
					productWidth: (newProductsList[k].vendorCatalogProduct.productWidth != null) ? newProductsList[k].vendorCatalogProduct.productWidth : '',
					productType: (newProductsList[k].frontEndName != null) ? newProductsList[k].frontEndName : '',
					// productUri: `https://www.rushmarket.com/products/${(newProductsList[k].coinId != null) ? newProductsList[k].coinId : newProductsList[k].sku}`,
					promoId: (newProductsList[k].promoId != null) ? newProductsList[k].promoId : '',
					quantity: (newProductsList[k].quantity != null) ? newProductsList[k].quantity : '',
					shopifyVariantId: (newProductsList[k].shopifyVariantId != null) ? newProductsList[k].shopifyVariantId : '',
					size: (newProductsList[k].size != null) ? newProductsList[k].size : '',
					sku: (newProductsList[k].sku != null) ? newProductsList[k].sku : '',
					status: (newProductsList[k].status != null) ? newProductsList[k].status : '',
					sizeLabel: (attributeSizeLabel != null) ? attributeSizeLabel : '',
					storeId: (newProductsList[k].storeId != null) ? newProductsList[k].storeId : '',
					style: style,
					totalLikes: 0,
					totalQuantity: (newProductsList[k].totalQuantity != null) ? newProductsList[k].totalQuantity : '',
					taxonomyLocations: (taxArray != null) ? taxArray : '',
					vendorName: (newProductsList[k].vendorName != null) ? newProductsList[k].vendorName : '',
					vendorSkus: []
				}

				await populateCategorization(productJson, newProductsList[k]);

				await populateByCoin(productJson, newProductsList[k]);

				await populateGeo(productJson, newProductsList[k]);


				//	Calculate savings percentage
				if ((productJson.price !== '') && (productJson.msrp !== '')) {
					productJson.savingsPercent = numeral((productJson.msrp - productJson.price) / productJson.msrp).format('0%');
				} else {
					productJson.savingsPercent = '';
				}


				productString = JSON.stringify(productJson)
				if (productJson.quantity !== '') {
					prom.push(SearchProducts.createSearchProduct(newProductsList[k].sku, taxonomySlug, productString, 'NEW'));
				}
			}
			if (prom.length) {
				results = await Promise.all(prom);
			} else {
				//console.log('Nothing new to insert');
			}
			prom = [];
			for (m = 0; m < updateProductsList.length; m++) {

				//	TODO TEMP FOR DEV 
				// if (updateProductsList[m].coinId !== '17F8F6C9F1A') {
				// 	continue;
				// }


				productDescription = (updateProductsList[m].description == null) ? updateProductsList[m].vendorCatalogProduct.productDescription : updateProductsList[m].description;
				//get current sku data
				skuData = currentProductList.find(sku => sku.sku === updateProductsList[m].sku);
				//take care of any dups in the current list
				skuFilter = currentProductList.filter(sku => sku.sku === updateProductsList[m].sku);
				if (skuFilter.length > 1) {
					prom = [];
					for (r = 1; r < skuFilter.length; r++) {
						prom.push(SearchProducts.removeSearchProductById(skuFilter[r].id));
					}
					if (prom.length)
						results = await Promise.all(prom);
				}
				storedProductJson = JSON.parse(skuData.product_data);
				if (storedProductJson.taxonomyLocations != undefined) {
					taxArray = storedProductJson.taxonomyLocations;
					if (storedProductJson.taxonomyLocations.find(tax => tax === taxonomyCat.name) == undefined) {
						taxArray.push(taxonomyCat.name);
					}
				} else {
					taxArray.push(taxonomyCat.name);
				}
				eligibleCityIds = [];
				if (updateProductsList[m].targetedCityList != null) {
					updateProductsList[m].targetedCityList.split(',').forEach(cityId => eligibleCityIds.push(Number.parseInt(cityId)));
				}

				color = [];
				if (updateProductsList[m].color != null) {
					var s = _.split(updateProductsList[m].color, ',');
					for (var j = 0; j < s.length; j++) {
						if (_.findIndex(color, s[j].trim()) === -1) {
							color.push(s[j].trim());
						}
					}
					// } else {
					// 	color = '';
				}

				style = [];
				if (updateProductsList[m].vendorCatalogProduct.styleTag1 != null) {
					style.push(updateProductsList[m].vendorCatalogProduct.styleTag1.trim());
				}
				if (updateProductsList[m].vendorCatalogProduct.styleTag2 != null) {
					style.push(updateProductsList[m].vendorCatalogProduct.styleTag2.trim());
				}


				productJson = {
					assemblyRequired: (updateProductsList[m].productDisplay === 'Original Packaging') ? "Y" : "N",
					brandName: (updateProductsList[m].brand != null) ? updateProductsList[m].brand : '',
					bulletPoints: (updateProductsList[m].vendorCatalogProduct.bullets != null) ? updateProductsList[m].vendorCatalogProduct.bullets : '',
					bullets: (updateProductsList[m].bullets != null) ? updateProductsList[m].bullets : '',
					categorization: [],
					category1: (updateProductsList[m].category1 != null) ? updateProductsList[m].category1 : '',
					category2: (updateProductsList[m].mappedCategory2 != null) ? updateProductsList[m].mappedCategory2 : '',
					citySlug: (updateProductsList[m].citySlug != null) ? updateProductsList[m].citySlug : '',
					coinId: (updateProductsList[m].coinId != null) ? updateProductsList[m].coinId : '',
					color: color,
					// conditionName: (updateProductsList[m].conditionName != null) ? updateProductsList[m].conditionName : '',
					// conditionTitle: populateConditionTitle(updateProductsList[m].conditionName),
					// conditions: (updateProductsList[m].conditions != null) ? updateProductsList[m].conditions : [],
					// newConditions: [],
					dateOnline: (updateProductsList[m].dateOnline != null) ? updateProductsList[m].dateOnline : '',
					description: (productDescription != null) ? productDescription : '',
					dimensions: (updateProductsList[m].dimensions != null) ? updateProductsList[m].dimensions : '',
					eligibleCityIds: eligibleCityIds,
					eligibleCitiesData: [],
					freshnessScore: (updateProductsList[m].freshnessScore != null) ? updateProductsList[m].freshnessScore : '',
					frontEndName: (updateProductsList[m].frontEndName != null) ? updateProductsList[m].frontEndName : '',
					frontEndSpace: (updateProductsList[m].frontEndSpace != null) ? updateProductsList[m].frontEndSpace : '',
					images: (updateProductsList[m].images != null) ? updateProductsList[m].images : '',
					marketPrice: (updateProductsList[m].marketPrice != null) ? updateProductsList[m].marketPrice : '',
					material: (updateProductsList[m].material != null) ? updateProductsList[m].material : '',
					mpns: [],
					msrp: (updateProductsList[m].msrp != null) ? updateProductsList[m].msrp : '',
					name: (updateProductsList[m].name != null) ? updateProductsList[m].name : '',
					objectID: (updateProductsList[m].sku != null) ? updateProductsList[m].sku : '',
					onlineQuickSale: (updateProductsList[m].onlineQuickSale != null) ? updateProductsList[m].onlineQuickSale : '',
					packaging: (updateProductsList[m].productDisplay == 'In Market') ? 'unboxed' : 'boxed',
					price: (updateProductsList[m].price != null) ? updateProductsList[m].price : '',
					pricingType: (updateProductsList[m].pricingType != null) ? updateProductsList[m].pricingType : '',
					primarySpace: (updateProductsList[m].frontEndSpace != null) ? updateProductsList[m].frontEndSpace : '',
					productDepth: (updateProductsList[m].vendorCatalogProduct.productDepth != null) ? updateProductsList[m].vendorCatalogProduct.productDepth : '',
					productHeight: (updateProductsList[m].vendorCatalogProduct.productHeight != null) ? updateProductsList[m].vendorCatalogProduct.productHeight : '',
					productWidth: (updateProductsList[m].vendorCatalogProduct.productWidth != null) ? updateProductsList[m].vendorCatalogProduct.productWidth : '',
					productType: (updateProductsList[m].frontEndName != null) ? updateProductsList[m].frontEndName : '',
					// productUri: `https://www.rushmarket.com/products/${(updateProductsList[m].coinId != null) ? updateProductsList[m].coinId : updateProductsList[m].sku}`,
					promoId: (updateProductsList[m].promoId != null) ? updateProductsList[m].promoId : '',
					quantity: (updateProductsList[m].quantity != null) ? updateProductsList[m].quantity : '',
					shopifyVariantId: (updateProductsList[m].shopifyVariantId != null) ? updateProductsList[m].shopifyVariantId : '',
					size: (updateProductsList[m].size != null) ? updateProductsList[m].size : '',
					sku: (updateProductsList[m].sku != null) ? updateProductsList[m].sku : '',
					status: (updateProductsList[m].status != null) ? updateProductsList[m].status : '',
					sizeLabel: (attributeSizeLabel != null) ? attributeSizeLabel : '',
					storeId: (updateProductsList[m].storeId != null) ? updateProductsList[m].storeId : '',
					style: style,
					taxonomyLocations: (taxArray != null) ? taxArray : '',
					totalLikes: 0,
					totalQuantity: (updateProductsList[m].totalQuantity != null) ? updateProductsList[m].totalQuantity : '',
					vendorName: (updateProductsList[m].vendorName != null) ? updateProductsList[m].vendorName : '',
					vendorSkus: []
				}

				await populateCategorization(productJson, updateProductsList[m]);

				await populateByCoin(productJson, updateProductsList[m]);

				await populateGeo(productJson, updateProductsList[m]);


				//	Calculate savings percentage
				if ((productJson.price !== '') && (productJson.msrp !== '')) {
					productJson.savingsPercent = numeral((productJson.msrp - productJson.price) / productJson.msrp).format('0%');
				} else {
					productJson.savingsPercent = '';
				}


				productString = JSON.stringify(productJson)
				if (productJson.quantity !== '') {
					if (!(productString.toUpperCase() === skuData.product_data.toUpperCase())) {
						prom.push(SearchProducts.updateSearchProduct(skuData.id, updateProductsList[m].sku, taxonomySlug, productString, 'UPDATE'));
					}
				} else {
					prom.push(SearchProducts.updateSearchProduct(skuData.id, updateProductsList[m].sku, taxonomySlug, productString, 'REMOVE'));
				}
			}
			if (prom.length) {
				results = await Promise.all(prom);
			} else {
				//console.log('Nothing to update');
			}
		}
	} else {
		//remove all current products for the category from Algolia.
		if (currentProductList.length > 0) {
			prom = [];
			for (r = 0; r < currentProductList.length; r++) {
				prom.push(SearchProducts.updateStatusSearchProduct(currentProductList[r].id, 'REMOVE'));
			}
			if (prom.length) {
				results = await Promise.all(prom);
			} else {
				//console.log('Nothing to remove');
			}
		}
	}
	lastTime = logUtils.showTimeDiff('Algolia Feed End', lastTime);
	return resp;
}


var populateCategorization = async (productJson, productListItem) => {
	if (productListItem !== undefined) {
		var cat = {
			category1: productListItem.category1,
			category2: productListItem.mappedCategory2,
			frontEndSpace: productListItem.frontEndSpace,
			frontEndName: productListItem.frontEndName,
			primaryFlag: true
		}

		productJson.categorization.push(cat);

		if (productJson.coinId !== '') {
			var crossListings = await Coins.getCrossListingsByCoinId(productJson.coinId);

			for (var i = 0; i < crossListings.length; i++) {
				var cat = {
					category1: crossListings[i].crossListCat1,
					category2: crossListings[i].crossListCat2,
					frontEndSpace: crossListings[i].crossListSpace,
					frontEndName: crossListings[i].crossListName,
					primaryFlag: false
				}
				productJson.categorization.push(cat);
			}
		}
	}
}



var populateByCoin = async (productJson, productListItem) => {
	var cities = [];

	if (productJson.onlineQuickSale === 'Y') {
		//	Get ALL eligible city ids for the OQS sku
		cities = await SearchProducts.getEligibleCitiesBySku(productJson.sku);
	} else {
		//	Get ALL eligible city ids for the COIN
		cities = await SearchProducts.getEligibleCities(productJson.coinId);
	}
	productJson.eligibleCityIds = cities;

	//	Get total Likes
	var findsCount = null;
	if (productJson.onlineQuickSale === 'Y') {
		findsCount = await Members.countFindsByCoin(productJson.sku);
	} else {
		findsCount = await Members.countFindsByCoin(productJson.coinId);
	}
	if (findsCount.length > 0) {
		productJson.totalLikes = findsCount[0].num;
	}

	//	BOPIS_ONLY flag check
	if (productJson.onlineQuickSale === 'Y') {
		productJson.bopisOnlyFlag = await SearchProducts.bopisOnlyCheckBySku(productJson.sku);

		productJson.vendorSkus.push(productListItem.vendorSku);
		if (productListItem.mpn !== null) {
			productJson.mpns.push(productListItem.mpn);
		}

		await pullCoinAndAnalyze(productJson);
	} else {
		productJson.bopisOnlyFlag = await SearchProducts.bopisOnlyCheckByCoin(productJson.coinId);

		//	Get vendor skus for COIN
		var vskus = await Coins.getVendorSkuByCoinId(productJson.coinId);
		for (var i = 0; i < vskus.length; i++) {
			if (i === 20) {
				break;
			}
			if (_.findIndex(productJson.vendorSkus, function (v) {
					return v === vskus[i].vendorSku
				}) === -1) {
				productJson.vendorSkus.push(vskus[i].vendorSku);
			}
		}

		//	Get MPNs for COIN
		var mpns = await Coins.getManuByCoinId(productJson.coinId);
		for (var i = 0; i < mpns.length; i++) {
			if (i === 20) {
				break;
			}
			if ((mpns[i].mpn !== null) && (_.findIndex(productJson.mpns, function (m) {
					return m === mpns[i].mpn
				}) === -1)) {
				productJson.mpns.push(mpns[i].mpn);
			}
		}

		await pullCoinAndAnalyze(productJson);
	}
}



var pullCoinAndAnalyze = async (productJson) => {
	var metros = await Metros.getMetroZipAndStoreId();
	var physicalStores = await Stores.getActivePhysicalOnlyStores();
	physicalStores.push({
		storeId: 106,
		storeName: 'Dropship'
	})
	var context = {
		productJson: productJson,
		coinProduct: undefined,
		conditionsByStore: [],
		localStores: [],
		new: {
			found: false,
			priceLow: 1000000,
			priceHigh: 0,
			quantityAcrossPhysical: 0,
			skusAcrossPhysical: '',
			skuDetailAcrossPhysical: []
		},
		likeNew: {
			found: false,
			priceLow: 1000000,
			priceHigh: 0,
			quantityAcrossPhysical: 0,
			skusAcrossPhysical: '',
			skuDetailAcrossPhysical: []
		},
		good: {
			found: false,
			priceLow: 1000000,
			priceHigh: 0,
			quantityAcrossPhysical: 0,
			skusAcrossPhysical: '',
			skuDetailAcrossPhysical: []
		},
		fair: {
			found: false,
			priceLow: 1000000,
			priceHigh: 0,
			quantityAcrossPhysical: 0,
			skusAcrossPhysical: '',
			skuDetailAcrossPhysical: []
		},
		pullForwardVendorSku: {}
	}

	var rq = {
		query: {
			bypassFulfillmentOptionsFlag: "true",
			zip: 68144
		},
		params: {
			id: ((productJson.coinId !== '') && (productJson.onlineQuickSale === 'N')) ? productJson.coinId : productJson.sku
		}
	}

	var rp = {
		statusCode: 200,
		message: memberText.get('GET_SUCCESS'),
		data: {}
	}


	//	Prepare the metros order by clauses so we pull the sku that'll be selected on the product page.
	for (var i = 0; i < metros.length; i++) {
		metros[i].orderBy = '';
		if (metros[i].type === 'PHYSICAL') {
			metros[i].orderBy = `FIELD(store_id, ${metros[i].storeId}) DESC, `;
		}
	}

	// var lastTime = logUtils.showTimeDiff('Start', lastTime);
	// var member = await rushProductActions.getMember(rq, rp);
	// var c = await RushProducts.getByCoin(rq.params.id, member);
	// lastTime = logUtils.showTimeDiff('after queries', lastTime);
	context.coinProduct = await rushProductActions.getByCoin(rq, rp);
	// lastTime = logUtils.showTimeDiff('after getByCoin', lastTime);


	if (context.coinProduct.statusCode === 200) {

		//	Validate attribute values.   
		await processFilterAttributes(context);


		//	Get info on what's available by condition by physical store.
		for (var i = 0; i < physicalStores.length; i++) {
			context.conditionsByStore.push(await checkForConditionsByStore(context, physicalStores[i].storeId, physicalStores[i].linkedDmaStoreId));
		}

		// lastTime = logUtils.showTimeDiff('after checkForConditionsByStore', lastTime);

		//	Roll up sku data by condition
		rollUpSkusByCondition(context);

		// lastTime = logUtils.showTimeDiff('after rollUpSkusByCondition', lastTime);


		//	Determine regional availability.
		for (var i = 0; i < metros.length; i++) {
			if (_.findIndex(context.productJson.eligibleCityIds, function (e) {
					return e === metros[i].cityId;
				}) > -1) {

				var metroData = {
					cityId: metros[i].cityId,
					priceLow: 1000000,
					priceHigh: 0,
					savingsPercent: 0,
					hasPickupFlag: false,
					bopisOnlyFlag: true,
					showRoomFlag: false,
					localFlag: false,
					quantity: 0,
					rushSkus: [],
					conditions: []
				}

				if (_.indexOf(context.localStores, metros[i].storeId) > -1) {
					metroData.localFlag = true;
				}

				// lastTime = logUtils.showTimeDiff('before processMetroCondition', lastTime);
				await processMetroCondition(metros[i], context, context.coinProduct.data.rushProducts, context.new, metroData);
				await processMetroCondition(metros[i], context, context.coinProduct.data.rushProducts, context.likeNew, metroData);
				await processMetroCondition(metros[i], context, context.coinProduct.data.rushProducts, context.good, metroData);
				await processMetroCondition(metros[i], context, context.coinProduct.data.rushProducts, context.fair, metroData);
				// lastTime = logUtils.showTimeDiff('after processMetroCondition', lastTime);

				await rollUpMetroConditions(context, metroData);
				// lastTime = logUtils.showTimeDiff('after rollUpMetroConditions', lastTime);

				if (metroData.priceHigh !== 0) {
					context.productJson.eligibleCitiesData.push(metroData);
				}
			}
		}

		//	Removing as part of 12/20/22 cleanup
		// populateConditions(context);
		// lastTime = logUtils.showTimeDiff('after populateConditions', lastTime);
	}

	productJson = context.productJson;
}



var processFilterAttributes = async (context) => {
	let attributes = [];
	let rushProducts = context.coinProduct.data.rushProducts;

	for (let i = 0; i < rushProducts.attributes.length; i++) {
		//	Only interested in filter attributes
		if (rushProducts.attributes[i].filterDisplayFlag) {
			if (!rushProducts.attributes[i].values.length) {
				if (rushProducts.attributes[i].name !== 'Style Tag 2') {
					await CategoryAttributes.logSuspectValues(rushProducts.coinId, rushProducts.attributes[i].categoryName, rushProducts.attributes[i].label, rushProducts.attributes[i].attributeName, ['<no value>']);
				}
			} else {

				if (rushProducts.attributes[i].name === 'Assembly Required') {
					if (rushProducts.attributes[i].values.length !== 1) {
						await CategoryAttributes.logSuspectValues(rushProducts.coinId, rushProducts.attributes[i].categoryName, rushProducts.attributes[i].label, rushProducts.attributes[i].name, ['<too many values>']);
					} else if ((rushProducts.attributes[i].values[0] !== 'Y') && (rushProducts.attributes[i].values[0] !== 'N')) {
						await CategoryAttributes.logSuspectValues(rushProducts.coinId, rushProducts.attributes[i].categoryName, rushProducts.attributes[i].label, rushProducts.attributes[i].name, suspect);
					}
				} else if (rushProducts.attributes[i].name === 'Dimensions') {
					if (rushProducts.attributes[i].values.length !== 1) {
						await CategoryAttributes.logSuspectValues(rushProducts.coinId, rushProducts.attributes[i].categoryName, rushProducts.attributes[i].label, rushProducts.attributes[i].name, ['<too many values>']);
					}
				} else if (rushProducts.attributes[i].name === 'Features') {
					if (rushProducts.attributes[i].values.length === 0) {
						await CategoryAttributes.logSuspectValues(rushProducts.coinId, rushProducts.attributes[i].categoryName, rushProducts.attributes[i].label, rushProducts.attributes[i].name, ['<no value>']);
					}
				} else {
					var suspect = await CategoryAttributes.findSuspectValues(rushProducts.attributes[i].attributeId, rushProducts.attributes[i].values);
					if (suspect.length) {
						await CategoryAttributes.logSuspectValues(rushProducts.coinId, rushProducts.attributes[i].categoryName, rushProducts.attributes[i].label, rushProducts.attributes[i].name, suspect);
					}

					//	Strip non-numeric characters (except decimal point) from range values
					if ((rushProducts.attributes[i].type === 'range')) {
						for (let j=0; j < rushProducts.attributes[i].values.length; j++) {
							if (typeof rushProducts.attributes[i].values[j] === 'string') {
								rushProducts.attributes[i].values[j] = rushProducts.attributes[i].values[j].replace(/[^0-9.]/g, '');
							}
						}
					}
				}
			}
		}
	}

	context.productJson.attributes = rushProducts.attributes
		.filter(a =>
			(a.filterDisplayFlag && a.values.length))
		.map(a => {
			delete a.attributeId;
			delete a.categoryName;

			return a;
		})

	for (let i = 0; i < rushProducts.attributes.length; i++) {
		let a = rushProducts.attributes[i];
		if (a.filterDisplayFlag && a.values.length) {
			context.productJson[`attr_${a.label.length ? a.label.replace(/\s+/g, '-') : a.name.replace(/\s+/g, '-')}_${a.type}`] = a.values;

			if ((a.type === 'range') && (a.units !== '')) {
				context.productJson[`attr_${a.label.length ? a.label.replace(/\s+/g, '-') : a.name.replace(/\s+/g, '-')}_units`] = a.units;
			}
		}
	}

	delete context.productJson.attributes;
}


//	Removing as part of 12/20/22 cleanup
// var populateConditions = (context) => {
// 	for (var i = 0; i < context.productJson.eligibleCitiesData.length; i++) {
// 		for (var j = 0; j < context.productJson.eligibleCitiesData[i].conditions.length; j++) {
// 			var c = _.find(context.productJson.conditions, function (o) {
// 				return o.name === context.productJson.eligibleCitiesData[i].conditions[j].name;
// 			});

// 			if (c !== undefined) {
// 				if (c.price > context.productJson.eligibleCitiesData[i].conditions[j].priceLow) {
// 					c.price = context.productJson.eligibleCitiesData[i].conditions[j].priceLow
// 				}
// 			} else {
// 				context.productJson.conditions.push({
// 					name: context.productJson.eligibleCitiesData[i].conditions[j].name,
// 					price: context.productJson.eligibleCitiesData[i].conditions[j].priceLow
// 				})
// 			}
// 		}
// 	}
// }



var rollUpMetroConditions = async (context, metroData) => {
	var maxQuantity = 0;
	var skus = [];

	for (var i = 0; i < metroData.conditions.length; i++) {
		//	Keep track of lowest price and savings percent by condition
		if (metroData.conditions[i].priceLow < metroData.priceLow) {
			metroData.priceLow = metroData.conditions[i].priceLow;

			if (metroData.conditions[i].savingsPercent > metroData.savingsPercent) {
				metroData.savingsPercent = metroData.conditions[i].savingsPercent;
				metroData.savingsPercentDisplay = numeral(metroData.conditions[i].savingsPercent).format('0%');
			}
		}

		//	Keep track of highest price by condition
		if (metroData.conditions[i].priceHigh > metroData.priceHigh) {
			metroData.priceHigh = metroData.conditions[i].priceHigh;
		}

		//	If not a dropship item, can be picked up at store
		if (!metroData.conditions[i].dropshipFlag) {
			metroData.hasPickupFlag = true;
		}

		//	If at least one variant group isn't BOPIS_ONLY, set flag for the metro to false.
		if (!metroData.conditions[i].bopisOnlyFlag) {
			metroData.bopisOnlyFlag = false;
		}

		//	If at least one variant has showRoomFlag set, set the flag for the condition.
		if (metroData.conditions[i].showRoomFlag) {
			metroData.showRoomFlag = true;
		}

		metroData.quantity += metroData.conditions[i].quantity;
		if (metroData.quantity > 99) {
			metroData.quantity = 99;
		}

		if (maxQuantity < metroData.quantity) {
			maxQuantity = metroData.quantity;
		}

		var s = _.split(metroData.conditions[i].skus, ',');
		for (var j = 0; j < s.length; j++) {
			skus.push(s[j]);
		}
	}

	var rushSkus = await RushProducts.orderRushSkus(metroData.cityId, skus);
	for (var i = 0; i < rushSkus.length; i++) {
		metroData.rushSkus.push(rushSkus[i].sku.toString());
	}

	if (maxQuantity > 0) {
		context.productJson.totalQuantity = maxQuantity;
	}
}


var processMetroCondition = async (metro, context, rushProducts, metroCondition, metroData) => {
	if (metroCondition.skusAcrossPhysical.length > 0) {
		var result = await SearchProducts.metroEligibilityCheck(metro, metroCondition.skusAcrossPhysical);
		if (result.length > 0) {

			var condition = {
				name: null,
				displayName: null,
				priceLow: 1000000,
				priceHigh: 0,
				savingsPercent: null,
				hasPickupFlag: false,
				bopisOnlyFlag: true,
				showRoomFlag: false,
				skus: "",
				quantity: 0
			}

			for (var i = 0; i < result.length; i++) {

				var skuData = _.find(metroCondition.skuDetailAcrossPhysical, function (s) {
					return s.sku === result[i].sku;
				});


				if (skuData !== undefined) {
					var variantGroup = rushProducts.variantGroups[skuData.vGroupIndex];
					condition.name = variantGroup.conditionName;
					condition.displayName = variantGroup.conditionTitle;

					if (condition.skus.length > 0) {
						condition.skus += ', ';
					}
					condition.skus += result[i].sku;

					//	Keep track of lowest price and savings percent by condition
					if (variantGroup.price < condition.priceLow) {
						condition.priceLow = variantGroup.price;

						var savingsPercent = Math.round(((context.productJson.msrp - condition.priceLow) / context.productJson.msrp) * 100) / 100;
						if (savingsPercent > condition.savingsPercent) {
							condition.savingsPercent = savingsPercent;
							condition.savingsPercentDisplay = numeral(savingsPercent).format('0%');
						}
					}

					//	Keep track of highest price by condition
					if (variantGroup.price > condition.priceHigh) {
						condition.priceHigh = variantGroup.price;
					}


					//	If not a dropship item, can be picked up at store
					if ((!variantGroup.dropshipFlag) && (metro.type === 'PHYSICAL')) {
						condition.hasPickupFlag = true;
					}

					//	If at least one metro's isn't BOPIS_ONLY, set flag for the condition to false.
					if (result[0].effectiveEligibility !== 'BOPIS_ONLY') {
						condition.bopisOnlyFlag = false;
					}

					//	If at least one variant has showRoomFlag set, set the flag for the condition.
					if ((skuData.showRoomFlag) && (skuData.variantCityId === metro.cityId)) {
						condition.showRoomFlag = true;
					}

					if (skuData.dropshipType === 'UNLIMITED') {
						condition.quantity = 99;
					} else if (skuData.dropshipType === 'LIMITED') {
						condition.quantity = skuData.limitedQuantity;
					} else {
						condition.quantity++;
					}
				}
			}

			metroData.conditions.push(condition);
		}
	}
}


var rollUpSkusByCondition = (context) => {
	for (var i = 0; i < context.conditionsByStore.length; i++) {
		if (context.conditionsByStore[i].newStats.skus.length > 0) {
			rollupSkus(context.new, context.conditionsByStore[i].newStats);
		}
	}

	for (var i = 0; i < context.conditionsByStore.length; i++) {
		if (context.conditionsByStore[i].likeNewStats.skus.length > 0) {
			rollupSkus(context.likeNew, context.conditionsByStore[i].likeNewStats);
		}
	}


	for (var i = 0; i < context.conditionsByStore.length; i++) {
		if (context.conditionsByStore[i].goodStats.skus.length > 0) {
			rollupSkus(context.good, context.conditionsByStore[i].goodStats);
		}
	}

	for (var i = 0; i < context.conditionsByStore.length; i++) {
		if (context.conditionsByStore[i].fairStats.skus.length > 0) {
			rollupSkus(context.fair, context.conditionsByStore[i].fairStats);
		}
	}
}



var rollupSkus = (conditionStats, storeConditionStats) => {
	conditionStats.found = true;
	if (conditionStats.skusAcrossPhysical.length > 0) {
		conditionStats.skusAcrossPhysical += ', ';
	}
	conditionStats.skusAcrossPhysical += storeConditionStats.skus;

	conditionStats.skuDetailAcrossPhysical = _.concat(conditionStats.skuDetailAcrossPhysical, storeConditionStats.skuDetail)

	conditionStats.quantityAcrossPhysical += storeConditionStats.quantity;

	for (var i = 0; i < conditionStats.skuDetailAcrossPhysical.length; i++) {
		if (conditionStats.priceLow > conditionStats.skuDetailAcrossPhysical[i].price) {
			conditionStats.priceLow = conditionStats.skuDetailAcrossPhysical[i].price;
		}

		if (conditionStats.priceHigh < conditionStats.skuDetailAcrossPhysical[i].price) {
			conditionStats.priceHigh = conditionStats.skuDetailAcrossPhysical[i].price;
		}
	}
}


var checkForConditionsByStore = async (context, storeId, linkedDmaStoreId) => {
	var conditions = {
		hasPickupFlag: false, //	At least one variant availble for pickup at this store
		bopisOnlyFlag: true, //	ALL variants are BOPIS_ONLY
		showRoomFlag: false, //	At least one variant available to see on showroom floor of this city
		newStats: {
			conditionName: null,
			conditionTitle: null,
			found: false,
			vGroupIndex: -1,
			hasPickupFlag: false, //	At least one variant availble for pickup at this store
			bopisOnlyFlag: true, //	ALL variants are BOPIS_ONLY
			showRoomFlag: false, //	At least one variant available to see on showroom floor of this city
			skus: '',
			skuDetail: [],
			quantity: 0
			// availability: 'out of stock',
			// national: false,
			// priceHigh: 0,
			// priceLow: 1000000,
			// marketPrice: 0,
			// savingsPercent: 0,
			// savingsPercentDisplay: null,
			// shipping: 0,
		},
		likeNewStats: {
			conditionName: null,
			conditionTitle: null,
			found: false,
			vGroupIndex: -1,
			hasPickupFlag: false, //	At least one variant availble for pickup at this store
			bopisOnlyFlag: true, //	ALL variants are BOPIS_ONLY
			showRoomFlag: false, //	At least one variant available to see on showroom floor of this city
			skus: '',
			skuDetail: [],
			quantity: 0
		},
		goodStats: {
			conditionName: null,
			conditionTitle: null,
			found: false,
			vGroupIndex: -1,
			hasPickupFlag: false, //	At least one variant availble for pickup at this store
			bopisOnlyFlag: true, //	ALL variants are BOPIS_ONLY
			showRoomFlag: false, //	At least one variant available to see on showroom floor of this city
			skus: '',
			skuDetail: [],
			quantity: 0
		},
		fairStats: {
			conditionName: null,
			conditionTitle: null,
			found: false,
			vGroupIndex: -1,
			hasPickupFlag: false, //	At least one variant availble for pickup at this store
			bopisOnlyFlag: true, //	ALL variants are BOPIS_ONLY
			showRoomFlag: false, //	At least one variant available to see on showroom floor of this city
			skus: '',
			skuDetail: [],
			quantity: 0
		},
		storeId: storeId,
		linkedDmaStoreId: linkedDmaStoreId
	}

	for (var j = 0; j < context.coinProduct.data.rushProducts.variantGroups.length; j++) {

		if ((context.coinProduct.data.rushProducts.variantGroups[j].quantity > 0) &&
			(context.coinProduct.data.rushProducts.variantGroups[j].eligibility !== null) &&
			(context.coinProduct.data.rushProducts.variantGroups[j].storeId === storeId)) {

			await checkForVariants('New', context, context.coinProduct.data.rushProducts.variantGroups[j], j, conditions.newStats);
			await checkForVariants('Like New', context, context.coinProduct.data.rushProducts.variantGroups[j], j, conditions.likeNewStats);
			await checkForVariants('Good', context, context.coinProduct.data.rushProducts.variantGroups[j], j, conditions.goodStats);
			await checkForVariants('Fair', context, context.coinProduct.data.rushProducts.variantGroups[j], j, conditions.fairStats);

			if (conditions.newStats.found || conditions.likeNewStats.found || conditions.goodStats.found || conditions.fairStats.found) {
				context.localStores.push(storeId)
				if (linkedDmaStoreId) {
					context.localStores.push(linkedDmaStoreId);
				}
			}
		}
	}

	return conditions;
}



var checkForVariants = async (conditionName, context, variantGroup, vGroupIndex, conditionStats) => {
	if (variantGroup.conditionName === conditionName) {
		//	Keep a list of new skus so we can verify whether at least one is shippable everywhere
		for (var k = 0; k < variantGroup.variants.length; k++) {
			if ((variantGroup.variants[k].status === 'Live') &&
				(variantGroup.variants[k].onlineShopping === 'Y')) {

				if (!conditionStats.found) {
					conditionStats.conditionName = variantGroup.conditionName;
					conditionStats.conditionTitle = variantGroup.conditionTitle;
					conditionStats.found = true;
					conditionStats.vGroupIndex = vGroupIndex;
				}
				if (variantGroup.variants[k].dropshipType === 'UNLIMITED') {
					conditionStats.quantity = 99;
				} else if (variantGroup.variants[k].dropshipType === 'LIMITED') {
					conditionStats.quantity += variantGroup.variants[k].limitedQuantity
				} else {
					conditionStats.quantity++;
				}

				if (conditionStats.skus.length > 0) {
					conditionStats.skus += ', ';
				}
				conditionStats.skus += variantGroup.variants[k].sku;
				conditionStats.skuDetail.push({
					vGroupIndex: vGroupIndex,
					sku: variantGroup.variants[k].sku,
					price: variantGroup.price,
					showRoomFlag: variantGroup.variants[k].showRoomFlag,
					variantCityId: variantGroup.variantCityId,
					dropshipType: variantGroup.variants[k].dropshipType,
					limitedQuantity: variantGroup.variants[k].limitedQuantity
				})
			}
		}


		if (conditionStats.skus.length > 0) {
			// var shippable = await GDE.getShippablePct(conditionStats.skus);
			// if ((shippable.length > 0) && (shippable[0].pct_ship_eligible === 100)) {
			conditionStats.availability = 'in stock';
			// 	conditionStats.national = true;
			// }
		}
	}
}







var populateGeo = async (productJson, productListItem) => {
	var geo = await Coins.getGeoByCoin(productJson.coinId, productJson.sku, productJson.onlineQuickSale);
	var geoDS = await Coins.getGeoByCoinDS(productJson.coinId, productJson.sku, productJson.onlineQuickSale);

	geo = _.concat(geo, geoDS);
	if (geo.length > 1) {
		productJson._geoloc = [];
		for (var g = 0; g < geo.length; g++) {
			productJson._geoloc.push({
				lat: geo[g].lat,
				lng: geo[g].lng
			})
		}
	} else if ((geo.length > 0) && (productListItem !== undefined) && (productListItem.lat !== null) && (productListItem.lng !== null)) {
		productJson._geoloc = {
			lat: productListItem.lat,
			lng: productListItem.lng
		}
	}
}



var populateConditionTitle = (conditionName) => {
	var title = "";

	switch (conditionName) {
		case "New":
			title = "New";
			break;

		case "Like New":
			title = "Open Box - Like New";
			break;

		case "Good":
			title = "Open Box - Good";
			break;

		case "Fair":
			title = "Open Box - Fair";
			break;

		case "Damaged":
			title = "Open Box - Priced For Condition";
			break;

	}

	return title
}



module.exports = {
	getSearchProducts,
	manageSearchProducts
}