'use strict';


const express = require('express');
const multer = require('multer');
const upload = multer({
	dest: 'upload'
});
const router = express.Router();

const {
	deleteImage,
	storeImageBase64,
	storeImageMultipart,
	storeImageUrls
} = require('../actions/images');

const jwtUtils = require('../actions/jwtUtils');

const fileUtils = require('../utils/fileUtils');
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');
const {
	formatResp,
	respond
} = require('../utils/response');



//
//  DELETE /images
//
router.delete(`/`, (req, res, next) => {
	try {
		var storageContext = {};
		var resp = {
			statusCode: 200,
			message: "Success."
		};


		//
		//	Only allow images to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if ((req.query.relativePath === undefined) || (req.query.context === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "relativePath, context"));
				respond(resp, res, next);
			} else {

				storageContext = fileUtils.getContext(req.query.context, '');

				if (storageContext === null) {
					resp = formatResp(resp, undefined, 404, memberText.get("STORAGE_CONTEXT_404"));
					respond(resp, res, next);
				} else {

					deleteImage(storageContext, req, resp)
						.then((resp) => {
							respond(resp, res, next);
						})
						.catch((e) => {
							logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
						})
				}
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /images/base64
//
router.post(`/base64`, (req, res, next) => {
	try {
		var nameCollision = req.query.nameCollision ? req.query.nameCollision : 'UNIQUE';
		var resp = {
			statusCode: 201,
			message: "Success."
		};
		var storageContext = {};


		//
		//	Only allow images to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if ((req.body.images === undefined) || (req.query.context === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "images, context"));
				respond(resp, res, next);
			} else if ((req.query.nameCollision != undefined) && (req.query.nameCollision != 'UNIQUE') && (req.query.nameCollision != 'OVERWRITE') && (req.query.nameCollision != 'DENY')) {
				resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "nameCollision"));
				respond(resp, res, next);
			} else {

				storageContext = fileUtils.getContext(req.query.context, nameCollision);

				if (storageContext === null) {
					resp = formatResp(resp, undefined, 404, memberText.get("STORAGE_CONTEXT_404"));
					respond(resp, res, next);
				} else {

					storeImageBase64(storageContext, req, resp)
						.then((resp) => {
							respond(resp, res, next);
						})
						.catch((e) => {
							logUtils.routeExceptions(e, req, res, next, resp, null);
						})
				}
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  POST /images/form
//
router.post(`/multipart`,  jwtUtils.verifyToken, upload.array('images'), (req, res, next) => {
	try {
		var nameCollision = req.query.nameCollision ? req.query.nameCollision : 'UNIQUE';
		var resp = {
			statusCode: 201,
			message: "Success.",
		};
		var storageContext = {};

		//
		//	Only allow images to be created from internal API calls.
		//
		if ((req.get('x-app-type') !== 'INT') && (req.get('x-app-type') !== 'EXT') || ((req.get('x-app-type') === 'EXR') && (req.decoded === undefined))) {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if ((req.files === undefined) || (req.query.context === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "context, files"));
				respond(resp, res, next);
			} else if ((req.query.nameCollision != undefined) && (req.query.nameCollision != 'UNIQUE') && (req.query.nameCollision != 'OVERWRITE') && (req.query.nameCollision != 'DENY')) {
				resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "nameCollision"));
				respond(resp, res, next);
			} else if ((req.query.saveToCoreleap !== undefined) && (req.query.saveToCoreleap === 'true') &&
			((req.query.sku === undefined) && ((req.query.vendorId === undefined) || (req.query.vendorSku === undefined)))) {
		resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku OR vendorId and vendorSku"));
		respond(resp, res, next);
} else {
				storageContext = fileUtils.getContext(req.query.context, nameCollision);

				if (storageContext === null) {
					resp = formatResp(resp, undefined, 404, memberText.get("STORAGE_CONTEXT_404"));
					respond(resp, res, next);
				} else { 

					storeImageMultipart(storageContext, req, resp)
						.then((resp) => {
							respond(resp, res, next);
						})
						.catch((e) => {
							logUtils.routeExceptions(e, req, res, next, resp, null);
						})
				}
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /images
//
router.post(`/urls`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var storageContext = {};
		var nameCollision = req.query.nameCollision ? req.query.nameCollision : 'UNIQUE';
		var resp = {
			statusCode: 201,
			message: "Success."
		};

		//
		//	Only allow images to be created from internal API calls.
		//
		if ((req.get('x-app-type') !== 'INT') && (req.get('x-app-type') !== 'EXT') || ((req.get('x-app-type') === 'EXR') && (req.decoded === undefined))) {
			response.respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if ((req.body.images === undefined) || (req.query.context === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "images, context"));
				respond(resp, res, next);
			} else if ((req.query.nameCollision != undefined) && (req.query.nameCollision != 'UNIQUE') && (req.query.nameCollision != 'OVERWRITE') && (req.query.nameCollision != 'DENY')) {
				resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "nameCollision"));
				respond(resp, res, next);
			} else if ((req.query.saveToCoreleap !== undefined) && (req.query.saveToCoreleap === 'true') &&
						((req.query.sku === undefined) && ((req.query.vendorId === undefined) || (req.query.vendorSku === undefined)))) {
					resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "sku OR vendorId and vendorSku"));
					respond(resp, res, next);
			} else {

				storageContext = fileUtils.getContext(req.query.context, nameCollision);

				if (storageContext === null) {
					resp = formatResp(resp, undefined, 404, memberText.get("STORAGE_CONTEXT_404"));
					respond(resp, res, next);
				} else {

					storeImageUrls(storageContext, req, resp)
						.then((resp) => {
							respond(resp, res, next);
						})
						.catch((e) => {
							logUtils.routeExceptions(e, req, res, next, resp, ["id"]);
						})
				}
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});







module.exports = router;