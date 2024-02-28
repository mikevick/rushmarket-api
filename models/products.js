'use strict';

const mysql = require('promise-mysql');
const globals = require('../globals');
const colUtils = require('../utils/columnUtils');
const Users = require('./users');
const userUtils = require('../utils/userUtils');





exports.checkByUpc = async (upc, vendorSku) => {
	var row = await globals.productPool.query("SELECT * FROM vendor_catalog_products WHERE upc = ? AND vendor_sku = ?", [upc, vendorSku]);
	colUtils.outboundNaming(row);

	return row;
}


exports.checkVendorSku = async (vsku) => {
	var row = await globals.productPool.query("SELECT * FROM coins_to_vendor_skus WHERE vendor_sku = ?", [vsku]);
	colUtils.outboundNaming(row);

	return row;
}


exports.checkVendorSku = async (vsku) => {
	var row = await globals.productPool.query("SELECT * FROM coins_to_vendor_skus WHERE vendor_sku = ?", [vsku]);
	colUtils.outboundNaming(row);

	return row;
}



exports.checkCoinInfo = async (coin, vendorSku) => {
	var sql = "SELECT c.id, u.id as upccoinid, u.upc, m.id, m.manufacturer, m.mpn, v.id, v.vendor_id, v.vendor_sku FROM coins c " +
		"LEFT JOIN coins_to_upc u ON u.coin_id = c.id " +
		"LEFT JOIN coins_to_manufacturer_mpn m ON m.coin_id = c.id " +
		"LEFT JOIN coins_to_vendor_skus v ON v.coin_id = c.id " +
		"WHERE c.id = ?";
	var row = await globals.productPool.query(sql, [coin, vendorSku]);
	colUtils.outboundNaming(row);

	return row;
}


exports.insertUPCCoin = async (coin, upc) => {
	var id = globals.mongoid.fetch();
	var sql = "INSERT INTO vendors.coins_to_upc (id, coin_id, upc) VALUES (?, ?, ?)";
	var results = await globals.productPool.query(sql, [id, coin, upc]);

	return results;
}

exports.updateUPCCoin = async (id, upc) => {
	var sql = "UPDATE vendors.coins_to_upc set upc = ? WHERE id = ?";
	var results = await globals.productPool.query(sql, [upc, id]);

	return results;
}



exports.updateUPC = async (upc, price, vendorSku) => {
	var sql = "UPDATE vendor_catalog_products SET upc = ?, in_market_price = ? WHERE vendor_sku = ? AND vendor_id = '5d268d7a000001251400557d'";
	var results = await globals.productPool.query(sql, [upc, price, vendorSku]);

	return results;
}




exports.completeExportJob = (id, exportUrl) => {
	return new Promise((resolve, reject) => {
		var values = [];
		var sql = "UPDATE vendor_catalog_export_jobs SET date_modified = now(), status = 'PROCESSED' ";
		if (exportUrl === null) {
			sql = sql + ', export_sheet_url = NULL';
		} else {
			sql = sql + ', export_sheet_url = ?';
			values.push(exportUrl);
		}
		values.push(id);
		sql = sql + ' WHERE id = ?';

		globals.productPool.query(sql, values)
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	})
}

exports.createExportJob = (userId, type, submitterEmail, context, format, filterJSON, where, label) => {
	return new Promise((resolve, reject) => {
		var w = mysql.format(where.clause, where.values);
		var id = globals.mongoid.fetch();
		var values = [id, userId, type, submitterEmail, context, format, JSON.stringify(filterJSON, undefined, 2), w, label];
		globals.productPool.query('INSERT INTO vendor_catalog_export_jobs (id, submitter_id, submitter_type, submitter_email, storage_context, format, filter_json, where_clause, label) ' +
				'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	})
}

exports.failExportJob = (id) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("UPDATE vendor_catalog_export_jobs SET date_modified = now(), status = 'FAILED', error_msg = 'An unexpected error has occurred. Our tech team has been notified.' WHERE id = ?", [id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	})
}

exports.startExportJob = (id) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("UPDATE vendor_catalog_export_jobs SET date_modified = now(), status = 'INPROGRESS' WHERE id = ?", [id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	})
}

exports.progressExportJob = (id, status) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("UPDATE vendor_catalog_export_jobs SET date_modified = now(), status = ? WHERE id = ?", [status, id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	})
}

