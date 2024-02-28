'use strict'

const { snakeCase } = require('lodash')

const globals = require('../globals')

const mysql = require('promise-mysql')

const colUtils = require('../utils/columnUtils')
const userUtils = require('../utils/userUtils')

exports.getNewDSOrderInfo = async id => {
  var prom = []

  var sfmLocation = process.env.PO_SFM_LOCATION ? process.env.PO_SFM_LOCATION : '900'

  //	Get order number where we left off.
  var bookmark = await globals.pool.query('SELECT bookmark FROM vendor_po_bookmark')

  //	Retrieve new order info.
  var sql = `SELECT o.order_date_created, p.store_id, mb.home_city_id AS member_city_id, 
		o.order_id, o.source_order_id,  o.source_order_name, 
		os.full_name, CONCAT_WS(' ', os.address_1, os.address_2) AS customer_address, 
		os.city AS customer_city, os.state AS customer_state, os.zip AS customer_zip, CONCAT(os.city, CONCAT(', ', CONCAT(os.state, CONCAT(' ', os.zip)))) AS customer_locale, 
		st.city_id AS hub_city_id, st.store_name, st.address, st.city, st.state, st.zip, st.type, CONCAT(st.city, CONCAT(', ', CONCAT(st.state, CONCAT(' ', st.zip)))) AS store_locale, 
		m.vendor_id, m.manifest_source, p.name, p.seller_product_id, p.upc, li.sku, li.quantity, li.fulfillment_method, p.cost 
		FROM orders o 
		LEFT JOIN order_shipping os ON o.order_id = os.order_id 
		LEFT JOIN order_line_items li ON o.order_id = li.order_id 
		LEFT JOIN skus s ON li.sku = s.sku 
		LEFT JOIN products p ON s.product_id = p.product_id 
		LEFT JOIN manifests m ON m.manifest_id = p.manifest_id 
		LEFT JOIN members mb ON mb.email = o.customer_email 
		LEFT JOIN stores st ON st.store_id = p.store_id
		WHERE o.order_date_created > ? 
		AND li.product_type = 'sku' 
		AND li.line_type = 'purchase' 
		AND m.manifest_source IN ('STS', 'DS') 
		ORDER BY order_date_created, source_order_id, vendor_id, fulfillment_method, seller_product_id`

  // AND o.order_date_created < DATE_ADD(?, INTERVAL 30 DAY)

  // LEFT JOIN stores st ON ((st.city_id = mb.home_city_id) AND (st.active = 'Y') AND (st.type = 'PHYSICAL'))

  //	8/3/2020 the 900 location was originally used for national site.   Now being used for Belami RBR.  Saving this in case we
  //	need a similar SFM solution in the future.
  // "UNION " +
  // "SELECT o.order_date_created, p.store_id, mb.home_city_id AS member_city_id, " +
  // 		"o.order_id, o.source_order_id,  o.source_order_name, " +
  // 		"os.full_name, CONCAT_WS(' ', os.address_1, os.address_2) AS customer_address, " +
  // 		"os.city AS customer_city, os.state AS customer_state, os.zip AS customer_zip, CONCAT(os.city, CONCAT(', ', CONCAT(os.state, CONCAT(' ', os.zip)))) AS customer_locale,  " +
  // 		"st.city_id AS hub_city_id, st.store_name, st.address, st.city, st.state, st.zip, st.type, CONCAT(st.city, CONCAT(', ', CONCAT(st.state, CONCAT(' ', st.zip)))) AS store_locale, " +
  // 		"m.vendor_id, m.manifest_source, p.name, p.seller_product_id, p.upc, li.sku, li.quantity, p.cost " +
  // 	"FROM orders o " +
  // 			"LEFT JOIN order_shipping os ON o.order_id = os.order_id " +
  // 			"LEFT JOIN order_line_items li ON o.order_id = li.order_id " +
  // 			"LEFT JOIN skus s ON li.sku = s.sku " +
  // 			"LEFT JOIN products p ON s.product_id = p.product_id " +
  // 			"LEFT JOIN manifests m ON m.manifest_id = p.manifest_id " +
  // 			"LEFT JOIN stores st ON st.store_id = p.store_id " +
  // 			"LEFT JOIN members mb ON mb.email = o.customer_email " +
  // 	"WHERE o.order_date_created > ? " +
  // 			"AND li.product_type = 'sku' " +
  // 			"AND li.line_type = 'purchase' " +
  // 			"AND m.manifest_source = 'RBR' " +
  // 			"AND p.location_number = ? " +

  // console.log(mysql.format(sql, [bookmark[0].bookmark, bookmark[0].bookmark, sfmLocation]));
  var orders = await globals.pool.query(sql, [bookmark[0].bookmark, bookmark[0].bookmark, sfmLocation])

  for (var i = 0; i < orders.length; i++) {
    prom.push(
      globals.productPool.query(
        "SELECT vp.prefix, v.NAME AS partner_name, CONCAT_WS(' ', company_address1, company_address2) AS partner_address, " +
          'company_city, company_state_or_province, company_postal_code, order_email, email, ' +
          "CONCAT(company_city, CONCAT(', ', CONCAT(company_state_or_province, CONCAT(' ', company_postal_code)))) AS partner_locale, " +
          'damage_defective_allowance, tariff, v.lead_time, shipping_cutoff_cst, p.lead_time as product_lead_time, p.ship_type as product_ship_type ' +
          'FROM vendors v ' +
          'LEFT JOIN vendor_catalog_products p ON p.vendor_id = v.id ' +
          'LEFT JOIN vendor_prefixes vp ON ((vp.vendor_id = v.id) AND (vp.prefix = SUBSTRING(p.sku, 1, 4))) ' +
          'WHERE v.id = ? AND vendor_sku = ?',
        [orders[i].vendor_id, orders[i].seller_product_id]
      )
    )
  }

  var vendors = await Promise.all(prom)

  for (var i = 0; i < orders.length; i++) {
    if (vendors[i].length === 1) {
      orders[i].partner_prefix = vendors[i][0].prefix
      orders[i].partner_name = vendors[i][0].partner_name
      orders[i].partner_address = vendors[i][0].partner_address
      orders[i].partner_city = vendors[i][0].company_city
      orders[i].partner_state_or_province = vendors[i][0].company_state_or_province
      orders[i].partner_postal_code = vendors[i][0].company_postal_code
      orders[i].partner_locale = vendors[i][0].partner_locale
      orders[i].orders_email = vendors[i][0].order_email
      orders[i].email = vendors[i][0].email
      orders[i].partner_dd_allowance = vendors[i][0].damage_defective_allowance
      orders[i].partner_tariff = vendors[i][0].tariff
      orders[i].partner_lead_time =
        vendors[i][0].product_lead_time === null ? vendors[i][0].lead_time : vendors[i][0].product_lead_time
      orders[i].partner_shipping_cutoff_cst = vendors[i][0].shipping_cutoff_cst
      orders[i].product_ship_type = vendors[i][0].product_ship_type === null ? null : vendors[i][0].product_ship_type
    } else {
      orders[i].partner_prefix = null
      orders[i].partner_name = null
      orders[i].partner_address = null
      orders[i].partner_city = null
      orders[i].partner_state_or_province = null
      orders[i].partner_postal_code = null
      orders[i].partner_locale = null
      orders[i].orders_email = null
      orders[i].email = null
      orders[i].partner_dd_allowance = null
      orders[i].partner_tariff = null
      orders[i].partner_lead_time = null
      orders[i].partner_shipping_cutoff_cst = null
      orders[i].product_ship_type = null
    }
  }

  return orders
}

