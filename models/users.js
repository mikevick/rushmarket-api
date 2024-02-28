"use strict";

const globals = require("../globals");
const colUtils = require("../utils/columnUtils");

exports.getAll = async (whereInfo, sortBy, offset, limit) => {
  let prom = [];
  let resp = {
    totalCount: 0,
    rows: [],
  };
  let countSql = ` SELECT count(*) AS num 
    FROM users u 
    LEFT JOIN shopify_users su on su.shopify_user_id = u.shopify_user_id 
    ${whereInfo.clause} `;
  prom.push(globals.poolRO.query(countSql, whereInfo.values));
  let sql = ` SELECT u.user_id, u.email, u.password, u.user_name,
    CONVERT_TZ(u.date_created, '+00:00', '${process.env.utcOffset}') AS date_created,
    CONVERT_TZ(u.date_deleted, '+00:00', '${process.env.utcOffset}') AS date_deleted,
    u.deleted, u.change_password_required, u.shopify_user_id,
    su.first_name as shopify_first_name, su.last_name as shopify_last_name,
    su.email as shopify_email, su.permissions, su.active, su.user_type 
    FROM users u 
    LEFT JOIN shopify_users su on su.shopify_user_id = u.shopify_user_id 
    ${whereInfo.clause} `;
  if (sortBy) {
    sql += ` ORDER BY ${sortBy} `;
  }
  if (offset != undefined) {
    whereInfo.values.push(offset);
    whereInfo.values.push(limit);
    sql += ` LIMIT ?,? `;
  }
  prom.push(globals.poolRO.query(sql, whereInfo.values));
  let results = await Promise.all(prom);
  resp.totalCount = results[0][0].num;
  resp.rows = colUtils.outboundNaming(results[1]);

  return resp;
};

exports.getUserAndStoreByIds = async (ids) => {
  const idString = ids.join(", ");
  const query = `SELECT user_id, user_name, s.store_name AS default_store
	FROM users u
	LEFT JOIN stores s ON u.default_store_id = s.store_id
	WHERE user_id IN (${idString}) AND date_deleted IS NULL`;

  const queryResults = await globals.poolRO.query(query);
  const users = colUtils.outboundNaming(queryResults);
  return users
};

exports.getById = (id) => {
  return new Promise((resolve, reject) => {
    var sql = "SELECT * FROM users WHERE user_id = ?";

    globals.pool
      .query(sql, [id])
      .then((rows) => {
        colUtils.outboundNaming(rows);
        rows.forEach((row) => {
          row.internal = true;
        });
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getByEmail = (email) => {
  return new Promise((resolve, reject) => {
    globals.pool
      .query("SELECT * FROM users WHERE email = ? AND deleted = 0", [email])
      .then((rows) => {
        colUtils.outboundNaming(rows);
        rows.forEach((row) => {
          row.internal = true;
        });
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      });
  });
};
