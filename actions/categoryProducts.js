'use strict';

const _ = require('lodash');

const globals = require('../globals');
const { formatResp } = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

const CategoryProducts = require('../models/categoryProducts');
const Members = require('../models/members');



var getCategoryProducts = async (req, clWhereInfo, vcWhereInfo, sortBy, offset, limit, resp) => {
	var prom = [];
	var qsCoinWhereInfo = {
		join: '',
		clause: 'WHERE 1=1 ',
		values: []
	}


	//	If no member id supplied look up any member id from the market specified.  This is the most straightforward
	//	way to accommodate using a market without having to change anything downstream.
	if (req.query.memberId === undefined) {
		req.query.memberId = await Members.getMemberIdForMarket(req.query.market);
	}


	prom.push(CategoryProducts.getSizeAttributeLabels());
	prom.push(CategoryProducts.getCategoryProducts(req.query.categorySlug, req.query.memberId, clWhereInfo));

	var results = await Promise.all(prom);
	var sizeAttributeLabels = results[0];
	var prods = results[1];

	//	Loop through products finding representative sku for each vendor sku and separating out quick sales.
	var quickSales = [];
	var vcSkus = {
		qscoinskus: "",
		vskus: ""
	}
	deDupeProducts(prods, vcSkus, quickSales);

	//	Format size filter clause
	formatSizeFilterClause(req.query.size, sizeAttributeLabels, vcWhereInfo);

	//	Get filtered COINs
	var filteredCoins = [];
	// vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, "(" + vcSkus.vskus + ")");
	// qsCoinWhereInfo = sqlUtils.appendWhere(qsCoinWhereInfo, "(" + vcSkus.qscoinskus + ")");

	if (vcSkus.vskus.length > 0) {
		var sizeLabel = determineSizeLabel(req.query.categorySlug);

		//	Get possible attribute values.
		//	Get COIN data and perform filtering from VC side.
		prom = [];
		prom.push(CategoryProducts.getFilteredCOINs(vcSkus.vskus, vcWhereInfo));
		//	Removing as part of 12/20/22 cleanup
		// prom.push(CategoryProducts.getPossibleAttributeValues(vcSkus.vskus, vcWhereInfo));
		if (vcSkus.qscoinskus.length > 0) {
			prom.push(CategoryProducts.getFilteredCOINs(vcSkus.qscoinskus, qsCoinWhereInfo));
		}

		results = await Promise.all(prom);
		filteredCoins = results[0];
		var attributeValues = [];

		var qsCoins = null;
		if (vcSkus.qscoinskus.length > 0) {
			qsCoins = results[1];
		}

		populateQSCoins(quickSales, qsCoins);

		// console.log("filtercoins: " + filteredCoins.length);
		// console.log("attributeValues: " + attributeValues.length);
		// console.log(JSON.stringify(attributeValues, undefined, 2));

		resp.metaData.attributes = assembleAttributes(sizeLabel, sizeAttributeLabels, attributeValues, quickSales);
		prom = [];
		prom.push(imagesFilteredCoins(filteredCoins));
		prom.push(imagesQuickSale(quickSales));

		await Promise.all(prom);

		filteredCoins = _.concat(filteredCoins, quickSales);
	}

	// Whittle down to common vendor skus and copy COIN data over.
	intersectData(prods, filteredCoins, resp);

	finalizeProductData(resp, filteredCoins, sizeAttributeLabels);

	enableActiveProductAttributes(resp);

	resp.metaData.totalCount = resp.data.categoryProducts.length;


	doSort(resp, sortBy);

	if (offset < resp.data.categoryProducts.length) {
		var end = offset + limit;
		if ((offset + limit) > resp.data.categoryProducts.length) {
			end = resp.data.categoryProducts.length;
		}
		resp.data.categoryProducts = _.slice(resp.data.categoryProducts, offset, end);

	} else {
		resp.data.categoryProducts = [];
	}

	await finalizeImageData(resp);

	if (resp.data.categoryProducts.length === 0) {
		delete resp.data;
		resp = formatResp(resp, undefined, 404, 'No products found.');
	}

	return resp;
}




