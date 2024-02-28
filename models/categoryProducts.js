'use strict';

const globals = require('../globals');
const _ = require('lodash');
const {
	promisify
} = require('util');
const sleep = promisify(setTimeout);

const colUtils = require('../utils/columnUtils');
const configUtils = require('../utils/configUtils');



exports.getCategoryProducts = async (categorySlug, memberId, clWhereInfo, vcWhereInfo, sortBy, offset, limit, color, material, size) => {
	var prom = [];
	var resp = {
		totalCount: 0,
		attributeValues: null,
		products: []
	};

	if (clWhereInfo.clause === "") {
		clWhereInfo.clause = "WHERE 1 = 1 ";
	}


	var homeCityId = await globals.poolRO.query("SELECT home_city_id FROM members WHERE id = ?", [memberId]);


	// console.log("Model color: " + color + " material: " + material + " size: " + size);

	//	Get core product info in correct sorted order.
	var sql = "SELECT " +
		"p.name, " +
		"p.freshness_score, " +
		"p.date_online, " +
		"p.category_1, " +
		"p.category_2, " +
		"p.condition_name, " +
		"UPPER(p.seller_product_id) as vendor_sku, " +
		"p.manufacturer, " +
		"p.msrp, " +
		"p.price, " +
		"p.market_price, " +
		"p.pricing_type_id, " +
		"pt.pricing_type, " +
		"p.image, " +
		"p.sku, " +
		"p.shopify_variant_id, " +
		"p.online_quick_sale, " +
		"p.status, ";

	if (configUtils.get("GDE_TOGGLE") === "ON") {
		sql += "COALESCE(eligibility_override, eligibility) AS eligibility, ";
	}

	sql += "m.vendor_id, " +
		"q.color, " +
		"q.size, " +
		"q.material, " +
		"q.dimensions, " +
		"q.bullets, " +
		"pm.id as promo_id " +
		"FROM products p " +
		"LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) " +
		"LEFT JOIN categories c ON c.category_id = cm.category_id " +
		"LEFT JOIN manifests m ON m.manifest_id = p.manifest_id " +
		"LEFT JOIN product_quick_sales q ON p.sku = q.sku " +
		"LEFT JOIN product_pricing_types pt ON pt.pricing_type_id = p.pricing_type_id " +
		"LEFT JOIN promotion_products pp ON pp.sku = p.sku " +
		"LEFT JOIN promotions pm ON ((start_date <= NOW()) AND (end_date > NOW()) AND (pm.id = pp.promo_id)) ";

	if (configUtils.get("GDE_TOGGLE") === "ON") {
		sql += "LEFT JOIN metro_sku_eligibility mse ON mse.sku = p.sku ";
	}

	sql += clWhereInfo.clause +
		" AND  p.status = 'Live' " +
		"AND p.online_shopping = 'Y' " +
		"AND LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) = ? " +
		"AND p.store_id IN " +
		"(SELECT store_id " +
		"FROM stores s " +
		"LEFT JOIN members m ON m.home_shopify_store_id = s.shopify_store_id " +
		"WHERE m.id = ?" +
		") ";

	if (configUtils.get("GDE_TOGGLE") === "ON") {
		sql += "AND mse.dest_city_id = " + homeCityId[0].home_city_id + " " +
			"AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE' ";
	}

	sql += "ORDER BY UPPER(seller_product_id), FIELD(condition_name, 'Like New', '', 'New', 'Damaged', 'Good', 'Fair', 'Trash'), q.id";

	clWhereInfo.values.push(categorySlug);
	clWhereInfo.values.push(memberId);
	clWhereInfo.values.push(memberId);

	// console.log(mysql.format(sql, clWhereInfo.values));
	prom.push(globals.poolRO.query(sql, clWhereInfo.values));

	var results = await Promise.all(prom);
	var prods = results[0];
	colUtils.outboundNaming(prods);

	// console.log("Category Products: " + prods.length);
	return prods;
}


