'use strict';

const _ = require('lodash');
const check = require('check-types');
const express = require('express');
const router = express.Router();
const validator = require('validator');

const {
	calculateMissingCubes,
	fixUpUPCs,
	getAll,
	getAmbiguous,
	getById,
	getDistinctCategories,
	getExportFormats,
	getExportJobs,
	queueExport,
	revalidate,
} = require('../actions/products');

const jwtUtils = require('../actions/jwtUtils');
const processReceiveRouter = require('./productsProcessReceive');
const processVerifyRouter = require('./productsProcessVerify');
const processReshippingRouter = require('./productsProcessReshipping');
const processConditionRouter = require('./productsProcessCondition');
const processLocateRouter = require('./productsProcessLocate');

const Partners = require('../models/partners');
const Vendors = require('../models/vendors');

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');
const {
	formatResp,
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');
const { getUserIdAndType } = require('../utils/userUtils');

//
//  GET /products
//
router.get(`/`, (req, res, next) => {
	try {
		var bubbleId = undefined;
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var rmCatId = 0;
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};
		var sortBy = 'product_name ASC';

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			if (req.query.rushCategory1) {
				rmCatId = req.query.rushCategory1;
			}

			if (req.query.rushCategory2) {
				rmCatId = req.query.rushCategory2;
			}

			if (req.query.filter) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.search_field LIKE ?', ['%' + req.query.filter + '%']);
			}

			if (req.query.status) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.status LIKE ?', req.query.status);
			}

			if (req.query.vendorId) {
				if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_id LIKE ?', req.query.vendorId);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_id LIKE ?', req.query.vendorId + '%');
				}
			}

			if (req.query.primaryCategory) {
				if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.primary_category LIKE ?', req.query.primaryCategory);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.primary_category LIKE ?', req.query.primaryCategory + '%');
				}
			}

			if (req.query.secondaryCategory) {
				if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.secondary_category LIKE ?', req.query.secondaryCategory);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.secondary_category LIKE ?', req.query.secondaryCategory + '%');
				}
			}

			if (req.query.productName) {
				if ((req.query.primaryCategory) || (rmCatId > 0)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_name LIKE ?', '%' + req.query.productName + '%');
				} else {
					if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_name LIKE ?', req.query.productName);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_name LIKE ?', req.query.productName + '%');
					}
				}
			}

			if (req.query.sku) {
				if (req.query.sku.indexOf(',') >= 0) {
					var s = _.split(req.query.sku, ',')
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku IN (' + placeholders + ')', s);
				} else {
					if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku LIKE ?', req.query.sku);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku LIKE ?', req.query.sku + '%');
					}
				}
			}

			if (req.query.variantSku) {
				if (req.query.variantSku.indexOf(',') >= 0) {
					var s = _.split(req.query.variantSku, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.variant_sku IN (' + placeholders + ')', s);
				} else {
					if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.variant_sku LIKE ?', req.query.variantSku);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.variant_sku LIKE ?', req.query.variantSku + '%');
					}
				}
			}

			if (req.query.upc) {
				if (req.query.upc.indexOf(',') >= 0) {
					var s = _.split(req.query.upc, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc IN (' + placeholders + ')', s);
				} else {
					if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc LIKE ?', req.query.upc);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc LIKE ?', req.query.upc + '%');
					}
				}
			}

			if (req.query.mpn) {
				if (req.query.mpn.indexOf(',') >= 0) {
					var s = _.split(req.query.mpn, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.mpn IN (' + placeholders + ')', s);
				} else {
					if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.mpn LIKE ?', req.query.mpn);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.mpn LIKE ?', req.query.mpn + '%');
					}
				}
			}

			if (req.query.coin) {
				if (req.query.coin.indexOf(',') >= 0) {
					var s = _.split(req.query.coin, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'c.coin_id IN (' + placeholders + ')', s);
				} else {
					if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'c.coin_id LIKE ?', req.query.coin);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'c.coin_id LIKE ?', req.query.coin + '%');
					}
				}
			}

			if (req.query.vendorSku) {
				if (req.query.vendorSku.indexOf(',') >= 0) {
					var s = _.split(req.query.vendorSku, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku IN (' + placeholders + ')', s);
				} else {
					if ((req.query.exactMatchFlag !== undefined) && (req.query.exactMatchFlag === 'true')) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku LIKE ?', req.query.vendorSku);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku LIKE ?', req.query.vendorSku + '%');
					}
				}
			}

			if ((req.query.trmEligibleFlag !== undefined) && (req.query.trmEligibleFlag !== null)) {
				if ((req.query.trmEligibleFlag === 'true') || (req.query.trmEligibleFlag === true)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_trm = 1');
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_trm = 0');
				}
			}

			if ((req.query.minQuantity) && (check.integer(parseInt(req.query.minQuantity)))) {
				var minQuantity = parseInt(req.query.minQuantity);
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory >= ?', minQuantity);
			}

			if ((req.query.minQuantity) && (check.integer(parseInt(req.query.minQuantity)))) {
				var minQuantity = parseInt(req.query.minQuantity);
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory >= ?', minQuantity);
			}

			if (req.query.zeroQuantity) {
				if (req.query.zeroQuantity === 'true') {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory = 0');
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory > 0');
				}
			}

			if (req.query.partnerType) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'vpt.type = ?', req.query.partnerType.trim());
				whereInfo.join = ' JOIN vendor_to_partner_types vtpt ON v.id = vtpt.vendor_id JOIN vendor_partner_types vpt ON vpt.id = vtpt.partner_type ';
			}

			if (req.query.bubbleId) {
				bubbleId = req.query.bubbleId;
				if (req.query.bubbleEligible) {
					if (req.query.bubbleEligible === 'true') {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_trm = 1');
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_trm = 0');
					}
				}

				if (req.query.onBubble) {
					if (req.query.onBubble === 'true') {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_product_id IS NOT NULL');
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_product_id IS NULL');
					}
				}
			}

			if (req.query.dateCreatedStart) {
				if (req.query.dateCreatedStart.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created >= ?', req.query.dateCreatedStart.substring(0, 10) + ' ' + req.query.dateCreatedStart.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created >= ?', req.query.dateCreatedStart.substring(0, 10) + ' 00:00:00');
				}
			}

			if (req.query.dateCreatedEnd) {
				if (req.query.dateCreatedEnd.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created <= ?', req.query.dateCreatedEnd.substring(0, 10) + ' ' + req.query.dateCreatedEnd.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created <= ?', req.query.dateCreatedEnd.substring(0, 10) + ' 00:00:00');
				}
			}

			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['sku', 'mpn', 'vendorName', 'productName', 'vendorSku', 'msrp', 'map_price', 'primaryCategory', 'secondaryCategory', 'primaryMaterial', 'coinId', 'upc', 'dropshipInventory']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}

			if ((sortBy != 'field') && (sortBy != 'direction')) {
				getAll(whereInfo, sortBy, offset, limit, resp, bubbleId, rmCatId)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ['id']);
					})
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



