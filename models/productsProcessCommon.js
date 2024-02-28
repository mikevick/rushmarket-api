const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

exports.createShopifyQueue = async (conn, rushSku) => {
  const check = await conn.query(`
    SELECT *
    FROM shopify_queue
    WHERE
      value = ?
      AND action = 'CREATE_PRODUCT'
      AND shopify_variant_id IS NULL
    `, [rushSku])

  //	If no create product for this sku already, create it!
  if (!check.length) {
    return conn.query(`
      INSERT INTO shopify_queue (action, type, value, shopify_store_id) VALUES ('CREATE_PRODUCT', 'PRODUCT', ?, 1)
    `, [rushSku])
  }

  return null
}

// for product online quick sale
exports.reCreateShopifyQueue = async (conn, rushSku, shopifyStoreId, shopifyId, shopifyVariantId) => {

  await conn.query(`
INSERT INTO shopify_queue (
  action, type, value, shopify_store_id, shopify_id, shopify_variant_id
)
VALUES (
  'DELETE_PRODUCT', 'PRODUCT', ?, ?, ?, ?
)
`, [rushSku, shopifyStoreId, shopifyId, shopifyVariantId]);

  await conn.query(`
INSERT INTO shopify_queue (
  action, type, value, shopify_store_id
)
VALUES (
  'CREATE_PRODUCT', 'PRODUCT', ?, ?
)
`, [rushSku, shopifyStoreId]);

}

exports.createProductActionLog = async (conn, rushSku, action, userId, userType, json) => {
  // console.log(mysql.format(`INSERT INTO product_action_log (sku, user_id, user_type, action, json)
  // 																				VALUES (?, ?, ?, ?, ?)`, [rushSku, userId, userType, action, JSON.stringify(json)]))
  return conn.query(`
		INSERT INTO product_action_log (sku, user_id, user_type, action, json)
		VALUES (?, ?, ?, ?, ?)
  `, [rushSku, userId, userType, action, json ? JSON.stringify(json) : null])
}

exports.createProductConditionLog = async (conn, rushSku, userId, userType, fromCondition, toCondition) => {
  // console.log(mysql.format(`INSERT INTO product_action_log (sku, user_id, action, json) VALUES (?, 111, ?, ?)`, [rushSku, action, JSON.stringify(json)]))
  return conn.query(`
    INSERT INTO product_condition_log (sku, user_id, user_type, condition_from, condition_to)
    VALUES (?, ?, ?, ?, ?)
  `, [rushSku, userId, userType, fromCondition, toCondition])
}

