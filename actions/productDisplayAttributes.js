'use strict';

const { formatResp } = require('../utils/response');
const ProductDisplayAttributes = require('../models/productDisplayAttributes');

var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  let productDisplayAttributes = await ProductDisplayAttributes.getAll(whereInfo, sortBy, offset, limit);

  if (productDisplayAttributes.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No product display attributes found.');
  } else {
    resp.data.productDisplayAttributes = productDisplayAttributes.rows;
    resp.metaData.totalCount = productDisplayAttributes.totalCount;
  }

  return resp;
}

var getById = async (id, resp) => {
  let productDisplayAttributes = await ProductDisplayAttributes.getById(id);

  if (productDisplayAttributes.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No product display attribute found.');
  } else {
    resp.data.productDisplayAttributes = productDisplayAttributes.rows;
  }

  return resp;
}

var create = async (sku, attribute_name, attribute_value, resp) => {
  let result = await ProductDisplayAttributes.create(sku, attribute_name, attribute_value);
  resp.id = result;
  return resp;
}

var updateById = async (id, setInfo, resp) => {
  let productDisplayAttributes = await ProductDisplayAttributes.getById(id);
  if (productDisplayAttributes.length === 0) {
    formatResp(resp, undefined, 404, 'No product display attribute found.');
  } else {
    let updateProductDisplayAttributes = await ProductDisplayAttributes.updateById(id, setInfo);

    if (updateProductDisplayAttributes.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Product display attribute not updated.')
    } else {
      resp.data = updateProductDisplayAttributes.rows
    }
  }
  return resp
}

var remove = async (id, resp) => {
  let removeProductDisplayAttribute = await ProductDisplayAttributes.deleteById(id);

	if (removeProductDisplayAttribute.length === 0) {
    resp = formatResp(resp, undefined, 404, 'Product display attribute not found.');
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


