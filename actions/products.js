'use strict'

const globals = require('../globals')

const excel = require('exceljs')
const _ = require('lodash')

const {
  calculateCost,
  calculateCubicInches,
  getBoxes,
  isPartnerFeeCharged,
  liveCheck
} = require('../actions/productsProcessCommon')
const vendorActions = require('../actions/vendors')

const Manifests = require('../models/manifests')
const Receiving = require('../models/receiving')
const RushCategories = require('../models/rushCategories')
const RushProducts = require('../models/rushProducts')
const Products = require('../models/products')
const ProductsProcess = require('../models/productsProcessCommon')
const StagingProducts = require('../models/stagingProduct')
const SupplierCodes = require('../models/supplierCodes')
const Vendors = require('../models/vendors')

const logUtils = require('../utils/logUtils')
const memberText = require('../utils/memberTextUtils')
const sqlUtils = require('../utils/sqlUtils')
const productUtils = require('../utils/productUtils')
const { formatResp } = require('../utils/response')

// Force an update

var fixUpUPCs = async () => {
  var inputWorkbook = new excel.Workbook()
  var inputWorksheet = null
  var filename = process.env.FIXUP_SHEET ? process.env.FIXUP_SHEET : 'C:/Users/Matt/downloads/fixup-complex.xlsx'

  var p = await inputWorkbook.xlsx.readFile(filename)
  inputWorksheet = inputWorkbook.getWorksheet(1)

  var rows = inputWorksheet.rowCount
  var cols = inputWorksheet.columnCount

  // console.log(rows + " rows " + cols + " cols");

  for (var i = 2; i <= rows; i++) {
    var vendorSku = undefined
    vendorSku = inputWorksheet.getCell('A' + i).text
    var upc = undefined
    upc = inputWorksheet.getCell('B' + i).text
    var price = undefined
    price = inputWorksheet.getCell('C' + i).text
    var coin = undefined
    coin = inputWorksheet.getCell('D' + i).text
    var upcCoin = undefined
    upcCoin = inputWorksheet.getCell('E' + i).text

    // console.log(i + " " + vendorSku + " " + upc + " " + price + " " + coin);

    // if (upcCoin !== '#N/A') {
    // 	console.log("******  Already a UPC Coin: " + upcCoin + " for vendor sku " + vendorSku);
    // 	continue;
    // }

    var prod = await Products.checkByUpc(upc, vendorSku)
    var vskuCoin = await Products.checkVendorSku(vendorSku)
    var coinInfo = await Products.checkCoinInfo(coin, vendorSku)

    //	Updte UPC on the product.
    var results = await Products.updateUPC(upc, price, vendorSku)
    if (results.affectedRows !== 1) {
      // console.log("UPC " + upc + " vendor sku " + vendorSku + " update unexpected affected rows: " + results.affectedRows);
      process.exit(1)
    }

    //	Sanity check vendor sku coin
    if (vskuCoin.length !== 1) {
      console.log('Should only have one vendor sku coin entry for ' + vendorSku)
    }

    //	Sanity check coin info
    if (coinInfo.length > 1) {
      console.log('****** Expected 0 or 1 rows from coin info ' + coin)
    }

    //	If no products have the new UPC
    if (prod.length === 0) {
      //	If no coin to upc mapping already
      if (coinInfo[0].upc === null) {
        // console.log("insert ");
        results = await Products.insertUPCCoin(coin, upc)
        if (results.affectedRows !== 1) {
          console.log('Unexpected affected rows on insert ' + coin + ' ' + upc + ' ' + results.affectedRows)
          process.exit(1)
        }
      } else {
        results = await Products.updateUPCCoin(coinInfo[0].upccoinid, upc)
        if (results.affectedRows !== 1) {
          console.log('Unexpected affected rows on update ' + coin + ' ' + upc + ' ' + results.affectedRows)
          process.exit(1)
        }
      }
    } else {
      if (coinInfo.length === 0) {
        console.log('******  No coin ' + coin + ' ' + upc + ' ' + vendorSku)
        // process.exit(1);
      } else if (coinInfo.length > 1) {
        console.log(
          '******  Unexpected number of coin rows: ' + coinInfo.length + ' ' + coin + ' ' + upc + ' ' + vendorSku
        )
        // process.exit(1);
      } else if (coinInfo[0].upc === null) {
        console.log('******  Missing UPC COIN: ' + coin)
        Products.insertUPCCoin(coin, upc)
      }
    }
  }

  // console.log("outside loop");
}

//
//	GET all products
//
var getAll = async (where, sortBy, offset, limit, resp, bubbleId, rmCatId, manifestId, filter, storeIdRows) => {
  let stagingProducts = []

  //	Retrieve relevant category mappings if a category ID was supplied.
  if (rmCatId !== undefined) {
    if (typeof rmCatId === 'string' && rmCatId.length > 0) {
      var mappings = null
      if (rmCatId.indexOf(',') >= 0) {
        mappings = await RushCategories.getMappingsByIds(rmCatId)
      } else {
        mappings = await RushCategories.getMappingsById(rmCatId)
      }
    } else {
      mappings = await RushCategories.getMappingsById(rmCatId)
    }
    if (mappings.length > 0) {
      var w = ''
      var v = []
      for (var i = 0; i < mappings.length; i++) {
        if (w.length > 0) {
          w = w + ' OR '
        }
        w = w + '(primary_category = ? AND secondary_category = ?)'
        v.push(mappings[i].cat1)
        v.push(mappings[i].cat2)
      }

      var finalW = '(' + w + ')'
      sqlUtils.appendWhere(where, finalW, v)
    }
  }

  //	If a manifestId is supplied:
  //	1. get staging_product records filtered by filter and manifest_id
  //	2. Lookup manifest record to get vendorId
  // 	3. Use staging_product results and vendorId to get the related VC products.
  //	4. For each VC product attach staging_product.quantity_available and staging_product.check_in_note.
  if (manifestId) {
    let storeIdList = ''
    for (var i = 0; i < storeIdRows.length; i++) {
      if (storeIdList.length) {
        storeIdList += ', '
      }
      storeIdList += `${storeIdRows[i].storeId}`
    }

    stagingProducts = await StagingProducts.getByManifestAndFilter(manifestId, filter, storeIdList)
    let manifest = await Manifests.getById(manifestId)
    let values = []
    if (stagingProducts.length && manifest.rows.length) {
      var placeholders = ''
      for (var i = 0; i < stagingProducts.length; i++) {
        if (placeholders.length > 0) {
          placeholders += ', '
        }
        placeholders += '?'

        values.push(stagingProducts[i].sellerProductId)
      }
      where = sqlUtils.appendWhere(where, 'p.vendor_id = ?', manifest.rows[0].vendorId)
      where = sqlUtils.appendWhere(where, 'p.vendor_sku IN (' + placeholders + ')', values)
    } else {
      formatResp(resp, undefined, 200, 'Products not found.')
      return resp
    }
  }

  var result = await Products.getAll(where, sortBy, offset, limit, bubbleId)
  resp.metaData.totalCount = result.totalCount
  if (result.products.length === 0) {
    formatResp(resp, undefined, 200, 'Products not found.')
  } else {
    if (stagingProducts.length) {
      result.products.map(product => {
        let temp = _.find(stagingProducts, function (p) {
          return p.sellerProductId === product.vendorSku
        })
        if (temp) {
          product.quantityAvailable = temp.quantityAvailable
          product.checkInNote = temp.checkInNote;
        }
      })
    }

    resp.data.products = result.products
  }
  return resp
}

