"use strict";

const globals = require("../globals");
const mysql = require('promise-mysql')

const colUtils = require("../utils/columnUtils");

exports.create = (
  name,
  address,
  city,
  state,
  zip,
  onlineAvailable,
  shopifyLocationId,
  type,
  timezone,
  lat,
  lng,
  description
) => {
  return new Promise((resolve, reject) => {
    var values = [
      name,
      address,
      city,
      state,
      zip,
      onlineAvailable,
      shopifyLocationId,
      type,
      timezone,
      lat,
      lng,
      description,
    ];
    globals.pool
      .query(
        "INSERT INTO stores (store_name, address, city, state, zip, online_available, shopify_location_id, type, timezone, lat, lng, description) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        values
      )
      .then((results) => {
        resolve(results.insertId);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.delById = (id) => {
  return new Promise((resolve, reject) => {
    globals.pool
      .query("DELETE FROM app_versions WHERE id = ?", [id])
      .then((rows) => {
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getById = (id) => {
  return new Promise((resolve, reject) => {
    // console.log(mysql.format("SELECT s.*, ss.primary_store_id FROM stores s LEFT JOIN shopify_stores ss ON ss.id = s.shopify_store_id WHERE store_id = ?", [id]));
    globals.pool
      .query(
        "SELECT s.*, ss.primary_store_id FROM stores s LEFT JOIN shopify_stores ss ON ss.id = s.shopify_store_id WHERE store_id = ?",
        [id]
      )
      .then((rows) => {
        var stores = [];
        for (var i = 0; i < rows.length; i++) {
          stores.push({
            id: rows[i].store_id,
            name: rows[i].store_name,
            address: {
              address1: rows[i].address,
              city: rows[i].city,
              state: rows[i].state,
              zip: rows[i].zip,
            },
            location: {
              lat: rows[i].lat,
              lng: rows[i].lng,
            },
            cityId: rows[i].city_id,
            onlineAvailable: rows[i].online_available,
            curbsideAvailable: rows[i].curbside_available,
            inStoreSignup: rows[i].in_store_signup,
            inStoreToken: rows[i].in_store_token,
            onlinePickupSlackUrl: rows[i].online_pickup_slack_url,
            onlineHoldSlackUrl: rows[i].online_hold_slack_url,
            memberDisplayName: rows[i].member_display_name,
            shopifyLocationId: rows[i].shopify_location_id,
            shopifyStoreId: rows[i].shopify_store_id,
            primaryStoreId: rows[i].primary_store_id,
            partnerFacility: rows[i].partner_facility,
            type: rows[i].type,
            timezone: rows[i].timezone,
            description: rows[i].description,
            autoOnlineSkus: rows[i].auto_online_skus,
            isProductLocation: rows[i].is_product_location,
            abbreviation: rows[i].abbreviation,
          });
        }
        resolve(stores);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getActiveByCity = (city) => {
  return new Promise((resolve, reject) => {
    globals.pool
      .query(
        "SELECT s.*, ss.primary_store_id FROM stores s LEFT JOIN shopify_stores ss ON ss.id = s.shopify_store_id WHERE type = 'PHYSICAL' AND active = 'Y' AND city = ?",
        [city]
      )
      .then((rows) => {
        var stores = [];
        for (var i = 0; i < rows.length; i++) {
          stores.push({
            id: rows[i].store_id,
            name: rows[i].store_name,
            address: {
              address1: rows[i].address,
              city: rows[i].city,
              state: rows[i].state,
              zip: rows[i].zip,
            },
            location: {
              lat: rows[i].lat,
              lng: rows[i].lng,
            },
            onlineAvailable: rows[i].online_available,
            curbsideAvailable: rows[i].curbside_available,
            inStoreSignup: rows[i].in_store_signup,
            inStoreToken: rows[i].in_store_token,
            onlinePickupSlackUrl: rows[i].online_pickup_slack_url,
            onlineHoldSlackUrl: rows[i].online_hold_slack_url,
            memberDisplayName: rows[i].member_display_name,
            shopifyLocationId: rows[i].shopify_location_id,
            shopifyStoreId: rows[i].shopify_store_id,
            primaryStoreId: rows[i].primary_store_id,
            partnerFacility: rows[i].partner_facility,
            type: rows[i].type,
            timezone: rows[i].timezone,
            description: rows[i].description,
            autoOnlineSkus: rows[i].auto_online_skus,
            isProductLocation: rows[i].is_product_location,
          });
        }
        resolve(stores);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getByName = (name) => {
  return new Promise((resolve, reject) => {
    globals.pool
      .query(
        "SELECT s.*, ss.primary_store_id FROM stores s LEFT JOIN shopify_stores ss ON ss.id = s.shopify_store_id WHERE store_name = ?",
        [name]
      )
      .then((rows) => {
        var stores = [];
        for (var i = 0; i < rows.length; i++) {
          stores.push({
            id: rows[i].store_id,
            name: rows[i].store_name,
            address: {
              address1: rows[i].address,
              city: rows[i].city,
              state: rows[i].state,
              zip: rows[i].zip,
            },
            location: {
              lat: rows[i].lat,
              lng: rows[i].lng,
            },
            onlineAvailable: rows[i].online_available,
            curbsideAvailable: rows[i].curbside_available,
            inStoreSignup: rows[i].in_store_signup,
            inStoreToken: rows[i].in_store_token,
            onlinePickupSlackUrl: rows[i].online_pickup_slack_url,
            onlineHoldSlackUrl: rows[i].online_hold_slack_url,
            memberDisplayName: rows[i].member_display_name,
            shopifyLocationId: rows[i].shopify_location_id,
            shopifyStoreId: rows[i].shopify_store_id,
            primaryStoreId: rows[i].primary_store_id,
            partnerFacility: rows[i].partner_facility,
            type: rows[i].type,
            timezone: rows[i].timezone,
            description: rows[i].description,
            autoOnlineSkus: rows[i].auto_online_skus,
            isProductLocation: rows[i].is_product_location,
            abbreviation: rows[i].abbreviation,
          });
        }
        resolve(stores);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getAll = (whereInfo, sortBy, offset, limit) => {
  return new Promise((resolve, reject) => {
    whereInfo.values.push(offset);
    whereInfo.values.push(limit);
    globals.pool
      .query(
        "SELECT s.*, ss.primary_store_id FROM stores s LEFT JOIN shopify_stores ss ON ss.id = s.shopify_store_id " +
          whereInfo.clause +
          " ORDER BY " +
          sortBy +
          " LIMIT ?, ?",
        whereInfo.values
      )
      .then((rows) => {
        var stores = [];
        for (var i = 0; i < rows.length; i++) {
          stores.push({
            id: rows[i].store_id,
            name: rows[i].store_name,
            address: {
              address1: rows[i].address,
              city: rows[i].city,
              state: rows[i].state,
              zip: rows[i].zip,
            },
            location: {
              lat: rows[i].lat,
              lng: rows[i].lng,
            },
            cityId: rows[i].city_id,
            onlineAvailable: rows[i].online_available,
            curbsideAvailable: rows[i].curbside_available,
            inStoreSignup: rows[i].in_store_signup,
            inStoreToken: rows[i].in_store_token,
            onlinePickupSlackUrl: rows[i].online_pickup_slack_url,
            onlineHoldSlackUrl: rows[i].online_hold_slack_url,
            memberDisplayName: rows[i].member_display_name,
            shopifyLocationId: rows[i].shopify_location_id,
            shopifyStoreId: rows[i].shopify_store_id,
            primaryStoreId: rows[i].primary_store_id,
            partnerFacility: rows[i].partner_facility,
            type: rows[i].type,
            timezone: rows[i].timezone,
            description: rows[i].description,
            autoOnlineSkus: rows[i].auto_online_skus,
            isProductLocation: rows[i].is_product_location,
            abbreviation: rows[i].abbreviation,
          });
        }
        resolve(stores);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getTargetCity = (city) => {
  return new Promise((resolve, reject) => {
    globals.pool
      .query("SELECT * FROM targeted_cities WHERE city_slug = ?", [city])
      .then((rows) => {
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getAllActiveStores = () => {
  return new Promise((resolve, reject) => {
    globals.pool
      .query(
        "SELECT * FROM stores WHERE active = 'Y' AND TYPE IN ('PHYSICAL', 'ONLINE')"
      )
      .then((rows) => {
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getDistinctStores = () => {
  return new Promise((resolve, reject) => {
    let storeQuery = `SELECT m.id, m.home_shopify_store_id, m.home_city_id, t.city_slug 
                  FROM members m 
                  LEFT JOIN targeted_cities t ON m.home_city_id = t.id 
                  WHERE home_shopify_store_id != 999 
                        AND STATUS = 'ACTIVE' 
                  GROUP BY home_shopify_store_id, home_city_id`;
    globals.pool
      .query(storeQuery)
      .then((rows) => {
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getStoreIdAndHubStoreId = (storeId) => {
  return new Promise((resolve, reject) => {
    globals.pool
      .query(
        "SELECT s.store_id, s.city_id, ss.primary_store_id AS hub_store_id " +
          "FROM stores s " +
          "LEFT JOIN shopify_stores ss ON ss.id = s.shopify_store_id " +
          "WHERE s.store_id = ? AND s.active = 'Y' AND s.type IN ('PHYSICAL', 'ONLINE')",
        [storeId]
      )
      .then((rows) => {
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getMarketInfoBySlug = (slug) => {
  return new Promise((resolve, reject) => {
    globals.pool
      .query(
        "SELECT s.store_id, s.shopify_store_id as home_shopify_store_id, s.type as member_store_type, s.zip as member_store_zip, " +
          "s.store_id as member_store_id, s.member_display_name as member_store_name, t.id as home_city_id, t.city as member_City " +
          "FROM stores s " +
          "LEFT JOIN targeted_cities t ON t.id = s.city_id " +
          "WHERE s.type IN ('PHYSICAL', 'ONLINE') AND city_slug = ?",
        [slug]
      )
      .then((rows) => {
        colUtils.outboundNaming(rows);
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getMarketInfoByZip = async (zip) => {
  let rows = await globals.pool.query(`SELECT s.store_id, s.shopify_store_id AS home_shopify_store_id, s.type AS member_store_type, s.zip as member_store_zip, 
                                              s.store_id as member_store_id, s.member_display_name AS member_store_name, t.id AS home_city_id, t.city as member_City 
                                            FROM stores s 
                                              LEFT JOIN targeted_cities t ON t.id = s.city_id 
                                              LEFT JOIN zip_to_city z ON z.city_id = t.id 
                                            WHERE s.type IN ('PHYSICAL', 'ONLINE') AND z.zip = SUBSTRING(?, 1, 5)`, [zip]);

  colUtils.outboundNaming(rows);
  return rows;
};

exports.getActivePhysicalStores = () => {
  return new Promise((resolve, reject) => {
    globals.pool
      .query(
        "SELECT s.store_id, s.member_display_name, s.timezone, t.id as home_city_id, t.delivery_cutoff_cst, t.pickup_cutoff_cst " +
          "FROM stores s " +
          "LEFT JOIN targeted_cities t ON t.id = s.city_id " +
          "WHERE s.type IN ('PHYSICAL', 'ONLINE') AND s.active = 'Y'"
      )
      .then((rows) => {
        colUtils.outboundNaming(rows);
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getActivePhysicalOnlyStores = () => {
  return new Promise((resolve, reject) => {
    globals.pool
      .query(
        `SELECT s.store_id, s.city, s.partner_facility, s.member_display_name, s.timezone, s.linked_dma_store_id,
														t.id as home_city_id, t.delivery_cutoff_cst, t.pickup_cutoff_cst 
													FROM stores s 
															LEFT JOIN targeted_cities t ON t.id = s.city_id 
													WHERE s.type IN ('PHYSICAL') AND s.active = 'Y' AND reporting_group != 'Test'`
      )
      .then((rows) => {
        colUtils.outboundNaming(rows);
        resolve(rows);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

exports.getActiveRRCs = () => {
  return globals.pool
    .query(
      `
			SELECT store_id, lat, lng
			FROM stores
			WHERE
			  type = 'PHYSICAL'
			  AND active = 'Y'
			  AND eligible_for_routing = 'Y'`
    )
    .then((rows) => colUtils.outboundNaming(rows));
};

exports.getActiveOwnedRRCs = () => {
  return globals.pool
    .query(
      `
			SELECT store_id, lat, lng
			FROM stores
			WHERE
			  type = 'PHYSICAL'
			  AND active = 'Y'
			  AND eligible_for_routing = 'Y'
			  AND partner_facility = 'N'`
    )
    .then((rows) => colUtils.outboundNaming(rows));
};

exports.updateById = async (
  storeId,
  memberDisplayName,
  type,
  onlineAvailable,
  curbsideAvailable
) => {
  var results = null;
  var sets = "";
  var values = [];

  if (memberDisplayName != undefined) {
    sets += "member_display_name = ?";
    values.push(memberDisplayName);
  }

  if (type != undefined) {
    if (sets.length > 0) {
      sets += ", ";
    }
    sets += "type = ?";
    values.push(type);
  }

  if (onlineAvailable != undefined) {
    if (sets.length > 0) {
      sets += ", ";
    }
    sets += "online_available = ?";
    values.push(onlineAvailable);
  }

  if (curbsideAvailable != undefined) {
    if (sets.length > 0) {
      sets += ", ";
    }
    sets += "curbside_available = ?";
    values.push(curbsideAvailable);
  }

  if (sets.length > 0) {
    values.push(storeId);
    results = await globals.pool.query(
      "UPDATE stores SET " + sets + " WHERE store_id = ?",
      values
    );
  }

  return results;
};
