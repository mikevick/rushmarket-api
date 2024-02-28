'use strict'; 

const mysql = require('promise-mysql');

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');
const userUtils = require('../utils/userUtils');

exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  }

  //get the total count
  let buildInspectSql = `
    SELECT bi.user_id, bi.user_type, bi.build_inspect_id, bi.sku, bi.build_inspect_status_id,
      bi.build_inspect_issues, bi.build_inspect_notes, bi.number_of_users,
      bi.is_inspected, bi.pre_assembled, bi.include_build_time,
      bi.in_box, bi.done, bi.total_seconds,
      CONVERT_TZ(bi.created_date, '+00:00', '${process.env.UTC_OFFSET}') as created_date,
      CONVERT_TZ(bi.done_date, '+00:00', '${process.env.UTC_OFFSET}') as done_date,
      CONVERT_TZ(bi.updated_date, '+00:00', '${process.env.UTC_OFFSET}') as updated_date,
      CONVERT_TZ(bi.start_datetime, '+00:00', '${process.env.UTC_OFFSET}') as start_datetime,
      CONVERT_TZ(bi.end_datetime, '+00:00', '${process.env.UTC_OFFSET}') as end_datetime,
      p.sku, p.name, p.image, p.condition_name, p.packaging_original_description, p.product_display,
      p.cost, p.seller_product_id, p.manifest_id, m.manifest_identifier,
      c2.name as category_1, c1.name as category_2,
      s.store_id, s.store_name, 
      IFNULL(li.price, p.price) as price, li.quantity, li.total_tax, li.total_discount, li.line_type 
    FROM product_build_inspects bi 
      LEFT JOIN stores s ON s.store_id = bi.store_id 
      LEFT JOIN products p ON p.sku = bi.sku 
      LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
      LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2 
      LEFT JOIN categories c1 ON c1.category_id = cm.category_id 
      LEFT JOIN categories c2 ON c2.category_id = c1.parent_id 
      LEFT JOIN order_line_items li ON li.sku = bi.sku AND li.line_type = "purchase"
      LEFT JOIN orders o ON o.order_id = li.order_id 
      LEFT JOIN stores s2 ON s2.store_id = o.store_id 
    ${whereInfo.clause} 
  `;
  let count = await globals.poolRO.query(buildInspectSql, whereInfo.values);
  resp.totalCount = count.length;

  //get the rows with sorting, limit, and offset in place
  if (sortBy !== '') {
      buildInspectSql = `
      ${buildInspectSql} 
      ORDER BY ${sortBy} 
      LIMIT ?,?
    `;  
  } else {
    buildInspectSql = `
      ${buildInspectSql} 
      LIMIT ?,?
    `;  
  }
  whereInfo.values.push(offset);
  whereInfo.values.push(limit);
  let rows = await globals.poolRO.query(buildInspectSql, whereInfo.values);
  colUtils.outboundNaming(rows);

  await userLookups(rows);

  resp.rows = rows;


  return resp;
}

exports.getById = async (productBuildInspectId) => {
  let buildInspectSql = `SELECT bi.user_id, bi.user_type, bi.build_inspect_id, bi.sku, bi.build_inspect_status_id,
      bi.build_inspect_issues, bi.build_inspect_notes, bi.number_of_users,
      bi.is_inspected, bi.pre_assembled, bi.include_build_time,
      bi.in_box, bi.done, bi.total_seconds,
      CONVERT_TZ(bi.created_date, '+00:00', '${process.env.UTC_OFFSET}') as created_date,
      CONVERT_TZ(bi.done_date, '+00:00', '${process.env.UTC_OFFSET}') as done_date,
      CONVERT_TZ(bi.updated_date, '+00:00', '${process.env.UTC_OFFSET}') as updated_date,
      CONVERT_TZ(bi.start_datetime, '+00:00', '${process.env.UTC_OFFSET}') as start_datetime,
      CONVERT_TZ(bi.end_datetime, '+00:00', '${process.env.UTC_OFFSET}') as end_datetime,
      p.sku, p.name, p.image, p.condition_name, p.packaging_original_description, p.product_display,
      p.cost, p.seller_product_id, p.manifest_id, m.manifest_identifier,
      c2.name as category_1, c1.name as category_2,
      s.store_name, 
      IFNULL(li.price, p.price) as price, li.quantity, li.total_tax, li.total_discount, li.line_type 
    FROM product_build_inspects bi 
      LEFT JOIN stores s ON s.store_id = bi.store_id 
      LEFT JOIN products p ON p.sku = bi.sku 
      LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
      LEFT JOIN category_mappings cm ON cm.category_1 = p.category_1 AND cm.category_2 = p.category_2 
      LEFT JOIN categories c1 ON c1.category_id = cm.category_id 
      LEFT JOIN categories c2 ON c2.category_id = c1.parent_id 
      LEFT JOIN order_line_items li ON li.sku = bi.sku AND li.line_type = "purchase"
      LEFT JOIN orders o ON o.order_id = li.order_id 
      LEFT JOIN stores s2 ON s2.store_id = o.store_id 
    WHERE bi.build_inspect_id = ?`;
  let values = [productBuildInspectId];
  let rows = await globals.poolRO.query(buildInspectSql, values);
  colUtils.outboundNaming(rows);

  await userLookups(rows);

  return rows;
}


var userLookups = async (rows) => {
  let userProms = [];
  for (var i = 0; i < rows.length; i++) {
    userProms.push(userUtils.userLookup(rows[i].userId, rows[i].userType));
  }

	var users = await Promise.all(userProms);
	for (let i = 0; i < rows.length; i++) {
		rows[i].userName = users[i].name;
		// products[i].userEmail = rows[i].email;
	}
}


exports.create = async (buildInspectBody) => {
  let insertBuildInspectSql = `INSERT INTO product_build_inspects (
      user_id, 
      user_type,
      store_id, 
      sku, 
      quick_inspection, 
      created_date
    ) VALUES (?,?,?,?,?,NOW())
  `;
  let quickInspection = 0;
  if (buildInspectBody.quickInspection) {
    quickInspection = Number.ParseInt(buildInspectBody.quickInspection);
  }
  let values = [buildInspectBody.userId, buildInspectBody.userType, buildInspectBody.storeId, buildInspectBody.sku, quickInspection, `CONVERT_TZ(Date.now(), '+00:00', '${process.env.UTC_OFFSET}')`];
  console.log(mysql.format(insertBuildInspectSql, values))  
  let insertResp = await globals.poolRO.query(insertBuildInspectSql, values);
  return insertResp.insertId;
}

exports.updateById = async (productBuildInspectId, setInfo) => {
  let resp = {
    rows: []
  };
  let updateBuildInspectSql = `UPDATE product_build_inspects 
    ${setInfo.clause} 
    WHERE build_inspect_id = ?`;
  let sql = `SELECT * 
    FROM product_build_inspects 
    WHERE build_inspect_id = ?`;
  setInfo.values.push(productBuildInspectId);
  console.log(mysql.format(updateBuildInspectSql, setInfo.values))
  let updateResult = await globals.poolRO.query(updateBuildInspectSql, setInfo.values);
  if (updateResult.affectedRows) {
    let rows = await globals.poolRO.query(sql, [productBuildInspectId]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}

