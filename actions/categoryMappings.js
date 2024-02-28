'use strict';

const { formatResp } = require('../utils/response');
const CategoryMappings = require('../models/categoryMappings');

var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  let categoryMappings = await CategoryMappings.getAll(whereInfo, sortBy, offset, limit);

  if (categoryMappings.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No category mappings found.');
  } else {
    resp.data.categoryMappings = categoryMappings.rows;
    resp.metaData.totalCount = categoryMappings.totalCount;
  }

  return resp;
}

var getById = async (id, resp) => {
  let categoryMappings = await CategoryMappings.getById(id);

  if (categoryMappings.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No category mapping found.');
  } else {
    resp.data.categoryMappings = categoryMappings.rows;
  }

  return resp;
}

var create = async (categoryId, category1, category2, resp) => {
  let result = await CategoryMappings.create(categoryId, category1, category2);
  resp.id = result;
  return resp;
}

var updateById = async (id, setInfo, resp) => {
  let categoryMappings = await CategoryMappings.getById(id);
  if (categoryMappings.length === 0) {
    formatResp(resp, undefined, 404, 'No category mapping found.');
  } else {
    let updateCategoryMapping = await CategoryMappings.updateById(id, setInfo);

    if (updateCategoryMapping.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Category mapping not updated.')
    } else {
      resp.data = updateCategoryMapping.rows
    }
  }
  return resp
}

var remove = async (id, resp) => {
  let removeCategoryMapping = await CategoryMappings.deleteById(id);

	if (removeCategoryMapping.length === 0) {
    resp = formatResp(resp, undefined, 404, 'Category mapping not found.');
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