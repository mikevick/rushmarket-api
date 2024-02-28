'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');


exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let prom = [];
  let resp = {
    totalRows: 0,
    rows: []
  }
  let countSql = `SELECT COUNT(*) AS num 
    FROM staging_product 
    ${whereInfo.clause}`;
  let sql = `SELECT * 
    FROM staging_product 
    ${whereInfo.clause}`;
  prom.push(globals.poolRO.query(countSql, whereInfo.values));  
  prom.push(globals.poolRO.query(sql, whereInfo.values));
  let results = Promise.all(prom);
  resp.totalRows = results[0][0].num;
  resp.rows = results[1];
  return resp;
}

exports.getById = async (productId) => {
  let sql = `SELECT * 
    FROM staging_product
    WHERE product_id = ?`;
  let values = [productId];
  let rows = await globals.poolRO.query(sql, values);
  return rows;
}

exports.getZeroPriceStagingProductsBySku = async (sku) => {
  let sql = `SELECT s.*, p.staging_product_id
    FROM products p, staging_product s
    WHERE p.seller_product_id = s.seller_product_id
      AND p.manifest_id = s.manifest_id
      AND p.sku = ?
      AND s.price = 0.00`;
  let values = [sku];
  let rows = await globals.poolRO.query(sql, values);
  return rows;
}

exports.updateStagingProductByProductId = async (productId, setInfo) => {
  let sql = `UPDATE staging_product 
    ${setInfo.clause} 
    WHERE product_id = ?`;
  setInfo.values.push(productId);
  let updateResult = await globals.pool.query(sql, setInfo.values);
}

exports.updateStagingProductBySellerProductId = async (vendorSku, setInfo) => {
  let resp = {
    rows: []
  };
  setInfo.values.push(vendorSku);
  let updateSql = `UPDATE staging_product 
      ${setInfo.clause} 
    WHERE seller_product_id = ?`;
  let sql = `SELECT * 
    FROM staging_product
    WHERE seller_product_id = ?`;
  let updateResult = await globals.pool.query(updateSql, setInfo.values);
  if (updateResult.affectedRows) {
    let rows = await globals.poolRO.query(sql, [vendorSku]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}



exports.getByManifestAndFilter = async (manifestId, filter, storeIdList) => {
  let values = [manifestId];
  let sql = `SELECT * FROM staging_product WHERE manifest_id = ? `;

  if (filter) {
    sql += ` AND ((seller_product_id LIKE ?) OR (upc LIKE ?) OR (mpn LIKE ?))`
    values.push(`%${filter}%`);
    values.push(`%${filter}%`);
    values.push(`%${filter}%`);
  }

  if (storeIdList && storeIdList.length) {
    sql += ` AND destination_store_id IN (${storeIdList})`
  }
  
  // console.log(mysql.format(sql, values));
  let rows = await globals.poolRO.query(sql, values);
  colUtils.outboundNaming(rows);
  return rows;
}


exports.getByManifestAndVSku = async (manifestId, vendorSku) => {
  let values = [manifestId, vendorSku];
  let sql = `SELECT * FROM staging_product WHERE manifest_id = ? AND seller_product_id = ?`;

  // console.log(mysql.format(sql, values));
  let rows = await globals.poolRO.query(sql, values);
  colUtils.outboundNaming(rows);
  return rows;
}