exports.getCategoryProductsBySlug = async (categorySlug, soldTimeFrame) => {
	let prom = [];
	let resp = {
		totalCount: 0,
		attributeValues: null,
		products: []
	};
	let values = [];

	let sql = `SELECT  
      p.sku,
      p.shopify_variant_id,
      p.name,
      m.vendor_id,
      UPPER(p.seller_product_id) AS vendor_sku,  
      p.image,
      p.category_1,
      p.category_2,
      p.description,
      p.product_display,
      c.front_end_name,
      c.front_end_space,
      c.name as mapped_category_2,
      p.manufacturer,
			v.name as vendor_name,
      p.msrp,
      p.market_price,
      p.price,
      p.condition_name,
      pt.pricing_type,
      p.store_id,
      p.freshness_score,
      p.date_online,
      p.online_quick_sale,
      t.city_slug,
      p.status,
      q.color,
      q.size,
      q.material,
      q.dimensions,
      q.bullets, 
      q.id AS quick_sale_id,
      pm.id AS promo_id,
			s.lat,
			s.lng,
      GROUP_CONCAT(mse.dest_city_id) AS targeted_city_list 
    FROM 
      products p 
      LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
      LEFT JOIN categories c ON c.category_id = cm.category_id 
      LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
			LEFT JOIN vendors_summary v ON m.vendor_id = v.id
      LEFT JOIN product_quick_sales q ON p.sku = q.sku 
      LEFT JOIN product_pricing_types pt ON pt.pricing_type_id = p.pricing_type_id 
      LEFT JOIN promotion_products pp ON pp.sku = p.sku 
      LEFT JOIN promotions pm ON ((start_date <= NOW()) AND (end_date > NOW()) AND (pm.id = pp.promo_id)) 
      JOIN stores s ON s.store_id = p.store_id 
      JOIN targeted_cities t ON s.city_id = t.id 
      LEFT JOIN metro_sku_eligibility mse ON p.sku = mse.sku AND COALESCE(eligibility_override, eligibility) NOT IN ('NOT_ELIGIBLE') 
    WHERE 
      p.status = 'Live' 
      AND p.online_shopping = 'Y' 
      AND LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) = ? 
    GROUP BY p.sku `;
	values.push(categorySlug);
	if (soldTimeFrame > 0) {
		sql += ` UNION 
      SELECT  
        p.sku,
        p.shopify_variant_id,
        p.name,
        m.vendor_id,
        UPPER(p.seller_product_id) AS vendor_sku,  
        p.image,
        p.category_1,
        p.category_2,
        p.description,
        p.product_display,
        c.front_end_name,
        c.front_end_space,
				c.name as mapped_category_2,
        p.manufacturer,
				v.name as vendor_name,
        p.msrp,
        p.market_price,
        p.price,
        p.condition_name,
        pt.pricing_type,
        p.store_id,
        p.freshness_score,
        p.date_online,
        p.online_quick_sale,
        t.city_slug,
        p.status,
        q.color,
        q.size,
        q.material,
        q.dimensions,
        q.bullets, 
        q.id AS quick_sale_id,
        pm.id AS promo_id,
				s.lat,
				s.lng,	
        GROUP_CONCAT(mse.dest_city_id) AS targeted_city_list 
      FROM 
        products p 
        LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
        LEFT JOIN categories c ON c.category_id = cm.category_id 
        LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
				LEFT JOIN vendors_summary v ON m.vendor_id = v.id
        LEFT JOIN product_quick_sales q ON p.sku = q.sku 
        LEFT JOIN product_pricing_types pt ON pt.pricing_type_id = p.pricing_type_id 
        LEFT JOIN promotion_products pp ON pp.sku = p.sku 
        LEFT JOIN promotions pm ON ((start_date <= NOW()) AND (end_date > NOW()) AND (pm.id = pp.promo_id)) 
        LEFT JOIN order_line_items o ON o.sku = p.sku 
        JOIN stores s ON s.store_id = p.store_id 
        JOIN targeted_cities t ON s.city_id = t.id 
        LEFT JOIN metro_sku_eligibility mse ON p.sku = mse.sku AND COALESCE(eligibility_override, eligibility) NOT IN ('NOT_ELIGIBLE') 
      WHERE 
        p.status = 'Sold' 
        AND p.online_shopping = 'Y' 
        AND o.line_item_date_created >= DATE_SUB(NOW(), INTERVAL ${soldTimeFrame} HOUR) 
        AND LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) = ? 
      GROUP BY p.sku `;
		values.push(categorySlug);
	}
	sql += ` ORDER BY vendor_sku, FIELD(condition_name, 'Like New', '', 'New', 'Damaged', 'Good', 'Fair', 'Trash'), quick_sale_id, sku`;


	// console.log(mysql.format(sql, values));
	let rows = await globals.poolRO.query(sql, values);
	resp.totalCount = rows.length;
	resp.products = rows;
	colUtils.outboundNaming(resp.products);

	return resp;
}


