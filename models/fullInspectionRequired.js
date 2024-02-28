'use strict'; 

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.getProductsOnMarketFloorForCategory = async (citySlug, categorySlug, vendorSkuList) => {
  let resp = {
    rows: []
  }
  let whereclause = `p.status  IN ('Live', 'Active', 'Publish') 
    AND sl.market_floor = 'Y' 
    AND t.city_slug = ? 
    AND LOWER(REPLACE(REPLACE(REPLACE(c.front_end_name, '&', ''), ' ', '-'), '--', '-')) = ? `;
  let values = [citySlug, categorySlug];
  if (vendorSkuList) {
    whereclause += `AND p.seller_product_id IN (?) `;
    values.push(vendorSkuList);
  }
  let marketFeatureSQL = `SELECT  
      p.sku,
      UPPER(p.seller_product_id) AS vendor_sku,  
      p.category_1,
      p.category_2,
      c.front_end_name,
      c.front_end_space,
      t.city_slug,
      p.status,
      sl.market_floor
    FROM products p 
      LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2)) 
      LEFT JOIN categories c ON c.category_id = cm.category_id 
      LEFT JOIN stores s ON s.store_id = p.store_id
      LEFT JOIN targeted_cities t ON s.city_id = t.id
      JOIN storage_locations sl ON p.location_number = sl.location_number
    WHERE 	
      ${whereclause}`;
  
  let rows = await globals.poolRO.query(marketFeatureSQL, values);
  colUtils.outboundNaming(rows);
  resp.rows = rows;

  return resp;
}

exports.getQuantityProductsOnMarketFloorForCoin = async (vendorSku, citySlug, categorySlug) => {
  let resp = {
    rows: []
  }
  let vendorSkuList = [];

  let marketCoinSql = `SELECT coin_id, COUNT(*) AS sku_count, GROUP_CONCAT(vendor_sku) AS vendor_sku_list
    FROM coins_to_vendor_skus
    WHERE coin_id IN (
      SELECT coin_id 
      FROM coins_to_vendor_skus
      WHERE vendor_sku IN (?)
    )
    GROUP BY coin_id`;
  let values = [vendorSku];
  let coinRows = await globals.productPool.query(marketCoinSql, values);
  if (coinRows.length > 0) {
    vendorSkuList = coinRows[0].vendor_sku_list.split(',');
  }
  vendorSkuList.push(vendorSku);
  let productRows = await this.getProductsOnMarketFloorForCategory(citySlug, categorySlug, vendorSkuList);
  resp.rows = productRows.rows;

  return resp;
}

exports.getvendorCatalogProductData = async (vendorId, vendorSku) => {
  let resp = {
    rows: []
  }
  let vendorCatalogSql = `SELECT vc.vendor_sku, c.coin_id, vc.primary_category, vc.secondary_category
    FROM vendors.vendor_catalog_products vc 
      LEFT JOIN vendors.coins_to_vendor_skus c on c.vendor_sku = vc.vendor_sku
    WHERE vc.vendor_id = ? AND vc.vendor_sku = ?`;
  let values = [vendorId, vendorSku];
  let vcRows = await globals.productPool.query(vendorCatalogSql, values);
  colUtils.outboundNaming(vcRows);
  resp.rows = vcRows;
  return resp;
}



exports.getStoreNeedFullyInspected = async () => {
  var rows = await globals.poolRO.query(`SELECT full_inspection_threshold_min, full_inspection_threshold_max, need_fully_inspected FROM stores_need_fully_inspected ORDER by full_inspection_threshold_min`);

  colUtils.outboundNaming(rows);
  return rows;
}