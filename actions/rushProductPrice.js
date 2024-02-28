'use strict';

const { formatResp } = require('../utils/response');
const RushProductPrice = require('../models/rushProductPrice');
const RushProducts = require('../models/rushProducts');
const StagingProduct = require('../models/stagingProduct');
const ShopifyAPI = require('../models/shopifyAPI');

var updateProductPriceBySku = async (sku, userId, price, msrp, pricingTypeId, productPriceSetInfo, stagingProductPriceSetInfo, resp) => {
  var rushProduct = await RushProducts.getByRushSku(sku);

  if (rushProduct.length === 0) {
    formatResp(resp, undefined, 404, 'No product found.');
  } else {
    var updateProductPrice = await RushProductPrice.updateProductPriceBySku(sku, productPriceSetInfo);
    if (updateProductPrice.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Product Price not updated.')
    } else {
      if (rushProduct[0].price !== price && rushProduct[0].pricingTypeId !== pricingTypeId) {
        //Create the log entry
        RushProductPrice.createProductPricingLog(undefined, userId, undefined, sku, rushProduct[0].price, price, rushProduct[0].pricingTypeId, pricingTypeId);
      }
      // update staging product when the price is zero
      let stagingProducts = await StagingProduct.getZeroPriceStagingProductsBySku(sku);
      let i = 0;
      if (stagingProducts.length > 0) {
        for (i=0; i<stagingProducts.length; i++) {
          StagingProduct.updateStagingProductByProductId(stagingProducts[i].staging_product_id, stagingProductPriceSetInfo);
        }
      }
      //Update Shopify      
      await ShopifyAPI.updateShopifyPricingByShopifyVariantId(rushProduct[0].shopifyStoreId, rushProduct[0].shopifyStoreName, rushProduct[0].shopifyVariantId, price, msrp);
      resp.data = updateProductPrice.rows;
    }
  }
  return resp;
}

module.exports = {
  updateProductPriceBySku
}