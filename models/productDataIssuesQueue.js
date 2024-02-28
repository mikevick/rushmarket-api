'use strict';

const globals = require('../globals');
const mysql = require('promise-mysql');
const colUtils = require('../utils/columnUtils');
const userUtils = require('../utils/userUtils');


exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  };
  let selectCountSql = `SELECT * 
    FROM product_data_issues_queue pdiq 
    LEFT JOIN users uasi ON pdiq.assigned_user_id = uasi.user_id 
    LEFT JOIN users umb ON pdiq.modified_by = umb.user_id 
    LEFT JOIN products p ON p.sku = pdiq.sku
    LEFT JOIN stores s ON p.store_id = s.store_id
    LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
    LEFT JOIN product_verifications pv ON pv.sku = pdiq.sku
    ${whereInfo.clause}     GROUP BY pdiq.sku
    `;
  let values = whereInfo.values;

  // console.log(mysql.format(selectCountSql, values));
  let selectCountResult = await globals.poolRO.query(selectCountSql, values);
  resp.totalCount = selectCountResult.length;
  let selectSql = `SELECT pdiq.id, 
      pdiq.sku,
      pdiq.status,
			pdiq.created_by,
      pdiq.created_by_type,
      uscb.user_name as created_by_user_name,
			pdiq.notes,
      p.category_1 as category_1,
      p.category_2 as category_2,
      p.name AS product_name,
      p.online_quick_sale,
      p.seller_product_id,
      m.manifest_identifier,
			m.manifest_id,			
			m.vendor_id, 
      s.partner_facility,
      s.store_name as store_name,
      GROUP_CONCAT(pv.key ORDER BY pv.key SEPARATOR '-') AS sortable_key_values,
      pdiq.assigned_user_id,
      uasi.user_name AS assigned_user_name,
      pdiq.modified_by,
      umb.user_name AS modified_by_user_name,
      CONVERT_TZ(pdiq.date_created, '+00:00', '${process.env.UTC_OFFSET}') AS date_created, 
      CONVERT_TZ(pdiq.date_modified, '+00:00', '${process.env.UTC_OFFSET}') AS date_modified
    FROM product_data_issues_queue pdiq 
      LEFT JOIN users uscb ON pdiq.created_by = uscb.user_id
      LEFT JOIN users uasi ON pdiq.assigned_user_id = uasi.user_id 
			LEFT JOIN users umb ON pdiq.modified_by = umb.user_id 
			LEFT JOIN products p ON p.sku = pdiq.sku
      LEFT JOIN stores s ON p.store_id = s.store_id
			LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
			LEFT JOIN product_verifications pv ON pv.sku = pdiq.sku
		

    ${whereInfo.clause} 
    GROUP BY pdiq.sku
    ORDER BY ${sortBy} 
    LIMIT ?,? `;

  values.push(offset);
  values.push(limit);

  console.log(mysql.format(selectSql, values));
  let rows = await globals.pool.query(selectSql, values);
  colUtils.outboundNaming(rows);

  await createdByLookups(rows);

  resp.rows = rows;
  return resp;
}



var createdByLookups = async (rows) => {
  let userProms = [];
  for (var i = 0; i < rows.length; i++) {
    userProms.push(userUtils.userLookup(rows[i].createdBy, rows[i].createdByType));
  }

	var users = await Promise.all(userProms);
	for (let i = 0; i < rows.length; i++) {
		rows[i].createdByUserName = users[i].name;
	}

}


exports.getById = async (id) => {
  let resp = {
    rows: []
  };
  let values = [id];
  let selectByIdSql = `SELECT pdiq.id, 
      pdiq.sku,
      pdiq.status,
      pdiq.created_by,
      pdiq.created_by_type,
			pdiq.notes,
      pdiq.assigned_user_id,
      uasi.user_name AS assigned_user_name,
      pdiq.modified_by,
      umb.user_name AS modified_by_user_name,
      CONVERT_TZ(pdiq.date_created, '+00:00', '${process.env.UTC_OFFSET}') AS date_created, 
      CONVERT_TZ(pdiq.date_modified, '+00:00', '${process.env.UTC_OFFSET}') AS date_modified
    FROM product_data_issues_queue pdiq 
      LEFT JOIN users uasi ON pdiq.assigned_user_id = uasi.user_id 
      LEFT JOIN users umb ON pdiq.modified_by = umb.user_id 
    WHERE id = ? `;
  let rows = await globals.pool.query(selectByIdSql, values);
  colUtils.outboundNaming(rows);

  await createdByLookups(rows);

  resp.rows = rows;
  return resp;
}


exports.getIssueTypes = async () => {
  let selectByIdSql = "SELECT DISTINCT(`key`) FROM product_verifications WHERE LENGTH(TRIM(`key`)) > 0 ORDER BY `key`";
  let rows = await globals.pool.query(selectByIdSql);
  colUtils.outboundNaming(rows);
  return rows;
}




exports.create = async (sku, status, createdBy, createdByType, assignedUserId) => {
  let resp = {
    id: 0
  }
  let insertSQL = `INSERT INTO product_data_issues_queue 
      (sku, status, created_by, created_by_type, assigned_user_id) 
    VALUES 
      (?,?,?,?,?)`;
  let values = [sku, status, createdBy, createdByType, assignedUserId];
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
  let updateSQL = `UPDATE product_data_issues_queue 
    ${setInfo.clause}
    WHERE id = ?`;
  let selectSQL = `SELECT pdiq.id, 
      pdiq.sku,
      pdiq.status,
      pdiq.created_by,
      ucb.user_name AS created_by_user_name, 
      pdiq.assigned_user_id,
      uasi.user_name AS assigned_user_name,
      pdiq.modified_by,
      umb.user_name AS modified_by_user_name,
      CONVERT_TZ(pdiq.date_created, '+00:00', '${process.env.UTC_OFFSET}') AS date_created, 
      CONVERT_TZ(pdiq.date_modified, '+00:00', '${process.env.UTC_OFFSET}') AS date_modified
    FROM product_data_issues_queue pdiq 
      LEFT JOIN users ucb ON pdiq.created_by = ucb.user_id 
      LEFT JOIN users uasi ON pdiq.assigned_user_id = uasi.user_id 
      LEFT JOIN users umb ON pdiq.modified_by = umb.user_id 
    WHERE id = ?`;
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
  let deleteSQL = `DELETE FROM product_data_issues_queue 
    WHERE id = ?`;
  return await globals.pool.query(deleteSQL, [id]);
}
