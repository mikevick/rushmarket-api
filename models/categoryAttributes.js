'use strict';

const _ = require('lodash');
const mysql = require('promise-mysql');

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');


exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  };
  let selectCountSql = `SELECT count(*) as num 
    FROM category_attributes ca 
      LEFT JOIN attributes a ON a.attribute_id = ca.attribute_id_1 
      LEFT JOIN attributes a2 ON a2.attribute_id = ca.attribute_id_2 
      LEFT JOIN attributes a3 ON a3.attribute_id = ca.attribute_id_3 
      LEFT JOIN categories c ON c.category_id = ca.category_id 
      LEFT JOIN categories c2 ON c2.category_id = c.parent_id 
    ${whereInfo.clause}`;
  let values = whereInfo.values;
  let selectCountResult = await globals.poolRO.query(selectCountSql, values);
  resp.totalCount = selectCountResult[0].num;
  
  let selectSql = `SELECT 
      c.parent_id,
      c.category_id,
      c2.name AS category_1,
      c.name AS category_2,
      ca.attribute_id_1,
      ca.attribute_id_2,
      ca.attribute_id_3,
      a.name AS attribute_name_1,
      a2.name AS attribute_name_2,
      a3.name AS attribute_name_3 
    FROM category_attributes ca 
      LEFT JOIN attributes a ON a.attribute_id = ca.attribute_id_1 
      LEFT JOIN attributes a2 ON a2.attribute_id = ca.attribute_id_2 
      LEFT JOIN attributes a3 ON a3.attribute_id = ca.attribute_id_3 
      LEFT JOIN categories c ON c.category_id = ca.category_id 
      LEFT JOIN categories c2 ON c2.category_id = c.parent_id 
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
  let selectByIdSql = `SELECT 
      c.parent_id,
      c.category_id,
      c2.name AS category_1,
      c.name AS category_2,
      ca.attribute_id_1,
      ca.attribute_id_2,
      ca.attribute_id_3,
      a.name AS attribute_name_1,
      a2.name AS attribute_name_2,
      a3.name AS attribute_name_3 
    FROM category_attributes ca 
      LEFT JOIN attributes a ON a.attribute_id = ca.attribute_id_1 
      LEFT JOIN attributes a2 ON a2.attribute_id = ca.attribute_id_2 
      LEFT JOIN attributes a3 ON a3.attribute_id = ca.attribute_id_3 
      LEFT JOIN categories c ON c.category_id = ca.category_id 
      LEFT JOIN categories c2 ON c2.category_id = c.parent_id 
    WHERE category_attributes_id = ? `;
  let rows = await globals.poolRO.query(selectByIdSql, values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}


exports.getRequired = async (categoryName) => {
  var rows = [];
  let selectSql = `SELECT a.name AS attribute_name, 
                    	ca.attribute_id,
	                    c.name AS category_name,
	                    ca.category_id, 
	                    ca.vc_map,
	                    ca.in_filters,
	                    ca.filter_type,
	                    ca.filter_label,
	                    ca.units,
	                    ca.on_pdp
                    FROM category_attributes ca
	                    LEFT JOIN attributes a ON a.attribute_id = ca.attribute_id
	                    LEFT JOIN categories c ON c.category_id = ca.category_id
                     WHERE ca.category_id = (
	                      SELECT category_id 
	                      FROM categories 
	                      WHERE NAME = ?
                      )
                    ORDER BY ca.display_order`;
  rows = await globals.poolRO.query(selectSql, [categoryName]);
  colUtils.outboundNaming(rows);
  return rows;
}



exports.getValuesByName = async (name) => {
  var rows = [];
  let selectSql = `SELECT attribute_value_id, \`value\`
                      FROM attribute_values
                      WHERE attribute_id = (
                        SELECT attribute_id
                        FROM attributes
                        WHERE NAME = ?
                    )
                    ORDER BY VALUE ASC`;
  rows = await globals.poolRO.query(selectSql, [name]);
  colUtils.outboundNaming(rows);
  return rows;
}



exports.create = async (categoryId, attributeId1, attributeId2, attributeId3) => {
  let resp = {
    id: 0
  }
  let insertSQL = `INSERT INTO category_attributes 
      (category_id, attribute_id_1, attribute_id_2, attribute_id_3) 
    VALUES 
      (?,?,?,?)`;
  let values = [categoryId, attributeId1, attributeId2, attributeId3];
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
  let updateSQL = `UPDATE category_attributes 
    ${setInfo.clause}
    WHERE category_attributes_id = ?`;
  let selectSQL = `SELECT * 
    FROM category_attributes
    WHERE category_attributes_id = ?`;
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
  let deleteSQL = `DELETE FROM category_attributes
    WHERE category_attributes_id = ?`;
  return await globals.pool.query(deleteSQL, [id]);
}



