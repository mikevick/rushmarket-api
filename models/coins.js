'use strict';

const _ = require('lodash');
const mysql = require('promise-mysql');

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');
const vendorUtils = require('../utils/vendorUtils');



exports.create = async (parentCoin, product) => {
	try {
		var coinId = null;
		var conn = null;
		var parentId = null;


		//	Insert into all 3 tables all-or-nothing.
		conn = await globals.productPool.getConnection();
		await conn.beginTransaction();

		var id = new Date().getTime().toString(16).toUpperCase();
		if (parentCoin != null) {
			parentId = parentCoin;
		} else {
			parentId = id;
		}

		do {
			id = new Date().getTime().toString(16).toUpperCase();
			coinId = id;
		} while (parentId === coinId);

		var values = [coinId, parentId];
		var result = await conn.query("INSERT INTO coins (id, parent_id) VALUES (?, ?)", values);

		if (coinId === 0) {
			console.log(coinId);
		}
		if ((product.upc !== undefined) && (product.upc !== null)) {
			id = globals.mongoid.fetch();
			values = [id, coinId, product.upc];
			result = await conn.query("INSERT INTO coins_to_upc (id, coin_id, upc) VALUES (?, ?, ?)", values);
		}

		if ((product.mpn !== undefined) && (product.mpn !== null)) {
			id = globals.mongoid.fetch();
			values = [id, coinId, product.manufacturer, product.mpn];
			result = await conn.query("INSERT INTO coins_to_manufacturer_mpn (id, coin_id, manufacturer, mpn) VALUES (?, ?, ?, ?)", values);
		}

		if ((product.vendorId !== undefined) && (product.vendorId !== null) && (product.vendorSku !== undefined) && (product.vendorSku !== null)) {
			id = globals.mongoid.fetch();
			values = [id, coinId, product.vendorId, product.vendorSku];
			result = await conn.query("INSERT INTO coins_to_vendor_skus (id, coin_id, vendor_id, vendor_sku) VALUES (?, ?, ?, ?)", values);
		}

		await conn.commit();

		return {
			coinId: coinId,
			parentId: parentId
		};
	} catch (e) {
		conn.rollback();
		throw (e);
	} finally {
		globals.productPool.releaseConnection(conn);
	}
}


exports.delById = async (id) => {
	return await globals.productPool.query("DELETE FROM coins WHERE id = ?", [id]);
}



//
//	This function assumes a product has been deleted from the VC and this handles the logic to remove coin references as appropriate.
//
exports.deleteByProductReference = async (coinId, vendorId, vendorSku, upc, manufacturer, mpn) => {

	//	Delete from coins_to_vendor_skus to detach product from coin
	await globals.productPool.query("DELETE FROM coins_to_vendor_skus WHERE vendor_id = ? AND vendor_sku = ?", [vendorId, vendorSku]);

	//	Are there other vendor skus tied to coin?  If so, don't delete coin.
	var results = await globals.productPool.query("SELECT * FROM coins_to_vendor_skus WHERE coin_id = ?", [coinId]);
	if (results.length > 0) {
		return;
	}

	//	Are there other skus with the UPC tied to coin?  If so don't delete coin.  If we get to this point it likely means the other item(s) aren't in 
	//	the coins_to_vendor_skus table for some reason.
	results = await globals.productPool.query("SELECT * FROM vendor_catalog_products WHERE upc = ?", [upc]);
	if (results.length > 0) {
		return;
	}


	//	Are there other skus with manu+mpn's tied to coin?  If so don't delete coin.  If we get to this point it likely means the other item(s) aren't in
	//	the coins_to_vendor_skus and coins_to_upc tables for some reason.
	results = await globals.productPool.query("SELECT * FROM vendor_catalog_products WHERE manufacturer = ? AND mpn = ?", [manufacturer, mpn]);
	if (results.length > 0) {
		return;
	}


	//	If we get to this point we should be able to safely delete the COIN.
	results = await globals.productPool.query("DELETE FROM coins_to_manufacturer_mpn WHERE manufacturer = ? AND mpn = ? AND coin_id = ?", [manufacturer, mpn, coinId]);
	results = await globals.productPool.query("DELETE FROM coins_to_upc WHERE upc = ? AND coin_id = ?", [upc, coinId]);
	results = await globals.productPool.query("DELETE FROM coins WHERE id = ?", [coinId]);

}



exports.forceDelById = async (coinId) => {
	try {
		var conn = null;


		//	Insert into all 3 tables all-or-nothing.
		conn = await globals.productPool.getConnection();
		await conn.beginTransaction();

		var result = await conn.query("DELETE from coins where id = ?", [coinId]);
		result = await conn.query("DELETE from coins_to_upc where coin_id = ?", [coinId]);
		result = await conn.query("DELETE from coins_to_manufacturer_mpn where coin_id = ?", [coinId]);
		result = await conn.query("DELETE from coins_to_vendor_skus where coin_id = ?", [coinId]);

		await conn.commit();

	} catch (e) {
		conn.rollback();
		throw (e);
	} finally {
		globals.productPool.releaseConnection(conn);
	}
}




exports.getById = async (id, includeProducts) => {
	var resp = {
		coin: [],
		products: []
	}

	var coin = await globals.productPool.query("SELECT * FROM coins WHERE id = ?", [id]);
	var listedOn = await globals.productPool.query("SELECT lo.platform FROM coins_to_listed_on clo LEFT JOIN listed_on lo ON clo.listed_on_id = lo.id WHERE clo.coin_id = ?", [id]);
	var reasons = await globals.productPool.query("SELECT nlr.reason FROM coins_to_not_listed_reasons cnlr LEFT JOIN not_listed_reasons nlr ON cnlr.not_listed_reason_id = nlr.id WHERE cnlr.coin_id = ?", [id]);


	colUtils.outboundNaming(coin);
	if (coin.length > 0) {
		if (coin[0].listedOnMarketplace) {
			coin[0].listedOnMarketplace = true;
		} else {
			coin[0].listedOnMarketplace = false;
		}

		coin[0].listedOn = [];
		coin[0].notListedReasons = [];

		for (var i = 0; i < listedOn.length; i++) {
			coin[0].listedOn.push(listedOn[i].platform);
		}
		for (var i = 0; i < reasons.length; i++) {
			coin[0].notListedReasons.push(reasons[i].reason);
		}
	}



	resp.coin = coin;
	if (includeProducts) {
		var products = await globals.productPool.query(`
				SELECT p.*, v.name as vendor_name
					FROM vendor_catalog_products p 
						LEFT JOIN vendors v ON v.id = p.vendor_id
						LEFT JOIN coins_to_vendor_skus c ON ((c.vendor_id = p.vendor_id) AND (c.vendor_sku = p.vendor_sku))
						WHERE c.coin_id = ?`, [id]);
		colUtils.outboundNaming(products)
		resp.products = products;
	}
	return resp;
}



exports.getPullForwardCountById = async (id, vendorId, vendorSku) => {
	var num = await globals.productPool.query(`SELECT COUNT(*) as num
																		FROM vendor_catalog_products p 
																			LEFT JOIN coins_to_vendor_skus c ON c.vendor_id = p.vendor_id AND c.vendor_sku = p.vendor_sku 
																			WHERE p.pull_data_forward_flag = 1 AND c.vendor_id != ? AND c.vendor_sku != ? AND c.coin_id = ?`, [vendorId, vendorSku, id]);

	if (num.length === 0) {
		return 0;
	} else {
		return num[0].num;
	}
}



