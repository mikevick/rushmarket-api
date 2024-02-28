'use strict';

const { formatResp } = require('../utils/response');
const ProductAttributes = require('../models/productAttributes');

var getAll = async (whereInfo, distinctValuesOnly, sortBy, offset, limit, resp) => {
  let productAttributes = await ProductAttributes.getAll(whereInfo, distinctValuesOnly, sortBy, offset, limit);

  if (productAttributes.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No product attributes found.');
  } else {
    resp.data.productAttributes = productAttributes.rows;
    resp.metaData.totalCount = productAttributes.totalCount;
  }

  return resp;
}

var getById = async (id, resp) => {
  let productAttributes = await ProductAttributes.getById(id);

  if (productAttributes.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No product attribute found.');
  } else {
    resp.data.productAttributes = productAttributes.rows;
  }

  return resp;
}

var create = async (sku, attributeName, attributeValue, resp) => {
  let result = await ProductAttributes.create(sku, attributeName, attributeValue);
  resp.attribute = result;
  return resp;
}

var updateById = async (id, setInfo, resp) => {
  let productAttributes = await ProductAttributes.getById(id);
  if (productAttributes.length === 0) {
    formatResp(resp, undefined, 404, 'No product attribute found.');
  } else {
    let updateProductAttributes = await ProductAttributes.updateById(id, setInfo);

    if (updateProductAttributes.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Product attribute not updated.')
    } else {
      resp.data = updateProductAttributes.rows
    }
  }
  return resp
}

var remove = async (id, resp) => {
  let removeProductAttributes = await ProductAttributes.deleteById(id);

	if (removeProductAttributes.length === 0) {
    resp = formatResp(resp, undefined, 404, 'Product attribute not found.');
  }
	return resp;
}

module.exports = {
  getAll,
  getById,
  create,
  updateById,
  remove
}