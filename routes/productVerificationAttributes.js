'use strict';

const express = require('express');
const router = express.Router();

const memberText = require('../utils/memberTextUtils');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');
const Products = require('../actions/products');
const RushProducts = require('../actions/rushProducts');
const CategoryMappings = require('../actions/categoryMappings');
const CategoryAttributes = require('../actions/categoryAttributes');
const ProductDisplayAttributes = require('../actions/productDisplayAttributes');

router.get('/', async (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };
  let whereInfo = {
    clause: 'where 1=1',
    values: []
  };

  try {
    //Set default values
    let limit = 10;
    let offset = 0;

    // required fields:
    if (req.query.vendorId === undefined || req.query.vendorSku === undefined || req.query.ourSku === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'vendorId, vendorSku, ourSku'));
    } else {
      //get vendor catalog data
      let vcResp = {
        statusCode: 200,
        message: 'Success.',
        metaData: {
          totalCount: 0
        },
        data: {}
      };
      let vcWhereInfo = {
        join: '',
        clause: '',
        values: []
      };
      let vcSortBy = 'product_name ASC';
      let vendorCatalogProductData = {};

			vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, 'p.vendor_id = ?', req.query.vendorId);
      vcWhereInfo = sqlUtils.appendWhere(vcWhereInfo, 'p.vendor_sku = ?', req.query.vendorSku);
      let vendorCatalogProductDataResponse = await Products.getAll(vcWhereInfo, vcSortBy, offset, limit, vcResp, undefined, undefined);
      if (vendorCatalogProductDataResponse.statusCode === 200 && vendorCatalogProductDataResponse.data.products.length > 0) {
        vendorCatalogProductData = vendorCatalogProductDataResponse.data.products[0];
      }

      //get rush product data
      let rpResp = {
        statusCode: 200,
        message: 'Success.',
        metaData: {
          totalCount: 0
        },
        data: {
          rushProducts: []
        }
      };
      let rpWhereInfo = {
        clause: ' WHERE 1=1 ',
        values: []
      };
      let rpSortBy = 'p.sku DESC'; 
      let rushProductData = {}
      let includeShippingBoxes = false;
      let includeBubble = false;
      let removeProductsWithIssues = false;
      let onlineEligibleLocation = false;

      rpWhereInfo = sqlUtils.appendWhere(rpWhereInfo, 'p.sku = ?', req.query.ourSku);
      let rushProductDataResponse = await RushProducts.getAllProductsLite(includeShippingBoxes, includeBubble, removeProductsWithIssues, onlineEligibleLocation, rpWhereInfo, rpSortBy, offset, limit, rpResp);
      if (rushProductDataResponse.statusCode === 200 && rushProductDataResponse.data.rushProducts.length > 0) {
        rushProductData = rushProductDataResponse.data.rushProducts[0];
      }
      
      //set 
      let dimensionType = 'standard';
      let categoryMappingData = {};
      let categoryAttributeData = {};
      let productAttributeData = {};
      let productDisplayAttributesArray = [];

      let category1 = '';
      let category2 = '';

      //find the product category
      if (vendorCatalogProductData.primaryCategory != null) {
        category1 = vendorCatalogProductData.primaryCategory;
        category2 = '';
        if (vendorCatalogProductData.secondaryCategory != null) {
          category2 = vendorCatalogProductData.secondaryCategory;
        }
      } else {
        category1 = rushProductData.category1Name;
        category2 = rushProductData.category2Name;
      }

      // get category mappings based on categories found above
      let cmResp = {
        statusCode: 200,
        message: 'Success.',
        metaData: {
          totalCount: 0
        },
        data: {}
      };
      let cmWhereInfo = {
        clause: 'where 1=1',
        values: []
      };
      let cmSortBy = "category_id ASC";
      cmWhereInfo = sqlUtils.appendWhere(cmWhereInfo, 'category_1 = ?', category1);
      cmWhereInfo = sqlUtils.appendWhere(cmWhereInfo, 'category_2 = ?', category2);
      let categoryMappingsResp = await CategoryMappings.getAll(cmWhereInfo, cmSortBy, offset, limit, cmResp);
      if (categoryMappingsResp.statusCode === 200 && categoryMappingsResp.data.categoryMappings.length > 0) {
        categoryMappingData = categoryMappingsResp.data.categoryMappings[0];
        let caResp = {
          statusCode: 200,
          message: 'Success.',
          metaData: {
            totalCount: 0
          },
          data: {}
        };
        let caWhereInfo = {
          clause: 'where 1=1',
          values: []
        };
        let caSortBy = 'c.category_id ASC';
         
        caWhereInfo = sqlUtils.appendWhere(caWhereInfo, 'c.category_id = ?', categoryMappingData.categoryId);
        let categoryAttributesResp = await CategoryAttributes.getAll(caWhereInfo, caSortBy, offset, limit, caResp);
        if (categoryAttributesResp.statusCode === 200 && categoryAttributesResp.data.categoryAttributes.length > 0) {
          categoryAttributeData = categoryAttributesResp.data.categoryAttributes[0];
          productAttributeData["categoryId"] = categoryMappingData.categoryId;
          productAttributeData["categoryName1"] = categoryMappingData.category1;
          productAttributeData["categoryName2"] = categoryMappingData.category2;
          productAttributeData["attributeId1"] = categoryAttributeData.attributeId1;
          productAttributeData["attributeName1"] = categoryAttributeData.attributeName1;
          productAttributeData["attributeId2"] = categoryAttributeData.attributeId2;
          productAttributeData["attributeName2"] = categoryAttributeData.attributeName2;
          productAttributeData["attributeId3"] = categoryAttributeData.attributeId3;
          productAttributeData["attributeName3"] = categoryAttributeData.attributeName3;
        }

        //console.log(productAttributeData);
        let pdaResp = {
          statusCode: 200,
          message: 'Success.',
          metaData: {
            totalCount: 0
          },
          data: {}
        };
        let pdaWhereInfo = {
          clause: 'where 1=1',
          values: []
        };
        let pdaSortBy = "sku ASC";
      
        pdaWhereInfo = sqlUtils.appendWhere(pdaWhereInfo, 'sku = ?', req.query.ourSku);
        let productDisplayAttributesResp = await ProductDisplayAttributes.getAll(pdaWhereInfo, pdaSortBy, offset, limit, pdaResp);
        if (productDisplayAttributesResp.statusCode === 200 && productDisplayAttributesResp.data.productDisplayAttributes.length > 0) {
          productDisplayAttributesArray = productDisplayAttributesResp.data.productDisplayAttributes;
          for (let i=0; i<productDisplayAttributesArray.length; i++) {
            switch (productDisplayAttributesArray[i].attributeName.toUpperCase()) {
              case productAttributeData.attributeName1.toUpperCase():
                productAttributeData[productAttributeData.attributeName1] = productDisplayAttributesArray[i];
                break;
              case productAttributeData.attributeName2.toUpperCase():
                productAttributeData[productAttributeData.attributeName2] = productDisplayAttributesArray[i];
                break;
              case productAttributeData.attributeName3.toUpperCase():
                productAttributeData[productAttributeData.attributeName3] = productDisplayAttributesArray[i];
                break;
            }
          }
        }
        resp.data = productAttributeData;
        response.respond(resp, res, next);
      }
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

module.exports = router;

    
