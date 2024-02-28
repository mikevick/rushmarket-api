'use strict';

const { formatResp } = require('../utils/response');
const StorageAreas = require('../models/storageAreas');



var create = async (storeId, storageArea, storageAreaName, webLocationAlias, defaultArea, defaultZone, defaultLocation, payStorageFees, active, resp) => {
  let storageAreas = await StorageAreas.getByPK(storeId, storageArea);
  
  if (storageAreas.length > 0) {
    formatResp(resp, undefined, 409, 'Storage area already exists.');
    return null;
  }
  else {
    var result = await StorageAreas.create(storeId, storageArea, storageAreaName, webLocationAlias, defaultArea, defaultZone, defaultLocation, payStorageFees, active);
    return result;
  }
}



var remove = async (storeId, storageArea, resp) => {
  let storageAreas = await StorageAreas.getByPK(storeId, storageArea);
  
  if (storageAreas.length === 0) {
    formatResp(resp, undefined, 409, 'Storage area not found.');
    return null;
  }
  else {
    var result = await StorageAreas.remove(storeId, storageArea);
    return result;
  }
}





var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  let storageAreas = await StorageAreas.getAll(whereInfo, sortBy, offset, limit);

  resp.metaData.totalCount = storageAreas.totalCount;
  if (storageAreas.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No storage areas found.');
  } else {
    resp.data.storageAreas = storageAreas.rows;
  }

  return resp;
}

var getByIds = async (storageAreaId, storeId, whereInfo, sortBy, resp) => {
  let storageAreas = await StorageAreas.getByIds(storageAreaId, storeId, whereInfo, sortBy);
  
  if (storageAreas.length === 0) {
    formatResp(resp, undefined, 404, 'No storage areas found.');
  } else {
    resp.data.storageArea = storageAreas[0];
  }

  return resp;
}


var update = async (storeId, storageArea, storageAreaName, webLocationAlias, defaultArea, defaultZone, defaultLocation, payStorageFees, active, resp) => {
  let storageAreas = await StorageAreas.getByPK(storeId, storageArea);
  
  if (storageAreas.length === 0) {
    formatResp(resp, undefined, 409, 'Storage area not found.');
    return null;
  }
  else {
    var result = await StorageAreas.update(storeId, storageArea, storageAreaName, webLocationAlias, defaultArea, defaultZone, defaultLocation, payStorageFees, active);
    return result;
  }
}




module.exports = {
  create,
  getAll,
  getByIds,
  remove,
  update
}
