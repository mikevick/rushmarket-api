'use strict';

const _ = require('lodash');
const globals = require('../globals');
const {
  promisify
} = require('util');
const sleep = promisify(setTimeout);

const colUtils = require('../utils/columnUtils');
const algoliasearch = require('algoliasearch');
const client = algoliasearch(process.env.ALGOLIA_APP_ID, process.env.ALGOLIA_WRITE_API_KEY);
const index = client.initIndex(process.env.ALGOLIA_GLOBAL_INDEX);
const indexClone = process.env.ALGOLIA_GLOBAL_INDEX_CLONE ? client.initIndex(process.env.ALGOLIA_GLOBAL_INDEX_CLONE) : null;

//create new managed search product result
exports.createSearchProduct = (sku, categorySlug, productSearchInfo, status) => {
  return new Promise((resolve, reject) => {
    let sql = `INSERT INTO product_search_management 
              (sku, category_slug, product_data, status) 
              values (?,?,?,?)`;
    let values = [sku, categorySlug, productSearchInfo, status];
    globals.pool.query(sql, values)
      .then((results) => {
        resolve(results);
      })
      .catch((e) => {
        reject(e);
      })
  })
}

//update existing managed product result
exports.updateSearchProduct = (id, sku, categorySlug, productSearchInfo, status) => {
  return new Promise((resolve, reject) => {
    let sql = `UPDATE product_search_management SET sku = ?, category_slug = ?, product_data = ?, status = ? WHERE id = ?`;
    let values = [sku, categorySlug, productSearchInfo, status, id];
    globals.pool.query(sql, values)
      .then((results) => {
        // console.log(`ID: ${id}, STATUS: ${status}`);
        resolve(results);
      })
      .catch((e) => {
        reject(e);
      })
  })
}

exports.updateStatusSearchProduct = (id, status) => {
  return new Promise((resolve, reject) => {
    let sql = `UPDATE product_search_management SET  status = ? WHERE id = ?`;
    let values = [status, id];
    globals.pool.query(sql, values)
      .then((results) => {
        // console.log(`ID: ${id}, STATUS: ${status}`);
        resolve(results);
      })
      .catch((e) => {
        console.log("Status update exception " + e);

        reject(e);
      })
  })
}

//update existing managed product result
exports.removeSearchProduct = (sku) => {
  return new Promise((resolve, reject) => {
    let sql = `DELETE FROM product_search_management 
              WHERE sku = ?`;
    let values = [sku];
    globals.pool.query(sql, values)
      .then((results) => {
        resolve(results);
      })
      .catch((e) => {
        reject(e);
      })
  })
}

//update existing managed product result
exports.removeSearchProductById = (id) => {
  return new Promise((resolve, reject) => {
    let sql = `DELETE FROM product_search_management 
              WHERE id = ?`;
    let values = [id];
    globals.pool.query(sql, values)
      .then((results) => {
        resolve(results);
      })
      .catch((e) => {
        reject(e);
      })
  })
}

exports.getAllSearchProducts = async (whereInfo, sortBy, offset, limit) => {
  let prom = [];
  let data = {
    totalCount: 0,
    rows: []
  };
  let sqlCount = `SELECT count(*) as num 
    FROM product_search_management 
    ${whereInfo.clause} `;

  prom.push(globals.poolRO.query(sqlCount, whereInfo.values));

  let sql = `SELECT * 
    FROM product_search_management 
    ${whereInfo.clause} 
    ORDER BY ${sortBy} 
    LIMIT ?,?`;
  whereInfo.values.push(offset);
  whereInfo.values.push(limit);

  prom.push(globals.poolRO.query(sql, whereInfo.values));

  let results = await Promise.all(prom);
  data.totalCount = results[0][0].num;
  data.rows = results[1];
  return data;
}


