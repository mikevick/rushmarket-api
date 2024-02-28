'use strict'; 

const globals = require('../globals');



exports.addRange = async (originZip, rangeStart, rangeEnd, zone) => {
  var sql = `INSERT INTO zip_ranges_to_zones (origin_zip, range_start, range_end, zone) 
                  VALUES (?, ?, ?, ?)`;
  var result = await globals.pool.query(sql, [originZip, rangeStart, rangeEnd, zone]);


  return result;
}


exports.addZoneMapping = async (originZip, destZip, zone) => {
  var sql = `INSERT INTO zip_to_zip_to_zone (origin_zip, dest_zip, zone) 
                  VALUES (?, ?, ?)`;
  var result = await globals.pool.query(sql, [originZip, destZip, zone]);


  return result;
}


exports.deleteByOriginZip = async (originZip) => {
  var sql = `DELETE FROM zip_ranges_to_zones WHERE origin_zip = ?`;
  var result = await globals.pool.query(sql, [originZip]);

  sql = `DELETE FROM zip_to_zip_to_zone WHERE origin_zip = ?`;
  await globals.pool.query(sql, [originZip]);

  return result;
}

