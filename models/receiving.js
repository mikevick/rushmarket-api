'use strict'

const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

exports.getBuildInspect = async (conn, rushSku) => {
  var row = await conn.query(`SELECT * FROM product_build_inspects WHERE sku = ?`, [rushSku])
  colUtils.outboundNaming(row)

  return row
}

exports.createBuildInspect = async (conn, userId, userType, storeId, rushSku, notes) => {
  var result = await conn.query(
    `INSERT INTO product_build_inspects (user_id, user_type, store_id, sku, build_inspect_status_id, done_date, updated_date, start_datetime, end_datetime, done, build_inspect_notes)
																					VALUES (?, ?, ?, ?, 57, NOW(), NOW(), NOW(), NOW(), 1, ?)`,
    [userId, userType, storeId, rushSku, notes]
  )

  return result
}

exports.updateBuildInspect = async (conn, rushSku, notes) => {
  var result = await conn.query(
    `UPDATE product_build_inspects SET build_inspect_notes = ?, updated_date = NOW() 
																					WHERE sku = ? `,
    [notes, rushSku]
  )

  return result
}

exports.createStagingProduct = async (conn, vendorSku, manifestId, storeId, product, stagingValues) => {
  var sql = `INSERT INTO staging_product (date_created, manifest_id, seller_product_id, name, manufacturer, upc,
																					mpn, original_price, cost, weight, quantity, quantity_available, category_1, category_2,
																					image, msrp, market_price, price, destination_store_id) 
								VALUES (NOW(), ?, ?, ?, ?, ?,
													?, ?, ?, ?, 1, 0, ?, ?,
													?, ?, ?, ?, ?)`

  // console.log(mysql.format(sql, [manifestId, vendorSku, product.productName, product.manufacturer, product.upc,
  // 																	product.mpn, stagingValues.originalPrice, product.productCost, product.productWeight, product.primaryCategory, product.secondaryCategory,
  // 																	stagingValues.image, stagingValues.msrp, stagingValues.marketPrice, stagingValues.price, storeId]));
  var result = await conn.query(sql, [
    manifestId,
    vendorSku,
    product.productName,
    product.manufacturer,
    product.upc,
    product.mpn,
    stagingValues.originalPrice,
    product.productCost,
    product.productWeight,
    product.primaryCategory,
    product.secondaryCategory,
    stagingValues.image,
    stagingValues.msrp,
    stagingValues.marketPrice,
    stagingValues.price,
    storeId,
  ])

  return result
}

exports.createStagingProductLikeNewDirectBuy = async (conn, vendorSku, manifestId, storeId, product, stagingValues) => {
  var sql = `INSERT INTO staging_product (date_created, manifest_id, seller_product_id, name, manufacturer, upc,
																					mpn, original_price, cost, weight, quantity, quantity_available, category_1, category_2,
																					image, msrp, market_price, price, destination_store_id) 
								VALUES (NOW(), ?, ?, ?, ?, ?,
													?, ?, 0, ?, 1, 1, ?, ?,
													?, ?, ?, ?, ?)`

  // console.log(mysql.format(sql, [
  //   manifestId,
  //   vendorSku,
  //   product.productName,
  //   product.manufacturer,
  //   product.upc,
  //   product.mpn,
  //   stagingValues.originalPrice,
  //   product.productWeight,
  //   product.primaryCategory,
  //   product.secondaryCategory,
  //   stagingValues.image,
  //   stagingValues.msrp,
  //   stagingValues.marketPrice,
  //   stagingValues.price,
  //   storeId,
  // ]));
  var result = await conn.query(sql, [
    manifestId,
    vendorSku,
    product.productName,
    product.manufacturer,
    product.upc,
    product.mpn,
    stagingValues.originalPrice,
    product.productWeight,
    product.primaryCategory,
    product.secondaryCategory,
    stagingValues.image,
    stagingValues.msrp,
    stagingValues.marketPrice,
    stagingValues.price,
    storeId,
  ])

  return result
}

exports.getStagingProduct = async (conn, vendorSku, manifestId, storeId) => {
  // console.log(mysql.format(`SELECT * FROM staging_product WHERE seller_product_id = ? AND manifest_id = ? AND destination_store_id = ?`, [vendorSku, manifestId, storeId]));
  var row = await conn.query(
    `SELECT * FROM staging_product WHERE seller_product_id = ? AND manifest_id = ? AND destination_store_id = ?`,
    [vendorSku, manifestId, storeId]
  )
  colUtils.outboundNaming(row)

  return row
}

