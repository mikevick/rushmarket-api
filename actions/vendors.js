'use strict';

const check = require('check-types');
const eaddr = require('email-addresses');
const excel = require('exceljs');
const bcrypt = require('bcrypt');
const fs = require('fs-extra');
const { google } = require('googleapis');

const mime = require('mime-types');
const { v1: uuidv1 } = require('uuid');

const Coins = require('../models/coins');
const ProductCostRules = require('../models/productCostRules');
const RushOrders = require('../models/rushOrders');
const RushProducts = require('../models/rushProducts');
const Users = require('../models/users');
const Vendors = require('../models/vendors');
const VendorLogins = require('../models/vendorLogins');

const coinActions = require('../actions/coins');
const gde = require('../actions/gde');
const jwtUtils = require('../actions/jwtUtils');
const {
	calculateCost,
	calculateProcessingFee
} = require('../actions/productsProcessCommon');
const vcGDE = require('../actions/vcGDE');

const comms = require('../utils/comms');
const configUtils = require('../utils/configUtils');
const logUtils = require('../utils/logUtils');
const { roundTo2Places } = require('../utils/mathUtils');
const memberText = require('../utils/memberTextUtils');
const parseUtils = require('../utils/parseUtils');
const {
	getDatapointValidations,
	getMappings,
	getLabelMappings,
	logChanges,
	orchestrateUpdate,
	validateProduct,
	verifyEligibility,
} = require('../utils/productUtils');
const { formatResp } = require('../utils/response');
const shopifyUtils = require('../utils/shopifyUtils');
const sqlUtils = require('../utils/sqlUtils');
const userUtils = require('../utils/userUtils');
const { validateVendor } = require('../utils/vendorUtils');


// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify',
	'https://mail.google.com'
];

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'creds/tracking-email-token.json';




//
//	Abort previous upload.
//
var abortProductUpload = (req, resp) => {
	return new Promise((resolve, reject) => {
		Vendors.abortProductUpload(req.params.uid)
			.then((r) => {
				if (r.statusCode != 200) {
					resp.statusCode = r.statusCode;
					resp.message = r.message;
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	Vendor create.
//
var create = (req, resp) => {
	return new Promise((resolve, reject) => {

		// 
		//	Validate vendor
		//
		validateVendor(req)
			.then((validationErrors) => {
				if (validationErrors.errorDetails.length > 0) {
					resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
					resolve(resp);
				} else {

					Vendors.getByName(req.body.name)
						.then((rows) => {
							if (rows.length > 0) {
								resp = formatResp(resp, undefined, 409, memberText.get("VENDOR_COLL"));
								resolve(resp);
							} else {
								Vendors.create(req.body)
									.then((id) => {
										resp.id = id;
										resolve(resp);
									})
									.catch((e) => {
										reject(e);
									});
							}
						})
						.catch((e) => {
							reject(e);
						});
				}
			})
			.catch((e) => {
				reject(e);
			});

	});
}


//
//	Vendor column mappings create.
//
var createColumnMapping = (req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		// 
		//	Validate column mappings
		//
		Vendors.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
					resolve(resp);
				} else {
					for (var i = 0; i < req.body.length; i++) {
						prom.push(Vendors.createColumnMappings(req.params.id, req.body[i]));
					}

					Promise.all(prom)
						.then((results) => {
							resp.data.vendorCatalogMappings = [];
							for (var i = 0; i < results.length; i++) {
								var o = req.body[i];
								o.id = results[i];
								resp.data.vendorCatalogMappings.push(o);
							}
							resolve(resp);
						})
						.catch((e) => {
							reject(e);
						});
				}
			})
			.catch((e) => {
				reject(e);
			});

	});
}



//
//	Vendor column mappings create.
//
var createColumnLabelMapping = async (req, resp) => {
	var prom = [];

	// 
	//	Validate column mappings
	//
	var rows = await Vendors.getById(req.params.id);
	if (rows.length === 0) {
		resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
		return resp;
	} else {
		for (var i = 0; i < req.body.length; i++) {
			prom.push(Vendors.createColumnLabelMappings(req.params.id, req.body[i]));
		}

		var results = await Promise.all(prom);
		resp.data.vendorCatalogLabelMappings = [];
		for (var i = 0; i < results.length; i++) {
			var o = req.body[i];
			o.id = results[i];
			resp.data.vendorCatalogLabelMappings.push(o);
		}

		return resp;
	}
}



//
//	Vendor inventory worksheet info create.
//
var createInventoryWorksheetInfo = (req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		// 
		//	Validate column mappings
		//
		Vendors.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
					resolve(resp);
				} else {
					Vendors.createInventoryWorksheetInfo(req.params.id, req.body.firstDataRow, req.body.vendorSkuColumn, req.body.quantityColumn)
						.then((results) => {
							resolve(resp);
						})
						.catch((e) => {
							reject(e);
						});
				}
			})
			.catch((e) => {
				reject(e);
			});

	});
}



//
//	Create product
//
var createProduct = async (req, resp) => {
	var prom = [];
	var eligibleCore = false;
	var eligibleNiche = false;
	var eligibleTRM = false;
	var validationErrors = null;

	// Remove fields that should not be updated.
	delete req.body.dateCreated;
	delete req.body.coreEligibilityErrors;
	delete req.body.eligibleForTrm;
	delete req.body.trmEligibilityErrors;
	delete req.body.eligibleForNiche;
	delete req.body.nicheEligibilityErrors;
	delete req.body.validationErrors;
	delete req.body.eligibleFor3rdParty;
	delete req.body.eligibleForInline;
	delete req.body.inlineEligibilityErrors;
	delete req.body.eligibleForBulkBuys;
	delete req.body.bulkBuysEligibilityErrors;
	delete req.body.eligibleForOffPrice;
	delete req.body.offPriceEligibilityErrors;
	delete req.body.eligibleForVendorReturns;
	delete req.body.vendorReturnsEligibilityErrors;
	delete req.body.eligibleForRetailerReturns;
	delete req.body.retailerReturnsEligibilityErrors;

	//	Ensure a product with this vendor ID/sku combo doesn't already exist.
	var result = await Vendors.getProductByVendorSku(req.params.id, req.body.vendorSku);
	if (result.length > 0) {
		var coin = await Coins.getByVendorSku(req.params.id, req.body.vendorSku);
		if (coin.length > 0) {
			resp.coinId = coin[0].coinId;
		} else {
			resp.coinId = null;
		}

		resp = formatResp(resp, undefined, 409, 'Product already exists.');
		return resp;
	} else {
		var validations = await getDatapointValidations();

		//	Inject the vendor ID into the product.
		req.body.vendorId = req.params.id;
		validationErrors = await validateProduct(validations, req.body);
		if (validationErrors.errorDetails.length > 0) {
			resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
			return resp;
		} else {


			//
			// If product meets core requirements, set to ACTIVE, otherwise STUB
			//
			var product = await verifyEligibility(req.body, undefined);

			delete product.vendorName;

			resp.id = await Vendors.addProduct(validations, req.params.id, product)

			//	Retrieve the new product so the variantSku can be used for COIN creation.
			var p = await Vendors.getProductById(req.params.id, resp.id);

			var result = await coinActions.mintOrMatch(p[0], {});
			resp.coinId = result.id;
			resp.parentId = result.parentId;

			return resp;
		}
	}
}




//
//	Vendor worksheet info create.
//
var createWorksheetInfo = (req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		prom.push(Vendors.getById(req.params.id));
		prom.push(Vendors.getWorksheetInfo(req.params.id));
		Promise.all(prom)
			.then((results) => {
				if (results[0].length === 0) {
					resp = formatResp(resp, ["id"], 404, memberText.get("VENDOR_404"));
					resolve(resp);
				} else if (results[1].length > 0) {
					resp = formatResp(resp, ["id"], 409, "Worksheet info for this vendor already exists.");
					resolve(resp);
				} else {
					Vendors.createWorksheetInfo(req.params.id, req.body)
						.then((results) => {
							resp.id = results;
							resolve(resp);
						})
						.catch((e) => {
							reject(e);
						});
				}
			})
			.catch((e) => {
				reject(e);
			});

	});
}


