'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');

exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  }

  //get the total count
  let storageLocationSQL = `
    SELECT l.*, a.storage_area_name
      FROM storage_locations l
        LEFT JOIN storage_areas a ON a.storage_area = l.storage_area AND a.store_id = l.store_id
        LEFT JOIN stores s ON s.store_id = l.store_id
    ${whereInfo.clause}
  `;
  let count = await globals.poolRO.query(storageLocationSQL, whereInfo.values);
  resp.totalCount = count.length;

  //get the rows with sorting, limit, and offset in place
  storageLocationSQL = `
    ${storageLocationSQL}
    ORDER BY ${sortBy}
    LIMIT ?,?
  `;
  whereInfo.values.push(offset);
  whereInfo.values.push(limit);
  let rows = await globals.poolRO.query(storageLocationSQL, whereInfo.values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.getStorageZones = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  }
  let storageZoneCountSQL = `
    SELECT COUNT(*) AS num
    FROM (
      SELECT l.*
      FROM storage_locations l
        LEFT JOIN stores s ON s.store_id = l.store_id
      ${whereInfo.clause}
      GROUP BY l.store_id, storage_area, storage_zone
      ORDER BY ${sortBy}
    ) zones
  `;

  let count = await globals.poolRO.query(storageZoneCountSQL, whereInfo.values);
  resp.totalCount = count[0].num;

  let storageZoneSQL = `
    SELECT l.*
    FROM storage_locations l
      LEFT JOIN stores s ON s.store_id = l.store_id
    ${whereInfo.clause}
    GROUP BY l.store_id, storage_area, storage_zone
    ORDER BY ${sortBy}
    LIMIT ?,?
  `;

  whereInfo.values.push(offset);
  whereInfo.values.push(limit);

  let rows = await globals.poolRO.query(storageZoneSQL, whereInfo.values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.create = async (storeId, storageArea, storageZone, storageLocation, locationType, onlineEligible, marketFloor, itemType, inInventoryCount, checkBuildStatus, printLabel) => {
  let insertLocationSQL = `
    INSERT INTO storage_locations (
      store_id,
      storage_area,
      storage_zone,
      storage_location,
      location_type,
      online_eligible,
      market_floor,
      location_number,
      item_type,
      in_inventory_count,
      check_build_status,
      print_label
    ) VALUES ( ?,?,?,?,?,?,?,?,?,?,?,? )
  `;
  let locationNumber = `${storageArea}${storageZone.toUpperCase()}${storageLocation.toString().padStart(4, '0')}`;
  let values = [storeId,storageArea,storageZone.toUpperCase(),storageLocation,locationType,onlineEligible,marketFloor,locationNumber, itemType, inInventoryCount, checkBuildStatus, printLabel];
  await globals.pool.query(insertLocationSQL, values);
  return locationNumber;
}