'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');

exports.getAll = async (whereInfo, distinctValuesOnly, sortBy, offset, limit) => {
  let resp = {
    totalCount: 0,
    rows: []
  };
  let productAttributesSelect = ' * ';
  let productCountGroupByClause = '';
  if (distinctValuesOnly) {
    productAttributesSelect = ' DISTINCT attribute_values ';
    productCountGroupByClause = ' GROUP BY attribute_values '
  }
  let productAttributeCountSql = `
    SELECT count(*) as num  
    FROM product_attributes
    ${whereInfo.clause} 
    ${productCountGroupByClause}
  `;
  let values = whereInfo.values;
  let productAttributeTotalRows = await globals.poolRO.query(productAttributeCountSql, values);
  resp.totalCount = productAttributeTotalRows[0].num;

  let productAttributeSql = `
    SELECT ${productAttributesSelect} 
    FROM product_attributes 
    ${whereInfo.clause} 
  `;
  if (sortBy) {
    productAttributeSql += ` ORDER BY ${sortBy} `;
  }
  productAttributeSql += ` LIMIT ?,? `;
  values.push(offset);
  values.push(limit);
  let productAttributeRows = await globals.poolRO.query(productAttributeSql, values);
  colUtils.outboundNaming(productAttributeRows);
  resp.rows = productAttributeRows;

  return resp;
}

exports.getById = async (id) => {
  let resp = {
    rows: []
  };
  let values = [id];
  let productAttributeSql = `
    SELECT * 
    FROM product_attributes
    WHERE product_attribute_id = ?
  `;
  let productAttributeRows = await globals.poolRO.query(productAttributeSql, values);
  colUtils.outboundNaming(productAttributeRows);
  resp.rows = productAttributeRows;

  return resp;
}

exports.create = async (sku, attributeName, attributeValue) => {
  let resp = {
    attributeName: attributeName,
    attributeValue: attributeValue
  };
  let insertProductAttributeSQL = `
    INSERT INTO product_attributes (
      sku, 
      attribute_name, 
      attribute_value
    ) VALUES (?,?,?)
  `;
  let values = [sku, attributeName, attributeValue];
  let insertResp = await globals.pool.query(insertProductAttributeSQL, values);
  resp.id = insertResp.insertId;
  return resp;
}

exports.updateById = async (id, setInfo) => {
  let resp = {
    rows: []
  };
  let updateProductAttributeSQL = `
    UPDATE product_attributes 
    ${setInfo.clause}
    WHERE product_attribute_id = ?
  `;
  let productAttributeSQL = `
    SELECT * 
    FROM product_attributes
    WHERE product_attribute_id = ?
  `;
  setInfo.values.push(id);
  var updateResult = await globals.pool.query(updateProductAttributeSQL, setInfo.values);
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query(productAttributeSQL, [id]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}

exports.deleteById = async (id) => {
  let deleteProductAttributeSQL = `
    DELETE FROM product_attributes
    WHERE product_attribute_id = ?
  `;
  return await globals.pool.query(deleteProductAttributeSQL, [id]);
}


