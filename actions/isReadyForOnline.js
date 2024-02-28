'use strict';

const RushProducts = require('../models/rushProducts');
const Files = require('../models/files');
const Products = require('../models/products');
const Vendors = require('../models/vendors');
const sqlUtils = require('../utils/sqlUtils');

var getIsReadyForOnline = async (sku, skipReleaseDate, resp) => {

  let isReady = {
    product: '',
    productIssues: '',
    vendorProduct: '',
    vendor: '',
    parsedVendorProduct: '',
    parsedQuickSaleProduct: '',
    disablePutOnline: false,
    reasons: []
  };

  //Get Rush product info (isReady.product)
  let rushProductsResp = {
    totalCount: 0,
    rushProducts: []
  };
  let rushProductWhereInfo = {
    clause: 'where 1=1',
    values: []
  };
  rushProductWhereInfo = sqlUtils.appendWhere(rushProductWhereInfo, 'p.sku = ?', sku);
  rushProductsResp = await RushProducts.getAllProducts(undefined, undefined, undefined, undefined, rushProductWhereInfo, '', 0, 9999);
  if (rushProductsResp.rushProducts.length > 0) {
    isReady.product = rushProductsResp.rushProducts[0];
    
    //Check if it's already online; validation is only needed when it's not
    if (isReady.product.onlineShopping === 'N') {
      //check product datapoints for eligibility
      // check for in market exclusive
      if (isReady.product.inMarketExclusive === 'Y') {
        isReady.reasons.push('The SKU is an in market exclusive.');
        isReady.disablePutOnline = true;
      }

      // check for shopify product and variant id
      if (isReady.product.shopifyProductId === null || isReady.product.shopifyProductId === undefined || isReady.product.shopifyProductId === 0 || isReady.product.shopifyVariantId === null || isReady.product.shopifyVariantId === undefined || isReady.product.shopifyVariantId === 0) {
        isReady.reasons.push('The SKU does not have a Shopify Product ID and/or a Shopify Variant ID.');
        isReady.disablePutOnline = true;
      }

      // check for product issues queue resolution
      if(isReady.product.resolved !== null && isReady.product.resolved !== undefined && isReady.product.resolved == 0){
        isReady.reasons.push(`The <a href="/#application.homeDirectory#/products/product_issues_queue?search=1&sku=${sku}">product issues record</a> has not been resolved yet.`);
        isReady.disablePutOnline = true;
      }

      // if the product issue checkbox is checked on product info, dont let it go online
      if(isReady.product.productIssue === 'Y'){
        isReady.reasons.push('The SKU has product issue checked.');
        isReady.disablePutOnline = true;
      }

      // check for a price in corelink
      if(isReady.product.price === null || isReady.product.price === undefined || isReady.product.price <= 0){
        isReady.reasons.push('The SKU does not have a price.');
        isReady.disablePutOnline = true;
      }

      // check to see if build/inspect is complete
      // STS can ignore this... they dont need BI
      if(isReady.product.manifestSource !== 'DS'){
          if(isReady.product.biDone === 0){
            isReady.reasons.push('The SKU has not completed build/inspect.');
            isReady.disablePutOnline = true;
          }
      }

      // check for location eligibility
      if(isReady.product.onlineEligible !== 'Y'){
        isReady.reasons.push('The SKU is not in an online eligible location.');
        isReady.disablePutOnline = true;
      }  

      // check for okay to release
      if(skipReleaseDate === null || skipReleaseDate === undefined || skipReleaseDate === false){
        // STS and auto online skus are not subject to a release date check
        if(isReady.product.manifestSource !== 'DS' && isReady.product.autoOnlineSkus === 'N'){
          // when there is no release date
          if(isReady.product.dateToRelease === null || isReady.product.dateToRelease === undefined){
            isReady.reasons.push('SKU is not yet scheduled to go online.');
            isReady.disablePutOnline = true;
          } else {
            let now = moment.tz('America/Chicago');
            if (isReady.product.dateToRelease.tz('America/Chicago').diff(now.tz('America/Chicago'), 'days') > 0) {
              isReady.reasons.push(`SKU is scheduled to go online ${isReady.product.dateToRelease}.`);
              isReady.disablePutOnline = true;
            }            
          }
        }
      }

      //Get Vendor Catalog Product Data
      let vcWhereInfo = {
        join: '',
        clause: '',
        values: []
      };
      let vcLimit = 1;
      let vcOffset = 0;
      let vcSortBy = 'product_name ASC';

      vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, 'p.vendor_id = ?', isReady.product.vendorId);
      vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, 'p.vendor_sku = ?', isReady.product.sellerProductId);
      let vcResult = await Products.getAll(vcWhereInfo, vcSortBy, vcOffset, vcLimit, undefined);
      if (vcResult.products.length > 0) {
        isReady.vendorProduct = vcResult.products[0];
        //format the data from the vendor catalog differently:
        isReady.parsedVendorProduct = await getVendorProductForOnline(isReady.vendorProduct,isReady.product);
      }

      //Online Quick Sale Validation
      if(isReady.product.onlineQuickSale === 'Y') {

        // check the name
        if(!isReady.product.name.trim().length) {
          isReady.reasons.push('The SKU does not have a name.');
          isReady.disablePutOnline = true;
        }

        // check the manufacturer
        if(!isReady.product.manufacturer.trim().length) {
          isReady.reasons.push('The SKU does not have a manufacturer.');
          isReady.disablePutOnline = true;
        }

        // check the image
        if(!isReady.product.image.trim().length) {
          isReady.reasons.push('The SKU does not have an image.');
          isReady.disablePutOnline = true;
        }

        isReady.parsedQuickSaleProduct = await getQuickSaleProductForOnline(isReady.product);
      } else {


        // check for max variants flag
        if(isReady.product.shopifyMaxVariants === 'Y'){
          isReady.reasons.push('Cannot be pushed to online as variant count maxed out at 100. Can only be sold as "Custom Sale".');
          isReady.disablePutOnline = true;
        }

        // In the case we didn't get the vendor catalog data, try again
        if (isReady.vendorProduct.id === null || isReady.vendorProduct.id === undefined) {
          // vendor product not found by vendorSKU... looks like a possible UPC match
          if(Number.parseInt(isReady.product.sellerProductId) > 0 && isReady.product.sellerProductId.length >= 9) {
            vcWhereInfo = {
              join: '',
              clause: '',
              values: []
            };
            vcLimit = 1;
            vcOffset = 0;
            vcSortBy = 'product_name ASC';
      
            vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, 'p.vendor_id = ?', isReady.product.vendorId);
            vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, 'p.upc = ?', isReady.product.sellerProductId);
            let vcResult = await Products.getAll(vcWhereInfo, vcSortBy, vcOffset, vcLimit, undefined);
            if (vcResult.products.length > 0) {
              isReady.vendorProduct = vcResult.products[0];
              //format the data from the vendor catalog differently:
              isReady.parsedVendorProduct = await getVendorProductForOnline(isReady.vendorProduct,isReady.product);
            } else {
              isReady.reasons.push(`${isReady.product.sellerProductId} was not found as either a UPC or Vendor SKU in the Vendor Catalog.`);
              isReady.disablePutOnline = true;
            }
          } else {
            isReady.reasons.push(`Vendor SKU ${isReady.product.sellerProductId} was not found in the Vendors Catalog.`);
            isReady.disablePutOnline = true;
          }
        }

        // check the vendor catalog data for issues
        if (isReady.vendorProduct.id === null || isReady.vendorProduct.id === undefined) {
          // get vendor data for better error
          let vResult = await Vendors.getById(isReady.product.vendor_id);
          if (vResult.length === 1) {
            isReady.vendor = vResult[0];
            isReady.reasons.push(`Vendor is ${isReady.vendor.name}`);
          } else if (vResult.length > 1) {
            isReady.reasons.push(`More than 1 vendor was found for vendor ID ${isReady.product.vendor_id}.`);
          } else {
            isReady.reasons.push('Could not determine which vendor the product is from.');
          }
        } else {
          // check for vendor catalog minimum data
          if(isReady.vendorProduct.eligibleForTrm === null || isReady.vendorProduct.eligibleForTrm === undefined || isReady.vendorProduct.eligibleForTrm === 0) { 
            isReady.reasons.push(`The <a href="/#application.homeDirectory#/spa/products/${isReady.vendorProduct.id}">Vendor Catalog product</a> is not TRM eligible.`);
            isReady.disablePutOnline = true;
          }
        }
      }
    } else {
      isReady.reasons.push('The SKU is already online.');
    }
  } else {
    isReady.reasons.push(`SKU ${sku} not found.`);
    isReady.disablePutOnline = true;
  }

  if (isReady.disablePutOnline === false) {
    isReady.reasons.push('The SKU is online eligible.');
  }
  resp.data.isReadyForOnline = isReady;
  return resp; 
}