// //
// //	GET ambiguous products
// //
var getAmbiguous = async (whereInfo, sortByField, sortByDir, offset, limit, liveProductsFlag, resp) => {
  var products = []
  var prom = []
  var result = await Products.getAmbiguous(whereInfo, offset, limit)
  var rushWhereInfo = {
    clause: '',
    values: [],
  }

  if (result.products.length === 0) {
    formatResp(resp, undefined, 200, 'Products not found.')
  } else {
    prom.push(formatAmbiguousCoins(result, products))
    if (liveProductsFlag) {
      prom.push(RushProducts.getLiveVendorSkuInAmbiguousCoin())
    }

    var results = await Promise.all(prom)

    if (liveProductsFlag) {
      var rushProds = []

      rushProds = results[1]
      // for (var i = 0; i < results[1].length; i++) {
      // 	rushProds.push(results[1[0]);
      // }

      for (var i = 0; i < products.length; i++) {
        for (var j = 0; j < products[i].vendorSkus.length; j++) {
          var found = _.find(rushProds, function (p) {
            var result =
              p.vendorId === products[i].vendorSkus[j].vendorId &&
              p.sellerProductId === products[i].vendorSkus[j].vendorSku
            return result
          })
          if (found !== undefined) {
            products[i].liveCount = found.qty
            products[i].vendorSkus[j].liveFlag = true
          }
        }
      }

      products = _.remove(products, function (p) {
        return p.liveCount > 0
      })
    }

    resp.metaData.totalCount = products.length

    for (var i = 0; i < products.length; i++) {
      products[i].vendorSkuCount = products[i].vendorSkus.length
    }

    // Order by logic
    products = _.orderBy(products, [sortByField], [sortByDir])

    //	limit and offset logic.
    if (limit + offset >= products.length) {
      limit = products.length
    }

    var plen = products.length
    for (var i = 0; i < plen; i++) {
      if (i < offset) {
        products.shift()
      }

      if (i >= offset + limit) {
        products.pop()
      }
    }

    resp.data.products = products
  }
  return resp
}

