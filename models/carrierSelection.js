'use strict';

const globals = require('../globals');
const mysql = require('promise-mysql')
const colUtils = require('../utils/columnUtils');



exports.getAll = async (whereInfo, sortBy, offset, limit) => {
	var prom = [];
	var resp = {
		totalCount: 0,
		rushProducts: []
	};

	// var countSql = 'SELECT count(*) as num FROM vendor_catalog_products p ' + whereInfo.clause
	var countSql = 'SELECT count(*) as num ' +
		'FROM products p ' +
		whereInfo.clause;
	var sql = 'SELECT p.*, m.vendor_id ' +
		'FROM products p LEFT JOIN manifests m ON p.manifest_id = m.manifest_id ' +
		whereInfo.clause;

	prom.push(globals.pool.query(countSql, whereInfo.values));

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

	var results = await Promise.all(prom);
	var count = results[0];
	var rows = results[1];

	resp.totalCount = count[0].num;
	resp.rushProducts = rows;
	colUtils.outboundNaming(resp.rushProducts);

	if (resp.rushProducts.length > 0) {
		for (var i = 0; i < resp.rushProducts.length; i++) {
			var coin = await globals.productPool.query("SELECT coin_id FROM coins_to_vendor_skus " +
				"WHERE vendor_id = ? AND vendor_sku = ?", [resp.rushProducts[i].vendorId, resp.rushProducts[i].sellerProductId]);
			if (coin.length > 0) {
				resp.rushProducts[i].coinId = coin[0].coin_id;
			} else {
				resp.rushProducts[i].coinId = resp.rushProducts[i].vendorId + "-" + resp.rushProducts[i].sellerProductId;
			}
		}
	}



	return resp;
}



//
//	This query will find a carrier that covers both source and destination markets and delivers the shipType to the member's zip code.  
//
exports.findEligibleCarrier = async (memberZip, shipType, memberCityId, variantCityId) => {
	if ((shipType === null) || (shipType === '')) {
		shipType = 'Small Parcel';
	}

	var sql = "SELECT lc.id as carrier_id, `name`, cz.zip, cz.extended_flag, lc.transit_days, " +
									"lc.small_parcel_rule, lc.small_parcel_base_rate, lc.small_parcel_base_rate_max, lc.small_parcel_extended_rate, lc.small_parcel_extended_rate_max, " +
									"lc.ltl_rule, lc.ltl_base_rate, lc.ltl_extended_rate " +
								"FROM local_carriers lc " +
										"LEFT JOIN local_carrier_zips cz ON cz.local_carrier_id = lc.id " +
								"WHERE cz.zip = ? AND ship_type = ? AND lc.id IN ( " + 
										"SELECT mc.local_carrier_id " +
												"FROM local_carrier_to_city mc " +
														"LEFT JOIN local_carrier_to_city vc ON mc.local_carrier_id = vc.local_carrier_id " + 
												"WHERE mc.local_carrier_id = vc.local_carrier_id " + 
														"AND mc.targeted_city_id = ? " + 
														"AND vc.targeted_city_id = ?)";

	// console.log(mysql.format(sql, [memberZip, shipType, memberCityId, variantCityId]));
	var carrier = await globals.pool.query(sql, [memberZip, shipType, memberCityId, variantCityId]);
	colUtils.outboundNaming(carrier);

	return carrier;
}


exports.getCarrierHolidays = async (localCarrierId) => {
	var sql = "SELECT `day`, label " +
								"FROM local_carrier_holidays " +
										"WHERE local_carrier_id = ? ORDER BY `day`"; 

	var holidays = await globals.pool.query(sql, [localCarrierId]);
	colUtils.outboundNaming(holidays);

	return holidays;
}



exports.lookupCarrierZip = async (sku, cityId, destZip, shipType, variantCityId) => {
	var sql = `
							-- Look for a Johnny type local carrier who delivers to the dest zip and is in the same city/metro as the variant.
							SELECT z.local_carrier_id, z.zip, z.ship_type 
									FROM local_carrier_zips z 
											LEFT JOIN local_carrier_to_city c ON c.local_carrier_id = z.local_carrier_id 
									WHERE c.targeted_city_id = ?
											AND c.targeted_city_id = ?
											AND z.zip = ? 
											AND ship_type = ?
							UNION 
							SELECT cz.local_carrier_id, cz.zip, cz.ship_type 
								FROM products p 
									LEFT JOIN stores s ON s.store_id = p.store_id 
									LEFT JOIN local_carrier_to_city lcc ON s.city_id = lcc.targeted_city_id
									LEFT JOIN local_carriers lc ON lcc.local_carrier_id = lc.id
									LEFT JOIN local_carrier_zips cz ON cz.local_carrier_id = lc.id 		
								WHERE sku = ?
									AND cz.ship_type = ?
									AND s.partner_facility = 'Y' 
									AND local_carrier_type = 'PARTNER'
									AND cz.zip = ?
								LIMIT 0,1
							`;

		console.log(mysql.format(sql, [cityId, destZip, shipType, variantCityId, sku, shipType, destZip]));

	var zip = await globals.pool.query(sql, [cityId, destZip, shipType, variantCityId, sku, shipType, destZip]);
	colUtils.outboundNaming(zip);

	return zip;
}