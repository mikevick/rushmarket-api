const vendorCatalogModel = require("../models/vendorCatalogModel");
const userModel = require("../models/users");

const getProductsCreatedWithinDays = async (days) => {
  const products = await vendorCatalogModel.getProductsCreatedWithinDays(days);
  const productCreatorIds = products.map((product) => product.createdBy);
  if (productCreatorIds.length === 0) {
    return products;
  }
  const productCreators = await userModel.getUserAndStoreByIds(
    productCreatorIds
  );
  const productsWithCreatorInfo = _enrichProductsWithCreators(
    products,
    productCreators
  );
  const formattedData = _formatProductData(productsWithCreatorInfo);

  return formattedData;
};

const _formatProductData = (productData) => {
  return productData.map((data) => {
    const formatted = {};
    formatted.userName = data.userName;
    formatted.defaultStoreName = data.storeName;
    formatted.productDateCreated = data.dateCreated;
    formatted.vendorName = data.name;
    formatted.vendorSku = data.vendorSku;
    formatted.primaryCategory = data.primaryCategory;
    formatted.secondaryCategory = data.secondaryCategory;
    formatted.productName = data.productName;
    formatted.numberOfBoxes = data.numberOfBoxes;
    formatted.dimensions = data.dimensions

    return formatted;
  });
};

const _enrichProductsWithCreators = (products, creators) => {
  return products.map((product) => {
    const creatorId = product.createdBy;
    const creator = creators.find((creator) => creator.userId === creatorId);
    product.userName = "userName" in creator ? creator.userName : null;
    product.storeName = "defaultStore" in creator ? creator.defaultStore : null;

    return product;
  });
};

const vendorCatalogService = {
  getProductsCreatedWithinDays,
};

module.exports = vendorCatalogService;