exports.getByCategoryId = async (categoryId) => {
  let sql = `SELECT a.name AS attribute_name, c.name AS category_name, ca.category_id, ca.attribute_id, 
                  ca.vc_map, ca.in_filters, ca.filter_type, ca.filter_label, ca.units, ca.on_pdp, ca.display_order
                FROM category_attributes ca
	                  LEFT JOIN categories c ON c.category_id = ca.category_id
	                  LEFT JOIN attributes a ON a.attribute_id = ca.attribute_id
                WHERE ca.category_id = ?
                ORDER BY ca.display_order`;
  let rows = await globals.poolRO.query(sql, [categoryId]);
  colUtils.outboundNaming(rows);

  return rows;
}


exports.getByPrimaryAndSecondaryCategories = async (primaryCategory, secondaryCategory) => {
  return globals.poolRO.query(`
    SELECT
      a.name as attribute_name,
      ca.vc_map,
      c.name as category_name,
      c.category_id
    FROM category_mappings cm
      INNER JOIN category_attributes ca ON ca.category_id = cm.category_id
      LEFT JOIN categories c ON c.category_id = ca.category_id
      LEFT JOIN attributes a ON a.attribute_id = ca.attribute_id
    WHERE cm.category_1 = ? AND cm.category_2 = ?
    ORDER BY ca.display_order
  `, [primaryCategory, secondaryCategory])
    .then(colUtils.outboundNaming)
}



exports.getSuspectValues = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  };
  let selectCountSql = `SELECT COUNT(*) AS num FROM suspect_attribute_values 
                            ${whereInfo.clause}`;

  let sql = `SELECT * FROM suspect_attribute_values 
                ${whereInfo.clause} 
                ORDER BY ${sortBy} 
                LIMIT ?,?`;

  let values = whereInfo.values;
  values.push(offset);
  values.push(limit);

  let selectCountResult = await globals.poolRO.query(selectCountSql, values);
  resp.totalCount = selectCountResult[0].num;

  // console.log(mysql.format(sql, values));
  let rows = await globals.poolRO.query(sql, values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;
  resp.totalCount = selectCountResult[0].num;

  return resp;
}


exports.deleteSuspectValue = async (coinId, category2Name, filterLabel, attributeName, suspectValue) => {
  let sql = `DELETE FROM suspect_attribute_values WHERE coin_id = ? AND category2_name = ? AND filter_label = ? AND attribute_name = ? AND suspect_value = ?`;

  let result = await globals.pool.query(sql, [coinId, category2Name, filterLabel, attributeName, suspectValue]);

  return result;
}



exports.findSuspectValues = async (attributeId, valuesArray) => {
  let sql = `SELECT avm.value 
              	FROM attributes a
              		LEFT JOIN attribute_values av ON a.attribute_id = av.attribute_id
		              LEFT JOIN attribute_value_mappings avm ON av.attribute_value_id = avm.attribute_value_id
	              WHERE a.attribute_id = ?`;

  let rows = await globals.poolRO.query(sql, [attributeId]);

  //  If no values to validate against return empty suspect
  if (!rows.length) {
    return [];
  }

  let validValues = [];
  rows.map(v => {
    validValues.push(v.value);
  })

  var result = _.difference(valuesArray, validValues);
  _.remove(valuesArray, function (v) {
    return _.indexOf(result, v) > -1;
  });
  return result;
}


exports.logSuspectValues = async (coinId, categoryName, filterLabel, attributeName, suspectValue) => {
  let sql = `INSERT IGNORE INTO suspect_attribute_values (coin_id, category2_name, filter_label, attribute_name, suspect_value) VALUES (?, ?, ?, ?, ?)`;
  if ((typeof suspectValue !== 'number') && (typeof suspectValue !== 'string')) {
    suspectValue = JSON.stringify(suspectValue);
  }
  // console.log(mysql.format(sql, [coinId, categoryName, filterLabel, attributeName, suspectValue]))
  await globals.pool.query(sql, [coinId, categoryName, filterLabel, attributeName, suspectValue]);
}