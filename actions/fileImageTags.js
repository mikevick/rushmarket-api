'use strict';

const { formatResp } = require('../utils/response');
const FileImageTags = require('../models/fileImageTags');

var getAll = async (whereInfo, sortBy, resp) => {
  let fileImageTags = await FileImageTags.getAll(whereInfo, sortBy);

  if (fileImageTags.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No file image tags found.');
  } else {
    resp.data.imageTags = fileImageTags.rows;
  }

  return resp;
}

var getById = async (id, resp) => {
  let fileImageTags = await FileImageTags.getById(id);

  if (fileImageTags.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No file image tag found.');
  } else {
    resp.data.imageTags = fileImageTags.rows;
  }

  return resp;
}

var create = async (tag, resp) => {
  let result = await FileImageTags.create(tag);
  resp.tag = result;
  return resp;
}

var updateById = async (id, setInfo, resp) => {
  let fileImageTag = await FileImageTags.getById(id);
  if (fileImageTag.length === 0) {
    formatResp(resp, undefined, 404, 'No file image tag found.');
  } else {
    let updateFileImageTag = await FileImageTags.updateById(id, setInfo);

    if (updateFileImageTag.rows.length === 0) {
      formatResp(resp, undefined, 404, 'file image tag not updated.')
    } else {
      resp.data = updateFileImageTag.rows
    }
  }
  return resp
}
module.exports = {
  getAll,
  getById,
  create,
  updateById
}