exports.getEligibleCities = async (coinId) => {
  var eligibleCities = [];

  var vskus = null;

  while (1) {
    try {
      vskus = await globals.poolRO.query(`SELECT vendor_id, vendor_sku
																							FROM coins_to_vskus 
																							WHERE coin_id = ?`, [coinId]);
    } catch (e) {
      if (e.message.startsWith('ER_NO_SUCH_TABLE')) {
        await sleep(250);
      } else {
        throw e;
      }
    }


    if (vskus !== null) {
      break;
    }
  }

  for (var i = 0; i < vskus.length; i++) {
    // console.log(mysql.format(`SELECT DISTINCT(dest_city_id) AS id
    // FROM metro_sku_eligibility
    // WHERE COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
    //   AND sku IN (
    //     SELECT sku
    //       FROM products p 
    //         LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
    //       WHERE m.vendor_id = ?
    //         AND p.seller_product_id = ?
    //         AND p.status = 'Live'
    //         AND p.online_shopping = 'Y'
    //       ORDER BY p.store_id, sku)`, [vskus[i].vendor_id, vskus[i].vendor_sku]))
    var cities = await globals.poolRO.query(`SELECT DISTINCT(dest_city_id) AS id
																								FROM metro_sku_eligibility
																								WHERE COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
																									AND sku IN (
																										SELECT sku
																											FROM products p 
																												LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
																											WHERE m.vendor_id = ?
																												AND p.seller_product_id = ?
																												AND p.status = 'Live'
																												AND p.online_shopping = 'Y'
																											ORDER BY p.store_id, sku)`, [vskus[i].vendor_id, vskus[i].vendor_sku]);
    for (var j = 0; j < cities.length; j++) {
      eligibleCities.push(cities[j].id);
    }
  }

  return _.uniq(eligibleCities);
}


exports.getEligibleCitiesBySku = async (sku) => {
  var eligibleCities = [];

  var cities = await globals.poolRO.query(`SELECT DISTINCT(dest_city_id) AS id
																								FROM metro_sku_eligibility
																								WHERE COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
																									AND sku = ?`, [sku]);
  for (var j = 0; j < cities.length; j++) {
    eligibleCities.push(cities[j].id);
  }

  return _.uniq(eligibleCities);
}



exports.bopisOnlyCheckByCoin = async (coinId) => {
  var result = false;
  var eligibilities = null;

  while (1) {
    try {
      eligibilities = await globals.poolRO.query(`SELECT p.sku, COALESCE(eligibility_override, eligibility) AS effective_eligibility, COUNT(*) AS num
	                                    FROM products p
		                                        LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
		                                        LEFT JOIN metro_sku_eligibility mse ON p.sku = mse.sku
	                                    WHERE STATUS = 'Live' 
		                                    AND online_shopping = 'Y' 
		                                    AND CONCAT(m.vendor_id, p.seller_product_id) IN
		                                      (SELECT CONCAT(vendor_id, vendor_sku)
			                                        FROM coins_to_vskus
			                                        WHERE coin_id = ?)
	                                            GROUP BY effective_eligibility`, [coinId]);
    } catch (e) {
      if (e.message.startsWith('ER_NO_SUCH_TABLE')) {
        await sleep(250);
      } else {
        throw e;
      }
    }

    if (eligibilities !== null) {
      break;
    }
  }



  if ((eligibilities.length === 2) && ((eligibilities[0].effective_eligibility === 'BOPIS_ONLY') || (eligibilities[1].effective_eligibility === 'BOPIS_ONLY'))) {
    result = true;
  }

  return result;
}


exports.bopisOnlyCheckBySku = async (sku) => {
  var result = false;
  var eligibilities = await globals.poolRO.query(`SELECT p.sku, COALESCE(eligibility_override, eligibility) AS effective_eligibility, COUNT(*) AS num
                                      FROM products p
                                          LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
                                          LEFT JOIN metro_sku_eligibility mse ON p.sku = mse.sku
                                      WHERE STATUS = 'Live' 
                                          AND online_shopping = 'Y' 
                                          AND p.sku = ?
                                      GROUP BY effective_eligibility`, [sku]);

  if ((eligibilities.length === 2) && ((eligibilities[0].effective_eligibility === 'BOPIS_ONLY') || (eligibilities[1].effective_eligibility === 'BOPIS_ONLY'))) {
    result = true;
  }

  return result;
}




