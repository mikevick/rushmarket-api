'use strict';

const { formatResp } = require('../utils/response');
const CategoryAttributes = require('../models/categoryAttributes');

var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  let categoryAttributes = await CategoryAttributes.getAll(whereInfo, sortBy, offset, limit);

  if (categoryAttributes.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No category attributes found.');
  } else {
    resp.data.categoryAttributes = categoryAttributes.rows;
    resp.metaData.totalCount = categoryAttributes.totalCount;
  }

  return resp;
}

var getById = async (id, resp) => {
  let categoryAttributes = await CategoryAttributes.getById(id);

  if (categoryAttributes.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No category attribute found.');
  } else {
    resp.data.categoryAttributes = categoryAttributes.rows;
  }

  return resp;
}


var getRequired = async (categoryName, resp) => {
  let categoryAttributes = await CategoryAttributes.getRequired(categoryName);

  if (categoryAttributes.length === 0) {
    formatResp(resp, undefined, 404, 'No category attributes found.');
  } else {
    resp.data.categoryAttributes = categoryAttributes;
  }
}


var getByName = async (name, resp) => {
  let categoryAttributes = await CategoryAttributes.getValuesByName(name);

  if (categoryAttributes.length === 0) {
    formatResp(resp, undefined, 404, 'No category attributes found.');
  } else {
    resp.data.categoryAttributeValues = categoryAttributes;
  }
}


var getSuspectValues = async (whereInfo, sortBy, offset, limit, resp) => {
  let suspect = await CategoryAttributes.getSuspectValues(whereInfo, sortBy, offset, limit);

  if (suspect.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No suspect attributes found.');
  } else {
    resp.data.suspectAttributeValues = suspect.rows;
    resp.metaData.totalCount = suspect.totalCount;
  }

  return resp;
}



var create = async (categoryId, attributeId1, attributeId2, attributeId3, resp) => {
  let result = await CategoryAttributes.create(categoryId, attributeId1, attributeId2, attributeId3);
  resp.id = result;
  return resp;
}

var updateById = async (id, setInfo, resp) => {
  let categoryAttributes = await CategoryAttributes.getById(id);
  if (categoryAttributes.length === 0) {
    formatResp(resp, undefined, 404, 'No category attribute found.');
  } else {
    let updateCategoryAttributes = await CategoryAttributes.updateById(id, setInfo);

    if (updateCategoryAttributes.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Category attribute not updated.')
    } else {
      resp.data = updateCategoryAttributes.rows
    }
  }
  return resp
}

var remove = async (id, resp) => {
  let removeCategoryAttribute = await CategoryAttributes.deleteById(id);

	if (removeCategoryAttribute.length === 0) {
    resp = formatResp(resp, undefined, 404, 'Category attribute not found.');
  }
	return resp;
}

module.exports = {
  getAll,
  getById,
  getByName,
  getRequired,
  getSuspectValues,
  create,
  updateById,
  remove
}