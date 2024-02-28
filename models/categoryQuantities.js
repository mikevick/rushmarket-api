'use strict'; 

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');

exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  }

  //get the total count
  let categoryQuantitiesCountSQL = `SELECT COUNT(*) AS num 
    FROM category_quantities cq
    JOIN categories c ON cq.category_id = c.category_id
    LEFT JOIN stores s ON cq.store_id = s.store_id
    LEFT JOIN targeted_cities t ON s.city_id = t.id
    ${whereInfo.clause}`;
  let countResult = await globals.poolRO.query(categoryQuantitiesCountSQL, whereInfo.values);
  resp.totalCount = countResult[0].num;

  let categoryQuantitiesSQL = `SELECT cq.*, t.city_slug, LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) AS category_slug
    FROM category_quantities cq
    JOIN categories c ON cq.category_id = c.category_id
    LEFT JOIN stores s ON cq.store_id = s.store_id
    LEFT JOIN targeted_cities t ON s.city_id = t.id
    ${whereInfo.clause} 
    ORDER BY ${sortBy} 
    LIMIT ?,?`;
  whereInfo.values.push(offset);
  whereInfo.values.push(limit);
  let rows = await globals.poolRO.query(categoryQuantitiesSQL, whereInfo.values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.getById = async (id) => {
  let resp = {
    rows: []
  }
  let values = [id];
  let categoryQuantitiesSQL = `SELECT cq.*, t.city_slug, LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) AS category_slug
    FROM category_quantities cq
    JOIN categories c ON cq.category_id = c.category_id
    LEFT JOIN stores s ON cq.store_id = s.store_id
    LEFT JOIN targeted_cities t ON s.city_id = t.id
    WHERE cq.id = ?`;
  let rows = await globals.poolRO.query(categoryQuantitiesSQL, values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.create = async (categoryId, storeId, minQtyOnFloor, maxQtyPerCoin) => {
  let resp = {
    id: 0
  }
  let insertSQL = `
    INSERT INTO category_quantities (category_id, store_id, max_qty_on_floor, max_qty_per_coin) 
    VALUES (?,?,?,?)`;
  let values = [categoryId, storeId, minQtyOnFloor, maxQtyPerCoin];
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
  let updateSQL = `UPDATE category_quantities 
    ${setInfo.clause} 
    WHERE id = ?`;
  let categoryQuantitiesSQL = `SELECT * 
    FROM category_quantities 
    WHERE id = ?`;
  setInfo.values.push(id);
  var updateResult = await globals.pool.query(updateSQL, setInfo.values);
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query(categoryQuantitiesSQL, [id]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}

exports.deleteById = async (id) => {
  let deleteSQL = `
    DELETE FROM category_quantities
    WHERE id = ?`;
  return await globals.pool.query(deleteSQL, [id]);
}