//
//  GET /products/ambiguousData
//
router.get(`/ambiguousData`, async (req, res, next) => {
	try {
		var coinFilter = null;
		var limit = 50;
		var liveProductsFlag = false;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var sortByField = 'liveCount';
		var sortByDir = 'desc';
		var vendorSkuFilter = null;
		var whereInfo = {
			clause: "",
			values: []
		};



		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}

		if ((req.query.coin !== undefined) && (req.query.coin !== null) && (req.query.coin.length > 0)) {
			if (req.query.coin.indexOf(',') >= 0) {
				var s = _.split(req.query.coin, ',')
				var placeholders = '';
				for (var i = 0; i < s.length; i++) {
					if (placeholders.length > 0) {
						placeholders += ', ';
					}
					placeholders += '?';
				}
				whereInfo = sqlUtils.appendWhere(whereInfo, 'coin_id IN (' + placeholders + ')', s);
			} else {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'coin_id = ?', req.query.coin);
			}
		}

		if ((req.query.vendorSku !== undefined) && (req.query.vendorSku !== null) && (req.query.vendorSku.length > 0)) {
			if (req.query.vendorSku.indexOf(',') >= 0) {
				var s = _.split(req.query.vendorSku, ',')
				var placeholders = '';
				for (var i = 0; i < s.length; i++) {
					if (placeholders.length > 0) {
						placeholders += ', ';
					}
					placeholders += '?';
				}
				whereInfo = sqlUtils.appendWhere(whereInfo, 'coin_id IN (SELECT coin_id FROM coins_to_vendor_skus WHERE vendor_sku IN (' + placeholders + '))', s);
			} else {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'coin_id IN (SELECT coin_id FROM coins_to_vendor_skus WHERE vendor_sku = ?)', req.query.vendorSku);
			}
		}

		if ((req.query.liveProductsFlag !== undefined) && (req.query.liveProductsFlag === "true")) {
			liveProductsFlag = true;
		}

		if (req.query.sortBy) {
			var sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['liveCount', 'coinId', 'vendorSkuCount']);

			if (sortBy === 'field') {
				respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
			} else if (sortBy === 'direction') {
				respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
			} else {
				if (sortBy.indexOf('liveCount') > -1) {
					sortByField = 'liveCount';
				} else if (sortBy.indexOf('coin_id') > -1) {
					sortByField = 'coinId';
				} else if (sortBy.indexOf('vendor_sku_count') > -1) {
					sortByField = 'vendorSkuCount';
				}

				if (sortBy.indexOf('DESC') > -1) {
					sortByDir = 'desc';
				} else {
					sortByDir = 'asc';
				}
			}
		}


		if ((sortBy != 'field') && (sortBy != 'direction')) {
			resp = await getAmbiguous(whereInfo, sortByField, sortByDir, offset, limit, liveProductsFlag, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  POST /products/lookup
//
router.post(`/lookup`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var bubbleId = undefined;
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var rmCatId = null;
		var manifestId = null;
		var filter = null;
		let storeIdRows = [];
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};
		var sortBy = 'product_name ASC';

		if ((req.get('x-app-type') === 'EXT') && 
				((req.decoded.identity === undefined) || ((req.decoded.identity.type !== 'PARTNER') && (req.decoded.identity.type !== 'PARTNERUSER')))) {
			response.respond(resp, res, next, ['metaData', 'data'], 403, 'Access denied.');
			return;
		}

		if (req.get('x-app-type') === 'EXT') {
			if (req.decoded.identity.type === 'PARTNER') {
				storeIdRows = await Partners.getAllFacilityStoreIdsByPartnerId(req.decoded.identity.partnerId);
			}
			if (req.decoded.identity.type === 'PARTNERUSER') {
				storeIdRows = await Partners.getAllFacilityStoreIdsByPartnerUserId(req.decoded.identity.partnerId, req.decoded.identity.userId);
			}
		}
		else {
			storeIdRows.push({storeId: req.body.storeId});
		}


		if ((req.body.limit) && (check.integer(parseInt(req.body.limit)))) {
			limit = parseInt(req.body.limit);
		}

			if ((req.body.offset) && (check.integer(parseInt(req.body.offset)))) {
				offset = parseInt(req.body.offset);
			}

			if (req.body.manifestId) {
				manifestId = req.body.manifestId;
			}

			if (req.body.rushCategory1) {
				rmCatId = req.body.rushCategory1;
			}

			if (req.body.rushCategory2) {
				rmCatId = req.body.rushCategory2;
			}

			if (req.body.filter) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.search_field LIKE ?', ['%' + req.body.filter + '%']);
				filter = req.body.filter;
			}

			if (req.body.status) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.status LIKE ?', req.body.status);
			}

			if (req.body.pullDataForwardFlag !== undefined) {
				if ((req.body.pullDataForwardFlag === true) || (req.body.pullDataForwardFlag === "true") ||
					(req.body.pullDataForwardFlag === "1") || (req.body.pullDataForwardFlag === 1)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.pull_data_forward_flag = 1');
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.pull_data_forward_flag = 0');
				}
			}

			if (req.body.vendorId) {
				if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_id LIKE ?', req.body.vendorId);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_id LIKE ?', req.body.vendorId + '%');
				}
			}

			if (req.body.primaryCategory) {
				if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.primary_category LIKE ?', req.body.primaryCategory);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.primary_category LIKE ?', req.body.primaryCategory + '%');
				}
			}

			if (req.body.secondaryCategory) {
				if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.secondary_category LIKE ?', req.body.secondaryCategory);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.secondary_category LIKE ?', req.body.secondaryCategory + '%');
				}
			}

			if (req.body.productName) {
				if ((req.body.primaryCategory) || (rmCatId > 0)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_name LIKE ?', '%' + req.body.productName + '%');
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_name LIKE ?', req.body.productName);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_name LIKE ?', req.body.productName + '%');
					}
				}
			}

			if (req.body.sku) {
				if (req.body.sku.indexOf(',') >= 0) {
					var s = _.split(req.body.sku, ',')
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku IN (' + placeholders + ')', s);
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku LIKE ?', req.body.sku);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku LIKE ?', req.body.sku + '%');
					}
				}
			}

			if (req.body.variantSku) {
				if (req.body.variantSku.indexOf(',') >= 0) {
					var s = _.split(req.body.variantSku, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.variant_sku IN (' + placeholders + ')', s);
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.variant_sku LIKE ?', req.body.variantSku);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.variant_sku LIKE ?', req.body.variantSku + '%');
					}
				}
			}

			if (req.body.upc) {
				if (req.body.upc.indexOf(',') >= 0) {
					var s = _.split(req.body.upc, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc IN (' + placeholders + ')', s);
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc LIKE ?', req.body.upc);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc LIKE ?', req.body.upc + '%');
					}
				}
			}

			if (req.body.mpn) {
				if (req.body.mpn.indexOf(',') >= 0) {
					var s = _.split(req.body.mpn, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.mpn IN (' + placeholders + ')', s);
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.mpn LIKE ?', req.body.mpn);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.mpn LIKE ?', req.body.mpn + '%');
					}
				}
			}

			if (req.body.coin) {
				if (req.body.coin.indexOf(',') >= 0) {
					var s = _.split(req.body.coin, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'c.coin_id IN (' + placeholders + ')', s);
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'c.coin_id LIKE ?', req.body.coin);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'c.coin_id LIKE ?', req.body.coin + '%');
					}
				}
			}

			if (req.body.vendorSku) {
				//	2/28/23 Brad came across vendor skus with commas in them.   We're disabling the passing lists of vendor skus
				//	but keeping the code for now just in case.
				//
				// if (req.body.vendorSku.indexOf(',') >= 0) {
				// 	var s = _.split(req.body.vendorSku, ',');
				// 	var placeholders = '';
				// 	for (var i = 0; i < s.length; i++) {
				// 		if (placeholders.length > 0) {
				// 			placeholders += ', ';
				// 		}
				// 		placeholders += '?';
				// 	}
				// 	whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku IN (' + placeholders + ')', s);
				// } else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku LIKE ?', req.body.vendorSku);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku LIKE ?', req.body.vendorSku + '%');
					}
				// }
			}

			if (req.body.vendorSkus) {
				var sql = ``;
				var vals = [];
				for (var i = 0; i < req.body.vendorSkus.length; i++) {
					if (sql.length > 0) {
						sql += ` OR `;
					}

					if (req.body.vendorSkus[i].vendorSku !== undefined) {
						sql += `((p.vendor_sku = ?)`;

						if (req.body.vendorSkus[i].vendorId !== undefined) {
							sql += ` AND (p.vendor_id = ?) `
						}
						sql += `)`;
						vals.push(req.body.vendorSkus[i].vendorSku);

						if (req.body.vendorSkus[i].vendorId !== undefined) {
							vals.push(req.body.vendorSkus[i].vendorId);
						}
					}
				}
				if (sql.length > 0) {
					whereInfo = sqlUtils.appendWhere(whereInfo, `(${sql})`, vals);
				}
			}

			if ((req.body.trmEligibleFlag !== undefined) && (req.body.trmEligibleFlag !== null)) {
				if ((req.body.trmEligibleFlag === 'true') || (req.body.trmEligibleFlag === true)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_trm = 1');
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_trm = 0');
				}
			}

			if ((req.body.eligibleForDropship !== undefined) && (req.body.eligibleForDropship !== null)) {
				if ((req.body.eligibleForDropship === true) || (req.body.eligibleForDropship === 'true') ||
					(req.body.eligibleForDropship === 1) || (req.body.eligibleForDropship === '1') ||
					(req.body.eligibleForDropship === 'Y')) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_dropship = 1');
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_dropship = 0');
				}
			}



			if ((req.body.minQuantity) && (check.integer(parseInt(req.body.minQuantity)))) {
				var minQuantity = parseInt(req.body.minQuantity);
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory >= ?', minQuantity);
			}

			if ((req.body.minQuantity) && (check.integer(parseInt(req.body.minQuantity)))) {
				var minQuantity = parseInt(req.body.minQuantity);
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory >= ?', minQuantity);
			}

			if (req.body.zeroQuantity !== undefined) {
				if (req.body.zeroQuantity === true) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory = 0');
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory > 0');
				}
			}

			if (req.body.partnerType) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'vpt.type = ?', req.body.partnerType.trim());
				whereInfo.join = ' JOIN vendor_to_partner_types vtpt ON v.id = vtpt.vendor_id JOIN vendor_partner_types vpt ON vpt.id = vtpt.partner_type ';
			}

			if (req.body.bubbleId) {
				bubbleId = req.body.bubbleId;
				if (req.body.bubbleEligible !== undefined) {
					if (req.body.bubbleEligible === true) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_trm = 1');
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_trm = 0');
					}
				}

				if (req.body.onBubble !== undefined) {
					if (req.body.onBubble === true) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_product_id IS NOT NULL');
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.shopify_product_id IS NULL');
					}
				}
			}

			if (req.body.dateCreatedStart) {
				if (req.body.dateCreatedStart.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created >= ?', req.body.dateCreatedStart.substring(0, 10) + ' ' + req.body.dateCreatedStart.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created >= ?', req.body.dateCreatedStart.substring(0, 10) + ' 00:00:00');
				}
			}

			if (req.body.dateCreatedEnd) {
				if (req.body.dateCreatedEnd.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created <= ?', req.body.dateCreatedEnd.substring(0, 10) + ' ' + req.body.dateCreatedEnd.substring(11, 19));
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created <= ?', req.body.dateCreatedEnd.substring(0, 10) + ' 00:00:00');
				}
			}

			if (req.body.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.body.sortBy, ['sku', 'mpn', 'vendorName', 'productName', 'vendorSku', 'msrp', 'map_price', 'primaryCategory', 'secondaryCategory', 'primaryMaterial', 'coinId', 'upc', 'dropshipInventory']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}

			if ((sortBy != 'field') && (sortBy != 'direction')) {
				getAll(whereInfo, sortBy, offset, limit, resp, bubbleId, rmCatId, manifestId, filter, storeIdRows)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ['id']);
					})
			}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})


