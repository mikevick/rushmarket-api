'use strict'

const mysql = require('promise-mysql')
const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

exports.getDisposalRuleCount = async (partnerId) => {
	const sql = `SELECT COUNT(*) AS num FROM partner_facility_disposal_fee_rules WHERE partner_id = ?`
	return globals.productROPool.query(sql, [partnerId])
}

exports.getDisposed = async (whereInfo, dateStart, dateEnd, storeIds) => {
  const resp = {
    activity: [],
  }

  let sql = `
SELECT CONVERT_TZ(COALESCE(pal.date_created,p.date_created), '+00:00', 'US/Central') AS date_disposed, 
	p.sku as rush_sku,
	p.store_id,
	p.name as product_name,
	p.online_quick_sale,
	p.seller_product_id,
  p.partner_disposal_cubic_inches AS cubic_inches,
	p.partner_disposal_fee AS disposal_fee,
	m.vendor_id
FROM products p
	LEFT JOIN product_action_log pal ON pal.id = (
		SELECT id
			FROM product_action_log pa
			WHERE ACTION = 'TRASHED' AND sku = p.sku
			ORDER BY id ASC
			LIMIT 1
	)
	LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
	${whereInfo.clause}
		AND pal.action = 'TRASHED'
		AND p.status = 'inactive'
		AND p.condition_name = 'Trash'
		AND p.store_id IN (${storeIds})
		AND partner_disposal_fee > 0
	ORDER BY date_disposed`

  console.log(mysql.format(sql, whereInfo.values))

  resp.activity = await globals.poolRO.query(sql, whereInfo.values)
  colUtils.outboundNaming(resp.activity)

  return resp
}

exports.getProcessed = async (whereInfo, dateStart, dateEnd, storeIds) => {
  const resp = {
    activity: [],
  }

	let sql = `
SELECT CONVERT_TZ(COALESCE(pal.date_created,p.date_created), '+00:00', 'US/Central') AS date_processed,
	p.sku as rush_sku,
	p.store_id,
	p.name as product_name,
	p.online_quick_sale,
	p.seller_product_id,
	p.condition_name,
  p.partner_receipt_inspection_cubic_inches AS cubic_inches,
	p.partner_receipt_inspection_fee AS processing_fee,
	m.vendor_id
FROM products p
	LEFT JOIN product_action_log pal ON pal.id = (
		SELECT id
			FROM product_action_log pa
			WHERE ACTION IN ('BUILD_LOCATE', 'TRASHED') AND sku = p.sku
			ORDER BY id ASC
			LIMIT 1
	)
	LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
	${whereInfo.clause}
		AND pal.action IN ('BUILD_LOCATE', 'TRASHED')
		AND p.store_id IN (${storeIds})
		AND partner_receipt_inspection_fee > 0
	ORDER BY date_processed`

  console.log(mysql.format(sql, whereInfo.values))

  resp.activity = await globals.poolRO.query(sql, whereInfo.values)
  colUtils.outboundNaming(resp.activity)

  return resp
}

exports.getFulfilled = async (whereInfo, dateStart, dateEnd, storeIds) => {
  const resp = {
    activity: [],
  }

  let sql = `
SELECT CONVERT_TZ(oll.date_created, '+00:00', 'US/Central') AS date_fulfilled,
	p.sku AS rush_sku,
	p.store_id,
	p.name AS product_name,
	p.online_quick_sale,
	p.seller_product_id,
	o.source_order_name,
	ols.ship_type,
	ols.partner_fulfillment_fee as fulfillment_fee,
	m.vendor_id
FROM products p
	LEFT JOIN order_line_static ols ON p.sku = ols.sku
	LEFT JOIN order_line_items oli ON oli.source_line_id = ols.source_line_id
	LEFT JOIN orders o ON o.order_id = oli.order_id
	LEFT JOIN order_line_log oll ON ols.id = oll.order_line_static_id
	LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
${whereInfo.clause}
	AND oll.type = 'FULFILLED'
	AND p.store_id IN (${storeIds})
	AND ols.partner_fulfillment_fee > 0
ORDER BY date_fulfilled`;
		
  console.log(mysql.format(sql, whereInfo.values))

  resp.activity = await globals.poolRO.query(sql, whereInfo.values)
  colUtils.outboundNaming(resp.activity)

  return resp
}

