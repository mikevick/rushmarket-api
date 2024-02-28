'use strict';

const { formatResp } = require('../utils/response');
const AvailableRushSkus = require('../models/availableRushSkus');

var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  let availableRushSkus = await AvailableRushSkus.getAll(whereInfo, sortBy, offset, limit);

  if (availableRushSkus.rows.length === 0) {
    formatResp(resp, undefined, 404, 'Rush SKU is not available.');
  } else {
    resp.data.availableRushSkus = availableRushSkus.rows;
    resp.metaData.totalCount = availableRushSkus.totalCount;
  }

  return resp;
}

var create = async (sku, available, productId, resp) => {
  let result = await AvailableRushSkus.create(sku, available, productId);
  resp.id = result;
  return resp;
}

var updateBySku = async (sku, setInfo, resp) => {
  let availableRushSkus = await AvailableRushSkus.getBySku(sku);
  if (availableRushSkus.length === 0) {
    formatResp(resp, undefined, 404, 'No available rush skus found.');
  } else {
    let updateAvailableRushSkus = await AvailableRushSkus.updateBySku(sku, setInfo);

    if (updateAvailableRushSkus.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Available rush skus not updated.')
    } else {
      resp.data = updateAvailableRushSkus.rows
    }
  }
  return resp
}

module.exports = {
  getAll,
  create,
  updateBySku
}