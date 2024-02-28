'use strict';

const { formatResp } = require('../utils/response');
const Conditions = require('../models/conditions');

var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  let conditions = await Conditions.getAll(whereInfo, sortBy, offset, limit);

  if (conditions.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No conditions found.');
  } else {
    resp.data.conditions = conditions.rows;
    resp.metaData.totalCount = conditions.totalCount;
  }

  return resp;
}

var getById = async (id, resp) => {
  let conditions = await Conditions.getById(id);

  if (conditions.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No condition found.');
  } else {
    resp.data.conditions = conditions.rows;
  }
  return resp;
}

var create = async (conditionName, sortOrder, active, costMarkup, pctOfMsrp, pctOfPrice, resp) => {
  let result = await Conditions.create(conditionName, sortOrder, active, costMarkup, pctOfMsrp, pctOfPrice);
  resp.id = result;
  return resp;
}

var updateById = async (id, setInfo, resp) => {
  let conditions = await Conditions.getById(id);
  if (conditions.length === 0) {
    formatResp(resp, undefined, 404, 'No condition found.');
  } else {
    let updateCondition = await Conditions.updateById(id, setInfo);

    if (updateCondition.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Condition not updated.')
    } else {
      resp.data = updateCondition.rows
    }
  }
  return resp
}

var remove = async (id, resp) => {
  let removeCondtiion = await Conditions.deleteById(id);

	if (removeCondtiion.length === 0) {
    resp = formatResp(resp, undefined, 404, 'Condition not found.');
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