exports.loadHolidays = async () => {
  var holidays = []

  try {
    var h = await globals.pool.query('SELECT day, label FROM holidays')
  } catch (e) {
    console.log(e)
  }

  for (var i = 0; i < h.length; i++) {
    holidays.push({
      day: h[i].day,
      label: h[i].label,
    })
  }

  return holidays
}

//
// Update bookmark.
//
exports.updateBookmark = async tstamp => {
  await globals.pool.query('UPDATE vendor_po_bookmark SET bookmark = ?', tstamp)

  return
}

exports.getShopifyOrderAndVariant = async skus => {
  var placeholders = ''

  for (var i = 0; i < skus.length; i++) {
    if (placeholders.length > 0) {
      placeholders += ', '
    }
    placeholders += '?'
  }

  var rows = await globals.pool.query(
    `SELECT o.order_id, s.shopify_location_id, o.source_order_id, p.store_id, p.ship_type, p.sku, 
																						p.shopify_variant_id, p.shopify_inventory_item_id, 
																						li.line_item_date_created, li.line_type, li.source_line_id, ls.partner_fulfillment_fee
																					FROM products p 
																						LEFT JOIN order_line_items li ON p.shopify_variant_id = li.shopify_variant_id 
																						LEFT JOIN order_line_static ls ON li.source_line_id = ls.source_line_id
																						LEFT JOIN orders o ON li.order_id = o.order_id 
																						LEFT JOIN stores s ON p.store_id = s.store_id 
																						INNER JOIN (
																							SELECT sku, MAX(line_item_date_created) AS most_recent
																								FROM order_line_items li GROUP BY sku
																						) mr ON li.sku = mr.sku AND li.line_item_date_created = most_recent		
																					WHERE li.line_type = 'purchase'
																						AND p.sku IN (${placeholders})
																					ORDER BY order_id, store_id, ship_type`,
    skus
  )

  colUtils.outboundNaming(rows)
  return rows
}

exports.markLineItemFulfilled = async lineId => {
  var rows = await globals.pool.query('SELECT id FROM order_line_static WHERE source_line_id = ?', [lineId])
  if (rows.length > 0) {
    await globals.pool.query("UPDATE order_line_static SET fulfilled = 'Y' WHERE source_line_id = ?", [lineId])
    var result = await globals.pool.query(
      'INSERT INTO order_line_log (order_line_static_id, type, `from`, `to`, user_id) VALUES (?, ?, ?, ?, 98)',
      [rows[0].id, 'FULFILLED', 'N', 'Y']
    )
  }
}