exports.getAll = async (whereInfo, sortBy, offset, limit, bubbleId) => {
	var prom = [];
	var resp = {
		totalCount: 0,
		products: []
	};

	//	Short-term fix.
	if (whereInfo.join === undefined) {
		whereInfo.join = '';
	}

	// var countSql = 'SELECT count(*) as num FROM vendor_catalog_products p ' + whereInfo.clause
	var countSql = 'SELECT count(*) as num ' +
		'FROM vendor_catalog_products p ' +
		'LEFT JOIN vendors v ON p.vendor_id = v.id ' +
		'LEFT JOIN coins_to_vendor_skus c ON ((c.vendor_sku = p.vendor_sku) AND (c.vendor_id = p.vendor_id)) ' + whereInfo.join + whereInfo.clause;
	var sql = `SELECT v.name as vendor_name, v.lock_pricing, c.coin_id, c2.listed_on_marketplace, p.* 
					FROM vendor_catalog_products p 
						LEFT JOIN vendors v ON p.vendor_id = v.id 
						LEFT JOIN coins_to_vendor_skus c ON ((c.vendor_sku = p.vendor_sku) AND (c.vendor_id = p.vendor_id))
						LEFT JOIN coins c2 ON c2.id = c.coin_id
						 ` + whereInfo.join + whereInfo.clause;

	if (bubbleId !== undefined) {
		countSql = 'SELECT count(*) as num  ' +
			'FROM vendor_catalog_products p ' +
			'LEFT JOIN vendors v ON p.vendor_id = v.id ' +
			"LEFT JOIN o_variant_bubble_shopify_ids si ON ((p.id = si.product_id) AND (si.bubble_id = '" + bubbleId + "')) " +
			whereInfo.join + whereInfo.clause;
		sql = 'SELECT v.name AS vendor_name, p.eligible_for_trm AS bubble_eligible, p.*, si.shopify_product_id, si.shopify_variant_id ' +
			'FROM vendor_catalog_products p ' +
			'LEFT JOIN vendors v ON p.vendor_id = v.id ' +
			"LEFT JOIN o_variant_bubble_shopify_ids si ON ((p.id = si.product_id) AND (si.bubble_id = '" + bubbleId + "')) " +
			whereInfo.join + whereInfo.clause;
	}


	if (sortBy !== undefined) {
		// whereInfo.values.push(sortBy);
		sql = sql + ' ORDER BY ' + sortBy;
	}
	if (offset !== undefined) {
		sql = sql + ' LIMIT ' + offset + ',' + limit;
	}

	// console.log(mysql.format(sql, whereInfo.values));

	// console.log(mysql.format(countSql, whereInfo.values));
	prom.push(globals.productROPool.query(countSql, whereInfo.values));
	prom.push(globals.productROPool.query(sql, whereInfo.values));

	var results = await Promise.all(prom);

	prom = [];

	var count = results[0];
	var rows = results[1];

	resp.totalCount = count[0].num;
	resp.products = rows;
	colUtils.outboundNaming(resp.products);

	for (var i = 0; i < resp.products.length; i++) {
		if (resp.products[i].listedOnMarketplace) {
			resp.products[i].listedOnMarketplace = true;
		} else {
			resp.products[i].listedOnMarketplace = false;
		}

		resp.products[i].listedOn = [];
		resp.products[i].notListedReasons = [];


		if (rows[i].validated === 1) {
			rows[i].validated = true;
			var user = await globals.poolRO.query("SELECT user_name as validated_by_user_name FROM users WHERE user_id = ?", [rows[i].validatedBy]);
			if (user.length > 0) {
				rows[i].validatedByUserName = user[0].validated_by_user_name;
			}
		} else {
			rows[i].validated = false;
			rows[i].validatedByUserName = null;
		}


		prom.push(globals.productPool.query("SELECT lo.platform FROM coins_to_listed_on clo LEFT JOIN listed_on lo ON clo.listed_on_id = lo.id WHERE clo.coin_id = ?", [resp.products[i].coinId]));
		prom.push(globals.productPool.query("SELECT nlr.reason FROM coins_to_not_listed_reasons cnlr LEFT JOIN not_listed_reasons nlr ON cnlr.not_listed_reason_id = nlr.id WHERE cnlr.coin_id = ?", [resp.products[i].coinId]));
		prom.push(globals.pool.query(`SELECT default_ds_quantity FROM categories c LEFT JOIN category_mappings m ON m.category_id = c.category_id	WHERE category_1 = ? AND category_2 = ?`, [resp.products[i].primaryCategory, resp.products[i].secondaryCategory]));
		prom.push(globals.poolRO.query(`
			SELECT
				a.name AS attribute_name,
				c.name AS category_name,
				ca.category_id,
				ca.attribute_id,
				ca.vc_map,
				ca.in_filters,
				ca.filter_type,
				ca.filter_label,
				ca.on_pdp
			FROM category_mappings cm
				LEFT JOIN categories c ON c.category_id = cm.category_id
				LEFT JOIN category_attributes ca ON ca.category_id = c.category_id
				LEFT JOIN attributes a ON a.attribute_id = ca.attribute_id
			WHERE cm.category_1 = ? AND cm.category_2 = ?
			ORDER BY ca.display_order
		`, [resp.products[i].primaryCategory, resp.products[i].secondaryCategory]))
	}

	results = await Promise.all(prom);
	var resultsCounter = 0;

	for (var i = 0; i < resp.products.length; i++) {

		var listedOn = results[resultsCounter++];
		var reasons = results[resultsCounter++];
		var dsQuantity = results[resultsCounter++];
		var categoryAttributes = results[resultsCounter++];

		if (listedOn !== undefined) {
			for (var j = 0; j < listedOn.length; j++) {
				resp.products[i].listedOn.push(listedOn[j].platform);
			}
		}
		if (reasons !== undefined) {
			for (var j = 0; j < reasons.length; j++) {
				resp.products[i].notListedReasons.push(reasons[j].reason);
			}
		}
		if ((dsQuantity !== undefined) && (dsQuantity.length > 0) && (dsQuantity[0] !== undefined)) {
			resp.products[i].defaultDSQuantity = dsQuantity[0].default_ds_quantity;
		}
		if (categoryAttributes !== undefined && categoryAttributes.length > 0) {
			resp.products[i].categoryAttributes = colUtils.outboundNaming(categoryAttributes);
		}
	}



	//	If bubble ID provided, add new element if it's on the bubble shopify store.
	if (bubbleId != undefined) {
		rows.forEach((row) => {
			if (row.bubbleEligible === 0) {
				row.bubbleEligible = false;
			} else {
				row.bubbleEligible = true;
			}

			if (row.shopifyProductId !== null) {
				if (row.shopifyProductId === 0) {
					row.bubbleStatus = 'QUEUED';
				} else {
					row.bubbleStatus = 'YES';
				}
			} else {
				row.bubbleStatus = 'NO';
			}
		})
	}

	return resp;
}