exports.updateStagingProduct = async (conn, vendorSku, manifestId, storeId, product, stagingValues) => {
  var sql = `UPDATE staging_product SET date_modified = NOW(),
								quantity = quantity + 1, 
								name = ?, 
								image = ?,
								msrp = ?,
								market_price = ?,
								price = ?,
								original_price = ?,
								cost = ?,
								manufacturer = ?,
								category_1 = ?,
								category_2 = ?
								WHERE seller_product_id = ? AND manifest_id = ? AND destination_store_id = ?`

  // console.log(mysql.format(sql, [product.productName, stagingValues.image, stagingValues.msrp, stagingValues.marketPrice, stagingValues.price,
  // 	stagingValues.originalPrice, product.productCost, product.manufacturer, product.primaryCategory, product.secondaryCategory,
  // 	vendorSku, manifestId, storeId]));
  var result = await conn.query(sql, [
    product.productName,
    stagingValues.image,
    stagingValues.msrp,
    stagingValues.marketPrice,
    stagingValues.price,
    stagingValues.originalPrice,
    product.productCost,
    product.manufacturer,
    product.primaryCategory,
    product.secondaryCategory,
    vendorSku,
    manifestId,
    storeId,
  ])

  return result
}

exports.completeStagingProduct = async (conn, vendorSku, manifestId, storeId) => {
  var sql = `UPDATE staging_product SET date_modified = NOW(),
								staging_status = 'complete'
								WHERE seller_product_id = ? AND manifest_id = ? AND destination_store_id = ?`

  var result = await conn.query(sql, [vendorSku, manifestId, storeId])

  return result
}

exports.completeStagingProductWithZero = async (conn, vendorSku, manifestId, storeId) => {
  var sql = `UPDATE staging_product SET date_modified = NOW(),
								staging_status = 'complete', 
								quantity = quantity + 1,
								quantity_available = quantity_available + 1
								WHERE seller_product_id = ? AND manifest_id = ? AND destination_store_id = ?`

  var result = await conn.query(sql, [vendorSku, manifestId, storeId])

  return result
}

exports.decrementStagingProduct = async (conn, vendorSku, manifestId, storeId) => {
  var sql = `UPDATE staging_product SET date_modified = NOW(),
								quantity_available = quantity_available - 1
								WHERE seller_product_id = ? AND manifest_id = ? AND destination_store_id = ?`

  var result = await conn.query(sql, [vendorSku, manifestId, storeId])

  return result
}

exports.loadStagingProduct = async (conn, vendorSku, manifestId, storeId) => {
  var sql = `UPDATE staging_product SET date_modified = NOW(),
								staging_status = 'loaded'
								WHERE seller_product_id = ? AND manifest_id = ? AND destination_store_id = ?`

  var result = await conn.query(sql, [vendorSku, manifestId, storeId])

  return result
}

exports.createProduct = async (
  conn,
  rushSku,
  status,
  userId,
  userType,
  manifestId,
  stagingProductId,
  vendorSku,
  storeId,
  conditionName,
  productName,
  manufacturer,
  upc,
  mpn,
  msrp,
  originalPrice,
  marketPrice,
  price,
  cost,
  disposalFee,
  processingFee,
  primaryCategory,
  secondaryCategory,
  image,
  shipType,
  vendorSupplierCode,
  trackingNumber,
  source,
  inactiveReasonId,
  pricingTypeId,
  productDisplay
) => {
  var sql = `INSERT INTO products (sku, status, user_id, user_type, manifest_id, staging_product_id, seller_product_id, store_id, condition_name,
																		name, manufacturer, upc, mpn, msrp, original_price, market_price, price, cost, disposal_fee, processing_fee, 
																		category_1, category_2, image, ship_type, vendor_supplier_code, tracking_number, source, 
																		inactive_reason_id, pricing_type_id, product_display)
														VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
															 			?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
																		?, ?, ?, ?, ?, ?, ?,
																		?, ?, ?)`

  // console.log(mysql.format(sql, [rushSku, status, userId, userType, manifestId, stagingProductId, vendorSku, storeId, conditionName,
  // 	productName, manufacturer, upc, mpn, msrp, originalPrice, marketPrice, price, cost, disposalFee, processingFee,
  // 	primaryCategory, secondaryCategory, image, shipType, vendorSupplierCode, trackingNumber, source,
  // 	inactiveReasonId, pricingTypeId, productDisplay]))
  var result = await conn.query(sql, [
    rushSku,
    status,
    userId,
    userType,
    manifestId,
    stagingProductId,
    vendorSku,
    storeId,
    conditionName,
    productName,
    manufacturer,
    upc,
    mpn,
    msrp,
    originalPrice,
    marketPrice,
    price,
    cost,
    disposalFee,
    processingFee,
    primaryCategory,
    secondaryCategory,
    image,
    shipType,
    vendorSupplierCode,
    trackingNumber,
    source,
    inactiveReasonId,
    pricingTypeId,
    productDisplay,
  ])

  return result
}

