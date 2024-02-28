'use strict';

const { formatResp } = require('../utils/response');
const StorageLocations = require('../models/storageLocations');

var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
  let storageLocations = await StorageLocations.getAll(whereInfo, sortBy, offset, limit);

  resp.metaData.totalCount = storageLocations.totalCount;
  if (storageLocations.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No storage locations found.');
  } else {
    resp.data.storageLocations = storageLocations.rows;
  }

  return resp;
}

var getStorageZones = async(whereInfo, sortBy, offset, limit, resp) => {
  let storageZones = await StorageLocations.getStorageZones(whereInfo, sortBy, offset, limit);

  if (storageZones.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No storage zones found.');
  } else {
    resp.metaData.totalCount = storageZones.totalCount;
    resp.data.storageZones = storageZones.rows;
  }

  return resp;
}

var create = async (storeId, storageArea, storageZone, storageLocation, locationType, onlineEligible, marketFloor, itemType, inInventoryCount, checkBuildStatus, printLabel, resp) => {
  let result = await StorageLocations.create(storeId, storageArea, storageZone, storageLocation, locationType, onlineEligible, marketFloor, itemType, inInventoryCount, checkBuildStatus, printLabel);
  resp.id = result;
  return resp;
}

module.exports = {
  getAll,
  getStorageZones,
  create
//   // getByStoreLocationNumber
}