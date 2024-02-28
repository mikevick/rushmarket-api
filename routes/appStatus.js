'use strict';

const express = require('express');
const router = express.Router();

const AppVersions = require('../models/appVersions');

const logUtils = require('../utils/logUtils');
const {
	formatResp,
	respond
} = require('../utils/response');
const memberText = require('../utils/memberTextUtils');



//
//  GET /appStatus
//
router.get(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			forceUpgrade: false,
			message: memberText.get("VERS_NO_UPGRADE")
		}

		if (req.query.version === undefined) {
			delete resp.forceUpgrade;
			resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "version"));
			respond(resp, res, next);
		} else {
			AppVersions.getSpecificVersion(req.get('x-app-name'), req.query.version)
				.then((rows) => {
					if (rows.length === 0) {
						delete resp.forceUpgrade;
						resp = formatResp(resp, undefined, 404, memberText.get("VERS_404"));
						respond(resp, res, next);
					} else {
						resp.statusCode = rows[0].statusCode;
						if (resp.statusCode != 200) {
							if (rows[0].forceFlag) {
								resp.forceUpgrade = true;
								resp.message = memberText.get("VERS_FORCE");
							}
							else {
								resp.forceUpgrade = false;
								resp.message = memberText.get("VERS_NO_FORCE");
							}
						}
					}
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ["forceUpgrade"]);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["forceUpgrade"]);
	}
});


module.exports = router;