exports.getStorage = async  (whereInfo, dateStart, dateEnd, storeIds) => {
  const resp = {
    activity: [],
  }

  //	Get skus that have been purchased and not internal orders.
	let sql = `
SELECT CONVERT_TZ(p.date_created, '+00:00', 'US/Central') AS date_received,
	p.sku AS rush_sku,
	status,
	p.store_id,
	p.online_quick_sale,
	p.seller_product_id,
	p.name AS product_name,
  SUM(s.cubic_feet) AS cubic_feet,
	SUM(s.days_in_storage) AS days_in_storage,
	SUM(s.storage_fee) AS monthly_storage_fee,
	m.vendor_id
FROM products p
	LEFT JOIN partner_storage_fees s ON p.sku = s.sku
	LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
WHERE s.month_beginning >= DATE('${dateStart}') AND s.month_beginning < DATE('${dateEnd}')
	AND p.store_id IN (${storeIds})
	AND s.storage_fee > 0			
GROUP BY p.sku
ORDER BY date_received									
;
`;
	
  console.log(mysql.format(sql, whereInfo.values))

  resp.activity = await globals.poolRO.query(sql, whereInfo.values)
  colUtils.outboundNaming(resp.activity)

  return resp
}

exports.getDisposedTotals = async (dateStart, dateEnd, storeIds) => {
  const resp = {
    totals: [],
  }
	const sql = `
    SELECT
      p.store_id,
      COUNT(p.sku) as total_disposed_items,
      SUM(p.partner_disposal_fee) AS total_disposal_fees
    FROM products p
      LEFT JOIN product_action_log pal ON pal.id = (
        SELECT id
          FROM product_action_log pa
          WHERE ACTION = 'TRASHED' 
            AND sku = p.sku
          ORDER BY id ASC
          LIMIT 1
        )
    WHERE COALESCE(pal.date_created,p.date_created) >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}'  
        AND COALESCE(pal.date_created,p.date_created) < '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
        AND pal.action = 'TRASHED'
        AND p.status = 'inactive'
        AND p.condition_name = 'Trash'
        AND p.store_id IN (${storeIds})
        AND partner_disposal_fee > 0									
    GROUP BY p.store_id`
	
  console.log(mysql.format(sql))

  resp.totals = await globals.poolRO.query(sql)
  colUtils.outboundNaming(resp.totals)

  return resp
}

exports.getProcessedTotals = async (dateStart, dateEnd, storeIds) => {
  const resp = {
    totals: [],
  }
	const sql = `
    SELECT
      p.store_id,
      COUNT(p.sku) as total_processed_items,
      SUM(p.partner_receipt_inspection_fee) AS total_processing_fees
    FROM products p
      LEFT JOIN product_action_log pal ON pal.id = (
        SELECT id
          FROM product_action_log pa
          WHERE ACTION IN ('BUILD_LOCATE', 'TRASHED') 
            AND sku = p.sku
          ORDER BY id ASC
          LIMIT 1
        )
    WHERE
      COALESCE(pal.date_created,p.date_created) >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}'  
      AND COALESCE(pal.date_created,p.date_created) < '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
      AND pal.action IN ('BUILD_LOCATE', 'TRASHED')
      AND p.store_id IN (${storeIds})
      AND partner_receipt_inspection_fee > 0
    GROUP BY p.store_id`

	console.log(mysql.format(sql))

  resp.totals = await globals.poolRO.query(sql)
  colUtils.outboundNaming(resp.totals)

  return resp
}

exports.getFulfilledTotals = async (dateStart, dateEnd, storeIds) => {
  const resp = {
    totals: [],
  }

	const sql = `
    SELECT
      p.store_id,
      COUNT(p.sku) as total_fulfilled_items,
      SUM(ols.partner_fulfillment_fee) as total_fulfillment_fees
    FROM products p
      LEFT JOIN order_line_static ols ON p.sku = ols.sku
      LEFT JOIN order_line_log oll ON ols.id = oll.order_line_static_id
    WHERE oll.date_created >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}'  
      AND oll.date_created < '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
      AND oll.type = 'FULFILLED'
      AND p.store_id IN (${storeIds})
      AND ols.partner_fulfillment_fee > 0
    GROUP BY p.store_id`

  console.log(mysql.format(sql))

  resp.totals = await globals.poolRO.query(sql)
  colUtils.outboundNaming(resp.totals)

  return resp
}

exports.getStorageTotals = async (dateStart, dateEnd, storeIds) => {
  const resp = {
    totals: [],
	}
	
	const sql = `
    SELECT
      p.store_id,
      SUM(s.storage_fee) AS total_storage_fees
    FROM products p
      LEFT JOIN partner_storage_fees s ON p.sku = s.sku
    WHERE s.month_beginning >= DATE('${dateStart}') AND s.month_beginning < DATE('${dateEnd}')
      AND p.store_id IN (${storeIds})
      AND s.storage_fee > 0									
    GROUP BY p.store_id`

  console.log(mysql.format(sql))

  resp.totals = await globals.poolRO.query(sql)
  colUtils.outboundNaming(resp.totals)

  return resp
}