//
//  GET /products/distinctCategories
//
router.get(`/distinctCategories`, async (req, res, next) => {
	try {
		var limit = 0;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: memberText.get('GET_SUCCESS'),
			metaData: {
				totalCount: 0
			},
			data: {}
		};

		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit);
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset);
		}

		//
		//	Internals can't get current, externals can only get current.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ['data'], 404, memberText.get('MEMBER_404'));
		} else {
			resp = await getDistinctCategories(req, offset, limit, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['data']);
	}
})

//
//  GET /products/exportFormats
//
router.get(`/exportFormats`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		//
		// Only allow export formats call from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.')
		} else {
			getExportFormats(resp)
				.then((resp) => {
					respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id'])
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})

//
//  GET /products/exportJobs
//
router.get(`/exportJobs`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var limit = 50
		var offset = 0
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		}
		var userId = 0;
		var whereInfo = {
			clause: 'WHERE 1=1',
			values: []
		}

		if ((req.get('x-app-type') === 'INT') && (userId === 0)) {
			userId = req.query.submitterId ? req.query.submitterId : 0
		} else {
			if (req?.decoded?.userId) {
				userId = req.decoded.userId;
			}
			else if (req?.decoded?.vendorId) {
				userId = req.decoded.vendorId;
			} else if ((req.decoded) && (req.decoded.identity) && (req.decoded.identity.type === 'PARTNERUSER')) {
				userId = req.decoded.identity.userId;
			} else if ((req.decoded) && (req.decoded.identity) && (req.decoded.identity.type === 'PARTNER')) {
				userId = req.decoded.identity.partnerId;
			}
		}

		if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
			limit = parseInt(req.query.limit)
		}

		if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
			offset = parseInt(req.query.offset)
		}

		if (req.query.context) {
			whereInfo = sqlUtils.appendWhere(whereInfo, 'storage_context = ?', req.query.context)
		}

		if (req.query.format) {
			whereInfo = sqlUtils.appendWhere(whereInfo, 'format = ?', req.query.format)
		}


		resp = await getExportJobs(userId, whereInfo, offset, limit, resp);
		respond(resp, res, next)
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})