//
//	Vendor column mapping delete
//
var deleteColumnMapping = (req, resp) => {
	return new Promise((resolve, reject) => {

		Vendors.delColumnMappingById(req.params.id, req.params.mid)
			.then((rows) => {
				if ((rows === undefined) || (rows.affectedRows === 0)) {
					resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	Vendor column label mapping delete
//
var deleteColumnLabelMapping = (req, resp) => {
	return new Promise((resolve, reject) => {

		Vendors.delColumnLabelMappingById(req.params.id, req.params.mid)
			.then((rows) => {
				if ((rows === undefined) || (rows.affectedRows === 0)) {
					resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	GET all vendors
//
var getAll = (where, offset, limit, resp, sortBy) => {
	return new Promise((resolve, reject) => {

		Vendors.getAll(where, offset, limit, sortBy)
			.then((result) => {
				resp.metaData.totalCount = result.totalCount;
				if (result.vendors.length === 0) {
					formatResp(resp, undefined, 200, memberText.get("VENDOR_404"))
				} else {
					resp.data.vendors = result.vendors;
					for (var i = 0; i < resp.data.vendors.length; i++) {
						delete resp.data.vendors[i].password;
					}
				}

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}




//
//	GET all products
//
var getAllProducts = async (req, whereInfo, sortBy, offset, limit, options, resp) => {
	const vendor = await Vendors.getById(req.params.id).then(rows => rows?.[0])
	if (!vendor) {
		return formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
	}

	const { totalCount, rows } = await Vendors.getAllProducts(whereInfo, sortBy, offset, limit, options)
	resp.metaData.totalCount = totalCount;
	if (!rows.length) {
		return formatResp(resp, undefined, 404, memberText.get("PRODUCT_404"))
	}

	const { ltlReturnItemId } = options
	resp.data.products = !ltlReturnItemId ? rows : await Promise.all(rows.map(async (row) => {
		const pendingVendor = Vendors.getById(row.vendorId).then(rows => rows?.[0])
		const conditionName = ['Minor Damage', 'Major Damage'].includes(row.condition) ? 'Damaged' : 'Like New'
		const pendingCost = pendingVendor.then(vendor => calculateCost(row, vendor, conditionName)).then(roundTo2Places)
		const pendingProcessingFee = calculateProcessingFee([], row)

		const [cost, processingFee] = await Promise.all([pendingCost, pendingProcessingFee])
		return {
			...row,
			cost,
			processingFee
		}
	}))

	return resp
}



//
//	GET specific vendor
//
var getById = (req, resp) => {
	return new Promise((resolve, reject) => {

		Vendors.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					formatResp(resp, undefined, 404, memberText.get("VENDOR_404"))
				} else {
					Vendors.getById(req.params.id)
					resp.data = rows[0];

					if ((req.decoded != undefined) &&
						(req.decoded.vendorId != undefined)) {
						delete resp.data.id;
					}
					delete resp.data.password;
				}

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	GET catalog jobs
//
var getCatalogJobs = (req, offset, limit, resp) => {
	return new Promise((resolve, reject) => {

		Vendors.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, ["metaData", "data"], 404, memberText.get("VENDOR_404"))
					resolve(resp);
				} else {
					Vendors.getCatalogJobsByVendorId(req.params.id, offset, limit)
						.then((result) => {
							resp.metaData.totalCount = result.totalCount;
							resp.data.catalogJobs = result.rows;

							resolve(resp);
						})
						.catch((e) => {
							reject(e);
						});
				}
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	GET vendor colum mappings
//
var getColumnMappings = (req, resp) => {
	return new Promise((resolve, reject) => {

		try {
			Vendors.getById(req.params.id)
				.then((rows) => {
					if (rows.length === 0) {
						resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
						resolve(resp);
					} else {

						Vendors.getColumnMappings(req.params.id)
						getMappings(req.params.id, resp)
							.then((resp) => {
								resolve(resp);
							})
							.catch((e) => {
								reject(e);
							});
					}

				})
				.catch((e) => {
					reject(e);
				});
		} catch (e) {
			reject(e);
		}
	});
}



//
//	GET vendor colum mappings
//
var getColumnLabelMappings = async (req, resp) => {
	try {
		var rows = await Vendors.getById(req.params.id);
		if (rows.length === 0) {
			resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
			delete resp.data;
			return resp;
		} else {
			resp = await getLabelMappings(req.params.id, resp);
			return resp;
		}
	} catch (e) {
		reject(e);
	}
}



//
//	GET vendor inventory worksheet info
//
var getInventoryWorksheetInfo = (req, resp) => {
	return new Promise((resolve, reject) => {

		try {
			Vendors.getById(req.params.id)
				.then((rows) => {
					if (rows.length === 0) {
						resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
						resolve(resp);
					} else {

						Vendors.getInventoryWorksheetInfo(req.params.id)
							.then((data) => {
								resp.data = data;
								resolve(resp);
							})
							.catch((e) => {
								reject(e);
							});
					}

				})
				.catch((e) => {
					reject(e);
				});
		} catch (e) {
			reject(e);
		}
	});
}



//
//	GET inventory jobs
//
var getInventoryJobs = (req, offset, limit, resp) => {
	return new Promise((resolve, reject) => {

		Vendors.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, ["metaData", "data"], 404, memberText.get("VENDOR_404"))
					resolve(resp);
				} else {
					Vendors.getInventoryJobsByVendorId(req.params.id, offset, limit)
						.then((result) => {
							resp.metaData.totalCount = result.totalCount;
							resp.data.inventoryJobs = result.rows;

							resolve(resp);
						})
						.catch((e) => {
							reject(e);
						});
				}
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	GET product by id 
//
var getProductById = (id, pid, resp) => {
	return new Promise((resolve, reject) => {

		Vendors.getProductById(id, pid)
			.then((rows) => {
				if (rows.length === 0) {
					formatResp(resp, undefined, 404, memberText.get("PRODUCT_404"))
				} else {
					resp.data.products = rows;
				}

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	GET vendor schema 
//
var getVendorSchema = (req, resp) => {
	return new Promise((resolve, reject) => {

		Vendors.getVendorSchema()
			.then((rows) => {
				if (rows.length === 0) {
					formatResp(resp, undefined, 404, "Could not find schema.")
				} else {
					resp.data.schema = rows;
				}

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	GET vendor worksheet info
//
var getWorksheetInfo = (req, resp) => {
	return new Promise((resolve, reject) => {
		var sheetInfo = null;

		try {
			Vendors.getById(req.params.id)
				.then((rows) => {
					if (rows.length === 0) {
						resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
						resolve(resp);
					} else {

						Vendors.getWorksheetInfo(req.params.id)
							.then((rows) => {
								resp.data.worksheetInfo = rows;

								resolve(resp);
								// }
							})
							.catch((e) => {
								reject(e);
							});
					}

				})
				.catch((e) => {
					reject(e);
				});
		} catch (e) {
			reject(e);
		}
	});
}



var login = async (req, resp) => {

	var rows = await Vendors.getByEmail(req.body.email);

	//	No vendor with this email.
	if (rows.length === 0) {
		resp = formatResp(resp, ["data"], 401, memberText.get("LOGIN_FAIL"));
	} else {

		//	Password check.
		if ((rows[0].password === null) || (bcrypt.compareSync(req.body.password, rows[0].password) === false)) {
			resp = formatResp(resp, ["data"], 401, memberText.get("LOGIN_FAIL"));
		}
		//	All good so create JWT token and record the login.
		else {
			resp.data.vendorFlag = true;
			resp.data.passwordResetFlag = (!rows[0].passwordResetFlag) ? true : false;
			resp.data.accessToken = jwtUtils.signToken({
				vendorId: rows[0].id
			});

			req.tempId = rows[0].id;
			await VendorLogins.recordLogin(req, resp)
		}
	}
}



//
//	Merge previous upload.
//
var mergeUpload = (req, resp) => {
	return new Promise((resolve, reject) => {
		parseUtils.mergeProducts(req.params.uid)
			.then((r) => {
				if (r.statusCode != 200) {
					resp.statusCode = r.statusCode;
					resp.message = r.message;
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


var queueValidation = (vendorId) => {
	return new Promise((resolve, reject) => {
		var prom = [];
		var vendor = null;

		prom.push(Vendors.getById(vendorId));
		prom.push(Vendors.getWorksheetInfo(vendorId));
		Promise.all(prom)
			.then((result) => {
				if (result[0].length === 0) {
					resolve(404);
				} else {
					vendor = result[0][0];
					if (result[1].length === 0) {
						resolve(405);
					}
					resolve(vendor);
				}
			})
			.catch((e) => {
				reject(e);
			});

	});
}


//
//	Queue up a catalog sheet submitted via base64.  This function stores the file first. 
//
var queueBase64CatalogJob = (resp, submitterId, submitterType, vendorId, base64, originalName, testParseFlag) => {
	return new Promise((resolve, reject) => {
		var buf = Buffer.from(base64, 'base64');
		var fName = "upload/base64_" + new Date().getTime();
		fs.writeFileSync(fName, buf);

		queueValidation(vendorId)
			.then((result) => {
				if ((result === 404) || (result === 405)) {
					resolve(result);
				} else {

					if ((testParseFlag != undefined) && (testParseFlag)) {
						var jobInfo = {
							vendorId: vendorId,
							filePath: fName,
							fileName: originalName,
							format: result.catalogFeedFormat
						}

						parseUtils.processJob(resp, jobInfo, true)
							.then((resp) => {
								resolve(resp)
							})
							.catch((e) => {
								reject(e);
							});
					} else {
						queueCatalogJob(submitterId, submitterType, vendorId, fName, originalName)
							.then((id) => {
								resolve(id);
							})
							.catch((e) => {
								reject(e);
							});
					}
				}
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//
//
var queueCatalogJob = (submitterId, submitterType, vendorId, filePath, fileName) => {
	return new Promise((resolve, reject) => {
		Vendors.createCatalogJob(submitterId, submitterType, vendorId, filePath, fileName)
			.then((id) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//
//
var queueInventoryJob = async (userId, vendorId, uploadId, filePath, fileName) => {
	var id = await Vendors.createInventoryJob(userId, vendorId, uploadId, filePath, fileName);
	return id;
}



//
//	Queue up a catalog sheet submitted via multipart form data.
//
var queueMultipartCatalogJob = (resp, submitterId, submitterType, vendorId, filePath, fileName, testParseFlag) => {
	return new Promise((resolve, reject) => {
		var contentType = mime.lookup(fileName) || 'application/octet-stream';
		var maxUploadMBs = process.env.MAX_UPLOAD_MBS ? process.env.MAX_UPLOAD_MBS : 30;
		var maxUploadSize = maxUploadMBs * 1024 * 1024;
		var stats = fs.statSync(filePath);


		if ((contentType != 'text/csv') && (contentType.indexOf('openxmlformats-officedocument.spreadsheetml.sheet') < 0)) {
			throw new Error('Content type for sheet must be .csv or .xlsx');
		}

		if (stats.size > maxUploadSize) {
			throw new Error('File size exceeds limit of ' + maxUploadMBs + 'MB');
		}

		queueValidation(vendorId)
			.then((result) => {
				if ((result === 404) || (result === 405)) {
					resolve(result);
				} else {

					if ((testParseFlag != undefined) && (testParseFlag)) {
						var jobInfo = {
							vendorId: vendorId,
							filePath: filePath,
							fileName: fileName,
							format: result.catalogFeedFormat
						}

						parseUtils.processJob(resp, jobInfo, true)
							.then((resp) => {
								resolve(resp)
							})
							.catch((e) => {
								reject(e);
							});
					} else {
						queueCatalogJob(submitterId, submitterType, vendorId, filePath, fileName)
							.then((id) => {
								resolve(id);
							})
							.catch((e) => {
								reject(e);
							});
					}
				}
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//	Queue up a Duoplane inventory sheets submitted via multipart form data.
//
var queueMultipartInventoryJob = async (resp, userId, vendorId, filePath, fileName) => {
	var contentType = mime.lookup(fileName) || 'application/octet-stream';
	var extractFolder = process.cwd() + '/' + filePath + '-extract';


	// extract(filePath, {
	// 	dir: extractFolder
	// }, function (err) {
	// 	if (err !== undefined) {
	// 		throw (err);
	// 	}
	// });



	if ((contentType != 'text/csv') &&
		(contentType.indexOf('openxmlformats-officedocument.spreadsheetml.sheet') < 0) &&
		(contentType != 'application/zip')) {
		throw new Error('Content type for sheet must be .csv or .xlsx');
	}

	var result = await queueValidation(vendorId);
	if (result === 404) {
		return result;
	} else {
		var id = await queueInventoryJob(userId, vendorId, filePath.substring(7), filePath, fileName);
		return id;
	}
}



//
//	Change Password
//
var changePassword = async (req, resp) => {
	var vendor = null;
	var whereInfo = {
		clause: "",
		values: []
	};

	whereInfo = sqlUtils.appendWhere(whereInfo, "verification_id = ?", req.body.verificationId);

	var result = await Vendors.getAll(whereInfo, 0, 1);
	if (result.vendors.length === 0) {
		resp = formatResp(resp, undefined, 404, memberText.get("CHANGE_PSWD_ID_NOT_FOUND"));
		return resp;
	} else {
		vendor = result.vendors[0];

		result = await Vendors.updateById(vendor.id, {
			password: req.body.password,
			passwordResetFlag: true,
			verificationId: null
		}, vendor);

		//
		//	We've just updated the password successfully and now we're going to "login" the member.
		//
		if (resp.data === undefined) {
			resp.data = {};
		}
		resp.data.accessToken = jwtUtils.signToken({
			vendorId: vendor.id
		});

		req.tempId = vendor.id;
		await VendorLogins.recordLogin(req, resp)

		return resp;
	}
}






//
//	Vendor reset password
//
var resetPassword = async (req, resp) => {
	var rows = await Vendors.getByEmail(req.body.email, true);
	if (rows.length > 0) {
		var id = rows[0].id;
		var vid = uuidv1();
		var vendor = rows[0];

		//
		//	Only set an ID if there isn't one already.
		//
		if ((vendor.verificationId === null) || (vendor.verificationId.trim().length === 0)) {
			vendor.verificationId = vid;
		}

		//
		//	If password is null send special message for the one-time switch from shopify to rushmarket.com.
		//
		comms.sendRRCResetEmail(vendor);
		await Vendors.updateVerificationIdById(id, vendor.verificationId);
	} else {
		resp = formatResp(resp, undefined, 404, "Email not found.");
	}
}


//
//	Vendor delete
//
var remove = (req, resp) => {
	return new Promise((resolve, reject) => {

		Vendors.delById(req.params.id)
			.then((rows) => {
				if ((rows === undefined) || (rows.affectedRows === 0)) {
					resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//	Update vendor
//
var update = async (req, resp) => {
	var prom = [];

	//	If manifestId is already set, don't overwrite it.
	var v = await Vendors.getById(req.params.id);
	if ((v.length > 0) && (v[0].manifestId !== undefined) && (v[0].manifestId !== null) && (v[0].manifestId.length > 0)) {
		delete req.body.manifestId;
	}

	//	If supplierCodePrefix is specified, make sure no other vendor is using that prefix.
	if (req.body.supplierCodePrefix && req.body.supplierCodePrefix !== null) {
		var p = await Vendors.getBySupplierCodePrefix(req.body.supplierCodePrefix);
		if ((p.length > 0) && (p[0].id !== req.params.id)) {
			resp = formatResp(resp, undefined, 400, 'Supplier code prefix already in use by another vendor.');
			return resp;
		}
	}

	var validationErrors = await validateVendor(req, false);
	if (validationErrors.errorDetails.length > 0) {
		resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
		return resp;
	} else {

		if ((req.body.rushMarketAvailability !== undefined) && (req.body.rushMarketAvailability != v[0].rushMarketAvailability)) {
			req.body.updatingRushMarketAvailability = true;
		}

		if (req.body.name != undefined) {
			v = await Vendors.getByName(req.body.name);
			if ((v.length > 0) && (v[0].id != req.params.id)) {
				resp = formatResp(resp, undefined, 409, memberText.get("VENDOR_COLL"));
				return resp;
			}
		}

		try {
			var rows = await Vendors.updateById(req.params.id, req.body, req.params.internalFlag);
			if ((rows === undefined) || (rows.affectedRows === 0)) {
				resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
			}
			return resp;
		} catch (e) {
			if (e.message === 'Error: PTYPE') {
				resp = formatResp(resp, undefined, 404, "Invalid partner type.");
				return resp;
			} else {
				throw (e);
			}
		}
	}
}



//
//	Update vendor column mapping 
//
var updateColumnMapping = (req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		Vendors.updateColumnMappingById(req.params.id, req.params.mid, req.body)
			.then((rows) => {
				if ((rows === undefined) || (rows.affectedRows === 0)) {
					resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//	Update vendor column label mapping 
//
var updateColumnLabelMapping = (req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		Vendors.updateColumnLabelMappingById(req.params.id, req.params.mid, req.body)
			.then((rows) => {
				if ((rows === undefined) || (rows.affectedRows === 0)) {
					resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//	Update vendor inventory worksheet info
//
var updateInventoryWorksheetInfo = (req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		Vendors.updateInventoryWorksheetInfoById(req.params.id, req.params.mid, req.body.vendorSkuColumn, req.body.quantityColumn)
			.then((rows) => {
				if ((rows === undefined) || (rows.affectedRows === 0)) {
					resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//	Delete product
//
var deleteProduct = async (req, resp) => {
	var prom = [];

	//	Ensure product exists.
	var existingProductResult = await Vendors.getProductById(req.params.id, req.params.pid);
	if (existingProductResult.length === 0) {
		resp = formatResp(resp, undefined, 404, 'Product not found.');
		return resp;
	}

	var user = await Users.getById(req.query.submitterId);
	if (user.length === 0) {
		resp = formatResp(resp, undefined, 404, 'User not found.');
		return resp;
	}


	//	Verify there isn't a live corelink sku related to this VC record.
	var corelinkProduct = await RushProducts.getLiveProductByVendorSku(existingProductResult[0].vendorId, existingProductResult[0].vendorSku);
	if (corelinkProduct.length > 0) {
		resp = formatResp(resp, undefined, 409, 'Corelink product exists.');
		return resp;
	}


	var coinManuMPN = await Coins.getByManufacturerMPN(existingProductResult[0].manufacturer, existingProductResult[0].mpn)
	var coinUPC = await Coins.getByUPC(existingProductResult[0].upc);
	var coinVSku = await Coins.getByVendorSku(existingProductResult[0].vendorId, existingProductResult[0].vendorSku);

	var coin = null;

	//	Save off the coin.
	if (coinVSku.length > 0) {
		coin = coinVSku[0].coinId;
	} else if (coinUPC.length > 0) {
		coin = coinUPC[0].coinId;
	} else if (coinManuMPN.length > 0) {
		coin = coinManuMPN[0].coinId;
	}


	//	Delete from vendor catalog products.
	await Vendors.deleteProductById(req.params.pid);

	await Vendors.logDeletedProduct(existingProductResult[0].variantSku, existingProductResult[0].vendorSku, existingProductResult[0].upc, existingProductResult[0].mpn, coin,
		existingProductResult[0].vendorName, user[0].userName);


	//	Delete references in coin tables where it will not disturb coin mapping for another product.
	if (coin !== null) {
		await Coins.deleteByProductReference(coin, existingProductResult[0].vendorId, existingProductResult[0].vendorSku, existingProductResult[0].upc, existingProductResult[0].manufacturer, existingProductResult[0].mpn);
	}

	return resp;
}




//
//	Update product
//
var updateProduct = async (req, resp) => {
	var prom = [];

	// Remove fields that should not be updated.
	delete req.body.dateCreated;
	delete req.body.coreEligibilityErrors;
	delete req.body.eligibleForTrm;
	delete req.body.trmEligibilityErrors;
	delete req.body.eligibleForNiche;
	delete req.body.nicheEligibilityErrors;
	delete req.body.validationErrors;
	delete req.body.eligibleFor3rdParty;


	//	Ensure product exists.
	var existingProductResult = await Vendors.getProductById(req.params.id, req.params.pid);
	if (existingProductResult.length === 0) {
		resp = formatResp(resp, undefined, 404, 'Product not found.');
		return resp;
	}

	var existingProduct = existingProductResult[0];

	var updateInfo = await orchestrateUpdate(existingProduct, req.body);

	if ((updateInfo.validationErrors != undefined) && (updateInfo.validationErrors.errorDetails.length > 0)) {
		resp = formatResp(resp, undefined, 400, updateInfo.validationErrors.message, updateInfo.validationErrors.errorDetails);
		delete resp.data;
		return resp;
	}

	//	Figure if there is any ramification on COIN.
	var coin = await coinActions.updateCheck(existingProduct, updateInfo.product, resp);

	var result = await Vendors.updateProductById(req.params.id, req.params.pid, updateInfo.product);
	if ((result === undefined) || (result.affectedRows === 0)) {
		resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
	} else {

		//	If the dropship inventory went from > 0 to 0, log it.
		if ((existingProduct.dropshipInventory !== undefined) && (updateInfo.newProduct.dropshipInventory !== undefined) &&
			(existingProduct.dropshipInventory > 0) && (updateInfo.newProduct.dropshipInventory === 0)) {
			Vendors.logDropshipOOS(req.params.id, existingProduct.vendorSku);
		}

		//	Log changes to audit log and who made the change.
		if (req.decoded !== undefined) {
			if (req.decoded.userId !== undefined) {
				logChanges(req.decoded.userId, 'USER', req.params.pid, existingProduct, updateInfo);
			} else if (req.decoded.vendorId !== undefined) {
				logChanges(req.decoded.vendorId, 'VENDOR', req.params.pid, existingProduct, updateInfo);
			}
		}

		//	If GDE-related data points are updated, queue up GDE and VC-GDE recalc.
		await updateGDECheck(existingProduct, updateInfo.newProduct, req);

		resp.data.products = updateInfo.product;
		if (coin.coinId !== undefined) {
			resp.data.products.coinId = coin.coinId;
		}
		return resp;
	}
}



var updateGDECheck = async (existingProduct, newProduct, req) => {
	var gdeUpdateFlag = false;
	var userId = 0;
	var userType = 'INTERNAL';
	var vcgdeUpdateFlag = false;
	var resp = {
		statusCode: 200,
		message: "Success.",
	}

	try {
		let user = userUtils.getUserIdAndType(req);
		userId = user.userId;
		userType = user.userType;
	}
	catch (e) {
		// console.log(e);
	}

	if ((newProduct.msrp !== undefined) && (newProduct.msrp !== existingProduct.msrp)) {
		vcgdeUpdateFlag = true;
		gdeUpdateFlag = true;
	}

	if ((newProduct.partnerSellingPrice !== undefined) && (newProduct.partnerSellingPrice !== existingProduct.partnerSellingPrice)) {
		vcgdeUpdateFlag = true;
		gdeUpdateFlag = true;
	}

	if ((newProduct.shipToMarketPrice !== undefined) && (newProduct.shipToMarketPrice !== existingProduct.shipToMarketPrice)) {
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.productCost !== undefined) && (newProduct.productCost !== existingProduct.productCost)) {
		vcgdeUpdateFlag = true;


		//	Per RM-3165 if we're updating DS product cost in VC, update corresponding "single rush sku" cost as well and queue for GDE recalc.
		var dsSkuFound = await updateDSRushSkuCost(existingProduct.vendorId, existingProduct.vendorSku, newProduct.productCost);
		if (dsSkuFound) {
			gdeUpdateFlag = true;
		}

		//	Per RM-3175 if vendor is a COST_BASED vendor and sku is on an RBR manifest, update cost in products table also.
		var rbrSkuFound = await updateCostBasedRBRRushSkuCost(existingProduct.vendorId, existingProduct.vendorSku, newProduct.productCost);
		if (rbrSkuFound) {
			gdeUpdateFlag = true;
		}
	}

	if ((newProduct.productWeight !== undefined) && (newProduct.productWeight !== existingProduct.productWeight)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.productHeight !== undefined) && (newProduct.productHeight !== existingProduct.productHeight)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.productWidth !== undefined) && (newProduct.productWidth !== existingProduct.productWidth)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.productDepth !== undefined) && (newProduct.productDepth !== existingProduct.productDepth)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.numberOfBoxes !== undefined) && (newProduct.numberOfBoxes !== existingProduct.numberOfBoxes)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageHeight1 !== undefined) && (newProduct.packageHeight1 !== existingProduct.packageHeight1)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth1 !== undefined) && (newProduct.packageWidth1 !== existingProduct.packageWidth1)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength1 !== undefined) && (newProduct.packageLength1 !== existingProduct.packageLength1)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight1 !== undefined) && (newProduct.shippingWeight1 !== existingProduct.shippingWeight1)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight2 !== undefined) && (newProduct.packageHeight2 !== existingProduct.packageHeight2)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth2 !== undefined) && (newProduct.packageWidth2 !== existingProduct.packageWidth2)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength2 !== undefined) && (newProduct.packageLength2 !== existingProduct.packageLength2)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight2 !== undefined) && (newProduct.shippingWeight2 !== existingProduct.shippingWeight2)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight3 !== undefined) && (newProduct.packageHeight3 !== existingProduct.packageHeight3)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth3 !== undefined) && (newProduct.packageWidth3 !== existingProduct.packageWidth3)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength3 !== undefined) && (newProduct.packageLength3 !== existingProduct.packageLength3)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight3 !== undefined) && (newProduct.shippingWeight3 !== existingProduct.shippingWeight3)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight4 !== undefined) && (newProduct.packageHeight4 !== existingProduct.packageHeight4)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth4 !== undefined) && (newProduct.packageWidth4 !== existingProduct.packageWidth4)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength4 !== undefined) && (newProduct.packageLength4 !== existingProduct.packageLength4)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight4 !== undefined) && (newProduct.shippingWeight4 !== existingProduct.shippingWeight4)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight5 !== undefined) && (newProduct.packageHeight5 !== existingProduct.packageHeight5)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth5 !== undefined) && (newProduct.packageWidth5 !== existingProduct.packageWidth5)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength5 !== undefined) && (newProduct.packageLength5 !== existingProduct.packageLength5)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight5 !== undefined) && (newProduct.shippingWeight5 !== existingProduct.shippingWeight5)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight6 !== undefined) && (newProduct.packageHeight6 !== existingProduct.packageHeight6)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth6 !== undefined) && (newProduct.packageWidth6 !== existingProduct.packageWidth6)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength7 !== undefined) && (newProduct.packageLength7 !== existingProduct.packageLength7)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight7 !== undefined) && (newProduct.shippingWeight7 !== existingProduct.shippingWeight7)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight8 !== undefined) && (newProduct.packageHeight8 !== existingProduct.packageHeight8)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth8 !== undefined) && (newProduct.packageWidth8 !== existingProduct.packageWidth8)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength8 !== undefined) && (newProduct.packageLength8 !== existingProduct.packageLength8)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight8 !== undefined) && (newProduct.shippingWeight8 !== existingProduct.shippingWeight8)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight9 !== undefined) && (newProduct.packageHeight9 !== existingProduct.packageHeight9)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth9 !== undefined) && (newProduct.packageWidth9 !== existingProduct.packageWidth9)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength9 !== undefined) && (newProduct.packageLength9 !== existingProduct.packageLength9)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight9 !== undefined) && (newProduct.shippingWeight9 !== existingProduct.shippingWeight9)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight10 !== undefined) && (newProduct.packageHeight10 !== existingProduct.packageHeight10)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth10 !== undefined) && (newProduct.packageWidth10 !== existingProduct.packageWidth10)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength10 !== undefined) && (newProduct.packageLength10 !== existingProduct.packageLength10)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight10 !== undefined) && (newProduct.shippingWeight10 !== existingProduct.shippingWeight10)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight11 !== undefined) && (newProduct.packageHeight11 !== existingProduct.packageHeight11)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth11 !== undefined) && (newProduct.packageWidth11 !== existingProduct.packageWidth11)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength11 !== undefined) && (newProduct.packageLength11 !== existingProduct.packageLength11)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight11 !== undefined) && (newProduct.shippingWeight11 !== existingProduct.shippingWeight11)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight12 !== undefined) && (newProduct.packageHeight12 !== existingProduct.packageHeight12)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth12 !== undefined) && (newProduct.packageWidth12 !== existingProduct.packageWidth12)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength12 !== undefined) && (newProduct.packageLength12 !== existingProduct.packageLength12)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight12 !== undefined) && (newProduct.shippingWeight12 !== existingProduct.shippingWeight12)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight13 !== undefined) && (newProduct.packageHeight13 !== existingProduct.packageHeight13)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth13 !== undefined) && (newProduct.packageWidth13 !== existingProduct.packageWidth13)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength13 !== undefined) && (newProduct.packageLength13 !== existingProduct.packageLength13)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight13 !== undefined) && (newProduct.shippingWeight13 !== existingProduct.shippingWeight13)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight14 !== undefined) && (newProduct.packageHeight14 !== existingProduct.packageHeight14)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth14 !== undefined) && (newProduct.packageWidth14 !== existingProduct.packageWidth14)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength14 !== undefined) && (newProduct.packageLength14 !== existingProduct.packageLength14)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight14 !== undefined) && (newProduct.shippingWeight14 !== existingProduct.shippingWeight14)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight15 !== undefined) && (newProduct.packageHeight15 !== existingProduct.packageHeight15)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth15 !== undefined) && (newProduct.packageWidth15 !== existingProduct.packageWidth15)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength15 !== undefined) && (newProduct.packageLength15 !== existingProduct.packageLength15)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight15 !== undefined) && (newProduct.shippingWeight15 !== existingProduct.shippingWeight15)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight16 !== undefined) && (newProduct.packageHeight16 !== existingProduct.packageHeight16)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth16 !== undefined) && (newProduct.packageWidth16 !== existingProduct.packageWidth16)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength16 !== undefined) && (newProduct.packageLength16 !== existingProduct.packageLength16)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight16 !== undefined) && (newProduct.shippingWeight16 !== existingProduct.shippingWeight16)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight17 !== undefined) && (newProduct.packageHeight17 !== existingProduct.packageHeight17)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth17 !== undefined) && (newProduct.packageWidth17 !== existingProduct.packageWidth17)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength17 !== undefined) && (newProduct.packageLength17 !== existingProduct.packageLength17)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight17 !== undefined) && (newProduct.shippingWeight17 !== existingProduct.shippingWeight17)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight18 !== undefined) && (newProduct.packageHeight18 !== existingProduct.packageHeight18)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth18 !== undefined) && (newProduct.packageWidth18 !== existingProduct.packageWidth18)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength18 !== undefined) && (newProduct.packageLength18 !== existingProduct.packageLength18)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight18 !== undefined) && (newProduct.shippingWeight18 !== existingProduct.shippingWeight18)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight19 !== undefined) && (newProduct.packageHeight19 !== existingProduct.packageHeight19)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth19 !== undefined) && (newProduct.packageWidth19 !== existingProduct.packageWidth19)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength19 !== undefined) && (newProduct.packageLength19 !== existingProduct.packageLength19)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight19 !== undefined) && (newProduct.shippingWeight19 !== existingProduct.shippingWeight19)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}

	if ((newProduct.packageHeight20 !== undefined) && (newProduct.packageHeight20 !== existingProduct.packageHeight20)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageWidth20 !== undefined) && (newProduct.packageWidth20 !== existingProduct.packageWidth20)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.packageLength20 !== undefined) && (newProduct.packageLength20 !== existingProduct.packageLength20)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}
	if ((newProduct.shippingWeight20 !== undefined) && (newProduct.shippingWeight20 !== existingProduct.shippingWeight20)) {
		gdeUpdateFlag = true;
		vcgdeUpdateFlag = true;
	}


	if (vcgdeUpdateFlag) {
		resp = await vcGDE.queueShipCalcBySku({
			vendorId: existingProduct.vendorId,
			vendorSku: existingProduct.vendorSku,
			metros: null,
			batchLabel: `VC Update`
		}, resp);
	}


	if (gdeUpdateFlag) {
		await gde.queueGDERecalc(existingProduct.vendorId, existingProduct.vendorSku, `VC Update ${existingProduct.vendorSku}`, userId, userType);
	}
}