var formatAmbiguousCoins = async (result, products) => {
  var coin = {}
  var lastCoin = ''

  for (var i = 0; i < result.products.length; i++) {
    if (result.products[i].coinId !== lastCoin) {
      if (coin.coinId !== undefined) {
        if (coin.vendorSkus.length > 1 && (coin.pullDataForwardCount === 0 || coin.pullDataForwardCount > 1)) {
          products.push(coin)
        }
      }

      lastCoin = result.products[i].coinId
      coin = {}
      coin.coinId = lastCoin
      coin.pullDataForwardCount = 0
      coin.liveCount = 0
      coin.vendorSkus = []
    }

    coin.vendorSkus.push({
      id: result.products[i].id,
      liveFlag: false,
      vendorName: result.products[i].name,
      vendorId: result.products[i].vendorId,
      vendorSku: result.products[i].vendorSku,
      productName: result.products[i].productName,
      pullDataForwardFlag: result.products[i].pullDataForwardFlag === 1 ? true : false,
      shipType: result.products[i].shipType,
      productWidth: result.products[i].productWidth,
      productDepth: result.products[i].productDepth,
      productHeight: result.products[i].productHeight,
      primaryMaterial: result.products[i].primaryMaterial,
      secondaryMaterial: result.products[i].secondaryMaterial,
      primaryColor: result.products[i].primaryColor,
      bulletPoint1: result.products[i].bulletPoint1,
      bulletPoint2: result.products[i].bulletPoint2,
      bulletPoint3: result.products[i].bulletPoint3,
      bulletPoint4: result.products[i].bulletPoint4,
      productDescription: result.products[i].productDescription,
      mainImageKnockout: result.products[i].mainImageKnockout,
      mainImageLifestyle: result.products[i].mainImageLifestyle,
      altImage3: result.products[i].altImage3,
      altImage4: result.products[i].altImage4,
      altImage5: result.products[i].altImage5,
      styleTag1: result.products[i].styleTag1,
      styleTag2: result.products[i].styleTag2,
      numberOfBoxes: result.products[i].numberOfBoxes,
      shippingWeight1: result.products[i].shippingWeight1,
      packageHeight1: result.products[i].packageHeight1,
      packageWidth1: result.products[i].packageWidth1,
      packageLength1: result.products[i].packageLength1,

      shippingWeight2: result.products[i].shippingWeight2,
      packageHeight2: result.products[i].packageHeight2,
      packageWidth2: result.products[i].packageWidth2,
      packageLength2: result.products[i].packageLength2,

      shippingWeight3: result.products[i].shippingWeight3,
      packageHeight3: result.products[i].packageHeight3,
      packageWidth3: result.products[i].packageWidth3,
      packageLength3: result.products[i].packageLength3,

      shippingWeight4: result.products[i].shippingWeight4,
      packageHeight4: result.products[i].packageHeight4,
      packageWidth4: result.products[i].packageWidth4,
      packageLength4: result.products[i].packageLength4,

      shippingWeight5: result.products[i].shippingWeight5,
      packageHeight5: result.products[i].packageHeight5,
      packageWidth5: result.products[i].packageWidth5,
      packageLength5: result.products[i].packageLength5,

      shippingWeight6: result.products[i].shippingWeight6,
      packageHeight6: result.products[i].packageHeight6,
      packageWidth6: result.products[i].packageWidth6,
      packageLength6: result.products[i].packageLength6,

      shippingWeight7: result.products[i].shippingWeight7,
      packageHeight7: result.products[i].packageHeight7,
      packageWidth7: result.products[i].packageWidth7,
      packageLength7: result.products[i].packageLength7,

      shippingWeight8: result.products[i].shippingWeight8,
      packageHeight8: result.products[i].packageHeight8,
      packageWidth8: result.products[i].packageWidth8,
      packageLength8: result.products[i].packageLength8,

      shippingWeight9: result.products[i].shippingWeight9,
      packageHeight9: result.products[i].packageHeight9,
      packageWidth9: result.products[i].packageWidth9,
      packageLength9: result.products[i].packageLength9,

      shippingWeight10: result.products[i].shippingWeight10,
      packageHeight10: result.products[i].packageHeight10,
      packageWidth10: result.products[i].packageWidth10,
      packageLength10: result.products[i].packageLength10,

      shippingWeight11: result.products[i].shippingWeight11,
      packageHeight11: result.products[i].packageHeight11,
      packageWidth11: result.products[i].packageWidth11,
      packageLength11: result.products[i].packageLength11,

      shippingWeight12: result.products[i].shippingWeight12,
      packageHeight12: result.products[i].packageHeight12,
      packageWidth12: result.products[i].packageWidth12,
      packageLength12: result.products[i].packageLength12,

      shippingWeight13: result.products[i].shippingWeight13,
      packageHeight13: result.products[i].packageHeight13,
      packageWidth13: result.products[i].packageWidth13,
      packageLength13: result.products[i].packageLength13,

      shippingWeight14: result.products[i].shippingWeight14,
      packageHeight14: result.products[i].packageHeight14,
      packageWidth14: result.products[i].packageWidth14,
      packageLength14: result.products[i].packageLength14,

      shippingWeight15: result.products[i].shippingWeight15,
      packageHeight15: result.products[i].packageHeight15,
      packageWidth15: result.products[i].packageWidth15,
      packageLength15: result.products[i].packageLength15,

      shippingWeight16: result.products[i].shippingWeight16,
      packageHeight16: result.products[i].packageHeight16,
      packageWidth16: result.products[i].packageWidth16,
      packageLength16: result.products[i].packageLength16,

      shippingWeight17: result.products[i].shippingWeight17,
      packageHeight17: result.products[i].packageHeight17,
      packageWidth17: result.products[i].packageWidth17,
      packageLength17: result.products[i].packageLength17,

      shippingWeight18: result.products[i].shippingWeight18,
      packageHeight18: result.products[i].packageHeight18,
      packageWidth18: result.products[i].packageWidth18,
      packageLength18: result.products[i].packageLength18,

      shippingWeight19: result.products[i].shippingWeight19,
      packageHeight19: result.products[i].packageHeight19,
      packageWidth19: result.products[i].packageWidth19,
      packageLength19: result.products[i].packageLength19,

      shippingWeight20: result.products[i].shippingWeight20,
      packageHeight20: result.products[i].packageHeight20,
      packageWidth20: result.products[i].packageWidth20,
      packageLength20: result.products[i].packageLength20,
    })
    if (result.products[i].pullDataForwardFlag) {
      coin.pullDataForwardCount++
    }
  }

  if (coin.coinId !== undefined) {
    if (coin.vendorSkus.length > 1 && (coin.pullDataForwardCount === 0 || coin.pullDataForwardCount > 1)) {
      products.push(coin)
    }
  }
}

//
//	GET product by ID
//
var getById = (req, resp) => {
  return new Promise((resolve, reject) => {
    if (req.get('x-app-type') != 'INT') {
      response.respond(resp, res, next, undefined, 403, 'Access denied.')
    } else {
      Products.getById(req.params.id)
        .then(result => {
          if (result.length === 0) {
            formatResp(resp, undefined, 404, 'Product not found.')
          } else {
            resp.data = result[0]
          }
          resolve(resp)
        })
        .catch(e => {
          reject(e)
        })
    }
  })
}

//
//	GET product categories
//
var getDistinctCategories = (req, offset, limit, resp) => {
  return new Promise((resolve, reject) => {
    if (req.get('x-app-type') != 'INT') {
      response.respond(resp, res, next, undefined, 403, 'Access denied.')
    } else {
      Products.getDistinctCategories(offset, limit)
        .then(result => {
          if (result.categories.length === 0) {
            formatResp(resp, undefined, 404, 'Product categories not found.')
          } else {
            resp.metaData.totalCount = result.totalCount
            resp.data.distinctCategories = result.categories
          }
          resolve(resp)
        })
        .catch(e => {
          reject(e)
        })
    }
  })
}

//
//	GET export formats
//
var getExportFormats = resp => {
  return new Promise((resolve, reject) => {
    Products.getExportFormats()
      .then(result => {
        resp.data.exportFormats = result.rows
        resolve(resp)
      })
      .catch(e => {
        reject(e)
      })
  })
}

//
//	GET export jobs
//
var getExportJobs = async (id, whereInfo, offset, limit, resp) => {
  var result = await Products.getExportJobsBySubmitterId(id, whereInfo, offset, limit)
  resp.metaData.totalCount = result.totalCount
  resp.data.exportJobs = result.rows

  for (var i = 0; i < resp.data.exportJobs.length; i++) {
    delete resp.data.exportJobs[i].submitterId
    delete resp.data.exportJobs[i].whereClause
    delete resp.data.exportJobs[i].filterJson
    delete resp.data.exportJobs[i].submitter
    resp.data.exportJobs[i].context = resp.data.exportJobs[i].storageContext
    delete resp.data.exportJobs[i].storageContext
    delete resp.data.exportJobs[i].id
  }
  return resp
}