var intersectData = (prods, filteredCoins, resp) => {
	resp.data.categoryProducts = [];

	for (var i = 0; i < filteredCoins.length; i++) {
		var o = _.find(prods, function (p) {
			if (filteredCoins[i].sku !== undefined) {
				return p.sku === filteredCoins[i].sku;
			} else {
				return ((p.vendorSku !== undefined) && (filteredCoins[i].vendorSku !== undefined) && (p.vendorSku.toLowerCase() === filteredCoins[i].vendorSku.toLowerCase()))
				// return ((p.vendorId === filteredCoins[i].vendorSku) && (p.vendorSku.toLowerCase() === filteredCoins[i].vendorSku.toLowerCase()))
			}
		});
		if (o !== undefined) {
			resp.data.categoryProducts.push(o);
			_.remove(prods, function (p) {
				return p.sku === o.sku
			});
		}
	}

}


var populateQSCoins = (quickSales, qsCoins) => {
	if (qsCoins) {
		for (var i = 0; i < qsCoins.length; i++) {
			for (var j = 0; j < quickSales.length; j++) {
				if ((qsCoins[i].vendorSku === quickSales[j].vendorSku) && (qsCoins[i].vendorId === quickSales[j].vendorId)) {
					quickSales[j].coinId = qsCoins[i].coinId;
					quickSales[j].mpn = qsCoins[i].mpn;
				}
			}
		}
	}
}



var assembleAttributes = (sizeLabel, sizeAttributeLabels, attributeValues, quickSales) => {
	var sl = sizeLabel ? sizeLabel : "Size";
	var result = {
		color: {
			label: "Color",
			values: []
		},
		material: {
			label: "Material",
			values: []
		},
		size: {
			label: sl,
			values: []
		}
	}

	for (var i = 0; i < attributeValues.length; i++) {
		if (attributeValues[i].color !== null) {
			var s = _.split(attributeValues[i].color, ',');
			for (var j = 0; j < s.length; j++) {
				if (_.findIndex(result.color.values, {
						value: s[j].trim()
					}) === -1) {
					result.color.values.push({
						value: s[j].trim(),
						enabledFlag: false
					});
				}
			}
		}

		if (attributeValues[i].material !== null) {
			var s = _.split(attributeValues[i].material, ',');
			for (var j = 0; j < s.length; j++) {
				if (_.findIndex(result.material.values, {
						value: s[j].trim()
					}) === -1) {
					result.material.values.push({
						value: s[j].trim(),
						enabledFlag: false
					});
				}
			}
		}

		if (sizeLabel !== undefined) {
			if ((attributeValues[i].attval3 !== null) && (attributeValues[i].attname3 !== undefined) &&
				(attributeValues[i].attname3 !== null) && (_.findIndex(sizeAttributeLabels, {
					value: attributeValues[i].attname3.toLowerCase()
				}) !== -1)) {
				var s = _.split(attributeValues[i].attval3, ',');
				for (var j = 0; j < s.length; j++) {
					if (_.findIndex(result.size.values, {
							value: s[j].trim()
						}) === -1) {
						result.size.values.push({
							value: s[j].trim(),
							enabledFlag: false
						});
					}
				}
			} else if ((attributeValues[i].attval2 !== null) && (attributeValues[i].attname2 !== undefined) &&
				(attributeValues[i].attname2 !== null) && (_.findIndex(sizeAttributeLabels, {
					value: attributeValues[i].attname2.toLowerCase()
				}) !== -1)) {
				var s = _.split(attributeValues[i].attval2, ',');
				for (var j = 0; j < s.length; j++) {
					if (_.findIndex(result.size.values, {
							value: s[j].trim()
						}) === -1) {
						result.size.values.push({
							value: s[j].trim(),
							enabledFlag: false
						});
					}
				}
			} else if ((attributeValues[i].attval1 !== null) && (attributeValues[i].attname1 !== undefined) &&
				(attributeValues[i].attname1 !== null) && (_.findIndex(sizeAttributeLabels, {
					value: attributeValues[i].attname1.toLowerCase()
				}) !== -1)) {
				var s = _.split(attributeValues[i].attval1, ',');
				for (var j = 0; j < s.length; j++) {
					if (_.findIndex(result.size.values, {
							value: s[j].trim()
						}) === -1) {
						result.size.values.push({
							value: s[j].trim(),
							enabledFlag: false
						});
					}
				}
			}
		}
	}


	//	Add in quick sale attributes.
	for (var i = 0; i < quickSales.length; i++) {
		if ((quickSales[i].color !== null) && (quickSales[i].color.length > 0)) {
			var s = _.split(quickSales[i].color, ',');
			for (var j = 0; j < s.length; j++) {
				if (_.findIndex(result.color.values, {
						value: s[j].trim()
					}) === -1) {
					result.color.values.push({
						value: s[j].trim(),
						enabledFlag: false
					});
				}
			}
		}

		if ((quickSales[i].material !== null) && (quickSales[i].material.length > 0)) {
			var s = _.split(quickSales[i].material, ',');
			for (var j = 0; j < s.length; j++) {
				if (_.findIndex(result.material.values, {
						value: s[j].trim()
					}) === -1) {
					result.material.values.push({
						value: s[j].trim(),
						enabledFlag: false
					});
				}
			}
		}

		if ((quickSales[i].size !== null) && (quickSales[i].size.length > 0)) {
			var s = _.split(quickSales[i].size, ',');
			for (var j = 0; j < s.length; j++) {
				//console.log(_.findIndex(result.size.values, {
				//	value: s[j].trim()
				//}));
				if (_.findIndex(result.size.values, {
						value: s[j].trim()
					}) === -1) {
					result.size.values.push({
						value: s[j].trim(),
						enabledFlag: false
					});
				}
			}
		}
	}

	result.color.values = _.uniq(_.orderBy(result.color.values, ['value'], ['asc']));
	result.material.values = _.uniq(_.orderBy(result.material.values, ['value'], ['asc']));
	result.size.values = _.uniq(_.orderBy(result.size.values, ['value'], ['asc']));

	return result;
}



