'use strict';

const { formatResp } = require('../utils/response');
const CategoryQuantities = require('../models/categoryQuantities');

var getAll = async (whereInfo, sortBy, offset, limit, resp) => {

  // get minimum quantity and maximum coin
  let categoryQuantities = await CategoryQuantities.getAll(whereInfo, sortBy, offset, limit);

  if (categoryQuantities.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No category quantities found.');
  } else {
    resp.metaData.totalCount = categoryQuantities.totalCount;
    resp.data.categoryQuantities = categoryQuantities.rows;
  }
  return resp;
}


var getById = async (id, resp) => {
  let categoryQuantities = await CategoryQuantities.getById(id);

  if (categoryQuantities.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No category quantity found.');
  } else {
    resp.data.categoryQuantities = categoryQuantities.rows;
  }

  return resp;
}

var create = async (categoryId, storeId, maxQtyOnFloor, maxQtyPerCoin, resp) => {
  let createCategoryQuantities = await CategoryQuantities.create(categoryId, storeId, maxQtyOnFloor, maxQtyPerCoin);
  resp.id = createCategoryQuantities.id;
  return resp;
}

var updateById = async (id, setInfo, resp) => {
  let categoryQuantities = await CategoryQuantities.getById(id);
  if (categoryQuantities.length === 0) {
    formatResp(resp, undefined, 404, 'No category quantities found.');
  } else {
    let updateCategoryQuantities = await CategoryQuantities.updateById(id, setInfo);

    if (updateCategoryQuantities.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Category quantity not updated.')
    } else {
      resp.data = updateCategoryQuantities.rows
    }
  }
  return resp
}

var remove = async (id, resp) => {
  let removeCategoryQuantities = await CategoryQuantities.deleteById(id);

	if (removeCategoryQuantities.length === 0) {
    resp = formatResp(resp, undefined, 404, 'Category quantity not found.');
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
