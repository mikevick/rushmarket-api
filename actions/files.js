'use strict';

const { formatResp } = require('../utils/response');

const imageActions = require('../actions/images');

const Files = require('../models/files');

const fileUtils = require('../utils/fileUtils');




var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  var r = await Files.getAllFiles(whereInfo, sortBy, offset, limit);

  if (r.files.length === 0) {
    formatResp(resp, undefined, 404, 'Files not found.');
  } else {
    resp.metaData.totalCount = r.totalCount;
    resp.data.files = r.files;
  }

  return resp;
}



var updateById = async (id, tag, resp) => {
  var f = await Files.getById(id);
  if (f.length === 0) {
    formatResp(resp, undefined, 404, 'File not found.');
  }
  else {

    var result = await Files.updateById(id, tag);

    if (result.rowsAffected === 0) {
      formatResp(resp, undefined, 404, 'File not updated.')
    }
  }
  return resp
}



var deleteById = async (id, resp) => {
  var f = await Files.getById(id);
  if (f.length === 0) {
    formatResp(resp, undefined, 404, 'File not found.');
  }

  else {
    var req = {
      query: {
        relativePath: f[0].relativePath + "/" + f[0].name
      }
    }
    var resp = {
      statusCode: 200,
      message: 'Success.'
    };
  
    await Files.deleteById(id);

    var storageContext = fileUtils.getContext(f[0].context, '');

    if (storageContext !== null) {
      await imageActions.deleteImage(storageContext, req, resp);
    }
  }

  return resp
}


module.exports = {
  getAll,
  deleteById,
  updateById
}