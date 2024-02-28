'use strict';

const express = require('express');
const router = express.Router();

const logUtils = require('../utils/logUtils');
const { respond } = require('../utils/response');



//
//  GET /adsFeed
//
router.get(`/`, async (req, res, next) => {
  try {
    var limit = 0;
    var offset = 0;
    var resp = {
      statusCode: 200,
      message: 'Success.',
      metaData: {
        totalCount: 11716
      },
      data: {
        products: []
      }
    };
      

    resp.data.products.push({
      id: '1712CFF8BE8',
      itemGroupId: '1712CFF8BE8',
      title: 'Osborne 1 Light Wall Sconce',
      description: null,
      price: 40.99,
      condition: 'Used',
      link: 'https://www.rushmarket.com/product/1712CFF8BE8?utm_source=google&utm_medium=googleshopping',
      availability: 'in stock',
      imageLink: 'https://rushimages.blob.core.windows.net/rush/vendor/5d2692f000000125140056e5/1000261/10016-18094045-1585255184838.jpg?utm_source=google&utm_medium=googleshopping',
      productCategory: 'Lighting > Wall Lights and Sconces',
      brand: 'Capital Lighting',
      gtin: '841224059197',
      mpn: '1231PN-451',
      identifierExists: 'Y',
      color: 'Silver',
      material: 'Metal',
      size: null,
      productDetail: null,
      adsRedirect: 'https://www.rushmarket.com/product/1712CFF8BE8',
      productHighlight: 'This Open Box item has been inspected by our team deemed to be in excellent condition with no physical flaws, scratches, or scuffs.',
      nationallyShippableFlag: true,
      regionInfo: []
    })
    resp.data.products.push({
      id: '17316A11006',
      itemGroupId: '17316A11006',
      title: 'Darden Solid Semi-Sheer Grommet Single Curtain Panel - 108", Single, Chocolate',
      description: null,
      price: 17.99,
      condition: 'Used',
      link: 'https://www.rushmarket.com/product/17316A11006?utm_source=google&utm_medium=googleshopping',
      availability: 'in stock',
      imageLink: '//rushimages.blob.core.windows.net/catalog/vendors/5d2692f000000125140056e5/images/Darden+Solid+Color+Semi-Sheer+Grommet+Single+Curtain+Panel-1620189630463.jpg?utm_source=google&utm_medium=googleshopping',
      productCategory: 'Decor > Curtains and Hardware',
      brand: 'Three Posts',
      gtin: '192263663433',
      mpn: '1Q803708CT',
      identifierExists: 'Y',
      color: 'Brown, Gold',
      material: 'Fabric',
      size: '108"',
      productDetail: null,
      adsRedirect: 'https://www.rushmarket.com/product/17316A11006',
      productHighlight: 'This Open Box item has been inspected by our team deemed to be in excellent condition with no physical flaws, scratches, or scuffs.',
      nationallyShippableFlag: true,
      regionInfo: []
    })
    resp.data.products.push({
      id: '16F78615E2C',
      itemGroupId: '16F78615E2C',
      title: 'Carmen 4-Light Foyer Pendant',
      description: null,
      price: 49.99,
      condition: 'Used',
      link: 'https://www.rushmarket.com/product/16F78615E2C?utm_source=google&utm_medium=googleshopping',
      availability: 'out of stock',
      imageLink: '//rushimages.blob.core.windows.net/catalog/vendors/5d2692f000000125140056e5/images/Carmen+4+-+Light+Lantern+Geometric+Pendant-1620264033921.jpg?utm_source=google&utm_medium=googleshopping',
      productCategory: 'Lighting > Pendant Lights',
      brand: 'TransGlobe Lighting',
      gtin: '736916643016',
      mpn: '10264 ASL',
      identifierExists: 'Y',
      color: 'Gray',
      material: 'Metal',
      size: null,
      productDetail: 'General:Style: Transitional',
      adsRedirect: 'https://www.rushmarket.com/product/16F78615E2C',
      productHighlight: 'This Open Box item has been inspected by our team deemed to be in excellent condition with no physical flaws, scratches, or scuffs.',
      nationallyShippableFlag: false,
      regionInfo: [{
        regionId: '006814400',
        price: 49.99,
        availability: "in stock"
      },
      {
        regionId: '006625100',
        price: 49.99,
        availability: "in stock"
      },
      {
        regionId: '008090100',
        price: 49.99,
        availability: "in stock"
      }]
    })


    respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})



module.exports = router