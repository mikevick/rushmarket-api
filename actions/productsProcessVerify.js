'use strict';

const { liveCheck } = require('../actions/productsProcessCommon');

const gde = require('./gde');
const globals = require('../globals');

const CategoryAttributes = require('../models/categoryAttributes')
const CategoryMappings = require('../models/categoryMappings')
const CategoryProducts = require('../models/categoryProducts')
const {
  getFacilityById,
  getFacilityByUser
} = require('../models/partners');
const ProductQuickSales = require('../models/productQuickSales')
const ProductVerifications = require('../models/productVerifications');
const {
  getProductBySku,
  getVendorCatalogProductBySku,
  updateBuildInspect,
} = require('../models/productsProcessCommon');
const {
  createProductDataIssue,
  createVerificationProductActionLog,
  getProductDataIssue,
  updateProductDataIssue,
  updateProductVerifyDone,
  updateVendorCatalogProductAsVerified,
  updateVendorCatalogProductImages,
  createOnlineQuickSaleProductActionLog
} = require('../models/productsProcessVerify');

const configUtils = require('../utils/configUtils')
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');

const vcpUpdatableImageFields = exports.vcpUpdatableImageFields = [
  'mainImageLifestyle',
  'altImage3',
  'altImage4',
  'altImage5',
  'swatchImage6',
];
const vcpImageFields = exports.vcpImageFields = [
  'mainImageKnockout',
  ...vcpUpdatableImageFields
]

exports.verifySku = async (rushSku, verifications, notes, vendorProductImages, storeId, facilityId, userId, userType) => {
  //	Grab connections here so we can do all the following in the same (coordinated) transactions.
  const corelinkConn = await globals.pool.getConnection();
  const vendorConn = await globals.productPool.getConnection();

  try {
    await corelinkConn.beginTransaction();
    await vendorConn.beginTransaction();

    if (notes) {
      await updateBuildInspect(corelinkConn, rushSku, notes);
    }

    const product = await getProductBySku(corelinkConn, rushSku);
    if (!product) {
      throw new Error('product not found');
    }

    //  Verify the partner/user can access the sku
    if (userType === 'PARTNERUSER') {
      const facility = await getFacilityByUser(userId);
      if (facility.storeId !== product.storeId) {
        throw new Error('product not found');
      }
    } else if (userType === 'PARTNER') {
      const facility = await getFacilityById(facilityId)
      if (!facility.length || (facility[0].storeId !== product.storeId)) {
        throw new Error('product not found');
      }
    } else if (userType === 'INTERNAL') {
      if (storeId !== product.storeId) {
        throw new Error('product not found');
      }
    }

    const vendorCatalogProduct = typeof product.vendorId !== 'undefined' &&
      await getVendorCatalogProductBySku(vendorConn, product.vendorId, product.sellerProductId);
    if (!vendorCatalogProduct) {
      throw new Error('vendor catalog product not found');
    }

    const missingAllImages = vcpImageFields.reduce((missingAll, field) => missingAll && !vendorCatalogProduct[field], true);
    if (missingAllImages && !vendorProductImages.length) {
      throw new Error(memberText.get('MISSING_REQUIRED').replace('%required%', 'vendorProductImages'));
    }

    if (vendorProductImages.length) {
      await updateVendorCatalogProductImages(vendorConn, vendorCatalogProduct.id, vendorProductImages);
    }

    const failedVerifications = [
      ...verifications.filter(verification => verification.failed).map(({ failed, ...verification }) => verification),
      ...verifyProduct(product, vendorCatalogProduct)
    ];

    await ProductVerifications.clear(corelinkConn, rushSku);
    for (const { key, value } of failedVerifications) {
      await ProductVerifications.create(corelinkConn, rushSku, key, value, userId, userType);
    }

    const hasFailedVerifications = failedVerifications.length > 0
    const productUpdates = { onlineQuickSale: hasFailedVerifications ? 'Y' : 'N' }
    if (hasFailedVerifications) {
      await addProductDataIssue(corelinkConn, rushSku, userId, userType);
      await checkForFailedCategoryVerification(product, productUpdates, verifications)
      await ProductQuickSales.clear(corelinkConn, rushSku)
      await createProductQuickSale(corelinkConn, product, vendorCatalogProduct, verifications, userId, userType)
    } else {
      await updateVendorCatalogProductAsVerified(vendorConn, vendorCatalogProduct.id, userId, userType);
    }

    
    await createVerificationProductActionLog(corelinkConn, rushSku, userId, userType, failedVerifications);
    if (product.onlineQuickSale === 'N' && productUpdates.onlineQuickSale === 'Y') {
      await createOnlineQuickSaleProductActionLog(corelinkConn, rushSku, userId, userType);
    }

    await updateProductVerifyDone(corelinkConn, rushSku, productUpdates);
    const updatedProduct = await getProductBySku(corelinkConn, rushSku);

    await liveCheck(corelinkConn, userId, userType, updatedProduct);
    await gde.queueShipCalcBySku({
      sku: rushSku,
      minimizeRateCallsFlag: configUtils.get("GDE_MINIMIZE_RATE_CALLS") === "ON",
      priority: 5
    });

    await corelinkConn.commit();
    await vendorConn.commit();
  } catch (e) {
    await corelinkConn.rollback();
    await vendorConn.rollback();
    await logUtils.logException(e);
    throw new Error(`failed to verify SKU [${rushSku}]: ${e.message}`);
  } finally {
    globals.pool.releaseConnection(corelinkConn);
    globals.productPool.releaseConnection(vendorConn);
  }
}