var queueExport = async (resp, userId, type, submitterEmail, context, format, filterJSON, where, label, rmCatId) => {
  //	Retrieve relevant category mappings if a category ID was supplied.
  if (rmCatId !== undefined) {
    if (typeof rmCatId === 'string' && rmCatId.length > 0) {
      var mappings = null
      if (rmCatId.indexOf(',') >= 0) {
        mappings = await RushCategories.getMappingsByIds(rmCatId)
      } else {
        mappings = await RushCategories.getMappingsById(rmCatId)
      }
    } else {
      mappings = await RushCategories.getMappingsById(rmCatId)
    }
    if (mappings.length > 0) {
      var w = ''
      var v = []
      for (var i = 0; i < mappings.length; i++) {
        if (w.length > 0) {
          w = w + ' OR '
        }
        w = w + '(primary_category = ? AND secondary_category = ?)'
        v.push(mappings[i].cat1)
        v.push(mappings[i].cat2)
      }

      var finalW = '(' + w + ')'
      sqlUtils.appendWhere(where, finalW, v)
    }
  }

  var id = await Products.createExportJob(userId, type, submitterEmail, context, format, filterJSON, where, label)
  return id
}

var revalidate = async (req, resp) => {
  var counter = 0
  var limit = 1000
  var offset = req.query.offset ? parseInt(req.query.offset) : 0
  var prom = []
  var whereInfo = {
    clause: '',
    values: [],
  }

  var r = await Products.getAll(whereInfo, undefined, offset, limit)
  while (r.products !== undefined && r.products.length > 0) {
    offset += r.products.length

    var products = r.products
    for (var i = 0; i < products.length; i++) {
      console.log(counter + ': ' + products[i].vendorSku)
      // If product meets core requirements, set to ACTIVE, otherwise STUB
      var product = await productUtils.verifyEligibility(products[i], undefined)
      var updateProduct = {}
      updateProduct.status = product.status
      updateProduct.eligibleForTrm = product.eligibleForTrm
      updateProduct.eligibleForInline = product.eligibleForInline
      updateProduct.eligibleForBulkBuys = product.eligibleForBulkBuys
      updateProduct.eligibleForOffPrice = product.eligibleForOffPrice
      updateProduct.eligibleForVendorReturns = product.eligibleForVendorReturns
      updateProduct.eligibleForRetailerReturns = product.eligibleForRetailerReturns
      // updateProduct.eligibleForLimitedQuantityDropship = product.eligibleForLimitedQuantityDropship;
      updateProduct.eligibleForDropship = product.eligibleForDropship
      updateProduct.coreEligibilityErrors = product.coreEligibilityErrors
      updateProduct.trmEligibilityErrors = product.trmEligibilityErrors
      updateProduct.inlineEligibilityErrors = product.inlineEligibilityErrors
      updateProduct.bulkBuysEligibilityErrors = product.bulkBuysEligibilityErrors
      updateProduct.offPriceEligibilityErrors = product.offPriceEligibilityErrors
      updateProduct.costBasedReturnsEligibilityErrors = product.costBasedReturnsEligibilityErrors
      updateProduct.revShareReturnsEligibilityErrors = product.revShareReturnsEligibilityErrors
      // updateProduct.limitedQuantityDropshipEligibilityErrors = product.limitedQuantityDropshipEligibilityErrors;
      updateProduct.dropshipEligibilityErrors = product.dropshipEligibilityErrors
      counter++

      prom.push(Vendors.updateProductById(product.vendorId, product.id, updateProduct))

      if (i % 100 === 0) {
        await Promise.all(prom)
        prom = []
      }
    }

    await Promise.all(prom)
    r = await Products.getAll(whereInfo, undefined, offset, limit)
  }

  return resp
}

var updateShopifyIds = async (req, resp) => {
  var product = await Products.getById(req.params.id)
  if (product === undefined || product.length === 0) {
    resp = formatResp(resp, undefined, 404, memberText.get('MEMBER_404'))
    return resp
  }
  var result = await Products.storeShopifyIds(req)
  return resp
}

var createProduct = async (userId, userType, req, resp) => {
  //	Grab connection here so we can do all the following in the same transaction.
  var conn = await globals.pool.getConnection()

  try {
    await conn.beginTransaction()

    //	Make sure this sku doesn't already exist.
    var p = await Receiving.getProduct(req.body.rushSku)
    if (p.length > 0) {
      resp.statusCode = 409
      resp.message = `Rush sku ${req.body.rushSku} already exists.`
      return
    }

    //	Create/update product_build_inspect record
    await updateBuildInspect(conn, userId, userType, req)

    //	Create staging_product record
    var info = await createStagingProduct(conn, userId, userType, req)
    info.productValues.productCreated = true

    //	Create product_action_log entry.
    await receivedProductActionLog(conn, userId, userType, req, info.context, info.productValues.productCreated)

    //	Create shopify_queue record
    if (info.stagingValues.price !== undefined && info.stagingValues.price !== null && info.stagingValues.price > 0) {
      await ProductsProcess.createShopifyQueue(conn, req.body.rushSku)
    }

    //	Create product_location_log
    await createProductLocationLog(conn, userId, userType, req, info)

    //	If trash
    if (req.body.isTrash) {
      await trashIt(conn, userId, userType, info.context, info.productValues, req)
    }

    //	Update products record
    await Receiving.markProductReceived(conn, info.productValues.productId)

    if (req.body.manifestId && info.context.manifest.defaultProductCondition === 'New') {
      await Receiving.markProductReshipped(conn, info.productValues.productId)
      await reshipProductActionLog(conn, userId, userType, req)

      await Receiving.markProductVerified(conn, info.productValues.productId)
      await verifyProductActionLog(conn, userId, userType, req)

      await Receiving.markProductConditioned(conn, info.productValues.productId)
      await conditionProductActionLog(conn, userId, userType, req)

      await Receiving.markProductNew(conn, info.productValues.productId)
    }

    //	Set next step
    resp.nextStep = await determineNextStep(conn, info.context.product, info.context.rushProduct, userId, userType, req)

    conn.commit()
  } catch (e) {
    conn.rollback()
    resp.statusCode = 500
    resp.message = e.message
    logUtils.logException(e)
  } finally {
    globals.pool.releaseConnection(conn)
  }
}

var determineNextStep = async (conn, product, rushProduct, userId, userType, req) => {
  if ((rushProduct.status = 'Inactive') && rushProduct.conditionName === 'Trash') {
    return 'receive'
  } else if (req.body.manifestId && rushProduct.conditionName === 'New') {
    return 'locate'
  } else if (product.validated === 1) {
    await Receiving.markProductVerified(conn, rushProduct.productId)
    await verifyProductActionLog(conn, userId, userType, req)
    return 'reshipping'
  } else {
    return 'verify'
  }
}

