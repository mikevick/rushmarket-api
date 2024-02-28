'use strict';

const _ = require('lodash');
const mysql = require('promise-mysql');
const globals = require('../globals');
const colUtils = require('../utils/columnUtils');
const sqlUtils = require('../utils/sqlUtils');
const userUtils = require('../utils/userUtils');


const CategoryAttributes = require('./categoryAttributes');
const Members = require('./members');
const VendorSkus = require('./vendorSkus');


exports.getAll = async (whereInfo, sortBy, offset, limit) => {
	var prom = [];
	var resp = {
		rushProducts: []
	};

	// var countSql = 'SELECT count(*) as num ' +
	// 	'FROM products p ' +
	// 	whereInfo.clause;
	// prom.push(globals.pool.query(countSql, whereInfo.values));

	var sql = 'SELECT p.*, m.vendor_id ' +
		'FROM products p LEFT JOIN manifests m ON p.manifest_id = m.manifest_id ' +
		whereInfo.clause;

	if (sortBy !== undefined) {
		sql = sql + ' ORDER BY ' + sortBy;
	}
	if (offset !== undefined) {
		whereInfo.values.push(offset);
		whereInfo.values.push(limit);
		sql = sql + ' LIMIT ?,?';
	}

	// console.log(mysql.format(sql, whereInfo.values));
	var rows = await globals.pool.query(sql, whereInfo.values);

	resp.tempRushProducts = rows;
	colUtils.outboundNaming(resp.tempRushProducts);

	if (resp.tempRushProducts.length > 0) {
		for (var i = 0; i < resp.tempRushProducts.length; i++) {
			var coin = await globals.productPool.query("SELECT coin_id FROM coins_to_vendor_skus " +
				"WHERE vendor_id = ? AND vendor_sku = ?", [resp.tempRushProducts[i].vendorId, resp.tempRushProducts[i].sellerProductId]);

			if (coin.length > 0) {
				resp.tempRushProducts[i].coinId = coin[0].coin_id;
			} else {
				resp.tempRushProducts[i].coinId = resp.tempRushProducts[i].sku;
			}
		}
	}

	return resp;
}

exports.getAllProducts = async (includeShippingBoxes, status, dateModifiedEnd, attributeId, whereInfo, sortBy, offset, limit) => {
	let resp = {
		totalCount: 0,
		rushProducts: []
	};
	let prom = [];
	let productSqlCount = ' SELECT count(*) AS num ';
	let productSql = ` p.*, 
      ROUND(IF( p.price > 0, (((p.price - p.cost) / p.price) * 100), 0 ), 1) as margin, 
      CONVERT_TZ(p.date_to_release, '+00:00', '${process.env.UTC_OFFSET}') as date_to_release, 
      CONVERT_TZ(p.date_online, '+00:00', '${process.env.UTC_OFFSET}') as date_online, 
      CONVERT_TZ(p.date_created, '+00:00', '${process.env.UTC_OFFSET}') as date_created, 
      CONVERT_TZ(p.date_modified, '+00:00', '${process.env.UTC_OFFSET}') as date_modified, 
      sps.storage_pallet_size, 
      c2.name as category_1_name, 
      c.name as category_2_name, c.front_end_name, c.front_end_space, c.parent_id, c.category_id, c.default_product_condition as category_default_product_condition,
      m.manifest_identifier, m.manifest_source, m.default_product_condition as manifest_default_product_condition,
      l.storage_area, l.storage_zone, l.storage_location, l.active, l.online_eligible, l.market_floor,
      s.store_name, s.shopify_store_id, s.shopify_location_id, s.auto_online_skus, s.partner_facility,
      sp.location_number as pallet_location, sp.current_store_id as pallet_store_id, 
      ir.inactive_reason_id, ir.reason, ir.allow_reactivation, 
      bi.build_inspect_id, bi.done as bi_done, bi.build_inspect_notes, 
      m.manifest_seller_id, m.vendor_id, 
      pl.pick_list_id, pl.name as pick_list_name, 
      pt.color as pricing_type_color, pt.pricing_type, 
      piq.resolved, 
      IF(lcb.id > 0, 'Y', 'N') AS in_bubble, 
      mp.attribute_name_1, mp.attribute_name_2, mp.attribute_name_3, mp.attribute_name_4, mp.attribute_name_5, 
      mp.attribute_name_6, mp.attribute_name_7, mp.attribute_name_8, mp.attribute_name_9, mp.attribute_name_10, 
      mp.attribute_value_1, mp.attribute_value_2, mp.attribute_value_3, mp.attribute_value_4, mp.attribute_value_5, 
      mp.attribute_value_6, mp.attribute_value_7, mp.attribute_value_8, mp.attribute_value_9, mp.attribute_value_10, 
      damageTop.damage_location as damageLocation1, damageTop.damage_severity as damageSeverity1, 
      damageTop.damage_visibility as damageVisibility1, damageBottom.damage_location as damageLocation2, 
      damageBottom.damage_severity as damageSeverity2, damageBottom.damage_visibility as damageVisibility2, 
      damageInterior.damage_location as damageLocation3, damageInterior.damage_severity as damageSeverity3, 
      damageInterior.damage_visibility as damageVisibility3, missingHardware.missing_hardware_severity as missingHardware,
			mhr.name as missing_hardware_name, mhr.missing_hardware_severity, mhr.damage_message as missing_hardware_message,
			spr.check_in_note `;

	if (status && dateModifiedEnd && status.toUpperCase() === "RETURN" && dateModifiedEnd.length > 0) {
		productSql = ` ${productSql}, 
      CONVERT_TZ(i.line_item_date_created, '+00:00', '${process.env.UTC_OFFSET}') AS return_date, 
      ( SELECT CONVERT_TZ(line_item_date_created, '+00:00', '${process.env.UTC_OFFSET}') AS line_item_date_created 
        FROM order_line_items 
        WHERE sku = p.sku 
          AND line_type = "Purchase" 
          AND line_item_date_created <= ${dateModifiedEnd} 
          ORDER BY line_item_date_created DESC 
          LIMIT 1 
      ) AS sold_date `;
	} else {
		productSql = ` ${productSql}, 
      "" as sold_date, "" as return_date `;
	}

	if (includeShippingBoxes) {
		productSql = ` psb.*, 
      ${productSql}`;
	}

	let productFromSql = ` FROM 
      products p 
      LEFT JOIN product_pricing_types pt ON pt.pricing_type_id = p.pricing_type_id 
      LEFT JOIN product_build_inspects bi ON p.sku = bi.sku 
      LEFT JOIN pick_list_lines pll ON p.sku = pll.sku 
      LEFT JOIN pick_lists pl ON pl.pick_list_id = pll.pick_list_id 
      LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
      LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2 
      LEFT JOIN categories c ON c.category_id = cm.category_id 
      LEFT JOIN categories c2 ON c2.category_id = c.parent_id 
      LEFT JOIN stores s ON s.store_id = p.store_id 
      LEFT JOIN storage_pallets sp ON sp.ext_pallet_number = p.pallet_number 
      LEFT JOIN storage_pallet_sizes sps ON sps.id = sp.storage_pallet_size_id 
      LEFT JOIN storage_locations l ON l.location_number = p.location_number AND l.store_id = p.store_id 
      LEFT JOIN inactive_reasons ir ON ir.inactive_reason_id = p.inactive_reason_id 
      LEFT JOIN product_issues_queue piq ON p.sku = piq.sku 
      LEFT JOIN staging_product spr ON spr.product_id = p.staging_product_id 
      LEFT JOIN manifest_products mp ON mp.seller_product_id = spr.seller_product_id AND mp.manifest_id = spr.manifest_id AND mp.destination_store_id = spr.destination_store_id 
      LEFT JOIN product_damage_pricing_rules damageTop ON p.damage_top = damageTop.product_damage_pricing_rules_id 
      LEFT JOIN product_damage_pricing_rules damageBottom ON p.damage_bottom = damageBottom.product_damage_pricing_rules_id 
      LEFT JOIN product_damage_pricing_rules damageInterior ON p.damage_interior = damageInterior.product_damage_pricing_rules_id 
      LEFT JOIN product_missing_hardware_rules missingHardware ON p.missing_hardware = missingHardware.product_missing_hardware_rules_id 
      LEFT JOIN lap_cluster_bubbles lcb ON p.sku = lcb.sku 
			LEFT JOIN product_missing_hardware_rules mhr ON mhr.product_missing_hardware_rules_id = p.missing_hardware `;

	if (status && (status.toUpperCase() === 'RETURN' || status.toUpperCase() === 'PURCHASE')) {
		productFromSql = ` ${productFromSql} 
      LEFT JOIN order_line_items i ON p.sku = i.sku `;
	}

	if (attributeId) {
		productFromSql = ` ${productFromSql}
      LEFT JOIN scrape_attributes sa ON sa.seller_product_id = p.seller_product_id AND sa.manifest_id = p.manifest_id `;
	}

	if (includeShippingBoxes) {
		productFromSql = ` ${productFromSql}
      LEFT JOIN product_shipping_boxes psb ON p.sku = psb.sku `;
	}

	let countSql = `
    ${productSqlCount}
    ${productFromSql} 
    ${whereInfo.clause} 
  `;

	prom.push(globals.pool.query(countSql, whereInfo.values));
	let sql = `
    SELECT ${productSql} 
    ${productFromSql} 
    ${whereInfo.clause} 
  `;

	if (sortBy !== '') {
		sql = sql + ' ORDER BY ' + sortBy;
	}

	if (offset !== undefined) {
		whereInfo.values.push(offset);
		whereInfo.values.push(limit);
		sql = sql + ' LIMIT ?,?';
	}


	// console.log(mysql.format(sql, whereInfo.values));
	prom.push(globals.pool.query(sql, whereInfo.values));

	let results = await Promise.all(prom);
	resp.totalCount = results[0][0].num;
	var products = results[1];
	colUtils.outboundNaming(results[1]);
	let vendorSkuList = [];
	let userList = [];
	for (let i = 0; i < products.length; i++) {
		userList.push(userUtils.userLookup(products[i].userId, products[i].userType));

		vendorSkuList.push(results[1][i].vendorId);
		vendorSkuList.push(results[1][i].sellerProductId);
	}

	var users = await Promise.all(userList);
	for (let i = 0; i < products.length; i++) {
		products[i].userName = users[i].name;
		products[i].userEmail = users[i].email;
	}

	//get coin
	if (vendorSkuList.length > 0) {
		prom = [];
		let coinSql = `SELECT v.coin_id, v.vendor_sku, c.listed_on_marketplace
      FROM coins_to_vendor_skus v
		LEFT JOIN coins c ON c.id = v.coin_id
      WHERE vendor_id = ? AND vendor_sku = ?`;
		let coinValue = [vendorSkuList];
		let coinData = {};
		for (let i = 0; i < results[1].length; i++) {
			let coinResults = await globals.productPool.query(coinSql, [results[1][i].vendorId, results[1][i].sellerProductId]);
			if (coinResults.length > 0) {
				results[1][i]["coin"] = coinResults[0].coin_id;
				results[1][i]["listedOnMarketplace"] = coinResults[0].listed_on_marketplace ? true : false;
			} else {
				results[1][i]["coin"] = "";
				results[1][i]["listedOnMarketplace"] = "";
			}


			results[1][i].listedOn = [];
			results[1][i].notListedReasons = [];

			if (coinResults[0] !== undefined) {
				var listedOn = await globals.productPool.query("SELECT lo.platform FROM coins_to_listed_on clo LEFT JOIN listed_on lo ON clo.listed_on_id = lo.id WHERE clo.coin_id = ?", [coinResults[0].coin_id]);
				var reasons = await globals.productPool.query("SELECT nlr.reason FROM coins_to_not_listed_reasons cnlr LEFT JOIN not_listed_reasons nlr ON cnlr.not_listed_reason_id = nlr.id WHERE cnlr.coin_id = ?", [coinResults[0].coin_id]);

				for (var j = 0; j < listedOn.length; j++) {
					results[1][i].listedOn.push(listedOn[j].platform);
				}
				for (var j = 0; j < reasons.length; j++) {
					results[1][i].notListedReasons.push(reasons[j].reason);
				}
			}
		}
	}


	//populate rush product results  
	resp.rushProducts = results[1];

	return resp;
}


