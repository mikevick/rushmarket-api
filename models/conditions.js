'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');

exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  };
  let selectCountSql = `SELECT count(*) as num 
    FROM conditions 
    ${whereInfo.clause}`;
  let values = whereInfo.values;
  let selectCountResult = await globals.poolRO.query(selectCountSql, values);
  resp.totalCount = selectCountResult[0].num;
  
  let selectSql = `SELECT * 
    FROM conditions 
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
    FROM conditions 
    WHERE condition_id = ? `;
  let rows = await globals.poolRO.query(selectByIdSql, values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.create = async (conditionName, sortOrder, active, costMarkup, pctOfMsrp, pctOfPrice) => {
  let resp = {
    id: 0
  }
  let insertSQL = `INSERT INTO conditions 
      (condition_name, sort_order, active, cost_markup, pct_of_msrp, pct_of_price) 
    VALUES 
      (?,?,?,?,?,?)`;
  let values = [conditionName, sortOrder, active, costMarkup, pctOfMsrp, pctOfPrice];
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
  let updateSQL = `UPDATE conditions 
    ${setInfo.clause}
    WHERE condition_id = ?`;
  let selectSQL = `SELECT * 
    FROM conditions
    WHERE condition_id = ?`;
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
  let deleteSQL = `DELETE FROM conditions
    WHERE condition_id = ?`;
  return await globals.pool.query(deleteSQL, [id]);
}