exports.getOrdersToCapture = async () => {
  var rows = await globals.pool.query(`SELECT shopify_order_id 
																					FROM orders_for_dp_capture
																					ORDER BY date_created`)

  colUtils.outboundNaming(rows)
  return rows
}

exports.getOrderCaptureDetail = async shopifyOrderId => {
  var rows = await globals.pool.query(
    `SELECT o.order_date_created, o.order_id, c.shopify_order_id, li.source_line_id, li.product_type, li.shopify_variant_id, 
																						h1.status, h2.status, h1.context AS context_active, h2.context AS context_history,
																						e.ship_type, e.origin_city_id, 
																						li.sku, 
																						s.zip, z.city_id AS dest_city_id, li.sku, li.fulfillment_method
																					FROM orders_for_dp_capture c
																						LEFT JOIN orders o ON o.source_order_id = c.shopify_order_id
																						LEFT JOIN order_shipping s ON o.order_id = s.order_id
																						LEFT JOIN zip_to_city z ON s.zip = z.zip
																						LEFT JOIN order_line_items li ON (o.order_id = li.order_id)
																						LEFT JOIN order_line_static ls ON (ls.source_line_id = li.source_line_id)
																						LEFT JOIN metro_sku_eligibility e ON ((e.sku = li.sku) AND (e.dest_city_id = z.city_id))
																						LEFT JOIN product_holds h1 ON ((h1.product_id = li.shopify_variant_id) AND (h1.status IN ('PURCHASED', 'ABANDONED')) AND (h1.date_created = (SELECT MAX(date_created) FROM product_holds WHERE product_id = h1.product_id)))
																						LEFT JOIN product_holds_history h2 ON ((h2.product_id = li.shopify_variant_id) AND (h2.status IN ('PURCHASED', 'ABANDONED')) AND (h2.date_created = (SELECT MAX(date_created) FROM product_holds_history WHERE product_id = h2.product_id)))
																					WHERE li.product_type IN ('sku', 'quick sale', 'gift card') AND shopify_order_id = ?
																					GROUP BY shopify_order_id, source_line_id
																					ORDER BY order_date_created, shopify_order_id, source_line_id`,
    [shopifyOrderId]
  )

  colUtils.outboundNaming(rows)
  return rows
}

exports.pruneOrdersToCapture = async () => {
  var rows = await globals.pool.query(
    `DELETE FROM orders_for_dp_capture WHERE date_created < DATE_ADD(NOW(), INTERVAL -10 DAY)`
  )

  return rows
}

exports.captureDnPMessaging = async (
  shopifyOrderId,
  sourceLineId,
  shipType,
  carrier,
  edd,
  eddText,
  estimatedShipCost,
  estimatedShipDate,
  ripple
) => {
  var result = await globals.pool.query(
    `UPDATE order_line_static 
																					SET ship_type = ?, 
																							carrier = ?, 
																							edd = ?, 
																							edd_text = ?,
																							estimated_ship_cost = ?, 
																							estimated_ship_date = ?,
																							ripple = ?
																						WHERE source_line_id = ?`,
    [shipType, carrier, edd, eddText, estimatedShipCost, estimatedShipDate, ripple, sourceLineId]
  )
}

exports.removeOrderToBeCaptured = async shopifyOrderId => {
  await globals.pool.query('DELETE FROM orders_for_dp_capture WHERE shopify_order_id = ?', [shopifyOrderId])
}

exports.markOrderForCapture = async shopifyOrderId => {
  await globals.pool.query('INSERT INTO orders_for_dp_capture (shopify_order_id) VALUES (?)', [shopifyOrderId])
}

exports.checkOrderBySourceOrderName = async (sourceOrderName, vendorId, vendorSku) => {
  var sql = `SELECT s.shopify_location_id, m.vendor_id, p.seller_product_id, p.shopify_variant_id, p.shopify_inventory_item_id, o.source_order_id, li.* 
								FROM orders o 
									LEFT JOIN order_line_items li ON li.order_id = o.order_id
									LEFT JOIN products p ON p.sku = li.sku
									LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
									LEFT JOIN stores s ON p.store_id = s.store_id 
								WHERE o.source_order_name = ? AND m.vendor_id = ?`
  // console.log(mysql.format(sql, [sourceOrderName, vendorId, vendorSku]))
  var rows = await globals.pool.query(sql, [sourceOrderName, vendorId, vendorSku])
  colUtils.outboundNaming(rows)

  return rows
}