var updateDSRushSkuCost = async (vendorId, vendorSku, productCost) => {
	var dsSkuFound = false;

	//	Look to see if there's a dropship rush sku for this vendor sku
	var rows = await RushProducts.getDropshipByVendorSku(vendorId, vendorSku)
	if (rows.length > 0) {
		if (rows[0].dropshipType === 'UNLIMITED') {
			await RushProducts.updateSkuCost(rows[0].sku, productCost);
			dsSkuFound = true;
		}
		//	If limited queue it for GDE and the repricing logic will capture the new cost.
		else if (rows[0].dropshipType === 'LIMITED') {
			dsSkuFound = true;
		}
	}

	return dsSkuFound;
}




var updateCostBasedRBRRushSkuCost = async (vendorId, vendorSku, productCost) => {
	var rbrSkuFound = false;

	//	Check to see if this vendor is COST_BASED
	var rows = await Vendors.getById(vendorId);
	if ((rows.length > 0) && (rows[0].partnerContractType === 'COST_BASED')) {

		//	See if there are live RBR skus for this vendor
		rows = await RushProducts.getRBRSkuCostByVendorSku(vendorId, vendorSku);

		for (var i=0; i < rows.length; i++) {

			//	Get the cost based rule if there is one.  This could be done more optimally...
			var rule = await ProductCostRules.getSpecific(vendorId, rows[i].conditionName);
			if (rule.length > 0) {
				var c = null;
				if (rule[0].costBase === 'cost') {
					c = (productCost * (rule[0].conditionValue / 100));
				}

				if (c !== null) {
					await RushProducts.updateSkuCost(rows[i].sku, c);
					rbrSkuFound = true;	
				}
			}
		}
	}

	return rbrSkuFound;
}




