'use strict';

const _ = require('lodash');
const check = require('check-types');
const emailvalidator = require('email-validator');
const express = require('express');
const moment = require('moment');
const multer = require('multer');
const mysql = require('promise-mysql');
const upload = multer({
	dest: 'upload'
});
const router = express.Router();

const {
	abortProductUpload,
	changePassword,
	create,
	createColumnMapping,
	createColumnLabelMapping,
	createInventoryWorksheetInfo,
	createProduct,
	createWorksheetInfo,
	deleteColumnMapping,
	deleteColumnLabelMapping,
	deleteProduct,
	fulfill,
	getAll,
	getAllProducts,
	getById,
	getCatalogJobs,
	getColumnMappings,
	getColumnLabelMappings,
	getDropshipQueueProducts,
	getInventoryWorksheetInfo,
	getInventoryJobs,
	getProductById,
	getVendorSchema,
	getWorksheetInfo,
	login,
	mergeUpload,
	remove,
	resetPassword,
	queueBase64CatalogJob,
	validateAndQueueDropshipProducts,
	queueMultipartCatalogJob,
	queueMultipartInventoryJob,
	update,
	updateColumnMapping,
	updateColumnLabelMapping,
	updateInventoryWorksheetInfo,
	updateProduct,
	updateWorksheetInfo,
	vendorImport
} = require('../actions/vendors');

const fileUtils = require('../utils/fileUtils');
const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');
const {
	formatResp,
	respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');
const vendorUtils = require('../utils/vendorUtils');


const VendorLogins = require('../models/vendorLogins');




//
//  POST /vendors
//
router.post(`/`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.'
		};

		//
		//	Only allow vendors to be created from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			create(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /vendors/import
//
router.post(`/import`, jwtUtils.verifyToken, upload.array('vendors'), (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 201,
			message: 'Vendors imported.'
		};

		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			if ((req.files === undefined) || (req.files.length === 0)) {
				resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'vendors'));
				respond(resp, res, next);
			} else {
				vendorImport(req, resp)
					.then((id) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ['id']);
					});
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  GET /vendors
//
router.get(`/`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var sortBy = 'name ASC';
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};

		if ((req.query.manifestSellerFlag != undefined) && (req.query.manifestSellerFlag != 'true') && (req.query.manifestSellerFlag != 'false')) {
			response.respond(resp, res, next, undefined, 400, 'Invalid manifestSellerFlag.');
		} else {
			if (req.query.manifestSellerFlag != undefined) {
				if (req.query.manifestSellerFlag == 'true') {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'v.manifest_seller_flag = TRUE');
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'v.manifest_seller_flag = FALSE');
				}
			}

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}


			if ((req !== undefined) && (req.query.marketplacesAllowed)) {
				var platformWhere = "";
				var vals = [];

				if (req.query.marketplacesAllowed.indexOf(',') >= 0) {
					var s = _.split(req.query.marketplacesAllowed, ',')
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
						vals.push(s[i]);
					}
					platformWhere = 'platform IN (' + placeholders + ')';
				} else {
					platformWhere = 'platform = ?', req.query.marketplacesAllowed;
					vals.push(req.query.marketplacesAllowed);
				}

				var idSql = mysql.format(`SELECT v.vendor_id
																				FROM vendor_to_marketplaces v
																						LEFT JOIN listed_on l ON l.id = v.marketplace_id
																						WHERE ${platformWhere}`, vals);
				whereInfo = sqlUtils.appendWhere(whereInfo, 'v.id IN (' + idSql + ')');
			}


			if ((req.query.partnerContractType !== undefined) &&
				((req.query.partnerContractType === 'REVENUE_SHARE') || (req.query.partnerContractType === 'COST_BASED'))) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'v.partner_contract_type = ?', req.query.partnerContractType.trim());
			}

			if ((req.query.rrcStatus !== undefined) &&
				((req.query.rrcStatus === 'ACTIVE') || (req.query.rrcStatus === 'INACTIVE'))) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'v.rrc_status = ?', req.query.rrcStatus.trim());
			}

			if (req.query.name) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'v.name LIKE ?', req.query.name.trim() + '%');
			}

			// Look up vendors by partner type
			if (req.query.partnerType) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'vpt.type = ?', req.query.partnerType.trim());
				whereInfo.join = ' JOIN vendor_to_partner_types vtpt ON v.id = vtpt.vendor_id JOIN vendor_partner_types vpt ON vpt.id = vtpt.partner_type ';
				whereInfo.select = ' v.*, vpt.type, vtpt.vendor_id, vtpt.partner_type ';
			}

			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['name', 'rrcStatus']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}


			getAll(whereInfo, offset, limit, resp, sortBy)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /vendors/schema