exports.getDiscrepancies = async (verboseFlag) => {
	var invalidMPNMap = [];
	var invalidVendorSkuMap = [];
	var prom = [];
	var resp = {};
	var result = null;
	var results = null;
	var totalProducts = 0;
	var totalCoinVendorSkus = 0;
	var manuMPNNoCoin = [];
	var orphanedCoinMPN = [];
	var orphanedCoinUPC = [];
	var orphanedCoinVendorSku = [];
	var vendors = [];
	var vname = undefined;



	//	Get total number of products in the VC.
	prom.push(globals.productPool.query("SELECT COUNT(*) AS num FROM vendor_catalog_products"));

	//	Get count of distinct vendorId / sku pairs in the coins_to table.
	prom.push(globals.productPool.query("SELECT COUNT(DISTINCT(CONCAT(vendor_id, vendor_sku))) as num FROM coins_to_vendor_skus"));

	// Surface COINs mapped to a vendor id / sku pair that doesn't exist. Should be none. 
	prom.push(globals.productPool.query("SELECT date_created, date_modified, coin_id, vendor_id, vendor_sku " +
		"FROM coins_to_vendor_skus " +
		"WHERE CONCAT(vendor_id, vendor_sku) NOT IN (SELECT CONCAT(vendor_id, vendor_sku) FROM vendor_catalog_products)"));

	// Surface products that do not have a COIN mapped to manufacturer/mpn.   All should. 
	prom.push(globals.productPool.query("SELECT date_created, date_modified, vendor_id, vendor_sku, upc, manufacturer, mpn  " +
		"FROM vendor_catalog_products " +
		"WHERE CONCAT(manufacturer, mpn) NOT IN (SELECT CONCAT(manufacturer, mpn) FROM coins_to_manufacturer_mpn)"));

	// Surface COINs mapped to a manu / mpn pair that doesn't exist. Should be none. 
	prom.push(globals.productPool.query("SELECT coin_id, manufacturer, mpn FROM coins_to_manufacturer_mpn " +
		"WHERE CONCAT(manufacturer, mpn) NOT IN (" +
		"SELECT CONCAT(manufacturer, mpn) FROM vendor_catalog_products WHERE manufacturer IS NOT NULL AND mpn IS NOT NULL)"));

	//	Find any coin to upc mappings referencing a coin that doesn't exist.																							
	prom.push(globals.productPool.query("SELECT coin_id FROM coins_to_upc WHERE coin_id NOT IN (SELECT id FROM coins)"));

	//	Find any coin to manu mpn mappings referencing a coin that doesn't exist.																							
	prom.push(globals.productPool.query("SELECT coin_id FROM coins_to_manufacturer_mpn WHERE coin_id NOT IN (SELECT id FROM coins)"));

	//	Find any coin to vendor sku mappings referencing a coin that doesn't exist.																							
	prom.push(globals.productPool.query("SELECT coin_id FROM coins_to_vendor_skus WHERE coin_id NOT IN (SELECT id FROM coins)"));

	results = await Promise.all(prom);
	prom = [];

	totalProducts = results[0][0].num;
	totalCoinVendorSkus = results[1][0].num;
	invalidVendorSkuMap = results[2];
	manuMPNNoCoin = results[3];
	invalidMPNMap = results[4];
	orphanedCoinUPC = results[5];
	orphanedCoinMPN = results[6];
	orphanedCoinVendorSku = results[7];

	resp.productsNoCoinVendorSku = [];
	resp.invalidVendorSkuMap = [];
	resp.productsNoCoinManuMPN = [];
	resp.invalidMPNMap = [];
	resp.orphanedCoinUPC = [];
	resp.orphanedCoinMPN = [];
	resp.orphanedCoinVendorSku = [];

	if (verboseFlag) {
		resp.totalProducts = totalProducts;
		resp.totalCoinVendorSkus = totalCoinVendorSkus;
	}

	//	If there's a discrepancy, return the products that don't have a coin vendor sku mapping.
	if (totalProducts !== totalCoinVendorSkus) {
		resp.vendorSkuDiscrepancy = true;

		result = await globals.productPool.query("SELECT date_created, date_modified, vendor_id, vendor_sku, upc, manufacturer, mpn " +
			"FROM vendor_catalog_products " +
			"WHERE CONCAT(vendor_id, vendor_sku) NOT IN " +
			"(SELECT CONCAT(vendor_id, vendor_sku) FROM coins_to_vendor_skus)");
		for (var i = 0; i < result.length; i++) {
			vname = await vendorUtils.getVendor(vendors, result[i].vendor_id);
			resp.productsNoCoinVendorSku.push({
				vendorId: result[i].vendor_id,
				vendorName: vname,
				vendorSku: result[i].vendor_sku,
				upc: result[i].upc,
				manufacturer: result[i].manufacturer,
				mpn: result[i].mpn
			})
		}
	} else {
		resp.vendorSkuDiscrepancy = false;
	}


	//	Coins mapped to a non-existent vendor/sku.
	if (invalidVendorSkuMap.length > 0) {
		resp.invalidVendorSkuMapDiscrepancy = true;

		for (var i = 0; i < invalidVendorSkuMap.length; i++) {
			resp.invalidVendorSkuMap.push({
				coinId: invalidVendorSkuMap[i].coin_id,
				vendorId: invalidVendorSkuMap[i].vendor_id,
				vendorSku: invalidVendorSkuMap[i].vendor_sku
			})
		}
	} else {
		resp.invalidVendorSkuMapDiscrepancy = false;
	}

	//	Product missing a COIN to manu + MPN mapping.
	if (manuMPNNoCoin.length > 0) {
		resp.coinManuMPNDiscrepancy = true;
		for (var i = 0; i < manuMPNNoCoin.length; i++) {
			vname = await vendorUtils.getVendor(vendors, manuMPNNoCoin[i].vendor_id);
			resp.productsNoCoinManuMPN.push({
				vendorId: manuMPNNoCoin[i].vendor_id,
				vendorName: vname,
				vendorSku: manuMPNNoCoin[i].vendor_sku,
				upc: manuMPNNoCoin[i].upc,
				manufacturer: manuMPNNoCoin[i].manufacturer,
				mpn: manuMPNNoCoin[i].mpn
			})
		}
	} else {
		resp.coniManuMPNDiscrepancy = false;
	}


	//	Coins mapped to a non-existent manu/mpn.
	if (invalidMPNMap.length > 0) {
		resp.invalidMPNMapDiscrepancy = true;

		for (var i = 0; i < invalidMPNMap.length; i++) {
			resp.invalidMPNMap.push({
				coinId: invalidMPNMap[i].coin_id,
				manufacturer: invalidMPNMap[i].manufacturer,
				mpn: invalidMPNMap[i].mpn
			})
		}
	} else {
		resp.invalidMPNMapDiscrepancy = false;
	}



	//	Coins mapped to a non-existent manu/mpn.
	if (orphanedCoinUPC.length > 0) {
		for (var i = 0; i < orphanedCoinUPC.length; i++) {
			resp.orphanedCoinUPC.push({
				coinId: orphanedCoinUPC[i].coin_id
			})
		}
	}


	//	Coins mapped to a non-existent manu/mpn.
	if (orphanedCoinMPN.length > 0) {
		for (var i = 0; i < orphanedCoinMPN.length; i++) {
			resp.orphanedCoinMPN.push({
				coinId: orphanedCoinMPN[i].coin_id
			})
		}
	}



	//	Coins mapped to a non-existent manu/mpn.
	if (orphanedCoinVendorSku.length > 0) {
		for (var i = 0; i < orphanedCoinVendorSku.length; i++) {
			resp.orphanedCoinVendorSku.push({
				coinId: orphanedCoinVendorSku[i].coin_id
			})
		}
	}


	/* Check for duplicate vendor_id/vendor_sku pairs - this should never happen.  */
	// SELECT CONCAT(vendor_id, vendor_sku), COUNT(*) AS num FROM vendor_catalog_products GROUP BY CONCAT(vendor_id, vendor_sku) HAVING num > 1 ORDER BY num DESC;	


	/* Surface COINs mapped to a manufacturer / mpn pair that doesn't exist.   Should be none. */
	// SELECT date_created, date_modified, manufacturer, mpn
	// 	FROM coins_to_manufacturer_mpn
	// 	WHERE CONCAT(manufacturer, mpn) NOT IN (SELECT CONCAT(manufacturer, mpn) FROM vendor_catalog_products);

	// colUtils.outboundNaming(coin);

	return resp;
}


