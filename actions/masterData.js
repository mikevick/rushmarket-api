'use strict';

const { formatResp } = require('../utils/response');
const MasterData = require('../models/masterData');

var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  let masterData = await MasterData.getAll(whereInfo, sortBy, offset, limit);

  if (masterData.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No master data found.');
  } else {
    resp.data.masterData = masterData.rows;
    resp.metaData.totalCount = masterData.totalCount;
  }

  return resp;
}

var getById = async (id, resp) => {
  let masterData = await MasterData.getById(id);

  if (masterData.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No master data found.');
  } else {
    resp.data.masterData = masterData.rows;
  }

  return resp;
}

var create = async (type, value, description, custom1, custom2, custom3, active, resp) => {
  let result = await MasterData.create(type, value, description, custom1, custom2, custom3, active);
  resp.type = result;
  return resp;
}

var updateById = async (id, setInfo, resp) => {
  let masterData = await MasterData.getById(id);
  if (masterData.length === 0) {
    formatResp(resp, undefined, 404, 'No master data found.');
  } else {
    let updateMasterData = await MasterData.updateById(id, setInfo);

    if (updateMasterData.rows.length === 0) {
      formatResp(resp, undefined, 404, 'master data not updated.')
    } else {
      resp.data = updateMasterData.rows
    }
  }
  return resp
}

var remove = async (id, resp) => {
  let removeMasterData = await MasterData.deleteById(id);

	if (removeMasterData.length === 0) {
    resp = formatResp(resp, undefined, 404, 'Master data not found.');
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