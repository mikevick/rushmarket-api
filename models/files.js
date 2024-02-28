'use strict'; 

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.create = async (originalName, name, url, context, relativePath, nameCollision, sku, vendorId, vendorSku, type, tag) => {
  var sql = `INSERT INTO files (original_name, name, url, context, relative_path, name_collision, sku, vendor_id, vendor_sku, type, tag) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  // console.log(mysql.format(sql, [originalName, name, url, context, relativePath, nameCollision, sku, vendorId, vendorSku, type]))                  
  var result = await globals.pool.query(sql, [originalName, name, url, context, relativePath, nameCollision, sku, vendorId, vendorSku, type, tag]);


  return result;
}


exports.deleteById = async (id) => {
  var sql = `DELETE FROM files WHERE file_id = ?`;
  var result = await globals.pool.query(sql, [id]);


  return result;
}



exports.getById = async (id) => {
  var sql = `SELECT * FROM files WHERE file_id = ?`;
  var rows = await globals.pool.query(sql, [id]);

  colUtils.outboundNaming(rows);
  return rows;
}



exports.updateById = async (id, tag) => {
  var sql = `UPDATE files SET tag = ? WHERE file_id = ?`;
  var result = await globals.pool.query(sql, [tag, id]);


  return result;
}




exports.getAll = async (whereInfo, sortBy) => {
  let resp = {
    totalCount: 0,
    rows: []
  }
  let selectSQL = `
    SELECT file_id, original_name, name, url, context,
      relative_path, name_collision, sku, type, tag,
      CONVERT_TZ(date_created, '+00:00', '${process.env.UTC_OFFSET}') AS date_created
    FROM files
    ${whereInfo.clause}
    ORDER BY ${sortBy} 
  `;
  let rows = await globals.poolRO.query(selectSQL, whereInfo.values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}




exports.getAllFiles = async (whereInfo, sortBy, offset, limit) => {
  var r = {
    files: [],
    totalCount: 0
  }


  var sql = `SELECT *
              	FROM files f
	              ${whereInfo.clause} 
	            ORDER BY ${sortBy} LIMIT ?, ?`;


  whereInfo.values.push(offset);
  whereInfo.values.push(limit);              

  var count = await globals.poolRO.query("SELECT COUNT(*) AS num FROM files");

  if (count.length > 0) {
    r.totalCount = count[0].num;
  }

  // console.log(mysql.format(sql, whereInfo.values));
  var rows = await globals.poolRO.query(sql, whereInfo.values);

  colUtils.outboundNaming(rows);
  r.files = rows;

  return r;
}