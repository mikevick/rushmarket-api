'use strict';

const mysql = require('promise-mysql');
const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.getAll = async (whereInfo, offset, limit) => {
    var prom = [];
    var resp = {
      totalCount: 0,
      vendorSkus: []
		};
		
    // var countSql = 'SELECT count(*) as num FROM vendor_catalog_products p ' + whereInfo.clause
    var countSql = 'SELECT count(*) as num ' +
                  'FROM vendor_catalog_products p ' + whereInfo.clause;
    var sql = `SELECT p.vendor_sku, p.vendor_id, c.listed_on_marketplace 
                  FROM vendor_catalog_products p
                    LEFT JOIN coins_to_vendor_skus v ON ((p.vendor_id = v.vendor_id) AND (p.vendor_sku = v.vendor_sku))
                    LEFT JOIN coins c ON c.id = v.coin_id ` + whereInfo.clause;

		// console.log(countSql, JSON.stringify(whereInfo, undefined, 2));
		console.log(mysql.format(sql, whereInfo.values));
		
    var count = await globals.productPool.query(countSql, whereInfo.values);
    resp.totalCount = count[0].num;
    sql = sql + ' ORDER BY vendor_sku ASC';
    if (offset !== undefined) {
      whereInfo.values.push(offset);
      whereInfo.values.push(limit);
      sql = sql + ' LIMIT ?,?';
    }

    var rows = await globals.productPool.query(sql, whereInfo.values);
    resp.products = rows;
    colUtils.outboundNaming(resp.products);
    for (var i=0; i < resp.products.length; i++) {
      if (resp.products[i].listedOnMarketplace) {
        resp.products[i].listedOnMarketplace = true;
      }
      else {
        resp.products[i].listedOnMarketplace = false;
      }
    }
  

    return resp;
}



exports.getByVendor = async (vendorId, vendorSku) => {
  return new Promise((resolve, reject) => {
    var sql = 'SELECT *  ' +
                  'FROM vendor_catalog_products  WHERE vendor_id = ? AND vendor_sku = ? ';

    globals.productPool.query(sql, [vendorId, vendorSku])
      .then((rows) => {
        colUtils.outboundNaming(rows);

        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      })
  })
}