exports.getAmbiguous = async (whereInfo, offset, limit) => {
	var coinSql = "SELECT coin_id FROM coins_to_vendor_skus " + whereInfo.clause + " GROUP BY coin_id HAVING COUNT(*) > 1 ORDER BY coin_id";
	var resp = {
		totalCount: 0,
		products: []
	};


	var sql = `SELECT coin_id, p.id, p.product_name, p.pull_data_forward_flag, p.vendor_id, p.vendor_sku, v.name, p.ship_type, p.product_width, p.product_depth, p.product_height, 
				p.primary_material, p.secondary_material, p.primary_color, 
				p.bullet_point1, p.bullet_point2, p.bullet_point3, p.bullet_point4, p.product_description, 
				p.main_image_knockout, p.main_image_lifestyle, p.alt_image3, p.alt_image4, p.alt_image5,
				p.style_tag1, p.style_tag2, p.number_of_boxes, 
				p.shipping_weight1, p.package_height1, p.package_width1, p.package_length1,
				p.shipping_weight2, p.package_height2, p.package_width2, p.package_length2,
				p.shipping_weight3, p.package_height3, p.package_width3, p.package_length3,
				p.shipping_weight4, p.package_height4, p.package_width4, p.package_length4,
				p.shipping_weight5, p.package_height5, p.package_width5, p.package_length5,
				p.shipping_weight6, p.package_height6, p.package_width6, p.package_length6,
				p.shipping_weight7, p.package_height7, p.package_width7, p.package_length7,
				p.shipping_weight8, p.package_height8, p.package_width8, p.package_length8,
				p.shipping_weight9, p.package_height9, p.package_width9, p.package_length9,
				p.shipping_weight10, p.package_height10, p.package_width10, p.package_length10,
				p.shipping_weight11, p.package_height11, p.package_width11, p.package_length11,
				p.shipping_weight12, p.package_height12, p.package_width12, p.package_length12,
				p.shipping_weight13, p.package_height13, p.package_width13, p.package_length13,
				p.shipping_weight14, p.package_height14, p.package_width14, p.package_length14,
				p.shipping_weight15, p.package_height15, p.package_width15, p.package_length15,
				p.shipping_weight16, p.package_height16, p.package_width16, p.package_length16,
				p.shipping_weight17, p.package_height17, p.package_width17, p.package_length17,
				p.shipping_weight18, p.package_height18, p.package_width18, p.package_length18,
				p.shipping_weight19, p.package_height19, p.package_width19, p.package_length19,
				p.shipping_weight20, p.package_height20, p.package_width20, p.package_length20
			FROM coins_to_vendor_skus c 
				LEFT JOIN vendor_catalog_products p ON ((c.vendor_id = p.vendor_id) AND (c.vendor_sku = p.vendor_sku)) 
				LEFT JOIN vendors v ON (p.vendor_id = v.id) 
				WHERE p.STATUS = 'ACTIVE' AND coin_id IN (${coinSql}) 
				ORDER BY coin_id `;



	// console.log(mysql.format(sql, whereInfo.values));
	var rows = await globals.productROPool.query(sql, whereInfo.values);

	resp.products = rows;
	colUtils.outboundNaming(resp.products);

	return resp;
}