exports.getAllMarginThresholds = async (coinFilter, nameFilter) => {
	var coinList = '';
	var coinValues = [];
	var resp = {
		coins: []
	}
	var tempFilter = '';

	if (coinFilter !== null) {
		var s = _.split(coinFilter, ',');

		for (var i = 0; i < s.length; i++) {
			if (tempFilter.length) {
				tempFilter += ', ';
			}

			tempFilter += `'${s[i]}'`;
		}

		coinFilter = tempFilter;
	}

	var coinSql = `SELECT coin_id, margin_eligibility_threshold FROM gde_coin_margin_rules c `;
	if (coinFilter !== null) {
		coinSql += ` WHERE coin_id IN (${coinFilter}) `
		coinValues.push(coinFilter);
	}
	coinSql += ` ORDER BY coin_id`;

	var coins = await globals.pool.query(coinSql, coinValues);
	colUtils.outboundNaming(coins);
	resp.coins = coins;
	for (var i = 0; i < coins.length; i++) {
		coins[i].productName = null;
		coins[i].primaryCategory = null;
		coins[i].secondaryCategory = null;

		if (coinList.length > 0) {
			coinList += ', ';
		}
		coinList += `'${coins[i].coinId}'`;
	}


	var sql = `SELECT cv.coin_id AS coin_id, p.product_name, p.primary_category, p.secondary_category 
								FROM vendors.coins_to_vendor_skus cv
									LEFT JOIN vendors.vendor_catalog_products p ON cv.vendor_id = p.vendor_id AND cv.vendor_sku = p.vendor_sku
								WHERE cv.coin_id IN (${coinList})
									AND p.pull_data_forward_flag = 1`;

	if (nameFilter !== null) {
		sql += ` AND p.product_name LIKE '%${nameFilter}%' AND p.product_name IS NOT NULL `;
	}

	if (coinList.length > 0) {
		console.log(mysql.format(sql));
		var rows = await (globals.productPool.query(sql));
		colUtils.outboundNaming(rows);

		for (var i = 0; i < rows.length; i++) {
			var idx = _.findIndex(coins, function (c) {
				return c.coinId === rows[i].coinId;
			});

			if (idx > -1) {
				coins[idx].productName = rows[i].productName;
				coins[idx].primaryCategory = rows[i].primaryCategory;
				coins[idx].secondaryCategory = rows[i].secondaryCategory;
			}
		}
	}

	if (nameFilter !== null) {
		for (var i = 0; i < coins.length; i++) {
			_.remove(coins, function (c) {
				return c.productName === null;
			})
		}
	}

	return resp;
}


exports.updateMarginThreshold = async (coinId, marginThreshold) => {
	var result = await globals.pool.query(`INSERT INTO gde_coin_margin_rules (coin_id, margin_eligibility_threshold) 
																					VALUES (?, ?) 
																					ON DUPLICATE KEY 
																					UPDATE date_modified = now(), margin_eligibility_threshold = ?`, [coinId, marginThreshold, marginThreshold]);

	return result;
}



exports.deleteMarginThreshold = async (coinId, marginThreshold) => {
	var result = await globals.pool.query(`DELETE FROM gde_coin_margin_rules WHERE coin_id = ?`, [coinId]);

	return result;
}




exports.getSiblingsById = async (id, includeProducts) => {
	var resp = {
		coins: [],
		products: []
	}

	var coins = await globals.productPool.query("SELECT * FROM coins c WHERE id != ? AND parent_id IN (SELECT parent_id FROM coins WHERE id = ?)", [id, id]);
	colUtils.outboundNaming(coins);
	resp.coins = coins;
	if (includeProducts) {
		for (var i = 0; i < coins.length; i++) {
			var products = await globals.productPool.query("SELECT p.* FROM vendor_catalog_products p LEFT JOIN coins_to_vendor_skus c ON c.vendor_id = p.vendor_id AND c.vendor_sku = p.vendor_sku WHERE c.coin_id = ?", [coins[i].id]);
			colUtils.outboundNaming(products)
			resp.coins[i].products = products;
		}
	}
	return resp;
}


exports.getByUPC = (upc) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("SELECT c.listed_on_marketplace, u.* FROM coins_to_upc u LEFT JOIN coins c ON c.id = u.coin_id WHERE upc = ?", [upc])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