exports.getAllRRC = async (whereInfo, sortBy, offset, limit) => {
	let results = {
		totalCount: 0,
		rushProducts: []
	};
	let countSql = `SELECT COUNT(*) AS num FROM 
										products p
											LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
											LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2
											LEFT JOIN categories c ON c.category_id = cm.category_id
											LEFT JOIN categories c2 ON c2.category_id = c.parent_id
											LEFT JOIN storage_locations sl ON ((p.location_number = sl.location_number) AND (p.store_id = sl.store_id))
										${whereInfo.clause}
											AND p.sku NOT IN (SELECT products_sku FROM orders_internal)
										`;
	let sql = `SELECT p.status, p.name, p.image, p.condition_name, m.vendor_id, p.seller_product_id, p.location_number, s.store_name, s.partner_facility,
										p.sku, 
										p.dropship_type, p.limited_quantity, p.date_created,
										p.step_receive_done, p.step_verify_done, p.step_reshipping_done, p.step_condition_done, p.step_build_locate_done,
										p.tracking_number, p.vendor_supplier_code, p.incorrect_box_dims, p.in_original_boxes, p.reuse_original_boxes,
										p.assembly_instructions, p.pallet_number, p.store_id, p.manufacturer, p.online_quick_sale, lom.id as local_only_manufacturer_id,
										c2.category_id as category_1_id, c.category_id as category_2_id,	c2.name as category1, c.name as category2,
										bi.build_inspect_notes,
										damageTop.damage_location as damageLocation1, damageTop.damage_severity as damageSeverity1, 
										damageTop.damage_visibility as damageVisibility1, damageBottom.damage_location as damageLocation2, 
										damageBottom.damage_severity as damageSeverity2, damageBottom.damage_visibility as damageVisibility2, 
										damageInterior.damage_location as damageLocation3, damageInterior.damage_severity as damageSeverity3, 
										damageInterior.damage_visibility as damageVisibility3, missingHardware.missing_hardware_severity as missingHardware,
										sb.number_of_boxes, 
										sb.package_height1, sb.package_width1, sb.package_length1, sb.shipping_weight1, 
										sb.package_height2, sb.package_width2, sb.package_length2, sb.shipping_weight2, 
										sb.package_height3, sb.package_width3, sb.package_length3, sb.shipping_weight3, 
										sb.package_height4, sb.package_width4, sb.package_length4, sb.shipping_weight4, 
										sb.package_height5, sb.package_width5, sb.package_length5, sb.shipping_weight5, 
										sb.package_height6, sb.package_width6, sb.package_length6, sb.shipping_weight6, 
										sb.package_height7, sb.package_width7, sb.package_length7, sb.shipping_weight7, 
										sb.package_height8, sb.package_width8, sb.package_length8, sb.shipping_weight8, 
										sb.package_height9, sb.package_width9, sb.package_length9, sb.shipping_weight9, 
										sb.package_height10, sb.package_width10, sb.package_length10, sb.shipping_weight10, 
										sb.package_height11, sb.package_width11, sb.package_length11, sb.shipping_weight11, 
										sb.package_height12, sb.package_width12, sb.package_length12, sb.shipping_weight12, 
										sb.package_height13, sb.package_width13, sb.package_length13, sb.shipping_weight13, 
										sb.package_height14, sb.package_width14, sb.package_length14, sb.shipping_weight14, 
										sb.package_height15, sb.package_width15, sb.package_length15, sb.shipping_weight15, 
										sb.package_height16, sb.package_width16, sb.package_length16, sb.shipping_weight16, 
										sb.package_height17, sb.package_width17, sb.package_length17, sb.shipping_weight17, 
										sb.package_height18, sb.package_width18, sb.package_length18, sb.shipping_weight18, 
										sb.package_height19, sb.package_width19, sb.package_length19, sb.shipping_weight19, 
										sb.package_height20, sb.package_width20, sb.package_length20, sb.shipping_weight20,
										m.date_created as manifest_date_created, m.manifest_id, m.manifest_identifier, m.default_product_condition, 
										m.expected_delivery_date, m.manifest_source,
										sp.check_in_note
										FROM 
										products p
											LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
											LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2
											LEFT JOIN categories c ON c.category_id = cm.category_id
											LEFT JOIN categories c2 ON c2.category_id = c.parent_id
											LEFT JOIN stores s ON s.store_id = p.store_id
											LEFT JOIN product_damage_pricing_rules damageTop ON p.damage_top = damageTop.product_damage_pricing_rules_id 
											LEFT JOIN product_damage_pricing_rules damageBottom ON p.damage_bottom = damageBottom.product_damage_pricing_rules_id 
											LEFT JOIN product_damage_pricing_rules damageInterior ON p.damage_interior = damageInterior.product_damage_pricing_rules_id 
											LEFT JOIN product_missing_hardware_rules missingHardware ON p.missing_hardware = missingHardware.product_missing_hardware_rules_id 
											LEFT JOIN product_build_inspects bi ON p.sku = bi.sku 
											LEFT JOIN product_shipping_boxes sb ON p.sku = sb.sku
											LEFT JOIN gde_local_only_manufacturers lom ON lom.manufacturer = p.manufacturer
											LEFT JOIN storage_locations sl ON ((p.location_number = sl.location_number) AND (p.store_id = sl.store_id))
											LEFT JOIN staging_product sp ON sp.product_id = p.staging_product_id
								
										${whereInfo.clause}
											AND p.sku NOT IN (SELECT products_sku FROM orders_internal)
										ORDER BY ${sortBy}
										LIMIT ${offset},${limit}
										`;

	// console.log(mysql.format(countSql, whereInfo.values));
	console.log(mysql.format(sql, whereInfo.values));
	let count = await globals.poolRO.query(countSql, whereInfo.values);
	let rows = await globals.poolRO.query(sql, whereInfo.values);

	var prom = [];
	var vcProm = [];
	var supplierCodeProm = [];
	for (var i = 0; i < rows.length; i++) {
		rows[i].damageImages = [];
		rows[i].marketImages = [];
		rows[i].shippingLabelImages = [];
		rows[i].productVerifications = [];
		rows[i].productQuickSales = [];
		rows[i].files = [];

		// console.log(mysql.format(`SELECT tag, url FROM files WHERE tag IN ('damage', 'shipping label', 'market') AND sku = ?`, [rows[i].sku]));
		prom.push(globals.poolRO.query(`SELECT tag, url FROM files WHERE tag IN ('damage', 'shipping label', 'market') AND sku = ?`, [rows[i].sku]));
		prom.push(globals.poolRO.query(`SELECT * FROM product_verifications WHERE sku = ?`, [rows[i].sku]));
		prom.push(globals.poolRO.query(`SELECT * FROM product_quick_sales WHERE sku = ?`, [rows[i].sku]));
		prom.push(globals.poolRO.query(`SELECT file_id, tag, url, type FROM files WHERE sku = ?`, [rows[i].sku]));
		prom.push(globals.poolRO.query(`SELECT a.name AS attribute_name, c.name AS category_name, ca.category_id, ca.attribute_id, 
																			ca.vc_map, ca.in_filters, ca.filter_type, ca.filter_label, ca.on_pdp
																		FROM category_attributes ca
																			LEFT JOIN categories c ON c.category_id = ca.category_id
																			LEFT JOIN attributes a ON a.attribute_id = ca.attribute_id
																		WHERE ca.category_id = ${rows[i].category_2_id}
																		ORDER BY ca.display_order`));

		vcProm.push(globals.productROPool.query(`SELECT ds_percent_off_wholesale, upc, mpn, product_cost, main_image_knockout FROM vendor_catalog_products WHERE vendor_id = ? AND vendor_sku = ?`, [rows[i].vendor_id, rows[i].seller_product_id]));
		supplierCodeProm.push(globals.productROPool.query(`SELECT default_condition FROM vendor_supplier_codes WHERE vendor_id = ? AND supplier_code = ?`, [rows[i].vendor_id, rows[i].vendor_supplier_code]));
	}

	var result = await Promise.all(prom);
	var resultIndex = 0;


	for (var i = 0; i < rows.length; i++) {

		var images = result[resultIndex++];
		images = colUtils.outboundNaming(images);

		var verifications = result[resultIndex++];
		verifications = colUtils.outboundNaming(verifications);

		var quickSales = result[resultIndex++];
		quickSales = colUtils.outboundNaming(quickSales);

		var files = result[resultIndex++];
		files = colUtils.outboundNaming(files);

		for (var j = 0; j < images.length; j++) {
			switch (images[j].tag) {
				case 'damage':
					rows[i].damageImages.push(images[j].url);
					break;

				case 'market':
					rows[i].marketImages.push(images[j].url);
					break;

				case 'shipping label':
					rows[i].shippingLabelImages.push(images[j].url);
					break;
			}
		}
		for (var j = 0; j < files.length; j++) {
			rows[i].files.push(files[j]);
		}
		for (var j = 0; j < verifications.length; j++) {
			delete verifications[j].id;
			delete verifications[j].user_id;
			delete verifications[j].date_created;
			rows[i].productVerifications.push(verifications[j]);
		}
		for (var j = 0; j < quickSales.length; j++) {
			delete quickSales[j].id;
			rows[i].productQuickSales.push(quickSales[j]);
		}

		var categoryAttributes = result[resultIndex++];
		categoryAttributes = colUtils.outboundNaming(categoryAttributes);
		rows[i].categoryAttributes = categoryAttributes;

		if (rows[i].localOnlyManufacturerId !== null) {
			rows[i].defaultCondition = 'New';
		}

	}


	var vcProds = await Promise.all(vcProm);
	for (var i = 0; i < rows.length; i++) {
		if (vcProds[i][0] !== undefined) {
			rows[i].dsPercentOffWholesale = vcProds[i][0].ds_percent_off_wholesale;
			rows[i].upc = vcProds[i][0].upc;
			rows[i].mpn = vcProds[i][0].mpn;
			rows[i].product_cost = vcProds[i][0].product_cost;
			rows[i].mainImage = vcProds[i][0].main_image_knockout;
		}
	}

	var defaultConditions = await Promise.all(supplierCodeProm);
	for (var i = 0; i < rows.length; i++) {
		if ((defaultConditions[i][0] !== undefined) && (defaultConditions[i][0] !== null)) {
			rows[i].defaultCondition = defaultConditions[i][0].default_condition;
		}
		else {
			rows[i].defaultCondition = 'Like New';
		}
	}


	rows = colUtils.outboundNaming(rows);

	// If not online quick sale, product name should be vendor catalog name
	for (let product of rows) {
		if (product.onlineQuickSale === 'N') {
			const vendorCatalogProductRows = await VendorSkus.getByVendor(product.vendorId, product.sellerProductId);
			product.name = (vendorCatalogProductRows.length > 0) ? vendorCatalogProductRows[0].productName : null;
		}
	}

	results.totalCount = count[0].num;
	results.rushProducts = rows;

	return results;
}




exports.getAllProductsLite = async (includeShippingBoxes, includeBubble, removeProductsWithIssues, onlineEligibleLocation, whereInfo, sortBy, offset, limit) => {
	let resp = {
		totalCount: 0,
		rushProducts: []
	};
	let prom = [];
	let productSqlCount = ' SELECT count(*) AS num ';
	let productSql = `
      p.sku, p.seller_product_id, p.shopify_product_id, p.shopify_variant_id, p.shopify_inventory_item_id, p.status, p.online_shopping, 
      p.pallet_number, p.location_number, p.store_id, p.image, p.msrp, p.market_price, p.price, p.name, p.in_market_exclusive, 
      p.online_quick_sale, p.freshness_score, p.ship_type, p.pricing_type_id,  p.vendor_supplier_code, p.dropship_type, p.limited_quantity,
      CONVERT_TZ(p.date_to_release, '+00:00', '${process.env.UTC_OFFSET}') AS date_to_release, 
      CONVERT_TZ(p.date_created, '+00:00', '${process.env.UTC_OFFSET}') AS date_created, 
      CONVERT_TZ(p.date_modified, '+00:00', '${process.env.UTC_OFFSET}') AS date_modified, 
      CONVERT_TZ(p.date_online, '+00:00', '${process.env.UTC_OFFSET}') AS date_online, 
      m.vendor_id, m.manifest_identifier, m.manifest_source, 
      s.shopify_store_id, s.shopify_location_id, s.auto_online_skus, 
      c.category_id, c.featured_category, c.name AS category_2_name, 
      c2.name AS category_1_name, c2.category_id AS category_1_id 
  `;
	let productFromSql = `
    FROM 
      products p 
      LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
      LEFT JOIN stores s ON s.store_id = p.store_id 
      LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2 
      LEFT JOIN categories c ON c.category_id = cm.category_id 
      LEFT JOIN categories c2 ON c2.category_id = c.parent_id 
  `;
	if (includeBubble) {
		productSql = ` ${productSql},
      CONVERT_TZ(lcb.date_created, '+00:00', '${process.env.UTC_OFFSET}') AS bubble_date_created, 
      CONVERT_TZ(lcb.date_modified, '+00:00', '${process.env.UTC_OFFSET}') AS bubble_date_modified, 
      lcb.delete AS bubble_deleted, 
      lcb.tags AS bubble_tags 
    `;
		productFromSql = ` ${productFromSql} 
      LEFT JOIN lap_custer_bubbles lcb ON lcb.sku = p.sku 
    `;
	}
	if (includeShippingBoxes) {
		productSql = ` psb.*, 
      ${productSql}
    `;
		productFromSql = `
      ${productFromSql}
      LEFT JOIN product_shipping_boxes psb ON p.sku = psb.sku
    `;
	}
	if (removeProductsWithIssues) {
		productFromSql = ` ${productFromSql} 
      LEFT JOIN product_build_inspects bi ON bi.sku = p.sku 
      LEFT JOIN product_issues_queue piq ON piq.sku = p.sku 
    `;
	}
	if (onlineEligibleLocation) {
		productFromSql = ` ${productFromSql} 
      LEFT JOIN storage_locations l ON l.location_number = p.location_number AND l.store_id = p.store_id 
    `;
	}

	let countSql = `
    ${productSqlCount}
    ${productFromSql} 
    ${whereInfo.clause} 
  `;
	prom.push(globals.pool.query(countSql, whereInfo.values));

	let sql = `
    SELECT ${productSql} 
    ${productFromSql} 
    ${whereInfo.clause} 
  `;
	if (sortBy !== undefined) {
		sql = sql + ' ORDER BY ' + sortBy;
	}
	if (offset !== undefined) {
		whereInfo.values.push(offset);
		whereInfo.values.push(limit);
		sql = sql + ' LIMIT ?,?';
	}
	// console.log(mysql.format(sql, whereInfo.values));
	prom.push(globals.pool.query(sql, whereInfo.values));

	let results = await Promise.all(prom);
	resp.totalCount = results[0][0].num;
	colUtils.outboundNaming(results[1]);
	resp.rushProducts = results[1];

	return resp;
}