exports.getProductCount = async (whereClause) => {
	var prom = [];
	var resp = {
		totalCount: 0,
		products: []
	};

	// var countSql = 'SELECT count(*) as num FROM vendor_catalog_products p ' + whereInfo.clause
	var countSql = 'SELECT count(*) as num ' +
		'FROM vendor_catalog_products p ' +
		'LEFT JOIN vendors v ON p.vendor_id = v.id ' +
		'LEFT JOIN coins_to_vendor_skus c ON ((c.vendor_sku = p.vendor_sku) AND (c.vendor_id = p.vendor_id)) ' + whereClause;


	// console.log(mysql.format(countSql));

	// console.log(countSql, JSON.stringify(whereInfo, undefined, 2));
	var count = await globals.productROPool.query(countSql);

	resp.totalCount = count[0].num;
	return resp;
}



exports.getById = async (productId) => {
	var sql = `SELECT v.lock_pricing, p.*, c.coin_id, c2.listed_on_marketplace
								FROM vendor_catalog_products p 
									LEFT JOIN coins_to_vendor_skus c ON ((c.vendor_id = p.vendor_id) AND (c.vendor_sku = p.vendor_sku))
									LEFT JOIN coins c2 ON c2.id = c.coin_id
									LEFT JOIN vendors v ON p.vendor_id = v.id
								WHERE p.id = '${productId}'`;

	var rows = await globals.productPool.query(sql);
	colUtils.outboundNaming(rows);

	if (rows.length > 0) {
		if (rows[0].listedOnMarketplace) {
			rows[0].listedOnMarketplace = true
		} else {
			rows[0].listedOnMarketplace = false
		}

		rows[0].listedOn = [];
		rows[0].notListedReasons = [];


		if (rows[0].validated === 1) {
			rows[0].validated = true;
			var user = await globals.poolRO.query("SELECT user_name as validated_by_user_name FROM users WHERE user_id = ?", [rows[0].validatedBy]);
			if (user.length > 0) {
				rows[0].validatedByUserName = user[0].validated_by_user_name;
			}
		} else {
			rows[0].validated = false;
			rows[0].validatedByUserName = null;
		}


		var listedOn = await globals.productPool.query("SELECT lo.platform FROM coins_to_listed_on clo LEFT JOIN listed_on lo ON clo.listed_on_id = lo.id WHERE clo.coin_id = ?", [rows[0].coinId]);
		var reasons = await globals.productPool.query("SELECT nlr.reason FROM coins_to_not_listed_reasons cnlr LEFT JOIN not_listed_reasons nlr ON cnlr.not_listed_reason_id = nlr.id WHERE cnlr.coin_id = ?", [rows[0].coinId]);

		for (var i = 0; i < listedOn.length; i++) {
			rows[0].listedOn.push(listedOn[i].platform);
		}
		for (var i = 0; i < reasons.length; i++) {
			rows[0].notListedReasons.push(reasons[i].reason);
		}
	}

	return rows;
}




