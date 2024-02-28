'use strict';

const CategoryQuantities = require('../models/categoryQuantities');
const Categories = require('../models/categories');
const NeededOnMarketFloor = require('../models/neededOnMarketFloor');
const sqlUtils = require('../utils/sqlUtils');

var getNeededOnMarketFloor = async (storeId, vendorSkuDataList, resp) => {
  resp.data.vendorSkus = [];
  let vcResp = [];
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
  let neededOnMarketFloor = 0;
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
  //for each vendor sku, get the category, calc the number for in market display
  //When where is no category, return 0 and reason: no category set in vendor catalog
  //when there is a secondary category, get the front end name to pass to category quantities
  //when there is no category quantities setting, retun 0 and reason: no category quantity settings for category and store
  for (let i=0; i<vendorSkuDataList.length; i++) {
    //initialize data
    vendorSku = vendorSkuDataList[i].vendorSku;
    quantity = Number.parseInt(vendorSkuDataList[i].quantity);
    neededOnMarketFloor = 0;
    categoryId = 0;
    categoryName = "";
    reason = "";
    

    //get vendor catalog data
    vcResp = await NeededOnMarketFloor.getvendorCatalogProductData(vendorSku);
    if (vcResp.rows.length > 0 && vcResp.rows[0].secondaryCategory != null) {
      categoryName = vcResp.rows[0].secondaryCategory;  
      coinId = vcResp.rows[0].coinId;

      //get category id
      let catWhereInfo = {
        clause: "",
        values: []
      };
      catWhereInfo = sqlUtils.appendWhere(catWhereInfo, "name = ?", categoryName);
      catRow = await Categories.getCategories(catWhereInfo);
      if (catRow.length > 0) {
        categoryId = catRow[0].categoryId;


        //get category quantity settings
        cqWhereInfo = {
          clause: "",
          values: []
        };
        cqWhereInfo = sqlUtils.appendWhere(cqWhereInfo, "cq.store_id = ?", storeId);
        cqWhereInfo = sqlUtils.appendWhere(cqWhereInfo, "cq.category_id = ?", categoryId);
        categoryQuantities = await CategoryQuantities.getAll(cqWhereInfo, cqSortBy, offset, limit);
        if (categoryQuantities.rows.length > 0) {
          marketCat = categoryQuantities.rows[0];
          //allowed quantities
          maximumFloor = marketCat.maxQtyOnFloor;
          maximumCoin = marketCat.maxQtyPerCoin;

          //get number of skus currently on the market floor for both the category level and coin level for this product
          marketFloorCategoryQuantity = await NeededOnMarketFloor.getProductsOnMarketFloorForCategory(marketCat.citySlug, marketCat.categorySlug, undefined);
          marketFloorCoinQuantity = await NeededOnMarketFloor.getQuantityProductsOnMarketFloorForCoin(vendorSku, marketCat.citySlug, marketCat.categorySlug);

          //keep track of accrued category and coin quantities as we proceed
          coin = marketFloorAccruedCoins.find( (x) => x.coinId === coinId);
          if (coin == undefined) {
            marketFloorAccruedCoins.push({
              coinId: coinId,
              allocatedQty: 0
            });
            coin = marketFloorAccruedCoins.find( (x) => x.coinId === coinId)
          } 
          cat = marketFloorAccruedCategories.find( (y) => y.categorySlug === marketCat.categorySlug);
          if (cat == undefined) {
            marketFloorAccruedCategories.push({
              categorySlug: marketCat.categorySlug,
              allocatedQty: 0
            });
            cat = marketFloorAccruedCategories.find( (y) => y.categorySlug === marketCat.categorySlug);
          } 

          //Get the remaining amount available for category and coin
          categoryRemaining = maximumFloor - (marketFloorCategoryQuantity.rows.length + cat.allocatedQty);
          coinRemaining = maximumCoin - (marketFloorCoinQuantity.rows.length + coin.allocatedQty);

          //When there is room on the floor for the category and the for the coin for at least 1 or more, we will calculate how many of the quantity we can allocate
          if (categoryRemaining > 0 && coinRemaining > 0){
            //determine how much room we have
            if (categoryRemaining > coinRemaining) {
              //we fill up to the coin capacity
              if (quantity > coinRemaining) {
                neededOnMarketFloor = coinRemaining; 
                coin.allocatedQty += coinRemaining;
                cat.allocatedQty += coinRemaining;
                reason = "Some quantity not allocated due to coin restriction"; 
              } else {
                neededOnMarketFloor = quantity; 
                coin.allocatedQty += quantity;
                cat.allocatedQty += quantity;
                reason = "All quantity allocated to floor."; 
              }
            } else {
              //we can fill to the category capacity
              if (quantity > categoryRemaining) {
                neededOnMarketFloor = categoryRemaining; 
                coin.allocatedQty += categoryRemaining;
                cat.allocatedQty += categoryRemaining;
                reason = "Some quantity not allocated due to category restriction"; 
              } else {
                neededOnMarketFloor = quantity; 
                coin.allocatedQty += quantity;
                cat.allocatedQty += quantity;
                reason = "All quantity allocated to floor."; 
              }
            }
          } else {
            if (categoryRemaining < 1) {
              reason = "category has reached capacity"; 
            } else {
              reason = "coin has reached capacity"; 
            }
          }
        } else {
          reason = "No category quantity data for the store and category ids"; 
        }
      } else {
        reason = "No category found for this vendor sku"; 
      }
    } else {
      reason = "No vendor catalog category info found"; 
    }
    resp.data.vendorSkus.push({
      vendorSku: vendorSku,
      neededOnMarketFloor: neededOnMarketFloor,
      categoryId: categoryId,
      categoryName: categoryName,
      reason: reason
    }); 
  }
  return resp; 
}

module.exports = {
  getNeededOnMarketFloor
}
