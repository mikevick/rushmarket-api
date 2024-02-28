'use strict'

const { snakeCase } = require('lodash')

const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

exports.create = async (productConn, ltlReturn) => {
  const conn = productConn || globals.productPool

  const id = globals.mongoid.fetch()
  const {
    customerAddress1,
    customerAddress2,
    customerCity,
    customerFirstName,
    customerLastName,
    customerEmail,
    customerPhone,
    customerPhoneExt,
    customerState,
    customerZip,
    rma,
    userId,
    userType,
    vendorId,
  } = ltlReturn

  await conn.query(`
    INSERT INTO vendors.ltl_returns (
      id,
      vendor_id,
      user_id,
      user_type,
      rma,
      status,
      date_created,
      customer_first_name,
      customer_last_name,
      customer_email,
      customer_address_1,
      customer_address_2,
      customer_city,
      customer_state,
      customer_zip,
      customer_phone,
      customer_phone_ext,
      est_ship_cost,
      est_recovery,
      tracking_number
    ) VALUES (?, ?, ?, ?, ?, 'New', NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
  `, [
    id,
    vendorId,
    userId,
    userType,
    rma,
    customerFirstName,
    customerLastName,
    customerEmail,
    customerAddress1,
    customerAddress2,
    customerCity,
    customerState,
    customerZip,
    customerPhone,
    customerPhoneExt,
  ])

  return id
}

function convertOrderByForSql(orderBy) {
  const match = orderBy && /^(\w+(?:\.\w+)?)(?:\s+(ASC|DESC))?$/i.exec(orderBy)
  if (!match) {
    return undefined
  }

  const [m, column, direction] = match
  const sqlColumn = column.includes('.') ? column : convertColumnToSqlColumn(column)
  return sqlColumn ? `${sqlColumn}${direction === 'DESC' ? ' DESC' : ''}` : undefined
}

function convertColumnToSqlColumn(column) {
  switch (column) {
    case 'dateCreated':
      return `lr.${snakeCase(column)}`
    default:
      return undefined
  }
}

exports.get = async (productConn, dateCreatedStart, dateCreatedEnd, options) => {
  const conn = productConn || globals.productPool
  const { vendorIds, statuses, id, rma, limit, offset, orderBy, countOnly } = options

  const selectClause = countOnly ? 'COUNT(*) as count' : `
  lr.id,
  lr.vendor_id,
  v.name as vendor_name,
  lr.user_id,
  lr.rma,
  lr.status,
  lr.date_created,
  lr.customer_first_name,
  lr.customer_last_name,
  lr.customer_address_1,
  lr.customer_address_2,
  lr.customer_email,
  lr.customer_city,
  lr.customer_state,
  lr.customer_zip,
  lr.customer_phone,
  lr.customer_phone_ext,
  lr.est_ship_cost,
  lr.est_recovery,
  lr.tracking_number,
  lr.tracking_link,
  lr.est_days_to_pickup,
  (
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'id', lri.id,
      'vendor_sku', lri.vendor_sku
    ))
    FROM vendors.ltl_return_items lri
    WHERE lri.ltl_return_id = lr.id
  ) as ltl_return_items
  `

  const sqlOrderBy = convertOrderByForSql(orderBy)
  const ordering = !countOnly && sqlOrderBy

  const pagingValues = []
  const limiting = !countOnly
  if (limiting) {
    pagingValues.push(offset, limit)
  }

  const whereConditions = []
  const whereValues = []
  if (vendorIds.length) {
    whereConditions.push('lr.vendor_id IN (?)')
    whereValues.push(vendorIds)
  }
  if (statuses.length) {
    whereConditions.push('lr.status IN (?)')
    whereValues.push(statuses)
  }
  if (id) {
    whereConditions.push('lr.id = ?')
    whereValues.push(id)
  }

  if (rma) {
    whereConditions.push('lr.rma = ?')
    whereValues.push(rma)
  } else {
    whereConditions.push('lr.date_created >= ?')
    whereValues.push(dateCreatedStart)
    whereConditions.push('lr.date_created <= ?')
    whereValues.push(dateCreatedEnd)
  }

  const results = conn.query(`
    SELECT ${selectClause}
    FROM vendors.ltl_returns lr
    LEFT JOIN vendors.vendors v ON lr.vendor_id = v.id
    WHERE
      ${whereConditions.join('\nAND ')}
      ${ordering ? `ORDER BY ${sqlOrderBy}` : ''}
      ${limiting ? 'LIMIT ?, ?' : ''}
  `, [...whereValues, ...pagingValues])

  return countOnly ?
    results.then(result => result[0].count) :
    results
      .then(colUtils.outboundNaming)
      .then(rows => rows.map(row => ({
        ...row,
        ltlReturnItems: row.ltlReturnItems ? colUtils.outboundNaming(JSON.parse(row.ltlReturnItems)) : []
      })))
}

exports.getById = async (productConn, id) => {
  const conn = productConn || globals.productPool
  return conn.query(`SELECT * FROM vendors.ltl_returns WHERE id = ?`, [id])
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

exports.update = async (productConn, ltlReturn) => {
  const conn = productConn || globals.productPool

  const { estDaysToPickup, estShipCost, estRecovery, id, status, trackingNumber, trackingLink, vendorId } = ltlReturn

  const columns = []
  const values = []

  if (typeof estDaysToPickup !== 'undefined') {
    columns.push('est_days_to_pickup')
    values.push(estDaysToPickup)
  }

  if (typeof estShipCost !== 'undefined') {
    columns.push('est_ship_cost')
    values.push(estShipCost)
  }

  if (typeof estRecovery !== 'undefined') {
    columns.push('est_recovery')
    values.push(estRecovery)
  }

  if (typeof status !== 'undefined') {
    columns.push('status')
    values.push(status)
  }

  if (typeof trackingNumber !== 'undefined') {
    columns.push('tracking_number')
    values.push(trackingNumber)
  }

  if (typeof trackingLink !== 'undefined') {
    columns.push('tracking_link')
    values.push(trackingLink)
  }

  return conn.query(`
    UPDATE vendors.ltl_returns
    SET ${columns.map(column => `${column} = ?`).join(', ')}
    WHERE id = ? AND vendor_id = ?
    `, [...values, id, vendorId])
}
