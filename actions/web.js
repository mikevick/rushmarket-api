'use strict';

const Web = require('../models/web');

var getAllPages = async (whereInfo, resp) => {
  var pages = await Web.getAllPages(whereInfo);

  resp.data.pages = pages.rows;

  return resp;
}

var getPageContents = async (whereInfo, resp) => {
  var pages = await Web.getPageContents(whereInfo);

  resp.data.pageContents = pages.rows;

  return resp;
}

var getMemberStores = async (whereInfo, resp) => {
  var memberStore = await Web.getMemberStores(whereInfo);

  return memberStore.rows;
}

module.exports = {
  getAllPages,
  getPageContents,
  getMemberStores
}
