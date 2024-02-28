'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');


exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let prom = [];
  let sql = `SELECT * 
    FROM product_pricing_types 
    ${whereInfo.clause}`;
  prom.push(globals.poolRO.query(sql, whereInfo.values));
  let results = Promise.all(prom);
  return results[0];
}

exports.getById = async (pricingTypeId) => {
  let sql = `SELECT * 
    FROM product_pricing_types
    WHERE pricing_type_id = ?`;
  let values = [pricingTypeId];
  let rows = await globals.poolRO.query(sql, values);
  return rows;
}

exports.updatePricingTypeById = async (sku, setInfo) => {
  let resp = {
    rows: []
  };
  setInfo.values.push(sku);
  let updateSql = `UPDATE products 
      ${setInfo.clause}, 
      date_modified = NOW() 
    WHERE sku = ?`;
  let sql = `SELECT sku, msrp, market_price, price, pricing_type_id, disposal_fee, in_market_exclusive 
    FROM products
    WHERE sku = ?`;
  let updateResult = await globals.pool.query(updateSql, setInfo.values);
  if (updateResult.affectedRows) {
    let rows = await globals.poolRO.query(sql, [sku]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}
