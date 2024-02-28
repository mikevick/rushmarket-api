'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');

exports.getMasterDataByType = async (masterType) => {
    
  let values = [];
  let masterSql = "SELECT `value`,`custom1`,`custom2`,`custom3` FROM `master_data` WHERE `TYPE`= ?";
  values.push(masterType);

	let masterData = await globals.poolRO.query(masterSql, values);
	colUtils.outboundNaming(masterData);

  return masterData;
}

exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  };
  let masterDataCountSql = `
    SELECT count(*) as num 
    FROM master_data 
    ${whereInfo.clause} 
  `;
  let values = whereInfo.values;
  let masterDataTotalRows = await globals.poolRO.query(masterDataCountSql, values);
  resp.totalCount = masterDataTotalRows[0].num;

  let masterDataSql = `
    SELECT master_data_id, 
      type, 
      COALESCE(NULLIF(value, ''), master_data_id) as value, 
      IF(ISNULL(description), '', description) AS description, 
      custom1, 
      custom2, 
      custom3, 
      CONCAT(value, " - ", IF(ISNULL(description), '', description)) as description_plus, 
      active 
    FROM master_data 
    ${whereInfo.clause} 
    ORDER BY ${sortBy} 
    LIMIT ?,? 
  `;
  values.push(offset);
  values.push(limit);
  let masterDataRows = await globals.poolRO.query(masterDataSql, values);
  colUtils.outboundNaming(masterDataRows);
  resp.rows = masterDataRows;

  return resp;
}

exports.getById = async (id) => {
  let resp = {
    rows: []
  };
  let values = [id];
  let masterDataSql = `
    SELECT master_data_id, 
      type, 
      COALESCE(NULLIF(value, ''), master_data_id) as value, 
      IF(ISNULL(description), '', description) AS description, 
      custom1, 
      custom2, 
      custom3, 
      CONCAT(value, " - ", IF(ISNULL(description), '', description)) as description_plus, 
      active  
    FROM master_data 
    WHERE master_data_id = ?
  `;
  let masterDataRows = await globals.poolRO.query(masterDataSql, values);
  colUtils.outboundNaming(masterDataRows);
  resp.rows = masterDataRows;

  return resp;
}

exports.create = async (type, value, description, custom1, custom2, custom3, active) => {
  let insertMasterDatasSQL = `
    INSERT INTO master_data (type, value, description, custom1, custom2, custom3, active) 
    VALUES (?,?,?,?,?,?,?)
  `;
  let values = [type, value, description, custom1, custom2, custom3, active];
  await globals.pool.query(insertMasterDatasSQL, values);

  return type;
}

exports.updateById = async (id, setInfo) => {
  let resp = {
    rows: []
  };
  let updateMasterDataSQL = `
    UPDATE master_data 
    ${setInfo.clause}
    WHERE master_data_id = ?
  `;
  let masterDataSQL = `
    SELECT master_data_id, 
      type, 
      COALESCE(NULLIF(value, ''), master_data_id) as value, 
      IF(ISNULL(description), '', description) AS description, 
      custom1, 
      custom2, 
      custom3, 
      CONCAT(value, " - ", IF(ISNULL(description), '', description)) as description_plus, 
      active  
    FROM master_data
    WHERE master_data_id = ?
  `;
  setInfo.values.push(id);
  var updateResult = await globals.pool.query(updateMasterDataSQL, setInfo.values);
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query(masterDataSQL, [id]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}

exports.deleteById = async (id) => {
  let deleteMasterDataSQL = `
    DELETE FROM master_data
    WHERE master_data_id = ?
  `;
  return await globals.pool.query(deleteMasterDataSQL, [id]);
}
