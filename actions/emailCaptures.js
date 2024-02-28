'use strict'

const ZipToCity = require('../models/zipToCity');

const configUtils = require('../utils/configUtils')
const mailchimpUtils = require('../utils/mailchimpUtils');



var capture = async (email, zip, tags, resp) => {
	var city = await ZipToCity.lookupCity(zip);
	var slug = 'oom';

	if (city.length > 0) {
		slug = `region:${city[0].city_slug}`;
	}

	if (configUtils.get("MAILCHIMP_NON_MEMBER_LIST") !== null) {
		await mailchimpUtils.captureEmail(configUtils.get("MAILCHIMP_NON_MEMBER_LIST"), email, zip, slug, tags);
	}

	return resp;
}



module.exports = {
	capture
}