exports.getAllByCoin = async (member, whereInfo, coinWhereInfo, sortBy, offset, limit) => {
	var coinFlag = false;
	var qsFlag = false;
	var prom = [];
	var resp = {
		totalCount: 0,
		rushProducts: []
	};
	var quickSaleSkus = [];
	var qsWhereInfo = {
		clause: '',
		values: []
	}
	var vendorSkus = [];

	//	If filtering by COIN create filter by corresponding vendor sku
	if (coinWhereInfo.values.length > 0) {
		var results = await globals.productROPool.query("SELECT coin_id, vendor_sku FROM coins_to_vendor_skus " + coinWhereInfo.clause, coinWhereInfo.values);
		var placeholders = '';
		for (var i = 0; i < results.length; i++) {
			if (placeholders.length > 0) {
				placeholders += ', ';
			}
			placeholders += '?';
			vendorSkus.push(results[i].vendor_sku);
			_.remove(coinWhereInfo.values, function (n) {
				return n === results[i].coin_id;
			})
		}

		// If there are still coin values in the array they are likely quick sale skus
		var qsPlaceholders = '';
		for (var i = 0; i < coinWhereInfo.values.length; i++) {
			if (qsPlaceholders.length > 0) {
				qsPlaceholders += ', ';
			}
			qsPlaceholders += '?';
		}
		whereInfo = sqlUtils.appendWhere(whereInfo, 'p.seller_product_id IN (' + placeholders + ') ', vendorSkus);
		qsWhereInfo = sqlUtils.appendWhere(qsWhereInfo, 'q.sku IN (' + qsPlaceholders + ') ', coinWhereInfo.values);
	}


	// var count1Sql = "SELECT count(*) as num " +
	// 	"FROM product_quick_sales q " +
	// 	"LEFT JOIN products p ON ((p.sku = q.sku) AND (p.online_quick_sale = 'Y')) " +
	// 	"LEFT JOIN manifests m ON p.manifest_id = m.manifest_id " +
	// 	qsWhereInfo.clause;
	// var count2Sql = "SELECT count(*) as num " +
	// 	"FROM products p " +
	// 	"LEFT JOIN manifests m ON p.manifest_id = m.manifest_id " +
	// 	whereInfo.clause;

	var sql = "";

	//	Quick Sales
	if (coinWhereInfo.values.length > 0) {
		qsFlag = true;
		sql +=
			"SELECT p.*, m.vendor_id " +
			"FROM product_quick_sales q " +
			"LEFT JOIN products p ON ((p.sku = q.sku) AND (p.online_quick_sale = 'Y')) " +
			"LEFT JOIN manifests m ON p.manifest_id = m.manifest_id " +
			"LEFT JOIN stores s ON p.store_id = s.store_id " +
			"LEFT JOIN targeted_cities t ON s.city_id = t.id " +
			qsWhereInfo.clause + " AND online_shopping = 'Y' AND t.id IN (?, ?) ";

		coinWhereInfo.values.push(member.memberCityId);
		coinWhereInfo.values.push(member.hubCityId);
	}

	if ((sql.length > 0) && (whereInfo.values.length > 0)) {
		sql += " UNION ";
	}

	//	COINs
	if (whereInfo.values.length > 0) {
		coinFlag = true;
		sql += "SELECT p.*, m.vendor_id " +
			"FROM products p " +
			"LEFT JOIN manifests m ON p.manifest_id = m.manifest_id " +
			"LEFT JOIN stores s ON p.store_id = s.store_id " +
			"LEFT JOIN targeted_cities t ON s.city_id = t.id " +
			whereInfo.clause + " AND online_shopping = 'Y' AND t.id IN (?, ?) ";
		whereInfo.values.push(member.memberCityId);
		whereInfo.values.push(member.hubCityId);
	}


	sql += "ORDER BY seller_product_id, FIELD(`status`, 'Live', 'Sold', 'Active', 'Publish', 'Inactive'), FIELD(condition_name, 'Like New', '', 'New', 'Damaged', 'Good', 'Fair', 'Trash')";


	if (qsFlag && coinFlag) {
		// console.log(mysql.format(sql, _.concat(coinWhereInfo.values, whereInfo.values)));
		prom.push(globals.poolRO.query(sql, _.concat(coinWhereInfo.values, whereInfo.values)));
	} else if (qsFlag) {
		// console.log(mysql.format(sql, coinWhereInfo.values));
		prom.push(globals.poolRO.query(sql, _.concat(coinWhereInfo.values, whereInfo.values)));
	} else if (coinFlag) {
		// console.log(mysql.format(sql, whereInfo.values));
		prom.push(globals.poolRO.query(sql, whereInfo.values));
	}


	//	Get the total count and the result rows based on what queries where executed.
	var results = await Promise.all(prom);
	var rows = results[0];

	colUtils.outboundNaming(rows);

	prom = [];

	//	Fill in COIN values for resuling products that are not part of a quick sale.
	if (rows.length > 0) {
		var lastRespProductIndex = -1;
		var lastSellerProductId = '';
		var lastQuantity = 1;
		for (var i = 0; i < rows.length; i++) {
			if (rows[i].sellerProductId !== lastSellerProductId) {

				if (lastQuantity > 1) {
					resp.rushProducts[lastRespProductIndex].quantity = lastQuantity;
				}

				lastRespProductIndex++;

				if ((rows[i].status === 'Live') && (rows[i].onlineShopping === 'Y')) {
					lastQuantity = 1;
				} else {
					lastQuantity = 0;
				}

				lastSellerProductId = rows[i].sellerProductId;

				resp.rushProducts.push(rows[i]);

				prom.push(globals.productROPool.query("SELECT coin_id FROM coins_to_vendor_skus " +
					"WHERE vendor_id = ? AND vendor_sku = ?", [rows[i].vendorId, rows[i].sellerProductId.toUpperCase()]));
			} else {
				if ((rows[i].status === 'Live') && (rows[i].onlineShopping === 'Y')) {
					lastQuantity++;
				}
			}
		}
		resp.rushProducts[lastRespProductIndex].quantity = lastQuantity;

		if (prom.length > 0) {
			var results = await Promise.all(prom);
			for (var i = 0; i < resp.rushProducts.length; i++) {
				var coin = results[i];
				if ((coin !== undefined) && (coin.length > 0)) {
					resp.rushProducts[i].coinId = coin[0].coin_id;
				} else {
					resp.rushProducts[i].coinId = resp.rushProducts[i].sku;
				}
			}

			resp.totalCount = resp.rushProducts.length;

			if (offset < resp.rushProducts.length) {
				var end = offset + limit;
				if ((offset + limit) > resp.rushProducts.length) {
					end = resp.rushProducts.length;
				}
				resp.rushProducts = _.slice(resp.rushProducts, offset, end);

			} else {
				resp.rushProducts = [];
			}


		}
	}



	return resp;
}



exports.getByShopifyVariantId = async (shopifyVariantId) => {

	var rows = await globals.poolRO.query(
		`SELECT p.*, m.manifest_source
				FROM products p 
					LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
				WHERE p.shopify_variant_id = ?`, [shopifyVariantId]);

	colUtils.outboundNaming(rows);

	return rows;
}


exports.decrementLimitedDSQauntity = async (sku, quantity) => {

	var result = await globals.pool.query(
		`UPDATE products SET limited_quantity = limited_quantity - ? 
				WHERE sku = ? AND dropship_type = 'LIMITED'`, [quantity, sku]);
}


exports.deactivateLimitedDS = async (sku) => {
	var result = await globals.pool.query(`UPDATE products SET status = 'Inactive', inactive_reason_id = 27, online_shopping = 'N' WHERE sku = ?`, [sku]);
	result = await globals.pool.query(`INSERT INTO product_action_log (sku, action, inactive_reason_id, user_id, json) VALUES (?, 'STATUS_CHANGE', 27, 98, ' {"newStatus":"Live/Inactive"}')`, [sku]);
}




exports.getByCoin = async (coinId, member, variantFilters, onlyEligibleFlag) => {
	var byCoinFlag = false;
	var context = {
		byCoinFlag: false,
		coinId: coinId,
		filterSku: null,
		lastTime: undefined,
		member: member,
		oqsFlag: false,
		values: [],
		vcShipType: null,
		whereClause: ''
	};
	var noIndexFlag = false;
	var prom = [];
	var values = [];


	// console.log(`before getByCoin: ${new Date()}`)

	await baseCoinQueries(context, member, variantFilters, onlyEligibleFlag);
	// console.log(`after baseCoinQueries: ${new Date()}`)

	if (context.rushRows.length > 0) {

		colUtils.outboundNaming(context.rushRows);

		for (var i = 0; i < context.rushRows.length; i++) {

			if (context.rushRows[i].promotionId === null) {
				context.rushRows[i].promoId = null;
			}

			context.rushRows[i].productDescription = null;
			context.rushRows[i].productWidth = null;
			context.rushRows[i].productDepth = null;
			context.rushRows[i].productHeight = null;
			context.rushRows[i].primaryMaterial = null;
			context.rushRows[i].secondaryMaterial = null;
			context.rushRows[i].primaryColor = null;
			context.rushRows[i].bulletPoints = [];
			context.rushRows[i].images = [];
			context.rushRows[i].damageImages = [];
			context.rushRows[i].showRoomFlag = ((context.rushRows[i].locationNumber !== null) && (context.rushRows[i].locationNumber.startsWith("207"))) ? true : false;

			context.rushRows[i].marketInfo = {};
			context.rushRows[i].marketInfo.memberDisplayName = context.rushRows[i].memberDisplayName;
			context.rushRows[i].marketInfo.storeAddress = context.rushRows[i].storeAddress;
			context.rushRows[i].marketInfo.storeCity = context.rushRows[i].storeCity;
			context.rushRows[i].marketInfo.storeState = context.rushRows[i].storeState;
			context.rushRows[i].marketInfo.storeZip = context.rushRows[i].storeZip;
			context.rushRows[i].marketInfo.virtualLocation = context.rushRows[i].virtualLocation;
			context.rushRows[i].marketInfo.partnerFacility = context.rushRows[i].partnerFacility;
			context.rushRows[i].marketInfo.timeZone = context.rushRows[i].timeZone;
			context.rushRows[i].marketInfo.instorePickupAvailable = context.rushRows[i].instorePickupAvailable;


			//	Normal COIN
			if ((context.coinRows.length > 0) && (!context.oqsFlag)) {
				await populateCOIN(context, i)
			}
			//	Quick Sale
			else {
				await populateOQS(context, i);
			}


			//	Only get attributes for the first rush sku
			if (i === 0) {
				if (context.oqsFlag) {
					await populateOQSAttributes(context);
				}
				else {
					await populateAttributes(context);
				}
			}

			//	If not New, look for market and damage images
			await retrieveMarketAndDamageImages(context, i)


			delete context.rushRows[i].dimensions;
			delete context.rushRows[i].material;
			delete context.rushRows[i].color;
			delete context.rushRows[i].bullets;
			delete context.rushRows[i].storeName;
			delete context.rushRows[i].storeAddress;
			delete context.rushRows[i].storeCity;
			delete context.rushRows[i].storeState;
			delete context.rushRows[i].storeZip;
			delete context.rushRows[i].virtualLocation;
			delete context.rushRows[i].image;
		}
	}

	// console.log(`after getByCoin: ${new Date()}`)

	return context.rushRows;
}



var baseCoinQueries = async (context, member, variantFilters, onlyEligibleFlag) => {
	var prom = [];

	// context.lastTime = showTimeDiff('M:baseCoinQueries:IN', context.lastTime);

	//	CoinId will either be a true COIN or it'll be a sku in a COIN or a quick sale sku.
	prom.push(globals.productROPool.query(
		`SELECT v.name as vendor_name, v.rush_market_availability, v.warehouse1_postal_code AS drop_ship_origin, p.number_of_boxes, p.product_name, p.vendor_id, p.vendor_sku, p.pull_data_forward_flag, p.ship_type, p.msrp,  
					p.main_image_knockout as image1, p.main_image_lifestyle as image2, p.alt_image3 as image3, p.alt_image4 as image4, p.alt_image5 as image5, 
					p.product_width, p.product_depth, p.product_height, p.primary_material, p.secondary_material, p.primary_color, 
					p.bullet_point1, p.bullet_point2, p.bullet_point3, p.bullet_point4, p.style_tag1, p.product_description, p.product_size as size,
					p.attribute_name1, p.attribute_name2, p.attribute_name3, p.attribute_name4, p.attribute_name5, p.attribute_name6, 
					p.attribute_value1, p.attribute_value2, p.attribute_value3, p.attribute_value4, p.attribute_value5, p.attribute_value6,
					p.assembly_reqd, p.prop_65, p.prop_65_chemicals, p.prop_65_warning_label        
				FROM vendor_catalog_products p 
					LEFT JOIN coins_to_vendor_skus c ON ((c.vendor_id = p.vendor_id) AND (c.vendor_sku = p.vendor_sku)) 
					LEFT JOIN vendors v ON p.vendor_id = v.id
				WHERE c.coin_id = ? `, [context.coinId.toString()]));

	prom.push(globals.poolRO.query(
		`SELECT m.vendor_id, product_id, seller_product_id, online_quick_sale, v.coin_id
					FROM products p 
						LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
						LEFT JOIN coins_to_vskus v ON ((m.vendor_id = v.vendor_id) AND (p.seller_product_id = V.vendor_sku))
					WHERE p.sku = ?`, [context.coinId]));

	var promResults = await Promise.all(prom);

	// context.lastTime = showTimeDiff('M:baseCoinQueries:1', context.lastTime);

	context.coinRows = promResults[0];
	context.skuRows = promResults[1];


	//	Check for a VC ship type if OQS
	if ((context.skuRows.length > 0) && (context.skuRows[0].online_quick_sale === 'Y')) {
		context.oqsFlag = true;
		var results = await globals.productROPool.query("SELECT ship_type FROM vendor_catalog_products WHERE vendor_id = ? AND vendor_sku = ?", [context.skuRows[0].vendor_id, context.skuRows[0].seller_product_id]);
		if (results.length > 0) {
			context.vcShipType = results[0].ship_type;
		}
	}
	//	Pull VC info if a non-OQS was pulled by sku
	else if ((context.coinRows.length === 0) && (context.skuRows.length > 0) && (context.skuRows[0].coin_id !== null)) {
		context.filterSku = context.coinId;
		context.coinId = context.skuRows[0].coin_id;
		context.coinRows = await globals.productROPool.query(
			`SELECT v.name as vendor_name, v.rush_market_availability, v.warehouse1_postal_code AS drop_ship_origin, p.product_name, p.vendor_id, p.vendor_sku, p.pull_data_forward_flag, p.ship_type, p.msrp,  
						p.main_image_knockout as image1, p.main_image_lifestyle as image2, p.alt_image3 as image3, p.alt_image4 as image4, p.alt_image5 as image5, 
						p.product_width, p.product_depth, p.product_height, p.primary_material, p.secondary_material, p.primary_color, 
						p.bullet_point1, p.bullet_point2, p.bullet_point3, p.bullet_point4, p.style_tag1, p.product_description, p.product_size as size,
						prop_65, prop_65_chemicals, prop_65_warning_label
					FROM vendor_catalog_products p 
						LEFT JOIN coins_to_vendor_skus c ON ((c.vendor_id = p.vendor_id) AND (c.vendor_sku = p.vendor_sku)) 
						LEFT JOIN vendors v ON p.vendor_id = v.id
					WHERE c.coin_id = ? `, [context.skuRows[0].coin_id.toString()]);


	}

	// console.log(`after baseQueries A: ${new Date()}`)

	await getRushSkus(context, variantFilters, onlyEligibleFlag);

	// console.log(`after baseQueries B: ${new Date()}`)

	return context;
}


