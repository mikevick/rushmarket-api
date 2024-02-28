'use strict'

const globals = require('../globals')

//  
//  ID may be an email address, rush member id or shopify customer id.  
//
exports.lookupAlias = async (id) => {
  var prom = [];
  prom.push(globals.pool.query("SELECT alias FROM member_aliases a LEFT JOIN members m ON m.id = a.member_id WHERE email = ?", [id]));
  prom.push(globals.pool.query("SELECT alias FROM member_aliases a LEFT JOIN members m ON m.id = a.member_id WHERE m.id = ?", [id]));
  prom.push(globals.pool.query("SELECT alias FROM member_aliases a " +
                                    "LEFT JOIN members m ON m.id = a.member_id " +
                                    "LEFT JOIN members_to_shopify_customers sc ON sc.member_id = m.id " +
                                    "WHERE sc.shopify_customer_id = ?", [id]));

  var results = await Promise.all(prom);

  if (results[0].length > 0) {
    return results[0][0].alias;
  }

  if (results[1].length > 0) {
    return results[1][0].alias;
  }

  if (results[2].length > 0) {
    return results[2][0].alias;
  }

  return undefined;
}

