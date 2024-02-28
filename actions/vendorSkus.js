'use strict'

const VendorSkus = require('../models/vendorSkus')

const {
  formatResp
} = require('../utils/response')

//
//	GET all products
//
var getAll = async (where, offset, limit, resp) => {

  var result = await VendorSkus.getAll(where, offset, limit);
  resp.metaData.totalCount = result.totalCount;
  if (result.products.length === 0) {
    formatResp(resp, undefined, 200, 'Products not found.');
  } else {
    resp.data.vendorSkus = result.products;
  }
  return resp;
}


module.exports = {
  getAll
}