//Algolia Indexing Methods:
//save array of objects:
exports.addNewProductsToAlgoliaIndex = async (productListJson) => {
  var data = await index.saveObjects(productListJson);
  if (indexClone !== null) {
    await indexClone.saveObjects(productListJson);
  }
  return data;
}

//save one object:
exports.addNewProductToAlgoliaIndex = async (productJson) => {
  var data = await index.saveObject(productJson);
  if (indexClone !== null) {
    await indexClone.saveObject(productJson);
  }
}

//partial update array of objects
exports.updateProductsToAlgolia = async (updateProductListJson) => {
  var objectIDs = await index.partialUpdateObjects(updateProductListJson);
  if (indexClone !== null) {
    await indexClone.partialUpdateObjects(updateProductListJson);
  }
}

//partial update one object
exports.updateProductToAlgolia = async (updateProductJson) => {
  var objectID = await index.partialUpdateObject(updateProductJson);
  if (indexClone !== null) {
    await indexClone.partialUpdateObject(updateProductJson);
  }
}

//delete objects
exports.deleteProductsFromAlgolia = async (deleteProductIdList) => {
  var objectIDs = await index.deleteObjects(deleteProductIdList);
  if (indexClone !== null) {
    await indexClone.deleteObjects(deleteProductIdList);
  }
}

//delete one
// sig: index.deleteObject(string objectID)
// ex: index.deleteObject('myID').then(() => {
//  done
// });
exports.deleteProductFromAlgolia = async (deleteProductId) => {
  await index.deleteObject(deleteProductId);
  if (indexClone !== null) {
    await indexClone.deleteObject(deleteProductId);
  }
}

//clear objects
// sig: index.clearObjects()
// ex: index.clearObjects().then(() => {
//   done
//});
exports.clearIndexFromAngolia = async () => {
  await index.clearObjects();
  if (indexClone !== null) {
    await indexClone.clearObjects();
  }
}

//get objects
// sig: index.getObjects(array objectIDs)
// ex: index.getObjects(['myId1', 'myId2']).then(({ results }) => {
//   console.log(results);
// });
exports.getProductsFromAlgolia = async (productIdList) => {
  var results = await index.getObjects(productIdList);
  if (indexClone !== null) {
    await indexClone.getObjects(productIdList);
  }
}

// sig: index.getObject(str objectID)
// ex: index.getObject('myId').then(object => {
//     console.log(object);
//   });
exports.getProductFromAlgolia = async (productId) => {
  var product = await index.getObject(productId);
  if (indexClone !== null) {
    await indexClone.getObject(productId);
  }
}


exports.metroEligibilityCheck = async (metro, skus) => {
  // console.log(`SELECT p.sku, p.price, p.store_id, p.condition_name, COALESCE(eligibility_override, eligibility) AS effective_eligibility
  // FROM metro_sku_eligibility e LEFT JOIN products p ON e.sku = p.sku
  // 	WHERE e.sku IN (${skus}) 
  // 		AND dest_postal_code = ${metro.zip}
  // 		AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
  // 	ORDER BY ${metro.orderBy} p.price ASC`)
  var rows = await globals.poolRO.query(`SELECT p.sku, p.price, p.store_id, p.condition_name, p.dropship_type, p.limited_quantity, 
                                        e.ship_type, COALESCE(eligibility_override, eligibility) AS effective_eligibility
																FROM metro_sku_eligibility e LEFT JOIN products p ON e.sku = p.sku
																	WHERE e.sku IN (${skus}) 
																		AND dest_postal_code = ${metro.zip}
																		AND COALESCE(eligibility_override, eligibility) != 'NOT_ELIGIBLE'
																	ORDER BY ${metro.orderBy} p.price ASC`);
  colUtils.outboundNaming(rows);

  return rows;
}