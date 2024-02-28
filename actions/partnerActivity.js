'use strict'

const _ = require('lodash')

const PartnerActivity = require('../models/partnerActivity')
const Partners = require('../models/partners')
const VendorSkus = require('../models/vendorSkus');

const sqlUtils = require('../utils/sqlUtils')

const { roundTo2Places } = require('../utils/mathUtils')
const { formatResp } = require('../utils/response')

//
//	GET Activity
//
var getActivity = async (type, where, partnerId, facilityId, dateStart, dateEnd, resp) => {
  let index = -1
  let facilities = null
  let facilityCache = []
  let facilityWhereInfo = {
    clause: 'WHERE 1=1 ',
    values: [],
  }
  let result = null
  let storeIds = ''

  let disposalRuleCount = await PartnerActivity.getDisposalRuleCount(partnerId, facilityId);
  if (disposalRuleCount.length && (disposalRuleCount[0].num > 0)) {
    resp.data.disposalFeesFlag = true;
  }

  let p = await Partners.getById(partnerId)
  if (p.length === 0) {
    resp = formatResp(resp, undefined, 404, 'Partner not found.')
    return resp
  }

  if (facilityId) {
    facilities = await Partners.getFacilityById(facilityId)
  } else {
    facilityWhereInfo = sqlUtils.appendWhere(
      facilityWhereInfo,
      `affiliated_with_id = ? AND affiliated_with_type = 'PARTNER'`,
      partnerId
    )
    facilities = await Partners.getAllFacilities(facilityWhereInfo, 0, 1000000)
    facilities = facilities.facilities
  }

  if ((facilities.length === 0) || (facilities[0].affiliatedWithId !== p[0].id)) {
    resp = formatResp(resp, undefined, 404, 'Facility not found.')
    return resp
   }


  for (let i = 0; i < facilities.length; i++) {
    if (storeIds.length) {
      storeIds += ', '
    }
    storeIds += facilities[i].storeId
  }

  switch (type) {
    case 'PROCESSED':
      result = await PartnerActivity.getProcessed(where, dateStart, dateEnd, storeIds)
      break

    case 'DISPOSED':
      result = await PartnerActivity.getDisposed(where, dateStart, dateEnd, storeIds)
      break

    case 'FULFILLMENT':
      result = await PartnerActivity.getFulfilled(where, dateStart, dateEnd, storeIds)
      break

    case 'STORAGE':
      result = await PartnerActivity.getStorage(where, dateStart, dateEnd, storeIds)
      break
  }

	// If not online quick sale, product name should be vendor catalog name
	for (let activity of result.activity) {
		if (activity.onlineQuickSale === 'N') {
			const vendorCatalogProductRows = await VendorSkus.getByVendor(activity.vendorId, activity.sellerProductId);
			activity.productName = (vendorCatalogProductRows.length > 0) ? vendorCatalogProductRows[0].productName : null;
		}
	}

  if (result.activity.length === 0) {
    formatResp(resp, undefined, 200, 'Activity not found.')
  } else {
    resp.data.activity = result.activity
    for (let i = 0; i < resp.data.activity.length; i++) {
      index = _.findIndex(facilityCache, function (f) {
        return f.storeId === resp.data.activity[i].storeId
      })

      resp.data.activity[i].facilityId = -1
      resp.data.activity[i].facilityName = null

      if (index > -1) {
        resp.data.activity[i].facilityId = facilityCache[index].id
        resp.data.activity[i].facilityName = facilityCache[index].name
      } else {
        index = _.findIndex(facilities, function (f) {
          return f.storeId === resp.data.activity[i].storeId
        })

        if (index > -1) {
          facilityCache.push({
            id: facilities[index].id,
            name: facilities[index].name,
            storeId: facilities[index].storeId,
          })
          resp.data.activity[i].facilityId = facilityCache[index].id
          resp.data.activity[i].facilityName = facilities[index].name
        }
      }
    }
  }

  return resp
}