//
//  GET /products/{id}
//
router.get(`/:id`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get('GET_SUCCESS'),
			data: {}
		}

		//
		//	Internals can't get current, externals can only get current.
		//
		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, ['data'], 404, memberText.get('MEMBER_404'))
		} else {
			resp = await getById(req, resp)

			respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ['data'])
	}
})




//
//  PUT /products/{id}/shopifyIds
//
router.put(`/:id/shopifyIds`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get('UPDATE_SUCCESS')
		}

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.memberId != undefined)) {
			req.params.id = req.decoded.memberId
			internalFlag = false
		}

		if ((req.body.bubbleId === undefined) || (req.body.shopifyProductId === undefined) || (req.body.shopifyVariantId === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'bubbleId, shopifyProductId, shopifyVariantId'))
			respond(resp, res, next)
		} else {
			updateShopifyIds(req, resp)
				.then((resp) => {
					respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id'])
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null)
	}
})



//
//  POST /products/exportJobs
//
router.post(`/exportJobs`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var prom = []
		var resp = {
			statusCode: 201,
			id: 0,
			message: 'Product export submitted for processing.'
		}
		var rmCatId = null;
		var storageContext = {}
		var submitterEmail = null;
		var type = 'USER';
		var userId = undefined;
		var whereInfo = {
			clause: 'WHERE 1=1',
			values: []
		}
		var sortBy = 'product_name ASC'




		if ((req.query.context === undefined) && (req.body.context === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'context'))
			respond(resp, res, next)
		} else if ((req.query.format === undefined) && (req.body.format === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'format'))
			respond(resp, res, next)
		} else if ((req.query.label === undefined) && (req.body.label === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'label'))
			respond(resp, res, next)
		} else if ((req.body.format !== 'TRM') &&
			(req.body.format !== 'TRM-VENDOR-CATALOG') &&
			(req.body.format !== 'MARKETPLACE') &&
			(req.body.format !== 'SINGLE-UPLOAD') &&
			(req.body.format !== 'RRC') &&
			(req.body.format !== 'RBR-ON-HAND')) {
			resp = formatResp(resp, undefined, 400, memberText.get('INVALID').replace('%invalid%', 'format'))
			respond(resp, res, next)
			return
		}
		// else if (whereInfo.clause === '') {
		// 	resp = formatResp(resp, undefined, 404, "You must perform a search before exporting.")
		// 	respond(resp, res, next)
		// }
		else if ((req.get('x-app-type') === 'INT') && !userId) {
			type = req.body.submitterType ? req.body.submitterType : 'USER';
			userId = req.body.submitterId ? req.body.submitterId : 0
		} else if ((req.decoded) && (req.decoded.userId)) {
			type = 'USER';
			userId = req.decoded.userId;
		} else if ((req.decoded) && (req.decoded.vendorId)) {
			type = 'VENDOR';
			userId = req.decoded.vendorId;
			req.body.vendorId = req.decoded.vendorId;
		} else if ((req.decoded) && (req.decoded.identity) && (req.decoded.identity.type === 'PARTNERUSER')) {
			type = 'PARTNERUSER';
			userId = req.decoded.identity.userId;
			req.body.facilityId = req.decoded.identity.facilityId;
		} else if ((req.decoded) && (req.decoded.identity) && (req.decoded.identity.type === 'PARTNER')) {
			type = 'PARTNER';
			userId = req.decoded.identity.partnerId;
		} else if (!userId) {
			resp = formatResp(resp, ["id"], 403, 'Access denied.')
			respond(resp, res, next);
			return
		}

		if (req.body.format === 'RBR-ON-HAND') {

			let storeIds = [];
			if (type === 'PARTNER') {
				storeIds = await Partners.getAllFacilityStoreIdsByPartnerId(req.decoded.identity.partnerId);

				if (req.body.storeId) {
					if (_.findIndex(storeIds, function (s) {
						return s.storeId === req.body.storeId
					}) === -1) {
						resp = formatResp(resp, ["id"], 403, 'Access denied.')
						respond(resp, res, next);
						return
					}
	

					whereInfo = sqlUtils.appendWhere(whereInfo, `p.store_id = ?`, [req.body.storeId]);
				}
				else {
					
					whereInfo = sqlUtils.appendWhere(whereInfo, `p.store_id IN (${listOfStoreIds(storeIds)})`, );
				}
			}
			else if (type === 'PARTNERUSER') {
				storeIds = await Partners.getAllFacilityStoreIdsByPartnerUserId(req.decoded.identity.partnerId, req.decoded.identity.userId);
				if (!storeIds.length) {
					resp = formatResp(resp, ["id"], 403, 'Access denied.')
					respond(resp, res, next);
					return
				}
				else {
					req.body.storeId = storeIds[0].storeId;
					whereInfo = sqlUtils.appendWhere(whereInfo, `p.store_id = ?`, [req.body.storeId]);
				}
			}
			else if (type === 'USER') {
				if (!req.body.vendorId && !req.body.storeId) {
					resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'vendorId or storeId'))
					respond(resp, res, next);
					return
				}

				if (req.body.storeId) {
					whereInfo = sqlUtils.appendWhere(whereInfo, `p.store_id = ?`, [req.body.storeId]);
				}
			}
			else if ((type === 'VENDOR') || (type === 'VENDORUSER')) {

			}

		}


		if (resp.statusCode === 201) {

			if (req.body.rushCategory1) {
				rmCatId = req.body.rushCategory1
			}

			if (req.body.rushCategory2) {
				rmCatId = req.body.rushCategory2
			}

			if (req.body.filter) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.search_field LIKE ?', ['%' + req.body.filter + '%']);
			}


			if (req.body.status) {
				if (req.body.status.indexOf(',') >= 0) {
					var s = _.split(req.body.status, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.status IN (' + placeholders + ')', s);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.status = ?', req.body.status)
				}
			}


			if ((req.body.format === 'RBR-ON-HAND') && req.body.conditionName) {
				if (req.body.conditionName.indexOf(',') >= 0) {
					var s = _.split(req.body.conditionName, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.condition_name IN (' + placeholders + ')', s);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.condition_name = ?', req.body.conditionName);
				}
			}

			if (req.body.sendToEmail) {
				if (validator.isEmail(req.body.sendToEmail)) {
					submitterEmail = req.body.sendToEmail;
				}
			}

			if (req.body.vendorId) {
				if (req.body.vendorId.indexOf(',') >= 0) {
					var s = _.split(req.body.vendorId, ',')
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}

					if (req.body.format === 'RBR-ON-HAND') {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'vendor_id IN (' + placeholders + ')', s);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_id IN (' + placeholders + ')', s);
					}
				} else {

					if (req.body.format === 'RBR-ON-HAND') {
						if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
							whereInfo = sqlUtils.appendWhere(whereInfo, 'vendor_id = ?', req.body.vendorId)
						} else {
							whereInfo = sqlUtils.appendWhere(whereInfo, 'vendor_id LIKE ?', req.body.vendorId + '%')
						}
					} else {
						if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
							whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_id = ?', req.body.vendorId)
						} else {
							whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_id LIKE ?', req.body.vendorId + '%')
						}
					}
				}
			}

			if (req.body.primaryCategory) {
				if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.primary_category = ?', req.body.primaryCategory)
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.primary_category LIKE ?', req.body.primaryCategory + '%')
				}
			}

			if (req.body.secondaryCategory) {
				if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.secondary_category = ?', req.body.secondaryCategory)
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.secondary_category LIKE ?', req.body.secondaryCategory + '%')
				}
			}

			if (req.body.productName) {
				if ((req.body.primaryCategory) || (rmCatId > 0)) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_name LIKE ?', '%' + req.body.productName + '%')
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_name = ?', req.body.productName)
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.product_name LIKE ?', req.body.productName + '%')
					}
				}
			}

			if (req.body.sku) {
				if (req.body.sku.indexOf(',') >= 0) {
					var s = _.split(req.body.sku, ',')
					var placeholders = ''
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', '
						}
						placeholders += '?'
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku IN (' + placeholders + ')', s)
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku = ?', req.body.sku)
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.sku LIKE ?', req.body.sku + '%')
					}
				}
			}

			if (req.body.variantSku) {
				if (req.body.variantSku.indexOf(',') >= 0) {
					var s = _.split(req.body.variantSku, ',')
					var placeholders = ''
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', '
						}
						placeholders += '?'
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.variant_sku IN (' + placeholders + ')', s)
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.variant_sku = ?', req.body.variantSku)
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.variant_sku LIKE ?', req.body.variantSku + '%')
					}
				}
			}


			if ((req.body.format === 'RBR-ON-HAND') && req.body.storageArea && req.body.storageArea.length) {
				if (req.body.storageZone !== 'NULL') {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'sl.storage_area IN (?)');
					whereInfo.values.push(req.body.storageArea.split(','));
				}
			}
	
			if ((req.body.format === 'RBR-ON-HAND') && req.body.storageZone && req.body.storageZone.length) {
				if (req.body.storageZone !== 'NULL') {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'sl.storage_zone IN (?)');
					whereInfo.values.push(req.body.storageZone.split(','));
				}
			}
	
			if ((req.body.format === 'RBR-ON-HAND') && req.body.storageLocation && req.body.storageLocation.length) {
				if (req.body.storageLocation !== 'NULL') {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'sl.storage_location IN (?)');
					whereInfo.values.push(req.body.storageLocation.split(','));
				}
			}
	

			if (req.body.manifestSource) {
				whereInfo = sqlUtils.appendWhere(whereInfo, `manifest_source IN (?)`);
				whereInfo.values.push(req.body.manifestSource.split(','));
			}



			if (req.body.upc && (req.body.format === 'RBR-ON-HAND')) {

				//	This is a cheesy way to do it perhaps, but need to filter by data that's on the vendor sku.
				//	The vendorId is already one of the filter criteria, so I just need to look up 
				//	vendor skus and add them to the whereInfo.
				var vSku = await Vendors.getProductByVendorUPC({vendorId: req.body.vendorId, upc: req.body.upc});
				for (let v=0; v < vSku.length; v++) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.seller_product_id = ?', vSku[v].vendorSku);
				}
			}
			else if (req.body.upc) {
				if (req.body.upc.indexOf(',') >= 0) {
					var s = _.split(req.body.upc, ',')
					var placeholders = ''
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', '
						}
						placeholders += '?'
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc IN (' + placeholders + ')', s)
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc = ?', req.body.upc)
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.upc LIKE ?', req.body.upc + '%')
					}
				}
			}



			if (req.body.mpn && (req.body.format === 'RBR-ON-HAND')) {

				//	This is a cheesy way to do it perhaps, but need to filter by data that's on the vendor sku.
				//	The vendorId is already one of the filter criteria, so I just need to look up 
				//	vendor skus and add them to the whereInfo.
				var vSku = await Vendors.getProductByMPN(req.body.vendorId, req.body.mpn);
				for (let v=0; v < vSku.length; v++) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.seller_product_id = ?', vSku[v].vendorSku);
				}
			}
			if (req.body.mpn) {
				if (req.body.mpn.indexOf(',') >= 0) {
					var s = _.split(req.body.mpn, ',');
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.mpn IN (' + placeholders + ')', s);
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.mpn = ?', req.body.mpn);
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.mpn LIKE ?', req.body.mpn + '%');
					}
				}
			}

			if (req.body.coin) {
				if (req.body.coin.indexOf(',') >= 0) {
					var s = _.split(req.body.coin, ',')
					var placeholders = ''
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', '
						}
						placeholders += '?'
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'c.coin_id IN (' + placeholders + ')', s)
				} else {
					if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === 'true')) {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'c.coin_id = ?', req.body.coin)
					} else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'c.coin_id LIKE ?', req.body.coin + '%')
					}
				}
			}

			if (req.body.vendorSku) {
				if (req.body.vendorSku.indexOf(',') >= 0) {
					var s = _.split(req.body.vendorSku, ',')
					var placeholders = ''
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', '
						}
						placeholders += '?'
					}
					if (req.body.format === 'RBR-ON-HAND') {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.seller_product_id IN (' + placeholders + ')', s)
					} 
					else {
						whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku IN (' + placeholders + ')', s)					
					}
				} else {
					if (req.body.format === 'RBR-ON-HAND') {
						if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
							whereInfo = sqlUtils.appendWhere(whereInfo, 'p.seller_product_id = ?', req.body.vendorSku)
						} else {
							whereInfo = sqlUtils.appendWhere(whereInfo, 'p.seller_product_id LIKE ?', req.body.vendorSku + '%')
						}
					}
					else {
						if ((req.body.exactMatchFlag !== undefined) && (req.body.exactMatchFlag === true)) {
							whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku = ?', req.body.vendorSku)
						} else {
							whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku LIKE ?', req.body.vendorSku + '%')
						}
					}
				}
			}

			if (req.body.vendorSkus) {
				var sql = ``;
				var vals = [];
				for (var i = 0; i < req.body.vendorSkus.length; i++) {
					if (sql.length > 0) {
						sql += ` OR `;
					}

					if (req.body.vendorSkus[i].vendorSku !== undefined) {
						sql += `((p.vendor_sku = ?)`;

						if (req.body.vendorSkus[i].vendorId !== undefined) {
							sql += ` AND (p.vendor_id = ?) `
						}
						sql += `)`;
						vals.push(req.body.vendorSkus[i].vendorSku);

						if (req.body.vendorSkus[i].vendorId !== undefined) {
							vals.push(req.body.vendorSkus[i].vendorId);
						}
					}
				}
				if (sql.length > 0) {
					whereInfo = sqlUtils.appendWhere(whereInfo, `(${sql})`, vals);
				}
			}

			if ((req.body.trmEligibleFlag !== undefined) && (req.body.trmEligibleFlag !== null)) {
				if (req.body.trmEligibleFlag === true) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_trm = 1')
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_trm = 0')
				}
			}

			if ((req.body.minQuantity) && (check.integer(parseInt(req.body.minQuantity)))) {
				var minQuantity = parseInt(req.body.minQuantity)
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory >= ?', minQuantity)
			}

			if (req.body.zeroQuantity !== undefined) {
				if (req.body.zeroQuantity === true) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory = 0')
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.dropship_inventory > 0')
				}
			}

			if (req.body.dateCreatedStart) {
				if (req.body.dateCreatedStart.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created >= ?', req.body.dateCreatedStart.substring(0, 10) + ' ' + req.body.dateCreatedStart.substring(11, 19))
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created >= ?', req.body.dateCreatedStart.substring(0, 10) + ' 00:00:00')
				}
			}

			if (req.body.dateCreatedEnd) {
				if (req.body.dateCreatedEnd.length > 10) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created <= ?', req.body.dateCreatedEnd.substring(0, 10) + ' ' + req.body.dateCreatedEnd.substring(11, 19))
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.date_created <= ?', req.body.dateCreatedEnd.substring(0, 10) + ' 00:00:00')
				}
			}


			var context = req.query.context ? req.query.context : req.body.context;
			var format = req.query.format ? req.query.format : req.body.format;
			var label = req.query.label ? req.query.label : req.body.label;

			var id = await queueExport(resp, userId, type, submitterEmail, context, format, req.body, whereInfo, label, rmCatId);
			resp.id = id
			respond(resp, res, next)
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})


