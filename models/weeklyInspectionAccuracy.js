'use strict';

const _ = require('lodash');
const mysql = require('promise-mysql');
const globals = require('../globals');
const colUtils = require('../utils/columnUtils');



exports.getErrors = async (startDate) => {
  let sql = `SELECT us2.user_name AS created_by, WEEK(oli.line_item_date_created) + 1 AS week_of_year, COUNT(*) AS \`errors\`
                FROM order_line_items oli
                  LEFT JOIN products p ON p.sku = oli.sku
                  LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
                  LEFT JOIN orders o ON oli.order_id = o.order_id
                  LEFT JOIN return_reason_codes rrc ON oli.return_reason_code_id = rrc.id
                  LEFT JOIN stores s ON o.store_id = s.store_id
                  LEFT JOIN stores s2 ON p.store_id = s2.store_id
                  LEFT JOIN product_pricing_types ppt ON p.pricing_type_id = ppt.pricing_type_id
                  LEFT JOIN category_mappings cm ON p.category_1 = cm.category_1 AND p.category_2 = cm.category_2
                  LEFT JOIN categories c ON cm.category_id = c.category_id
                  LEFT JOIN categories c2 ON c.parent_id = c2.category_id
                  LEFT JOIN shopify_users su ON oli.shopify_user_id = su.shopify_user_id
                  LEFT JOIN coreleap.users us ON oli.shopify_user_id = us.user_id
                  LEFT JOIN coreleap.users us2 ON p.user_id = us2.user_id
                  LEFT JOIN
                      (
                         SELECT MAX(location_log_id) last_id, sku, location_from, location_to
                          FROM product_location_log
                          WHERE user_id != 98
                          GROUP BY sku
                      ) loc ON loc.sku = p.sku
                  LEFT JOIN product_location_log pll ON pll.location_log_id = loc.last_id
                WHERE CONVERT_TZ(oli.line_item_date_created,"+00:00","US/Central") >= '2022-01-01 00:00:00'
                  AND CONVERT_TZ(oli.line_item_date_created,"+00:00","US/Central") >= '${startDate} 00:00:00'
                  AND oli.line_type = 'return'
                  AND oli.product_type IN ('sku','adjustment')
                  AND rrc.id IN (9,10,11,15)
                  AND WEEK(oli.line_item_date_created) + 1 
                  AND us2.user_name IS NOT NULL
                GROUP BY week_of_year, created_by
                ORDER BY created_by, week_of_year`;

  // console.log(mysql.format(sql));

  let rows = await globals.poolRO.query(sql);
  colUtils.outboundNaming(rows);

  return rows;
}



exports.getMissing = async (startDate) => {
  let sql = `SELECT us2.user_name AS created_by, WEEK(oli.line_item_date_created) + 1 AS week_of_year, COUNT(*) AS \`missing\`
                FROM order_line_items oli
                  LEFT JOIN products p ON p.sku = oli.sku
                  LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
                  LEFT JOIN orders o ON oli.order_id = o.order_id
                  LEFT JOIN return_reason_codes rrc ON oli.return_reason_code_id = rrc.id
                  LEFT JOIN stores s ON o.store_id = s.store_id
                  LEFT JOIN stores s2 ON p.store_id = s2.store_id
                  LEFT JOIN product_pricing_types ppt ON p.pricing_type_id = ppt.pricing_type_id
                  LEFT JOIN category_mappings cm ON p.category_1 = cm.category_1 AND p.category_2 = cm.category_2
                  LEFT JOIN categories c ON cm.category_id = c.category_id
                  LEFT JOIN categories c2 ON c.parent_id = c2.category_id
                  LEFT JOIN shopify_users su ON oli.shopify_user_id = su.shopify_user_id
                  LEFT JOIN coreleap.users us ON oli.shopify_user_id = us.user_id
                  LEFT JOIN coreleap.users us2 ON p.user_id = us2.user_id
                  LEFT JOIN
                      (
                         SELECT MAX(location_log_id) last_id, sku, location_from, location_to
                          FROM product_location_log
                          WHERE user_id != 98
                          GROUP BY sku
                      ) loc ON loc.sku = p.sku
                  LEFT JOIN product_location_log pll ON pll.location_log_id = loc.last_id
                WHERE CONVERT_TZ(oli.line_item_date_created,"+00:00","US/Central") >= '2022-01-01 00:00:00'
                  AND CONVERT_TZ(oli.line_item_date_created,"+00:00","US/Central") >= '${startDate} 00:00:00'
                  AND oli.line_type = 'return'
                  AND oli.product_type IN ('sku','adjustment')
                  AND rrc.id IN (11,15)
                  AND WEEK(oli.line_item_date_created) + 1 
                  AND us2.user_name IS NOT NULL
                GROUP BY week_of_year, created_by
                ORDER BY created_by, week_of_year`;

  // console.log(mysql.format(sql));

  let rows = await globals.poolRO.query(sql);
  colUtils.outboundNaming(rows);

  return rows;
}






exports.getOrdered = async (startDate) => {
  let sql = `SELECT us2.user_id, us2.user_name AS created_by, WEEK(oli.line_item_date_created) + 1 AS week_of_year, COUNT(*) AS sales
                FROM order_line_items oli
                    LEFT JOIN products p ON p.sku = oli.sku
                    LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
                    LEFT JOIN orders o ON oli.order_id = o.order_id
                    LEFT JOIN return_reason_codes rrc ON oli.return_reason_code_id = rrc.id
                    LEFT JOIN stores s ON o.store_id = s.store_id
                    LEFT JOIN stores s2 ON p.store_id = s2.store_id
                    LEFT JOIN product_pricing_types ppt ON p.pricing_type_id = ppt.pricing_type_id
                    LEFT JOIN category_mappings cm ON p.category_1 = cm.category_1 AND p.category_2 = cm.category_2
                    LEFT JOIN categories c ON cm.category_id = c.category_id
                    LEFT JOIN categories c2 ON c.parent_id = c2.category_id
                    LEFT JOIN shopify_users su ON oli.shopify_user_id = su.shopify_user_id
                    LEFT JOIN coreleap.users us ON oli.shopify_user_id = us.user_id
                    LEFT JOIN coreleap.users us2 ON p.user_id = us2.user_id
                    LEFT JOIN
                        (
                          SELECT MAX(location_log_id) last_id, sku, location_from, location_to
                            FROM product_location_log
                            WHERE user_id != 98
                            GROUP BY sku
                        ) loc ON loc.sku = p.sku
                    LEFT JOIN product_location_log pll ON pll.location_log_id = loc.last_id
                WHERE CONVERT_TZ(oli.line_item_date_created,"+00:00","US/Central") >= '2022-01-01 00:00:00'
                  AND CONVERT_TZ(oli.line_item_date_created,"+00:00","US/Central") >= '${startDate} 00:00:00'
                  AND oli.line_type = 'purchase'
                  AND oli.product_type = 'sku'
                  AND us2.user_name IS NOT NULL
                GROUP BY created_by, week_of_year
                ORDER BY created_by, week_of_year`;

  // console.log(mysql.format(sql));

  let rows = await globals.poolRO.query(sql);
  colUtils.outboundNaming(rows);

  return rows;
}