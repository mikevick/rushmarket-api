'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');



exports.getByCityIdLabel = async (id, label) => {
	var rows = await globals.pool.query("SELECT * FROM city_email_templates WHERE city_id = ? AND label = ?", [id, label]);
	colUtils.outboundNaming(rows);

	return rows[0];
}


