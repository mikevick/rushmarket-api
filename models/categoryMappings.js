'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');

exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  };
  let selectCountSql = `SELECT count(*) as num 
    FROM category_mappings 
    ${whereInfo.clause}`;
  let values = whereInfo.values;
  let selectCountResult = await globals.poolRO.query(selectCountSql, values);
  resp.totalCount = selectCountResult[0].num;
  
  let selectSql = `SELECT * 
    FROM category_mappings 
    ${whereInfo.clause} 
    ORDER BY ${sortBy} 
    LIMIT ?,?`;
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
  let selectByIdSql = `SELECT *
    FROM category_mappings 
    WHERE category_mapping_id = ? `;
  let rows = await globals.poolRO.query(selectByIdSql, values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.getByCategoryId = async (categoryId) => {
  return globals.poolRO.query(`
    SELECT * FROM category_mappings WHERE category_id = ?
  `, [categoryId])
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

exports.create = async (categoryId, category1, category2) => {
  let resp = {
    id: 0
  }
  let insertSQL = `INSERT INTO category_mappings 
      (category_id, category_1, category_2) 
    VALUES 
      (?,?,?)`;
  let values = [categoryId, category1, category2];
  let insertResult = await globals.pool.query(insertSQL, values);
  if (insertResult.affectedRows > 0) {
    resp.id = insertResult.insertId;  
  }
  return resp;
}

exports.updateById = async (id, setInfo) => {
  let resp = {
    rows: []
  };
  let updateSQL = `UPDATE category_mappings 
    ${setInfo.clause}
    WHERE category_mapping_id = ?`;
  let selectSQL = `SELECT * 
    FROM category_mappings
    WHERE category_mapping_id = ?`;
  setInfo.values.push(id);
  var updateResult = await globals.pool.query(updateSQL, setInfo.values);
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query(selectSQL, [id]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}

exports.deleteById = async (id) => {
  let deleteSQL = `DELETE FROM category_mappings
    WHERE category_mapping_id = ?`;
  return await globals.pool.query(deleteSQL, [id]);
}
