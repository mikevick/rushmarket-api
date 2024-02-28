'use strict'

const globals = require('../globals')

const colUtils = require('../utils/columnUtils')



exports.create = (status, metroName, cityId, zip, marginEligibilityThreshold, hasPhysicalStoreFlag) => {
  return new Promise((resolve, reject) => {
    var metroId = globals.mongoid.fetch()
    var values = [metroId, status, metroName, cityId, zip, marginEligibilityThreshold, hasPhysicalStoreFlag]

    globals.pool.query(`INSERT INTO metros (id, status, name, city_id, zip, margin_eligibility_threshold, has_physical_store_flag) VALUES (?, ?, ?, ?, ?, ?, ?)`, values)
      .then((results) => {
        resolve(metroId)
      })
      .catch((e) => {
        reject(e)
      })
  })
}



exports.getMetroInfo = async (dbInfo, name) => {
	var metroInfo = null;

	if (name != undefined) {
		metroInfo = await dbInfo.dbPool.query(`SELECT m.id, m.name, m.city_id, m.margin_eligibility_threshold, m.has_physical_store_flag, zip
																							FROM metros m 
																							WHERE m.STATUS = 'ACTIVE'
																										AND m.name = ? `, [name]);
	} else {
		var sql = `SELECT m.id, m.name, m.city_id, m.margin_eligibility_threshold, m.has_physical_store_flag, zip
										FROM metros m 
										WHERE m.STATUS = 'ACTIVE'`;
		metroInfo = await dbInfo.dbPool.query(sql);
	}
	colUtils.outboundNaming(metroInfo);

	return metroInfo;
}




exports.updateById = async (marketId, setInfo) => {
  var resp = {
    rows: []
  }
	setInfo.values.push(marketId)
	// console.log(mysql.format('UPDATE markets ' + setInfo.clause + ', date_modified = NOW() WHERE id = ?', setInfo.values));
  var updateResult = await globals.pool.query('UPDATE metros ' + setInfo.clause + ', date_modified = NOW() WHERE id = ?', setInfo.values)
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query('SELECT * FROM metros WHERE id = ?', [marketId])
    colUtils.outboundNaming(rows)
    resp.rows = rows
  }

  return resp
}



exports.updateCategoryOverride = async (overrideId, setInfo) => {
	setInfo.values.push(overrideId)
	// console.log(mysql.format('UPDATE metro_category_margin_rules ' + setInfo.clause + ', date_modified = NOW() WHERE id = ?', setInfo.values));
	var updateResult = await globals.pool.query('UPDATE metro_category_margin_rules ' + setInfo.clause + ', date_modified = NOW() WHERE id = ?', setInfo.values);
	
	return updateResult;
}





exports.getAll = async (whereInfo, offset, limit) => {
  var resp = {
    totalCount: 0,
    rows: []
  }

  var count = await globals.pool.query('SELECT count(*) as num FROM metros ' + whereInfo.clause, whereInfo.values)
  resp.totalCount = count[0].num
  whereInfo.values.push(offset)
  whereInfo.values.push(limit)
  var rows = await globals.pool.query('SELECT * FROM metros ' + whereInfo.clause + ' ORDER BY name ASC LIMIT ?,?', whereInfo.values)
  colUtils.outboundNaming(rows)
  resp.rows = rows

  return resp
}


exports.getActiveMetroCount = async () => {
  var count = await globals.pool.query(`SELECT COUNT(*) AS num FROM metros WHERE status = 'ACTIVE'`);

  if (count.length) {
    return count[0].num;
  }
  else {
    return 0;
  }
}