var getRushSkus = async (context, variantFilters, onlyEligibleFlag) => {
	if (context.coinRows.length > 0) {
		context.vSkuClause = '';

		//	Build vendor sku clause AND also look for a vendor in this COIN who doesn't want availability to go beyond local.
		for (var i = 0; i < context.coinRows.length; i++) {
			if (context.vSkuClause.length > 0) {
				context.vSkuClause += " OR ";
			}
			context.vSkuClause += "(m.vendor_id = ? AND seller_product_id = ?)"
			context.values.push(context.coinRows[i].vendor_id);
			context.values.push(context.coinRows[i].vendor_sku);

			if (context.coinRows[i].rush_market_availability === 'LOCAL') {
				context.noIndexFlag = true;
			}
		}

		// console.log(new moment() + " d ");

		context.whereClause = `WHERE (((status = 'Live')) OR (status != 'Live')) AND (${context.vSkuClause}) `;
		if (context.filterSku !== null) {
			context.whereClause += ` AND p.sku = ? `;
			context.values.push(context.filterSku);
		}
		context.whereClause += `AND s.store_id IN (SELECT store_id FROM stores s
																	WHERE s.shopify_store_id = ?) 
																			AND p.online_quick_sale = 'N'`;
		context.values.push(context.member.homeShopifyStoreId);

		if ((variantFilters !== undefined) && (variantFilters.length > 0)) {
			context.whereClause += ` AND p.shopify_variant_id IN (${variantFilters.toString()})`
		}

	} else if (context.skuRows.length > 0) {
		context.whereClause = `WHERE (((status = 'Live')) OR (status != 'Live')) AND p.product_id = ? 
																 AND s.store_id IN (SELECT store_id FROM stores s 
																				WHERE s.shopify_store_id = ?)`;
		context.values.push(context.skuRows[0].product_id);
		context.values.push(context.member.homeShopifyStoreId);
	}

	// if (onlyEligibleFlag) {
	// 	context.whereClause += ` AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'`;
	// }

	context.rushRows = [];
	if (context.whereClause.length > 0) {

		// console.log(mysql.format(`SELECT c.front_end_space, c.front_end_name, LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) AS category_slug, 
		// t.id as variant_city_id, t.city as variant_city, t.city_slug as variant_city_slug, s.zip as variant_zip, 
		// s.member_display_name, s.address as store_address, s.city as store_city, s.state as store_state, s.zip as store_zip, s.partner_facility, s.timezone as store_timezone,
		// m.manifest_source, m.vendor_id, a.default_location as virtual_location, p.ship_type as corelink_ship_type, p.*, 
		// qs.dimensions, qs.material, qs.color, qs.bullets, qs.size, qs.weight as qs_weight, ppt.pricing_type,
		// dtop.damage_severity as damage_severity_top, dtop.damage_visibility as damage_visibility_top,
		// dbot.damage_severity as damage_severity_bottom, dbot.damage_visibility as damage_visibility_bottom,
		// dint.damage_severity as damage_severity_interior, dint.damage_severity as damage_visibility_interior,
		// hd.missing_hardware_severity, bi.in_box, pp.promo_id, pm.id as promotion_id, COALESCE(eligibility_override, eligibility) as effective_eligibility, national_ship_cost, local_ship_cost, als.state as ripple,
		// ship_eligible
		// FROM products p 
		// LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
		// LEFT JOIN categories c ON c.category_id = cm.category_id 
		// LEFT JOIN manifests m ON p.manifest_id = m.manifest_id 
		// LEFT JOIN stores s ON p.store_id = s.store_id 
		// LEFT JOIN targeted_cities t ON s.city_id = t.id 
		// LEFT JOIN storage_areas a ON ((a.store_id = p.store_id) AND (a.storage_area = 999)) 
		// LEFT JOIN product_quick_sales qs ON p.sku = qs.sku 
		// LEFT JOIN product_pricing_types ppt ON ppt.pricing_type_id = p.pricing_type_id 
		// LEFT JOIN product_damage_pricing_rules dtop ON p.damage_top = dtop.product_damage_pricing_rules_id 
		// LEFT JOIN product_damage_pricing_rules dbot ON p.damage_bottom = dbot.product_damage_pricing_rules_id 
		// LEFT JOIN product_damage_pricing_rules dint ON p.damage_interior = dint.product_damage_pricing_rules_id 
		// LEFT JOIN product_missing_hardware_rules hd ON p.missing_hardware = hd.product_missing_hardware_rules_id 
		// LEFT JOIN product_build_inspects bi ON bi.sku = p.sku 
		// LEFT JOIN promotion_products pp ON pp.sku = p.sku 
		// LEFT JOIN promotions pm ON ((start_date <= NOW()) AND (end_date > NOW()) AND (pm.id = pp.promo_id)) 
		// LEFT JOIN metro_sku_eligibility e ON ((e.sku = p.sku) AND (e.dest_city_id = ${context.member.homeCityId}))
		// LEFT JOIN metro_sku_eligibility_summary es ON es.sku = p.sku 
		// LEFT JOIN gde_sku_algo_state als ON p.sku = als.sku 
		// ${context.whereClause} 
		// ORDER BY FIELD(condition_name, 'Like New', '', 'New', 'Damaged', 'Good', 'Fair', 'Trash'), FIELD(online_shopping, 'Y', 'N'), price ASC, 
		// 				FIELD(effective_eligibility, 'SHIPPABLE', 'LOCAL_ONLY', 'BOPIS_ONLY', 'NOT_ELIGIBLE', null), e.national_ship_cost, p.store_id, 
		// 				SUBSTRING(p.location_number, 1, 3) DESC, m.manifest_source, FIELD(product_display, 'Original Packaging', 'In Market', '', null)`, context.values));


		context.rushRows = await globals.poolRO.query(`SELECT c.category_id, cp.name as category_1, c.name as category_2, c.front_end_space, c.front_end_name, LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) AS category_slug, 
			t.id as variant_city_id, t.city as variant_city, t.city_slug as variant_city_slug, s.zip as variant_zip, 
			s.member_display_name, s.address as store_address, s.city as store_city, s.state as store_state, s.zip as store_zip, s.partner_facility, s.timezone as store_timezone, s.instore_pickup_available,
			m.manifest_source, m.vendor_id, a.default_location as virtual_location, p.ship_type as corelink_ship_type, p.*, 
			qs.dimensions, qs.material, qs.color, qs.bullets, qs.size, qs.weight as qs_weight, ppt.pricing_type,
			dtop.damage_severity as damage_severity_top, dtop.damage_visibility as damage_visibility_top,
			dbot.damage_severity as damage_severity_bottom, dbot.damage_visibility as damage_visibility_bottom,
			dint.damage_severity as damage_severity_interior, dint.damage_severity as damage_visibility_interior,
			hd.missing_hardware_severity, bi.in_box, pp.promo_id, pm.id as promotion_id, COALESCE(eligibility_override, eligibility) as effective_eligibility, national_ship_cost, local_ship_cost, als.state as ripple,
			ship_eligible, psb.number_of_boxes
			FROM products p 
			LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
			LEFT JOIN categories c ON c.category_id = cm.category_id 
			LEFT JOIN categories cp ON c.parent_id = cp.category_id
			LEFT JOIN manifests m ON p.manifest_id = m.manifest_id 
			LEFT JOIN stores s ON p.store_id = s.store_id 
			LEFT JOIN targeted_cities t ON s.city_id = t.id 
			LEFT JOIN storage_areas a ON ((a.store_id = p.store_id) AND (a.storage_area = 999)) 
			LEFT JOIN product_quick_sales qs ON p.sku = qs.sku 
			LEFT JOIN product_shipping_boxes psb ON p.sku = psb.sku
			LEFT JOIN product_pricing_types ppt ON ppt.pricing_type_id = p.pricing_type_id 
			LEFT JOIN product_damage_pricing_rules dtop ON p.damage_top = dtop.product_damage_pricing_rules_id 
			LEFT JOIN product_damage_pricing_rules dbot ON p.damage_bottom = dbot.product_damage_pricing_rules_id 
			LEFT JOIN product_damage_pricing_rules dint ON p.damage_interior = dint.product_damage_pricing_rules_id 
			LEFT JOIN product_missing_hardware_rules hd ON p.missing_hardware = hd.product_missing_hardware_rules_id 
			LEFT JOIN product_build_inspects bi ON bi.sku = p.sku 
			LEFT JOIN promotion_products pp ON pp.sku = p.sku 
			LEFT JOIN promotions pm ON ((start_date <= NOW()) AND (end_date > NOW()) AND (pm.id = pp.promo_id)) 
			LEFT JOIN metro_sku_eligibility e ON ((e.sku = p.sku) AND (e.dest_city_id = ${context.member.homeCityId}))
			LEFT JOIN metro_sku_eligibility_summary es ON es.sku = p.sku
			LEFT JOIN gde_sku_algo_state als ON p.sku = als.sku 
			${context.whereClause} 
			ORDER BY FIELD(condition_name, 'Like New', '', 'New', 'Damaged', 'Good', 'Fair', 'Trash'), FIELD(online_shopping, 'Y', 'N'), price ASC, 
							FIELD(effective_eligibility, 'SHIPPABLE', 'LOCAL_ONLY', 'BOPIS_ONLY', 'NOT_ELIGIBLE', null), e.national_ship_cost, p.store_id, 
							SUBSTRING(p.location_number, 1, 3) DESC, m.manifest_source, FIELD(product_display, 'Original Packaging', 'In Market', '', null)`, context.values);

	}
}


var populateCOIN = async (context, index) => {
	var prom = [];

	if (!context.pullForwardIndex) {
		let pullForwardIndex = getPullForwardSku(context.coinRows);
		context.pullForwardIndex = pullForwardIndex;

		context.rushRows[index].pullForwardVendorSku = {
			vendorId: context.coinRows[context.pullForwardIndex].vendor_id,
			vendorSku: context.coinRows[context.pullForwardIndex].vendor_sku
		}
	}

	//	If dropship update the marketInfo zip to the warehouse1 zip.
	if (context.rushRows[index].storeId === 106) {
		context.rushRows[index].marketInfo.storeZip = context.coinRows[context.pullForwardIndex].drop_ship_origin;
	}


	context.rushRows[index].assemblyInstructions = [];
	context.rushRows[index].totalLikes = 0;

	//	Things we do only if this is the first variant (COIN level)
	if (index === 0) {
		prom.push(globals.poolRO.query("SELECT tag, url FROM files WHERE vendor_id = ? AND vendor_sku = ? AND (tag IN ('assembly instructions')) ", [context.coinRows[context.pullForwardIndex].vendor_id, context.coinRows[context.pullForwardIndex].vendor_sku]));
		prom.push(Members.countFindsByCoin(context.coinId));

		var miscInfo = await Promise.all(prom);

		var assemblyInstructions = miscInfo[0];
		for (var j = 0; j < assemblyInstructions.length; j++) {
			context.rushRows[index].assemblyInstructions.push(assemblyInstructions[j].url);
		}


		var findsCount = miscInfo[1];
		if (findsCount.length > 0) {
			context.rushRows[index].totalLikes = findsCount[0].num;
		}

		context.rushRows[index].coinId = context.coinId;
		context.rushRows[index].noIndexFlag = context.noIndexFlag;
		context.rushRows[index].vendorName = context.coinRows[0].vendor_name;

		// context.rushRows[index].size = context.coinRows[0].size;

		context.rushRows[index].productDimensions = '';
		if ((context.coinRows[context.pullForwardIndex].product_width !== undefined) && (context.coinRows[context.pullForwardIndex].product_width !== null)) {
			context.rushRows[index].productDimensions = context.coinRows[context.pullForwardIndex].product_width + '" W';
		}
	
		if ((context.coinRows[context.pullForwardIndex].product_depth !== undefined) && (context.coinRows[context.pullForwardIndex].product_depth !== null)) {
			if (context.rushRows[index].productDimensions.length > 0) {
				context.rushRows[index].productDimensions += ' x ';
			}
			context.rushRows[index].productDimensions += context.coinRows[context.pullForwardIndex].product_depth + '" D';
		}
	
		if ((context.coinRows[context.pullForwardIndex].product_height !== undefined) && (context.coinRows[context.pullForwardIndex].product_height !== null)) {
			if (context.rushRows[index].productDimensions.length > 0) {
				context.rushRows[index].productDimensions += ' x ';
			}
			context.rushRows[index].productDimensions += context.coinRows[context.pullForwardIndex].product_height + '" H';
		}
	
		if ((context.coinRows[context.pullForwardIndex].primary_material !== undefined) && (context.coinRows[context.pullForwardIndex].primary_material !== null) && (context.coinRows[context.pullForwardIndex].primary_material.length > 0)) {
			context.rushRows[index].primaryMaterial = context.coinRows[context.pullForwardIndex].primary_material;
		}
		if ((context.coinRows[context.pullForwardIndex].secondary_material !== undefined) && (context.coinRows[context.pullForwardIndex].secondary_material !== null) && (context.coinRows[context.pullForwardIndex].secondary_material.length > 0)) {
			context.rushRows[index].secondaryMaterial = context.coinRows[context.pullForwardIndex].secondary_material;
		}
		if ((context.coinRows[context.pullForwardIndex].style_tag1 !== undefined) && (context.coinRows[context.pullForwardIndex].style_tag1 !== null) && (context.coinRows[context.pullForwardIndex].style_tag1.length > 0)) {
			context.rushRows[index].styleTag1 = context.coinRows[context.pullForwardIndex].style_tag1;
		}
		if ((context.coinRows[context.pullForwardIndex].primary_color !== undefined) && (context.coinRows[context.pullForwardIndex].primary_color !== null) && (context.coinRows[context.pullForwardIndex].primary_color.length > 0)) {
			context.rushRows[index].primaryColor = context.coinRows[context.pullForwardIndex].primary_color;
		}
		if ((context.coinRows[context.pullForwardIndex].bullet_point1 !== undefined) && (context.coinRows[context.pullForwardIndex].bullet_point1 !== null) && (context.coinRows[context.pullForwardIndex].bullet_point1.length > 0)) {
			context.rushRows[index].bulletPoints.push(context.coinRows[context.pullForwardIndex].bullet_point1);
		}
		if ((context.coinRows[context.pullForwardIndex].bullet_point2 !== undefined) && (context.coinRows[context.pullForwardIndex].bullet_point2 !== null) && (context.coinRows[context.pullForwardIndex].bullet_point2.length > 0)) {
			context.rushRows[index].bulletPoints.push(context.coinRows[context.pullForwardIndex].bullet_point2);
		}
		if ((context.coinRows[context.pullForwardIndex].bullet_point3 !== undefined) && (context.coinRows[context.pullForwardIndex].bullet_point3 !== null) && (context.coinRows[context.pullForwardIndex].bullet_point3.length > 0)) {
			context.rushRows[index].bulletPoints.push(context.coinRows[context.pullForwardIndex].bullet_point3);
		}
		if ((context.coinRows[context.pullForwardIndex].bullet_point4 !== undefined) && (context.coinRows[context.pullForwardIndex].bullet_point4 !== null) && (context.coinRows[context.pullForwardIndex].bullet_point4.length > 0)) {
			context.rushRows[index].bulletPoints.push(context.coinRows[context.pullForwardIndex].bullet_point4);
		}
		if ((context.coinRows[context.pullForwardIndex].product_description !== undefined) && (context.coinRows[context.pullForwardIndex].product_description !== null) && (context.coinRows[context.pullForwardIndex].product_description.length > 0)) {
			context.rushRows[index].productDescription = context.coinRows[context.pullForwardIndex].product_description;
		}
		if ((context.coinRows[context.pullForwardIndex].image1 !== undefined) && (context.coinRows[context.pullForwardIndex].image1 !== null) && (context.coinRows[context.pullForwardIndex].image1.length > 0)) {
			context.rushRows[index].images.push(context.coinRows[context.pullForwardIndex].image1);
		}
		if ((context.coinRows[context.pullForwardIndex].image2 !== undefined) && (context.coinRows[context.pullForwardIndex].image2 !== null) && (context.coinRows[context.pullForwardIndex].image2.length > 0)) {
			context.rushRows[index].images.push(context.coinRows[context.pullForwardIndex].image2);
		}
		if ((context.coinRows[context.pullForwardIndex].image3 !== undefined) && (context.coinRows[context.pullForwardIndex].image3 !== null) && (context.coinRows[context.pullForwardIndex].image3.length > 0)) {
			context.rushRows[index].images.push(context.coinRows[context.pullForwardIndex].image3);
		}
		if ((context.coinRows[context.pullForwardIndex].image4 !== undefined) && (context.coinRows[context.pullForwardIndex].image4 !== null) && (context.coinRows[context.pullForwardIndex].image4.length > 0)) {
			context.rushRows[index].images.push(context.coinRows[context.pullForwardIndex].image4);
		}
		if ((context.coinRows[context.pullForwardIndex].image5 !== undefined) && (context.coinRows[context.pullForwardIndex].image5 !== null) && (context.coinRows[context.pullForwardIndex].image5.length > 0)) {
			context.rushRows[index].images.push(context.coinRows[context.pullForwardIndex].image5);
		}
	
		if (context.coinRows[context.pullForwardIndex].prop_65 === 'Y') {
			context.rushRows[index].prop65 = {
				chemicals: context.coinRows[context.pullForwardIndex].prop_65_chemicals,
				warningLabel: context.coinRows[context.pullForwardIndex].prop_65_warning_label
			}
		}
		else {
			context.rushRows[index].prop65 = null;	
		}

	}
	//	End things we do only if this is the first variant (COIN level)



	context.rushRows[index].numberOfBoxes = context.rushRows[index].numberOfBoxes ? context.rushRows[index].numberOfBoxes  : context.coinRows[context.pullForwardIndex].numberOfBoxes ? context.coinRows[context.pullForwardIndex].numberOfBoxes : 1;

	context.rushRows[index].name = ((context.coinRows[context.pullForwardIndex].product_name !== undefined) && (context.coinRows[context.pullForwardIndex].product_name !== null)) ? context.coinRows[context.pullForwardIndex].product_name : context.rushRows[index].name;
	context.rushRows[index].shipType = (context.rushRows[index].corelinkShipType !== null) ? context.rushRows[index].corelinkShipType : context.coinRows[context.pullForwardIndex].ship_type;

	if ((context.coinRows[context.pullForwardIndex].msrp !== undefined) && (context.coinRows[context.pullForwardIndex].msrp !== null)) {
		context.rushRows[index].msrp = context.coinRows[context.pullForwardIndex].msrp;
	}

}


