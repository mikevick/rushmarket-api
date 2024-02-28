'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');


exports.updateProductPriceBySku = async (sku, setInfo) => {
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

exports.createProductPricingLog = async (conn, userId, userType, sku, priceFrom, priceTo, pricingTypeIdFrom, pricingTypeIdTo) => {
  const connection = conn || globals.pool;
  let sql = `INSERT INTO product_pricing_log (
      user_id,
      user_type,
      sku, 
      price_from, 
      price_to, 
      pricing_type_id_from, 
      pricing_type_id_to
    )
    VALUES (?,?,?,?,?,?,?)`;
  let values = [userId, userType, sku, priceFrom, priceTo, pricingTypeIdFrom, pricingTypeIdTo];
  await connection.query(sql, values);
}