exports.createProductLocationLog = async (
  conn,
  userId,
  userType,
  rushSku,
  storeId,
  fromLocation,
  toLocation,
  fromPallet,
  toPallet
) => {
  return conn.query(`
    INSERT INTO product_location_log
    (sku, user_id, user_type, store_id_from, store_id_to, location_from, location_to, storage_pallet_from, storage_pallet_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [rushSku, userId, userType, storeId, storeId, fromLocation, toLocation, fromPallet, toPallet])
}

exports.isPartnerRelatedToVendor = async (partnerId, vendorId) => {
  return globals.productROPool.query(`
    SELECT * FROM partners_to_vendors WHERE partner_id = ? AND vendor_id = ?
  `, [partnerId, vendorId])
    .then(rows => !!rows.length)
}

exports.isVendorPayingPartnerFees = async (vendorId, vendorSupplierCode) => {
  return globals.productROPool.query(`
    SELECT pay_partner_fees
    FROM vendor_supplier_codes
    WHERE
      vendor_id = ?
      AND supplier_code = ?
      AND pay_partner_fees = 'Y'
  `, [vendorId, vendorSupplierCode])
    .then(rows => !!rows.length)
}

exports.getDisposalFee = async (vendorId, cube) => {
  // console.log(mysql.format(`SELECT disposal_fee FROM product_disposal_fee_rules WHERE vendor_id = ? AND active = 'Y' AND box_size_min <= ? AND box_size_max <= ?`, [vendorId, cube, cube]))
  return globals.poolRO.query(`
    SELECT disposal_fee
    FROM product_disposal_fee_rules
    WHERE
      vendor_id = ?
      AND active = 'Y'
      AND ? >= box_size_min
      AND ? <= box_size_max
    `, [vendorId, cube, cube])
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

exports.getProcessingFee = async (vendorId, cube) => {
  // console.log(mysql.format(`SELECT processing_fee FROM product_processing_fee_rules WHERE vendor_id = ? AND active = 'Y' AND box_size_min <= ? AND box_size_max <= ?`, [vendorId, cube, cube]))
  return globals.poolRO.query(`
    SELECT processing_fee
    FROM product_processing_fee_rules
    WHERE
      vendor_id = ?
      AND active = 'Y'
      AND ? >= box_size_min
      AND ? <= box_size_max
    `, [vendorId, cube, cube])
    .then(rows => rows.length ? rows :
      globals.productROPool.query(`SELECT processing_fee FROM vendors WHERE id = ?`, [vendorId]))
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

exports.getPartnerDisposalFee = async (facilityId, cube) => {
  return globals.productROPool.query(`
    SELECT disposal_fee
    FROM partner_facility_disposal_fee_rules
    WHERE
      facility_id = ?
      AND active = 'Y'
      AND ? >= box_size_min
      AND ? <= box_size_max
    `, [facilityId, cube, cube])
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

exports.getPartnerReceiptInspectionFee = async (facilityId, cube) => {
  return globals.productROPool.query(`
    SELECT processing_fee
    FROM partner_facility_receipt_inspection_fees
    WHERE
      facility_id = ?
      AND ? >= cubic_inches_min
      AND ? <= cubic_inches_max
    `, [facilityId, cube, cube])
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

exports.getProductBySku = async (corelinkConn, rushSku) => {
  const conn = corelinkConn || globals.poolRO
  return conn.query(`
		SELECT m.vendor_id, p.*
		FROM products p
			LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
		WHERE sku = ?
		`, [rushSku])
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

exports.getProductShippingBoxes = async rushSku => {
  // console.log(mysql.format(`SELECT * FROM staging_product WHERE seller_product_id = ? AND manifest_id = ? AND destination_store_id = ?`, [vendorSku, manifestId, storeId]))
  return globals.poolRO.query(`SELECT * FROM product_shipping_boxes WHERE sku = ?`, [rushSku])
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

exports.getVendorCatalogProductBySku = async (productConn, vendorId, vendorSku) => {
  const conn = productConn || globals.productPool
  return conn.query(`
		SELECT *
		FROM vendor_catalog_products
		WHERE vendor_id = ? AND vendor_sku = ?
		`, [vendorId, vendorSku])
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

exports.isLocationOnlineEligible = async (conn, storeId, locationNumber) => {
  return conn.query(`
    SELECT * FROM storage_locations WHERE store_id = ? AND location_number = ? AND active = 'Y'
    `, [storeId, locationNumber])
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
    .then(storageLocation => storageLocation && storageLocation?.onlineEligible !== 'N')
}

exports.sellbriteInventoryQueue = async (conn, rushSku, baseUrl) => {
  const rows = await conn.query(`
    INSERT INTO sellbrite_queue(type, sku, source)
    VALUES ('INVENTORY', ?, ?)
    `, [rushSku, baseUrl])
  if (rows.length) {
    await conn.query(`UPDATE skus SET available = 'N' WHERE sku = ?`, [rushSku])
  }
}

exports.updateBuildInspect = async (conn, rushSku, notes) => {
  return conn.query(`
    UPDATE product_build_inspects
		SET 
      build_inspect_notes = CONCAT(?, '\n\n', build_inspect_notes),
		  updated_date = NOW()
    WHERE sku = ?
    `, [notes, rushSku])
}

exports.updateProductStatus = async (conn, rushSku, status, onlineShopping) => {
  return conn.query(`
    UPDATE products SET status = ?, online_shopping = ? WHERE sku = ?
    `, [status, onlineShopping, rushSku])
}