var populateOQS = async (context, index) => {

	var coin = await globals.productROPool.query("SELECT coin_id FROM coins_to_vendor_skus WHERE vendor_id = ? AND vendor_sku = ?", [context.skuRows[0].vendor_id, context.skuRows[0].seller_product_id]);

	var assemblyInstructions = await globals.poolRO.query("SELECT tag, url FROM files WHERE vendor_id = ? AND vendor_sku = ? AND (tag IN ('assembly instructions')) ", [context.skuRows[0].vendor_id, context.skuRows[0].seller_product_id]);
	context.rushRows[index].assemblyInstructions = [];
	for (var j = 0; j < assemblyInstructions.length; j++) {
		context.rushRows[index].assemblyInstructions.push(assemblyInstructions[j].url);
	}


	if (coin.length > 0) {
		context.rushRows[index].coinId = coin[0].coin_id;
	} else {
		context.rushRows[index].coinId = null;
	}

	if (context.rushRows[index].corelinkShipType !== null) {
		context.rushRows[index].shipType = context.rushRows[index].corelinkShipType;
	} else if ((context.vcShipType !== undefined) && (context.vcShipType !== null) && (context.vcShipType.length > 0)) {
		context.rushRows[index].shipType = context.vcShipType;
	} else {
		context.rushRows[index].shipType = null;
	}

	context.rushRows[index].numberOfBoxes = context.rushRows[index].numberOfBoxes ? context.rushRows[index].numberOfBoxes  : 1;

	context.rushRows[index].images.push(context.rushRows[index].image);
	if ((context.rushRows[index].dimensions !== undefined) && (context.rushRows[index].dimensions !== null) && (context.rushRows[index].dimensions.length > 0)) {
		context.rushRows[index].productDimensions = context.rushRows[index].dimensions;
	} else context.rushRows[index].productDimensions = null;
	if ((context.rushRows[index].material !== undefined) && (context.rushRows[index].material !== null) && (context.rushRows[index].material.length > 0)) {
		context.rushRows[index].primaryMaterial = context.rushRows[index].material;
	} else {
		context.rushRows[index].primaryMaterial = null;
	}
	context.rushRows[index].secondaryMaterial = null;
	if ((context.rushRows[index].color !== undefined) && (context.rushRows[index].color !== null) && (context.rushRows[index].color.length > 0)) {
		context.rushRows[index].primaryColor = context.rushRows[index].color;
	} else {
		context.rushRows[index].primaryColor = null;
	}
	if ((context.rushRows[index].size !== undefined) && (context.rushRows[index].size !== null) && (context.rushRows[index].size.length > 0)) {
		context.rushRows[index].size = context.rushRows[index].size;
	} else {
		context.rushRows[index].size = null;
	}
	if ((context.rushRows[index].bullets !== undefined) && (context.rushRows[index].bullets !== null) && (context.rushRows[index].bullets.length > 0)) {
		var s = _.split(context.rushRows[index].bullets, '|');
		for (var j = 0; j < s.length; j++) {
			context.rushRows[index].bulletPoints.push(s[j]);
		}
	}
	if ((context.rushRows[index].qsWeight !== undefined) && (context.rushRows[index].qsWeight !== null)) {
		context.rushRows[index].weight = context.rushRows[index].qsWeight;
		context.rushRows[index].qsWeight = undefined;
	}

	context.rushRows[index].prop65 = null;

}



var retrieveMarketAndDamageImages = async (context, index) => {
	var marketDamageImages = [];
	if (((context.rushRows[index].conditionName === 'Like New') || (context.rushRows[index].conditionName === 'Damaged') || (context.rushRows[index].conditionName === 'Good') || (context.rushRows[index].conditionName === 'Fair')) &&
		(context.rushRows[index].status !== 'Inactive') && (context.rushRows[index].status !== 'Sold')) {
		marketDamageImages = await globals.poolRO.query("SELECT tag, url FROM files WHERE sku = ? AND (tag IN ('damage', 'market')) ", context.rushRows[index].sku);
	}


	for (var j = 0; j < marketDamageImages.length; j++) {
		if (marketDamageImages[j].tag === 'market') {
			context.rushRows[index].images.push(marketDamageImages[j].url)
		} else {
			context.rushRows[index].damageImages.push(marketDamageImages[j].url);
		}
	}
}

var getPullForwardSku = (coinRows) => {
	var index = 0;

	for (var i = 0; i < coinRows.length; i++) {
		if (coinRows[i].pull_data_forward_flag) {
			return i;
		}
	}

	return index;
}


exports.getCoinFromCache = async (coinId, shopifyStoreId) => {

	var sql = "SELECT variants FROM rush_products_cache WHERE coin_id = ? AND shopify_store_id = ?";

	// console.log(mysql.format(sql, [coinId, shopifyStoreId]));
	var rows = await globals.pool.query(sql, [coinId, shopifyStoreId]);

	return (rows.length === 0) ? null : JSON.parse(rows[0].variants);
}


var populateAttributes = async (context) => {
	let prom = [];

	//	Only find attribute values if this is the first variant.
	let rushSku = context.rushRows[0];
	let vSku = context.coinRows[context.pullForwardIndex];

	let categoryAttributes = await CategoryAttributes.getByCategoryId(rushSku.categoryId);

	rushSku.attributes = [];
	for (var i = 0; i < categoryAttributes.length; i++) {
		categoryAttributes[i].name = categoryAttributes[i].attributeName;
		categoryAttributes[i].label = categoryAttributes[i].filterLabel;
		categoryAttributes[i].type = categoryAttributes[i].filterType;
		categoryAttributes[i].filterDisplayFlag = (categoryAttributes[i].inFilters === 'Y') ? true : false;
		categoryAttributes[i].pdpDisplayFlag = (categoryAttributes[i].onPdp === 'Y') ? true : false;
		categoryAttributes[i].values = [];
		categoryAttributes[i].units = categoryAttributes[i].units;

		if (vSku && categoryAttributes[i].attributeName === 'Dimensions') {
			categoryAttributes[i].values.push(`${vSku.product_width}" W x ${vSku.product_depth}" D x ${vSku.product_height}" H`);
		} else {
			prom.push(pullVCAttributeValues(categoryAttributes[i], vSku, categoryAttributes[i].vcMap));
		}

		delete categoryAttributes[i].attributeName;
		delete categoryAttributes[i].categoryId;
		delete categoryAttributes[i].inFilters;
		delete categoryAttributes[i].filterType;
		delete categoryAttributes[i].filterLabel;
		delete categoryAttributes[i].inFilters;
		delete categoryAttributes[i].onPdp;
		delete categoryAttributes[i].vcMap;
	}

	await Promise.all(prom);

	rushSku.attributes = categoryAttributes;
	// console.log("here");
}


var populateOQSAttributes = async (context) => {
	var colorIndex = null;
	var materialIndex = null;
	var oqsAttributes = [];

	//	Only find attribute values if this is the first variant.
	var rushSku = context.rushRows[0];

	var categoryAttributes = await CategoryAttributes.getByCategoryId(rushSku.categoryId);


	rushSku.attributes = [];
	for (var i = 0; i < categoryAttributes.length; i++) {

		if ((!colorIndex) && categoryAttributes[i].attributeName && (categoryAttributes[i].attributeName.indexOf("Color") > -1)) {
			colorIndex = i;
		}

		if ((!materialIndex) && categoryAttributes[i].attributeName && (categoryAttributes[i].attributeName.indexOf("Material") > -1)) {
			materialIndex = i;
		}
	}


	populateOQSAttribute('Color', 1, 1, colorIndex, rushSku, categoryAttributes, oqsAttributes);

	populateOQSAttribute('Material', 2, 2, materialIndex, rushSku, categoryAttributes, oqsAttributes);

	var att = {
		attributeId: 90,
		categoryName: categoryAttributes.length ? categoryAttributes[0].categoryName : rushSku.category2,
		name: 'Dimensions',
		label: '',
		type: '',
		filterDisplayFlag: false,
		pdpDisplayFlag: true,
		values: [],
		units: "",
		displayOrder: 3
	}
	att.values.push(rushSku.dimensions);
	oqsAttributes.push(att);

	rushSku.attributes = oqsAttributes;
}


var populateOQSAttribute = (label, defaultAttributeId, displayOrder, index, rushSku, categoryAttributes, oqsAttributes) => {
	var att = {};

	if (index !== null) {
		att = categoryAttributes[index];
		att.name = att.attributeName;
		att.label = att.filterLabel;
		att.type = att.filterType;
		att.filterDisplayFlag = (att.inFilters === 'Y') ? true : false;
		att.pdpDisplayFlag = (att.onPdp === 'Y') ? true : false;
		att.values = [];
		att.units = "";
		att.displayOrder = displayOrder;
	}
	else {
		att = {
			attributeId: defaultAttributeId,
			categoryName: categoryAttributes.length ? categoryAttributes[0].categoryName: null,
			name: label,
			label: label,
			type: '',
			filterDisplayFlag: false,
			pdpDisplayFlag: true,
			values: [],
			units: "",
			displayOrder: displayOrder
		}
	}

	label = label.toLowerCase();
	var s = _.split(rushSku[`${label}`], ',');
	for (var j = 0; j < s.length; j++) {
		att.values.push(s[j].trim());
	}

	delete att.categoryId;
	delete att.inFilters;
	delete att.filterType;
	delete att.filterLabel;
	delete att.inFilters;
	delete att.onPdp;
	delete att.vcMap;

	oqsAttributes.push(att);
}



var pullVCAttributeValues = async (categoryAttribute, vSku, colName) => {

	//	If no vendor sku, skip.
	if (!vSku) {
		return
	}


	//	TODO Special cases that'll be able to be removed later.
	if (categoryAttribute.attributeName === 'Assembly Required') {
		colName = 'assembly_reqd';
	}
	else if (categoryAttribute.attributeName === 'Style Tag 1') {
		colName = 'style_tag1';
	}
	else if (categoryAttribute.attributeName === 'Style Tag 2') {
		colName = 'style_tag2';
	}
	

	//	If in the attributes, find it by name regardless of position.
	if (colName.startsWith('attribute_name')) {
		colName = null;
		for (var i=1; i < 7; i++) {
			if ((vSku[`attribute_name${i}`] === categoryAttribute.attributeName) || (vSku[`attribute_name${i}`] === categoryAttribute.label)) {
				colName = `attribute_value${i}`;
				break;
			}
		}
	}

	if (vSku[colName]) {
		if (typeof vSku[colName] === 'number') {
			categoryAttribute.values.push(vSku[colName]);
		}
		else if (vSku[colName].length) {
			var s = _.split(vSku[colName], ',');
			for (var j = 0; j < s.length; j++) {
				categoryAttribute.values.push(s[j].trim());
			}
		}
	} else {
		// console.log("HOW DID I END UP HERE!?!");
	}

}



exports.invalidateCoinInCacheByCoin = async (coinId) => {

	var results = await globals.pool.query("DELETE FROM rush_products_cache WHERE coin_id = ?", [coinId]);
	return results;
}


exports.invalidateCoinInCacheByVariant = async (shopifyVariantId) => {

	var rows = await globals.poolRO.query("SELECT seller_product_id FROM products WHERE shopify_variant_id = ?", [shopifyVariantId]);

	if (rows.length > 0) {
		var coins = await globals.productROPool.query("SELECT coin_id FROM coins_to_vendor_skus WHERE vendor_sku = ?", [rows[0].seller_product_id]);

		if (coins.length > 0) {
			var results = await globals.pool.query("DELETE FROM rush_products_cache WHERE coin_id = ?", [coins[0].coin_id]);
			return results;
		}
	}
}



exports.storeCoinInCache = async (coinId, shopifyStoreId, variants) => {
	var expireMinutes = process.env.PRODUCT_CACHE_TTL_MINUTES ? process.env.PRODUCT_CACHE_TTL_MINUTES : 60;

	try {
		var sql = "INSERT INTO rush_products_cache (coin_id, date_expired, shopify_store_id, variants) VALUES (?,  DATE_ADD(now(), INTERVAL " + expireMinutes + " MINUTE), ?, ?)";

		// console.log(mysql.format(sql, [sellerProductId]));
		var results = await globals.pool.query(sql, [coinId, shopifyStoreId, JSON.stringify(variants)]);
	} catch (e) {
		if (e.code !== 'ER_DUP_ENTRY') {
			throw e;
		}
	}
}



exports.removeExpiredInCache = async () => {
	var sql = "DELETE FROM rush_products_cache WHERE date_expired <= NOW()";

	// console.log(mysql.format(sql, [sellerProductId]));
	var results = await globals.pool.query(sql);

	return results;
}




exports.getByProductId = async (productId) => {
	var sql = "SELECT p.*, m.vendor_id FROM products p LEFT JOIN manifests m ON p.manifest_id = m.manifest_id WHERE product_id = ?";

	var rows = await globals.pool.query(sql, [productId]);
	colUtils.outboundNaming(rows);
	rows[0].coinId = null;

	if (rows.length > 0) {
		var coin = await globals.productPool.query("SELECT coin_id FROM coins_to_vendor_skus " +
			"WHERE vendor_id = ? AND vendor_sku = ?", [rows[0].vendorId, rows[0].sellerProductId]);
		if (coin.length > 0) {
			rows[0].coinId = coin[0].coin_id;
		}
	}

	return rows;
}


