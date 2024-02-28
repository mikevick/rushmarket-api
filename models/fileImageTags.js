'use strict'; 

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');

exports.getAll = async (whereInfo, sortBy) => {
  let resp = {
    totalCount: 0,
    rows: []
  }
  let fileImageTagsSQL = `
    SELECT * 
    FROM file_image_tags
    ${whereInfo.clause}
    ORDER BY ${sortBy} 
  `;
  let rows = await globals.poolRO.query(fileImageTagsSQL, whereInfo.values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.getById = async (fileImageTagId) => {
  let resp = {
    rows: []
  }
  let fileImageTagsSQL = `
    SELECT * 
    FROM file_image_tags
    WHERE file_image_tag_id = ?
  `;
  let rows = await globals.poolRO.query(fileImageTagsSQL, [fileImageTagId]);
  colUtils.outboundNaming(rows);
  resp.rows = rows;
  return resp;
}

exports.create = async (tag) => {
  let insertFileImageTagsSQL = `
    INSERT INTO file_image_tags (tag) VALUES (?)
  `;
  let values = [tag];
  await globals.pool.query(insertFileImageTagsSQL, values);
  return tag;
}

exports.updateById = async (fileImageTagsId, setInfo) => {
  let resp = {
    rows: []
  };
  let updateFileImageTagsSQL = `
    UPDATE file_image_tags 
    ${setInfo.clause}, 
    date_modified = NOW() 
    WHERE file_image_tag_id = ?
  `;
  let fileImageTagsSQL = `
    SELECT * 
    FROM file_image_tags
    WHERE file_image_tag_id = ?
  `;
  setInfo.values.push(fileImageTagsId);
  var updateResult = await globals.pool.query(updateFileImageTagsSQL, setInfo.values);
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query(fileImageTagsSQL, [fileImageTagsId]);
    colUtils.outboundNaming(rows);
    resp.rows = rows;
  }
  return resp;
}
