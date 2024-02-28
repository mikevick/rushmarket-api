'use strict';

const globals = require('../globals');
const mysql = require('promise-mysql');

const colUtils = require('../utils/columnUtils');



exports.getNationalQuantityByCoin = async (coin, excludeDropship) => {
	var sql =
		`SELECT p.sku, p.price, condition_name, online_quick_sale, pct_ship_eligible, vendor_id, seller_product_id
				FROM products p
					LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
					LEFT JOIN metro_sku_eligibility_summary s ON s.sku = p.sku
				WHERE STATUS = 'Live'
					AND online_shopping = 'Y'
					AND shippable = 'Y'
					AND pct_ship_eligible = 100 
					AND CONCAT(vendor_id, '|', seller_product_id) IN (
						SELECT CONCAT(vendor_id, '|', vendor_sku)
							FROM coins_to_vskus WHERE coin_id = ?)`;
	
	if (excludeDropship && (excludeDropship === 'true')) {
		sql += ` AND dropship_type IS NULL`;
	}

	// console.log(mysql.format(sql, [coin]));
	var rushSkus = await globals.poolRO.query(sql, [coin]);
	colUtils.outboundNaming(rushSkus);

	return rushSkus;
}



exports.getNationalOQSQuantity = async (vendorId, vendorSku) => {
	var sql =
		`SELECT p.sku, p.price, condition_name, online_quick_sale, pct_ship_eligible, m.vendor_id, seller_product_id
				FROM products p
					LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
					LEFT JOIN metro_sku_eligibility_summary s ON s.sku = p.sku
				WHERE STATUS = 'Live'
					AND online_shopping = 'Y'
					AND online_quick_sale = 'Y'
					AND shippable = 'Y'
					AND pct_ship_eligible = 100 
					AND m.vendor_id = ?
					AND p.seller_product_id = ?
				ORDER BY price;`

	// console.log(mysql.format(sql, [vendorId, vendorSku]));
	var rushSkus = await globals.poolRO.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rushSkus);

	return rushSkus;
}



exports.getRegionalQuantityByCoin = async (cityId, coin, excludeDropship) => {
	var sql =
		`SELECT p.sku, p.price, condition_name, online_quick_sale, COALESCE(eligibility_override, eligibility) AS effective_eligibility, m.vendor_id, seller_product_id
				FROM products p
					LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
					LEFT JOIN metro_sku_eligibility e ON e.sku = p.sku
				WHERE STATUS = 'Live'
					AND online_shopping = 'Y'
					AND p.shippable = 'Y'
					AND e.dest_city_id = ?
					AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
					AND CONCAT(m.vendor_id, '|', seller_product_id) IN (
						SELECT CONCAT(vendor_id, '|', vendor_sku)
							FROM coins_to_vskus WHERE coin_id = ?)`;
	
	if (excludeDropship && (excludeDropship === 'true')) {
		sql += ` AND dropship_type IS NULL`;
	}
											
	sql += ` ORDER BY online_quick_sale, price`;

	// console.log(mysql.format(sql, [cityId, coin]));
	var rushSkus = await globals.poolRO.query(sql, [cityId, coin]);
	colUtils.outboundNaming(rushSkus);

	return rushSkus;
}



exports.getRegionalOQSQuantity = async (cityId, vendorId, vendorSku) => {
	var sql =
		`SELECT p.sku, p.price, condition_name, online_quick_sale, COALESCE(eligibility_override, eligibility) AS effective_eligibility, m.vendor_id, seller_product_id
				FROM products p
					LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
					LEFT JOIN metro_sku_eligibility e ON e.sku = p.sku
				WHERE STATUS = 'Live'
					AND online_shopping = 'Y'
					AND online_quick_sale = 'Y'
					AND p.shippable = 'Y'
					AND e.dest_city_id = ?
					AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
					AND m.vendor_id = ?
					AND p.seller_product_id = ?
				ORDER BY price;`

	// console.log(mysql.format(sql, [vendorId, vendorSku]));
	var rushSkus = await globals.poolRO.query(sql, [cityId, vendorId, vendorSku]);
	colUtils.outboundNaming(rushSkus);

	return rushSkus;
}