exports.getByShopifyVariantId = (variantId) => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT p.* FROM  products p WHERE shopify_variant_id = '" + variantId + "'";

		globals.pool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);

				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	})
}

exports.getDistinctCategories = (offset, limit) => {
	return new Promise((resolve, reject) => {
		var values = [];
		var resp = {
			totalCount: 0,
			categories: []
		};
		var countSql = 'SELECT primary_category, secondary_category, count(*) as num FROM vendor_catalog_products WHERE primary_category IS NOT NULL GROUP BY primary_category, secondary_category';
		globals.productPool.query(countSql)
			.then((count) => {
				if (count.length) {
					resp.totalCount = count[0].num;
				}
				var sql = 'SELECT primary_category, secondary_category FROM vendor_catalog_products WHERE primary_category IS NOT NULL GROUP BY primary_category, secondary_category';
				if (limit > 0) {
					values.push(offset);
					values.push(limit);
					sql = sql + ' LIMIT ' + [values];
				}
				return globals.productPool.query(sql);
			})
			.then((rows) => {
				if (rows.length) {
					resp.categories = rows;
					colUtils.outboundNaming(resp.categories);
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	})
}

exports.getExportFormats = () => {
	return new Promise((resolve, reject) => {
		var resp = {
			rows: []
		};

		globals.productPool.query('SELECT format FROM vendor_catalog_export_formats ORDER BY format')
			.then((rows) => {
				rows
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e)
			})
	})
}

exports.getExportJobsBySubmitterId = async (id, whereInfo, offset, limit) => {
	var jobs = null
	var resp = {
		totalCount: 0,
		rows: []
	}
	var count = await globals.productPool.query(`SELECT count(*) as num FROM vendor_catalog_export_jobs ${whereInfo.clause} AND submitter_id = ?`, whereInfo.values.concat([id]));
	resp.totalCount = count[0].num

	var rows = await globals.productPool.query(`SELECT * FROM vendor_catalog_export_jobs ${whereInfo.clause} AND submitter_id = ? ORDER BY date_created DESC LIMIT ?,?`, whereInfo.values.concat([id, offset, limit]));
	jobs = rows

	var results = await getJobSubmitterInfo(jobs);
	jobs = results

	colUtils.outboundNaming(jobs)

	resp.rows = jobs

	return resp;
}


var getJobSubmitterInfo = (jobs) => {
	return new Promise((resolve, reject) => {
		var prom = []

		for (let job of jobs) {
			prom.push(userUtils.userLookup(job.submitter_id, job.submitter_type));
		}

		Promise.all(prom)
			.then((users) => {
				for (let job of jobs) {
					job.submitter = {};
					if (users.length > 0) {
						// job.submitter.userId = users[0].userId;
						job.submitter.name = users[0].name;
						job.submitter.email = users[0].email;
					}
				}
				resolve(jobs)
			})
			.catch((e) => {
				reject(e)
			})
	})
}

exports.getReadyExportJobs = () => {
	return new Promise((resolve, reject) => {
		var jobs = null
		var prom = []

		globals.productPool.query("SELECT * FROM vendor_catalog_export_jobs WHERE status = 'QUEUED' ORDER BY date_created LIMIT 0,1")
			.then((rows) => {
				jobs = rows

				return getJobSubmitterInfo(jobs)
			})
			.then((results) => {
				jobs = results

				colUtils.outboundNaming(jobs)
				resolve(jobs)
			})
			.catch((e) => {
				reject(e)
			})
	})
}

exports.storeShopifyIds = (req) => {
	return new Promise((resolve, reject) => {
		var values = []
		values.push(req.body.bubbleId)
		values.push(req.params.id)
		values.push(req.body.shopifyProductId)
		values.push(req.body.shopifyVariantId)
		values.push(req.body.bubbleId)
		values.push(req.params.id)
		values.push(req.body.shopifyProductId)
		values.push(req.body.shopifyVariantId)

		globals.productPool.query('INSERT INTO o_variant_bubble_shopify_ids (bubble_id, product_id, shopify_product_id, shopify_variant_id) VALUES (?, ?, ?, ?) ' +
				' ON DUPLICATE KEY UPDATE bubble_id = ?, product_id = ?, shopify_product_id = ?, shopify_variant_id = ?, date_modified = now()', values)
			.then((result) => {
				resolve(result)
			})
			.catch((e) => {
				reject(e)
			})
	})
}

exports.getVendorCatalogProduct = (vendorId, vendorSku) => {
	return globals.productROPool.query(`
		SELECT *
		FROM vendor_catalog_products
		WHERE vendor_id = ? AND vendor_sku = ?`, [vendorId, vendorSku])
		.then(rows => colUtils.outboundNaming(rows))
		.then(rows => rows?.[0]);
}

exports.getPartnerIdsByStoreId = async () => {
	return globals.productPool.query(`
		SELECT
			affiliated_with_id as partnerId,
			store_id as storeId
		FROM rrc_facilities
		WHERE affiliated_with_type = 'PARTNER'
	`)
		.then(rows => rows.reduce((partnerIdsByStoreId, facility) => {
			partnerIdsByStoreId[facility.storeId] = facility.partnerId
			return partnerIdsByStoreId
		}, {}))
}

exports.streamAllForCalculatingCubes = async (callback) => {
	let conn
	return globals.poolRO.getConnection()
		.then(connection => {
			conn = connection

			const query = connection.queryStream(`
				SELECT
					p.sku,
				  p.seller_product_id as sellerProductId,
					p.vendor_supplier_code as vendorSupplierCode,
					p.store_id as storeId,
				  p.condition_name as conditionName,
					p.step_build_locate_done as stepBuildLocateDone,
					m.vendor_id as vendorId
				FROM products p
				  INNER JOIN manifests m ON m.manifest_id = p.manifest_id
				  INNER JOIN stores s ON s.store_id = p.store_id AND s.partner_facility = 'Y'
				WHERE
					(
						p.condition_name = 'Trash'
						AND (
							p.partner_disposal_cubic_inches IS NULL
							OR p.partner_receipt_inspection_cubic_inches IS NULL
						)
					) OR (
						p.condition_name != 'Trash'
						AND p.step_build_locate_done = 'Y'
						AND (m.default_product_condition IS NULL OR m.default_product_condition != 'New')
						AND p.partner_receipt_inspection_cubic_inches IS NULL
					)
			`)
			const pause = connection.pause.bind(connection)
			const resume = connection.resume.bind(connection)

			return new Promise(resolve => {
				query
					.on('error', e => {
						throw e
					})
					.on('result', product => {
						pause()
						callback(product).then(resume)
					})
					.on('end', resolve)
			})
		})
		.catch(e => {
			console.log(e.message)
			throw e
		})
		.finally(() => {
			globals.poolRO.releaseConnection(conn)
		})
}

exports.updateCubes = async (coreleapConn, rushSku, partnerReceiptInspectionCubicInches, partnerDisposalCubicInches) => {
	const columns = []
	const values = []

	if (typeof partnerReceiptInspectionCubicInches === 'number') {
		columns.push('partner_receipt_inspection_cubic_inches')
		values.push(partnerReceiptInspectionCubicInches)
	}

	if (typeof partnerDisposalCubicInches === 'number') {
		columns.push('partner_disposal_cubic_inches')
		values.push(partnerDisposalCubicInches)
	}

	const conn = coreleapConn || globals.pool
	return conn.query(`
		UPDATE products
		SET ${columns.map(column => `${column} = ?`).join(', ')}
		WHERE sku = ?`, [...values, rushSku]);
}