var deDupeProducts = (prods, vcSkus, quickSales) => {
	var lastVendorSku = "";
	var lastVendorIndex = -1;

	for (var i = 0; i < prods.length; i++) {
		//	If new vendor sku or same vendor sku for a OQS sku, add to results.
		if ((prods[i].vendorSku !== lastVendorSku) ||
			((prods[i].vendorSku === lastVendorSku) && (prods[i].onlineQuickSale === 'Y'))) {

			lastVendorIndex = i;
			prods[lastVendorIndex].quantity = 1;
			lastVendorSku = prods[i].vendorSku;
			//console.log("vsku: " + prods[i].vendorSku + "   " + prods[i].onlineQuickSale);

			//	If not a quick sale sku, add it to the list to be pulled and filtered on the VC side.
			if (prods[i].onlineQuickSale !== 'Y') {
				if (vcSkus.vskus.length > 0) {
					vcSkus.vskus += " OR ";
				}

				vcSkus.vskus += "(p.vendor_id = '" + prods[i].vendorId + "' AND p.vendor_sku = '" + prods[i].vendorSku.replace(/'/g, "\\'") + "')";
			} else {
				if (vcSkus.qscoinskus.length > 0) {
					vcSkus.qscoinskus += " OR ";
				}

				vcSkus.qscoinskus += "(p.vendor_id = '" + prods[i].vendorId + "' AND p.vendor_sku = '" + prods[i].vendorSku.replace(/'/g, "\\'") + "')";

				//	Keep track of the quicksale "COINs" so we can fake out the intersection call coming up.
				quickSales.push({
					quantity: 1,
					coinId: null,
					sku: prods[i].sku,
					vendorSku: prods[i].vendorSku,
					vendorId: prods[i].vendorId,
					color: prods[i].color,
					material: prods[i].material,
					size: prods[i].size,
					image: prods[i].image
				});
			}
		} else {
			prods[lastVendorIndex].quantity++;
		}
	}

	// console.log("quick sales: " + quickSales.length);
	// console.log(JSON.stringify(quickSales, undefined, 2));
}



var determineSizeLabel = (categorySlug) => {
	switch (categorySlug) {
		case "beds":
			return "Bed Size";
			break;

		case "mattresses":
			return "Bed Size";
			break;

		case "headboards":
			return "Bed Size";
			break;

		case "bed-sheets":
			return "Bed Size";
			break;

		case "bedding-and-sets":
			return "Bed Size";
			break;

		case "bed-frames-and-box-springs":
			return "Bed Size";
			break;

		case "area-rugs":
			return "Rug Size";
			break;

		case "outdoor-rugs":
			return "Rug Size";
			break;

		case "curtains-and-hardware":
			return "Curtain Length";
			break;

		default:
			return undefined;
			break;
	}
}


var doSort = (resp, sortBy) => {
	var sortFields = [];
	var sortDirection = [];

	var s = _.split(sortBy, ',');
	for (var i = 0; i < s.length; i++) {
		sortFields.push(s[i].substring(0, s[i].indexOf(':')));
		sortDirection.push(s[i].substring(s[i].indexOf(':') + 1).toLowerCase());
	}
	resp.data.categoryProducts = _.orderBy(resp.data.categoryProducts, sortFields, sortDirection);
}



var enableActiveProductAttributes = (resp) => {
	for (var i = 0; i < resp.data.categoryProducts.length; i++) {
		var colorIndex = _.findIndex(resp.metaData.attributes.color.values, {
			value: resp.data.categoryProducts[i].color
		});
		if (colorIndex !== -1) {
			resp.metaData.attributes.color.values[colorIndex].enabledFlag = true;
		}

		var materialIndex = _.findIndex(resp.metaData.attributes.material.values, {
			value: resp.data.categoryProducts[i].material
		});
		if (materialIndex !== -1) {
			resp.metaData.attributes.material.values[materialIndex].enabledFlag = true;
		}

		var sizeIndex = _.findIndex(resp.metaData.attributes.size.values, {
			value: resp.data.categoryProducts[i].size
		});
		if (sizeIndex !== -1) {
			resp.metaData.attributes.size.values[sizeIndex].enabledFlag = true;
		}

	}
}


var finalizeImageData = async (resp) => {
	var prom = [];

	for (var i = 0; i < resp.data.categoryProducts.length; i++) {
		prom.push(globals.pool.query("SELECT url FROM files WHERE sku = ? AND (tag IN ('damage', 'market')) ", resp.data.categoryProducts[i].sku));
	}

	var results = await Promise.all(prom);
	for (var i = 0; i < resp.data.categoryProducts.length; i++) {
		var images = results[i];
		for (var j = 0; j < images.length; j++) {
			resp.data.categoryProducts[i].images.push(images[j].url)
		}
	}
}


var finalizeProductData = (resp, filteredCoins, sizeAttributeLabels) => {
	for (var i = 0; i < resp.data.categoryProducts.length; i++) {
		var fc = _.find(filteredCoins, function (f) {

			//	If the sku exists, match on it. Should only apply to quick sales.
			if (f.sku !== undefined) {
				return f.sku === resp.data.categoryProducts[i].sku
			}
			//	Otherwise match on vendor sku.
			else {
				return f.vendorSku === resp.data.categoryProducts[i].vendorSku;
			}
		});

		if (fc !== undefined) {
			resp.data.categoryProducts[i].vendorCatalogProduct = {};
			resp.data.categoryProducts[i].vendorCatalogProduct.productDescription = null;

			//	Quick Sale
			if (resp.data.categoryProducts[i].onlineQuickSale === 'Y') {
				resp.data.categoryProducts[i].mpn = fc.mpn;
				resp.data.categoryProducts[i].images = [];
				resp.data.categoryProducts[i].images.push(resp.data.categoryProducts[i].image);
				delete resp.data.categoryProducts[i].image;

				// if ((resp.data.categoryProducts[i].bullets !== undefined) && (resp.data.categoryProducts[i].bullets !== null) && (resp.data.categoryProducts[i].bullets.length > 0)) {
				// 	var s = _.split(resp.data.categoryProducts[i].bullets, '|');
				// 	for (var j = 0; j < s.length; j++) {
				// 		resp.data.categoryProducts[i].bulletPoints.push(s[j]);
				// 	}
				// }

				// resp.data.categoryProducts[i].bullets = resp.data.categoryProducts[i].bulletPoints;

			} 

			//	Non-Quick Sale
			else {
				resp.data.categoryProducts[i].mpn = fc.mpn;
				if ((fc.msrp !== undefined) && (fc.msrp !== null)) {
					resp.data.categoryProducts[i].msrp = fc.msrp;
				}
				if (resp.data.categoryProducts[i].color === null) {
					resp.data.categoryProducts[i].color = fc.color;
				}
				if (resp.data.categoryProducts[i].material === null) {
					resp.data.categoryProducts[i].material = fc.material;
				}
				if (resp.data.categoryProducts[i].size === null) {
					if ((fc.attval3 !== null) && (fc.attname3 !== undefined) &&
						(fc.attname3 !== null) && (_.findIndex(sizeAttributeLabels, {
							value: fc.attname3.toLowerCase()
						}) !== -1)) {
						resp.data.categoryProducts[i].size = fc.attval3;
					} else if ((fc.attval2 !== null) && (fc.attname2 !== undefined) &&
						(fc.attname2 !== null) && (_.findIndex(sizeAttributeLabels, {
							value: fc.attname2.toLowerCase()
						}) !== -1)) {
						resp.data.categoryProducts[i].size = fc.attval2;
					}
					if ((fc.attval1 !== null) && (fc.attname1 !== undefined) &&
						(fc.attname1 !== null) && (_.findIndex(sizeAttributeLabels, {
							value: fc.attname1.toLowerCase()
						}) !== -1)) {
						resp.data.categoryProducts[i].size = fc.attval1;
					}
				}

				resp.data.categoryProducts[i].vendorCatalogProduct.productDescription = fc.productDescription;
				resp.data.categoryProducts[i].vendorCatalogProduct.primaryMaterial = fc.primaryMaterial;
				resp.data.categoryProducts[i].vendorCatalogProduct.secondaryMaterial = fc.secondaryMaterial;
				resp.data.categoryProducts[i].vendorCatalogProduct.materialSpecific = fc.materialSpecific;
				resp.data.categoryProducts[i].vendorCatalogProduct.primaryColor = fc.primaryColor;
				resp.data.categoryProducts[i].vendorCatalogProduct.colorSpecific = fc.colorSpecific;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeName1 = fc.attname1;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeName2 = fc.attname2;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeName3 = fc.attname3;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeName4 = fc.attributeName4;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeName5 = fc.attributeName5;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeName6 = fc.attributeName6;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeValue1 = fc.attval1;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeValue2 = fc.attval2;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeValue3 = fc.attval3;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeValue4 = fc.attributeValue4;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeValue5 = fc.attributeValue5;
				resp.data.categoryProducts[i].vendorCatalogProduct.attributeValue6 = fc.attributeValue6;
				resp.data.categoryProducts[i].vendorCatalogProduct.bullets = [];
				if (fc.bulletPoint1 != null) {
					resp.data.categoryProducts[i].vendorCatalogProduct.bullets.push(fc.bulletPoint1);
				}
				if (fc.bulletPoint2 != null) {
					resp.data.categoryProducts[i].vendorCatalogProduct.bullets.push(fc.bulletPoint2);
				}
				if (fc.bulletPoint3 != null) {
					resp.data.categoryProducts[i].vendorCatalogProduct.bullets.push(fc.bulletPoint3);
				}
				if (fc.bulletPoint4 != null) {
					resp.data.categoryProducts[i].vendorCatalogProduct.bullets.push(fc.bulletPoint4);
				}
				resp.data.categoryProducts[i].vendorCatalogProduct.productWidth = fc.productWidth;
				resp.data.categoryProducts[i].vendorCatalogProduct.productDepth = fc.productDepth;
				resp.data.categoryProducts[i].vendorCatalogProduct.productHeight = fc.productHeight;
				resp.data.categoryProducts[i].vendorCatalogProduct.additionalDims = fc.additionalDims;
				resp.data.categoryProducts[i].vendorCatalogProduct.styleTag1 = fc.styleTag1;
				resp.data.categoryProducts[i].vendorCatalogProduct.styleTag2 = fc.styleTag2;
				resp.data.categoryProducts[i].vendorCatalogProduct.coinId = fc.coinId;
				resp.data.categoryProducts[i].images = fc.images;
				delete resp.data.categoryProducts[i].image;
			}

			resp.data.categoryProducts[i].totalQuantity = fc.totalQuantity;
			resp.data.categoryProducts[i].name = ((resp.data.categoryProducts[i].onlineQuickSale !== 'Y') && (fc.productName !== undefined) && (fc.productName !== null)) ? fc.productName : resp.data.categoryProducts[i].name;
			resp.data.categoryProducts[i].brand = (resp.data.categoryProducts[i].manufacturer != null && resp.data.categoryProducts[i].manufacturer.replace(/-?/g, "") !== "") ? resp.data.categoryProducts[i].manufacturer : (fc.vendorName != null) ? fc.vendorName : "";
			resp.data.categoryProducts[i].vendorName = (resp.data.categoryProducts[i].vendorName != null && resp.data.categoryProducts[i].vendorName.replace(/-?/g, "") !== "") ? resp.data.categoryProducts[i].vendorName : (fc.vendorName != null) ? fc.vendorName : "";
			resp.data.categoryProducts[i].coinId = fc.coinId;
			resp.data.categoryProducts[i].conditions = fc.conditions;


			_.remove(filteredCoins, function (f) {
				f.sku === fc.sku
			});
		}
	}
}




var formatSizeFilterClause = (size, sizeAttributeLabels, vcWhereInfo) => {
	if (size !== undefined) {
		var sizeLabels = [];
		var sizePlaceholders = "";

		for (var i = 0; i < sizeAttributeLabels.length; i++) {
			if (sizeLabels.length > 0) {
				sizePlaceholders += ", ";
			}
			sizeLabels.push(sizeAttributeLabels[i].value);
			sizePlaceholders += "? ";
		}

		var values = _.concat(sizeLabels, size, sizeLabels, size, sizeLabels, size)
		//	Find size wherever it is.   6/30/2020 Check first 3 attribute values (Jill).
		vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, "(((attribute_name1 IN (" + sizePlaceholders + ")) AND (attribute_value1 = ?)) OR " +
			"((attribute_name2 IN (" + sizePlaceholders + ")) AND (attribute_value2 = ?)) OR " +
			"((attribute_name3 IN  (" + sizePlaceholders + ")) AND (attribute_value3 = ?))) ", values);
	}

}


var imagesFilteredCoins = async (filteredCoins) => {
	var prom = [];

	for (var i = 0; i < filteredCoins.length; i++) {
		filteredCoins[i].images = [];

		//	Normal COIN
		if ((filteredCoins[i].image1 !== undefined) && (filteredCoins[i].image1 !== null) && (filteredCoins[i].image1.length > 0)) {
			filteredCoins[i].images.push(filteredCoins[i].image1);
		}
		if ((filteredCoins[i].image2 !== undefined) && (filteredCoins[i].image2 !== null) && (filteredCoins[i].image2.length > 0)) {
			filteredCoins[i].images.push(filteredCoins[i].image2);
		}
		if ((filteredCoins[i].image3 !== undefined) && (filteredCoins[i].image3 !== null) && (filteredCoins[i].image3.length > 0)) {
			filteredCoins[i].images.push(filteredCoins[i].image3);
		}
		if ((filteredCoins[i].image4 !== undefined) && (filteredCoins[i].image4 !== null) && (filteredCoins[i].image4.length > 0)) {
			filteredCoins[i].images.push(filteredCoins[i].image4);
		}
		if ((filteredCoins[i].image5 !== undefined) && (filteredCoins[i].image5 !== null) && (filteredCoins[i].image5.length > 0)) {
			filteredCoins[i].images.push(filteredCoins[i].image5);
		}
	}
}


var imagesQuickSale = async (quickSales) => {
	for (var i = 0; i < quickSales.length; i++) {
		quickSales[i].images = [];
		quickSales[i].images.push(quickSales[i].image);
	}
}



var getCategoryProductsBySlug = async (req, soldTimeFrame, vcWhereInfo, sortBy, offset, limit, resp) => {
	var prom = [];
	var qsCoinWhereInfo = {
		join: '',
		clause: 'WHERE 1=1 ',
		values: []
	}

	prom.push(CategoryProducts.getSizeAttributeLabels());
	prom.push(CategoryProducts.getCategoryProductsBySlug(req.query.categorySlug, soldTimeFrame));

	var results = await Promise.all(prom);
	var sizeAttributeLabels = results[0];
	var prods = results[1].products;


	//	Loop through products finding representative sku for each vendor sku and separating out quick sales.
	var quickSales = [];
	var vcSkus = {
		qscoinskus: "",
		vskus: ""
	}
	deDupeProducts(prods, vcSkus, quickSales);

	//	Format size filter clause
	formatSizeFilterClause(req.query.size, sizeAttributeLabels, vcWhereInfo);

	//	Get filtered COINs
	var filteredCoins = [];
	// vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, "(" + vcSkus.vskus + ")");
	// qsCoinWhereInfo = sqlUtils.appendWhere(qsCoinWhereInfo, "(" + vcSkus.qscoinskus + ")");

	if (vcSkus.vskus.length > 0) {
		var sizeLabel = determineSizeLabel(req.query.categorySlug);

		//	Get possible attribute values.
		//	Get COIN data and perform filtering from VC side.
		prom = [];
		prom.push(CategoryProducts.getFilteredCOINs(vcSkus.vskus, vcWhereInfo));

		//	Removing as part of 12/20/22 cleanup
		// prom.push(CategoryProducts.getPossibleAttributeValues(vcSkus.vskus, vcWhereInfo));
		if (vcSkus.qscoinskus.length > 0) {
			prom.push(CategoryProducts.getFilteredCOINs(vcSkus.qscoinskus, qsCoinWhereInfo));
		}

		results = await Promise.all(prom);
		filteredCoins = results[0];

		var attributeValues = [];
		var qsCoins = null;
		if (vcSkus.qscoinskus.length > 0) {
			qsCoins = results[1];
		}

		populateQSCoins(quickSales, qsCoins);
		resp.metaData.attributes = assembleAttributes(sizeLabel, sizeAttributeLabels, attributeValues, quickSales);
		prom = [];
		prom.push(imagesFilteredCoins(filteredCoins));
		prom.push(imagesQuickSale(quickSales));
		await Promise.all(prom);
		filteredCoins = _.concat(filteredCoins, quickSales);

		// This is non-performant and no longer necessary.
		// await conditionsByCoin(filteredCoins);

	}


	// Whittle down to common vendor skus and copy COIN data over.
	intersectData(prods, filteredCoins, resp);
	finalizeProductData(resp, filteredCoins, sizeAttributeLabels);
	enableActiveProductAttributes(resp);
	resp.metaData.totalCount = resp.data.categoryProducts.length;
	doSort(resp, sortBy);

	if (offset < resp.data.categoryProducts.length) {
		var end = offset + limit;
		if ((offset + limit) > resp.data.categoryProducts.length) {
			end = resp.data.categoryProducts.length;
		}
		resp.data.categoryProducts = _.slice(resp.data.categoryProducts, offset, end);
	} else {
		resp.data.categoryProducts = [];
	}

	await finalizeImageData(resp);

	if (resp.data.categoryProducts.length === 0) {
		delete resp.data;
		resp = formatResp(resp, undefined, 404, 'No products found.');
	}

	return resp;
}


var conditionsByCoin = async (filteredCoins) => {

	for (var i = 0; i < filteredCoins.length; i++) {
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

		//	Get all vendor_id and vendor_sku pairs for the coin.
		// var v = await Coins.getVendorSkuByCoinId(filteredCoins[i].coinId);
		// var vskus = '';
		// for (var j = 0; j < v.length; j++) {
		// 	if (vskus.length > 0) {
		// 		vskus += ',';
		// 	}
		// 	vskus += `'${v[j].vendorId}${v[j].vendorSku}'`;
		// }


		var c = null;
		if (filteredCoins[i].sku !== undefined) {
			c = await CategoryProducts.getConditionsBySku(filteredCoins[i].sku);
			totalQuantity = 1;
		} else {
			c = await CategoryProducts.getConditionsByCoin(filteredCoins[i].coinId);
			var count = await CategoryProducts.countTotalQuantityByCoin(filteredCoins[i].coinId);
			totalQuantity = count[0].qty;
		}
		if (c.length > 0) {
			var s = _.split(c[0].conditions, ',');
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
							if (!likeNewFlag || (price < likeNewPrice)) {
								likeNewFlag = true;
								likeNewPrice = price;
							}
							break;

						case 'New':
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
		}

		// console.log(JSON.stringify(conditions, undefined, 2));
		filteredCoins[i].totalQuantity = totalQuantity;
		filteredCoins[i].conditions = conditions;
	}
}


var newConditionsByCoin = async (filteredCoins) => {

	for (var i = 0; i < filteredCoins.length; i++) {
		var conditions = [];
		var totalQuantity = 0;

		var prom = [];
		var results = null;

		//	Get all vendor_id and vendor_sku pairs for the coin.
		// var v = await Coins.getVendorSkuByCoinId(filteredCoins[i].coinId);
		// var vskus = '';
		// for (var j = 0; j < v.length; j++) {
		// 	if (vskus.length > 0) {
		// 		vskus += ',';
		// 	}
		// 	vskus += `'${v[j].vendorId}${v[j].vendorSku}'`;
		// }


		var c = null;
		if (filteredCoins[i].sku !== undefined) {
			// c = await CategoryProducts.getConditionsBySku(filteredCoins[i].sku);
			prom.push(CategoryProducts.getLowestPriceBySkuCondition(filteredCoins[i].sku, 'Like New'));
			prom.push(CategoryProducts.getLowestPriceBySkuCondition(filteredCoins[i].sku, 'New'));
			prom.push(CategoryProducts.getLowestPriceBySkuCondition(filteredCoins[i].sku, 'Damaged'));
			prom.push(CategoryProducts.getLowestPriceBySkuCondition(filteredCoins[i].sku, 'Good'));
			prom.push(CategoryProducts.getLowestPriceBySkuCondition(filteredCoins[i].sku, 'Fair'));

			totalQuantity = 1;
		} else {
			prom.push(CategoryProducts.getLowestPriceByCondition(filteredCoins[i].coinId, 'Like New'));
			prom.push(CategoryProducts.getLowestPriceByCondition(filteredCoins[i].coinId, 'New'));
			prom.push(CategoryProducts.getLowestPriceByCondition(filteredCoins[i].coinId, 'Damaged'));
			prom.push(CategoryProducts.getLowestPriceByCondition(filteredCoins[i].coinId, 'Good'));
			prom.push(CategoryProducts.getLowestPriceByCondition(filteredCoins[i].coinId, 'Fair'));

			// c = await CategoryProducts.getConditionsByCoin(filteredCoins[i].coinId);
			var count = await CategoryProducts.countTotalQuantityByCoin(filteredCoins[i].coinId);
			totalQuantity = count[0].qty;
		}


		results = await Promise.all(prom);


		//	Like New
		if (results[0].length > 0) {
			var o = {
				name: 'Like New',
				price: results[0][0].price
			}
			conditions.push(o);
		}

		//	New
		if (results[1].length > 0) {
			var o = {
				name: 'New',
				price: results[1][0].price
			}
			conditions.push(o);
		}

		//	Damage
		if (results[2].length > 0) {
			var o = {
				name: 'Damage',
				price: results[2][0].price
			}
			conditions.push(o);
		}

		//	Good
		if (results[3].length > 0) {
			var o = {
				name: 'Good',
				price: results[3][0].price
			}
			conditions.push(o);
		}

		//	Fair
		if (results[4].length > 0) {
			var o = {
				name: 'Fair',
				price: results[4][0].price
			}
			conditions.push(o);
		}


		// console.log(JSON.stringify(conditions, undefined, 2));
		filteredCoins[i].totalQuantity = totalQuantity;
		filteredCoins[i].conditions = conditions;
	}
}


module.exports = {
	assembleAttributes,
	conditionsByCoin,
	determineSizeLabel,
	getCategoryProducts,
	getCategoryProductsBySlug
}