exports.getFilteredCOINs = async (vskus, vcWhereInfo) => {

	var sql = "SELECT coin_id, vendor_id, UPPER(vendor_sku) as vendor_sku FROM coins_to_vendor_skus p WHERE (" + vskus + ")";
	// console.log(mysql.format(sql));
	var coins = await globals.productROPool.query(sql);

	var coinList = "";
	for (var i = 0; i < coins.length; i++) {
		if (coinList.length > 0) {
			coinList += ", ";
		}
		coinList += `'${coins[i].coin_id}'`;
	}

	sql = `SELECT p.product_name, 
						p.vendor_id as pf_vendor_id,
						v.name as vendor_name, 
						UPPER(p.vendor_sku) as pf_vendor_sku, 
						coin_id, 
						COALESCE(primary_color, color_specific) as color, 
						primary_color, 
						color_specific, 
						COALESCE(primary_material, material_specific) as material, 
						primary_material, 
						secondary_material, 
						material_specific, 
						attribute_name1 as attname1, 
						attribute_value1 AS attval1, 
						attribute_name2 as attname2, 
						attribute_value2 AS attval2, 
						attribute_name3 as attname3, 
						attribute_value3 AS attval3, 
						attribute_name4, 
						attribute_value4, 
						attribute_name5, 
						attribute_value5, 
						attribute_name6, 
						attribute_value6, 
						product_width, 
						product_depth, 
						product_height, 
						additional_dims, 
						product_description, 
						p.main_image_knockout as image1, 
						p.main_image_lifestyle as image2, 
						p.alt_image3 as image3, 
						p.alt_image4 as image4, 
						p.alt_image5 as image5, 
						p.bullet_point1, 
						p.bullet_point2, 
						p.bullet_point3, 
						p.bullet_point4, 
						p.style_tag1, 
						p.style_tag2,
						p.msrp,
						p.mpn
					FROM vendor_catalog_products p 
						LEFT JOIN vendors v ON p.vendor_id = v.id 
						LEFT JOIN coins_to_vendor_skus c ON ((p.vendor_id = c.vendor_id) AND (p.vendor_sku = c.vendor_sku)) 
					${vcWhereInfo.clause}
						AND p.pull_data_forward_flag = 1 
						AND c.coin_id IN (
							SELECT coin_id 
								FROM coins_to_vendor_skus
								WHERE coin_id IN (${coinList}) 
					)`;

	// console.log("Filtered COINs: " + mysql.format(sql, vcWhereInfo.values));

	if (coinList.length > 0) {
		var prods = await globals.productROPool.query(sql, vcWhereInfo.values);

		colUtils.outboundNaming(prods);

		for (var i = 0; i < prods.length; i++) {
			var o = _.find(coins, function (c) {
				if (prods[i].coinId !== undefined) {
					return c.coin_id === prods[i].coinId;
				}
			});

			if (o !== undefined) {
				prods[i].vendorId = o.vendor_id;
				prods[i].vendorSku = o.vendor_sku;
			}
		}

		return prods;
	} else {
		return [];
	}
}

exports.getPossibleAttributeValues = async (vskus, vcWhereInfo) => {
	var attSql = "SELECT COALESCE(primary_color, color_specific) AS color, COALESCE(primary_material, material_specific) AS material, attribute_name1 as attname1, attribute_value1 AS attval1, attribute_name2 as attname2, attribute_value2 AS attval2, attribute_name3 as attname3, attribute_value3 AS attval3 " +
		"FROM vendor_catalog_products p " +
		"WHERE (" + vskus + ")";

	// console.log("Attrib Values: " + mysql.format(attSql, vcWhereInfo.values));

	var attribs = await globals.productROPool.query(attSql);
	return attribs;
}


exports.getSizeAttributeLabels = async () => {
	var sizeNameSql = "SELECT `value` FROM `master_data`	WHERE `TYPE`= 'attributeNameToAttrSize'";

	var sizeAttributeLabels = await globals.poolRO.query(sizeNameSql);
	colUtils.outboundNaming(sizeAttributeLabels);

	return sizeAttributeLabels;
}