var createProductLocationLog = async (conn, userId, userType, req) => {
  await Receiving.createProductLocationLog(conn, userId, userType, req.body.rushSku, 0, req.body.storeId)
}

var receivedProductActionLog = async (conn, userId, userType, req, context, created) => {
  var j = {
    userId: userId,
    userType: userType,
    storeId: req.body.storeId,
    destinationStoreId: req.body.storeId,
    sku: req.body.rushSku,
    sellerProductId: req.body.vendorSku,
    manifestIdentifier: context.manifestId,
    trackingNumber: req.body.trackingNumber ? req.body.trackingNumber : 'NA',
    vendorSupplierCode: req.body.vendorSupplierCode,
    isTrash: req.body.inTrash,
    createProduct: created,
    notes: req.body.notes,
    checkInType: 'FULL_CHECK_IN',
    palletNumber: '',
    locationNumber: '',
    checkInComplete: 'N',
    licensePlate: '',
    isLicensePlate: 'false',
    guessAtPartner: 'N',
    inspectionBypassed: 'Y',
    bulk: 1,
    fieldnames:
      'sku,userId,checkInComplete,isLicensePlate,licensePlate,storeId,destinationStoreId,sellerProductId,manifestIdentifier,trackingNumber,vendorSupplierCode,isTrash,createProduct,bulk,checkInType,guessAtPartner,inspectionBypassed',
  }

  await ProductsProcess.createProductActionLog(conn, req.body.rushSku, 'RECEIVED', userId, userType, j)
}

var verifyProductActionLog = async (conn, userId, userType, req) => {
  await ProductsProcess.createProductActionLog(conn, req.body.rushSku, 'VERIFICATION', userId, userType)
}

var reshipProductActionLog = async (conn, userId, userType, req) => {
  await ProductsProcess.createProductActionLog(conn, req.body.rushSku, 'RESHIPPING', userId, userType)
}

var conditionProductActionLog = async (conn, userId, userType, req) => {
  await ProductsProcess.createProductActionLog(conn, req.body.rushSku, 'CONDITIONING', userId, userType)
}

var statusChangeProductActionLog = async (conn, userId, userType, req, oldStatus, newStatus) => {
  var j = {
    newStatus: `${oldStatus}/${newStatus}`,
  }

  await ProductsProcess.createProductActionLog(conn, req.body.rushSku, 'STATUS_CHANGE', userId, userType, j)
}

var createStagingProduct = async (conn, userId, userType, req, resp) => {
  var context = await getDataContext(userId, userType, req)
  var stagingValues = determineStagingValues(context.product)
  var productValues = await determineProductValues(conn, context, req, stagingValues)


  var stagingProductId = 0
  var rows = await Receiving.getStagingProduct(conn, req.body.vendorSku, context.manifestId, req.body.storeId)
  if (rows.length !== 0) {
    stagingProductId = rows[0].productId

    //	Update staging product if not a direct buy
    if (!req.body.manifestId) {
      var result = await Receiving.updateStagingProduct(
        conn,
        req.body.vendorSku,
        context.manifestId,
        req.body.storeId,
        context.product,
        stagingValues
      )
    }
    //	If direct buy, get the price and cost from the staging product.
    else {
      productValues.price = rows[0].price
      productValues.cost = rows[0].cost
      productValues.conditionName = context.manifest.defaultProductCondition
    }
  } else if (!req.body.manifestId) {
    //	Create staging product
    var result = await Receiving.createStagingProduct(
      conn,
      req.body.vendorSku,
      context.manifestId,
      req.body.storeId,
      context.product,
      stagingValues
    )
    stagingProductId = result.insertId

  } else if (context.directBuy && context.manifest.defaultProductCondition === 'Like New') {
    var result = await Receiving.createStagingProductLikeNewDirectBuy(
      conn,
      req.body.vendorSku,
      context.manifestId,
      req.body.storeId,
      context.product,
      stagingValues
    )            
    stagingProductId = result.insertId
  } else {
    throw Error('Staging product not found for Direct Buy Load')
  }

  //	Create products record
  var result = await Receiving.createProduct(
    conn,
    req.body.rushSku,
    'Received',
    userId,
    userType,
    context.manifestId,
    stagingProductId,
    req.body.vendorSku,
    req.body.storeId,
    productValues.conditionName,
    context.product.productName,
    context.product.manufacturer,
    context.product.upc,
    context.product.mpn,
    stagingValues.msrp,
    stagingValues.originalPrice,
    stagingValues.marketPrice,
    stagingValues.price,
    productValues.cost,
    productValues.disposalFee,
    productValues.processingFee,
    context.product.primaryCategory,
    context.product.secondaryCategory,
    stagingValues.image,
    context.product.shipType !== null ? context.product.shipType : 'Small Parcel',
    req.body.vendorSupplierCode,
    req.body.trackingNumber,
    'RRC',
    productValues.isTrash ? 1 : null,
    7,
    'Original Packaging'
  )
  productValues.productId = result.insertId

  await Receiving.markSkuNotAvailable(conn, req.body.rushSku)


  //  Create Sellbrite queue entry on product creation
  await ProductsProcess.sellbriteInventoryQueue(conn, req.body.rushSku, req.baseUrl);

  //	Load the sku into the context for later use.
  context.rushProduct = null
  var p = await Receiving.getProduct(req.body.rushSku, conn)
  if (p.length === 0) {
    throw new Error(`Rush sku not found ${req.body.rushSku}`)
  } else {
    context.rushProduct = p[0]
  }

  //	If direct buy load
  if (req.body.manifestId) {
    await Receiving.decrementStagingProduct(conn, req.body.vendorSku, context.manifestId, req.body.storeId)
    var rows = await Receiving.getStagingProduct(conn, req.body.vendorSku, context.manifestId, req.body.storeId)
    if (rows.length && rows[0].quantityAvailable < 0) {
      await Receiving.completeStagingProductWithZero(conn, req.body.vendorSku, context.manifestId, req.body.storeId)
    } else if (rows.length && rows[0].quantityAvailable === 0) {
      await Receiving.completeStagingProduct(conn, req.body.vendorSku, context.manifestId, req.body.storeId)
    } else if (rows.length) {
      await Receiving.loadStagingProduct(conn, req.body.vendorSku, context.manifestId, req.body.storeId)
    }
  }

  var info = {
    context: context,
    productValues: productValues,
    stagingValues: stagingValues,
  }

  return info
}