exports.checkVSkuBySourceOrderName = async (sourceOrderName, vendorId, vendorSku) => {
  var sql = `SELECT s.shopify_location_id, m.vendor_id, p.seller_product_id, p.shopify_variant_id, p.shopify_inventory_item_id, o.source_order_id, li.* 
								FROM orders o 
									LEFT JOIN order_line_items li ON li.order_id = o.order_id
									LEFT JOIN products p ON p.sku = li.sku
									LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
									LEFT JOIN stores s ON p.store_id = s.store_id 
								WHERE o.source_order_name = ? AND m.vendor_id = ?`

  if (vendorSku !== undefined && vendorSku !== null) {
    sql += ` AND seller_product_id = ?`
  }

  var rows = await globals.pool.query(sql, [sourceOrderName, vendorId, vendorSku])
  colUtils.outboundNaming(rows)

  return rows
}

exports.getBySourceOrderName = async (sourceOrderName, vendorId, vendorSku) => {
  var sql = `SELECT s.shopify_location_id, m.vendor_id, p.seller_product_id, p.shopify_variant_id, p.shopify_inventory_item_id, o.source_order_id, li.* 
								FROM orders o 
									LEFT JOIN order_line_items li ON li.order_id = o.order_id
									LEFT JOIN products p ON p.sku = li.sku
									LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
									LEFT JOIN stores s ON p.store_id = s.store_id 
								WHERE line_type = 'purchase' AND o.source_order_name = ? AND m.vendor_id = ?`

  if (vendorSku !== undefined && vendorSku !== null) {
    sql += ` AND seller_product_id = ? AND li.source_line_id NOT IN (SELECT source_line_id FROM ds_vendor_invoices WHERE source_line_id IS NOT NULL) LIMIT 0,1`
  } else {
    sql += ` AND li.source_line_id NOT IN (SELECT source_line_id FROM ds_vendor_invoices WHERE source_line_id IS NOT NULL) `
  }

  // console.log(mysql.format(sql, [sourceOrderName, vendorId, vendorSku]))
  var rows = await globals.pool.query(sql, [sourceOrderName, vendorId, vendorSku])

  colUtils.outboundNaming(rows)
  return rows
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
    case 'customerEmail':
    case 'customerFirstName':
    case 'customerLastName':
    case 'orderDateCreated':
    case 'orderId':
    case 'sourceName':
    case 'sourceOrderName':
    case 'totalPrice':
      return `o.${snakeCase(column)}`
    case 'fullName':
      return `os.${snakeCase(column)}`
    case 'storeName':
      return `s.${snakeCase(column)}`
    default:
      return undefined
  }
}