exports.getById = (metroId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM metros WHERE id = ?', [metroId])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}



exports.getByName = (name) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM metros WHERE name = ?', [name])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}




exports.getCategoryOverridesByMetroId = (metroId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM metro_category_margin_rules WHERE metro_id = ?', [metroId])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}


exports.getCategoryOverrideById = (id) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM metro_category_margin_rules WHERE id = ?', [id])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}


exports.removeCategoryOverride = (id) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('DELETE FROM metro_category_margin_rules WHERE id = ?', [id])
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}




exports.removeById = (metroId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('DELETE FROM metros WHERE id = ?', [metroId])
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}



exports.createSampleZip = async (metroId, zip, cityName, weight) => {
	var id = globals.mongoid.fetch()
	var values = [id, metroId, zip, cityName, weight]

	await globals.pool.query('INSERT INTO metros_sample_zips (id, metro_id, zip, city_name, weight) VALUES (?, ?, ?, ?, ?)', values);
  return id;
}



exports.getSampleZipById = (id) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM metros_sample_zips WHERE id = ?', [id])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}


exports.getSampleZipByMetroIdAndZip = (metroId, zip) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM metros_sample_zips WHERE metro_id = ? AND zip = ?', [metroId, zip])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}



exports.getSampleZipsByMetroId = async (metroId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM metros_sample_zips WHERE metro_id = ?', [metroId])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}



exports.updateSampleZipById = async (id, setInfo) => {
  var resp = {
    rows: []
  }
  setInfo.values.push(id)
  var updateResult = await globals.pool.query('UPDATE metros_sample_zips ' + setInfo.clause + ', date_modified = NOW() WHERE id = ?', setInfo.values)
  if (updateResult.affectedRows) {
    var rows = await globals.pool.query('SELECT * FROM metros_sample_zips WHERE id = ?', [id])
    colUtils.outboundNaming(rows)
    resp.rows = rows
  }

  return resp
}



exports.getSampleZipById = (id) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM metros_sample_zips WHERE id = ?', [id])
      .then((rows) => {
        colUtils.outboundNaming(rows)
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}



exports.removeSampleZipById = (id) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('DELETE FROM metros_sample_zips WHERE id = ?', [id])
      .then((rows) => {
        resolve(rows)
      })
      .catch((e) => {
        reject(e)
      })
  })
}


exports.createCategoryOverride = (metroId, categoryId, marginEligibilityThreshold, targetMarketingContribution, targetContribution) => {
  return new Promise((resolve, reject) => {
    var id = globals.mongoid.fetch()
    var values = [id, metroId, categoryId, marginEligibilityThreshold]

    globals.pool.query('INSERT INTO metro_category_margin_rules (id, metro_id, category_id, margin_eligibility_threshold) VALUES (?, ?, ?, ?)', values)
      .then((results) => {
        resolve(id)
      })
      .catch((e) => {
        reject(e)
      })
  })
}


exports.getCategoryOverride = (metroId, categoryId) => {
  return new Promise((resolve, reject) => {
    globals.pool.query('SELECT * FROM metro_category_margin_rules where metro_id = ? AND category_id = ?', [metroId, categoryId])
      .then((rows) => {
        colUtils.outboundNaming(rows);
        resolve(rows);
      })
      .catch((e) => {
        reject(e)
      })
  })
}



exports.checkPhysicalStoreByZip = async (zip) => {
  var rows = await globals.pool.query(`SELECT t.id as city_id, m.has_physical_store_flag 
	                        FROM metros m
		                        LEFT JOIN targeted_cities t ON t.id = m.city_id
		                        LEFT JOIN zip_to_city z ON z.city_id = t.id
	                        WHERE z.zip = SUBSTRING(?, 1, 5)`, [zip]);
  colUtils.outboundNaming(rows);
  return rows;
}


exports.getMetroZipAndStoreId = async () => {
  var rows = await globals.poolRO.query(`SELECT m.zip, m.name as city, s.store_id, s.type, s.city_id, s.lat, s.lng, t.large_item_fee, t.shopify_large_item_fee_rate
	                                        FROM metros m 
                                            LEFT JOIN stores s ON m.city_id = s.city_id 
                                            LEFT JOIN targeted_cities t ON m.city_id = t.id
	                                        WHERE s.active = 'Y' AND s.type IN ('PHYSICAL', 'ONLINE')
                                          ORDER BY FIELD(s.type, 'PHYSICAL', 'ONLINE')`);
  colUtils.outboundNaming(rows);
  return rows;
}



exports.getByCityId = async (cityId) => {
  var rows = await globals.poolRO.query(`SELECT * FROM metros WHERE city_id = ?`, [cityId]);
  colUtils.outboundNaming(rows);
  return rows;
}