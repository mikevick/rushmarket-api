'use strict';

const { formatResp } = require('../utils/response');
const Pallets = require('../models/pallets');

var getAll = async (whereInfo, sortBy, groupBy, offset, limit, resp) => {
  let pallets = await Pallets.getAll(whereInfo, sortBy, groupBy, offset, limit);

  resp.metaData.totalCount = pallets.totalCount;
  if (pallets.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No pallets found.');
  } else {
    resp.data.pallets = pallets.rows;
  }

  return resp;
}

module.exports = {
  getAll
}
