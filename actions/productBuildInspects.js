'use strict';

const { formatResp } = require('../utils/response');
const ProductBuildInspects = require('../models/productBuildInspects');

var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  let productBuildInspects = await ProductBuildInspects.getAll(whereInfo, sortBy, offset, limit);

  resp.metaData.totalCount = productBuildInspects.totalCount;
  if (productBuildInspects.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No product build inspects found.');
  } else {
    resp.data.productBuildInspects = productBuildInspects.rows;
  }

  return resp;
}

var getById = async (productBuildInspectId, resp) => {
  let productBuildInspects = await ProductBuildInspects.getById(productBuildInspectId);
  
  if (productBuildInspects.length === 0) {
    formatResp(resp, undefined, 404, 'No product build inspects found.');
  } else {
    resp.data.productBuildInspects = productBuildInspects[0];
  }

  return resp;
}

var create = async (buildInspectBody, resp) => {
  let result = await ProductBuildInspects.create(buildInspectBody);
  resp.id = result;
  return resp;
}

var updateById = async (productBuildInspectId, setInfo, resp)  => {
  let result = await ProductBuildInspects.updateById(productBuildInspectId, setInfo);
  resp.data = result;
  return resp;
}

module.exports = {
  getAll,
  getById,
  create,
  updateById
}
