'use strict'; 

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');

exports.getAll = async (whereInfo, sortBy, groupBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  }

  //get the total count
  let palletsCountSQL = `SELECT COUNT(*) AS num
    FROM (SELECT s.* 
      FROM storage_pallets sp 
        LEFT JOIN stores s ON s.store_id = sp.store_id 
        LEFT JOIN stores s2 ON s2.store_id = sp.current_store_id 
        LEFT JOIN products p ON p.pallet_number = sp.ext_pallet_number 
        LEFT JOIN storage_locations sl ON sl.location_number = sp.location_number AND sl.store_id = sp.store_ID 
        LEFT JOIN storage_pallet_sizes sps ON sps.id = sp.storage_pallet_size_id 
      ${whereInfo.clause} 
      GROUP BY ${groupBy}
    ) pallets`;
  let countResult = await globals.poolRO.query(palletsCountSQL, whereInfo.values);
  resp.totalCount = countResult[0].num;

  let palletsSQL = `SELECT 
      sp.pallet_id, 
      sp.pallet_prefix, 
      sp.pallet_number, 
      sp.ext_pallet_number, 
      sp.location_number, 
      sp.notes, 
      sp.storage_pallet_size_id, 
      sps.storage_pallet_size, 
      sp.store_id, 
      sp.current_store_id, 
      s.store_name, 
      s2.store_name as current_store_name, 
      IFNULL( COUNT(p.sku), 0 ) AS productCount, 
      SUM(p.price) AS totalPrice, 
      SUM(p.cost) AS totalCost, 
      CONVERT_TZ(sp.date_created, '+00:00', '#application.utcOffset#') as date_created, 
      CONVERT_TZ(sp.date_last_moved, '+00:00', '#application.utcOffset#') as date_last_moved
    FROM storage_pallets sp 
      LEFT JOIN stores s ON s.store_id = sp.store_id 
      LEFT JOIN stores s2 ON s2.store_id = sp.current_store_id 
      LEFT JOIN products p ON p.pallet_number = sp.ext_pallet_number 
      LEFT JOIN storage_locations sl ON sl.location_number = sp.location_number AND sl.store_id = sp.store_ID 
      LEFT JOIN storage_pallet_sizes sps ON sps.id = sp.storage_pallet_size_id 
    ${whereInfo.clause} 
    GROUP BY ${groupBy} 
    ORDER BY ${sortBy} 
    LIMIT ?,?`;
  whereInfo.values.push(offset);
  whereInfo.values.push(limit);
  let rows = await globals.poolRO.query(palletsSQL, whereInfo.values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}