exports.getLowestPriceByCondition = async (coinId, conditionName) => {
	var sql = `SELECT vendor_id, seller_product_id, price, STATUS, online_shopping
							FROM products p
								LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
							WHERE STATUS = 'Live' AND online_shopping = 'Y' AND online_quick_sale = 'N' AND condition_name = '${conditionName}' AND CONCAT(vendor_id, seller_product_id) IN
								(SELECT CONCAT(vendor_id, vendor_sku) FROM coins_to_vskus WHERE coin_id = '${coinId}')
							ORDER BY condition_name, price`

	var rows = await globals.poolRO.query(sql);				
	colUtils.outboundNaming(rows);

	return rows;			
}


exports.getLowestPriceBySkuCondition = async (sku, conditionName) => {
	var sql = `SELECT vendor_id, seller_product_id, price, STATUS, online_shopping, condition_name
							FROM products p
								LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
							WHERE STATUS = 'Live' AND online_shopping = 'Y' AND condition_name = '${conditionName}' AND sku = ${sku} 
							ORDER BY condition_name, price`

	var rows = await globals.poolRO.query(sql);				
	colUtils.outboundNaming(rows);

	return rows;			
}



exports.getConditionsByCoin = async (coinId) => {
	var sql = `SELECT vendor_id, seller_product_id, GROUP_CONCAT(condition_name, ':', price, ':', STATUS, ':', online_shopping) as conditions
												FROM products p
														LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
												WHERE STATUS = 'Live' AND online_shopping = 'Y' AND online_quick_sale = 'N' AND CONCAT(vendor_id, seller_product_id) IN
													(SELECT CONCAT(vendor_id, vendor_sku) FROM coins_to_vskus WHERE coin_id = '${coinId}')
												GROUP BY p.seller_product_id
												ORDER BY condition_name, price`;


	// console.log(mysql.format(sql));
	var conditions = null;
	
	while (1) {
		try {
			conditions = await globals.poolRO.query(sql);
		}
		catch (e) {
      if (e.message.startsWith('ER_NO_SUCH_TABLE')) {
        await sleep(250);
      }
      else {
        throw e;
      }
		}

		if (conditions !== null) {
			break;
		}
	}
	colUtils.outboundNaming(conditions);

	return conditions;
}



exports.countTotalQuantityByCoin = async (coinId) => {
	var sql = `SELECT COUNT(*) AS qty
								FROM products p
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE STATUS = 'Live' AND online_shopping = 'Y' AND online_quick_sale = 'N' AND CONCAT(vendor_id, seller_product_id) IN
													(SELECT CONCAT(vendor_id, vendor_sku) FROM coins_to_vskus WHERE coin_id = '${coinId}')`;
	
	
	var count = null;
	
	while (1) {
		try {
			count = await globals.poolRO.query(sql);
		}
		catch (e) {
      if (e.message.startsWith('ER_NO_SUCH_TABLE')) {
        await sleep(250);
      }
      else {
        throw e;
      }
		}

		if (count !== null) {
			break;
		}
	}

	return count;
}

exports.getConditionsByCoins = async (coins) => {
	var sql = `SELECT vendor_id, seller_product_id as vendor_sku, GROUP_CONCAT(condition_name, ':', price, ':', STATUS, ':', online_shopping) as conditions
												FROM products p
														LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
												WHERE STATUS = 'Live' AND online_shopping = 'Y' AND online_quick_sale = 'N' AND CONCAT(vendor_id, seller_product_id) IN
													(SELECT CONCAT(vendor_id, vendor_sku) FROM coins_to_vskus WHERE coin_id IN (${coins}))
												GROUP BY m.vendor_id, p.seller_product_id
												ORDER BY condition_name, price`;


	// console.log(mysql.format(sql));
	var conditions = await globals.poolRO.query(sql);
	colUtils.outboundNaming(conditions);

	return conditions;
}


exports.getConditionsBySku = async (sku) => {
	var sql = `SELECT vendor_id, seller_product_id, GROUP_CONCAT(condition_name, ':', price, ':', STATUS, ':', online_shopping) as conditions
												FROM products p
														LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
												WHERE STATUS = 'Live' AND online_shopping = 'Y' AND sku = ?
												GROUP BY m.vendor_id, p.seller_product_id
												ORDER BY condition_name, price`;


	// console.log(mysql.format(sql));
	var conditions = await globals.poolRO.query(sql, [sku]);
	colUtils.outboundNaming(conditions);

	return conditions;
}