//
router.get(`/schema`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		//
		//	Only allow schema to be retrieved from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			getVendorSchema(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /vendors/{id}
//
router.get(`/:id`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};
		var where = '';


		if (req.params.id === 'schema') {
			return;
		} else {
			//	Internals can't get current, externals can only get current.
			if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
				((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
				respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
			} else {

				//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
				if ((req.get('x-app-type') === 'EXT') &&
					(req.params.id === 'current') &&
					(req.decoded != undefined) &&
					(req.decoded.vendorId != undefined)) {
					req.params.id = req.decoded.vendorId;
				}

				getById(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ['id']);
					})
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  DELETE /vendors/{id}
//
router.delete(`/:id`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Delete successful.'
		};

		//
		//	Only allow vendors to be deleted from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			remove(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  PUT /vendors/{id}
//
router.put(`/:id`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Update successful.'
		};


		req.params.internalFlag = true;

		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ["data"], 404, memberText.get("MEMBER_404"));
		} else {

			//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
				req.params.internalFlag = false;
			}

			update(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /vendor/{id}/catalogJobs
//
router.post(`/:id/catalogJobs`, jwtUtils.verifyToken, upload.array('catalog'), (req, res, next) => {
	try {
		var nameCollision = req.query.nameCollision ? req.query.nameCollision : 'OVERWRITE';
		var prom = [];
		var resp = {
			statusCode: 201,
			id: 0,
			message: 'Catalog submitted for processing.'
		};
		var storageContext = {};
		var submitterId = req.decoded ? (req.decoded.userId ? req.decoded.userId : req.decoded.vendorId ? req.decoded.vendorId : 0) : 0;
		var submitterType = req.decoded ? (req.decoded.userId ? 'USER' : req.decoded.vendorId ? 'VENDOR' : 'USER') : 'USER';

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			if (req.query.context === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'context'));
				respond(resp, res, next);
			} else {
				storageContext = fileUtils.getContext(req.query.context, nameCollision);

				if (storageContext === null) {
					resp = formatResp(resp, undefined, 404, memberText.get('STORAGE_CONTEXT_404'));
					respond(resp, res, next);
				}
				if (((req.files === undefined) || (req.files.length === 0)) && ((req.body.base64 === undefined) || (req.body.originalName === undefined))) {
					resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'catalog, base64, originalName'));
					respond(resp, res, next);
				} else {
					//	If files were uploaded, assume MULTIPART
					if (req.files != undefined) {
						prom.push(queueMultipartCatalogJob(resp, submitterId, submitterType, req.params.id, req.files[0].path, req.files[0].originalname));
					} else {
						prom.push(queueBase64CatalogJob(resp, submitterId, submitterType, req.params.id, req.body.base64, req.body.originalName));
					}
					Promise.all(prom)
						.then((id) => {
							resp.id = id[0];
							if (resp.id === 404) {
								resp = formatResp(resp, ['id'], 404, memberText.get('VENDOR_404'));
							} else if (resp.id === 405) {
								resp = formatResp(resp, ['id'], 404, 'Worksheet info is not defined for this vendor.');
							}
							respond(resp, res, next);
						})
						.catch((e) => {
							if (!e.message.startsWith("Content type")) {
								logUtils.routeExceptions(e, req, res, next, resp, ['id']);
							} else {
								console.log("No log");

								delete resp.id;
								resp.statusCode = 500;
								resp.message = e.message ? e.message : 'System error has occurred.';

								respond(resp, res, next);
							}
						});
				}
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

//
//  GET /vendor/{id}/catalogJobs
//
router.get(`/:id/catalogJobs`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('MEMBER_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			getCatalogJobs(req, offset, limit, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /vendor/{id}/catalogParse
//
router.post(`/:id/catalogParse`, jwtUtils.verifyToken, upload.array('catalog'), (req, res, next) => {
	try {
		var nameCollision = req.query.nameCollision ? req.query.nameCollision : 'OVERWRITE';
		var prom = [];
		var resp = {
			statusCode: 200
		};
		var storageContext = {};
		var userId = req.query.userId ? req.query.userId : 0;

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			if (req.query.context === undefined) {
				resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'context'));
				respond(resp, res, next);
			} else {
				storageContext = fileUtils.getContext(req.query.context, nameCollision);

				if (storageContext === null) {
					resp = formatResp(resp, undefined, 404, memberText.get('STORAGE_CONTEXT_404'));
					respond(resp, res, next);
				}
				if ((req.files === undefined) && ((req.body.base64 === undefined) || (req.body.originalName === undefined))) {
					resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'catalog, base64, originalName'));
					respond(resp, res, next);
				} else {
					//	If files were uploaded, assume MULTIPART
					if (req.files != undefined) {
						prom.push(queueMultipartCatalogJob(resp, 0, 'USER', req.params.id, req.files[0].path, req.files[0].originalname, true));
					} else {
						prom.push(queueBase64CatalogJob(resp, 0, 'USER', req.params.id, req.body.base64, req.body.originalName, true));
					}

					Promise.all(prom)
						.then((results) => {
							if (results[0] === 404) {
								resp = formatResp(resp, ['id'], 404, memberText.get('VENDOR_404'));
							} else {
								resp = results[0];
							}
							respond(resp, res, next);
						})
						.catch((e) => {
							if (!e.message.startsWith("Content type")) {
								logUtils.routeExceptions(e, req, res, next, resp, ['id']);
							} else {
								console.log("No log");

								delete resp.id;
								resp.statusCode = 500;
								resp.message = e.message ? e.message : 'System error has occurred.';

								respond(resp, res, next);
							}
						});
				}
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /vendors/{id}/columnMappings
//
router.post(`/:id/columnMappings`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			data: {}
		};


		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			if ((req.body[0] === undefined) || (req.body[0].dataPoint === undefined) || (req.body[0].column === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'label, dataPoint, column'));
				respond(resp, res, next);
			} else {
				createColumnMapping(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ['id']);
					})
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /vendors/{id}/columnLabelMappings
//
router.post(`/:id/columnLabelMappings`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			data: {}
		};

		//
		//	Only allow mappings to be stored from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			if ((req.body[0] === undefined) || (req.body[0].dataPointId === undefined) || (req.body[0].columnLabel === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'dataPointId, columnLabel'));
				delete resp.data;
				respond(resp, res, next);
			} else {
				createColumnLabelMapping(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ['id']);
					})
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /vendors/{id}/columnMappings
//
router.get(`/:id/columnMappings`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			getColumnMappings(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  GET /vendors/{id}/columnLabelMappings
//
router.get(`/:id/columnLabelMappings`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		//
		//	Only allow mappings to be retrieved from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			getColumnLabelMappings(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





//
//  PUT /vendors/{id}/columnMappings/{mid}
//
router.put(`/:id/columnMappings/:mid`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else if ((req.body.dataPoint === undefined) || (req.body.column === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'label, dataPoint, column'));
			respond(resp, res, next);
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			updateColumnMapping(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  PUT /vendors/{id}/columnLabelMappings/{mid}
//
router.put(`/:id/columnLabelMappings/:mid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};

		//
		//	Only allow mappings to be stored from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			if ((req.body.dataPointId === undefined) || (req.body.columnLabel === undefined)) {
				resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'dataPointId, columnLabel'));
				respond(resp, res, next);
			} else {
				updateColumnLabelMapping(req, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, ['id']);
					})
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





//
//  DELETE /vendors/{id}/columnMappings/{mid}
//
router.delete(`/:id/columnMappings/:mid`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			deleteColumnMapping(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  DELETE /vendors/{id}/columnLabelMappings/{mid}
//
router.delete(`/:id/columnLabelMappings/:mid`, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};

		//
		//	Only allow mappings to be stored from internal API calls.
		//
		if (req.get('x-app-type') != 'INT') {
			response.respond(resp, res, next, undefined, 403, 'Access denied.');
		} else {
			deleteColumnLabelMapping(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /vendors/{id}/inventoryWorksheetInfo
//
router.post(`/:id/inventoryWorksheetInfo`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.'
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else if ((req.body === undefined) || (req.body.firstDataRow === undefined) || (req.body.vendorSkuColumn === undefined) || (req.body.quantityColumn === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'firstDataRow, vendorSkuColumn, quantityColumn'));
			respond(resp, res, next);
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			createInventoryWorksheetInfo(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

//
//  GET /vendors/{id}/inventoryWorksheetInfo
//
router.get(`/:id/inventoryWorksheetInfo`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			getInventoryWorksheetInfo(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

//
//  PUT /vendors/{id}/inventoryWorksheetInfo/{mid}
//
router.put(`/:id/inventoryWorksheetInfo/:mid`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else if ((req.body.vendorSkuColumn === undefined) || (req.body.quantityColumn === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'vendorSkuColumn, quantityColumn'));
			respond(resp, res, next);
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}


			updateInventoryWorksheetInfo(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

//
//  DELETE /vendor/{id}/catalogs/{uid}
//
router.delete(`/:id/catalogs/:uid`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			abortProductUpload(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

//
//  PUT /vendor/{id}/catalogs/{uid}
//
router.put(`/:id/catalogs/:uid`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			mergeUpload(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /vendor/{id}/inventoryJobs
//
router.post(`/:id/inventoryJobs`, jwtUtils.verifyToken, upload.array('inventory'), async (req, res, next) => {
	try {
		var nameCollision = req.query.nameCollision ? req.query.nameCollision : 'OVERWRITE';
		var prom = [];
		var resp = {
			statusCode: 201,
			id: 0,
			message: 'Inventory submitted for processing.'
		};
		var storageContext = {};
		var userId = req.decoded ? (req.decoded.userId ? req.decoded.userId : req.decoded.vendorId ? req.decoded.vendorId : 0) : 0;

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else if ((req.files === undefined) || (req.files.length === 0)) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'inventory'));
			respond(resp, res, next);
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			//	If files were uploaded, assume MULTIPART
			var id = await queueMultipartInventoryJob(resp, userId, req.params.id, req.files[0].path, req.files[0].originalname);
			resp.id = id;
			if (resp.id === 404) {
				resp = formatResp(resp, ['id'], 404, memberText.get('VENDOR_404'));
			}
			respond(resp, res, next);
		}
	} catch (e) {
		if ((!e.message.startsWith("Content type")) && (!e.message.startsWith("Inventory worksheet info"))) {
			logUtils.routeExceptions(e, req, res, next, resp, ['id']);
		} else {
			console.log("No log");

			delete resp.id;
			resp.statusCode = 500;
			resp.message = e.message ? e.message : 'System error has occurred.';

			respond(resp, res, next);
		}
	}
});

//
//  GET /vendor/{id}/inventoryJobs
//
router.get(`/:id/inventoryJobs`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			getInventoryJobs(req, offset, limit, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /vendor/{id}/products
//
router.post(`/:id/products`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.'
		};

		if (req.body.vendorSku === undefined) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'vendorSku'));
			respond(resp, res, next);
			//	Internals can't get current, externals who are vendors can only get current.
		} else if (((req.get('x-app-type') === 'EXT') && req.decoded.vendorId && (req.params.id !== 'current')) ||
			((req.get('x-app-type') === 'EXT') && req.decoded.partnerId && (req.params.id === 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			createProduct(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /vendor/{id}/products
//
router.get(`/:id/products`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			metaData: {
				totalCount: 0
			},
			data: {}
		};
		var sortBy = 'product_name ASC';
		var whereInfo = {
			clause: '',
			values: []
		}


		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			whereInfo.clause = 'WHERE p.vendor_id = ?';
			whereInfo.values.push(req.params.id);

			if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
				limit = parseInt(req.query.limit);
			}

			if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
				offset = parseInt(req.query.offset);
			}

			if (req.query.filter) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'search_field LIKE ?', ['%' + req.query.filter + '%']);
			}

			if (req.query.primaryCategory) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'primary_category LIKE ?', ['%' + req.query.primaryCategory + '%']);
			}

			if (req.query.secondaryCategory) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'secondary_category LIKE ?', ['%' + req.query.secondaryCategory + '%']);
			}

			if (req.query.productName) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'product_name LIKE ?', ['%' + req.query.productName + '%']);
			}

			if (req.query.vendorSku) {
				if ((req.query.vendorSkuExactMatchFlag !== undefined) && (req.query.vendorSkuExactMatchFlag === 'true')) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku = ?', [req.query.vendorSku]);
				}
				else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.vendor_sku LIKE ?', ['%' + req.query.vendorSku + '%']);
				}
			}

			if (req.query.mpn) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'mpn LIKE ?', [req.query.mpn + '%']);
			}

			if (req.query.upc) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'upc LIKE ?', [req.query.upc + '%']);
			}

			if ((req.query.eligibleForDropship !== undefined) && (req.query.eligibleForDropship !== null)) {
				if ((req.query.eligibleForDropship === true) || (req.query.eligibleForDropship === 'true') ||
					(req.query.eligibleForDropship === 1) || (req.query.eligibleForDropship === '1') ||
					(req.query.eligibleForDropship === 'Y')) {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_dropship = 1');
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'p.eligible_for_dropship = 0');
				}
			}

			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['productName', 'vendorSku', 'msrp', 'map_price', 'primaryCategory', 'secondaryCategory', 'primaryMaterial', 'dateCreated', 'mpn', 'upc', 'brandName', 'dropshipInventory']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}

			const options = { ltlReturnItemId: req.query.ltlReturnItemId }
			if (options.ltlReturnItemId) {
				whereInfo = sqlUtils.appendWhere(whereInfo, 'i.id = ?', [options.ltlReturnItemId])
			}

			if ((sortBy != 'field') && (sortBy != 'direction')) {
				getAllProducts(req, whereInfo, sortBy, offset, limit, options, resp)
					.then((resp) => {
						respond(resp, res, next);
					})
					.catch((e) => {
						logUtils.routeExceptions(e, req, res, next, resp, null);
					})
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});





//
//  PUT /vendor/{id}/products/{pid}
//
router.put(`/:id/products/:pid`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {

			}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else if ((req.body.validated !== undefined) &&
			(req.body.validated !== true) && (req.body.validated !== "true") && (req.body.validated !== 1) && (req.body.validated !== "1") &&
			(req.body.validated !== false) && (req.body.validated !== "false") && (req.body.validated !== 0) && (req.body.validated !== "0")) {
			response.respond(resp, res, next, undefined, 400, 'Invalid value for validated');

		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			if ((req.body.validated === true) || (req.body.validated === "true") || (req.body.validated === 1) || (req.body.validated === "1")) {
				if (req.decoded) {
					req.body.validated = true;
					req.body.validatedBy = ((req.decoded) && (req.decoded.userId)) ? req.decoded.userId : 0;
					req.body.validatedDate = new moment();
				}
			} else if ((req.body.validated === false) || (req.body.validated === "false") || (req.body.validated === 0) || (req.body.validated === "0")) {
				req.body.validated = false;
				req.body.validatedBy = null;
				req.body.validatedDate = null;
				req.body.validatedByUserName = null;
			}

			updateProduct(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});




//
//  GET /vendor/{id}/products/{pid}
//
router.get(`/:id/products/:pid`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get('GET_SUCCESS'),
			data: {}
		};

		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			getProductById(req.params.id, req.params.pid, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  DELETE /vendor/{id}/products/{pid}
//
router.delete(`/:id/products/:pid`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
		};


		if ((req.decoded != undefined) &&
			(req.decoded.userId != undefined)) {
			req.query.submitterId = req.decoded.userId;
		}


		if ((req.query.submitterId === undefined) || (req.query.submitterId === null)) {
			respond(resp, res, next, ["data"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "submitterId"));
		} else {
			resp = await deleteProduct(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  POST /vendor/{id}/worksheetInfo
//
router.post(`/:id/worksheetInfo`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.',
			id: 0
		};

		if ((req.body.worksheetNumber === undefined) || (req.body.firstDataRow === undefined)) {
			resp = formatResp(resp, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'worksheetNumber, firstDataRow'));
			respond(resp, res, next);
			//	Internals can't get current, externals can only get current.
		} else if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			createWorksheetInfo(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  GET /vendors/{id}/worksheetInfo
//
router.get(`/:id/worksheetInfo`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};

		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			getWorksheetInfo(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, ['id']);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



//
//  PUT /vendor/{id}/worksheetInfo
//
router.put(`/:id/worksheetInfo`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.'
		};

		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			updateWorksheetInfo(req, resp)
				.then((resp) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, undefined);
				})
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

module.exports = router;


//
//  POST /vendors/login
//
router.post(`/login`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGIN_SUCCESS"),
			data: {}
		};

		if (!req.body.email || (emailvalidator.validate(req.body.email) === false) || !req.body.password || (req.body.password.trim().length === 0)) {
			respond(resp, res, next, ["id", "data"], 401, memberText.get("LOGIN_FAIL"));
		} else {

			await login(req, resp);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});



//
//  POST /vendors/{id}/logout
//
router.post(`/:id/logout`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var prom = [];
		var resp = {
			statusCode: 200,
			message: memberText.get("LOGOUT_SUCCESS")
		};

		//
		//	If this is an external API call attempting to get current, try to retrieve the member ID using token.
		//
		if ((req.get('x-app-type') === 'EXT') &&
			(req.params.id === 'current') &&
			(req.decoded != undefined) &&
			(req.decoded.vendorId != undefined)) {
			req.params.id = req.decoded.vendorId;
		}

		//
		//	Couldn't decode JWT token, simply respond logged out.
		//
		if ((req.decoded === undefined) || (req.decoded.vendorId === undefined)) {
			respond(resp, res, next);

		}
		//
		//	Mark the token invalid.
		//
		else {
			VendorLogins.logout(req)
				.then((results) => {
					respond(resp, res, next);
				})
				.catch((e) => {
					logUtils.routeExceptions(e, req, res, next, resp, null);
				});
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});



//
//  POST /members/changePassword
//
router.post(`/changePassword`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("CHANGE_PSWD_SUCCESS")
		};

		var validationErrors = await vendorUtils.validateVendor(req, false);
		if (validationErrors.errorDetails.length > 0) {
			respond(resp, res, next, undefined, 400, validationErrors.message, validationErrors.errorDetails)
		} else if ((req.body.verificationId === undefined) || (req.body.password === undefined)) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "Verification ID, Password"));
		} else {

			resp = await changePassword(req, resp);
			respond(resp, res, next);
		}

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});






//
//  POST /vendors/resetPassword
//
router.post(`/resetPassword`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: memberText.get("PSWD_RESET_SUCCESS")
		};

		if ((req.body.email === undefined) || (emailvalidator.validate(req.body.email) === false)) {
			respond(resp, res, next, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "Email"));
		} else {
			await resetPassword(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, null);
	}
});


//
//  POST /vendor/{id}/fulfill
//
router.post(`/:id/fulfill`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success'
		};
		//
		//	Internals can't get current, externals can only get current.
		//
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//	Determine if this is an internal user or not and capture their id.
			if ((req.get('x-app-type') === 'EXT') &&
				(req.decoded !== undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			} else if ((req.get('x-app-type') === 'INT') &&
				(req.decoded !== undefined) &&
				(req.decoded.userId != undefined)) {}

			await fulfill(req, resp);

			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  POST /vendor/{id}/dropshipProductQueue
//
router.post(`/:id/dropshipProductQueue`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {
				products: []
			}
		};

		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}

			await validateAndQueueDropshipProducts(req, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  GET /vendor/{id}/dropshipProductQueue
//
router.get(`/:id/dropshipProductQueue`, jwtUtils.verifyToken, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {
				products: []
			}
		}
		var whereInfo = {
			join: '',
			clause: '',
			values: []
		};


		//	Internals can't get current, externals can only get current.
		if (((req.get('x-app-type') === 'EXT') && (req.params.id != 'current')) ||
			((req.get('x-app-type') === 'INT') && (req.params.id === 'current'))) {
			respond(resp, res, next, ['data'], 404, memberText.get('VENDOR_404'));
		} else {
			//
			//	If this is an external API call attempting to get current, try to retrieve the vendor ID using token.
			//
			if ((req.get('x-app-type') === 'EXT') &&
				(req.params.id === 'current') &&
				(req.decoded != undefined) &&
				(req.decoded.vendorId != undefined)) {
				req.params.id = req.decoded.vendorId;
			}


			whereInfo = sqlUtils.appendWhere(whereInfo, 'vendor_id = ?', [req.params.id]);

			if (req.query.status) {
				if (req.query.status.toLowerCase() === 'null') {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'status IS NULL');
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'status = ?', [req.query.status]);
				}
			}


			await getDropshipQueueProducts(whereInfo, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});