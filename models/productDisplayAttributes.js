'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');

exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  };
  let countSql = `SELECT count(*) as num  
    FROM product_display_attributes
    ${whereInfo.clause} `;
  let values = whereInfo.values;
  let totalRows = await globals.poolRO.query(countSql, values);
  resp.totalCount = totalRows[0].num;

  let selectSql = `SELECT *
    FROM product_display_attributes
    ${whereInfo.clause} `;
  if (sortBy) {
    selectSql += ` ORDER BY ${sortBy} `;
  }
  selectSql += ` LIMIT ?,? `;
  values.push(offset);
  values.push(limit);
  let rows = await globals.poolRO.query(selectSql, values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.getById = async (id) => {
  let resp = {
    rows: []
  };
  let values = [id];
  let selectSql = `SELECT * 
    FROM product_display_attributes
    WHERE product_display_attribute_id = ? `;
  let rows = await globals.poolRO.query(selectSql, values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.create = async (sku, attributeName, attributeValue) => {
  let resp = {
    attributeName: attributeName,
    attributeValue: attributeValue
  };
  let insertSql = `INSERT INTO product_display_attributes (
      sku, 
      attribute_name, 
      attribute_value
    ) VALUES (?,?,?) `;
  let values = [sku, attributeName, attributeValue];
  let insertResp = await globals.pool.query(insertSql, values);
  resp.id = insertResp.insertId;
  return resp;
}

exports.updateById = async (id, setInfo) => {
  let resp = {
    rows: []
  };
  let updateSql = `UPDATE product_display_attributes 
    ${setInfo.clause}
    WHERE product_display_attribute_id = ? `;
  let selectSql = `SELECT * 
    FROM product_display_attributes
    WHERE product_display_attribute_id = ? `;
  setInfo.values.push(id);
  let updateResult = await globals.pool.query(updateSql, setInfo.values);
  if (updateResult.affectedRows) {
    let rows = await globals.pool.query(selectSql, [id]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}

exports.deleteById = async (id) => {
  let deleteSql = `DELETE FROM product_display_attributes
    WHERE product_display_attribute_id = ? `;
  return await globals.pool.query(deleteSql, [id]);
}

