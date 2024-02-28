'use strict'; 

const globals = require('../globals');
const mysql = require('promise-mysql')

const columnUtils = require('../utils/columnUtils');



exports.addMapping = async (zip, cityId, type, region, population) => {
	return globals.pool.query(`INSERT IGNORE INTO zip_to_city (zip, city_id, type, region, population) VALUES (?, ?, ?, ?, ?)`, [zip, cityId, type, region, population]);
}


exports.checkMappingOtherCity = async (cityId, zip) => {
	var sql = "SELECT * FROM zip_to_city WHERE city_id != ? AND zip = ?";

	var result = await globals.pool.query(sql, [cityId, zip]);
	return result;
}



exports.deleteMapping = async (cityId, zip) => {
	var sql = "DELETE FROM zip_to_city WHERE city_id = ? AND zip = ?";

	var result = await globals.pool.query(sql, [cityId, zip]);
	return result;
}



exports.getAll = async (whereInfo, sortBy) => {
	var sql = "SELECT z.id, z.zip, z.type, city_id, city FROM zip_to_city z " + 
										"LEFT JOIN targeted_cities t ON t.id = z.city_id " +
										whereInfo.clause;

	if (sortBy !== undefined) {
		sql += " ORDER BY " + sortBy;
	}
									

	// console.log(mysql.format(sql, whereInfo.values));
	var rows = await globals.poolRO.query(sql, whereInfo.values);
	columnUtils.outboundNaming(rows);
	return rows;
}



exports.streamAll = async (callback) => {
	let conn;
	return globals.poolRO.getConnection()
		.then(connection => {
			conn = connection;

			const query = connection.queryStream(`
				SELECT city_id, zip, lat, lng, nearest_rrc_store_id, nearest_owned_rrc_store_id, next_nearest_metro
				FROM zip_to_city`);
			const pause = connection.pause.bind(connection);
			const resume = connection.resume.bind(connection);

			return new Promise(resolve => {
				query
					.on('error', e => {
						throw e;
					})
					.on('result', zipToCity => {
						pause();
						callback(zipToCity).then(resume);
					})
					.on('end', () => {
						resolve();
					});
			});
		})
		.catch(e => {
			console.log(e.message);
			throw e;
		})
		.finally(() => {
			globals.poolRO.releaseConnection(conn);
		});
}



exports.getByZipCode = async (zip) => {
	console.log(mysql.format("SELECT * FROM zip_to_city WHERE zip = ?", [zip]))
	const rows = await globals.poolRO.query("SELECT * FROM zip_to_city WHERE zip = ?", [zip]);
	columnUtils.outboundNaming(rows);
	return rows && rows.length ? rows[0] : undefined;
}



exports.lookupCity = (zip) => {
	return new Promise((resolve, reject) => {
		if (typeof zip !== 'string') {
			zip = new String(zip).toString();
		}
		if ((zip === undefined) || (zip === null)) {
			zip = '';
		}
		var dash = zip.indexOf('-');
		if (dash > 0) {
			zip = zip.substring(0, dash);
		}
		globals.pool.query("SELECT city_id, city, city_slug, type FROM zip_to_city z " + 
													"LEFT JOIN targeted_cities t ON t.id = z.city_id " +
													"WHERE zip = ?", [zip])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.updateType = async (type, zip) => {
	var sql = "UPDATE zip_to_city SET type = ? WHERE zip = ?";

	var result = await globals.pool.query(sql, [type, zip]);
	return result;
}



exports.updateLocation = async (zip, lat, lng) => {
	return globals.pool.query(`UPDATE zip_to_city SET lat = ?, lng = ? WHERE zip = ?`, [lat, lng, zip]);
}



exports.updateNearestRrcStores = async (zip, nearestRrcStoreId, nearestOwnedRrcStoreId, nextNearestMetro) => {
	return globals.pool.query(`
		UPDATE zip_to_city
		SET nearest_rrc_store_id = ?, nearest_owned_rrc_store_id = ?, next_nearest_metro = ?
		WHERE zip = ?`, [nearestRrcStoreId, nearestOwnedRrcStoreId, nextNearestMetro, zip]);
}




exports.updateMapping = async (zip, cityId, type, region, population) => {
	return globals.pool.query(`UPDATE zip_to_city SET date_modified = NOW(), city_id = ?, type = ?, region = ?, population = ? WHERE zip = ?`, [cityId, type, region, population, zip]);
}




exports.lookupZipsByCityId = async (cityId) => {
	var sql = `SELECT zip FROM zip_to_city WHERE city_id = ? ORDER BY zip`;

	var results = await globals.poolRO.query(sql, [cityId]);
	return results;
}


exports.getRegionAbbreviation = async (zip) => {
	let info = {
		abbrev: undefined,
		name: undefined
	}

	let sql = `SELECT zip, LEFT(REPLACE(region, '-', ''),LOCATE(' ',REPLACE(region, '-', '')) - 1) AS abbrev, region
								FROM zip_to_city
								WHERE zip = ?`;

	let results = await globals.poolRO.query(sql, [zip]);

	if (results.length) {
		info.abbrev = results[0].abbrev;
		info.name = results[0].region;
	}
	return info;
}