exports.getOrders = async (productStoreId, options) => {
  const { countOnly, customerEmail, customerFirstName, customerLastName, limit, offset, orderBy, orderLineStaticStatus,
    sourceOrderName, sku } = options

  const sqlOrderBy = convertOrderByForSql(orderBy)
  const ordering = !countOnly && sqlOrderBy

  const pagingValues = []
  const limiting = typeof offset === 'number' && typeof limit === 'number'
  if (limiting) {
    pagingValues.push(offset, limit)
  }

  const conditions = []
  const values = []

  const openOrdersConditions = []
  const openOrdersValues = []

  if (orderLineStaticStatus === 'ISNULL') {
    conditions.push('ols.status IS NULL')
    openOrdersConditions.push('ols2.status IS NULL')
  } else if (orderLineStaticStatus) {
    conditions.push('ols.status = ?')
    values.push(orderLineStaticStatus)
    openOrdersConditions.push('ols2.status = ?')
    openOrdersValues.push(orderLineStaticStatus)
  }
  if (customerFirstName) {
    conditions.push('o.customer_first_name LIKE ?')
    values.push(`${customerFirstName}%`)
  }
  if (customerLastName) {
    conditions.push('o.customer_last_name LIKE ?')
    values.push(`${customerLastName}%`)
  }
  if (customerEmail) {
    conditions.push('o.customer_email LIKE ?')
    values.push(`${customerEmail}%`)
  }
  if (sourceOrderName) {
    conditions.push('o.source_order_name LIKE ?')
    values.push(`${sourceOrderName}%`)
  }
  if (sku) {
    conditions.push('oli.sku = ?')
    values.push(`${sku}%`)
  }

  const sql = `
		${countOnly ? 'SELECT COUNT(num) AS num FROM (' : ''}
		SELECT
			count(*) as num,
			o.order_id,
			o.source_order_name,
      o.source_order_id,
			o.store_id,
			o.customer_first_name,
			o.customer_last_name,
			o.customer_email,
			o.order_date_created,
			o.total_price,
			o.source_name,
			os.full_name,
			s.store_name,
			CASE WHEN ols.status = 'Issue' THEN (
				SELECT JSON_ARRAYAGG(JSON_OBJECT(
					'sku', li.sku,
					'image', p2.image,
					'notes', ls.notes,
					'issueReason', ls.issue_reason
				))
				FROM orders o2
				  JOIN order_line_items li ON li.order_id = o2.order_id
				  JOIN order_line_static ls ON
					  ls.source_line_id = li.source_line_id
						AND ls.source_name = o2.source_name
						AND ls.sku = li.sku
				  LEFT JOIN products p2 ON p2.sku = li.sku
				WHERE
					o2.order_id = o.order_id
					AND ls.status = 'Issue'
			) ELSE '[]' END as issue_lines
		FROM orders o
	  LEFT JOIN order_shipping os ON os.order_id = o.order_id
		LEFT JOIN order_line_items oli ON oli.order_id = o.order_id
		LEFT JOIN order_line_static ols ON ols.source_line_id = oli.source_line_id AND ols.source_name = o.source_name
    LEFT JOIN stores s ON s.store_id = o.store_id
		LEFT JOIN products p ON p.sku = oli.sku
		LEFT JOIN order_risks r ON r.source_order_id = o.source_order_id
		WHERE
		-- productStoreId
			COALESCE(p.store_id, o.store_id) = ?
		-- removeRiskOrders = true
			AND o.source_order_id NOT IN (
				SELECT source_order_id
				FROM order_risks
				WHERE status = 'NEW' AND recommendation IN ('investigate', 'cancel')
			)
		-- always remove orders that have been cancelled due to risk
			AND o.source_order_id NOT IN (
				SELECT source_order_id
				FROM order_risks
				WHERE status = 'CANCEL'
			)
		-- orderLineStaticFulfilled = N
		  ${orderLineStaticStatus ? `AND ols.fulfilled = 'N'` : ''}
    -- openOrders = true
		  ${orderLineStaticStatus ? `AND o.financial_status != 'refunded'` : ''}
  		AND o.source_name != 'pos'
			-- HACK: because legacy data is not good
			AND o.order_date_created > '2021-06-23 18:00:00'
			AND (
				-- get the count of line static data for each SKU that is not returned/cancelled and has NULL (unchanged) status
				-- must have at least 1 line that matches the criteria to be an open order
        SELECT COUNT(ols2.id) AS num
				FROM order_line_static ols2
				WHERE 1=1
					${openOrdersConditions.length ? `AND ${openOrdersConditions.join('\n')}` : ''}
					AND ols2.source_name = o.source_name
					${orderLineStaticStatus ? `AND ols2.fulfilled = 'N'` : ''}
					AND ols2.source_line_id IN (
						-- get the most recent lines for each SKU and include only if a purchase (not returned/cancelled)
						SELECT oli2.source_line_id
						FROM order_line_items oli2
						INNER JOIN (
							SELECT sku, MAX(line_item_date_created) AS line_item_date_created
							FROM order_line_items
							-- added group by order_id here, sku is not unique enough
							GROUP BY sku
						) oli3 ON oli2.line_item_date_created = oli3.line_item_date_created AND oli2.sku = oli3.sku
						LEFT JOIN products p2 ON p2.sku = oli2.sku
						WHERE oli2.order_id = o.order_id
				      ${orderLineStaticStatus ? `AND oli2.line_type = 'purchase'`: ''}
							AND p2.sku = ols2.sku
							AND COALESCE(p2.store_id, o.store_id) = ?
							GROUP BY oli2.sku
							ORDER BY oli2.line_item_date_created DESC
					)
				) > 0

    -- weed out risky orders
      AND o.source_order_id NOT IN (
        SELECT source_order_id
          FROM order_risks
          WHERE STATUS != 'ACCEPT' AND recommendation != 'accept'
      )
  
		-- dynamic conditions
			${conditions.length ? `AND ${conditions.join('\nAND ')}` : ''}
		GROUP BY o.order_id
		${ordering ? `ORDER BY ${sqlOrderBy}` : ''}
		${limiting ? 'LIMIT ?, ?' : ''}
		${countOnly ? ') as tbl' : ''}`

  const conn = await globals.pool.getConnection()
  try {
    // console.log(mysql.format(sql, [productStoreId, ...openOrdersValues, productStoreId, ...values, ...pagingValues]))
    await conn.query(`SET SESSION sql_mode = 'STRICT_TRANS_TABLES'`)
    return conn.query(sql, [productStoreId, ...openOrdersValues, productStoreId, ...values, ...pagingValues,])
      .then(colUtils.outboundNaming)
      .then(rows =>
        rows.map(row =>
          typeof row.issueLines !== 'undefined'
            ? {
                ...row,
                issueLines: row.issueLines ? JSON.parse(row.issueLines) : [],
              }
            : row
        )
      )
  } finally {
    globals.pool.releaseConnection(conn)
  }
}

