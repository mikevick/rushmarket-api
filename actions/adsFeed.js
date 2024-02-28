'use strict'

const Metros = require('../models/metros');
const ZipToCity = require('../models/zipToCity');

const sqlUtils = require('../utils/sqlUtils');

const {
	formatResp
} = require('../utils/response');


var getAll = async (req, resp) => {
	var whereInfo = {
		clause: '',
		values: []
	};


	whereInfo = sqlUtils.appendWhere(whereInfo, `status = 'ACTIVE'`);

	var metros = await Metros.getAll(whereInfo, 0, 10000);

	if (metros.rows.length > 0) {
		for (var i=0; i < metros.rows.length; i++) {
			resp.data.regions.push(await generateRegion(metros.rows[i]));
		}
	}
	else {
		formatResp(resp,  ["data"], 404, 'Regions not found.');
	}
}


var getById = async (req, resp) => {
	var whereInfo = {
		clause: '',
		values: []
	};

	var zip = req.params.id.substring(2, 7);

	whereInfo = sqlUtils.appendWhere(whereInfo, `zip = ${zip}`);

	var metros = await Metros.getAll(whereInfo, 0, 1);

	if (metros.rows.length > 0) {
		resp.data.regions.push(await generateRegion(metros.rows[0]));
	}
	else {
		formatResp(resp, ["data"], 404, 'Region not found.');
	}
}



var generateRegion = async (metro) => {
	var zips = await ZipToCity.lookupZipsByCityId(metro.cityId);

	var result = { 
		regionId: `00${metro.zip}00`,
		zips: []
	}

	for (var i = 0; i < zips.length; i++) {
		result.zips.push(zips[i].zip);
	}

	return result;
}


module.exports = {
	getAll,
	getById
}