//
//	GET Totals
//
var getTotals = async (partnerId, facilityId, dateStart, dateEnd, resp) => {
  let index = -1
  let disposedResult = null
  let fulfilledResult = null
  let facilities = null
  let facilityCache = []
  let facilityIds = [];
  let facilityWhereInfo = {
    clause: 'WHERE 1=1 ',
    values: [],
  }
  let processedResult = null
  let prom = []
  let storageResult = null
  let result = null
  let storeIds = ''

  if (facilityId) {
    facilities = await Partners.getFacilityById(facilityId)
  } else {
    facilityWhereInfo = sqlUtils.appendWhere(
      facilityWhereInfo,
      `affiliated_with_id = ? AND affiliated_with_type = 'PARTNER'`,
      partnerId
    )
    facilities = await Partners.getAllFacilities(facilityWhereInfo, 0, 1000000)
    facilities = facilities.facilities
  }

  for (let i = 0; i < facilities.length; i++) {
    if (storeIds.length) {
      storeIds += ', '
    }
    storeIds += facilities[i].storeId;
    facilityCache.push(facilities);
    facilityIds.push(facilities[i].id);
  }

  if (facilities.length === 0) {
    resp = formatResp(resp, undefined, 404, 'Facility not found.')
    return resp
   }

   let disposalRuleCount = await PartnerActivity.getDisposalRuleCount(partnerId, facilityId);
   if (disposalRuleCount.length && (disposalRuleCount[0].num > 0)) {
     resp.data.disposalFeesFlag = true;
   }
  

  prom.push(PartnerActivity.getDisposedTotals(dateStart, dateEnd, storeIds))
  prom.push(PartnerActivity.getProcessedTotals(dateStart, dateEnd, storeIds))
  prom.push(PartnerActivity.getFulfilledTotals(dateStart, dateEnd, storeIds))
  prom.push(PartnerActivity.getStorageTotals(dateStart, dateEnd, storeIds))

  let results = await Promise.all(prom)

  disposedResult = results[0]
  processedResult = results[1]
  fulfilledResult = results[2]
  storageResult = results[3]

  //	Get to a sorted list of unique facilities from the results of the 3 totals queries.
  facilityIds = _.uniq(facilityIds)
  facilityIds = _.orderBy(facilityIds)

  if (facilityIds.length === 0) {
    formatResp(resp, undefined, 200, 'Totals not found.')
  } else {
    resp.data.totals = []

    // Create stub objects for each facilityId
    for (let i = 0; i < facilityIds.length; i++) {
      resp.data.totals.push({
        facilityId: facilityIds[i],
        storeId: 0, 
        facilityName: null,
        totalProcessedItems: 0,
        totalProcessingFees: 0,
        totalDisposedItems: 0,
        totalDisposalFees: 0,
        totalFulfilledItems: 0,
        totalFulfillmentFees: 0,
        totalStorageFees: 0,
        totalFees: 0,
      })

      index = _.findIndex(facilityCache, function (f) {
        return f.id === resp.data.totals[i].facilityId
      })
      if (index > -1) {
        resp.data.totals[i].facilityName = facilityCache[index].name;
        resp.data.totals[i].storeId = facilityCache[index].storeId;
      } else {
        index = _.findIndex(facilities, function (f) {
          // console.log(v.id + " " + resp.data.activity[i].vendorId + " " + (v.id === resp.data.activity[i].vendorId));
          return f.id === resp.data.totals[i].facilityId
        })

        if (index > -1) {
          facilityCache.push({
            id: facilities[index].id,
            name: facilities[index].name,
            storeId: facilities[index].storeId
          })
          resp.data.totals[i].facilityName = facilities[index].name
          resp.data.totals[i].storeId = facilities[index].storeId;
        }
      }
    }

    //	Process the totals query results and plug in the numbers.
    for (let i = 0; i < disposedResult.totals.length; i++) {
      index = _.findIndex(resp.data.totals, function (f) {
        return f.storeId === disposedResult.totals[i].storeId
      })

      if (index > -1) {
        resp.data.totals[index].totalDisposedItems = disposedResult.totals[i].totalDisposedItems;
        resp.data.totals[index].totalDisposalFees = roundTo2Places(disposedResult.totals[i].totalDisposalFees);

        resp.data.totals[index].totalFees += roundTo2Places(disposedResult.totals[i].totalDisposalFees);
      }
    }

    for (let i = 0; i < processedResult.totals.length; i++) {
      index = _.findIndex(resp.data.totals, function (f) {
        return f.storeId === processedResult.totals[i].storeId
      })

      if (index > -1) {
        resp.data.totals[index].totalProcessedItems = processedResult.totals[i].totalProcessedItems;
        resp.data.totals[index].totalProcessingFees = roundTo2Places(processedResult.totals[i].totalProcessingFees);

        resp.data.totals[index].totalFees += roundTo2Places(processedResult.totals[i].totalProcessingFees);
      }
    }

    for (let i = 0; i < fulfilledResult.totals.length; i++) {
      index = _.findIndex(resp.data.totals, function (f) {
        return f.storeId === fulfilledResult.totals[i].storeId
      })

      if (index > -1) {
        resp.data.totals[index].totalFulfilledItems = fulfilledResult.totals[i].totalFulfilledItems;
        resp.data.totals[index].totalFulfillmentFees = roundTo2Places(fulfilledResult.totals[i].totalFulfillmentFees);

        resp.data.totals[index].totalFees += roundTo2Places(fulfilledResult.totals[i].totalFulfillmentFees);
      }
    }

    for (let i = 0; i < storageResult.totals.length; i++) {
      index = _.findIndex(resp.data.totals, function (f) {
        return f.storeId === storageResult.totals[i].storeId
      })

      if (index > -1) {
        resp.data.totals[index].totalStorageFees = roundTo2Places(storageResult.totals[i].totalStorageFees);

        resp.data.totals[index].totalFees += roundTo2Places(storageResult.totals[i].totalStorageFees);
      }
    }
  }

  for (let i = 0; i < resp.data.totals.length; i++) {
    delete resp.data.totals[i].storeId;
  }

  return resp
}


module.exports = {
  getActivity,
  getTotals,
}