var getDataContext = async (userId, userType, req) => {
  var context = {}

  context.vendor = null
  context.vendorId = null
  context.supplierCode = null
  context.manifestId = null

  if (req.body.vendorSupplierCode) {
    let rows = await SupplierCodes.get(req.body.vendorSupplierCode)
    if (rows.length === 0) {
      throw new Error(`Vendor not found for supplier code ${req.body.vendorSupplierCode}`)
    } else {
      context.vendorId = rows[0].vendorId
      context.supplierCode = rows[0]
    }
  } else if (req.body.manifestId) {
    let rows = await Manifests.getById(req.body.manifestId)
    if (rows.rows.length === 0) {
      throw new Error(`Vendor not found for manifest ${req.body.manifestId}`)
    } else if (rows.rows[0].manifestSource !== 'DIRECT_BUY') {
      throw new Error(`Passed manifest ID not associated with DIRECT BUY load ${req.body.manifestId}`)
    } else {
      context.vendorId = rows.rows[0].vendorId
      context.manifestId = rows.rows[0].manifestId
      context.manifest = rows.rows[0]
      context.directBuy = true;
    }
  } else {
    throw new Error(`Vendor supplier code or manifest ID must be supplied`)
  }

  let rows = await Vendors.getById(context.vendorId)
  if (rows.length === 0) {
    throw new Error(`Vendor not found ${context.vendorId}`)
  } else {
    context.vendor = rows[0]
  }

  //	Create the manifest if needed.
  if (!context.manifestId) {
    rows = await Manifests.getRBRByVendorId(context.vendorId)
    if (rows.length === 0) {
      await Manifests.createRBRManifest(req.body.storeId, context.vendor)
      rows = await Manifests.getRBRByVendorId(context.vendorId)
    }
    context.manifestId = rows[0].manifestId
  }

  context.product = null
  rows = await Vendors.getProductByVendorSku(context.vendorId, req.body.vendorSku)
  if (rows.length === 0) {

    // If this is a direct buy like new load...
    if (context.directBuy && context.manifest.defaultProductCondition === 'Like New') {
      //  If the vSku wasn't found on the manifest vendor and the vendor ID from the manifest doesn't match the one passed in
      //  i. Look up the vSku using the passed vendor.
      //  2. Clone that vSku to the manifest vendor.
      if (req.body.vendorId && (context.manifest.vendorId !== req.body.vendorId)) {
        let pRows = await Vendors.getProductByVendorSku(req.body.vendorId, req.body.vendorSku);
        if (pRows.length) {
          context.product = await cloneVendorSku(pRows[0], context.manifest.vendorId);
        }
        else {
          throw new Error(`VC product not found ${context.vendorId} ${req.body.vendorSku}`)
        }
      }
      else {
        throw new Error(`VC product not found ${context.vendorId} ${req.body.vendorSku}`)
      }
    }
    else {
      throw new Error(`VC product not found ${context.vendorId} ${req.body.vendorSku}`)
    }
  } else {
    context.product = rows[0]
  }

  return context
}

var cloneVendorSku = async (vSku, manifestVendorId) => {
  var req = {
    body: JSON.parse(JSON.stringify(vSku)),
    params: {
      id: manifestVendorId
    }
  }

  var resp = {
    statusCode: 201,
    message: 'Success.'
  }  

  req.body.vendorId = manifestVendorId;

  await vendorActions.createProduct(req, resp);
  
  if (resp.statusCode !== 201) {
    throw new Error(`VC product could not be cloned for manifest vendor ${vSku.vendorId} ${vSku.vendorSku} to ${manifestVendorId}`)
  }
  else {
    let rows = await Vendors.getProductByVendorSku(manifestVendorId, vSku.vendorSku);
    if (rows.length) {
      return rows[0];
    }
    else {
      throw new Error(`VC product not found ${manifestVendorId} ${vSku.vendorSku}`)
    }
  }
}

var determineProductValues = async (conn, context, req, stagingValues) => {
  var productValues = {}

  const facilityId = req.decoded.identity?.facilityId || req.body.facilityId

  productValues.isTrash =
    req.body.isTrash !== undefined &&
    req.body.isTrash !== null &&
    (req.body.isTrash === true || req.body.isTrash === 'true' || req.body.isTrash === 'Y')
      ? true
      : false

  productValues.conditionName = productValues.isTrash
    ? 'Trash'
    : req.body.vendorSupplierCode?.trim().length > 0 && req.body.vendorSupplierCode !== 'NOT-PROVIDED'
    ? context.supplierCode.defaultCondition
    : 'Like New'

  //	If direct buy use values from staging product
  if (req.body.manifestId) {
    productValues.cost = stagingValues.productCost
    productValues.price = stagingValues.price
  } else {
    productValues.cost = await calculateCost(context.product, context.vendor, productValues.conditionName)
  }

  const boxes = await getBoxes(context.product, { rushSku: req.body.rushSku })
  const cube = calculateCubicInches(boxes)
  productValues.cubicInches = cube

  productValues.disposalFee = 0.0
  if (!context.directBuy && context.supplierCode && context.supplierCode.chargeDisposalFees !== 'N' && productValues.isTrash) {
    const disposalFee = await ProductsProcess.getDisposalFee(context.vendorId, cube)
    if (disposalFee) {
      productValues.disposalFee = parseFloat(disposalFee.disposalFee.toFixed(2))
    }
  }

  productValues.partnerDisposalFee = 0.0
  if (facilityId && productValues.isTrash) {
    const disposalFee = await ProductsProcess.getPartnerDisposalFee(facilityId, cube)
    if (disposalFee) {
      productValues.partnerDisposalFee = parseFloat(disposalFee.disposalFee.toFixed(2))
    }
  }

  productValues.processingFee = 0.0
  if (!context.directBuy && context.supplierCode && context.supplierCode.chargeProcessingFees !== 'N') {
    const processingFee = await ProductsProcess.getProcessingFee(context.vendorId, cube)
    if (processingFee?.processingFee) {
      productValues.processingFee = parseFloat(processingFee.processingFee.toFixed(2))
    }
  }

  productValues.partnerProcessingFee = 0.0
  if (facilityId && productValues.isTrash) {
    const receiptFee = await ProductsProcess.getPartnerReceiptInspectionFee(facilityId, cube)
    if (receiptFee) {
      productValues.partnerProcessingFee = parseFloat(receiptFee.processingFee.toFixed(2))
    }
  }

  return productValues
}

