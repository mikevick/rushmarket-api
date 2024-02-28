'use strict';

const Categories = require('../models/categories');
const FullInspectionRequired = require('../models/fullInspectionRequired');
const RushProducts = require('../models/rushProducts');


var getFullInspectionRequired = async (storeId, vendorSkuDataList, resp) => {
  resp.data.vendorSkus = [];
  let vcResp = [];
  let vendorId = '';
  let vendorSku = '';
  let quantity = 0;
  // let coinId = 0;
  let categoryName = '';
  let coinId = '';
  let categoryId = 0;
  let catWhereInfo = {
    clause: "",
    values: []
  };
  let catRow = [];
  let cqWhereInfo = {
    clause: "",
    values: []
  };
  let cqSortBy = "cq.category_id";
  let limit = 10;
  let offset = 0;
  let categoryQuantities = [];
  let marketCat = [];
  let maximumFloor = 0;
  let maximumCoin = 0;
  let fullInspectionRequired = 0;
  let marketFloorCategoryQuantity = {};
  let marketFloorCoinQuantity = {};
  let categoryRemaining = 0;
  let coinRemaining = 0;
  let reason = "";
  let marketFloorAccruedCategories = [];
  let marketFloorAccruedCoins = [];
  let coin = {
    coinId: '',
    count: 0
  };
  let cat = {
    categorySlug: '',
    count: 0
  };


  var storeRanges = await FullInspectionRequired.getStoreNeedFullyInspected();

  //  For each vendor sku, get the category, calc the number of live skus under the COIN.
  for (let i = 0; i < vendorSkuDataList.length; i++) {


    //initialize data
    vendorId = vendorSkuDataList[i].vendorId;
    vendorSku = vendorSkuDataList[i].vendorSku;
    quantity = Number.parseInt(vendorSkuDataList[i].quantity);
    fullInspectionRequired = 0;
    categoryId = 0;
    categoryName = "";
    reason = "";


    //get vendor catalog data
    vcResp = await FullInspectionRequired.getvendorCatalogProductData(vendorId, vendorSku);
    if ((vcResp.rows.length > 0) && (vcResp.rows[0].secondaryCategory !== null)) {
      categoryName = vcResp.rows[0].secondaryCategory;
      coinId = vcResp.rows[0].coinId;

      //get category id
      catRow = await Categories.getCategoriesByName(categoryName);
      if (catRow.length > 0) {
        categoryId = catRow[0].categoryId;
        var threshold = catRow[0].fullInspectionThreshold;

        var liveByCoin = await RushProducts.getLiveByCoin(coinId);
        //  Check against category threshold.
        if (threshold > liveByCoin.total) {
          fullInspectionRequired = (threshold - liveByCoin.total);
        } else {
          if (liveByCoin[storeId] === 0) {
            fullInspectionRequired = findStoreNeeded(storeId, storeRanges, threshold);
          }
        }
      } else {
        reason = "No category found for this vendor sku";
      }
    } else {
      reason = "No vendor catalog category info found";
    }

    resp.data.vendorSkus.push({
      vendorId: vendorId,
      vendorSku: vendorSku,
      fullInspectionRequired: fullInspectionRequired,
      categoryId: categoryId,
      categoryName: categoryName,
      reason: reason
    });
  }
  return resp;
}



var findStoreNeeded = (storeId, storeRanges, threshold) => {
  var fullInspectionRequired = 0;

  if ([])
    for (var i = 0; i < storeRanges.length; i++) {
      if ((threshold >= storeRanges[i].fullInspectionThresholdMin) && (threshold <= storeRanges[i].fullInspectionThresholdMax)) {
        fullInspectionRequired = storeRanges[i].needFullyInspected;
      }
    }

  return fullInspectionRequired;
}



module.exports = {
  getFullInspectionRequired
}