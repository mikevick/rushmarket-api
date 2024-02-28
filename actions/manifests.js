'use strict';

const { formatResp } = require('../utils/response');
const Manifests = require('../models/manifests');

var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  let manifests = await Manifests.getAll(whereInfo, sortBy, offset, limit);

  if (manifests.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No manifests found.');
  } else {
    resp.data.manifests = manifests.rows;
    resp.metaData.totalCount = manifests.totalCount;
  }

  return resp;
}

var getById = async (id, resp) => {
  let manifests = await Manifests.getById(id);

  if (manifests.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No manifests found.');
  } else {
    resp.data.manifests = manifests.rows;
  }

  return resp;
}

module.exports = {
  getAll,
  getById
}