function verifyProduct(product, vendorCatalogProduct) {
  const failedVerifications = [];

  if (product.msrp < product.marketPrice) {
    const formattedMsrp = product.msrp.toFixed(2);
    const formattedMarketPrice = product.marketPrice.toFixed(2);
    failedVerifications.push({
      key: 'msrp',
      value: `MSRP \$${formattedMsrp} is less than Compare At \$${formattedMarketPrice}.`
    });
  }

  if (!product.price || product.price < 0) {
    failedVerifications.push({
      key: 'price',
      value: 'Missing price'
    });
  }

  const { productHeight, productWidth, productDepth, productWeight } = vendorCatalogProduct;
  const dimensionCount =
    (productHeight && productHeight > 0 ? 1 : 0) +
    (productWidth && productWidth > 0 ? 1 : 0) +
    (productDepth && productDepth > 0 ? 1 : 0);
  const productWeightValid = productWeight && productWeight > 0;

  if (dimensionCount < 2 || !productWeightValid) {
    failedVerifications.push({
      key: 'dimensions',
      value: 'VC product is missing product dimensions and/or product weight'
    });
  }

  const imageUrl = vcpImageFields.reduce((result, column) => result || vendorCatalogProduct[column], null);
  if (!imageUrl) {
    failedVerifications.push({
      key: 'images',
      value: 'none'
    });
  }

  return failedVerifications;
}

async function addProductDataIssue(conn, rushSku, userId, userType) {
  const existingIssue = await getProductDataIssue(conn, rushSku);
  if (existingIssue) {
    if (existingIssue.status !== 'OPEN') {
      await updateProductDataIssue(conn, rushSku, userId, userType);
    }
  } else {
    await createProductDataIssue(conn, rushSku, userId, userType);
  }
}

async function checkForFailedCategoryVerification(product, updatedProduct, verifications) {
  const failedCategoryVerification = verifications.find(verification =>
    verification.key?.toLowerCase() === 'category' && verification.failed)
  if (!failedCategoryVerification) {
    return
  }

  const category = await CategoryMappings.getByCategoryId(failedCategoryVerification.value)
  if (!category) {
    throw new Error(`Invalid categoryId [${failedCategoryVerification.value}]`)
  }

  product.category1 = updatedProduct.category1 = category.category1
  product.category2 = updatedProduct.category2 = category.category2
}

async function createProductQuickSale(conn, product, vendorCatalogProduct, verifications, userId, userType) {
  const { sku, category1, category2 } = product
  const { productHeight, productWidth, productDepth, productWeight } = vendorCatalogProduct

  const attributes = await CategoryAttributes.getByPrimaryAndSecondaryCategories(category1, category2)

  const primaryColorAttributeName = attributes.find(attribute => attribute.vcMap.toLowerCase() === 'primary_color')
    ?.attributeName?.toLowerCase()
  const color = primaryColorAttributeName
    && verifications.find(verification => verification.key.toLowerCase() === primaryColorAttributeName)?.value

  const primaryMaterialAttributeName = attributes.find(attribute => attribute.vcMap.toLowerCase() === 'primary_material')
    ?.attributeName?.toLowerCase()
  const material = primaryMaterialAttributeName
    && verifications.find(verification => verification.key.toLowerCase() === primaryMaterialAttributeName)?.value

  const sizeAttributeLabels = await CategoryProducts.getSizeAttributeLabels()
    .then(rows => rows.map(row => row.value.toLowerCase()))
  const productSizeAttributes = attributes
    .map(attribute => attribute.attributeName?.toLowerCase())
    .filter(attributeName => sizeAttributeLabels.includes(attributeName))
  const size = verifications.find(verification => productSizeAttributes.includes(verification.key?.toLowerCase()))?.value

  const dimensions = [
    productWidth && productWidth > 0 ? `${productWidth}" W` : null,
    productDepth && productDepth > 0 ? `${productDepth}" D` : null,
    productHeight && productHeight > 0 ? `${productHeight}" H` : null
  ]
    .filter(dimension => dimension)
    .join(' x ')
  const weight = typeof productWeight === 'number' ? productWeight.toFixed(2) : null
  const bullets = new Array(4).fill(null)
    .map((v, index) => vendorCatalogProduct[`bulletPoint${index + 1}`])
    .reduce((bullets, bullet) => bullet ? [...bullets, bullet] : bullets, [])
    .join('|')

  return ProductQuickSales.create(conn, {
    sku,
    color,
    material,
    size,
    dimensions,
    weight,
    bullets,
    createdBy: userId,
    createdByType: userType
  })
}