exports.getOrder = async (sourceOrderName, productStoreId) => {
  return globals.poolRO.query(
    `
		SELECT
			o.order_id,
			o.source_order_id,
			o.source_order_name,
			o.source_name,
			o.store_id,
			o.customer_first_name,
			o.customer_last_name,
			o.customer_email,
			o.order_date_created,
			o.order_date_modified,
			o.payment_type,
			o.financial_status,
			o.total_discounts,
			o.subtotal_price,
			o.total_tax,
			o.total_price,
			o.total_line_items_price,
			o.platform,
			o.platform_channel,
			os.order_shipping_id,
			os.full_name,
			os.company,
			os.address_1,
			os.address_2,
			os.city,
			os.state,
			os.zip,
			os.phone_number,
			r.recommendation,
			r.status as risk_status,
			u.user_name as risk_user,
			u.user_id as risk_user_id,
			r.date_modified as risk_date_modified,
			CASE
					WHEN r.recommendation='cancel' THEN 'High'
					WHEN r.recommendation='investigate' THEN 'Medium'
					WHEN r.recommendation='accept' THEN 'Low'
					ELSE ''
			END as risk_level
		FROM orders o
				LEFT JOIN order_shipping os ON os.order_id = o.order_id
				LEFT JOIN order_risks r ON r.source_order_id = o.source_order_id
				LEFT JOIN users u ON u.user_id = r.modified_by
		WHERE
			(
				-- productStoreId
				o.store_id = ?
				OR EXISTS(
					SELECT 1
					FROM order_line_items oli
					LEFT JOIN products p ON p.sku = oli.sku
					WHERE oli.order_id = o.order_id
				)
			)
			AND o.source_order_name = ?
		LIMIT 1`,
    [productStoreId, sourceOrderName]
  )
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

/**
 * @param filters.orderId
 * @param filters.orderLineItemId
 */
exports.getOrderLineItems = async (productStoreId, filters = {}, internalFlag) => {
  const { sourceOrderName, orderLineItemId } = filters

  const sql = `
	SELECT
		i.product_name,
		i.order_line_item_id,
		i.order_id,
		i.line_type,
		i.product_type,
		i.sku,
		i.source_sku,
		i.shopify_user_id,
		i.shopify_product_id,
		i.shopify_variant_id,
		i.quantity,
		i.price,
		i.total_discount,
		i.total_tax,
		i.line_item_date_created,
		i.return_restock,
		i.return_note,
		i.tracking_numbers,
		i.tracking_company,
		i.tracking_urls,
		o.source_name,
		o.source_order_name,
		o.store_id as order_store_id,
		i.source_line_id,
		i.fulfillment_method,
		COALESCE(ls.original_store_id, o.store_id) as original_store_id,
		ls.status as order_line_status,
		ls.id as order_line_static_id,
		ls.fulfilled,
		ls.notes,
		ls.edd_text,
		ls.tracking_info,
		ls.grid_number,
		ls.product_cost as cost,
		ls.ship_type,
		ls.issue_reason,
		ls.shipping_labels,
		ls.resolution_reason,
		ls.resolution_notes,
		s.store_name,
		s2.store_id as member_store_id,
		s.shopify_store_id,
		IF(p.location_number = '', ls.location_number, p.location_number) as location_number,
		IF(p.location_number = '', ls.pallet_number, p.pallet_number) as pallet_number,
		p.name,
		p.image,
		p.product_display,
		p.status,
		p.shippable,
		p.local_shipping,
		p.ship_type,
		p.seller_product_id,
		p.store_id as product_store_id,
		p.price as product_price,
		p.online_quick_sale,
		p.dropship_type,
		m.vendor_id,
		m.manifest_source,
		psb.number_of_boxes,
		i2.line_type as current_item_status,
		i2.product_type as current_product_type,
		i2.price as current_price,
		i2.return_note as current_return_note,
		s3.store_name as product_store_name,
		s3.city as product_store_city,
		i2.return_reason_code_id,
		p.condition_name,
		damageTop.damage_location as damageLocation1,
		damageTop.damage_severity as damageSeverity1,
		damageTop.damage_visibility as damageVisibility1,
		damageBottom.damage_location as damageLocation2,
		damageBottom.damage_severity as damageSeverity2,
		damageBottom.damage_visibility as damageVisibility2,
		damageInterior.damage_location as damageLocation3,
		damageInterior.damage_severity as damageSeverity3,
		damageInterior.damage_visibility as damageVisibility3,
		missingHardware.missing_hardware_severity as missingHardware,
		sl.market_floor,
		ms.boxes as GDEBoxDimensions
	FROM order_line_items i
	LEFT JOIN orders o ON o.order_id = i.order_id
	LEFT JOIN order_line_static ls ON ls.source_line_id = i.source_line_id AND ls.source_name = o.source_name AND ls.sku = i.sku
	LEFT JOIN stores s ON s.store_id = COALESCE(ls.original_store_id, o.store_id)
	LEFT JOIN order_static ost ON ost.source_order_id = o.source_order_id AND ost.source_name = o.source_name
	LEFT JOIN members mb ON mb.id = ost.member_id
	LEFT JOIN stores s2 ON s2.city_id = mb.home_city_id AND s2.type = 'Physical'

	LEFT JOIN order_line_items i2 ON i2.order_line_item_id = (
		SELECT order_line_item_id
		FROM order_line_items
		WHERE sku = i.sku AND order_id = i.order_id
		ORDER BY line_item_date_created DESC
		LIMIT 1
	)
	LEFT JOIN products p ON p.sku = i.sku
	LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
	LEFT JOIN product_shipping_boxes psb ON psb.sku = i.sku
	LEFT JOIN stores s3 ON s3.store_id = p.store_id
	LEFT JOIN product_damage_pricing_rules damageTop ON p.damage_top = damageTop.product_damage_pricing_rules_id
	LEFT JOIN product_damage_pricing_rules damageBottom ON p.damage_bottom = damageBottom.product_damage_pricing_rules_id
	LEFT JOIN product_damage_pricing_rules damageInterior ON p.damage_interior = damageInterior.product_damage_pricing_rules_id
	LEFT JOIN product_missing_hardware_rules missingHardware ON p.missing_hardware = missingHardware.product_missing_hardware_rules_id
	LEFT JOIN storage_locations sl ON sl.location_number = p.location_number AND sl.store_id = p.store_id
	LEFT JOIN metro_sku_eligibility ms ON ms.sku = i.sku 
	WHERE 1 = 1
    ${internalFlag ? '' : 'AND p.store_id = ?'}
    ${sourceOrderName ? 'AND i.order_id = o.order_id AND o.source_order_name = ?' : ''}
		${orderLineItemId ? 'AND i.order_line_item_id = ?' : ''}
		AND i.product_type = 'sku'
		AND i.line_type = 'purchase'
	GROUP BY i.sku`

  const values = [
    ...(internalFlag ? [] : [productStoreId]),
    ...(sourceOrderName ? [sourceOrderName] : []),
    ...(orderLineItemId ? [orderLineItemId] : []),
  ]

  const conn = await globals.pool.getConnection()
  try {
    await conn.query(`SET SESSION sql_mode = 'STRICT_TRANS_TABLES'`)
    // console.log(mysql.format(sql, values));
    return conn.query(sql, values)
      .then(colUtils.outboundNaming)
  } finally {
    globals.pool.releaseConnection(conn)
  }
}

exports.getOrderLineItem = async orderLineItemId => {
  const result = await globals.poolRO.query(
    `
	SELECT i.line_item_date_created, i.order_id, i.order_line_item_id, i.sku, ls.id AS order_line_static_id, ls.status AS order_line_status, ls.ship_type,
	ls.source_name, s.partner_facility, os.full_name, os.company, os.address_1, os.address_2, os.city, os.state, os.zip, os.phone_number, p.store_id, p.seller_product_id AS vendor_sku,
	o.source_order_id, o.source_order_name, c.coin_id
	FROM order_line_items i
		LEFT JOIN products p ON i.sku = p.sku
		LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
		LEFT JOIN coins_to_vskus c ON ((c.vendor_id = m.vendor_id) AND (c.vendor_sku = p.seller_product_id))
		LEFT JOIN stores s ON p.store_id = s.store_id
		LEFT JOIN orders o ON o.order_id = i.order_id
		LEFT JOIN order_shipping os ON o.order_id = os.order_id
		LEFT JOIN order_line_static ls ON ls.source_line_id = i.source_line_id AND ls.source_name = o.source_name AND ls.sku = i.sku
		INNER JOIN (
			SELECT sku, MAX(line_item_date_created) AS most_recent
			FROM order_line_items li 
			GROUP BY sku
		) mr ON i.sku = mr.sku AND i.line_item_date_created = most_recent		
	WHERE 1=1
	${orderLineItemId ? 'AND i.order_line_item_id = ?' : ''}
		AND i.product_type = 'sku'
		AND i.line_type = 'purchase';`,
    [...(orderLineItemId ? [orderLineItemId] : [])]
  )
  colUtils.outboundNaming(result)
  return result
}

exports.getOrderLineItemBySource = async (sourceLineId, rushSku) => {
  return globals.poolRO.query(`
    SELECT i.line_item_date_created, i.order_id, i.order_line_item_id, i.sku, ls.id AS order_line_static_id, ls.status AS order_line_status, ls.ship_type,
    ls.source_name, s.partner_facility, os.full_name, os.company, os.address_1, os.address_2, os.city, os.state, os.zip, os.phone_number, os.phone_ext, p.store_id, p.seller_product_id AS vendor_sku,
    o.source_order_id, o.source_order_name, c.coin_id
    FROM order_line_items i
      LEFT JOIN products p ON i.sku = p.sku
      LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
      LEFT JOIN coins_to_vskus c ON ((c.vendor_id = m.vendor_id) AND (c.vendor_sku = p.seller_product_id))
      LEFT JOIN stores s ON p.store_id = s.store_id
      LEFT JOIN orders o ON o.order_id = i.order_id
      LEFT JOIN order_shipping os ON o.order_id = os.order_id
      LEFT JOIN order_line_static ls ON ls.source_line_id = i.source_line_id AND ls.source_name = o.source_name AND ls.sku = i.sku
      INNER JOIN (
        SELECT sku, MAX(line_item_date_created) AS most_recent
        FROM order_line_items li 
        GROUP BY sku
      ) mr ON i.sku = mr.sku AND i.line_item_date_created = most_recent		
    WHERE 1=1
      ${sourceLineId ? 'AND i.source_line_id = ?' : ''}
      ${rushSku ? 'AND i.sku = ?' : ''}
      AND i.product_type = 'sku'
      AND i.line_type = 'purchase'
  `, [
    ...(sourceLineId ? [sourceLineId] : []),
    ...(rushSku ? [rushSku] : [])
  ])
    .then(colUtils.outboundNaming)
    .then(rows => rows?.[0])
}

exports.getOrderLineLog = async orderLineStaticId => {
  let rows = await globals.poolRO.query(
    `
		SELECT
			l.type,
			l.from,
			l.to,
			CONVERT_TZ(l.date_created, '+00:00', 'US/Central') as date_created,
			l.user_id,
			l.user_id,
			l.user_type
		FROM order_line_log l
		WHERE l.order_line_static_id = ?
		ORDER BY l.date_created DESC`,
    [orderLineStaticId]
  )

  colUtils.outboundNaming(rows)

  await userUtils.userLookups(rows)
  return rows
}

exports.updateOrderLineTracking = async (conn, orderLineId, carrier, tracking) => {
  let result = await conn.query(
    `UPDATE order_line_items SET tracking_company = ?, tracking_numbers = ? WHERE order_line_item_id = ?`,
    [carrier, tracking, orderLineId]
  )
  return result
}

exports.getOrderLineStatic = async orderLineStaticId => {
  return globals.poolRO
    .query(`SELECT * FROM order_line_static WHERE id = ?`, [orderLineStaticId])
    .then(rows => colUtils.outboundNaming(rows))
    .then(rows => rows?.[0])
}

exports.updateOrderLineStatic = async (conn, orderLineStaticId, data) => {
  const updates = Object.entries(data).map(([key, value]) => ({
    column: snakeCase(key),
    value,
  }))
  if (!updates.length) {
    return
  }

  return (conn || globals.pool).query(
    `
		UPDATE order_line_static
		SET ${updates.map(update => `${update.column} = ?`).join(', ')}
		WHERE id = ?`,
    [...updates.map(update => update.value), orderLineStaticId]
  )
}

exports.createOrderLineChangeLog = async (conn, orderLineStaticId, type, from, to, userId, userType) => {
  return (conn || globals.pool).query(
    `
		INSERT INTO order_line_log (order_line_static_id, type, \`from\`, \`to\`, user_id, user_type)
		VALUES (?, ?, ?, ?, ?, ?)`,
    [orderLineStaticId, type, from, to, userId, userType]
  )
}

exports.getLastIssue = async (conn, orderLineStaticId) => {
  let rows = await (conn || globals.pool).query(
    `
		SELECt * FROM order_line_log WHERE order_line_static_id = ? AND \`type\` = 'STATUS' AND \`to\` = 'Issue' ORDER BY date_created DESC LIMIT 0,1`,
    [orderLineStaticId]
  )
  colUtils.outboundNaming(rows)
  return rows
}

exports.getFulfilledLinesByShipTypeAndStore = async (orderId, sourceLineId, storeId, shipType) => {
  let shipTypeClause = ` AND ((p.ship_type IS NULL) OR (p.ship_type = 'Small Parcel')) `
  if (shipType === 'LTL') {
    shipTypeClause = ` AND (p.ship_type = 'LTL') `
  }
  let sql = `SELECT p.sku, ls.partner_fulfillment_fee, p.ship_type 
								FROM orders o
									LEFT JOIN order_line_items li ON li.order_id = o.order_id
									LEFT JOIN order_line_static ls ON li.source_line_id = ls.source_line_id
									LEFT JOIN products p ON p.sku = li.sku
								WHERE o.order_id = ? 
									AND line_type = 'purchase'
									AND li.source_line_id != ?
									AND p.store_id = ?
									AND partner_fulfillment_fee > 0
									${shipTypeClause}`

  // console.log(mysql.format(sql, [orderId, sourceLineId, storeId]))
  let rows = await globals.poolRO.query(sql, [orderId, sourceLineId, storeId])
  colUtils.outboundNaming(rows)
  return rows
}

exports.ltlCheck = async (orderId, storeId) => {
  let sql = `SELECT ls.sku, ls.partner_fulfillment_fee, p.ship_type 
								FROM orders o
									LEFT JOIN order_line_items li ON li.order_id = o.order_id
									LEFT JOIN order_line_static ls ON li.source_line_id = ls.source_line_id
									LEFT JOIN products p ON p.sku = ls.sku
								WHERE o.order_id = ? 
									AND line_type = 'purchase'
									AND p.store_id = ?
									AND p.ship_type = 'LTL'`

  // console.log(mysql.format(sql, [orderId, storeId]))
  let rows = await globals.poolRO.query(sql, [orderId, storeId])
  colUtils.outboundNaming(rows)
  return rows
}

exports.capturePartnerFulfillmentFee = async (sourceLineId, partnerFulfillmentFee) => {
  let sql = `UPDATE order_line_static set partner_fulfillment_fee = ? WHERE source_line_id = ?`

  let result = await globals.poolRO.query(sql, [partnerFulfillmentFee, sourceLineId])
  return result
}