var listOfStoreIds = (storeIds) => {
	let list = '';

	for (let i = 0; i < storeIds.length; i++) {
		if (list.length) {
			list += ', ';
		}
		list += storeIds[i].storeId;
	}

	return list;
}

//
//  POST /products/revalidate
//
router.post(`/revalidate`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Products revalidated.'
		}
		var whereInfo = {
			clause: '',
			values: []
		}

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.')
		} else {

			if (req.query.vendorId) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_id = ?', req.query.vendorId);
			}

			revalidate(req, resp, whereInfo)
				.then(() => {
					respond(resp, res, next)
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id'])
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})


router.post(`/fixUpUPCs`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200
		};

		await fixUpUPCs();

		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp)
	}
})


router.put('/calculateMissingCubes', jwtUtils.verifyToken, async (req, res, next) => {
	try {
		const resp = {
			statusCode: 200,
			message: 'Success',
		}

		const { userType } = getUserIdAndType(req)
		if (userType !== 'INTERNAL') {
			respond(resp, res, next, [], 403, 'Access denied.')
		}

		const dryRun = ![undefined, 'false', 'N'].includes(req.query.dryRun)
		await calculateMissingCubes(dryRun)

		respond(resp, res, next)
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, {})
	}
})


router.use('/process/receive', processReceiveRouter);
router.use('/process/verify', processVerifyRouter);
router.use('/process/reshipping', processReshippingRouter);
router.use('/process/condition', processConditionRouter);
router.use('/process/locate', processLocateRouter);

module.exports = router