exports.createProductLocationLog = async (conn, userId, userType, rushSku, fromStoreId, toStoreId) => {
  // console.log(mysql.format(`INSERT INTO product_location_log (sku, user_id, store_id_from, store_id_to) VALUES (?, 111, ?, ?)`, [rushSku, fromStoreId, toStoreId]))
  var result = await conn.query(
    `INSERT INTO product_location_log (sku, user_id, user_type, store_id_from, store_id_to, location_from, location_to) VALUES (?, ?, ?, ?, ?, '', '')`,
    [rushSku, userId, userType, fromStoreId, toStoreId]
  )

  return result
}

exports.deactivateProductLocationLog = async (
  conn,
  userId,
  userType,
  rushSku,
  fromStoreId,
  fromLocation,
  fromPallet,
  toStoreId
) => {
  // console.log(mysql.format(`INSERT INTO product_location_log (sku, user_id, user_type, store_id_from, location_from, storage_pallet_from, store_id_to, location_to, storage_pallet_to)
  // 																VALUES (?, ?, ?, ?, ?, ?, ?, '', '')`, [rushSku, userId, userType, fromStoreId, (fromLocation === null) ? '' : fromLocation, fromPallet, toStoreId]))
  var result = await conn.query(
    `INSERT INTO product_location_log (sku, user_id, user_type, store_id_from, location_from, storage_pallet_from, store_id_to, location_to, storage_pallet_to) 
																	VALUES (?, ?, ?, ?, ?, ?, ?, '', NULL)`,
    [rushSku, userId, userType, fromStoreId, fromLocation === null ? '' : fromLocation, fromPallet, toStoreId]
  )

  return result
}

exports.markProductReceived = async (conn, productId) => {
  var result = await conn.query(`UPDATE products SET step_receive_done = 'Y' WHERE product_id = ?`, [productId])

  return result
}

exports.markProductVerified = async (conn, productId) => {
  var result = await conn.query(`UPDATE products SET step_verify_done = 'Y' WHERE product_id = ?`, [productId])

  return result
}

exports.markProductReshipped = async (conn, productId) => {
  var result = await conn.query(`UPDATE products SET step_reshipping_done = 'Y' WHERE product_id = ?`, [productId])

  return result
}

exports.markProductConditioned = async (conn, productId) => {
  var result = await conn.query(`UPDATE products SET step_condition_done = 'Y' WHERE product_id = ?`, [productId])

  return result
}

exports.markProductNew = async (conn, productId) => {
  var result = await conn.query(
    `UPDATE products SET in_original_boxes = 'Y', reuse_packaging = 'Y', shippable = 'Y' WHERE product_id = ?`,
    [productId]
  )

  return result
}

exports.updateProductsRecord = async (conn, rushSku, trackingNumber, vendorSupplierCode) => {
  var result = null
  var sql = `UPDATE products SET `
  var setClause = ''
  var values = []

  if (trackingNumber !== undefined && trackingNumber !== null) {
    values.push(trackingNumber)
    setClause += ` tracking_number = ?`
  }

  if (vendorSupplierCode !== undefined && vendorSupplierCode !== undefined) {
    values.push(vendorSupplierCode)
    if (setClause.length > 0) {
      setClause += ', '
    }
    setClause += ` vendor_supplier_code = ?`
  }

  if (setClause.length > 0) {
    result = await conn.query(`UPDATE products SET ${setClause}, date_modified = NOW() WHERE sku = ${rushSku}`, values)
  }

  return result
}

exports.getProduct = async (rushSku, conn) => {
  var connection = conn ? conn : globals.poolRO

  var row = await connection.query(`SELECT * FROM products WHERE sku = ? ORDER BY date_created DESC`, [rushSku])
  colUtils.outboundNaming(row)

  return row
}

exports.trashProduct = async (conn, rushSku, disposalFee, cubicInches, partnerDisposalFee, partnerProcessingFee) => {
  return conn.query(`
    UPDATE products
    SET
      status = 'Inactive',
      condition_name = 'Trash',
      inactive_reason_id = 1,
      online_shopping = 'N',
      location_number = null,
      pallet_number = null,
      disposal_fee = ?,
      partner_disposal_cubic_inches = ?,
      partner_disposal_fee = ?,
      partner_receipt_inspection_cubic_inches = ?,
      partner_receipt_inspection_fee = ?
    WHERE sku = ?`, [disposalFee, cubicInches, partnerDisposalFee, cubicInches, partnerProcessingFee, rushSku])
}

exports.markSkuNotAvailable = async (conn, rushSku) => {
  // console.log(mysql.format(`UPDATE products SET status = 'Inactive', condition_name = 'Trash', inactive_reason_id = 1, online_shopping = 'N', location_number = null, pallet_number = null, disposal_fee = ? WHERE sku = ?`, [disposalFee, rushSku]))
  var rows = await conn.query(`SELECT sku FROM skus WHERE sku = ?`, [rushSku])

  if (rows.length) {
    await conn.query(`UPDATE skus SET available = 'N' WHERE sku = ?`, [rushSku])
  }
}
