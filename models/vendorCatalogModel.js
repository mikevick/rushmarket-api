const globals = require("../globals");

const colUtils = require("../utils/columnUtils");

//@todo: Sanitize input
const getProductsCreatedWithinDays = async (days) => {
  const sqlQuery = `SELECT p.created_by, DATE_FORMAT(p.date_created, '%m/%d/%Y') as date_created, v.name, p.vendor_sku, p.primary_category, p.secondary_category, p.product_name, p.number_of_boxes, CONCAT(
    IFNULL(CONCAT(p.package_length1, ' x ', p.package_width1, ' x ', p.package_height1), ''),
    IFNULL(CONCAT(p.package_length2, ' x ', p.package_width2, ' x ', p.package_height2), ''),
    IFNULL(CONCAT(p.package_length3, ' x ', p.package_width3, ' x ', p.package_height3), ''),
    IFNULL(CONCAT(p.package_length4, ' x ', p.package_width4, ' x ', p.package_height4), ''),
    IFNULL(CONCAT(p.package_length5, ' x ', p.package_width5, ' x ', p.package_height5), ''), ', ') AS 'dimensions'
    FROM vendor_catalog_products p
    LEFT JOIN vendors v ON p.vendor_id = v.id
    WHERE p.created_from = "cl-one-touch"
    AND p.date_created >= DATE(CONVERT_TZ(NOW(), "+00:00", "US/Central")) - INTERVAL ? DAY
    ORDER BY p.date_created;`;

  const queryResults = await globals.productROPool.query(sqlQuery, [days]);
  const products = colUtils.outboundNaming(queryResults);

  return products;
};
const vendorCatalogModel = {
  getProductsCreatedWithinDays,
};

module.exports = vendorCatalogModel;