exports.getProductQuantity = async (sellerProductId, stores) => {

	var sql = "SELECT COUNT(*) AS quantity FROM products p WHERE p.seller_product_id = ? AND p.status = 'Live' AND p.online_shopping = 'Y' AND p.store_id IN (?, ?)";

	// console.log(mysql.format(sql, _.concat([sellerProductId], stores)));
	var rows = await globals.poolRO.query(sql, _.concat([sellerProductId], stores));
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getEligibleQuantity = async (sellerProductId, destCityId) => {

	var sql = `SELECT vendor_sku, COUNT(*) AS quantity 
								FROM metro_sku_eligibility e 
									LEFT JOIN products p ON p.sku = e.sku
								WHERE vendor_sku = ? AND dest_city_id = ? AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'`;

	// console.log(mysql.format(sql, [sellerProductId, destCityId]));
	var rows = await globals.poolRO.query(sql, [sellerProductId, destCityId]);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getEligibleQuantityByVendorSkus = async (context, destCityId) => {

	var sql = `SELECT vendor_sku, COUNT(*) AS quantity 
								FROM metro_sku_eligibility e 
									LEFT JOIN products p ON p.sku = e.sku
							WHERE vendor_sku IN (${context.vendorSkuPlaceholders}) AND dest_city_id = ? AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE' GROUP BY vendor_sku`;

	context.vendorSkus.push(destCityId);
	console.log(mysql.format(sql, context.vendorSkus));
	var rows = await globals.poolRO.query(sql, context.vendorSkus);
	colUtils.outboundNaming(rows);

	return rows;
}




exports.getOnlineByVendorSku = async (sellerProductId) => {

	var sql = "SELECT count(*) as quantity FROM products p WHERE p.seller_product_id = ? AND p.status = 'Live' AND p.online_shopping = 'Y'";

	// console.log(mysql.format(sql, [sellerProductId]));
	var rows = await globals.poolRO.query(sql, [sellerProductId]);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getShopifyProductAndCityByVariant = async (shopifyVariantId) => {

	var sql = "SELECT p.store_id, s.shopify_store_id, t.city, ss.shop_name, shopify_product_id FROM products p " +
		"LEFT JOIN stores s ON s.store_id = p.store_id " +
		"LEFT JOIN targeted_cities t ON t.id = s.city_id " +
		"LEFT JOIN shopify_stores ss ON ss.id = s.shopify_store_id " +
		"WHERE shopify_variant_id = ?";

	// console.log(mysql.format(sql, [shopifyVariantId]));
	var rows = await globals.poolRO.query(sql, [shopifyVariantId]);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getShopifyProductAndCityByProduct = async (shopifyProductId) => {

	var sql = "SELECT p.store_id, s.shopify_store_id, t.city, ss.shop_name, shopify_product_id FROM products p " +
		"LEFT JOIN stores s ON s.store_id = p.store_id " +
		"LEFT JOIN targeted_cities t ON t.id = s.city_id " +
		"LEFT JOIN shopify_stores ss ON ss.id = s.shopify_store_id " +
		"WHERE shopify_product_id = ?";

	// console.log(mysql.format(sql, [shopifyVariantId]));
	var rows = await globals.poolRO.query(sql, [shopifyProductId]);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getProductCityAndCarrier = async (sku, destZip) => {

	var sql = "SELECT p.store_id AS product_store, p.ship_type as product_ship_type, p.seller_product_id, m.vendor_id, m.manifest_source, s.city_id AS product_city_id, " +
		"lccOrigin.targeted_city_id AS origin_city_id, lcOrigin.id AS origin_carrier_id, lcOrigin.name AS origin_carrier_name, " +
		"lccDest.targeted_city_id AS dest_city_id, lcDest.id AS dest_carrier_id, lcDest.name AS dest_carrier_name, z.city_id AS member_city_id, lczDest.zip AS dest_carrier_zip, lczDest.ship_type AS dest_carrier_ship_type " +
		"FROM products p " +
		"LEFT JOIN manifests m ON m.manifest_id = p.manifest_id " +
		"LEFT JOIN stores s ON s.store_id = p.store_id " +
		"LEFT JOIN local_carrier_to_city lccOrigin ON lccOrigin.targeted_city_id = s.city_id " +
		"LEFT JOIN local_carriers lcOrigin ON lcOrigin.id = lccOrigin.local_carrier_id " +

		"LEFT JOIN zip_to_city z ON z.zip = ?	" +

		"LEFT JOIN local_carrier_to_city lccDest ON lccDest.targeted_city_id = z.city_id " +
		"LEFT JOIN local_carriers lcDest ON lcDest.id = lccDest.local_carrier_id " +
		"LEFT JOIN local_carrier_zips lczDest ON ((lczDest.local_carrier_id = lcDest.id) AND (lczDest.zip = z.zip)) " +
		"WHERE sku = ? ";

	var rows = await globals.poolRO.query(sql, [destZip, sku]);
	colUtils.outboundNaming(rows);

	return rows;
}

exports.getLiveProductByVendorSku = async (vendorId, vendorSku) => {

	var sql = "SELECT STATUS, product_id, online_quick_sale " +
		"FROM products p LEFT JOIN manifests m ON m.manifest_id = p.manifest_id " +
		"WHERE STATUS = 'Live' AND m.vendor_id = ? AND p.seller_product_id = ? AND online_quick_sale != 'Y'";

	var rows = await globals.poolRO.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getLiveDistinctByVendorSku = async (vendorId, vendorSku) => {

	var sql = "SELECT p.seller_product_id, m.vendor_id  " +
		"FROM products p LEFT JOIN manifests m ON m.manifest_id = p.manifest_id " +
		"WHERE status = 'Live' AND online_shopping = 'Y' AND m.vendor_id = ? AND p.seller_product_id = ? " +
		"GROUP BY concat(p.seller_product_id, m.vendor_id) " +
		"ORDER BY seller_product_id";

	var rows = await globals.poolRO.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getLiveVendorSkuInAmbiguousCoin = async () => {

	var sql = `SELECT p.seller_product_id, m.vendor_id, COUNT(*) AS qty  
				FROM products p LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
				WHERE STATUS = 'Live' AND online_shopping = 'Y' 
					AND CONCAT(p.seller_product_id, '|', m.vendor_id) IN 
						(SELECT CONCAT(vendor_sku, '|', vendor_id)
						FROM coins_to_vskus 
						WHERE coin_id IN (SELECT coin_id FROM coins_to_vskus GROUP BY coin_id HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC)
						GROUP BY CONCAT(vendor_sku, '|', vendor_id))
				GROUP BY CONCAT(p.seller_product_id, m.vendor_id) 
				ORDER BY seller_product_id, m.vendor_id`;

	var rows = await globals.poolRO.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getLiveByCoin = async (coinId) => {
	var result = {
		total: 0
	}


	var stores = await globals.poolRO.query(`SELECT store_id FROM stores WHERE TYPE = 'PHYSICAL'`);

	for (var i = 0; i < stores.length; i++) {
		result[stores[i].store_id] = 0;
	}

	var sql = `SELECT p.store_id as id, COUNT(*) AS qty  
							FROM products p 
								LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
							WHERE STATUS = 'Live' AND online_shopping = 'Y' AND online_quick_sale = 'N'
									AND CONCAT(m.vendor_id, '|', p.seller_product_id) IN 
									(SELECT CONCAT(vendor_id, '|', vendor_sku)
											FROM coins_to_vskus 
											WHERE coin_id = ?
											GROUP BY CONCAT(vendor_id, '|', vendor_sku))
							GROUP BY p.store_id`;

	var rows = await globals.poolRO.query(sql, [coinId]);
	colUtils.outboundNaming(rows);

	for (var i = 0; i < rows.length; i++) {
		result.total += rows[i].qty;
		result[rows[i].id] = rows[i].qty;
	}
	return result;
}



exports.getByRushSku = async (sku) => {
	let sql = `SELECT p.*, ss.id AS shopify_store_id, ss.shop_name AS shopify_store_name 
    FROM products p 
    LEFT JOIN stores s ON p.store_id = s.store_id 
    LEFT JOIN shopify_stores ss ON s.shopify_store_id = ss.id 
    WHERE sku = ?`
	let values = [sku];
	let rows = await globals.poolRO.query(sql, values);
	colUtils.outboundNaming(rows);
	return rows;
}


exports.getLocalCourierCount = async (zip) => {
	var rows = await globals.poolRO.query("SELECT COUNT(DISTINCT(local_carrier_id)) AS num, ship_type FROM local_carrier_zips WHERE zip = ? GROUP BY ship_type", [zip]);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getAllEligible = async (cityId, categoryId, vskus) => {
	let sql = `SELECT distinct(p.sku) FROM products p 
		LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
		LEFT JOIN stores s ON s.store_id = p.store_id 
		LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
		LEFT JOIN categories c ON c.category_id = cm.category_id 
		WHERE ((status = 'Live' AND online_shopping = 'Y') OR (status = 'Received')) 
		AND s.active = 'Y' 
		AND s.shopify_store_id != 999 `;
	let values = [];

	if (cityId !== undefined) {
		sql += "AND s.city_id = ? ";
		values.push(cityId);
	}
	if (categoryId !== undefined) {
		if (categoryId === null) {
			sql += "AND c.category_id IS NULL ";
		} else {
			sql += "AND c.category_id = ? ";
		}
		values.push(categoryId);
	}

	if ((vskus !== undefined) && (vskus.length > 0)) {
		sql += "AND CONCAT(m.vendor_id, p.seller_product_id) IN ( ";
		for (var i = 0; i < vskus.length; i++) {
			if (i > 0) {
				sql += ', ';
			}
			sql += `'${vskus[i].vsku}'`
		}
		sql += ') ';
	}

	// var baked = mysql.format(sql, values);
	let rows = await globals.poolRO.query(sql, values);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getAllEligibleSmallParcel = async (cityId, categoryId, vskus) => {
	let sql = `SELECT distinct(p.sku) FROM products p 
		LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
		LEFT JOIN stores s ON s.store_id = p.store_id 
		LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
		LEFT JOIN categories c ON c.category_id = cm.category_id 
		WHERE ((status = 'Live' AND online_shopping = 'Y') OR (status = 'Received')) 
		AND s.active = 'Y' 
		AND ((p.ship_type = 'Small Parcel') OR (p.ship_type IS NULL))
		AND s.shopify_store_id != 999 `;
	let values = [];

	if (cityId !== undefined) {
		sql += "AND s.city_id = ? ";
		values.push(cityId);
	}
	if (categoryId !== undefined) {
		if (categoryId === null) {
			sql += "AND c.category_id IS NULL ";
		} else {
			sql += "AND c.category_id = ? ";
		}
		values.push(categoryId);
	}

	if ((vskus !== undefined) && (vskus.length > 0)) {
		sql += "AND CONCAT(m.vendor_id, p.seller_product_id) IN ( ";
		for (var i = 0; i < vskus.length; i++) {
			if (i > 0) {
				sql += ', ';
			}
			sql += `'${vskus[i].vsku}'`
		}
		sql += ') ';
	}

	// var baked = mysql.format(sql, values);
	let rows = await globals.poolRO.query(sql, values);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getAllEligibleLTL = async (cityId, categoryId, vskus) => {
	let sql = `SELECT distinct(p.sku) FROM products p 
		LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
		LEFT JOIN stores s ON s.store_id = p.store_id 
		LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
		LEFT JOIN categories c ON c.category_id = cm.category_id 
		WHERE ((status = 'Live' AND online_shopping = 'Y') OR (status = 'Received')) 
		AND s.active = 'Y' 
		AND p.ship_type = 'LTL'
		AND s.shopify_store_id != 999 `;
	let values = [];

	if (cityId !== undefined) {
		sql += "AND s.city_id = ? ";
		values.push(cityId);
	}
	if (categoryId !== undefined) {
		if (categoryId === null) {
			sql += "AND c.category_id IS NULL ";
		} else {
			sql += "AND c.category_id = ? ";
		}
		values.push(categoryId);
	}

	if ((vskus !== undefined) && (vskus.length > 0)) {
		sql += "AND CONCAT(m.vendor_id, p.seller_product_id) IN ( ";
		for (var i = 0; i < vskus.length; i++) {
			if (i > 0) {
				sql += ', ';
			}
			sql += `'${vskus[i].vsku}'`
		}
		sql += ') ';
	}

	// var baked = mysql.format(sql, values);
	let rows = await globals.poolRO.query(sql, values);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getLiveByVendorSku = async (vendorId, vendorSku, dropShipOnlyFlag) => {
	let sql = "SELECT p.sku FROM products p " +
		"LEFT JOIN stores s ON s.store_id = p.store_id " +
		"LEFT JOIN manifests m ON m.manifest_id = p.manifest_id " +
		"WHERE status = 'Live' AND online_shopping = 'Y' " +
		"AND m.vendor_id = ? " +
		"AND p.seller_product_id = ? " +
		"AND s.active = 'Y' " +
		"AND s.shopify_store_id != 999 ";

	if (dropShipOnlyFlag) {
		sql += "AND m.manifest_source = 'DS' ";
	}

	let rows = await globals.poolRO.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rows);
	return rows;
}


exports.getLiveOrReceivedByVendorSku = async (vendorId, vendorSku, dropShipOnlyFlag) => {
	let sql = `SELECT p.sku FROM products p 
								LEFT JOIN stores s ON s.store_id = p.store_id 
								LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
							WHERE ((status = 'Live' AND online_shopping = 'Y') OR (status = 'Received')) 
								AND m.vendor_id = ? 
								AND p.seller_product_id = ? 
								AND s.active = 'Y' 
								AND s.shopify_store_id != 999`;

	if (dropShipOnlyFlag) {
		sql += "AND m.manifest_source = 'DS' ";
	}

	let rows = await globals.poolRO.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.clearBoxLocation = async (skus) => {
	let list = "";
	for (var i = 0; i < skus.length; i++) {
		if (list.length > 0) {
			list += ", ";
		}

		list += skus[i];
	}
	let sql = "UPDATE products SET box_location_number = NULL WHERE sku IN (" + list + ")";
	// console.log("Box loc: " + sql);

	let results = await globals.pool.query(sql);
	return results;
}



exports.checkLiveSold = async (vendorSku) => {
	let sql = "SELECT status, COUNT(*) as num FROM products WHERE seller_product_id = ? AND status IN ('Live', 'Sold') GROUP BY status";

	let results = await globals.pool.query(sql, vendorSku);
	return results;
}


exports.checkOrange = async (vendorSku) => {
	let sql = "SELECT COUNT(*) as num FROM products WHERE seller_product_id = ? AND pricing_type_id IN (SELECT pricing_type_id FROM product_pricing_types WHERE pricing_type = 'Orange')";

	let results = await globals.pool.query(sql, vendorSku);
	return results;
}


exports.checkPrevious = async (vendorSku) => {
	let sql = "SELECT COUNT(*) as num FROM staging_product WHERE seller_product_id = ?";

	let results = await globals.pool.query(sql, vendorSku);
	return results;
}



exports.getByCoinOriginal = async (coinId, member) => {

	var byCoinFlag = false;
	var noIndexFlag = false;
	var prom = [];
	var values = [];
	var whereClause = '';
	// console.log(new moment() + " a ");
	//	coinId will either be a true COIN or it'll be a sku in the case of a quick sale.
	prom.push(globals.productROPool.query(
		`SELECT v.name as vendor_name, v.rush_market_availability, p.product_name, p.vendor_id, p.vendor_sku, p.pull_data_forward_flag, p.ship_type, p.msrp,  
				p.main_image_knockout as image1, p.main_image_lifestyle as image2, p.alt_image3 as image3, p.alt_image4 as image4, p.alt_image5 as image5, 
				p.product_width, p.product_depth, p.product_height, p.primary_material, p.secondary_material, p.primary_color, 
				p.bullet_point1, p.bullet_point2, p.bullet_point3, p.bullet_point4, p.style_tag1, p.product_description, p.product_size as size
			FROM vendor_catalog_products p 
				LEFT JOIN coins_to_vendor_skus c ON ((c.vendor_id = p.vendor_id) AND (c.vendor_sku = p.vendor_sku)) 
				LEFT JOIN vendors v ON p.vendor_id = v.id
			WHERE c.coin_id = ? `, [coinId.toString()]));
	prom.push(globals.poolRO.query("SELECT m.vendor_id, product_id, seller_product_id, online_quick_sale FROM products p LEFT JOIN manifests m ON m.manifest_id = p.manifest_id WHERE p.sku = ?", [coinId]));

	var results = await Promise.all(prom);
	// console.log(new moment() + " b ");
	var coinRows = results[0];
	var skuRows = results[1];

	prom = [];

	if (skuRows.length > 0) {
		results = await globals.productROPool.query("SELECT ship_type FROM vendor_catalog_products WHERE vendor_id = ? AND vendor_sku = ?", [skuRows[0].vendor_id, skuRows[0].seller_product_id])
	}

	if (coinRows.length > 0) {
		byCoinFlag = true;

		var vSkuClause = '';

		// console.log(new moment() + " c ");

		//	Build vendor sku clause AND also look for a vendor in this COIN who doesn't want availability to go beyond local.
		for (var i = 0; i < coinRows.length; i++) {
			if (vSkuClause.length > 0) {
				vSkuClause += " OR ";
			}
			vSkuClause += "(m.vendor_id = ? AND seller_product_id = ?)"
			values.push(coinRows[i].vendor_id);
			values.push(coinRows[i].vendor_sku);

			if (coinRows[i].rush_market_availability === 'LOCAL') {
				noIndexFlag = true;
			}
		}

		// console.log(new moment() + " d ");

		whereClause = "WHERE (((status = 'Live')) OR (status != 'Live')) AND ( " + vSkuClause + " ) " +
			" AND s.store_id IN (SELECT store_id FROM stores s " +
			//	Don't see why this join was in there and only seems to be slowing query down.			"LEFT JOIN members m ON m.home_shopify_store_id = s.shopify_store_id " +
			"WHERE s.shopify_store_id = ?) " +
			" AND p.online_quick_sale = 'N' ";
		values.push(member.homeShopifyStoreId);
	} else if (skuRows.length > 0) {
		whereClause = "WHERE (((status = 'Live')) OR (status != 'Live')) AND p.product_id = ? " +
			" AND s.store_id IN (SELECT store_id FROM stores s " +
			//	Don't see why this join was in there and only seems to be slowing query down.			"LEFT JOIN members m ON m.home_shopify_store_id = s.shopify_store_id " +
			"WHERE s.shopify_store_id = ?) ";
		values.push(skuRows[0].product_id);
		values.push(member.homeShopifyStoreId);
	}

	var rows = [];
	if (whereClause.length > 0) {

		// console.log(mysql.format(`SELECT c.front_end_space, c.front_end_name, LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) AS category_slug, 
		// 	t.id as variant_city_id, t.city as variant_city, t.city_slug as variant_city_slug, s.zip as variant_zip, 
		// 	s.member_display_name, s.address as store_address, s.city as store_city, s.state as store_state, s.zip as store_zip,
		// 	m.manifest_source, m.vendor_id, a.default_location as virtual_location, p.ship_type as corelink_ship_type, p.*, 
		// 	qs.dimensions, qs.material, qs.color, qs.bullets, qs.size, qs.weight as qs_weight, ppt.pricing_type,
		// 	dtop.damage_severity as damage_severity_top, dbot.damage_severity as damage_severity_bottom, dint.damage_severity as damage_severity_interior, 
		// 	hd.missing_hardware_severity, bi.in_box, pp.promo_id, pm.id as promotion_id, COALESCE(eligibility_override, eligibility) as eligibility, national_ship_cost, local_ship_cost, als.state as ripple
		// 	FROM products p 
		// 	LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
		// 	LEFT JOIN categories c ON c.category_id = cm.category_id 
		// 	LEFT JOIN manifests m ON p.manifest_id = m.manifest_id 
		// 	LEFT JOIN stores s ON p.store_id = s.store_id 
		// 	LEFT JOIN targeted_cities t ON s.city_id = t.id 
		// 	LEFT JOIN storage_areas a ON ((a.store_id = p.store_id) AND (a.storage_area = 999)) 
		// 	LEFT JOIN product_quick_sales qs ON p.sku = qs.sku 
		// 	LEFT JOIN product_pricing_types ppt ON ppt.pricing_type_id = p.pricing_type_id 
		// 	LEFT JOIN product_damage_pricing_rules dtop ON p.damage_top = dtop.product_damage_pricing_rules_id 
		// 	LEFT JOIN product_damage_pricing_rules dbot ON p.damage_bottom = dbot.product_damage_pricing_rules_id 
		// 	LEFT JOIN product_damage_pricing_rules dint ON p.damage_interior = dint.product_damage_pricing_rules_id 
		// 	LEFT JOIN product_missing_hardware_rules hd ON p.missing_hardware = hd.product_missing_hardware_rules_id 
		// 	LEFT JOIN product_build_inspects bi ON bi.sku = p.sku 
		// 	LEFT JOIN promotion_products pp ON pp.sku = p.sku 
		// 	LEFT JOIN promotions pm ON ((start_date <= NOW()) AND (end_date > NOW()) AND (pm.id = pp.promo_id)) 
		// 	LEFT JOIN metro_sku_eligibility e ON ((e.sku = p.sku) AND (e.dest_city_id = ${member.homeCityId}))
		// 	LEFT JOIN gde_sku_algo_state als ON p.sku = als.sku 
		// 	${whereClause} 
		// 	ORDER BY FIELD(condition_name, 'Like New', '', 'New', 'Damaged', 'Good', 'Fair', 'Trash'), FIELD(online_shopping, 'Y', 'N'), price ASC, 
		// 					FIELD(e.eligibility, 'SHIPPABLE', 'LOCAL_ONLY', 'BOPIS_ONLY', 'NOT_ELIGIBLE', null), e.national_ship_cost, p.store_id, 
		// 					SUBSTRING(p.location_number, 1, 3) DESC, m.manifest_source, FIELD(product_display, 'Original Packaging', 'In Market', '', null)`, values));

		// console.log(new moment() + " e ");

		rows = await globals.poolRO.query(`SELECT c.front_end_space, c.front_end_name, LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) AS category_slug, 
			t.id as variant_city_id, t.city as variant_city, t.city_slug as variant_city_slug, s.zip as variant_zip, 
			s.member_display_name, s.address as store_address, s.city as store_city, s.state as store_state, s.zip as store_zip,
			m.manifest_source, m.vendor_id, a.default_location as virtual_location, p.ship_type as corelink_ship_type, p.*, 
			qs.dimensions, qs.material, qs.color, qs.bullets, qs.size, qs.weight as qs_weight, ppt.pricing_type,
			dtop.damage_severity as damage_severity_top, dtop.damage_visibility as damage_visibility_top,
			dbot.damage_severity as damage_severity_bottom, dbot.damage_visibility as damage_visibility_bottom,
			dint.damage_severity as damage_severity_interior, dint.damage_severity as damage_visibility_interior,
			hd.missing_hardware_severity, bi.in_box, pp.promo_id, pm.id as promotion_id, COALESCE(eligibility_override, eligibility) as effective_eligibility, national_ship_cost, local_ship_cost, als.state as ripple
			FROM products p 
			LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
			LEFT JOIN categories c ON c.category_id = cm.category_id 
			LEFT JOIN manifests m ON p.manifest_id = m.manifest_id 
			LEFT JOIN stores s ON p.store_id = s.store_id 
			LEFT JOIN targeted_cities t ON s.city_id = t.id 
			LEFT JOIN storage_areas a ON ((a.store_id = p.store_id) AND (a.storage_area = 999)) 
			LEFT JOIN product_quick_sales qs ON p.sku = qs.sku 
			LEFT JOIN product_pricing_types ppt ON ppt.pricing_type_id = p.pricing_type_id 
			LEFT JOIN product_damage_pricing_rules dtop ON p.damage_top = dtop.product_damage_pricing_rules_id 
			LEFT JOIN product_damage_pricing_rules dbot ON p.damage_bottom = dbot.product_damage_pricing_rules_id 
			LEFT JOIN product_damage_pricing_rules dint ON p.damage_interior = dint.product_damage_pricing_rules_id 
			LEFT JOIN product_missing_hardware_rules hd ON p.missing_hardware = hd.product_missing_hardware_rules_id 
			LEFT JOIN product_build_inspects bi ON bi.sku = p.sku 
			LEFT JOIN promotion_products pp ON pp.sku = p.sku 
			LEFT JOIN promotions pm ON ((start_date <= NOW()) AND (end_date > NOW()) AND (pm.id = pp.promo_id)) 
			LEFT JOIN metro_sku_eligibility e ON ((e.sku = p.sku) AND (e.dest_city_id = ${member.homeCityId}))
			LEFT JOIN gde_sku_algo_state als ON p.sku = als.sku 
			${whereClause} 
			ORDER BY FIELD(condition_name, 'Like New', '', 'New', 'Damaged', 'Good', 'Fair', 'Trash'), FIELD(online_shopping, 'Y', 'N'), price ASC, 
							FIELD(effective_eligibility, 'SHIPPABLE', 'LOCAL_ONLY', 'BOPIS_ONLY', 'NOT_ELIGIBLE', null), e.national_ship_cost, p.store_id, 
							SUBSTRING(p.location_number, 1, 3) DESC, m.manifest_source, FIELD(product_display, 'Original Packaging', 'In Market', '', null)`, values);


		// console.log(new moment() + " f ");

		if (rows.length > 0) {

			colUtils.outboundNaming(rows);

			for (var i = 0; i < rows.length; i++) {

				if (rows[i].promotionId === null) {
					rows[i].promoId = null;
				}

				rows[i].productDescription = null;
				rows[i].productWidth = null;
				rows[i].productDepth = null;
				rows[i].productHeight = null;
				rows[i].primaryMaterial = null;
				rows[i].secondaryMaterial = null;
				rows[i].primaryColor = null;
				rows[i].bulletPoints = [];

				rows[i].marketInfo = {};
				rows[i].marketInfo.memberDisplayName = rows[i].memberDisplayName;
				rows[i].marketInfo.storeAddress = rows[i].storeAddress;
				rows[i].marketInfo.storeCity = rows[i].storeCity;
				rows[i].marketInfo.storeState = rows[i].storeState;
				rows[i].marketInfo.storeZip = rows[i].storeZip;
				rows[i].marketInfo.virtualLocation = rows[i].virtualLocation;
				rows[i].marketInfo.partnerFacility = rows[i].partnerFacility;
				rows[i].marketInfo.timeZone = rows[i].timeZone;
				rows[i].marketInfo.instorePickupAvailable = rows[i].instorePickupAvailable;


				var marketDamageImages = [];
				if (((rows[i].conditionName === 'Like New') || (rows[i].conditionName === 'Damaged') || (rows[i].conditionName === 'Good') || (rows[i].conditionName === 'Fair')) &&
					(rows[i].status !== 'Inactive') && (rows[i].status !== 'Sold')) {
					marketDamageImages = await globals.poolRO.query("SELECT tag, url FROM files WHERE sku = ? AND (tag IN ('damage', 'market')) ", rows[i].sku);
				}

				rows[i].images = [];
				rows[i].damageImages = [];

				rows[i].showRoomFlag = ((rows[i].locationNumber !== null) && (rows[i].locationNumber.startsWith("207"))) ? true : false;


				// console.log(new moment() + " g ");


				//	Normal COIN
				if (coinRows.length > 0) {

					var pullForwardIndex = getPullForwardSku(coinRows);

					rows[i].pullForwardVendorSku = {
						vendorId: coinRows[pullForwardIndex].vendor_id,
						vendorSku: coinRows[pullForwardIndex].vendor_sku
					}

					rows[i].assemblyInstructions = [];
					rows[i].totalLikes = 0;
					// Only grab assembly instructions if this is the first variant.
					// Only grab likes by coin if this is the first variant.
					if (i === 0) {
						prom.push(globals.poolRO.query("SELECT tag, url FROM files WHERE vendor_id = ? AND vendor_sku = ? AND (tag IN ('assembly instructions')) ", [coinRows[pullForwardIndex].vendor_id, coinRows[pullForwardIndex].vendor_sku]));
						prom.push(Members.countFindsByCoin(coinId));

						var miscInfo = await Promise.all(prom);

						var assemblyInstructions = miscInfo[0];
						for (var j = 0; j < assemblyInstructions.length; j++) {
							rows[i].assemblyInstructions.push(assemblyInstructions[j].url);
						}


						var findsCount = miscInfo[1];
						if (findsCount.length > 0) {
							rows[i].totalLikes = findsCount[0].num;
						}
					}



					rows[i].coinId = coinId;
					rows[i].noIndexFlag = noIndexFlag;
					rows[i].vendorName = coinRows[0].vendor_name;

					rows[i].name = ((coinRows[pullForwardIndex].product_name !== undefined) && (coinRows[pullForwardIndex].product_name !== null)) ? coinRows[pullForwardIndex].product_name : rows[i].name;
					rows[i].shipType = (rows[i].corelinkShipType !== null) ? rows[i].corelinkShipType : coinRows[pullForwardIndex].ship_type;

					if ((coinRows[pullForwardIndex].msrp !== undefined) && (coinRows[pullForwardIndex].msrp !== null)) {
						rows[i].msrp = coinRows[pullForwardIndex].msrp;
					}

					rows[i].size = coinRows[0].size;
					rows[i].productDimensions = '';
					if ((coinRows[pullForwardIndex].product_width !== undefined) && (coinRows[pullForwardIndex].product_width !== null)) {
						rows[i].productDimensions = coinRows[pullForwardIndex].product_width + '" W';
					}

					if ((coinRows[pullForwardIndex].product_depth !== undefined) && (coinRows[pullForwardIndex].product_depth !== null)) {
						if (rows[i].productDimensions.length > 0) {
							rows[i].productDimensions += ' x ';
						}
						rows[i].productDimensions += coinRows[pullForwardIndex].product_depth + '" D';
					}

					if ((coinRows[pullForwardIndex].product_height !== undefined) && (coinRows[pullForwardIndex].product_height !== null)) {
						if (rows[i].productDimensions.length > 0) {
							rows[i].productDimensions += ' x ';
						}
						rows[i].productDimensions += coinRows[pullForwardIndex].product_height + '" H';
					}

					if ((coinRows[pullForwardIndex].primary_material !== undefined) && (coinRows[pullForwardIndex].primary_material !== null) && (coinRows[pullForwardIndex].primary_material.length > 0)) {
						rows[i].primaryMaterial = coinRows[pullForwardIndex].primary_material;
					}
					if ((coinRows[pullForwardIndex].secondary_material !== undefined) && (coinRows[pullForwardIndex].secondary_material !== null) && (coinRows[pullForwardIndex].secondary_material.length > 0)) {
						rows[i].secondaryMaterial = coinRows[pullForwardIndex].secondary_material;
					}
					if ((coinRows[pullForwardIndex].style_tag1 !== undefined) && (coinRows[pullForwardIndex].style_tag1 !== null) && (coinRows[pullForwardIndex].style_tag1.length > 0)) {
						rows[i].styleTag1 = coinRows[pullForwardIndex].style_tag1;
					}
					if ((coinRows[pullForwardIndex].primary_color !== undefined) && (coinRows[pullForwardIndex].primary_color !== null) && (coinRows[pullForwardIndex].primary_color.length > 0)) {
						rows[i].primaryColor = coinRows[pullForwardIndex].primary_color;
					}
					if ((coinRows[pullForwardIndex].bullet_point1 !== undefined) && (coinRows[pullForwardIndex].bullet_point1 !== null) && (coinRows[pullForwardIndex].bullet_point1.length > 0)) {
						rows[i].bulletPoints.push(coinRows[pullForwardIndex].bullet_point1);
					}
					if ((coinRows[pullForwardIndex].bullet_point2 !== undefined) && (coinRows[pullForwardIndex].bullet_point2 !== null) && (coinRows[pullForwardIndex].bullet_point2.length > 0)) {
						rows[i].bulletPoints.push(coinRows[pullForwardIndex].bullet_point2);
					}
					if ((coinRows[pullForwardIndex].bullet_point3 !== undefined) && (coinRows[pullForwardIndex].bullet_point3 !== null) && (coinRows[pullForwardIndex].bullet_point3.length > 0)) {
						rows[i].bulletPoints.push(coinRows[pullForwardIndex].bullet_point3);
					}
					if ((coinRows[pullForwardIndex].bullet_point4 !== undefined) && (coinRows[pullForwardIndex].bullet_point4 !== null) && (coinRows[pullForwardIndex].bullet_point4.length > 0)) {
						rows[i].bulletPoints.push(coinRows[pullForwardIndex].bullet_point4);
					}
					if ((coinRows[pullForwardIndex].product_description !== undefined) && (coinRows[pullForwardIndex].product_description !== null) && (coinRows[pullForwardIndex].product_description.length > 0)) {
						rows[i].productDescription = coinRows[pullForwardIndex].product_description;
					}
					if ((coinRows[pullForwardIndex].image1 !== undefined) && (coinRows[pullForwardIndex].image1 !== null) && (coinRows[pullForwardIndex].image1.length > 0)) {
						rows[i].images.push(coinRows[pullForwardIndex].image1);
					}
					if ((coinRows[pullForwardIndex].image2 !== undefined) && (coinRows[pullForwardIndex].image2 !== null) && (coinRows[pullForwardIndex].image2.length > 0)) {
						rows[i].images.push(coinRows[pullForwardIndex].image2);
					}
					if ((coinRows[pullForwardIndex].image3 !== undefined) && (coinRows[pullForwardIndex].image3 !== null) && (coinRows[pullForwardIndex].image3.length > 0)) {
						rows[i].images.push(coinRows[pullForwardIndex].image3);
					}
					if ((coinRows[pullForwardIndex].image4 !== undefined) && (coinRows[pullForwardIndex].image4 !== null) && (coinRows[pullForwardIndex].image4.length > 0)) {
						rows[i].images.push(coinRows[pullForwardIndex].image4);
					}
					if ((coinRows[pullForwardIndex].image5 !== undefined) && (coinRows[pullForwardIndex].image5 !== null) && (coinRows[pullForwardIndex].image5.length > 0)) {
						rows[i].images.push(coinRows[pullForwardIndex].image5);
					}
				}
				//	Quick Sale
				else {

					var coin = await globals.productROPool.query("SELECT coin_id FROM coins_to_vendor_skus WHERE vendor_id = ? AND vendor_sku = ?", [skuRows[0].vendor_id, skuRows[0].seller_product_id]);

					var assemblyInstructions = await globals.poolRO.query("SELECT tag, url FROM files WHERE vendor_id = ? AND vendor_sku = ? AND (tag IN ('assembly instructions')) ", [skuRows[0].vendor_id, skuRows[0].seller_product_id]);
					rows[i].assemblyInstructions = [];
					for (var j = 0; j < assemblyInstructions.length; j++) {
						rows[i].assemblyInstructions.push(assemblyInstructions[j].url);
					}


					if (coin.length > 0) {
						rows[i].coinId = coin[0].coin_id;
					} else {
						rows[i].coinId = null;
					}

					if (rows[i].corelinkShipType !== null) {
						rows[i].shipType = rows[i].corelinkShipType;
					} else if ((results !== undefined) && (results.length > 0)) {
						rows[i].shipType = results[0].ship_type;
					} else {
						rows[i].shipType = null;
					}


					rows[i].images.push(rows[i].image);
					if ((rows[i].dimensions !== undefined) && (rows[i].dimensions !== null) && (rows[i].dimensions.length > 0)) {
						rows[i].productDimensions = rows[i].dimensions;
					} else rows[i].productDimensions = null;
					if ((rows[i].material !== undefined) && (rows[i].material !== null) && (rows[i].material.length > 0)) {
						rows[i].primaryMaterial = rows[i].material;
					} else {
						rows[i].primaryMaterial = null;
					}
					rows[i].secondaryMaterial = null;
					if ((rows[i].color !== undefined) && (rows[i].color !== null) && (rows[i].color.length > 0)) {
						rows[i].primaryColor = rows[i].color;
					} else {
						rows[i].primaryColor = null;
					}
					if ((rows[i].size !== undefined) && (rows[i].size !== null) && (rows[i].size.length > 0)) {
						rows[i].size = rows[i].size;
					} else {
						rows[i].size = null;
					}
					if ((rows[i].bullets !== undefined) && (rows[i].bullets !== null) && (rows[i].bullets.length > 0)) {
						var s = _.split(rows[i].bullets, '|');
						for (var j = 0; j < s.length; j++) {
							rows[i].bulletPoints.push(s[j]);
						}
					}
					if ((rows[i].qsWeight !== undefined) && (rows[i].qsWeight !== null)) {
						rows[i].weight = rows[i].qsWeight;
						rows[i].qsWeight = undefined;
					}

				}

				// console.log(new moment() + " h ");

				for (var j = 0; j < marketDamageImages.length; j++) {
					if (marketDamageImages[j].tag === 'market') {
						rows[i].images.push(marketDamageImages[j].url)
					} else {
						rows[i].damageImages.push(marketDamageImages[j].url);
					}
				}

				delete rows[i].dimensions;
				delete rows[i].material;
				delete rows[i].color;
				delete rows[i].bullets;
				delete rows[i].storeName;
				delete rows[i].storeAddress;
				delete rows[i].storeCity;
				delete rows[i].storeState;
				delete rows[i].storeZip;
				delete rows[i].virtualLocation;
				delete rows[i].image;

				// console.log(new moment() + " i ");

			}
		}
	}

	return rows;
}


exports.getEligibileByCoin = async (destCityId, coinList, placeholders) => {
	let sql = `SELECT v.coin_id AS id, COUNT(e.sku) AS eligible_skus
								FROM metro_sku_eligibility e
									LEFT JOIN products p ON p.sku = e.sku
									LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
									LEFT JOIN coins_to_vskus v ON ((v.vendor_id = m.vendor_id) AND (v.vendor_sku = p.seller_product_id))
								WHERE v.coin_id IN (${placeholders})
									AND dest_city_id = ${destCityId}
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
								GROUP BY id
							UNION
							SELECT sku AS id, COUNT(e.sku) AS eligible_skus
								FROM metro_sku_eligibility e
								WHERE sku IN (${placeholders})
									AND dest_city_id = ${destCityId}
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'	
								GROUP BY id	`;

	let rows = await globals.pool.query(sql, coinList);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getHeldByCoin = async (destCityId, coinList, placeholders) => {
	let sql = `SELECT coin_id as id, COUNT(h.product_id) AS held 
								FROM metro_sku_eligibility e
									LEFT JOIN products p ON p.sku = e.sku
									LEFT JOIN product_holds h ON h.product_id = p.shopify_variant_id
								WHERE coin_id IN (${placeholders})
										AND dest_city_id = ${destCityId}
										AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
										AND h.status IN ('ACTIVE', 'INCHECKOUT') AND h.expire_time > NOW()
								GROUP BY coin_id
							UNION
							SELECT e.sku as id, COUNT(h.product_id) AS held 
								FROM metro_sku_eligibility e
									LEFT JOIN products p ON p.sku = e.sku
									LEFT JOIN product_holds h ON h.product_id = p.shopify_variant_id
								WHERE e.sku IN (${placeholders})
										AND dest_city_id = ${destCityId}
										AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
										AND h.status IN ('ACTIVE', 'INCHECKOUT') AND h.expire_time > NOW()
								GROUP BY coin_id`;

	// console.log(mysql.format(sql, coinList));
	let rows = await globals.pool.query(sql, coinList);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.orderRushSkus = async (cityId, skus) => {
	if (skus.length === 0) {
		return [];
	}

	var placeholders = "";

	for (var i = 0; i < skus.length; i++) {
		if (placeholders.length > 0) {
			placeholders += ", ";
		}
		placeholders += "?";
	}

	skus.unshift(cityId);

	var sql = `SELECT p.sku, c.front_end_space, c.front_end_name, LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) AS category_slug, 
								t.id AS variant_city_id, t.city AS variant_city, t.city_slug AS variant_city_slug, s.zip AS variant_zip, 
								s.member_display_name, s.address AS store_address, s.city AS store_city, s.state AS store_state, s.zip AS store_zip,
								m.manifest_source, m.vendor_id, a.default_location AS virtual_location, p.ship_type AS corelink_ship_type, p.*, 
								qs.dimensions, qs.material, qs.color, qs.bullets, qs.size, qs.weight AS qs_weight, ppt.pricing_type,
								bi.in_box, pp.promo_id, pm.id AS promotion_id, COALESCE(eligibility_override, eligibility) AS effective_eligibility, national_ship_cost, local_ship_cost, als.state AS ripple
							FROM products p 
								LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
								LEFT JOIN categories c ON c.category_id = cm.category_id 
								LEFT JOIN manifests m ON p.manifest_id = m.manifest_id 
								LEFT JOIN stores s ON p.store_id = s.store_id 
								LEFT JOIN targeted_cities t ON s.city_id = t.id 
								LEFT JOIN storage_areas a ON ((a.store_id = p.store_id) AND (a.storage_area = 999)) 
								LEFT JOIN product_quick_sales qs ON p.sku = qs.sku 
								LEFT JOIN product_pricing_types ppt ON ppt.pricing_type_id = p.pricing_type_id 
								LEFT JOIN product_build_inspects bi ON bi.sku = p.sku 
								LEFT JOIN promotion_products pp ON pp.sku = p.sku 
								LEFT JOIN promotions pm ON ((start_date <= NOW()) AND (end_date > NOW()) AND (pm.id = pp.promo_id)) 
								LEFT JOIN metro_sku_eligibility e ON ((e.sku = p.sku) AND (e.dest_city_id = ?))
								LEFT JOIN gde_sku_algo_state als ON p.sku = als.sku 
							WHERE p.sku IN (${placeholders})
								AND s.store_id IN (SELECT store_id FROM stores s
									WHERE s.shopify_store_id = 1) 
								AND p.online_quick_sale = 'N' 
							ORDER BY FIELD(condition_name, 'Like New', '', 'New', 'Damaged', 'Good', 'Fair', 'Trash'), FIELD(online_shopping, 'Y', 'N'), p.price ASC, 
								FIELD(effective_eligibility, 'SHIPPABLE', 'LOCAL_ONLY', 'BOPIS_ONLY', 'NOT_ELIGIBLE', NULL), e.national_ship_cost, p.store_id, 
								SUBSTRING(p.location_number, 1, 3) DESC, m.manifest_source, FIELD(product_display, 'Original Packaging', 'In Market', '', NULL) 
							LIMIT 0,20`;

	// console.log(mysql.format(sql, skus))
	var rows = await globals.pool.query(sql, skus);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getSku = async (sku) => {
	var sql = `SELECT m.vendor_id, p.*
							FROM products p 
								LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
							WHERE p.sku = ? `;

	// console.log(mysql.format(sql, skus))
	var rows = await globals.pool.query(sql, sku);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getDropshipByVendorSku = async (vendorId, vendorSku) => {
	var sql = `SELECT p.sku, p.cost, p.dropship_type, m.vendor_id, p.seller_product_id 
								FROM products p
									LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
								WHERE dropship_type IN ('UNLIMITED','LIMITED')
									AND status IN ('Live')
									AND m.vendor_id = ?
									AND p.seller_product_id = ?`

	var rows = await globals.pool.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.updateSkuCost = async (sku, cost) => {
	var sql = `UPDATE products p SET date_modified = NOW(), cost = ? WHERE sku = ?`;

	var result = await globals.pool.query(sql, [cost, sku]);

	return result;
}



exports.getRBRSkuCostByVendorSku = async (vendorId, vendorSku) => {
	var sql = `SELECT sku, condition_name FROM products p LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
										WHERE status IN ('Live')
											AND m.manifest_source = 'RBR'
											AND m.vendor_id = ? 
											AND p.seller_product_id = ?`;

	var rows = await globals.pool.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rows);

	return rows;
}

exports.updateRBRSkuCostByVendorSku = async (vendorId, vendorSku, cost) => {
	var sql = `UPDATE products p SET date_modified = NOW(), cost = ? WHERE sku IN 
								(
									SELECT sku FROM products p LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
										WHERE status IN ('Live')
											AND m.vendor_id = ? 
											AND p.seller_product_id = ? 
								)`;
	var result = await globals.pool.query(sql, [cost, vendorId, vendorSku]);

	return result;
}


exports.getStagingProductByManifest = async (manifestId, vendorSku) => {
	var sql = `SELECT * 
								FROM staging_product 
								WHERE manifest_id = ?
									AND seller_product_id = ?`

	var rows = await globals.pool.query(sql, [manifestId, vendorSku]);
	colUtils.outboundNaming(rows);

	return rows;
}


