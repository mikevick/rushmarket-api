'use strict'

const { formatResp } = require('../utils/response')
const Metros = require('../models/metros')
const BubbleStores = require('../models/bubbleStores')
const BubbleRanges = require('../models/bubbleRanges')




// Create metro
var create = async (status, name, cityId, zip, marginEligibilityThreshold, hasPhysicalStoreFlag, resp) => {
	var rows = await Metros.getByName(name);

	if (rows.length > 0) {
    formatResp(resp, ["id"], 409, 'Metro with that name already exists.');
	}
	else {
	  var result = await Metros.create(status, name, cityId, zip, marginEligibilityThreshold, hasPhysicalStoreFlag);
	  resp.id = result;
	}

  return resp;
}



var createCategoryOverride = async (metroId, categoryId, marginEligibilityThreshold, resp) => {
	var rows = await Metros.getCategoryOverride(metroId, categoryId);

	if (rows.length > 0) {
    formatResp(resp, ["id"], 409, 'Override for that metro category already exists.');
	}
	else {
	  var result = await Metros.createCategoryOverride(metroId, categoryId, marginEligibilityThreshold);
	  resp.id = result;
	}

	return resp;
}



var updateById = async (metroId, setInfo, resp) => {
  var metros = await Metros.getById(metroId)

  if (metros.length === 0) {
    formatResp(resp, undefined, 404, 'Metro not found.');
  } else {
    var updateMetro = await Metros.updateById(metroId, setInfo);

    if (updateMetro.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Metro not updated.');
    } else {
      resp.data = updateMetro.rows;
    }
  }
  return resp;
}


var updateCategoryOverride = async (metroId, overrideId, setInfo, resp) => {
	var metros = await Metros.getById(metroId);

	if (metros.length === 0) {
    formatResp(resp, undefined, 404, 'No metro found.')
	}
	else {
		var result = await Metros.updateCategoryOverride(overrideId, setInfo);

		if (result.affectedRows !== 1) {
      formatResp(resp, undefined, 404, 'Override not updated.');
		}
	}

	return resp;
}



var getAll = async (whereInfo, offset, limit, resp) => {
  var metros = await Metros.getAll(whereInfo, offset, limit)

  resp.metaData.totalCount = metros.totalCount
  if (metros.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No metros found.')
  } else {
    resp.data.metros = metros.rows
  }

  return resp
}



var getById = async (id, resp) => {
  var metros = await Metros.getById(id)

  if (metros.length === 0) {
    formatResp(resp, undefined, 404, 'No metro found.')
  } else {
    resp.data = metros[0]
  }

  return resp
}



var getCategoryOverrides = async (metroId, resp) => {
  var overrides = await Metros.getCategoryOverridesByMetroId(metroId)

  if (overrides.length === 0) {
    formatResp(resp, undefined, 404, 'No overrides found for metro.');
  } else {
    resp.data.categoryOverrides = overrides;
  }

  return resp
}


var getCategoryOverridesById = async (id, resp) => {
  var overrides = await Metros.getCategoryOverrideById(id);

  if (overrides.length === 0) {
    formatResp(resp, undefined, 404, 'No override found for metro.');
  } else {
    resp.data.categoryOverrides = overrides;
  }

  return resp;
}


var removeCategoryOverride = async (id, resp) => {
  var overrides = await Metros.getCategoryOverrideById(id)

  if (overrides.length === 0) {
    formatResp(resp, undefined, 404, 'Override not found.')
  } else {
    await Metros.removeCategoryOverride(id);
  }

  return resp
}





var remove = async (id, resp) => {
  var metro = await Metros.getById(id)

  if (metro.length === 0) {
    formatResp(resp, undefined, 404, 'Metros not found.')
  } else {
    await Metros.removeById(id)
  }

  return resp
}



// Create bubble
var createBubbleToShopifyStore = async (bubbleId, shopifyStoreId, resp) => {
  var result = await BubbleStores.create(bubbleId, shopifyStoreId)
  resp.id = result

  return resp
}

var updateShopifyStoreIdByBubbleId = async (bubbleId, shopifyStoreId, setInfo, resp) => {
  var bubbles = await BubbleStores.getByBubbleId(bubbleId)

  if (bubbles.length === 0) {
    formatResp(resp, undefined, 404, 'No shopify store found for bubble.')
  } else {
    var updateBubble = await BubbleStores.updateById(bubbles[0].id, setInfo)

    if (updateBubble.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Bubble not updated.')
    } else {
      resp.data = updateBubble.rows
    }
  }
  return resp
}



var getShopifyStoreByBubbleId = async (bubbleId, resp) => {
  var bubbles = await BubbleStores.getByBubbleId(bubbleId)

  if (bubbles.length === 0) {
    formatResp(resp, undefined, 404, 'No shopify store found for bubble.')
  } else {
    resp.data = bubbles[0]
  }

  return resp
}



var getByBubbleIdAndShopifyStoreId = async (bubbleId, shopifyStoreId, resp) => {
  var bubbles = await BubbleStores.getByBubbleIdAndShopifyStoreId(bubbleId, shopifyStoreId)

  if (bubbles.length === 0) {
    formatResp(resp, undefined, 404, 'No shopify store found for bubble.')
  } else {
    resp.data = bubbles[0]
  }

  return resp
}



