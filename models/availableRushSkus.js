'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');

exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  };
  let selectSql = `SELECT *
    FROM skus 
    ${whereInfo.clause} 
    ORDER BY ${sortBy} 
    LIMIT ?,?`;
  whereInfo.values.push(offset);
  whereInfo.values.push(limit);
  let rows = await globals.poolRO.query(selectSql, whereInfo.values);
  colUtils.outboundNaming(rows);
  resp.totalCount = rows.length;
  resp.rows = rows;
  return resp;
}

exports.getBySku = async (sku) => {
  let resp = {
    rows: []
  };
  let values = [sku];
  let selectByIdSql = `SELECT *
    FROM skus 
    WHERE sku = ? `;
  let rows = await globals.poolRO.query(selectByIdSql, values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;
  return resp;
}

exports.create = async (sku, available, productId) => {
  let resp = {
    sku: ''
  }
  let insertSQL = `INSERT INTO skus 
      (sku, available, product_id) 
    VALUES 
      (?,?,?)`;
  let values = [sku, available, productId];
  let insertResult = await globals.pool.query(insertSQL, values);
  if (insertResult.affectedRows > 0) {
    resp.sku = sku;  
  }
  return resp;
}

exports.updateBySku = async (sku, setInfo) => {
  let resp = {
    rows: []
  };
  let updateSQL = `UPDATE skus 
    ${setInfo.clause}
    WHERE sku = ?`;
  let selectSQL = `SELECT * 
    FROM skus
    WHERE sku = ?`;
  setInfo.values.push(sku);
  var updateResult = await globals.pool.query(updateSQL, setInfo.values);
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query(selectSQL, [sku]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}