//
//	Update vendor worksheet info 
//
var updateWorksheetInfo = (req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		Vendors.updateWorksheetInfo(req.params.id, req.body)
			.then((rows) => {
				if ((rows === undefined) || (rows.affectedRows === 0)) {
					resp = formatResp(resp, undefined, 404, memberText.get("VENDOR_404"));
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	Vendor import.
//
var vendorImport = (req, resp) => {
	return new Promise((resolve, reject) => {
		var fileName = req.files[0].originalname;
		var contentType = mime.lookup(fileName) || 'application/octet-stream';


		if (contentType != 'text/csv') {
			throw new Error('Content type for sheet must be .csv or .xlsx');
		}

		parseUtils.vendorImport(req.files[0].path, fileName, resp)
			.then((resp) => {
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//	Fulfill
//
var fulfill = async (req, resp) => {

	//	Validate columns 
	var info = validateColumns(req, resp);
	if (resp.statusCode !== 200) {
		return;
	}

	//	Validate order number for this vendor.
	var orderLineItems = await RushOrders.checkOrderBySourceOrderName(req.body.orderId, req.params.id, req.body.vendorSku);
	if (orderLineItems.length === 0) {
		resp = formatResp(resp, undefined, 404, "This order number not recognized.");
		return;
	}


	//	Validate vendor sku for this vendor.
	if (req.body.vendorSku !== undefined) {
		var orderLineItems = await RushOrders.checkVSkuBySourceOrderName(req.body.orderId, req.params.id, req.body.vendorSku);
		if (orderLineItems.length === 0) {
			resp = formatResp(resp, undefined, 404, "This vendor sku wasn't found on this order.");
			return;
		}
	}



	// //	Verify there are order lines for this order/vendor/vendor_sku.  At this point due to previous checking, this should always return something.
	// var orderLineItems = await RushOrders.getBySourceOrderName(req.body.orderId, req.params.id, req.body.vendorSku);
	// if (orderLineItems.length === 0) {
	// 	if (req.body.vendorSku !== undefined) {
	// 		resp = formatResp(resp, undefined, 404, "This vendor sku was already fulfilled.");
	// 	} else {
	// 		resp = formatResp(resp, undefined, 404, "This order was already fulfilled.");
	// 	}
	// 	return;
	// }


	//	If at least tracking is supplied, create fulfillment and capture data provided.
	if (!info.trackingMissing) {

		//	If invoice already processed, ignore....?
		var check = await Vendors.checkForTracking(req.body.orderId, req.params.id, req.body.vendorSku, req.body.tracking);
		if ((check.length > 0) && (info.invoiceMissing)) {
			if (req.body.vendorSku !== undefined) {
				resp = formatResp(resp, undefined, 404, "This vendor sku was already fulfilled.");
			} else {
				resp = formatResp(resp, undefined, 404, "This order was already fulfilled.");
			}
			return;
		} else if (check.length === 0) {
			var orderLineItems = await RushOrders.getBySourceOrderName(req.body.orderId, req.params.id, req.body.vendorSku);
			await createShopifyFulfillment(info, orderLineItems, req, resp);
		}
	}

	//	If invoice but not tracking is supplied, tracking must have been supplied already.  If it is, capture invoice.
	if (!info.invoiceMissing) {
		var check = await Vendors.checkForTracking(req.body.orderId, req.params.id, req.body.vendorSku, req.body.tracking);
		if (check.length === 0) {
			if (req.body.vendorSku !== undefined) {
				resp = formatResp(resp, undefined, 404, "Invoice number must be supplied after or with tracking for this vendor sku.");
			} else {
				resp = formatResp(resp, undefined, 404, "Invoice number must be supplied after or with tracking for this order.");
			}
			return;
		} else {
			//	Make sure we don't already have an invoice number on this order.
			var check = await Vendors.checkForInvoice(req.body.orderId, req.params.id);
			if (check[0].num > 0) {
				resp = formatResp(resp, undefined, 404, "Invoice number already provided - please email vendorsupport@rushmarket.com if you wish to change the existing invoice number.");
				return;
			}

			//	Save the invoice number.
			await Vendors.captureVendorInvoice(req.body.orderId, req.params.id, req.body.invoiceNumber);
		}
	}



}


var validateColumns = (req, resp) => {
	var info = {
		invoiceMissing: false,
		missing: '',
		orderMissing: false,
		trackingMissing: false,
		vendorSkuMissing: false
	}




	if ((req.body.orderId === undefined) || (req.body.orderId === null) || (req.body.orderId === '')) {
		if (info.missing.length > 0) {
			info.missing += ', ';
		}
		info.missing += 'order_id';
		info.orderMissing = true;
	}
	if ((req.body.invoiceNumber === undefined) || (req.body.invoiceNumber === null) || (req.body.invoiceNumber === '')) {
		if (info.missing.length > 0) {
			info.missing += ', ';
		}
		info.missing += 'invoice_number';
		info.invoiceMissing = true;
	}
	if ((req.body.tracking === undefined) || (req.body.tracking === null) || (req.body.tracking === '')) {
		if (info.missing.length > 0) {
			info.missing += ', ';
		}
		info.missing += 'tracking';
		info.trackingMissing = true;
	}

	if (info.orderMissing) {
		resp = formatResp(resp, undefined, 400, memberText.get("INVOICE_MISSING_REQUIRED").replace('%required%', info.missing));
		return info;
	} else if (info.invoiceMissing && info.trackingMissing) {
		resp = formatResp(resp, undefined, 400, memberText.get("INVOICE_MISSING_REQUIRED").replace('%required%', 'invoice_number or tracking or both'));
		return info;
	}

	if ((req.body.tracking === undefined) || (req.body.tracking === null) || (req.body.tracking === '')) {
		if (info.missing.length > 0) {
			info.missing += ', ';
		}
		info.missing += 'tracking';
		info.trackingMissing = true;
	}


	if ((req.body.vendorSku === undefined) || (req.body.vendorSku === null) || (req.body.vendorSku === '')) {
		info.vendrSkuMissing = true;
	}


	return info;
}


var createShopifyFulfillment = async (info, vendorLineItems, req, resp) => {
	var si = shopifyUtils.getCityInfoByCity("Omaha");
	var updateFulfillId = null;
	var updateLine = null;
	var updateTracking = null;
	var updateTrackingUrl = null;

	// console.log('VendorLineItems: ' + JSON.stringify(vendorLineItems, undefined, 2));
	//	Look up order and variant information for each sku.
	var lineItems = [];
	var shopifyInventoryItemIds = '';

	for (var i = 0; i < vendorLineItems.length; i++) {
		lineItems.push({
			id: vendorLineItems[i].sourceLineId
		});
		if (shopifyInventoryItemIds.length > 0) {
			shopifyInventoryItemIds += ',';
		}
		shopifyInventoryItemIds += vendorLineItems[i].shopifyInventoryItemId;
	}


	if (lineItems.length === 0) {
		formatResp(resp, ["data"], 404, 'Order line items not found.');
		return resp;
	}


	var params = {
		inventory_item_ids: shopifyInventoryItemIds
	}

	//	Create the fulfillment.
	params = {
		location_id: vendorLineItems[0].shopifyLocationId,
		line_items: lineItems
	};

	if (!info.trackingMissing) {
		params.tracking_number = req.body.tracking;
	}
	if ((req.body.trackingUrl !== undefined) && (req.body.trackingUrl !== null)) {
		params.tracking_url = req.body.trackingUrl;
	}
	if ((req.body.carrier !== undefined) && (req.body.carrier !== null)) {
		params.tracking_company = req.body.carrier;
	}

	//	Store row data.
	for (var i = 0; i < vendorLineItems.length; i++) {
		await Vendors.captureTracking(req.body.orderId, req.params.id, req.body.vendorSku, req.body.tracking, vendorLineItems[i].sourceLineId);
	}

	var list = await si.shopify.fulfillment.list(vendorLineItems[0].sourceOrderId);
	// console.log("lineItems: " + JSON.stringify(lineItems, undefined, 2));
	// console.log("FULFILLMENTS: " + JSON.stringify(list, undefined, 2));
	for (var i = 0; i < list.length; i++) {
		for (var j = 0; j < list[i].line_items.length; j++) {
			for (var k = 0; k < lineItems.length; k++) {
				// console.log(`\n\n ${list[i].line_items[j].id} ${lineItems[k].id}`)
				if (list[i].line_items[j].id === parseInt(lineItems[k].id)) {
					// console.log(`Line item ${list[i].line_items[j].id} variant: ${list[i].line_items[j].variant_id} already fulfilled ${list[i].tracking_number}`)
					updateLine = list[i].line_items[j].id;
					updateTracking = list[i].tracking_number;
					// console.log(`URL: ${list[i].tracking_url} old: ${list[i].tracking_number.toString()} new: ${req.body.tracking}`)
					updateTrackingUrl = list[i].tracking_url.replace(list[i].tracking_number.toString(), req.body.tracking)
					updateFulfillId = list[i].id;
				}
			}
		}
	}

	try {
		var result = null;

		// console.log("fulfillment: " + vendorLineItems[0].sourceOrderId + " " + JSON.stringify(params, undefined, 2));
		if (updateLine !== null) {
			result = si.shopify.fulfillment.update(vendorLineItems[0].sourceOrderId, updateFulfillId, {
				tracking_number: req.body.tracking,
				tracking_url: updateTrackingUrl
			})
		} else {
			result = await si.shopify.fulfillment.create(vendorLineItems[0].sourceOrderId, params);
		}
		// console.log("fulfillment result: " + JSON.stringify(result, undefined, 2));



	} catch (e) {
		logUtils.log({
			severity: 'ERROR',
			type: 'VENDOR_FULFILL',
			message: "Params: " + JSON.stringify(params, undefined, 2),
			stackTrace: new Error().stack
		})

		if ((e.message !== undefined) && (e.message.indexOf("422") === -1)) {
			logUtils.log({
				severity: 'ERROR',
				type: 'VENDOR_FULFILL',
				message: "Non-422: " + e.message,
				stackTrace: new Error().stack
			})
			// resp.statusCode = 500;
			// resp.message = "Something unexpected happened - " + e.message;

			// console.log("Fulfillment: " + e.message);

			if ((e.response !== undefined) && (e.response.body !== undefined) && (e.response.body.errors !== undefined)) {
				logUtils.log({
					severity: 'ERROR',
					type: 'VENDOR_FULFILL',
					message: "Specific errors: " + JSON.stringify(e.response.body.errors),
					stackTrace: new Error().stack
				})
				// console.log("Specific errors: " + JSON.stringify(e.response.body.errors));
			}
		} else if (e.message.indexOf("422") > 0) {
			if ((e.response !== undefined) && (e.response.body !== undefined) && (e.response.body.errors !== undefined)) {
				logUtils.log({
					severity: 'ERROR',
					type: 'VENDOR_FULFILL',
					message: "422 Specific errors: " + JSON.stringify(e.response.body.errors),
					stackTrace: new Error().stack
				})
				// console.log("Specific errors: " + JSON.stringify(e.response.body.errors));
			}

			// resp.statusCode = 409;
			// resp.message = "SKU(s) already fulfilled.";
		} else {
			logUtils.log({
				severity: 'ERROR',
				type: 'VENDOR_FULFILL',
				message: "General Exception: " + e,
				stackTrace: new Error().stack
			})

		}
	}

	return resp;
}



var processInvoiceAndShippedEmail = async (req, resp) => {
	var vendorOrdersEmail = configUtils.get("VENDOR_ORDERS_EMAIL") ? configUtils.get("VENDOR_ORDERS_EMAIL") : "vendororders-test@rushrecommerce.com"

	const JWT = google.auth.JWT;
	const auth = new JWT({
		email: process.env.EMAIL_SERVICE_ACCOUNT_EMAIL,
		key: process.env.EMAIL_SERVICE_ACCOUNT_KEY,
		scopes: SCOPES,
		subject: vendorOrdersEmail
	});

	await auth.authorize();

	processMessages(auth);
}



//
//	Lists the labels in the user's account.
//
//	@param {google.auth.OAuth2} auth An authorized OAuth2 client.
//
var listLabels = async (auth) => {
	const gmail = google.gmail({
		version: 'v1',
		auth
	});
	var result = await gmail.users.labels.list({
		userId: 'me',
	});

	const labels = result.data.labels;
	if (labels.length) {
		console.log('Labels:');
		labels.forEach((label) => {
			console.log(`- ${label.name}`);
		});
	} else {
		console.log('No labels found.');
	}
}


//	Process contents of the inbox.
var processMessages = async (auth) => {
	const gmail = google.gmail({
		version: 'v1',
		auth
	});
	var result = await gmail.users.messages.list({
		userId: 'me',
		q: 'in:inbox'
	});

	var msgs = result.data.messages;
	if ((msgs) && (msgs.length)) {
		for (var i = 0; i < msgs.length; i++) {
			await getMessage(msgs[i].id, auth);
		};
	}
}


var getMessage = async (msgId, auth) => {
	var inboxFlag = false;
	var starredFlag = false;

	console.log(`Get message ${msgId}`);

	const gmail = google.gmail({
		version: 'v1',
		auth
	});

	var msg = await gmail.users.messages.get({
		userId: 'me',
		id: msgId,
	});

	//	Only interested in messages in the inbox.
	// if (_.findIndex(msg.data.labelIds, function (l) {
	// 		return l === 'INBOX';
	// 	}) >= 0) {
	// 	inboxFlag = true;
	// }

	//	Only interested in messages not starred.  Starred means we've already processed them.
	// if (_.findIndex(msg.data.labelIds, function (l) {
	// 		return l === 'STARRED';
	// 	}) >= 0) {
	// 	starredFlag = true;
	// }


	//	Process message if unstarred in the inbox.
	if ((msg) && (msg.status === 200)) {
		var info = await processMessage(msg);

		console.log(`File: ${info.filename}`);
		//	If a probable attachment is found, process it.
		if (info.filename !== null) {
			// console.log(`Probable attachment: ${info.from} ${info.filename}`);

			//	Validate sender email is a vendor email.
			var vendors = await Vendors.getByAnyEmail(info.from);
			if (vendors.length > 0) {
				info.vendorId = vendors[0].id;
				var result = await processAttachment(gmail, msgId, msg, info);

				const messages = [
					`From: <${process.env.VENDOR_TRACKING_INBOX}>`,
					'To: ' + info.from,
					'References: ' + info.messageId,
					'In-Reply-To: ' + info.messageId,
					'Content-Type: text/html; charset=utf-8',
					'MIME-Version: 1.0',
					'Subject: Re: ' + info.subject,
					'',
					info.responseEmail,
					'',
				];
				const message = messages.join('\n');
				const encodedMessage = Buffer.from(message)
					.toString('base64')
					.replace(/\+/g, '-')
					.replace(/\//g, '_')
					.replace(/=+$/, '');
				result = await gmail.users.messages.send({
					auth: auth,
					userId: 'me',
					resource: {
						raw: encodedMessage,
						threadId: msg.threadId
					}
				});

				console.log('here');
			}
		}
	}


	//	Mark the message as processed by deleting it.
	// var result = await gmail.users.messages.delete({
	// 	userId: 'me',
	// 	id: msgId
	// })

	//	Mark the message as processed by moving it to Trash folder without permanently deleting it.
	var result = await gmail.users.messages.modify({
		userId: 'me',
		id: msgId,
		requestBody: {
			addLabelIds: ['TRASH']
		}
	})
}



var processMessage = async (msg) => {
	console.log(`Process message`)
	var info = {
		attachmentId: null,
		from: null,
		filename: null,
		processFlag: false
	}


	//	Extract from, message ID and subject out of the payload headers.
	for (var i = 0; i < msg.data.payload.headers.length; i++) {
		if (msg.data.payload.headers[i].name === 'From') {
			info.from = eaddr.parseFrom(msg.data.payload.headers[i].value);
			if (info.from && info.from[0].address) {
				info.from = info.from[0].address;
			}
		}
		if (msg.data.payload.headers[i].name === 'Message-ID') {
			info.messageId = msg.data.payload.headers[i].value;
		}
		if (msg.data.payload.headers[i].name === 'Subject') {
			info.subject = msg.data.payload.headers[i].value;
		}
	}

	//	Look for an attachment that's a spreadsheet.  If found, capture the filename and attachmentId.
	for (var i = 0; i < msg.data.payload.parts.length; i++) {
		console.log(`Payload MIME type: ${msg.data.payload.parts[i].mimeType}`)
		if ((msg.data.payload.parts[i].mimeType.indexOf('spreadsheet') >= 0) ||
			(msg.data.payload.parts[i].mimeType.indexOf('excel') >= 0) ||
			(msg.data.payload.parts[i].mimeType.indexOf('csv') >= 0)) {
			console.log(`Payload Info: ${JSON.stringify(msg.data.payload.parts[i], undefined, 2)}`)
			info.filename = msg.data.payload.parts[i].filename;
		}
		info.attachmentId = msg.data.payload.parts[i].body.attachmentId;
	}

	return info;
}



var processAttachment = async (gmail, msgId, msg, info) => {
	console.log(`Processing attachment`);
	var decodedSheet = null;
	var errors = '';
	var responseEmail = '<html><head></head><body>Results of processing invoices and tracking:<br><br>';
	var inputWorkbook = new excel.Workbook();
	var inputWorksheet = null;
	var orderNumberCol = 0;
	var invoiceNumberCol = 0;
	var vendorSkuCol = 0;
	var trackingNumberCol = 0;
	var totalGood = 0;


	var result = await gmail.users.messages.attachments.get({
		userId: 'me',
		messageId: msgId,
		id: info.attachmentId
	});

	//	Assuming base64 encoding.  Maybe should validate?
	if (result.status === 200) {
		decodedSheet = new Buffer(result.data.data, 'base64');
		info.savedSheetName = `sheets/received_sheet-${info.vendorId}-${new Date().getHours()}-${new Date().getMinutes()}.xlsx`
		await fs.writeFileSync(info.savedSheetName, decodedSheet);

		console.log(`File written: ${info.savedSheetName}`)

		var p = null;
		if (info.filename.endsWith('.csv')) {
			p = inputWorkbook.csv.readFile(info.savedSheetName)
		} else {
			p = inputWorkbook.xlsx.readFile(info.savedSheetName)
		}
		inputWorksheet = await p;
		inputWorksheet = inputWorkbook.getWorksheet(1);


		if (inputWorksheet.rowCount > 30000) {
			throw new Error('Please limit product data to 30,000 rows.')
		}

		//	Get column positions
		for (var col = 1; col < 5; col++) {
			switch (inputWorksheet.getCell(1, col).value) {
				case 'order_number':
					orderNumberCol = col;
					break;

				case 'invoice_number':
					invoiceNumberCol = col;
					break;

				case 'vendor_sku':
					vendorSkuCol = col;
					break;

				case 'tracking_number':
					trackingNumberCol = col;
			}
		}


		for (var i = 2; i <= inputWorksheet.rowCount; i++) {
			var orderId = (orderNumberCol > 0) ? inputWorksheet.getCell(i, orderNumberCol).value : undefined;
			var invoiceNumber = (invoiceNumberCol > 0) ? inputWorksheet.getCell(i, invoiceNumberCol).value : undefined;
			var vendorSku = (vendorSkuCol > 0) ? inputWorksheet.getCell(i, vendorSkuCol).value : undefined;
			var trackingNumber = (trackingNumberCol > 0) ? inputWorksheet.getCell(i, trackingNumberCol).value : undefined;

			var resp = {
				statusCode: 200,
				message: 'Success'
			}
			var req = {
				params: {
					id: info.vendorId
				},
				body: {
					orderId: orderId,
					invoiceNumber: invoiceNumber,
					vendorSku: vendorSku,
					tracking: trackingNumber
				}
			}
			console.log(`Fulfill request: ${JSON.stringify(req, undefined, 2)}`)
			await fulfill(req, resp);

			if (resp.statusCode !== 200) {
				errors += `Row ${i}: ${resp.message}<br>`;
			} else {
				totalGood++;
			}

			console.log('here');
		}

		if (errors.length > 0) {
			responseEmail += errors + '<br>';
		}

		responseEmail += `<br>Total rows processed successfully: ${totalGood}`;
		responseEmail += `</body></html>`;

		info.responseEmail = responseEmail;

	} else {
		//	Log bad attachment 
	}

}



var validateAndQueueDropshipProducts = async (req, resp) => {
	if (!Array.isArray(req.body)) {
		resp = formatResp(resp, undefined, 400, 'Body must be an array of objects');
	} else {
		for (var i = 0; i < req.body.length; i++) {
			resp.data.products.push(req.body[i]);

			if ((req.body[i].vendorSku === undefined) || (req.body[i].vendorSku === null) ||
				(req.body[i].quantity === undefined) || (req.body[i].quantity === null) ||
				(req.body[i].percentOffWholesale === undefined) || (req.body[i].percentOffWholesale === null) ||
				(req.body[i].action === undefined) || (req.body[i].action === null)) {
				// 	||
				// (req.body[i].exclusiveToRush === undefined) || (req.body[i].exclusiveToRush === null)) {
				resp.data.products[i].statusCode = 400;
				resp.data.products[i].message = memberText.get('MISSING_REQUIRED').replace('%required%', 'vendorSku, quantity, percentOffWholesale, action');
			} else if (!check.integer(parseInt(req.body[i].quantity))) {
				resp.data.products[i].statusCode = 400;
				resp.data.products[i].message = `Element quantity must be an integer`;
			} else if (!check.integer(parseInt(req.body[i].percentOffWholesale))) {
				resp.data.products[i].statusCode = 400;
				resp.data.products[i].message = `Element percentOffWholesale must be an integer`;
			} else {
				var pow = parseInt(req.body[i].percentOffWholesale);
				if ((pow < 0) || (pow >= 100)) {
					resp.data.products[i].statusCode = 400;
					resp.data.products[i].message = `Element percentOffWholesale must be greater than or equal 0 and less than 100`;
				}
				// else if ((req.body[i].exclusiveToRush !== 'Y') && (req.body[i].exclusiveToRush !== 'N')) {
				// 	resp.data.products[i].statusCode = 400;
				// 	resp.data.products[i].message = `Element exclusiveToRush must be Y or N`;
				// }
				else {
					var result = await Vendors.queueDropshipProduct(req.params.id, req.body[i].vendorSku, req.body[i].quantity, req.body[i].percentOffWholesale, req.body[i].action, req.body[i].exclusiveToRush);
					if (result.affectedRows === 1) {
						resp.data.products[i].statusCode = 201;
						resp.data.products[i].message = 'Success';
					} else {
						resp.data.products[i].statusCode = 500;
						resp.data.products[i].message = 'Something unexpected happened';
					}
				}
			}
		}
	}
}


//
//	GET dropship queue products
//
var getDropshipQueueProducts = async (where, resp) => {
	var rows = await Vendors.getAllDropshipQueueProducts(where);
	if (rows.length === 0) {
		formatResp(resp, undefined, 404, "No products in dropship queue.")
	} else {
		resp.data.products = rows;
	}

	return rows;
}




module.exports = {
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
	queueBase64CatalogJob,
	queueCatalogJob,
	validateAndQueueDropshipProducts,
	queueInventoryJob,
	queueMultipartCatalogJob,
	queueMultipartInventoryJob,
	processInvoiceAndShippedEmail,
	resetPassword,
	update,
	updateColumnMapping,
	updateColumnLabelMapping,
	updateInventoryWorksheetInfo,
	updateProduct,
	updateWorksheetInfo,
	vendorImport
}