var determineStagingValues = product => {
  var stagingInfo = {}
  stagingInfo.image = null
  if (product.mainImageKnockout !== null) {
    stagingInfo.image = product.mainImageKnockout
  } else if (product.mainImageLifestyle !== null) {
    stagingInfo.image = product.mainImageLifestyle
  } else if (product.alt3 !== null) {
    stagingInfo.image = product.alt3
  } else if (product.alt4 !== null) {
    stagingInfo.image = product.alt4
  } else if (product.alt5 !== null) {
    stagingInfo.image = product.alt5
  }

  stagingInfo.marketPrice = 0
  if (product.partnerSellingPrice !== null) {
    stagingInfo.marketPrice = product.partnerSellingPrice
  }

  stagingInfo.msrp = 0
  if (product.msrp !== null) {
    stagingInfo.msrp = product.msrp
  }

  stagingInfo.originalPrice = 0
  if (product.inMarketPrice !== null) {
    stagingInfo.originalPrice = product.inMarketPrice
  } else if (product.partnerSellingPrice !== null) {
    stagingInfo.originalPrice = product.partnerSellingPrice
  }

  stagingInfo.price = 0
  if (product.inMarketPrice !== null) {
    stagingInfo.price = product.inMarketPrice
  }

  stagingInfo.productCost = product.productCost

  return stagingInfo
}

var updateBuildInspect = async (conn, userId, userType, req) => {
  var check = await Receiving.getBuildInspect(conn, req.body.rushSku)
  if (check.length === 0) {
    var result = await Receiving.createBuildInspect(
      conn,
      userId,
      userType,
      req.body.storeId,
      req.body.rushSku,
      req.body.notes
    )
  } else {
    var result = await Receiving.updateBuildInspect(conn, req.body.rushSku, req.body.notes)
  }
}

var updateProduct = async (userId, userType, req, resp) => {
  var context = await getDataContextUpdate(userId, userType, req)
  var productValues = await determineProductValuesUpdate(conn, context, req)

  //	Grab connection here so we can do all the following in the same transaction.
  var conn = await globals.pool.getConnection()

  try {
    await conn.beginTransaction()

    //	Create/update product_build_inspect record
    await updateBuildInspect(conn, userId, userType, req)

    //	Update products record
    await updateProducts(conn, userId, userType, req)

    //	If trash and wasn't trash before
    if (productValues.isTrash && context.rushProduct.conditionName !== 'Trash') {
      await trashIt(conn, userId, userType, context, productValues, req)
    } else if (!productValues.isTrash) {
      // //	Can sku be set Live?
      await liveCheck(conn, userId, userType, context.rushProduct)
    }

    //	Create product_action_log entry.
    await receivedProductActionLog(conn, userId, userType, req, context, false)

    //	Update products record
    await Receiving.markProductReceived(conn, context.rushProduct.productId)

    if (req.body.manifestId) {
      await Receiving.markProductReshipped(conn, context.rushProduct.productId)
      await Receiving.markProductVerified(conn, context.rushProduct.productId)
      await Receiving.markProductConditioned(conn, context.rushProduct.productId)
    }

    //	Set next step
    resp.nextStep = await determineNextStep(conn, context.product, context.rushProduct, userId, userType, req)

    conn.commit()
  } catch (e) {
    conn.rollback()
    resp.statusCode = 500
    resp.message = e.message
    logUtils.logException(e)
  } finally {
    globals.pool.releaseConnection(conn)
  }
}

var trashIt = async (conn, userId, userType, context, productValues, req) => {

  //  See if this is a partner processing their own products.
  const partnerId = req.decoded?.identity?.partnerId ? req.decoded?.identity?.partnerId : req.query.partnerId;
  const captureFees = await isPartnerFeeCharged(partnerId, { rushProduct: context.rushProduct, vendorId: context.product.vendorId });
  if (!captureFees) {
    return 0.00;
  }

  await Receiving.trashProduct(
    conn,
    context.rushProduct.sku,
    productValues.disposalFee,
    productValues.cubicInches,
    productValues.partnerDisposalFee,
    productValues.partnerProcessingFee
  )

  context.rushProduct.status = 'Inactive'
  context.rushProduct.conditionName = 'Trash'

  if (
    (context.rushProduct.palletNumber !== null && context.rushProduct.palletNumber !== '') ||
    (context.rushProduct.locationNumber !== null && context.rushProduct.locationNumber !== '')
  ) {
    await Receiving.deactivateProductLocationLog(
      conn,
      userId,
      userType,
      req.params.rushSku,
      context.rushProduct.storeId,
      context.rushProduct.locationNumber,
      context.rushProduct.palletNumber,
      context.rushProduct.storeId
    )
  }

  //	Create product_action_log entry
  await statusChangeProductActionLog(conn, userId, userType, req, context.rushProduct.status, 'Inactive')

  //  Record TRASHED action.
  await ProductsProcess.createProductActionLog(conn, req.body.rushSku, 'TRASHED', userId, userType, null)

  //	Create product_condition_log entry
  await ProductsProcess.createProductConditionLog(
    conn,
    context.rushProduct.sku,
    userId,
    userType,
    context.rushProduct.conditionName,
    'Trash'
  )
}

var updateProducts = async (conn, userId, userType, req) => {
  //	Update products record.
  var result = await Receiving.updateProductsRecord(
    conn,
    req.params.rushSku,
    req.body.trackingNumber,
    req.body.vendorSupplierCode,
    req.body.notes
  )
}

