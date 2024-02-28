'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');



exports.getSchedule = async (cityId) => {
	var rows = await globals.poolRO.query("SELECT c.*, s.store_name " +
																							"FROM spoke_delivery_schedule c " +
																									"LEFT JOIN stores s ON c.city_id = s.store_id " +
																									"WHERE c.STATUS = 'ACTIVE' AND c.city_id = ? ORDER BY load_day", [cityId]);
	colUtils.outboundNaming(rows);
	return rows;
}