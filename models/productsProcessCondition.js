'use strict'

const { snakeCase } = require('lodash')
const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

const allowedProductConditionUpdates = [
  'cost',
  'damageTop',
  'damageBottom',
  'damageInterior',
  'disposalFee',
  'partnerDisposalCubicInches',
  'partnerDisposalFee',
  'partnerReceiptInspectionCubicInches',
  'partnerReceiptInspectionFee',
  'inactiveReasonId',
  'locationNumber',
  'missingHardware',
  'onlineShopping',
  'palletNumber',
  'price',
  'pricingTypeId',
  'status',
]

exports.updateProductCondition = async (conn, rushSku, conditionName, assemblyInstructions, updates) => {
  const { columns, values } = allowedProductConditionUpdates.reduce(
    (result, columnName) => {
      if (typeof updates[columnName] !== 'undefined') {
        result.columns.push(snakeCase(columnName))
        result.values.push(updates[columnName])
      }
      return result
    },
    { columns: [], values: [] }
  )

  await conn.query(
    `
    UPDATE products
    SET
      ${columns.map(column => `${column} = ?`).join(', ')}${columns.length > 0 ? ', ' : ''}
      step_condition_done = 'Y',
      condition_name = ?,
      assembly_instructions = ?
    WHERE sku = ?`,
    [...values, conditionName, assemblyInstructions, rushSku]
  )

  const result = await conn.query('SELECT * FROM products WHERE sku = ?', [rushSku])
  colUtils.outboundNaming(result)
  return result && result.length ? result[0] : undefined
}

exports.getVendorById = async (productConn, vendorId) => {
  const conn = productConn || globals.productROPool
  const result = await conn.query(`SELECT * FROM vendors WHERE id = ?`, [vendorId])
  colUtils.outboundNaming(result)
  return result && result.length ? result[0] : undefined
}

exports.getProductDamagePricingRule = async (conn, severity, location, visibility) => {
  const result = await conn.query(
    `
    SELECT *
    FROM product_damage_pricing_rules
    WHERE
      active = 'Y' AND
      damage_severity = ? AND
      damage_location = ? AND
      damage_visibility = ?
    ORDER BY name`,
    [severity, location, visibility]
  )
  colUtils.outboundNaming(result)
  return result && result.length ? result[0] : undefined
}

exports.getProductMissingHardwareRule = async (conn, missingHardwareSeverity) => {
  const result = await conn.query(
    `
    SELECT * FROM product_missing_hardware_rules WHERE active = 'Y' AND missing_hardware_severity = ? ORDER BY name`,
    [missingHardwareSeverity]
  )
  colUtils.outboundNaming(result)
  return result && result.length ? result[0] : undefined
}

exports.getProductCostRule = async (conn, vendorId, conditionName) => {
  const result = await conn.query(
    `
    SELECT * FROM product_cost_rules WHERE active = 'Y' AND vendor_id = ? AND condition_name = ? ORDER BY name`,
    [vendorId, conditionName]
  )
  colUtils.outboundNaming(result)
  return result && result.length ? result[0] : undefined
}