var getDataContextUpdate = async (userId, userType, req) => {
  const context = {}

  context.rushProduct = await Receiving.getProduct(req.params.rushSku).then(rows => rows?.[0])
  if (!context.rushProduct) {
    throw new Error(`Rush sku not found ${req.params.rushSku}`)
  }

  const vendorSupplierCode = req.body.vendorSupplierCode || context.rushProduct.vendorSupplierCode
  context.supplierCode = vendorSupplierCode && await SupplierCodes.get(vendorSupplierCode).then(rows => rows?.[0])
  if (!context.supplierCode) {
    throw new Error(`Supplier code not found [${vendorSupplierCode}]`)
  }

  //  If trashing can skip most of this
  if (req.body.isTrash) {
    const manifest = await Manifests.getByRushSku(req.params.rushSku).then(rows => rows?.[0]);
    context.directBuy = manifest ? manifest.manifestSource === 'DIRECT_BUY' : false;
    if (manifest) {
      context.vendorId = manifest.vendorId
      context.product = await Vendors.getProductByVendorSku(context.vendorId, manifest.sellerProductId)
        .then(rows => rows?.[0])
      if (!context.product) {
        throw new Error(`VC product not found ${context.vendorId} ${manifest.sellerProductId}`)
      }
    }
  } else {
    context.vendorId = context.supplierCode.vendorId

    const manifest = await Manifests.getRBRByVendorId(context.vendorId).then(rows => rows?.[0])
    if (!manifest) {
      throw new Error(`Manifest not found for vendor ${context.vendorId}`)
    }
    context.manifestId = manifest.manifestId

    context.vendor = await Vendors.getById(context.vendorId).then(rows => rows?.[0])
    if (!context.vendor) {
      throw new Error(`Vendor not found ${context.vendorId}`)
    }

    context.product = await Vendors.getProductByVendorSku(context.vendorId, context.rushProduct.sellerProductId)
      .then(rows => rows?.[0])
    if (!context.product) {
      throw new Error(`VC product not found ${context.vendorId} ${context.rushProduct.sellerProductId}`)
    }
  }

  return context
}

var determineProductValuesUpdate = async (conn, context, req) => {
  var productValues = {}

  const facilityId = req.decoded.identity?.facilityId || req.body.facilityId

  productValues.isTrash =
    req.body.isTrash !== undefined &&
    req.body.isTrash !== null &&
    (req.body.isTrash === true || req.body.isTrash === 'true' || req.body.isTrash === 'Y')
      ? true
      : false

  productValues.conditionName = productValues.isTrash
    ? 'Trash'
    : req.body.vendorSupplierCode.trim().length > 0 && req.body.vendorSupplierCode !== 'NOT-PROVIDED'
    ? context.supplierCode.defaultCondition
    : 'Like New'

  const boxes = await getBoxes(context.product, { rushSku: req.body.rushSku })
  const cube = calculateCubicInches(boxes)
  productValues.cubicInches = cube

  productValues.disposalFee = 0.0
  if (!context.directBuy && context.supplierCode.chargeDisposalFees !== 'N' && productValues.isTrash) {
    const disposalFee = await ProductsProcess.getDisposalFee(context.vendorId, cube)
    if (disposalFee) {
      productValues.disposalFee = parseFloat(disposalFee.disposalFee.toFixed(2))
    }
  }

  productValues.partnerDisposalFee = 0.0
  if (facilityId && productValues.isTrash) {
    const disposalFee = await ProductsProcess.getPartnerDisposalFee(facilityId, cube)
    if (disposalFee) {
      productValues.partnerDisposalFee = parseFloat(disposalFee.disposalFee.toFixed(2))
    }
  }

  productValues.processingFee = 0.0
  if (!context.directBuy && context.supplierCode.chargeProcessingFees !== 'N') {
    const processingFee = await ProductsProcess.getProcessingFee(context.vendorId, cube)
    if (processingFee?.processingFee) {
      productValues.processingFee = parseFloat(processingFee.processingFee.toFixed(2))
    }
  }

  productValues.partnerProcessingFee = 0.0
  if (facilityId && productValues.isTrash) {
    const receiptFee = await ProductsProcess.getPartnerReceiptInspectionFee(facilityId, cube)
    if (receiptFee) {
      productValues.partnerProcessingFee = parseFloat(receiptFee.processingFee.toFixed(2))
    }
  }

  return productValues
}

class UpdateCubeLog {
  static MAX_LOG_QUEUE_SIZE = 500

  constructor(dryRun, trashed) {
    this.skus = {}
    this.dryRun = dryRun
    this.trashed = trashed
  }

  async queue(sku, cube) {
    this.skus[sku] = cube
    if (Object.keys(this.skus).length >= UpdateCubeLog.MAX_LOG_QUEUE_SIZE) {
      return this.flush()
    }
  }

  async flush() {
    const updateCount = Object.keys(this.skus).length
    if (!updateCount) {
      return
    }

    await logUtils.log({
      type: 'PRODUCTS',
      severity: 'INFO',
      message: this.trashed ?
        `${this.dryRun ? 'found ' : 'updated '}${updateCount} products that have been trashed with missing cubes` :
        `${this.dryRun ? 'found ' : 'updated '}${updateCount} located products with missing cubes`,
      stackTrace: JSON.stringify(this.skus)
    })

    this.skus = {}
  }
}

async function calculateMissingCubes(dryRun) {
  const trashLog = new UpdateCubeLog(dryRun, true)
  const locatedLog = new UpdateCubeLog(dryRun, false)

  const partnerIdsByStoreId = await Products.getPartnerIdsByStoreId()

  await Products.streamAllForCalculatingCubes(async (rushProduct) => {
    const { conditionName, sellerProductId, sku: rushSku, storeId, vendorId } = rushProduct

    const vendorCatalogProduct = await Vendors.getProductByVendorSku(vendorId, sellerProductId)
      .then(rows => rows?.[0])
    if (!vendorCatalogProduct) {
      return
    }

    const partnerId = partnerIdsByStoreId[storeId]
    const partnerFeeCharged = partnerId && await isPartnerFeeCharged(partnerId, { rushProduct })
    if (!partnerFeeCharged) {
      // the product was owned and processed by the same partner - no fee charged and no need to calculate the cube
      return
    }

    const boxes = await getBoxes(vendorCatalogProduct, { rushSku })
    const cube = calculateCubicInches(boxes)

    if (conditionName === 'Trash') {
      await trashLog.queue(rushSku, cube, true)
      return !dryRun && Products.updateCubes(null, rushSku, cube, cube)
    }

    await locatedLog.queue(rushSku, cube, false)
    return !dryRun && Products.updateCubes(null, rushSku, cube)
  })

  await trashLog.flush()
  await locatedLog.flush()
}

module.exports = {
  calculateMissingCubes,
  fixUpUPCs,
  getAll,
  getAmbiguous,
  getById,
  getDistinctCategories,
  getExportFormats,
  getExportJobs,
  queueExport,
  updateShopifyIds,
  createProduct,
  revalidate,
  updateProduct,
}