var removeBubbleToShopifyStoreByBubbleIdAndShopifyStoreId = async (bubbleId, shopifyStoreId, resp) => {
  var bubble = await BubbleStores.getByBubbleIdAndShopifyStoreId(bubbleId, shopifyStoreId)

  if (bubble.length === 0) {
    formatResp(resp, undefined, 404, 'Bubble Store not found.')
  } else {
    await BubbleStores.removeByBubbleIdAndShopifyStoreId(bubbleId, shopifyStoreId)
  }

  return resp
}





// Create metro to sample zip
var createMetroToSampleZip = async (metroId, zip, cityName, weight, resp) => {
	var rows = await Metros.getSampleZipByMetroIdAndZip(metroId, zip);

	if ((weight === undefined) || (weight === null)) {
		weight = 1.0;
	}

	if (rows.length > 0) {
    formatResp(resp, ["id"], 409, 'Sample zip already exists for this metro.');
	}
	else {
	  var result = await Metros.createSampleZip(metroId, zip, cityName, weight);
		resp.id = result;
	}

  return resp;
}



var updateSampleZipByMetroId = async (metroId, sampleZipId, setInfo, resp) => {
  var zips = await Metros.getSampleZipsByMetroId(metroId)

  if (zips.length === 0) {
    formatResp(resp, undefined, 404, 'No sample zips found for metro.')
  } else {
    var updateZip = await Metros.updateSampleZipById(sampleZipId, setInfo)

    if (updateZip.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Sample zip not updated.')
    } else {
      resp.data = updateZip.rows
    }
  }
  return resp
}


var getSampleZipsByMetroId = async (metroId, resp) => {
  var zips = await Metros.getSampleZipsByMetroId(metroId)

  if (zips.length === 0) {
    formatResp(resp, undefined, 404, 'No sample zips found for metro.');
  } else {
    resp.data.sampleZips = zips;
  }

  return resp
}


var getSampleZipBySampleZipId = async (sampleZipId, resp) => {
  var zips = await Metros.getSampleZipById(sampleZipId);

  if (zips.length === 0) {
    formatResp(resp, undefined, 404, 'No sample zips found for metro.');
  } else {
    resp.data.sampleZips = zips;
  }

  return resp;
}


var removeSampleZipBySampleZipId = async (sampleZipId, resp) => {
  var zip = await Metros.getSampleZipById(sampleZipId)

  if (zip.length === 0) {
    formatResp(resp, undefined, 404, 'Sample zip not found.')
  } else {
    await Metros.removeSampleZipById(sampleZipId)
  }

  return resp
}

/** ***********************Zips*****************************/
// Create bubble
var createBubbleToZip = async (bubbleId, zipStart, zipEnd, resp) => {
  var result = await BubbleRanges.create(bubbleId, zipStart, zipEnd)
  resp.id = result

  return resp
}

var updateZipByZipId = async (zipId, setInfo, resp) => {
  var bubbles = await BubbleRanges.getById(zipId)

  if (bubbles.length === 0) {
    formatResp(resp, undefined, 404, 'No zips found for bubble.')
  } else {
    var updateBubble = await BubbleRanges.updateById(zipId, setInfo)

    if (updateBubble.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Bubble not updated.')
    } else {
      resp.data = updateBubble.rows
    }
  }
  return resp
}

var getZipsByBubbleId = async (bubbleId, resp) => {
  var bubbles = await BubbleRanges.getByBubbleId(bubbleId)

  if (bubbles.length === 0) {
    formatResp(resp, undefined, 404, 'No zips found for bubble.')
  } else {
    resp.data = bubbles
  }

  return resp
}

var getZipByZipId = async (zipId, resp) => {
  var bubbles = await BubbleRanges.getById(zipId)

  if (bubbles.length === 0) {
    formatResp(resp, undefined, 404, 'No zips found for bubble.')
  } else {
    resp.data = bubbles
  }

  return resp
}

var removeBubbleZipByZipId = async (zipId, resp) => {
  var bubble = await BubbleRanges.getById(zipId)

  if (bubble.length === 0) {
    formatResp(resp, undefined, 404, 'No zips found for bubble.')
  } else {
    await BubbleRanges.removeById(zipId)
  }

  return resp
}



exports.removeSampleZipById = (metroSampleId) => {
  return new Promise((resolve, reject) => {
    globals.productPool.query('DELETE FROM sample_zips WHERE id = ?', [marketSampleId])
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}


module.exports = {
	create,
	createCategoryOverride,
  updateById,
  getAll,
  getById,
  remove,
	removeCategoryOverride,
  createBubbleToShopifyStore,
	updateShopifyStoreIdByBubbleId,
	getCategoryOverrides,
	getCategoryOverridesById,
  getShopifyStoreByBubbleId,
  getByBubbleIdAndShopifyStoreId,
  removeBubbleToShopifyStoreByBubbleIdAndShopifyStoreId,
  createMetroToSampleZip,
  updateSampleZipByMetroId,
  getSampleZipsByMetroId,
  getSampleZipBySampleZipId,
  removeSampleZipBySampleZipId,
  createBubbleToZip,
	updateCategoryOverride,
  updateZipByZipId,
  getZipsByBubbleId,
  getZipByZipId,
  removeBubbleZipByZipId
}