//	For a given manufacturer and MPN should only ever find at most one COIN.
exports.getByManufacturerMPN = (manufacturer, mpn) => {
	return new Promise((resolve, reject) => {
		if (manufacturer != undefined) {
			manufacturer = manufacturer.toLowerCase();
		}

		var sql = "SELECT m.*, c.listed_on_marketplace, u.upc FROM coins_to_manufacturer_mpn m LEFT JOIN coins c ON c.id = m.coin_id LEFT JOIN coins_to_upc u ON m.coin_id = u.coin_id WHERE manufacturer = ? AND mpn = ?";
		if (manufacturer === null) {
			sql = "SELECT m.*, c.listed_on_marketplace, u.upc FROM coins_to_manufacturer_mpn m LEFT JOIN coins c ON c.id = m.coin_id LEFT JOIN coins_to_upc u ON m.coin_id = u.coin_id WHERE manufacturer IS ? AND mpn = ?";
		}

		globals.productPool.query(sql, [manufacturer, mpn])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getByManufacturerMPNs = (manufacturerMPNs) => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT * FROM coins_to_manufacturer_mpn WHERE (";
		var clauses = "";
		var values = [];

		for (var i = 0; i < manufacturerMPNs.length; i++) {
			if (clauses.length > 0) {
				clauses = clauses + " OR ";
			}

			values.push(manufacturerMPNs[i].manufacturer);
			values.push(manufacturerMPNs[i].mpn);
			clauses = clauses + `(manufacturer = ? AND mpn = ?)`;
		}

		sql = sql + clauses + ")";



		globals.productPool.query(sql, values)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getByVendorSku = (vendorId, vendorSku) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("SELECT vs.*, c.parent_id, c.listed_on_marketplace FROM coins_to_vendor_skus vs, coins c WHERE vs.coin_id = c.id AND vendor_id = ? AND vendor_sku = ?", [vendorId, vendorSku])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getByVendorSkus = (vendorSkus, offset, limit) => {
	return new Promise((resolve, reject) => {
		var sql = `SELECT c.listed_on_marketplace, v.* FROM coins_to_vendor_skus v
						LEFT JOIN coins c ON c.id = v.coin_id 
						WHERE (`;
		var clauses = "";
		var values = [];

		for (var i = offset; i < offset + limit; i++) {
			if (clauses.length > 0) {
				clauses = clauses + " OR ";
			}

			if (vendorSkus[i] !== undefined) {
				values.push(vendorSkus[i].vendorId);
				values.push(vendorSkus[i].vendorSku);
				clauses = clauses + `(vendor_id = ? AND vendor_sku = ?)`;
			}
		}

		sql = sql + clauses + ")";


		// console.log(mysql.format(sql, values))

		globals.productPool.query(sql, values)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				for (var i = 0; i < rows.length; i++) {
					if (rows[i].listedOnMarketplace) {
						rows[i].listedOnMarketplace = true;
					} else {
						rows[i].listedOnMarketplace = false;
					}
				}
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAll = async (offset, limit) => {
	var resp = {
		totalCount: 0,
		rows: []
	}

	var count = await globals.productPool.query("SELECT count(*) as num FROM coins");
	resp.totalCount = count[0].num;

	var rows = await globals.productPool.query("SELECT * FROM coins ORDER BY date_created ASC LIMIT ?,?", [offset, limit]);
	colUtils.outboundNaming(rows);
	for (var i = 0; i < rows.length; i++) {
		if (rows[i].listedOnMarketplace) {
			rows[i].listedOnMarketplace = true;
		} else {
			rows[i].listedOnMarketplace = false;
		}
	}
	resp.rows = rows;

	return resp;
}


exports.getUPCByCoinId = (coinId) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("SELECT * FROM coins_to_upc WHERE coin_id = ?", [coinId])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getManuByCoinId = (coinId) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("SELECT * FROM coins_to_manufacturer_mpn WHERE coin_id = ?", [coinId])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getVendorSkuByCoinId = (coinId) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("SELECT * FROM coins_to_vendor_skus WHERE coin_id = ?", [coinId])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.linkToManufacturerMPN = async (coinId, manufacturer, mpn) => {
	try {
		var id = globals.mongoid.fetch();
		var values = [id, coinId, manufacturer, mpn];
		return await globals.productPool.query("INSERT INTO coins_to_manufacturer_mpn (id, coin_id, manufacturer, mpn) VALUES (?, ?, ?, ?)", values)
	} catch (e) {
		throw new Error(e);
	}
}



exports.linkToUPC = async (coinId, upc) => {
	try {
		var id = globals.mongoid.fetch();
		var values = [id, coinId, upc];
		return await globals.productPool.query("INSERT INTO coins_to_upc (id, coin_id, upc) VALUES (?, ?, ?)", values)
	} catch (e) {
		throw new Error(e);
	}
}



exports.linkToVendorSku = async (coinId, vendorId, vendorSku) => {
	try {
		var id = globals.mongoid.fetch();
		var values = [id, coinId, vendorId, vendorSku];
		return await globals.productPool.query("INSERT INTO coins_to_vendor_skus (id, coin_id, vendor_id, vendor_sku) VALUES (?, ?, ?, ?)", values)
	} catch (e) {
		throw new Error(e);
	}
}



exports.lookupParentCoin = (sku) => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT parent_id FROM coins c " +
			"LEFT JOIN coins_to_vendor_skus vs ON c.id = vs.coin_id " +
			"LEFT JOIN vendor_catalog_products p ON (vs.vendor_id = p.vendor_id) AND (vs.vendor_sku = p.vendor_sku) " +
			"WHERE p.variant_sku = ?";

		globals.productPool.query(sql, [sku])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.mergeCoins = async (origCoin, destCoin) => {
	try {
		var coinId = null;
		var conn = null;
		var parentId = null;


		//	Insert into all 3 tables all-or-nothing.
		conn = await globals.productPool.getConnection();
		await conn.beginTransaction();

		var result = await conn.query("UPDATE coins_to_upc SET coin_id = ? WHERE coin_id = ?", [destCoin, origCoin]);
		result = await conn.query("UPDATE coins_to_vendor_skus SET coin_id = ? WHERE coin_id = ?", [destCoin, origCoin]);
		result = await conn.query("UPDATE coins_to_manufacturer_mpn SET coin_id = ? WHERE coin_id = ?", [destCoin, origCoin]);
		result = await conn.query("DELETE FROM coins WHERE id = ?", [origCoin]);
		result = await conn.query("INSERT INTO coins_merge_history (merged_coin, merged_into_coin) VALUES (?, ?)", [origCoin, destCoin]);

		result = await globals.pool.query("UPDATE coins_to_vskus SET coin_id = ? WHERE coin_id = ?", [destCoin, origCoin]);

		await conn.commit();


		return {
			coinId: coinId,
			parentId: parentId
		};
	} catch (e) {
		conn.rollback();
		throw (e);
	} finally {
		globals.productPool.releaseConnection(conn);
	}
}



exports.getMergeHistory = (coinId) => {
	return new Promise((resolve, reject) => {

		var sql = "SELECT * FROM coins_merge_history WHERE merged_coin = ? OR merged_into_coin = ? ORDER BY date_created DESC";

		globals.productPool.query(sql, [coinId, coinId])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.unlinkFromVendorSku = async (coinId, vendorId, vendorSku) => {
	try {
		var values = [coinId, vendorId, vendorSku];
		return await globals.productPool.query("DELETE FROM coins_to_vendor_skus WHERE coin_id = ? AND vendor_id = ? and vendor_sku = ? ", values)
	} catch (e) {
		throw new Error(e);
	}
}



exports.updateMappingsById = async (id, product) => {
	var conn = null;

	try {

		conn = await globals.productPool.getConnection();
		await conn.beginTransaction();

		if (product.upc !== undefined) {
			await globals.productPool.query("UPDATE coins_to_upc SET upc = ? WHERE coin_id = ?", [product.upc, id]);
		}
		if ((product.manufacturer !== undefined) && (product.mpn !== undefined)) {
			await globals.productPool.query("UPDATE coins_to_manufacturer_mpn SET manufacturer = ?, mpn = ? WHERE coin_id = ?", [product.manufacturer, product.mpn, id]);
		}

		await conn.commit();

	} catch (e) {
		conn.rollback();
		throw (e);
	} finally {
		globals.productPool.releaseConnection(conn);
	}
}


exports.updateCoin = async (userId, id, body) => {
	var result = null;

	result = await globals.productPool.query("UPDATE coins SET listed_on_marketplace = ? WHERE id = ?", [body.listedOnMarketplace, id]);

	//	Log the change
	var change = await globals.productPool.query("INSERT INTO coins_change_log (user_id, coin_id, listed_flag) VALUES (?, ?, ?)", [userId, id, body.listedOnMarketplace]);

	if ((body.listedOn !== undefined) && (body.listedOn !== null)) {
		var platforms = await globals.productPool.query('SELECT id FROM listed_on');
		await globals.productPool.query('DELETE FROM coins_to_listed_on WHERE coin_id = ?', [id]);

		for (var i = 0; i < body.listedOn.length; i++) {
			if (_.findIndex(platforms, ['id', body.listedOn[i]]) === -1) {
				throw new Error('PTYPE');
			}
			await globals.productPool.query('INSERT INTO coins_to_listed_on (coin_id, listed_on_id) VALUES (?, ?)', [id, body.listedOn[i]]);

			await globals.productPool.query("INSERT INTO coins_change_log_listed_on (change_id, listed_on_id) VALUES (?, ?)", [change.insertId, body.listedOn[i]]);
		}
	}


	if ((body.notListedReasons !== undefined) && (body.notListedReasons !== null)) {
		var reasons = await globals.productPool.query('SELECT id FROM not_listed_reasons');
		await globals.productPool.query('DELETE FROM coins_to_not_listed_reasons WHERE coin_id = ?', [id]);

		for (var i = 0; i < body.notListedReasons.length; i++) {
			if (_.findIndex(reasons, ['id', body.notListedReasons[i]]) === -1) {
				throw new Error('PTYPE');
			}
			await globals.productPool.query('INSERT INTO coins_to_not_listed_reasons (coin_id, not_listed_reason_id) VALUES (?, ?)', [id, body.notListedReasons[i]]);

			await globals.productPool.query("INSERT INTO coins_change_log_not_listed_reasons (change_id, not_listed_reason_id) VALUES (?, ?)", [change.insertId, body.notListedReasons[i]]);
		}
	}



}



exports.getSuspectCOINs = async () => {

	var coins = await globals.productPool.query("SELECT date_created, upc, COUNT(*) AS num FROM coins_to_upc GROUP BY upc HAVING num > 1 ORDER BY num ASC");
	colUtils.outboundNaming(coins);

	return coins;
}


exports.getSuspectByUPC = async (upc) => {

	var coins = await globals.productPool.query("SELECT date_created, id, coin_id FROM coins_to_upc WHERE upc = ? ORDER BY date_created", [upc]);
	colUtils.outboundNaming(coins);

	return coins;
}


exports.getSuspectManuMPN = async (coins) => {
	var placeholders = '';

	for (var i = 0; i < coins.length; i++) {
		if (placeholders.length > 0) {
			placeholders += ', ';
		}

		placeholders += '?';
	}
	// console.log(mysql.format("SELECT * FROM coins_to_manufacturer_mpn WHERE coin_id in (" + placeholders + ") ORDER BY date_created", coins));
	var coins = await globals.productPool.query("SELECT * FROM coins_to_manufacturer_mpn WHERE coin_id in (" + placeholders + ") ORDER BY date_created", coins);
	colUtils.outboundNaming(coins);

	return coins;
}


exports.getSuspectVendorSkus = async (coins) => {
	var placeholders = '';

	for (var i = 0; i < coins.length; i++) {
		if (placeholders.length > 0) {
			placeholders += ', ';
		}

		placeholders += '?';
	}
	// console.log(mysql.format("SELECT * FROM coins_to_vendor_skus WHERE coin_id in (" + placeholders + ") ORDER BY date_created", coins));
	var coins = await globals.productPool.query("SELECT * FROM coins_to_vendor_skus WHERE coin_id in (" + placeholders + ") ORDER BY date_created", coins);
	colUtils.outboundNaming(coins);

	return coins;
}


exports.getSuspectCoin = async (coins) => {
	var placeholders = '';

	for (var i = 0; i < coins.length; i++) {
		if (placeholders.length > 0) {
			placeholders += ', ';
		}

		placeholders += '?';
	}

	// console.log(mysql.format("SELECT * FROM coins WHERE id in (" + placeholders + ") ORDER BY date_created", coins));
	var coins = await globals.productPool.query("SELECT * FROM coins WHERE id in (" + placeholders + ") ORDER BY date_created", coins);
	colUtils.outboundNaming(coins);

	return coins;
}


exports.deleteCoins = async (coins) => {
	var placeholders = '';

	for (var i = 0; i < coins.length; i++) {
		if (placeholders.length > 0) {
			placeholders += ', ';
		}

		placeholders += '?';
	}

	// console.log(mysql.format("SELECT * FROM coins WHERE id in (" + placeholders + ") ORDER BY date_created", coins));
	var result = await globals.productPool.query("DELETE FROM coins WHERE id in (" + placeholders + ")", coins);
	if (result.affectedRows !== coins.length) {
		console.log("*****  DELETE coins didn't affected expected rows");
	}
	result = await globals.productPool.query("DELETE FROM coins_to_upc WHERE coin_id in (" + placeholders + ")", coins);
	if (result.affectedRows !== coins.length) {
		console.log("*****  DELETE upc didn't affected expected rows");
	}
	result = await globals.productPool.query("DELETE FROM coins_to_manufacturer_mpn WHERE coin_id in (" + placeholders + ")", coins);
	if (result.affectedRows !== coins.length) {
		console.log("*****  DELETE mpn didn't affected expected rows");
	}
	result = await globals.productPool.query("DELETE FROM coins_to_vendor_skus WHERE coin_id in (" + placeholders + ")", coins);
	if (result.affectedRows !== coins.length) {
		console.log("*****  DELETE vendorSkus didn't affected expected rows");
	}
	return;
}


exports.deleteCoin = async (id) => {
	var result = await globals.productPool.query("DELETE FROM coins WHERE id = ?", [id]);
}


exports.deleteUpc = async (id) => {
	var result = await globals.productPool.query("DELETE FROM coins_to_upc WHERE id = ?", [id]);
}


exports.deleteVendorSku = async (id) => {
	var result = await globals.productPool.query("DELETE FROM coins_to_vendor_skus WHERE id = ?", [id]);
}


exports.pruneCoinCopyActives = async () => {
	await globals.pool.query(`DELETE FROM coins_to_vskus_active WHERE date_created < DATE_ADD(NOW(), INTERVAL -7 DAY)`);
}


exports.timeoutCoinCopyActives = async (timeoutHours) => {
	await globals.pool.query(`UPDATE coins_to_vskus_active SET status = 'TIMEOUT' WHERE status = 'BUILDING' AND date_created < DATE_ADD(NOW(), INTERVAL -? HOUR)`, [timeoutHours]);
}


exports.getCoinCopyActives = async () => {
	var rows = await globals.pool.query(`SELECT * FROM coins_to_vskus_active WHERE status = 'BUILDING'`);
	colUtils.outboundNaming(rows);
	return rows;
}

exports.createCoreleapTemp = async (uuid) => {
	var result = await globals.pool.query(`DROP TABLE IF EXISTS coins_to_vskus_temp_${uuid}`);
	result = await globals.pool.query(`CREATE TABLE coins_to_vskus_temp_${uuid} LIKE coins_to_vskus`);

	await globals.pool.query(`INSERT INTO coins_to_vskus_active (temp_name, uuid) VALUES ('coins_to_vskus_temp_${uuid}', '${uuid}')`);

	return result;
}


exports.getTempCount = async (uuid) => {
	var count = await globals.pool.query(`SELECT COUNT(*) AS num FROM coins_to_vskus_temp_${uuid}`);

	return count;
}

exports.swapCoreleapTemp = async (uuid) => {
	var result = await globals.pool.query(`DROP TABLE IF EXISTS coins_to_vskus_previous`);
	result = await globals.pool.query(`RENAME TABLE coins_to_vskus TO coins_to_vskus_previous`);
	result = await globals.pool.query(`RENAME TABLE coins_to_vskus_temp_${uuid} TO coins_to_vskus`);

	await globals.pool.query(`UPDATE coins_to_vskus_active SET status = 'COPIED', date_finished = NOW() WHERE uuid = '${uuid}'`);

	return result;
}


exports.getCoinCopyChunk = async (offset, limit) => {
	var sql = "SELECT c.coin_id, c2.listed_on_marketplace, c.vendor_id, c.vendor_sku, v.name, v.rating " +
		"FROM coins_to_vendor_skus c " +
		"LEFT JOIN coins c2 ON c2.id = c.coin_id " +
		"LEFT JOIN vendors v ON v.id = c.vendor_id " +
		"LIMIT ?,?";

	var result = await globals.productROPool.query(sql, [offset, limit]);

	for (var i = 0; i < result.length; i++) {
		var listedOn = await globals.productROPool.query("SELECT lo.id, lo.platform FROM coins_to_listed_on clo LEFT JOIN listed_on lo ON clo.listed_on_id = lo.id WHERE clo.coin_id = ?", [result[i].coin_id]);
		var reasons = await globals.productROPool.query("SELECT nlr.id, nlr.reason FROM coins_to_not_listed_reasons cnlr LEFT JOIN not_listed_reasons nlr ON cnlr.not_listed_reason_id = nlr.id WHERE cnlr.coin_id = ?", [result[i].coin_id]);

		result[i].listed_on_ids = '';
		result[i].not_listed_reason_ids = '';

		for (var j = 0; j < listedOn.length; j++) {
			if (result[i].listed_on_ids.length > 0) {
				result[i].listed_on_ids += ',';
			}
			result[i].listed_on_ids += listedOn[j].id;
		}
		for (var j = 0; j < reasons.length; j++) {
			if (result[i].not_listed_reason_ids.length > 0) {
				result[i].not_listed_reason_ids += ',';
			}
			result[i].not_listed_reason_ids += reasons[j].id;
		}
	}
	return result;
}


exports.writeCoinCopyChunk = async (uuid, rows) => {
	var sql = `INSERT INTO coins_to_vskus_temp_${uuid} (coin_id, listed_on_marketplace, vendor_id, vendor_sku, vendor_name, rating, listed_on_ids, not_listed_reason_ids) VALUES `;
	var values = [];

	for (var i = 0; i < rows.length; i++) {
		sql += "(?, ?, ?, ?, ?, ?, ?, ?)";
		if (i < (rows.length - 1)) {
			sql += ", ";
		}
		values.push(rows[i].coin_id);
		values.push(rows[i].listed_on_marketplace);
		values.push(rows[i].vendor_id);
		values.push(rows[i].vendor_sku);
		values.push(rows[i].name);
		values.push(rows[i].rating);
		values.push(rows[i].listed_on_ids);
		values.push(rows[i].not_listed_reason_ids);
	}


	// console.log(mysql.format(sql, values));
	var result = await globals.pool.query(sql, values);
	return result;
}



exports.getGeoByCoin = async (coin, sku, onlineQuickSale) => {
	var rows = [];
	var whereClause = '';
	var vskus = {
		clause: '',
		values: []
	};

	if ((onlineQuickSale === 'Y') || (coin === '')) {
		whereClause = `WHERE (status = 'Live') AND (online_shopping = 'Y') 
											AND (p.online_quick_sale = 'Y') 
											AND (m.manifest_source != 'DS')
											AND sku = ${sku} 
											AND lat IS NOT NULL 
											AND lng IS NOT NULL`;
	} else {
		vskus = await buildVendorSkusByCoin(coin);
		whereClause = `WHERE (status = 'Live') 
											AND (online_shopping = 'Y') 
											AND (p.online_quick_sale = 'N') 
											AND (m.manifest_source != 'DS')
											AND ( ${vskus.clause} ) 
											AND lat IS NOT NULL 
											AND lng IS NOT NULL`;

	}


	var sql = `SELECT lat, lng 
						FROM stores s
							LEFT JOIN products p ON p.store_id = s.store_id
							LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
						${whereClause}
						GROUP BY lat, lng`;

	// console.log(mysql.format(sql, vskus.values));

	rows = await globals.pool.query(sql, vskus.values);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getGeoByCoinDS = async (coin, sku, onlineQuickSale) => {
	var latLong = [];
	var rows = [];
	var whereClause = '';
	var vskus = {
		clause: '',
		values: []
	};

	if ((onlineQuickSale === 'Y') || (coin === '')) {
		whereClause = `WHERE (status = 'Live') AND (online_shopping = 'Y') 
											AND (p.online_quick_sale = 'Y') 
											AND (m.manifest_source = 'DS')
											AND sku = ${sku} `;
	} else {
		vskus = await buildVendorSkusByCoin(coin);
		whereClause = `WHERE (status = 'Live') 
											AND (online_shopping = 'Y') 
											AND (p.online_quick_sale = 'N') 
											AND (m.manifest_source = 'DS')
											AND ( ${vskus.clause} ) `;

	}


	//	Get vendors that correspond to DS products for this COIN
	var sql = `SELECT vendor_id
							FROM products p 
								LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
						${whereClause}
						GROUP BY vendor_id`;

	// console.log(mysql.format(sql, vskus.values));
	var vendors = [];
	var vendorPlaceholders = '';

	// console.log(mysql.format(sql, vskus.values));
	var vendorRows = await globals.pool.query(sql, vskus.values);

	for (var i = 0; i < vendorRows.length; i++) {
		if (vendorPlaceholders.length > 0) {
			vendorPlaceholders += ', ';
		}

		vendorPlaceholders += '?';
		vendors.push(vendorRows[i].vendor_id);
	}

	if (vendorPlaceholders.length > 0) {
		sql = `SELECT warehouse1_lat, warehouse1_long, warehouse2_lat, warehouse2_long, warehouse3_lat, warehouse3_long
						FROM vendors
						WHERE id IN (${vendorPlaceholders})`;

		// console.log(mysql.format(sql, vendors));
		rows = await globals.productROPool.query(sql, vendors);
		colUtils.outboundNaming(rows);

		for (var i = 0; i < rows.length; i++) {
			if ((rows[i].warehouse1Lat !== null) && (rows[i].warehouse1Long !== null)) {
				latLong.push({
					lat: rows[i].warehouse1Lat,
					lng: rows[i].warehouse1Long
				});
			}
			if ((rows[i].warehouse2Lat !== null) && (rows[i].warehouse2Long !== null)) {
				latLong.push({
					lat: rows[i].warehouse2Lat,
					lng: rows[i].warehouse2Long
				});
			}
			if ((rows[i].warehouse3Lat !== null) && (rows[i].warehouse3Long !== null)) {
				latLong.push({
					lat: rows[i].warehouse3Lat,
					lng: rows[i].warehouse3Long
				});
			}
		}
	}

	return latLong;
}



var buildVendorSkusByCoin = async (coin) => {
	var sql = `SELECT p.product_name, p.upc, p.vendor_id, p.vendor_sku
								FROM vendors.vendor_catalog_products p 
									LEFT JOIN vendors.coins_to_vendor_skus c ON ((c.vendor_id = p.vendor_id) AND (c.vendor_sku = p.vendor_sku)) 
								WHERE c.coin_id = ?`;
	var values = [];
	// console.log(sql, [coin]);
	var vskus = await globals.productROPool.query(sql, [coin]);

	if (vskus.length > 0) {

		var vSkuClause = '';
		for (var i = 0; i < vskus.length; i++) {
			if (vSkuClause.length > 0) {
				vSkuClause += " OR ";
			}
			vSkuClause += "(m.vendor_id = ? AND seller_product_id = ?)"
			values.push(vskus[i].vendor_id);
			values.push(vskus[i].vendor_sku);
		}

		return {
			clause: vSkuClause,
			values: values
		};
	}
}



exports.getQuantityByCategory = async () => {
	var rows = [];

	var sql = `SELECT c.category_id, c.name, COUNT(DISTINCT(e.coin_id)) AS quantity
								FROM metro_sku_eligibility e
									LEFT JOIN categories c ON c.category_id = e.category_id 
									LEFT JOIN products p ON e.sku = p.sku
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status = 'Live' AND p.online_shopping = 'Y'
									AND p.online_quick_sale = 'N' 
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'  
								GROUP BY c.name
								ORDER BY c.name`;

	// console.log(mysql.format(sql));

	rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getDropshipQuantityByCategory = async () => {
	var rows = [];

	var sql = `SELECT c.category_id, c.name, COUNT(DISTINCT(e.coin_id)) AS quantity
								FROM metro_sku_eligibility e
									LEFT JOIN categories c ON c.category_id = e.category_id 
									LEFT JOIN products p ON e.sku = p.sku
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status = 'Live' AND p.online_shopping = 'Y'
									AND p.online_quick_sale = 'N' 
									AND m.manifest_source = 'DS' 
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'  
								GROUP BY c.name
								ORDER BY c.name`;

	// console.log(mysql.format(sql));

	rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getNonDropshipQuantityByCategory = async () => {
	var rows = [];

	var sql = `SELECT c.category_id, c.name, COUNT(DISTINCT(e.coin_id)) AS quantity
								FROM metro_sku_eligibility e
									LEFT JOIN categories c ON c.category_id = e.category_id 
									LEFT JOIN products p ON e.sku = p.sku
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status = 'Live' AND p.online_shopping = 'Y'
									AND p.online_quick_sale = 'N' 
									AND m.manifest_source != 'DS' 
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'  
								GROUP BY c.name
								ORDER BY c.name`;

	// console.log(mysql.format(sql));

	rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getDropshipQuantityByCategoryByCity = async () => {
	var rows = [];

	var sql = `SELECT t.city, c.category_id, c.name, COUNT(DISTINCT(e.coin_id)) AS quantity
								FROM metro_sku_eligibility e
									LEFT JOIN targeted_cities t ON t.id = e.dest_city_id
									LEFT JOIN categories c ON c.category_id = e.category_id 
									LEFT JOIN products p ON e.sku = p.sku
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status = 'Live' AND p.online_shopping = 'Y'
									AND p.online_quick_sale = 'N' 
									AND m.manifest_source = 'DS' 
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'  
								GROUP BY city, c.name
								ORDER BY t.city, c.name`;

	// console.log(mysql.format(sql));

	rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getNonDropshipQuantityByCategoryByCity = async () => {
	var rows = [];

	var sql = `SELECT t.city, c.category_id, c.name, COUNT(DISTINCT(e.coin_id)) AS quantity
								FROM metro_sku_eligibility e
									LEFT JOIN targeted_cities t ON t.id = e.dest_city_id
									LEFT JOIN categories c ON c.category_id = e.category_id 
									LEFT JOIN products p ON e.sku = p.sku
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status = 'Live' AND p.online_shopping = 'Y'
									AND p.online_quick_sale = 'N' 
									AND m.manifest_source != 'DS' 
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'  
								GROUP BY city, c.name
								ORDER BY t.city, c.name`;

	// console.log(mysql.format(sql));

	rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getDropshipQuantityByVendorByCity = async () => {
	var rows = [];

	var sql = `SELECT t.city, e.vendor_id, vs.name, COUNT(DISTINCT(e.coin_id)) AS quantity
								FROM metro_sku_eligibility e
									LEFT JOIN targeted_cities t ON t.id = e.dest_city_id
									LEFT JOIN vendors_summary vs ON vs.id = e.vendor_id
									LEFT JOIN products p ON e.sku = p.sku
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status = 'Live' AND p.online_shopping = 'Y'
									AND p.online_quick_sale = 'N' 
									AND m.manifest_source = 'DS' 
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'  
								GROUP BY city, vs.name
								ORDER BY t.city, vs.name`;

	// console.log(mysql.format(sql));

	rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getNonDropshipQuantityByVendorByCity = async () => {
	var rows = [];

	var sql = `SELECT t.city, e.vendor_id, vs.name, COUNT(DISTINCT(e.coin_id)) AS quantity
								FROM metro_sku_eligibility e
									LEFT JOIN targeted_cities t ON t.id = e.dest_city_id
									LEFT JOIN vendors_summary vs ON vs.id = e.vendor_id
									LEFT JOIN products p ON e.sku = p.sku
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status = 'Live' AND p.online_shopping = 'Y'
									AND p.online_quick_sale = 'N' 
									AND m.manifest_source != 'DS' 
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'  
									GROUP BY city, vs.name
									ORDER BY t.city, vs.name `;

	// console.log(mysql.format(sql));

	rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getQuantityByVendor = async () => {
	var rows = [];

	var sql = `SELECT e.vendor_id, vs.name, COUNT(DISTINCT(e.coin_id)) AS quantity
								FROM metro_sku_eligibility e
									LEFT JOIN vendors_summary vs ON vs.id = e.vendor_id
									LEFT JOIN products p ON e.sku = p.sku
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status = 'Live' AND p.online_shopping = 'Y'
									AND p.online_quick_sale = 'N' 
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'  
								GROUP BY vs.name
								ORDER BY vs.name`;

	// console.log(mysql.format(sql));

	rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getDropshipQuantityByVendor = async () => {
	var rows = [];

	var sql = `SELECT e.vendor_id, vs.name, COUNT(DISTINCT(e.coin_id)) AS quantity
								FROM metro_sku_eligibility e
									LEFT JOIN vendors_summary vs ON vs.id = e.vendor_id
									LEFT JOIN products p ON e.sku = p.sku
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status = 'Live' AND p.online_shopping = 'Y'
									AND p.online_quick_sale = 'N' 
									AND m.manifest_source = 'DS' 
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'  
								GROUP BY vs.name
								ORDER BY vs.name`;

	// console.log(mysql.format(sql));

	rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getNonDropshipQuantityByVendor = async () => {
	var rows = [];

	var sql = `SELECT e.vendor_id, vs.name, COUNT(DISTINCT(e.coin_id)) AS quantity
								FROM metro_sku_eligibility e
									LEFT JOIN vendors_summary vs ON vs.id = e.vendor_id
									LEFT JOIN products p ON e.sku = p.sku
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
								WHERE p.status = 'Live' AND p.online_shopping = 'Y'
									AND p.online_quick_sale = 'N' 
									AND m.manifest_source != 'DS' 
									AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'  
								GROUP BY vs.name
								ORDER BY vs.name`;

	// console.log(mysql.format(sql));

	rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}




exports.getCrossListings = async (whereInfo, offset, limit) => {
	var rows = [];
	var sql = `SELECT p.name as product_name, cc.id, cc.coin_id,
										cm.category_id as primary_category_id, pri_c.name AS primary_cat2, pri_parent.name AS primary_cat1, 
										cc.category_id as cross_list_category_id, sec_c.name AS cross_list_cat2, sec_parent.name AS cross_list_cat1
								FROM products p
									LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
									LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
									LEFT JOIN categories pri_c ON pri_c.category_id = cm.category_id 
									LEFT JOIN categories pri_parent ON pri_c.parent_id = pri_parent.category_id
									LEFT JOIN coins_to_vskus v ON ((v.vendor_id = m.vendor_id) AND (v.vendor_sku = p.seller_product_id)) 
									LEFT JOIN coins_to_categories cc ON v.coin_id = cc.coin_id
									LEFT JOIN categories sec_c ON sec_c.category_id = cc.category_id
									LEFT JOIN categories sec_parent ON sec_c.parent_id = sec_parent.category_id
								${whereInfo.clause}  AND cc.coin_id IN (SELECT coin_id FROM coins_to_categories)
								GROUP BY cc.coin_id
								ORDER BY p.date_created DESC
								LIMIT ?, ?`;

	whereInfo.values.push(offset);
	whereInfo.values.push(limit);
	console.log(mysql.format(sql, whereInfo.values));
	rows = await globals.pool.query(sql, whereInfo.values);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getCrossListingsByCoinId = async (coinId) => {
	var rows = [];
	var sql = `SELECT p.name as product_name, cc.id, cc.coin_id,
								cm.category_id as primary_category_id, pri_c.name AS primary_cat2, pri_parent.name AS primary_cat1, 
								cc.category_id as cross_list_category_id, sec_c.name AS cross_list_cat2, sec_parent.name AS cross_list_cat1,
								sec_c.front_end_space as cross_list_space, sec_c.front_end_name as cross_list_name
						FROM products p
							LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
							LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
							LEFT JOIN categories pri_c ON pri_c.category_id = cm.category_id 
							LEFT JOIN categories pri_parent ON pri_c.parent_id = pri_parent.category_id
							LEFT JOIN coins_to_vskus v ON ((v.vendor_id = m.vendor_id) AND (v.vendor_sku = p.seller_product_id)) 
							LEFT JOIN coins_to_categories cc ON v.coin_id = cc.coin_id
							LEFT JOIN categories sec_c ON sec_c.category_id = cc.category_id
							LEFT JOIN categories sec_parent ON sec_c.parent_id = sec_parent.category_id
						WHERE cc.coin_id IN (SELECT coin_id FROM coins_to_categories)
									AND cc.coin_id = ?
								GROUP BY cc.coin_id
								ORDER BY p.date_created DESC`;

	rows = await globals.pool.query(sql, coinId);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getCrossListingsById = async (id) => {
	var rows = [];
	var sql = `SELECT p.name as product_name, cc.id, cc.coin_id,
								cm.category_id as primary_category_id, pri_c.name AS primary_cat2, pri_parent.name AS primary_cat1, 
								cc.category_id as cross_list_category_id, sec_c.name AS cross_list_cat2, sec_parent.name AS cross_list_cat1
						FROM products p
							LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
							LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
							LEFT JOIN categories pri_c ON pri_c.category_id = cm.category_id 
							LEFT JOIN categories pri_parent ON pri_c.parent_id = pri_parent.category_id
							LEFT JOIN coins_to_vskus v ON ((v.vendor_id = m.vendor_id) AND (v.vendor_sku = p.seller_product_id)) 
							LEFT JOIN coins_to_categories cc ON v.coin_id = cc.coin_id
							LEFT JOIN categories sec_c ON sec_c.category_id = cc.category_id
							LEFT JOIN categories sec_parent ON sec_c.parent_id = sec_parent.category_id
						WHERE cc.coin_id IN (SELECT coin_id FROM coins_to_categories)
									AND cc.id = ?
								GROUP BY cc.coin_id
								ORDER BY p.date_created DESC`;

	rows = await globals.pool.query(sql, id);
	colUtils.outboundNaming(rows);

	return rows;
}


exports.createCrossListing = async (coinId, categoryId) => {
	var r = {
		status: 201,
		id: 0,
		coinId: coinId
	}

	var coin = await this.getById(coinId);
	if (coin.coin.length === 0) {
		r.status = 404;
	} else {
		var rows = await this.getCrossListingsByCoinId(coinId);
		if (rows.length > 0) {
			r.id = rows[0].id;
			r.status = 409;
		} else {
			var id = globals.mongoid.fetch();

			var sql = `INSERT INTO coins_to_categories (id, coin_id, category_id) VALUES (?, ?, ?)`;

			var result = await globals.pool.query(sql, [id, coinId, categoryId]);

			r.id = id;
		}
	}

	return r;
}



exports.updateCrossListing = async (id, categoryId) => {
	var r = {
		status: 200,
		id: id,
		coinId: null
	}

	var rows = await this.getCrossListingsById(id);
	if (rows.length === 0) {
		r.status = 404;
	} else {
		r.coinId = rows[0].coinId;

		var sql = `UPDATE coins_to_categories SET date_modified = now(), category_id = ? WHERE id = ?`;

		var result = await globals.pool.query(sql, [categoryId, id]);

		r.status = 200;
	}

	return r;
}


exports.deleteCrossListing = async (id) => {
	var r = {
		status: 200,
		id: id,
		coinId: null
	}

	var rows = await this.getCrossListingsById(id);
	if (rows.length === 0) {
		r.status = 404;
	} else {
		r.coinId = rows[0].coinId;

		var result = await globals.pool.query(`DELETE FROM coins_to_categories WHERE id = ?`, [id]);

		if (result.affectedRows === 1) {
			r.status = 200;
		} else {
			r.status = 404;
		}
	}
	
	return r;
}

exports.getVendorNamesBySkus = async (skus) => {
	var names = await globals.pool.query(`SELECT GROUP_CONCAT(DISTINCT v.name ORDER BY v.name SEPARATOR '|') as vendor_names 
																					FROM products p 
																						LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
																						LEFT JOIN vendors_summary v ON m.vendor_id = v.id
																					WHERE p.sku IN (${skus})`);

	colUtils.outboundNaming(names);

	return names;
}