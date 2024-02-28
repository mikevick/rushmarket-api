'use strict'; 

const mysql = require('promise-mysql');

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');


exports.create = async (storeId, storageArea, storageAreaName, webLocationAlias, defaultArea, defaultZone, defaultLocation, payStorageFees, active) => {
  var result = await globals.pool.query(`INSERT INTO storage_areas (store_id, storage_area, storage_area_name, web_location_alias, default_area, default_zone, default_location, pay_storage_fees, active, sort_order)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 999)`, [storeId, storageArea, storageAreaName, webLocationAlias, defaultArea, defaultZone, defaultLocation, payStorageFees, active]);
  return result;
}


exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  }

  //get the total count
  let storageAreasSQL = `
    SELECT sa.* 
    FROM storage_areas sa
      LEFT JOIN stores s ON s.store_id = sa.store_id
    ${whereInfo.clause}
  `;
  let count = await globals.poolRO.query(storageAreasSQL, whereInfo.values);
  resp.totalCount = count.length;

  //get the rows with sorting, limit, and offset in place
  storageAreasSQL = `
    ${storageAreasSQL} 
    ORDER BY ${sortBy} 
    LIMIT ?,?
  `;
  whereInfo.values.push(offset);
  whereInfo.values.push(limit);
  let rows = await globals.poolRO.query(storageAreasSQL, whereInfo.values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.getByIds = async (storageAreaId, storeId, whereInfo, sortBy) => {
  let storageAreasSQL = `
    SELECT * 
    FROM storage_areas 
    ${whereInfo.clause} 
    AND storage_area = ? 
    AND store_id = ? 
    ORDER BY ${sortBy} 
  `;

  whereInfo.values.push(storageAreaId);
  whereInfo.values.push(storeId);

	console.log(mysql.format(storageAreasSQL, whereInfo.values));
  let rows = await globals.poolRO.query(storageAreasSQL, whereInfo.values);
  colUtils.outboundNaming(rows);

  return rows;
}


exports.getByPK = async (storeId, storageArea) => {
  let storageAreasSQL = `
    SELECT * 
    FROM storage_areas 
    WHERE storage_area = ? 
      AND store_id = ?`;

	// console.log(mysql.format(storageAreasSQL, [storageArea, storeId]));
  let rows = await globals.poolRO.query(storageAreasSQL, [storageArea, storeId]);
  colUtils.outboundNaming(rows);

  return rows;
}



exports.remove = async (storeId, storageArea) => {
  var sql = "DELETE FROM storage_areas WHERE store_id = ? AND storage_area = ?";
  var result = await globals.pool.query(sql, [storeId, storageArea]);
  return result;
}


exports.update = async (storeId, storageArea, storageAreaName, webLocationAlias, defaultArea, defaultZone, defaultLocation, payStorageFees, active) => {
  // console.log(mysql.format(`INSERT INTO storage_areas (store_id, storage_area, storage_area_name, web_location_alias, default_area, default_zone, default_location, active)
  // VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [storeId, storageArea, storageAreaName, webLocationAlias, defaultArea, defaultZone, defaultLocation, active]));

  var sql = "UPDATE storage_areas SET ";
  var set = "";
  var where = " WHERE store_id = ? AND storage_area = ?";
  var values = [];

  if (storageAreaName !== undefined) {
    if (set.length > 0) {
      set += ', ';
    }
    set += "storage_area_name = ? ";
    values.push(storageAreaName);
  }
  if (webLocationAlias !== undefined) {
    if (set.length > 0) {
      set += ', ';
    }
    set += "web_location_alias = ? ";
    values.push(webLocationAlias);
  }
  if (defaultArea !== undefined) {
    if (set.length > 0) {
      set += ', ';
    }
    set += "default_area = ? ";
    values.push(defaultArea);
  }
  if (defaultZone !== undefined) {
    if (set.length > 0) {
      set += ', ';
    }
    set += "default_zone = ? ";
    values.push(defaultZone);
  }
  if (defaultLocation !== undefined) {
    if (set.length > 0) {
      set += ', ';
    }
    set += "default_location = ? ";
    values.push(defaultLocation);
  }
  if (payStorageFees !== undefined) {
    if (set.length > 0) {
      set += ', ';
    }
    set += "pay_storage_fees = ? ";
    values.push(payStorageFees);
  }
  if (active !== undefined) {
    if (set.length > 0) {
      set += ', ';
    }
    set += "active = ? ";
    values.push(active);
  }


  if (values.length === 0) {
    return null;
  }
  else {
    values.push(storeId);
    values.push(storageArea);
    var result = await globals.pool.query(sql + ' ' + set + ' ' + where, values);
    return result;
  }
}


