'use strict';

const express = require('express');
const router = express.Router();

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const {
	formatResp,
	respond
} = require('../utils/response');

const VendorPartnerTypes = require('../models/vendorPartnerTypes');
const Manifests = require('../models/manifests');
const Vendors = require('../models/vendors');
const {
	setVendorPartnerTypes
} = require('../actions/vendorPartnerTypes');

//
//  GET /vendorPartnerTypes
//
router.get(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};


		VendorPartnerTypes.getAll(resp)
			.then((resp) => {
				respond(resp, res, next);
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

//
// PUT /vendorPartnerTypes
//
router.put(`/:vendorId`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Update successful."
		};

		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if (req.body.partnerTypes === undefined) {
				resp = formatResp(resp, undefined, 400, "Partner Types required.");
				respond(resp, res, next);
			} else {
				let partnerTypes = Array.from(req.body.partnerTypes.split(","));

				// If partner type is 'RBR', create a default RBR manifest for
				// vendor if it does not already exist
				if (partnerTypes.findIndex(pt => pt === 'RBR') !== -1) {
					const manifests = await Manifests.getRBRByVendorId(req.params.vendorId);
					if (!manifests || manifests.length === 0) {
						const vendor = await Vendors.getById(req.params.vendorId);
						await Manifests.createRBRManifest(undefined, vendor[0]);
					}
				}

				setVendorPartnerTypes(req.params.vendorId, partnerTypes, req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
					})
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

module.exports = router;