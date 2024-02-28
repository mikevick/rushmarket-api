'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');

exports.getAllPages = async (whereInfo) => {
  var resp = {
    rows: []
  };

  var rows = await globals.pool.query('SELECT * FROM rushmarketweb_pages ' + whereInfo.clause + ' ORDER BY sequence_in_footer ASC ', whereInfo.values);
  resp.rows = colUtils.outboundNaming(rows);

  return resp;
}

exports.getPageContents = async (whereInfo) => {
  var resp = {
    rows: []
  };

  var rows = await globals.pool.query('SELECT * FROM rushmarketweb_pages p JOIN rushmarketweb_sections s ON s.page_id = p.id AND s.active = "Y" ' + whereInfo.clause + ' ORDER BY s.sequence ASC ', whereInfo.values);
  resp.rows = colUtils.outboundNaming(rows);

  return resp;
}

exports.getMemberStores = async (whereInfo) => {
  var resp = {
    rows: []
  };

  var rows = await globals.pool.query('SELECT s.store_id FROM members m JOIN stores s ON m.home_city_id = s.city_id AND s.active = "Y" AND s.type IN ("Physical", "Online") ' + whereInfo.clause, whereInfo.values);
  resp.rows = colUtils.outboundNaming(rows);

  return resp;
}
