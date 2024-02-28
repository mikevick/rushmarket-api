'use strict';

const _ = require('lodash');
const mysql = require('promise-mysql');

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');

const Vendors = require('../models/vendors');


exports.getSTSProductsForSale = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT m.vendor_id, p.seller_product_id, p.sku, p.name, count(*) as rm_quantity " +
													"FROM products p LEFT JOIN manifests m ON m.manifest_id = p.manifest_id " + 
													"WHERE p.status IN ('Publish', 'Active', 'Live') AND m.manifest_source IN ('STS', 'DS') " +
													"GROUP BY p.seller_product_id " +
													"ORDER BY p.seller_product_id")
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getVendorSkuByRushSku = (rushSku) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT m.vendor_id, p.seller_product_id " +
													"FROM products p LEFT JOIN manifests m ON p.manifest_id = m.manifest_id " +
													"WHERE p.sku = ?", [rushSku])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  };

  let selectCountSql = `SELECT COUNT(*) AS num
        FROM manifests m  
          LEFT JOIN manifest_receiving mr ON m.manifest_id = mr.manifest_id
          LEFT JOIN stores s ON m.store_id = s.store_id
          LEFT JOIN stores s2 ON s2.store_id = mr.received_store_id
          LEFT JOIN manifest_sellers ms ON ms.manifest_seller_id = m.manifest_seller_id
    ${whereInfo.clause}`;
  let values = whereInfo.values;

  // console.log(mysql.format(selectCountSql, values))
  let selectCountResult = await globals.poolRO.query(selectCountSql, values);
  resp.totalCount = (selectCountResult.length && selectCountResult[0].num) ? selectCountResult[0].num : 0;
  
  let selectSql = `SELECT 
      m.archived, 
      m.check_in_note, 
      CONVERT_TZ(m.date_created, '+00:00', '${process.env.UTC_OFFSET}') as date_created,
      m.date_purchased,
      m.expected_delivery_date, 
      m.manifest_id, 
      m.manifest_identifier,
      m.manifest_seller_id, 
      m.manifest_source, 
      m.manifest_type, 
      m.origin_city, 
      m.origin_state, 
      m.pallet, 
      m.product_cost,
      m.received,
      m.shipping_cost, 
      m.store_id, 
      m.vendor_id,
      m.check_in_note,
      m.default_product_condition,
      mr.issue, 
      mr.issue_detail,       
      mr.manifest_receiving_id,
      mr.received_by,
      CONVERT_TZ(mr.received_date, '+00:00', '${process.env.UTC_OFFSET}') as received_date,
      mr.received_store_id, 
      ms.manifest_seller,
      s2.store_name as received_at_store_name,
      s.* 
    FROM manifests m
      LEFT JOIN manifest_receiving mr ON m.manifest_id = mr.manifest_id
      LEFT JOIN stores s ON m.store_id = s.store_id
      LEFT JOIN stores s2 ON s2.store_id = mr.received_store_id
      LEFT JOIN manifest_sellers ms ON ms.manifest_seller_id = m.manifest_seller_id
    ${whereInfo.clause} 
    ORDER BY ${sortBy} 
    LIMIT ?,?`;
  values.push(offset);
  values.push(limit);

  let rows = await globals.poolRO.query(selectSql, values);
  colUtils.outboundNaming(rows);

  await prefixLookup(rows);

  resp.rows = rows;
  return resp;
}

exports.getById = async (id) => {
  let resp = {
    rows: []
  };
  let values = [id];
  let selectByIdSql = `SELECT 
      m.archived, 
      m.check_in_note, 
      CONVERT_TZ(m.date_created, '+00:00', '${process.env.UTC_OFFSET}') as date_created,
      m.date_purchased,
      m.expected_delivery_date, 
      m.manifest_id, 
      m.manifest_identifier,
      m.manifest_seller_id, 
      m.manifest_source, 
      m.manifest_type, 
      m.origin_city, 
      m.origin_state, 
      m.pallet, 
      m.product_cost,
      m.received,
      m.shipping_cost, 
      m.store_id, 
      m.vendor_id,
      m.default_product_condition,
      mr.issue, 
      mr.issue_detail,       
      mr.manifest_receiving_id,
      mr.received_by,
      CONVERT_TZ(mr.received_date, '+00:00', '${process.env.UTC_OFFSET}') as received_date,
      mr.received_store_id, 
      ms.manifest_seller,
      s2.store_name as received_at_store_name,
      s.*, 
      COUNT(sp.product_id) as line_count
    FROM manifests m
      LEFT JOIN staging_product sp ON sp.manifest_id = m.manifest_id
      LEFT JOIN manifest_receiving mr ON mr.manifest_id = m.manifest_id
      LEFT JOIN stores s ON m.store_id = s.store_id
      LEFT JOIN stores s2 ON s2.store_id = mr.received_store_id
      LEFT JOIN manifest_sellers ms ON ms.manifest_seller_id = m.manifest_seller_id
    WHERE m.manifest_id = ? `;
  let rows = await globals.poolRO.query(selectByIdSql, values);
  colUtils.outboundNaming(rows);

  await prefixLookup(rows);

  resp.rows = rows;
  return resp;
}


var prefixLookup = async (rows) => {
  var vendorWhereInfo = {
    join: '',
    clause: 'WHERE 1=1',
    values: []
  };

  let prefixes = await Vendors.getAll(vendorWhereInfo, 0, 1000000);

  for (let i = 0; i < rows.length; i++) {
    let vendor = _.find(prefixes.vendors, function (v) {
      return v.id === rows[i].vendorId;
    });

    if (vendor) {
      rows[i].vendorPrefixes = vendor.prefixes;
    }
    else {
      rows[i].vendorPrefixes = [];
    }
  }

}


exports.getRBRByVendorId = async (vendorId) => {
  let values = [vendorId];
  let selectByIdSql = `SELECT * FROM manifests
    WHERE vendor_id = ? AND manifest_source = 'RBR' and manifest_type = 'Purchase'`;
  let rows = await globals.poolRO.query(selectByIdSql, values);
  colUtils.outboundNaming(rows);
  return rows;
}


exports.getByRushSku = async (sku) => {
  let values = [sku];
  let selectByIdSql = `SELECT p.store_id as product_store_id, p.seller_product_id, p.condition_name, p.ship_type as product_ship_type, m.* FROM manifests m LEFT JOIN products p ON p.manifest_id = m.manifest_id
                          WHERE p.sku = ?`;
  let rows = await globals.poolRO.query(selectByIdSql, values);
  colUtils.outboundNaming(rows);
  return rows;
}


exports.createRBRManifest = async (storeId, vendor) => {
  let sql = `INSERT INTO manifests 
                (manifest_type, manifest_source, manifest_seller_id, vendor_id, pallet, manifest_identifier, shipping_cost, product_cost, store_id)
                VALUES ('Purchase', 'RBR', 1, ?, 1, ?, 0, 0, ?)`;

  let manifestId = `RBR-${vendor.manifestId}`.replace(/ /g, "_");
  let result = await globals.pool.query(sql, [vendor.id, manifestId, storeId ? storeId : 104]);
  return result;
}


