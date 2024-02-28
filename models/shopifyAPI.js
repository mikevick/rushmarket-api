'use strict';

const ShopifyStores = require('../models/shopifyStores');
var axios = require('axios');

var updateShopifyPricingByShopifyVariantId = async (shopifyStoreId, shopifyStoreName, shopifyVariantId, price, msrp) => {
  let queryString = `/admin/api/2021-04/variants/${shopifyVariantId}.json`;
  let requestType = "PUT";
  let updateProduct = {
    variant: {
      id: shopifyVariantId,
      price: price,
      compare_at_price: msrp
    }
  };

  let shopifyResp = await genericShopifyRequest(shopifyStoreId, shopifyStoreName, queryString, requestType, updateProduct);
  return shopifyResp;

}

var genericShopifyRequest = async (shopifyStoreId, shopifyStoreName, queryString, requestType, productData) => {
  try {
    let shopifyCreds = await ShopifyStores.getKeys(shopifyStoreId, 'BACKEND');
    //console.log(shopifyCreds);

    let url = `https://${shopifyCreds.apiKey}:${shopifyCreds.apiPswd}@${shopifyStoreName}${queryString}`;

    let options = {
        method: requestType,
        json: true,
        resolveWithFullResponse: true,
        headers: {
            // 'X-Shopify-Access-Token': shopifyCreds.sharedSecret,
            'content-type': 'application/json',
            'accept': 'application/json'
        },
    };

    let shopifyResponse = await axios.post(url, productData, options);
    console.log(shopifyResponse);
        // if (response.status == 201) {
        //     resolve();
        // } else {
        //     resolve();
        // }
      return shopifyResponse;
  } catch(e) {
    console.log(e);
    return e;
  }
}


module.exports = {
  updateShopifyPricingByShopifyVariantId
};