var getQuickSaleProductForOnline = async(productData) => {
  let resp = {
    id: productData.productId,
    sku: productData.sku,
    shopifyProductId: (productData.shopifyProductId != null) ? productData.shopifyProductId : '',
    shopifyVariantId: (productData.shopifyVariantId != null) ? productData.shopifyVariantId : '',
    name: productData.name,
    brand: productData.manufacturer,
    description: '',
    tags: '',
    sizeTag: '',
    colorTag: '',
    materialTag: '',
    shipTypeTag: '',
    productImages: ''
  };

  let whereInfo = {
    join: '',
    clause: '',
    values: []
  };
  let sortBy = 'tag DESC';

  whereInfo = sqlUtils.appendWhere(whereInfo, 'sku = ?', productData.sku);
  whereInfo = sqlUtils.appendWhere(whereInfo, 'tag in (?)');
  whereInfo.values.push(['market','damage']);
  let fileResult = await Files.getAll(whereInfo, sortBy);
  let image = {};
  if (fileResult.rows.length > 0) {
    fileResult.rows.forEach( (i) => {
      image = {
        url: (i.url.split(':')[0] === 'http' || i.url.split(':')[0] === 'https') ? i.url : `http:${i.url}`,
        tag: (i.tag !== null) ? i.tag : '',
        alt: productData.sku
      }
      resp.productImages.push(image);
    })
  }

  return resp;
}


var getVendorProductForOnline = async(vendorData,productData) => {
  let resp = {
    id: vendorData.id,
    sku: productData.sku,
    shopifyProductId: productData.shopifyProductId,
    shopifyVariantId: productData.shopifyVariantId,
    name: (vendorData.productName != null) ? vendorData.productName : '',
    brand: (vendorData.brandName != null) ? vendorData.brandName : '',
    description: '',
    tags: '',
    sizeTag: '',
    colorTag: '',
    materialTag: '',
    shipTypeTag: '',
    productImages: ''
  };

  return resp;
}

module.exports = {
  getIsReadyForOnline
}
