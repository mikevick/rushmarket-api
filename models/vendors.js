'use strict';

const _ = require('lodash');
const bcrypt = require('bcrypt'), SALT_WORK_FACTOR = 10;
const mysql = require('promise-mysql');

const globals = require('../globals');

const gdeActions = require('../actions/gde');

const colUtils = require('../utils/columnUtils');
const configUtils = require('../utils/configUtils');

const GDE = require('./gdeModel');
const Users = require('./users');
const Vendors = require('./vendors');
const Manifests = require('./manifests');



exports.abortProductUpload = (uuid) => {
	return new Promise((resolve, reject) => {
		var conn = null;
		var resp = {
			statusCode: 200,
			messages: 'Success'
		}

		globals.productPool.getConnection()
			.then((connection) => {
				conn = connection;
				return conn.query("SELECT * FROM information_schema.tables WHERE table_schema = 'coreleap' AND table_name = 'vendor_catalog_import_" + uuid + "' LIMIT 1")
			})
			.then((rows) => {
				if (rows.length === 0) {
					resp.statusCode = 404;
					resp.message = 'Upload table vendor_catalog_import_' + uuid + " doesn't exist.";
					resolve(resp);
				} else {
					conn.query('DROP TABLE vendor_catalog_import_' + uuid)
						.then((results) => {
							resolve();
						})
						.catch((e) => {
							reject(e);
						})
				}
			})
			.then((results) => {
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
			.finally(() => {
				globals.productPool.releaseConnection(conn);
			});
	});
}

exports.addProduct = async (validations, vendorId, product) => {
	try {
		var id = globals.mongoid.fetch();

		var colCount = 6;
		var cols = '';
		var searchField = '';
		var valPlaceholders = '?, ?, ?, ?, ?, ?';
		var vals = '';

		var conn = await globals.productPool.getConnection();

		var skuInfo = await exports.assignSku(conn, vendorId, null);
		var values = [id, vendorId, skuInfo.sku, skuInfo.variantSku, product.createdBy, product.createdFrom];

		Object.keys(product).forEach(function (key) {
			//	Ignore fields that don't match to columns in the table.
			if ((validations[key] != undefined) || (key === 'status') ||
				(key === 'eligibleForTrm') || (key === 'eligibleForInline') || (key === 'eligibleForBulkBuys') || (key === 'eligibleForOffPrice') || (key === 'eligibleForCostBasedReturns') || (key === 'eligibleForRevShareReturns') ||
				(key === 'validationErrors') || (key === 'coreEligibilityErrors') || (key === 'trmEligibilityErrors') || (key === 'inlineEligibilityErrors') || (key === 'bulkBuysEligibilityErrors') || (key === 'offPriceEligibilityErrors') || (key === 'costBasedReturnsEligibilityErrors') || (key === 'revShareReturnsEligibilityErrors') ||
				(key === 'searchField')) {
				if (vals.length > 0) {
					vals = vals + ', ';
					cols = cols + ', ';
				}
				vals = vals + product[key];
				values.push(product[key]);

				cols = cols + colUtils.keyToCol(key);
				colCount = colCount + 1;

				// searchField = buildSearchField(searchField, key, product, ['vendorSku', 'upc', 'mpn', 'productName', 'primaryMaterial', 'primaryColor', 'primaryCategory', 'secondaryCategory', 'brandName', 'styleTag1', 'styleTag2'])

				// console.log('key: ' + key + ' col: ' + colUtils.keyToCol(key));
			}
		})


		//	This value only comes into play with manually created VC products.
		if (product['websiteImageLink']) {
			if (vals.length > 0) {
				vals = vals + ', ';
				cols = cols + ', ';
			}
			colCount += 1;

			cols += colUtils.keyToCol('websiteImageLink');
			values.push(product['websiteImageLink']);
		}

		values.push(product.search);

		var sql = 'INSERT INTO vendor_catalog_products (id, vendor_id, sku, variant_sku, created_by, created_from, ' + cols + ')';
		for (var i = 6; i < colCount; i++) {
			valPlaceholders = valPlaceholders + ', ?';
		}
		sql = sql + ' VALUES (' + valPlaceholders + ')';

		// console.log("SQL: " + mysql.format(sql, values));

		await conn.query(sql, values);
		return id;
	} finally {
		await globals.productPool.releaseConnection(conn);
	}
}

exports.addTempProduct = (tableName, sheetRow, vendorId, product, validationErrors, eligibleTRM, trmErrors,
	eligibleInline, inlineErrors, eligibleBulkBuys, bulkBuysErrors, eligibleOffPrice, offPriceErrors,
	eligibleCostBasedReturns, costBasedReturnsErrors, eligibleRevShareReturns, revShareReturnsErrors) => {
	return new Promise((resolve, reject) => {
		var id = globals.mongoid.fetch();

		var colCount = 17;
		var cols = '';
		var searchField = '';
		var valPlaceholders = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
		var vals = '';

		var values = [id, sheetRow, vendorId, validationErrors, eligibleTRM, trmErrors, eligibleInline, inlineErrors, eligibleBulkBuys, bulkBuysErrors, eligibleOffPrice, offPriceErrors, eligibleCostBasedReturns, costBasedReturnsErrors, eligibleRevShareReturns, revShareReturnsErrors];
		Object.keys(product).forEach(function (key) {
			if (vals.length > 0) {
				vals = vals + ', ';
				cols = cols + ', ';
			}
			vals = vals + product[key];
			values.push(product[key]);

			cols = cols + colUtils.keyToCol(key);
			colCount = colCount + 1;

			searchField = buildSearchField(searchField, key, product, ['vendorSku', 'upc', 'mpn', 'productName', 'primaryMaterial', 'primaryColor', 'primaryCategory', 'secondaryCategory', 'brandName', 'styleTag1', 'styleTag2'])

			// console.log('key: ' + key + ' col: ' + colUtils.keyToCol(key));
		})

		values.push(searchField);

		var sql = 'INSERT INTO vendor_catalog_import_' + tableName + ' (id, sheet_row, vendor_id, validation_errors, eligible_for_trm, trm_eligibility_errors, eligible_for_inline, inline_eligibility_errors, eligible_for_bulk_buys, bulk_buys_eligibility_errors, eligible_for_off_price, off_price_eligibility_errors, eligible_for_cost_based_returns, cost_based_returns_eligibility_errors, eligible_for_rev_share_returns, rev_share_returns_eligibility_errors, ' + cols + ', search_field)';
		for (var i = 17; i < colCount; i++) {
			valPlaceholders = valPlaceholders + ', ?';
		}
		sql = sql + ' VALUES (' + valPlaceholders + ')';

		// console.log(mysql.format(sql, values));

		globals.productPool.query(sql, values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.addProductFromImport = async (vendorId, masterId, sqlAndValues) => {

	var skuInfo = await Vendors.assignSku(undefined, vendorId, masterId);

	sqlAndValues.valArray.push(skuInfo.sku);
	sqlAndValues.valArray.push(skuInfo.variantSku);
	sqlAndValues.valArray.push(skuInfo.variantSequence);

	var sql = mysql.format(sqlAndValues.sql, sqlAndValues.valArray);

	var results = await globals.productPool.query(sql);
	if (results.affectedRows !== 1) {
		// console.log(sql);
		// console.log(JSON.stringify(results, undefined, 2));
		process.exit(1);
	}
	return results;
}



var assignVendorPrefix = async (conn, vendorId) => {
	var prefix = null;

	var result = await conn.query('SELECT prefix FROM vendor_prefixes WHERE vendor_id IS NULL ORDER BY date_created LIMIT 0,1');
	if (result.length === 0) {
		throw new Error('No free vendor prefixes.  This should never happen.');
	}

	prefix = result[0].prefix;

	result = await conn.query('UPDATE vendor_prefixes SET vendor_id = ? WHERE prefix = ?', [vendorId, prefix]);

	if (result.changedRows != 1) {
		throw new Error('Error assigning prefix ' + prefix + ' to vendor ' + vendorId);
	}

	return prefix;
}

var buildSearchField = (searchField, key, product, fields) => {
	var idx = _.indexOf(fields, key);
	if (idx > -1) {
		if (product[key] != undefined) {
			searchField = searchField + product[key];
		}
	}

	return searchField.substring(0, 4096 - 1);
}

exports.completeCatalogJob = (id, uploadId, acceptedRows, errorRows, rejectedRows, rejectedUrl) => {
	return new Promise((resolve, reject) => {
		var values = [];
		values.push(uploadId);
		values.push(acceptedRows);
		values.push(errorRows);
		values.push(rejectedRows);
		var sql = "UPDATE vendor_catalog_jobs SET date_modified = now(), status = 'PROCESSED', upload_id = ?, rows_accepted = ?, " +
			'rows_errored = ?, rows_rejected = ?';

		if (rejectedUrl === null) {
			sql = sql + ', rejected_sheet_url = NULL';
		} else {
			values.push(rejectedUrl);
			sql = sql + ', rejected_sheet_url = ?';
		}
		values.push(id);
		sql = sql + ' WHERE id = ?';

		globals.productPool.query(sql, values)
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.checkAbortFlag = async (id) => {
	var result = await globals.productPool.query("SELECT abort_flag FROM vendor_catalog_jobs WHERE id = ?", [id]);
	if (result[0].abort_flag === 'Y') {
		return true;
	} else {
		return false;
	}
}

exports.updateCatalogJob = (id, acceptedRows, errorRows, rejectedRows, status) => {
	return new Promise((resolve, reject) => {
		var values = [];
		values.push(acceptedRows);
		values.push(errorRows);
		values.push(rejectedRows);
		if (status !== undefined) {
			values.push(status);
		}
		var sql = "UPDATE vendor_catalog_jobs SET date_modified = now(), status = 'INPROGRESS', rows_accepted = ?, " +
			"rows_errored = ?, rows_rejected = ?";

		if (status !== undefined) {
			sql += ", status = ?";
		}

		values.push(id);
		sql = sql + ' WHERE id = ?';

		globals.productPool.query(sql, values)
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.completeInventoryJob = (id, updateSuccesses, missingUpdated) => {
	return new Promise((resolve, reject) => {
		var values = [updateSuccesses, missingUpdated, id];
		var sql = "UPDATE vendor_inventory_jobs SET date_modified = now(), status = 'PROCESSED', variants_updated = ?, missing_variants_updated = ?  WHERE id = ?";

		globals.productPool.query(sql, values)
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.create = async (body) => {
	try {
		var conn = null;
		var id = globals.mongoid.fetch();

		if (body.email != undefined) {
			body.email = body.email.trim();
		}
		if (body.name != undefined) {
			body.name = body.name.trim();
		}
		if ((body.dsSignedContract === undefined) || (body.dsSignedContract === null)) {
			body.dsSignedContract = "N";
		}
		if ((body.rbrSignedContract === undefined) || (body.rbrSignedContract === null)) {
			body.rbrSignedContract = "N";
		}
		if ((body.inventoryFeed === undefined) || (body.inventoryFeed === null)) {
			body.inventoryFeed = "N";
		}
		if ((body.shippingLabelPhotoRequired === undefined) || (body.shippingLabelPhotoRequired === null)) {
			body.shippingLabelPhotoRequired = "N";
		}
		if ((body.trackingNumberRequired === undefined) || (body.trackingNumberRequired === null)) {
			body.trackingNumberRequired = "N";
		}
		if ((body.trashPhotoRequired === undefined) || (body.trashPhotoRequired === null)) {
			body.trashPhotoRequired = "N";
		}
		if (body.alias != undefined) {
			body.alias = body.alias.trim();
		}
		if (body.dba != undefined) {
			body.dba = body.dba.trim();
		}
		if (body.taxIdNumber != undefined) {
			body.taxIdNumber = body.taxIdNumber.trim();
		}
		if (body.websiteAddress != undefined) {
			body.websiteAddress = body.websiteAddress.trim();
		}
		if (body.paymentTerms != undefined) {
			body.paymentTerms = body.paymentTerms.trim();
		}
		if (body.partnerContractType != undefined) {
			body.partnerContractType = body.partnerContractType.trim();
		}
		if (body.ltlReturnsName != undefined) {
			body.ltlReturnsName = body.ltlReturnsName.trim();
		}
		if (body.ltlReturnsEmail != undefined) {
			body.ltlReturnsEmail = body.ltlReturnsEmail.trim();
		}
		if (body.ltlReturnsPhone != undefined) {
			body.ltlReturnsPhone = body.ltlReturnsPhone.trim();
		}
		if (body.salesName != undefined) {
			body.salesName = body.salesName.trim();
		}
		if (body.salesEmail != undefined) {
			body.salesEmail = body.salesEmail.trim();
		}
		if (body.salesPhone != undefined) {
			body.salesPhone = body.salesPhone.trim();
		}
		if (body.orderName != undefined) {
			body.orderName = body.orderName.trim();
		}
		if (body.orderEmail != undefined) {
			body.orderEmail = body.orderEmail.trim();
		}
		if (body.orderPhone != undefined) {
			body.orderPhone = body.orderPhone.trim();
		}
		if (body.apName != undefined) {
			body.apName = body.apName.trim();
		}
		if (body.apEmail != undefined) {
			body.apEmail = body.apEmail.trim();
		}
		if (body.apPhone != undefined) {
			body.apPhone = body.apPhone.trim();
		}
		if (body.apAddress1 != undefined) {
			body.apAddress1 = body.apAddress1.trim();
		}
		if (body.apAddress2 != undefined) {
			body.apAddress2 = body.apAddress2.trim();
		}
		if (body.apCity != undefined) {
			body.apCity = body.apCity.trim();
		}
		if (body.apStateOrProvince != undefined) {
			body.apStateOrProvince = body.apStateOrProvince.trim();
		}
		if (body.apCountry != undefined) {
			body.apCountry = body.apCountry.trim();
		}
		if (body.apPostalCode != undefined) {
			body.apPostalCode = body.apPostalCode.trim();
		}
		if (body.transportationName != undefined) {
			body.transportationName = body.transportationName.trim();
		}
		if (body.transportationEmail != undefined) {
			body.transportationEmail = body.transportationEmail.trim();
		}
		if (body.transportationPhone != undefined) {
			body.transportationPhone = body.transportationPhone.trim();
		}
		if (body.csName != undefined) {
			body.csName = body.csName.trim();
		}
		if (body.csEmail != undefined) {
			body.csEmail = body.csEmail.trim();
		}
		if (body.csPhone != undefined) {
			body.csPhone = body.csPhone.trim();
		}
		if (body.partsName != undefined) {
			body.partsName = body.partsName.trim();
		}
		if (body.partsEmail != undefined) {
			body.partsEmail = body.partsEmail.trim();
		}
		if (body.partsPhone != undefined) {
			body.partsPhone = body.partsPhone.trim();
		}
		if (body.companyAddress1 != undefined) {
			body.companyAddress1 = body.companyAddress1.trim();
		}
		if (body.companyAddress2 != undefined) {
			body.companyAddress2 = body.companyAddress2.trim();
		}
		if (body.companyCity != undefined) {
			body.companyCity = body.companyCity.trim();
		}
		if (body.companyStateOrProvince != undefined) {
			body.companyStateOrProvince = body.companyStateOrProvince.trim();
		}
		if (body.country != undefined) {
			body.country = body.country.trim();
		}
		if (body.companyPostalCode != undefined) {
			body.companyPostalCode = body.companyPostalCode.trim();
		}
		if (body.warehouse1Address1 != undefined) {
			body.warehouse1Address1 = body.warehouse1Address1.trim();
		}
		if (body.warehouse1Address2 != undefined) {
			body.warehouse1Address2 = body.warehouse1Address2.trim();
		}
		if (body.warehouse1City != undefined) {
			body.warehouse1City = body.warehouse1City.trim();
		}
		if (body.warehouse1StateOrProvince != undefined) {
			body.warehouse1StateOrProvince = body.warehouse1StateOrProvince.trim();
		}
		if (body.warehouse1Country != undefined) {
			body.warehouse1Country = body.warehouse1Country.trim();
		}
		if (body.warehouse1PostalCode != undefined) {
			body.warehouse1PostalCode = body.warehouse1PostalCode.trim();
		}
		if (body.warehouse2Address1 != undefined) {
			body.warehouse2Address1 = body.warehouse2Address1.trim();
		}
		if (body.warehouse2Address2 != undefined) {
			body.warehouse2Address2 = body.warehouse2Address2.trim();
		}
		if (body.warehouse2City != undefined) {
			body.warehouse2City = body.warehouse2City.trim();
		}
		if (body.warehouse2StateOrProvince != undefined) {
			body.warehouse2StateOrProvince = body.warehouse2StateOrProvince.trim();
		}
		if (body.warehouse2Country != undefined) {
			body.warehouse2Country = body.warehouse2Country.trim();
		}
		if (body.warehouse2PostalCode != undefined) {
			body.warehouse2PostalCode = body.warehouse2PostalCode.trim();
		}
		if (body.warehouse3Address1 != undefined) {
			body.warehouse3Address1 = body.warehouse3Address1.trim();
		}
		if (body.warehouse3Address2 != undefined) {
			body.warehouse3Address2 = body.warehouse3Address2.trim();
		}
		if (body.warehouse3City != undefined) {
			body.warehouse3City = body.warehouse3City.trim();
		}
		if (body.warehouse3StateOrProvince != undefined) {
			body.warehouse3StateOrProvince = body.warehouse3StateOrProvince.trim();
		}
		if (body.warehouse3Country != undefined) {
			body.warehouse3Country = body.warehouse3Country.trim();
		}
		if (body.warehouse3PostalCode != undefined) {
			body.warehouse3PostalCode = body.warehouse3PostalCode.trim();
		}
		if ((body.partnerTypes !== undefined) && (body.partnerTypes.length > 0)) {
			for (var i = 0; i < body.partnerTypes.length; i++) {
				body.partnerTypes[i] = body.partnerTypes[i].trim();
			}
		}
		if ((body.supplierCodes !== undefined) && (body.supplierCodes.length > 0)) {
			for (var i = 0; i < body.supplierCodes.length; i++) {
				body.supplierCodes[i] = body.supplierCodes[i].trim();
			}
		}

		var values = [id, body.catalogFeedType, body.catalogFeedFormat, body.catalogFeedFreq, body.catalogScheduleStart, body.catalogScheduleIntervalHours,
			body.inventoryFeedType, body.inventoryfeedFormat, body.inventoryFeedFreq, body.inventoryScheduleStart, body.inventoryScheduleIntervalHours,
			body.email, body.name, body.alias, body.manifestId, body.dba, body.taxIdNumber, body.websiteAddress, body.paymentTerms, body.partnerContractType, body.partnerRevSharePercent, body.dropShipFee, body.processingFee, body.leadTime, body.shippingCutoffCst, body.inventoryUploadProcess,
			body.invoiceMethod, body.map,
			body.ltlReturnsName, body.ltlReturnsEmail, body.ltlReturnsPhone,
			body.salesName, body.salesEmail, body.salesPhone,
			body.orderName, body.orderEmail, body.orderPhone,
			body.apName, body.apEmail, body.apPhone,
			body.apAddress1, body.apAddress2, body.apCity, body.apStateOrProvince, body.apCountry, body.apPostalCode,
			body.transportationName, body.transportationEmail, body.transportationPhone,
			body.csName, body.csEmail, body.csPhone,
			body.partsName, body.partsEmail, body.partsPhone,
			body.companyAddress1, body.companyAddress2, body.companyCity, body.companyStateOrProvince, body.country, body.companyPostalCode,
			body.warehouse1Address1, body.warehouse1Address2, body.warehouse1City, body.warehouse1StateOrProvince, body.warehouse1Country, body.warehouse1PostalCode,
			body.warehouse2Address1, body.warehouse2Address2, body.warehouse2City, body.warehouse2StateOrProvince, body.warehouse2Country, body.warehouse2PostalCode,
			body.warehouse3Address1, body.warehouse3Address2, body.warehouse3City, body.warehouse3StateOrProvince, body.warehouse3Country, body.warehouse3PostalCode,
			body.damageDefectiveAllowance, body.preferenceAllowance, body.tariff, body.replacementParts,
			body.internalSeller, body.dsSignedContract, body.rbrSignedContract, body.inventoryFeed, body.groupQuantities, body.calculateCost, body.manifestIdUpload, body.isParsingTemplate, body.useParsingTemplate, body.buyerId, body.manifestSellerFlag,
			body.manufacturerWarranty, body.replacementPartsAdditional, body.notes,
			body.shippingLabelPhotoRequired, body.shippingLabelPhotoRequiredDaily, body.shippingLabelPhotoRequiredBulkReturns, body.shippingLabelPhotoRequiredBulkOverstock,
			body.trackingNumberRequired, body.trackingNumberRequiredDaily, body.trackingNumberRequiredBulkReturns, body.trackingNumberRequiredBulkOverstock,
			body.trashPhotoRequired, body.trashPhotoRequiredDaily, body.trashPhotoRequiredBulkReturns, body.trashPhotoRequiredBulkOverstock
		];

		conn = await globals.productPool.getConnection();
		await conn.beginTransaction();
		await assignVendorPrefix(conn, id);
		await conn.query(`INSERT INTO vendors (id, catalog_feed_type, catalog_feed_format, catalog_feed_freq, catalog_schedule_start, catalog_schedule_interval_hours, 
			inventory_feed_type, inventory_feed_format, inventory_feed_freq, inventory_schedule_start, inventory_schedule_interval_hours, 
			email, name, alias, manifest_id, dba, tax_id_number, website_address, payment_terms, partner_contract_type, partner_rev_share_percent, drop_ship_fee, processing_fee, lead_time, shipping_cutoff_cst, inventory_upload_process, 
			invoice_method, map,
		  ltl_returns_name, ltl_returns_email, ltl_returns_phone,
		  sales_name, sales_email, sales_phone, 
			order_name, order_email, order_phone, 
			ap_name, ap_email, ap_phone, 
			ap_address1, ap_address2, ap_city, ap_state_or_province, ap_country, ap_postal_code, 
			transportation_name, transportation_email, transportation_phone, 
			cs_name, cs_email, cs_phone, 
			parts_name, parts_email, parts_phone, 
			company_address1, company_address2, company_city, company_state_or_province, company_country, company_postal_code, 
			warehouse1_address1, warehouse1_address2, warehouse1_city, warehouse1_state_or_province, warehouse1_country, warehouse1_postal_code, 
			warehouse2_address1, warehouse2_address2, warehouse2_city, warehouse2_state_or_province, warehouse2_country, warehouse2_postal_code, 
			warehouse3_address1, warehouse3_address2, warehouse3_city, warehouse3_state_or_province, warehouse3_country, warehouse3_postal_code, 
			damage_defective_allowance, preference_allowance, tariff, provide_replacement_parts, 
			internal_seller, ds_signed_contract, rbr_signed_contract, inventory_feed, group_quantities, calculate_cost, manifest_id_upload, is_parsing_template, use_parsing_template, buyer_id, manifest_seller_flag, 
			manufacturer_warranty, replacement_parts_additional, notes, 
			shipping_label_photo_required, shipping_label_photo_required_daily, shipping_label_photo_required_bulk_returns, shipping_label_photo_required_bulk_overstock, 
			tracking_number_required, tracking_number_required_daily, tracking_number_required_bulk_returns, tracking_number_required_bulk_overstock, 
			trash_photo_required, trash_photo_required_daily, trash_photo_required_bulk_returns, trash_photo_required_bulk_overstock) 
			VALUES (?, ?, ?, ?, ?, ?, 
			?, ?, ?, ?, ?, 
			?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
			?, ?, 
			?, ?, ?,  
			?, ?, ?,  
			?, ?, ?,  
			?, ?, 
		  ?, ?, ?,
			?, ?, ?,  
			?, ?, ?,  
			?, ?, ?,  
			?, ?, ?, ?, ?, ?, 
			?, ?, ?, ?, ?, ?, 
			?, ?, ?, ?, ?, ?, 
			?, ?, ?, ?, ?, ?, 
			?, ?, ?, ?, ?, ?, ?, ?, 
			?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
			?, ?, ?, ?, ?, ?)`, values);

		if ((body.partnerTypes !== undefined) && (body.partnerTypes.length > 0)) {
			for (var i = 0; i < body.partnerTypes.length; i++) {
				await conn.query('INSERT INTO vendor_to_partner_types (vendor_id, partner_type) VALUES (?, ?)', [id, body.partnerTypes[i]]);
			}
		}

		if ((body.supplierCodes !== undefined) && (body.supplierCodes.length > 0)) {
			for (var i = 0; i < body.supplierCodes.length; i++) {
				await conn.query('INSERT INTO vendor_supplier_codes (vendor_id, supplier_code) VALUES (?, ?)', [id, body.supplierCodes[i]]);
			}
		}

		await conn.commit();
		return id;
	} catch (e) {
		conn.rollback();
		throw (e);
	} finally {
		globals.productPool.releaseConnection(conn);
	};
}

exports.createCatalogJob = (submitterId, submitterType, vendorId, filePath, fileName) => {
	return new Promise((resolve, reject) => {
		var id = globals.mongoid.fetch();

		var values = [];
		globals.productPool.query("SELECT catalog_feed_format FROM vendors WHERE id = '" + vendorId + "'")
			.then((results) => {
				values = [id, submitterId, submitterType, vendorId, results[0].catalog_feed_format, filePath, fileName];
				return globals.productPool.query('INSERT INTO vendor_catalog_jobs (id, submitter_id, submitter_type, vendor_id, format, file_path, file_name) ' +
					'VALUES (?, ?, ?, ?, ?, ?, ?)', values);
			})
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.createColumnMappings = (vid, body) => {
	return new Promise((resolve, reject) => {
		var id = globals.mongoid.fetch();
		var label = body.label ? body.label : null;
		var dataPoint = body.dataPoint ? body.dataPoint : null;
		var column = body.column ? body.column : null;

		var values = [id, vid, dataPoint, column];
		globals.productPool.query('DELETE FROM vendor_catalog_column_mappings WHERE vendor_id = ? AND data_point = ?', [vid, dataPoint])
			.then(() => {
				return globals.productPool.query('INSERT INTO vendor_catalog_column_mappings (id, vendor_id, data_point, template_column) ' +
					'VALUES ( ' +
					'?, ?, ?, ?' +
					')', values);
			})
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.createColumnLabelMappings = (vid, body) => {
	return new Promise((resolve, reject) => {
		var id = globals.mongoid.fetch();
		var label = body.label ? body.label : null;
		var dataPointId = body.dataPointId ? body.dataPointId : null;
		var columnLabel = body.columnLabel ? body.columnLabel : null;

		var values = [id, vid, dataPointId, columnLabel.trim()];
		globals.productPool.query('DELETE FROM vendor_catalog_column_label_mappings WHERE vendor_id = ? AND data_point_id = ?', [vid, dataPointId])
			.then(() => {
				return globals.productPool.query('INSERT INTO vendor_catalog_column_label_mappings (id, vendor_id, data_point_id, template_column_label) ' +
					'VALUES ( ' +
					'?, ?, ?, ?' +
					')', values);
			})
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.createInventoryWorksheetInfo = (vid, firstDataRow, vendorSkuColumn, quantityColumn) => {
	return new Promise((resolve, reject) => {
		var id = globals.mongoid.fetch();
		var firstDataRw = firstDataRow || null;
		var vendorSkuCol = vendorSkuColumn || null;
		var quantityCol = quantityColumn || null;

		var values = [id, vid, firstDataRw, vendorSkuCol, quantityCol];
		globals.productPool.query('DELETE FROM vendor_inventory_worksheet_info WHERE vendor_id = ?', [vid])
			.then(() => {
				return globals.productPool.query('INSERT INTO vendor_inventory_worksheet_info (id, vendor_id, first_data_row, vendor_sku_column, quantity_column) ' +
					'VALUES ( ' +
					'?, ?, ?, ?, ?' +
					')', values);
			})
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.createInventoryJob = (userId, vendorId, uploadId, filePath, fileName) => {
	return new Promise((resolve, reject) => {
		var id = globals.mongoid.fetch();

		var values = [id, userId, vendorId, uploadId, filePath, fileName];
		globals.productPool.query('INSERT INTO vendor_inventory_jobs (id, submitter_id, vendor_id, upload_id, file_path, file_name) ' +
				'VALUES (?, ?, ?, ?, ?, ?)', values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.createTempProducts = (name) => {
	return new Promise((resolve, reject) => {
		if (name.trim().length === 0) {
			throw new Error('Temp table name invalid: ' + name);
		}

		globals.productPool.query('DROP TABLE IF EXISTS vendor_catalog_import_' + name)
			.then((results) => {
				return globals.productPool.query('CREATE TABLE vendor_catalog_import_' + name + ' LIKE vendor_catalog_products');
			})
			.then((results) => {
				return globals.productPool.query('ALTER TABLE vendor_catalog_import_' + name + ' ADD COLUMN sheet_row INT(11) AFTER ID');
			})
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.createVendorPrefix = (prefix) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("INSERT INTO vendor_prefixes (prefix) VALUES ('" + prefix + "')")
			.then((results) => {
				resolve(results);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.createWorksheetInfo = (vid, body) => {
	return new Promise((resolve, reject) => {
		var id = globals.mongoid.fetch();

		var values = [id, vid, body.worksheetNumber, body.firstDataRow];
		globals.productPool.query('INSERT INTO vendor_catalog_worksheet_info (id, vendor_id, worksheet_number, first_data_row) ' +
				'VALUES (?, ?, ?, ?)', values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.delById = (id) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('DELETE FROM vendors WHERE id = ?', [id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.deleteProductById = (id) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('DELETE FROM vendor_catalog_products WHERE id = ?', [id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.logDeletedProduct = (variantSku, vendorSku, upc, mpn, coinId, vendorName, userName) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('INSERT INTO vendor_catalog_delete_log (variant_sku, vendor_sku, upc, mpn, coin_id, vendor, deleted_by)' +
				'VALUES (?, ?, ?, ?, ?, ?, ?)', [variantSku, vendorSku, upc, mpn, coinId, vendorName, userName])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.delColumnMappingById = (vid, id) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('DELETE FROM vendor_catalog_column_mappings WHERE id = ? AND vendor_id = ?', [id, vid])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.delColumnLabelMappingById = (vid, id) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('DELETE FROM vendor_catalog_column_label_mappings WHERE id = ? AND vendor_id = ?', [id, vid])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.delInventoryColumnMappingById = (vid, id) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('DELETE FROM vendor_catalog_inventory_column_mappings WHERE id = ? AND vendor_id = ?', [id, vid])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.delProductById = (id) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('DELETE FROM vendor_catalog_products WHERE id = ?', [id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getActiveVendors = async () => {
	var sql = `SELECT * FROM vendors WHERE status = 'ACTIVE'`;

	var vendors = await globals.productROPool.query(sql);

	colUtils.outboundNaming(vendors);

	return vendors;
}




exports.getVendorSkusByVendor = async (vendorId) => {
	var sql = `SELECT vendor_id, vendor_sku FROM vendor_catalog_products WHERE vendor_id = ?`;

	var vskus = await globals.productROPool.query(sql, [vendorId]);

	colUtils.outboundNaming(vskus);

	return vskus;
}




exports.getAllDropshipVendorSkus = async () => {
	var sql = `SELECT vendor_id, vendor_sku FROM vendor_catalog_products WHERE vendor_id IN (
								SELECT DISTINCT(vendor_id) FROM vendor_to_partner_types WHERE partner_type IN (
									SELECT id FROM vendor_partner_types WHERE TYPE IN ('STM', 'DS')
								)
							) ORDER BY vendor_id, vendor_sku`;

	var vskus = await globals.productROPool.query(sql);

	colUtils.outboundNaming(vskus);

	return vskus;
}


exports.getAllDropshipOrigins = async () => {
	var sql = `SELECT name, LEFT(warehouse1_postal_code, 5) AS warehouse1_postal_code FROM vendors WHERE id IN (
								SELECT DISTINCT(vendor_id) FROM vendor_to_partner_types WHERE partner_type IN (
									SELECT id FROM vendor_partner_types WHERE TYPE IN ('STM', 'DS')
								)
							) ORDER BY name`;

	var vskus = await globals.productROPool.query(sql);

	colUtils.outboundNaming(vskus);

	return vskus;
}



exports.getByEmail = async (email) => {
	var prom = [];

	var vendors = await globals.productPool.query('SELECT * FROM vendors WHERE email = ?', [email]);

	if (vendors.length > 0) {
		prom.push(globals.productPool.query('SELECT prefix from vendor_prefixes WHERE vendor_id = ?', [vendors[0].id]));
		prom.push(globals.productPool.query('SELECT vpt.type FROM vendor_partner_types vpt LEFT JOIN vendor_to_partner_types vtpt ON vpt.id = vtpt.partner_type ' +
			'WHERE vtpt.vendor_id = ?', [vendors[0].id]));

		var results = await Promise.all(prom);

		var prefixes = results[0];
		var types = results[1];

		vendors[0].prefixes = [];
		vendors[0].partnerTypes = [];

		for (var i = 0; i < prefixes.length; i++) {
			vendors[0].prefixes.push(prefixes[i].prefix);
		}
		for (var i = 0; i < types.length; i++) {
			vendors[0].partnerTypes.push(types[i].type);
		}
	}

	colUtils.outboundNaming(vendors);

	return vendors;
}



exports.getByAnyEmail = async (email) => {
	var prom = [];

	var vendors = await globals.productPool.query('SELECT * FROM vendors WHERE email = ? OR sales_email = ? OR ap_email = ? OR transportation_email = ? OR cs_email = ?', [email, email, email, email, email]);

	colUtils.outboundNaming(vendors);

	return vendors;
}



exports.getByVerificationId = async (vid) => {
	var prom = [];

	var vendors = await globals.productPool.query('SELECT * FROM vendors WHERE verification_id = ?', [vid]);

	colUtils.outboundNaming(vendors);

	return vendors;
}



exports.getById = async (id) => {
	var prom = [];

	prom.push(globals.productPool.query('SELECT * FROM vendors WHERE id = ?', [id]));
	prom.push(globals.productPool.query('SELECT prefix from vendor_prefixes WHERE vendor_id = ?', [id]));
	prom.push(globals.productPool.query('SELECT vpt.type FROM vendor_partner_types vpt LEFT JOIN vendor_to_partner_types vtpt ON vpt.id = vtpt.partner_type ' +
		'WHERE vtpt.vendor_id = ?', [id]));
	if (configUtils.get("FEAT_FLAG_RM_2464_VENDOR_SUPPLIER_CODES") === "ON") {
		prom.push(globals.productPool.query('SELECT store_id, type, supplier_code, charge_processing_fees, charge_disposal_fees, default_condition, pay_partner_fees FROM vendor_supplier_codes WHERE vendor_id = ?', [id]));
	} else {
		prom.push(globals.productPool.query('SELECT supplier_code FROM vendor_supplier_codes WHERE vendor_id = ?', [id]));
	}
	prom.push(globals.productPool.query('SELECT l.platform FROM listed_on l LEFT JOIN vendor_to_marketplaces vm ON l.id = vm.marketplace_id WHERE vm.vendor_id = ?', [id]));

	var results = await Promise.all(prom);

	var vendors = results[0];
	var prefixes = results[1];
	var types = results[2];
	var codes = results[3];
	var marketplaces = results[4];

	if (vendors.length > 0) {
		vendors[0].prefixes = [];
		vendors[0].partnerTypes = [];
		vendors[0].supplierCodes = [];
		vendors[0].marketplacesAllowed = [];

		for (var i = 0; i < prefixes.length; i++) {
			vendors[0].prefixes.push(prefixes[i].prefix);
		}
		for (var i = 0; i < types.length; i++) {
			vendors[0].partnerTypes.push(types[i].type);
		}
		for (var i = 0; i < codes.length; i++) {
			if (configUtils.get("FEAT_FLAG_RM_2464_VENDOR_SUPPLIER_CODES") === "ON") {
				vendors[0].supplierCodes.push({
					storeId: codes[i].store_id,
					type: codes[i].type,
					code: codes[i].supplier_code,
					chargeDisposalFees: codes[i].charge_disposal_fees,
					chargeProcessingFees: codes[i].charge_processing_fees,
					defaultCondition: codes[i].default_condition,
					payPartnerFees: codes[i].pay_partner_fees
				});
			} else {
				vendors[0].supplierCodes.push(codes[i].supplier_code);
			}
		}
		for (var i = 0; i < marketplaces.length; i++) {
			vendors[0].marketplacesAllowed.push(marketplaces[i].platform);
		}
	}

	colUtils.outboundNaming(vendors);

	return vendors;
}

exports.getByName = (name) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('SELECT * FROM vendors WHERE name = ?', [name])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getBySupplierCodePrefix = (prefix) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('SELECT * FROM vendors WHERE supplier_code_prefix = ?', [prefix])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getBySupplierCode = (code) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('SELECT vendorId FROM vendors WHERE supplier_code_prefix = ?', [prefix])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getByVendorSku = (id) => {
	return new Promise((resolve, reject) => {
		var vendors = [];

		globals.productPool.query('SELECT * FROM vendors WHERE id = ?', [id])
			.then((rows) => {
				vendors = rows;
				return globals.productPool.query('SELECT prefix from vendor_prefixes WHERE vendor_id = ?', [id]);
			})
			.then((rows) => {
				if (vendors.length > 0) {
					vendors[0].prefixes = [];
					for (var i = 0; i < rows.length; i++) {
						vendors[0].prefixes.push(rows[i].prefix);
					}
				}
				colUtils.outboundNaming(vendors);
				resolve(vendors);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getAll = async (whereInfo, offset, limit, sortBy) => {
	var prom = [];
	var resp = {
		totalCount: 0,
		vendors: []
	}

	if (sortBy === undefined) {
		sortBy = 'name ASC';
	}

	if (whereInfo.join === undefined) {
		whereInfo.join = '';
	}
	var count = await globals.productPool.query('SELECT count(*) as num FROM vendors v ' + whereInfo.join + whereInfo.clause, whereInfo.values);
	resp.totalCount = count[0].num;
	let vendorSelect = "v.*";
	if (whereInfo.select) {
		vendorSelect = whereInfo.select;
	}
	let vendorSql = `SELECT ${vendorSelect} 
        FROM vendors v ${whereInfo.join} ${whereInfo.clause} 
        ORDER BY ${sortBy} 
        LIMIT ?, ?`;
	whereInfo.values.push(offset);
	whereInfo.values.push(limit);
	// console.log(mysql.format(vendorSql, whereInfo.values));
	var rows = await globals.productPool.query(vendorSql, whereInfo.values);
	resp.vendors = rows;
	for (var i = 0; i < resp.vendors.length; i++) {
		prom.push(globals.productPool.query("SELECT prefix from vendor_prefixes WHERE vendor_id = '" + rows[i].id + "'"));
	}
	colUtils.outboundNaming(resp.vendors);
	var results = await Promise.all(prom);
	prom = [];
	for (var i = 0; i < resp.vendors.length; i++) {
		resp.vendors[i].prefixes = [];
		for (var j = 0; j < results[i].length; j++) {
			resp.vendors[i].prefixes.push(results[i][j].prefix);
		}
		prom.push(globals.productPool.query('SELECT supplier_code FROM vendor_supplier_codes WHERE vendor_id = ?', [resp.vendors[i].id]));
	}
	results = await Promise.all(prom);
	prom = [];
	for (var i = 0; i < resp.vendors.length; i++) {
		resp.vendors[i].supplierCodes = [];
		for (var j = 0; j < results[i].length; j++) {
			resp.vendors[i].supplierCodes.push(results[i][j].supplier_code);
		}
		prom.push(globals.productPool.query(`SELECT vt.id, t.type FROM vendor_partner_types t LEFT JOIN vendor_to_partner_types vt ON vt.partner_type = t.id WHERE vt.vendor_id = ?`, [resp.vendors[i].id]));
	}

	results = await Promise.all(prom);
	prom = [];
	for (var i = 0; i < resp.vendors.length; i++) {
		resp.vendors[i].partnerTypes = [];
		for (var j = 0; j < results[i].length; j++) {
			resp.vendors[i].partnerTypes.push(results[i][j].type);
		}
	}

	return resp;
}

exports.getAllProducts = async (whereInfo, sortBy, offset, limit, options = {}) => {
	const { ltlReturnItemId } = options;

	const resp = {
		totalCount: 0,
		rows: []
	}

	const ltlReturnItemJoins = ltlReturnItemId ? `
		LEFT JOIN ltl_returns r ON r.vendor_id = p.vendor_id
		LEFT JOIN ltl_return_items i ON i.ltl_return_id = r.id AND i.vendor_sku = p.vendor_sku
		` : ''

	const count = await globals.productPool.query(`
		SELECT count(*) as num
		FROM vendor_catalog_products p
		${ltlReturnItemJoins}
		${whereInfo.clause}
		`, whereInfo.values);
	resp.totalCount = count[0].num;

	// console.log("SELECT * FROM vendor_catalog_products " + where + " " + sortBy + " " + offset + "," + limit);
	whereInfo.values.push(offset);
	whereInfo.values.push(limit);
	const sql = `
		SELECT
			c.listed_on_marketplace,
			c.id as coin_id,
			p.*
			${ltlReturnItemId ? `,
			i.on_pallet,
			i.condition,
			i.notes as ltl_return_notes
			` : ''}
		FROM vendor_catalog_products p
			LEFT JOIN coins_to_vendor_skus v ON ((p.vendor_id = v.vendor_id) AND (p.vendor_sku = v.vendor_sku)) 
			LEFT JOIN coins c ON c.id = v.coin_id
			${ltlReturnItemJoins}
		${whereInfo.clause}
		ORDER BY ${sortBy}
		${limit !== undefined ? 'LIMIT ?,?' : ''}`;

	// console.log(mysql.format(sql, whereInfo.values));
	resp.rows = await globals.productPool.query(sql, whereInfo.values)
		.then(colUtils.outboundNaming)
		.then(rows => Promise.all(rows.map(async (row) => {
			const pendingListedOn = globals.productPool.query(`SELECT lo.platform FROM coins_to_listed_on clo LEFT JOIN listed_on lo ON clo.listed_on_id = lo.id WHERE clo.coin_id = ?`, [row.coinId])
				.then(listedOns => listedOns.map(listedOn => listedOn.platform));

			const pendingNotListedReasons = globals.productPool.query(`SELECT nlr.reason FROM coins_to_not_listed_reasons cnlr LEFT JOIN not_listed_reasons nlr ON cnlr.not_listed_reason_id = nlr.id WHERE cnlr.coin_id = ?`, [row.coinId])
				.then(reasons => reasons.map(reason => reason.reason));

			const pendingValidatedByUserName = globals.poolRO.query(`SELECT user_name FROM users WHERE user_id = ?`, [row.validatedBy])
				.then(rows => rows?.[0])
				.then(user => user ? user.user_name : null);

			const [listedOn, notListedReasons, validatedByUserName] =
				await Promise.all([pendingListedOn, pendingNotListedReasons, pendingValidatedByUserName]);

			return {
				...row,
				listedOn,
				listedOnMarketplace: !!row.listedOnMarketplace,
				notListedReasons,
				validated: row.validated !== 0,
				validatedByUserName
			};
		})));

	return resp;
}


exports.getVendorSkusByVendorId = (vendorId) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('SELECT vendor_sku FROM vendor_catalog_products WHERE vendor_id = ?', [vendorId])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}




exports.getAllCoinlessProducts = (offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}
		globals.productPool.query('SELECT COUNT(*) as num FROM vendor_catalog_products p LEFT JOIN coins_to_vendor_skus c ON p.vendor_id = c.vendor_id AND p.vendor_sku = c.vendor_sku ' +
				'WHERE c.vendor_id IS NULL')
			.then((count) => {
				resp.totalCount = count[0].num;
				// console.log("SELECT * FROM vendor_catalog_products " + where + " " + sortBy + " " + offset + "," + limit);
				var sql = 'SELECT p.sku, p.variant_sku, p.vendor_id, p.vendor_sku, p.upc, p.manufacturer, p.mpn ' +
					'FROM vendor_catalog_products p LEFT JOIN coins_to_vendor_skus c ON p.vendor_id = c.vendor_id AND p.vendor_sku = c.vendor_sku ' +
					'WHERE c.vendor_id IS NULL ' +
					'ORDER BY variant_sku';

				if (limit !== undefined) {
					sql = sql + ' LIMIT ?,?';
				}
				return globals.productPool.query(sql, [offset, limit]);
			})
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getCatalogJobsByVendorId = (id, offset, limit) => {
	return new Promise((resolve, reject) => {
		var jobs = null;
		var resp = {
			totalCount: 0,
			rows: []
		}
		globals.productPool.query('SELECT count(*) as num FROM vendor_catalog_jobs WHERE vendor_id = ?', [id])
			.then((count) => {
				resp.totalCount = count[0].num;

				return globals.productPool.query('SELECT * FROM vendor_catalog_jobs WHERE vendor_id = ? ORDER BY date_created DESC LIMIT ?,?', [id, offset, limit]);
			})
			.then((rows) => {
				jobs = rows;

				return getJobSubmitterInfo(jobs);
			})
			.then((results) => {
				jobs = results;

				colUtils.outboundNaming(jobs);

				resp.rows = jobs;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getFreePrefixes = () => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('SELECT count(*) as num FROM vendor_prefixes WHERE vendor_id IS NULL')
			.then((count) => {
				resolve(count[0].num);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getInventoryJobsByVendorId = (id, offset, limit) => {
	return new Promise((resolve, reject) => {
		var jobs = null;
		var resp = {
			totalCount: 0,
			rows: []
		}
		globals.productPool.query('SELECT count(*) as num FROM vendor_inventory_jobs WHERE vendor_id = ?', [id])
			.then((count) => {
				resp.totalCount = count[0].num;

				return globals.productPool.query('SELECT * FROM vendor_inventory_jobs WHERE vendor_id = ? ORDER BY date_created DESC LIMIT ?,?', [id, offset, limit]);
			})
			.then((rows) => {
				jobs = rows;

				return getJobSubmitterInfo(jobs);
			})
			.then((results) => {
				jobs = results;

				colUtils.outboundNaming(jobs);

				resp.rows = jobs;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

var getJobSubmitterInfo = (jobs) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		for (var i = 0; i < jobs.length; i++) {
			if ((jobs[i].submitter_id.length < 24) && (parseInt(jobs[i].submitter_id) !== NaN)) {
				prom.push(Users.getById(jobs[i].submitter_id));
			} else {
				prom.push(Vendors.getById(jobs[i].submitter_id));
			}
		}

		Promise.all(prom)
			.then((submitters) => {
				for (var i = 0; i < jobs.length; i++) {
					jobs[i].submitter = {};
					if (submitters[i].length > 0) {
						jobs[i].submitter.id = submitters[i][0].userId ? submitters[i][0].userId : submitters[i][0].id;
						jobs[i].submitter.name = submitters[i][0].userName ? submitters[i][0].userName : submitters[i][0].name;
						jobs[i].submitter.email = submitters[i][0].email;
					}
				}
				resolve(jobs);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getColumnMappings = (vid) => {
	return new Promise((resolve, reject) => {
		var resp = {
			rows: []
		}
		globals.productPool.query('SELECT * FROM vendor_catalog_column_mappings WHERE vendor_id = ?', [vid])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getColumnLabelMappings = (vid) => {
	return new Promise((resolve, reject) => {
		var resp = {
			rows: []
		}
		globals.productPool.query('SELECT * FROM vendor_catalog_column_label_mappings WHERE vendor_id = ?', [vid])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getDistinctManuMPN = async () => {
	var rows = await globals.productPool.query("SELECT DISTINCT(CONCAT(manufacturer, mpn)) FROM vendor_catalog_products WHERE manufacturer IS NOT NULL AND mpn IS NOT NULL ORDER BY CONCAT(manufacturer, mpn)");
	colUtils.outboundNaming(rows);

	return rows;
}


exports.getInventoryWorksheetInfo = (vid) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('SELECT * FROM vendor_inventory_worksheet_info WHERE vendor_id = ?', [vid])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows[0]);
			})
			.catch((e) => {
				reject(e);
			})
	});
}




exports.getMultipleUPCs = () => {
	return new Promise((resolve, reject) => {
		var sql = "SELECT id, vendor_sku, upc, manufacturer, mpn, COUNT(*) AS num " +
			"FROM vendor_catalog_products " +
			"WHERE upc IS NOT NULL " +
			"GROUP BY upc HAVING num > 1 "
		"ORDER BY num DESC";

		globals.productPool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}




exports.getUPCsByMPN = async (upc) => {
	var rows = await globals.productPool.query("SELECT vendor_id, vendor_sku, upc, manufacturer, mpn, CONCAT(manufacturer, mpn), COUNT(*) AS num " +
		"FROM vendor_catalog_products " +
		"WHERE manufacturer IS NOT NULL AND mpn IS NOT NULL AND upc = ? " +
		"GROUP BY CONCAT(manufacturer, mpn)", [upc]);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getVendorsWithDupeUPCs = async (upc) => {
	var rows = await globals.productPool.query("SELECT vendor_id FROM vendor_catalog_products p WHERE upc = ? GROUP BY vendor_id HAVING COUNT(*) > 1", [upc]);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getManuMPNsWithSameUPCs = async (upc) => {
	var rows = await globals.productPool.query("SELECT vendor_id FROM vendor_catalog_products p WHERE upc = ? GROUP BY vendor_id HAVING COUNT(*) > 1", [upc]);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getDiscrepancyDataByUPCVendor = async (upc, vendorId) => {
	var rows = await globals.productPool.query("SELECT p.id, v.name AS vendor_name, vendor_sku, upc, manufacturer, mpn " +
		"FROM vendor_catalog_products p, vendors v " +
		"WHERE v.id = p.vendor_id AND p.vendor_id = ? AND upc = ?", [vendorId, upc]);
	colUtils.outboundNaming(rows);

	return rows;
}



exports.getProductById = async (vid, pid) => {
	var rows = await globals.productPool.query(`SELECT c.id AS coin_id, c.listed_on_marketplace, p.*, v.name as vendor_name
																FROM vendor_catalog_products p 
																	LEFT JOIN vendors v ON v.id = p.vendor_id 
																	LEFT JOIN coins_to_vendor_skus cv ON ((p.vendor_id = cv.vendor_id) AND (p.vendor_sku = cv.vendor_sku)) 
																	LEFT JOIN coins c ON c.id = cv.coin_id
																WHERE p.vendor_id = ? AND p.id = ?`, [vid, pid])
	colUtils.outboundNaming(rows);

	if (rows.length === 1) {
		rows[0].listedOn = [];
		rows[0].notListedReasons = [];

		if (rows[0].coinId !== null) {
			var listedOn = await globals.productPool.query("SELECT lo.platform FROM coins_to_listed_on clo LEFT JOIN listed_on lo ON clo.listed_on_id = lo.id WHERE clo.coin_id = ?", [rows[0].coinId]);
			for (var j = 0; j < listedOn.length; j++) {
				rows[0].listedOn.push(listedOn[j].platform);
			}

			var reasons = await globals.productPool.query("SELECT nlr.reason FROM coins_to_not_listed_reasons cnlr LEFT JOIN not_listed_reasons nlr ON cnlr.not_listed_reason_id = nlr.id WHERE cnlr.coin_id = ?", [rows[0].coinId]);
			for (var j = 0; j < reasons.length; j++) {
				rows[0].notListedReasons.push(reasons[j].reason);
			}
		}

		if (rows[0].validated === 1) {
			rows[0].validated = true;
	
			var user = await globals.poolRO.query("SELECT user_name as validated_by_user_name FROM users WHERE user_id = ?", [rows[0].validatedBy]);
			if (user.length > 0) {
				rows[0].validatedByUserName = user[0].validated_by_user_name;
			}
		} else {
			rows[0].validated = false;
			rows[0].validatedByUserName = null;
		}
	}

	return rows;
}

exports.getProductByVendorManufacturerMPN = (product, conn) => {
	return new Promise((resolve, reject) => {
		var prom = null;
		var sql = 'SELECT * FROM vendor_catalog_products WHERE vendor_id = ? AND manufacturer = ? AND mpn = ?';
		var values = [product.vendorId, product.manufacturer, product.mpn];

		if (conn !== undefined) {
			prom = conn.query(sql, values)
		} else {
			prom = globals.productPool.query(sql, values)
		}

		prom.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getVSkuByManufacturer = (manufacturer, conn) => {
	return new Promise((resolve, reject) => {
		var prom = null;
		var sql = 'SELECT CONCAT(vendor_id, vendor_sku) as vsku FROM vendor_catalog_products WHERE manufacturer = ?';
		var values = [manufacturer];

		if (conn !== undefined) {
			prom = conn.query(sql, values)
		} else {
			prom = globals.productPool.query(sql, values)
		}

		prom.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getProductByVendorUPC = (product, conn) => {
	return new Promise((resolve, reject) => {
		var prom = null;
		var sql = 'SELECT * FROM vendor_catalog_products WHERE vendor_id = ? AND upc = ?';
		var values = [product.vendorId, product.upc];

		if (conn !== undefined) {
			prom = conn.query(sql, values)
		} else {
			prom = globals.productPool.query(sql, values)
		}

		prom.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getProductByMPN = (vendorId, mpn, conn) => {
	return new Promise((resolve, reject) => {
		var prom = null;
		var sql = 'SELECT * FROM vendor_catalog_products WHERE vendor_id = ? AND mpn = ?';
		var values = [vendorId, mpn];

		if (conn !== undefined) {
			prom = conn.query(sql, values)
		} else {
			prom = globals.productPool.query(sql, values)
		}

		prom.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getProductByVendorSku = (vid, vsku, conn) => {
	return new Promise((resolve, reject) => {
		var prom = null;
		var sql = 'SELECT * FROM vendor_catalog_products WHERE vendor_id = ? AND vendor_sku = ?';
		var values = [vid, vsku];

		if (conn !== undefined) {
			prom = conn.query(sql, values)
		} else {
			// console.log(mysql.format(sql, values))
			prom = globals.productPool.query(sql, values)
		}

		prom.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getPullForwardProductByCoin = (coin, conn) => {
	return new Promise((resolve, reject) => {
		var prom = null;
		var sql = "SELECT p.*  " +
			"FROM coins_to_vendor_skus c1 " +
			"LEFT JOIN coins_to_vendor_skus c2 ON c1.coin_id = c2.coin_id " +
			"LEFT JOIN vendor_catalog_products p ON ((p.vendor_id = c2.vendor_id) AND (p.vendor_sku = c2.vendor_sku)) " +
			"WHERE pull_data_forward_flag = 1 " +
			"AND c2.coin_id = ? " +
			"GROUP BY p.vendor_id, p.vendor_sku";
		var values = [coin];

		if (conn !== undefined) {
			prom = conn.query(sql, values)
		} else {
			prom = globals.productROPool.query(sql, values)
		}

		prom.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getPullForwardProductByCoins = async (coins) => {
	var prom = null;
	var sql = `SELECT c1.coin_id, p.*  
									FROM coins_to_vendor_skus c1 
										LEFT JOIN coins_to_vendor_skus c2 ON c1.coin_id = c2.coin_id 
										LEFT JOIN vendor_catalog_products p ON ((p.vendor_id = c2.vendor_id) AND (p.vendor_sku = c2.vendor_sku)) 
									WHERE pull_data_forward_flag = 1 
										AND c2.coin_id IN (${coins}) 
									GROUP BY p.vendor_id, p.vendor_sku`;

	// console.log(mysql.format(sql));									
	var rows = await globals.productROPool.query(sql)
	colUtils.outboundNaming(rows);
	return rows;
}



exports.getReadyCatalogJobs = () => {
	return new Promise((resolve, reject) => {
		var jobs = null;
		var prom = [];

		globals.productPool.query("SELECT * FROM vendor_catalog_jobs WHERE status = 'QUEUED' ORDER BY date_created LIMIT 0,1")
			.then((rows) => {
				jobs = rows;

				return getJobSubmitterInfo(jobs);
			})
			.then((results) => {
				jobs = results;

				colUtils.outboundNaming(jobs);
				resolve(jobs);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getReadyInventoryJobs = () => {
	return new Promise((resolve, reject) => {
		var jobs = null;
		var prom = [];

		globals.productPool.query("SELECT * FROM vendor_inventory_jobs WHERE status = 'QUEUED' ORDER BY date_created LIMIT 0,1")
			.then((rows) => {
				jobs = rows;

				return getJobSubmitterInfo(jobs);
			})
			.then((results) => {
				jobs = results;

				colUtils.outboundNaming(jobs);
				resolve(jobs);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getTRMTemplateColumnInfo = () => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('SELECT * FROM trm_template_columns ORDER BY display_order')
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getVendorSchema = () => {
	return new Promise((resolve, reject) => {
		var sql = 'SELECT column_name, column_default, data_type, character_maximum_length, numeric_precision, numeric_scale, ' +
			"datetime_precision, column_type FROM information_schema.columns WHERE table_schema = 'vendors' and table_name = 'vendors' " +
			'ORDER BY ordinal_position';
		globals.productPool.query(sql)
			.then((rows) => {
				colUtils.outboundNaming(rows);
				rows.forEach((row) => {
					if (row.dataType === 'enum') {
						var values = row.columnType.substring(5, row.columnType.length - 1).replace(/'/g, '');
						row.enumValues = values.split(',');
					}
				})
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getWorksheetInfo = (vid) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('SELECT * FROM vendor_catalog_worksheet_info WHERE vendor_id = ?', [vid])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.assignSku = async (conn, vendorId, masterId) => {
	var prefix = null;
	var result = null;
	var sequence = null;
	var skuInfo = {
		sku: null,
		variantSku: null,
		variantSequence: null
	};

	var closeConnection = false;
	if (conn === undefined) {
		closeConnection = true;
		conn = await globals.productPool.getConnection();
	}


	// If masterId != NULL check to see if a sku with this master is already in table.
	if (masterId != null) {
		result = await conn.query('SELECT sku FROM vendor_catalog_products WHERE vendor_id = ? AND master_id = ?', [vendorId, masterId]);
	}

	// If masterId is NULL, assign a new parent sku
	if ((masterId === null) || ((masterId != null) && (result.length === 0))) {
		result = await conn.query('SELECT prefix, next_sku_sequence FROM vendor_prefixes WHERE vendor_id = ? AND next_sku_sequence <= 9999 FOR UPDATE', [vendorId]);
		if (result.length === 0) {
			result = await assignVendorPrefix(conn, vendorId);

			prefix = result;
			sequence = 1;
		} else {
			prefix = result[0].prefix;
			sequence = result[0].next_sku_sequence ? result[0].next_sku_sequence : 1;
		}

		skuInfo.sku = prefix + sequence.toString().padStart(4, '0');
		skuInfo.variantSku = skuInfo.sku + '-1';
		skuInfo.variantSequence = 1;
		await conn.query('UPDATE vendor_prefixes SET next_sku_sequence = next_sku_sequence + 1 WHERE vendor_id = ? AND prefix = ?', [vendorId, prefix]);
	} else {
		//	Assign a new variant sku
		result = await conn.query('SELECT p1.sku, MAX(p1.variant_sequence) AS seq ' +
			'FROM vendor_catalog_products p1 LEFT JOIN vendor_catalog_products p2 ON p1.sku = p2.sku ' +
			'WHERE p1.vendor_id = ? AND p2.master_id = ?', [vendorId, masterId]);
		if (result.length === 0) {
			throw new Error('Referenced master ID ' + masterId + ' for vendor ' + vendorId + ' not found.  This should never happen.');
		}
		var newSeq = result[0].seq + 1;
		skuInfo.sku = result[0].sku;
		skuInfo.variantSku = skuInfo.sku + '-' + newSeq;
		skuInfo.variantSequence = newSeq;
	}

	if (closeConnection) {
		globals.productPool.releaseConnection(conn);
	}

	return skuInfo;
}

var mergeProduct = (conn, skuInfo, row, fixedSQL) => {
	return new Promise((resolve, reject) => {
		// console.log(JSON.stringify(result, undefined, 2));
		// return conn.query(sql);
		// console.log("SKU: " + sku);
		// console.log("INSERT INTO vendor_catalog_products (id, vendor_id, vendor_sku, sku) VALUES ('" + id + "', '" + vendorId + "', '" + vendorSku + "', '" + sku + "')");
		conn.query("INSERT INTO vendor_catalog_products (id, vendor_id, vendor_sku, sku) VALUES ('" + id + "', '" + vendorId + "', '" + vendorSku + "', '" + sku + "')")
			.then((results) => {
				resolve();
			})
			.catch((e) => {
				reject(e);
			})
	})
}

var buildProductUpdateSQL = (row, fixedSQL, skuInfo, colArray) => {
	var valArray = [];

	for (var i = 0; i < 2; i++) {
		for (var j = 0; j < colArray.length; j++) {
			if (colArray[j] != 'id') {
				valArray.push(row[colArray[j]]);
			}
		}
		valArray.push(row['eligible_for_trm']);
		valArray.push(row['eligible_for_inline']);
		valArray.push(row['eligible_for_bulk_buys']);
		valArray.push(row['eligible_for_off_price']);
		valArray.push(row['eligible_for_cost_based_returns']);
		valArray.push(row['eligible_for_rev_share_returns']);
		valArray.push(row['validation_errors']);
		valArray.push(row['core_eligibility_errors']);
		valArray.push(row['trm_eligibility_errors']);
		valArray.push(row['inline_eligibility_errors']);
		valArray.push(row['bulk_buys_eligibility_errors']);
		valArray.push(row['off_price_eligibility_errors']);
		valArray.push(row['cost_based_returns_eligibility_errors']);
		valArray.push(row['rev_share_returns_eligibility_errors']);
		valArray.push(row['search_field']);
	}

	var sql = mysql.format('UPDATE vendor_catalog_products SET date_modified = now(), ' + fixedSQL.updateClause + ', ' +
		'eligible_for_trm = ?, eligible_for_inline = ?, eligible_for_bulk_buys = ?, eligible_for_off_price = ?, eligible_for_cost_based_returns = ?, eligible_for_rev_share_returns = ?, ' +
		'validation_errors = ?, core_eligibility_errors = ?, trm_eligibility_errors = ?, inline_eligibility_errors = ?, bulk_buys_eligibility_errors = ?, off_price_eligibility_errors = ?, cost_based_returns_eligibility_errors = ?, rev_share_returns_eligibility_errors = ?, search_field = ? ' +
		"WHERE vendor_id = '" + row['vendor_id'] + "' AND vendor_sku = '" + row['vendor_sku'] + "'", valArray);

	return sql;
}

// exports.mergeProducts = (mappings, uuid) => {
// 	return new Promise((resolve, reject) => {
// 		var conn = null;
// 		var colArray = [];
// 		var resp = {
// 			statusCode: 200,
// 			messages: 'Success',
// 			rows: 0
// 		}

// 		globals.productPool.getConnection()
// 			.then((connection) => {
// 				conn = connection;
// 			})
// 			.then((result) => {
// 				return conn.query("SELECT * FROM information_schema.tables WHERE table_schema = 'vendors' AND table_name = 'vendor_catalog_import_" + uuid + "' LIMIT 1")
// 			})
// 			.then((rows) => {

// 				//	Validate that the temp table exists and error if not.
// 				if (rows.length === 0) {
// 					resp.statusCode = 404;
// 					resp.message = "Upload table vendor_catalog_import_" + uuid + " doesn't exist.";
// 					resolve(resp);
// 				} else {
// 					colArray.push('id');
// 					colArray.push('vendor_id');
// 					buildColArray(conn, mappings, colArray)
// 						.then((result) => {

// 							// Grab all the rows from the temp table.
// 							return conn.query("SELECT * FROM vendor_catalog_import_" + uuid + " ORDER BY sheet_row");
// 						})
// 						.then((rows) => {
// 							return writeRows(conn, colArray, rows);
// 						})
// 						.then((result) => {
// 							return conn.query("DROP TABLE vendor_catalog_import_" + uuid);
// 						})
// 						.then((result) => {
// 							resolve(resp);
// 						})
// 						.catch((e) => {
// 							reject(e);
// 						})
// 				}
// 			})
// 			.catch((e) => {
// 				reject(e);
// 			})
// 			.finally(() => {
// 				globals.productPool.releaseConnection(conn);
// 			});
// 	});
// }

exports.getProductSchema = async (conn) => {
	var closeConnection = false;

	if (conn === undefined) {
		closeConnection = true;
		conn = await globals.productPool.getConnection();
	}
	var rows = await conn.query("SELECT * FROM information_schema.columns WHERE table_schema='vendors' AND table_name = 'vendor_catalog_products' ORDER BY ordinal_position");
	if (closeConnection) {
		globals.productPool.releaseConnection(conn);
	}

	return rows;
}

exports.getVendorProductSchema = () => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("SELECT * FROM information_schema.columns WHERE table_schema='vendors' AND table_name = 'vendor_catalog_products' ORDER BY ordinal_position")
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.checkTempTableExists = (conn, uuid) => {
	return new Promise((resolve, reject) => {
		conn.query("SELECT * FROM information_schema.tables WHERE table_schema = 'vendors' AND table_name = 'vendor_catalog_import_" + uuid + "' LIMIT 1")
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.dropTempTable = (conn, uuid) => {
	return new Promise((resolve, reject) => {
		conn.query('DROP TABLE vendor_catalog_import_' + uuid)
			.then((result) => {
				resolve(result);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.getTempTableData = (conn, uuid) => {
	return new Promise((resolve, reject) => {
		conn.query('SELECT * FROM vendor_catalog_import_' + uuid + ' ORDER BY sheet_row')
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.failCatalogJob = (id, msg) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("UPDATE vendor_catalog_jobs SET date_modified = now(), status = 'FAILED', error_msg = '" + msg.replace(/'/g, "\\'") + "' WHERE id = '" + id + "'")
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.failInventoryJob = (id, msg) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("UPDATE vendor_inventory_jobs SET date_modified = now(), status = 'FAILED', error_msg = '" + msg.replace(/'/g, "\\'") + "' WHERE id = '" + id + "'")
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.startCatalogJob = (id) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("UPDATE vendor_catalog_jobs SET date_modified = now(), status = 'INPROGRESS' WHERE id = '" + id + "'")
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.startInventoryJob = (id) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("UPDATE vendor_inventory_jobs SET date_modified = now(), status = 'INPROGRESS' WHERE id = '" + id + "'")
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.updateById = async (id, body, internalFlag) => {
	try {
		var conn = await globals.productPool.getConnection();
		await conn.beginTransaction();

		var sql = 'UPDATE vendors SET date_modified = now()';
		var values = [];

		//	
		//	The following are only updatable by INTERNAL users.
		//
		if ((internalFlag === undefined) || (internalFlag === true)) {
			sql = colUtils.columnUpdate(sql, values, body.name, 'name', false);
			sql = colUtils.columnUpdate(sql, values, body.notes, 'notes', true);

			//	Receiving Requirements
			sql = colUtils.columnUpdate(sql, values, body.shippingLabelPhotoRequired, 'shipping_label_photo_required', true);
			sql = colUtils.columnUpdate(sql, values, body.shippingLabelPhotoRequiredDaily, 'shipping_label_photo_required_daily', true);
			sql = colUtils.columnUpdate(sql, values, body.shippingLabelPhotoRequiredBulkReturns, 'shipping_label_photo_required_bulk_returns', true);
			sql = colUtils.columnUpdate(sql, values, body.shippingLabelPhotoRequiredBulkOverstock, 'shipping_label_photo_required_bulk_overstock', true);
			sql = colUtils.columnUpdate(sql, values, body.trackingNumberRequired, 'tracking_number_required', true);
			sql = colUtils.columnUpdate(sql, values, body.trackingNumberRequiredDaily, 'tracking_number_required_daily', true);
			sql = colUtils.columnUpdate(sql, values, body.trackingNumberRequiredBulkReturns, 'tracking_number_required_bulk_returns', true);
			sql = colUtils.columnUpdate(sql, values, body.trackingNumberRequiredBulkOverstock, 'tracking_number_required_bulk_overstock', true);
			sql = colUtils.columnUpdate(sql, values, body.trashPhotoRequired, 'trash_photo_required', true);
			sql = colUtils.columnUpdate(sql, values, body.trashPhotoRequiredDaily, 'trash_photo_required_daily', true);
			sql = colUtils.columnUpdate(sql, values, body.trashPhotoRequiredBulkReturns, 'trash_photo_required_bulk_returns', true);
			sql = colUtils.columnUpdate(sql, values, body.trashPhotoRequiredBulkOverstock, 'trash_photo_required_bulk_overstock', true);

			//	Supplier Codes
			sql = colUtils.columnUpdate(sql, values, body.supplierCodePrefix, 'supplier_code_prefix', false);

			//	Partner Setup
			sql = colUtils.columnUpdate(sql, values, body.partnerContractType, 'partner_contract_type', false);
			sql = colUtils.columnUpdate(sql, values, body.dsSignedContract, 'ds_signed_contract', true);
			sql = colUtils.columnUpdate(sql, values, body.rbrSignedContract, 'rbr_signed_contract', true);
			sql = colUtils.columnUpdate(sql, values, body.map, 'map', true);
			if (body.lockPricing != undefined) {
				sql = colUtils.columnUpdate(sql, values, body.lockPricing.toUpperCase(), 'lock_pricing', false);
			}
			sql = colUtils.columnUpdate(sql, values, body.dropShipFee, 'drop_ship_fee', true);
			sql = colUtils.columnUpdate(sql, values, body.processingFee, 'processing_fee', true);
			sql = colUtils.columnUpdate(sql, values, body.invoiceMethod, 'invoice_method', true);
			sql = colUtils.columnUpdate(sql, values, body.partnerRevSharePercent, 'partner_rev_share_percent', true);
			sql = colUtils.columnUpdate(sql, values, body.paymentTerms, 'payment_terms', true);
			sql = colUtils.columnUpdate(sql, values, body.outletRevSharePercent, 'outlet_rev_share_percent', true);
			sql = colUtils.columnUpdate(sql, values, body.outletSiteAddress, 'outlet_site_address', true);

			//	Admin
			if ((body.manifestId !== undefined) && (body.manifestId !== null)) {
				sql = colUtils.columnUpdate(sql, values, body.manifestId, 'manifest_id', true);
			}
			sql = colUtils.columnUpdate(sql, values, body.rating, 'rating', false);
			sql = colUtils.columnUpdate(sql, values, body.status, 'status', false);
			sql = colUtils.columnUpdate(sql, values, body.rrcStatus, 'rrc_status', false);
			sql = colUtils.columnUpdate(sql, values, body.rrcNavCreateSellableProducts, 'rrc_nav_create_sellable_products', false);
			sql = colUtils.columnUpdate(sql, values, body.rrcAllowReturnRouting, 'rrc_allow_return_routing', false);
			sql = colUtils.columnUpdate(sql, values, body.rrcAllowLtlReturns, 'rrc_allow_ltl_returns', false);
			sql = colUtils.columnUpdate(sql, values, body.rrcLtlReturnsShowEstRecovery, 'rrc_ltl_returns_show_est_recovery', false);
			sql = colUtils.columnUpdate(sql, values, body.alias, 'alias', false);
			//	Prefixes?
			sql = colUtils.columnUpdate(sql, values, body.tariff, 'tariff', true);
			sql = colUtils.columnUpdate(sql, values, body.leadTime, 'lead_time', true);
			sql = colUtils.columnUpdate(sql, values, body.shippingCutoffCst, 'shipping_cutoff_cst', false);
			sql = colUtils.columnUpdate(sql, values, body.damageDefectiveAllowance, 'damage_defective_allowance', true);
			sql = colUtils.columnUpdate(sql, values, body.preferenceAllowance, 'preference_allowance', true);
			sql = colUtils.columnUpdate(sql, values, body.manufacturerWarranty, 'manufacturer_warranty', true);


			//	Product Availability
			sql = colUtils.columnUpdate(sql, values, body.rushMarketAvailability, 'rush_market_availability', false);


			//	Feeds
			sql = colUtils.columnUpdate(sql, values, body.catalogFeedType, 'catalog_feed_type', false);
			sql = colUtils.columnUpdate(sql, values, body.catalogFeedFormat, 'catalog_feed_format', false);
			sql = colUtils.columnUpdate(sql, values, body.catalogFeedFreq, 'catalog_feed_freq', false);
			sql = colUtils.columnUpdate(sql, values, body.catalogScheduleStart, 'catalog_schedule_start', false);
			sql = colUtils.columnUpdate(sql, values, body.catalogScheduleIntervalHours, 'catalog_schedule_interval_hours', false);
			sql = colUtils.columnUpdate(sql, values, body.inventoryFeed, 'inventory_feed', true);
			sql = colUtils.columnUpdate(sql, values, body.inventoryFeedType, 'inventory_feed_type', false);
			sql = colUtils.columnUpdate(sql, values, body.inventoryFeedFormat, 'inventory_feed_format', false);
			sql = colUtils.columnUpdate(sql, values, body.inventoryFeedFreq, 'inventory_feed_freq', false);
			sql = colUtils.columnUpdate(sql, values, body.inventoryScheduleStart, 'inventory_schedule_start', false);
			sql = colUtils.columnUpdate(sql, values, body.inventoryScheduleIntervalHours, 'inventory_schedule_interval_hours', false);
			sql = colUtils.columnUpdate(sql, values, body.inventoryUploadProcess, 'inventory_upload_process', false);


			//	Others (not currently on UI)
			sql = colUtils.columnUpdate(sql, values, body.internalSeller, 'internal_seller', true);
			sql = colUtils.columnUpdate(sql, values, body.groupQuantities, 'group_quantities', true);
			sql = colUtils.columnUpdate(sql, values, body.calculateCost, 'calculate_cost', true);
			sql = colUtils.columnUpdate(sql, values, body.manifestIdUpload, 'manifest_id_upload', true);
			sql = colUtils.columnUpdate(sql, values, body.isParsingTemplate, 'is_parsing_template', true);
			sql = colUtils.columnUpdate(sql, values, body.useParsingTemplate, 'use_parsing_template', true);
			sql = colUtils.columnUpdate(sql, values, body.buyerId, 'buyer_id', true);
			sql = colUtils.columnUpdate(sql, values, body.manifestSellerFlag, 'manifest_seller_flag', true);

			sql = colUtils.columnUpdate(sql, values, body.partnerOutletName, 'partner_outlet_name', true);

		}


		//
		//	The following are updateable by all users.
		//


		sql = colUtils.columnUpdate(sql, values, body.passwordResetFlag, 'password_reset_flag', true);
		sql = colUtils.columnUpdate(sql, values, body.verificationId, 'verification_id', true);

		//	Company Info
		sql = colUtils.columnUpdate(sql, values, body.email, 'email', false);
		if ((body.password !== undefined) && (body.password !== null)) {
			var hash = bcrypt.hashSync(body.password, SALT_WORK_FACTOR);
			sql = sql + ", password = ?";
			values.push(hash);
		}
		sql = colUtils.columnUpdate(sql, values, body.taxIdNumber, 'tax_id_number', true);
		sql = colUtils.columnUpdate(sql, values, body.dba, 'dba', true);
		sql = colUtils.columnUpdate(sql, values, body.companyAddress1, 'company_address1', true);
		sql = colUtils.columnUpdate(sql, values, body.companyAddress2, 'company_address2', true);
		sql = colUtils.columnUpdate(sql, values, body.companyCity, 'company_city', true);
		sql = colUtils.columnUpdate(sql, values, body.companyStateOrProvince, 'company_state_or_province', true);
		sql = colUtils.columnUpdate(sql, values, body.companyPostalCode, 'company_postal_code', true);
		sql = colUtils.columnUpdate(sql, values, body.companyCountry, 'company_country', true);
		sql = colUtils.columnUpdate(sql, values, body.websiteAddress, 'website_address', true);

		//	Contacts
		sql = colUtils.columnUpdate(sql, values, body.apName, 'ap_name', true);
		sql = colUtils.columnUpdate(sql, values, body.apEmail, 'ap_email', true);
		sql = colUtils.columnUpdate(sql, values, body.apPhone, 'ap_phone', true);
		sql = colUtils.columnUpdate(sql, values, body.apAddress1, 'ap_address1', true);
		sql = colUtils.columnUpdate(sql, values, body.apAddress2, 'ap_address2', true);
		sql = colUtils.columnUpdate(sql, values, body.apCity, 'ap_city', true);
		sql = colUtils.columnUpdate(sql, values, body.apStateOrProvince, 'ap_state_or_province', true);
		sql = colUtils.columnUpdate(sql, values, body.apPostalCode, 'ap_postal_code', true);
		sql = colUtils.columnUpdate(sql, values, body.apCountry, 'ap_country', true);
		sql = colUtils.columnUpdate(sql, values, body.csName, 'cs_name', true);
		sql = colUtils.columnUpdate(sql, values, body.csEmail, 'cs_email', true);
		sql = colUtils.columnUpdate(sql, values, body.csPhone, 'cs_phone', true);
		sql = colUtils.columnUpdate(sql, values, body.orderName, 'order_name', true);
		sql = colUtils.columnUpdate(sql, values, body.orderEmail, 'order_email', true);
		sql = colUtils.columnUpdate(sql, values, body.orderPhone, 'order_phone', true);
		sql = colUtils.columnUpdate(sql, values, body.provideReplacementParts, 'provide_replacement_parts', true);
		sql = colUtils.columnUpdate(sql, values, body.partsName, 'parts_name', true);
		sql = colUtils.columnUpdate(sql, values, body.partsEmail, 'parts_email', true);
		sql = colUtils.columnUpdate(sql, values, body.partsPhone, 'parts_phone', true);
		sql = colUtils.columnUpdate(sql, values, body.replacementPartsAdditional, 'replacement_parts_additional', true);
		sql = colUtils.columnUpdate(sql, values, body.ltlReturnsName, 'ltl_returns_name', true);
		sql = colUtils.columnUpdate(sql, values, body.ltlReturnsEmail, 'ltl_returns_email', true);
		sql = colUtils.columnUpdate(sql, values, body.ltlReturnsPhone, 'ltl_returns_phone', true);
		sql = colUtils.columnUpdate(sql, values, body.salesName, 'sales_name', true);
		sql = colUtils.columnUpdate(sql, values, body.salesEmail, 'sales_email', true);
		sql = colUtils.columnUpdate(sql, values, body.salesPhone, 'sales_phone', true);
		sql = colUtils.columnUpdate(sql, values, body.transportationName, 'transportation_name', true);
		sql = colUtils.columnUpdate(sql, values, body.transportationEmail, 'transportation_email', true);
		sql = colUtils.columnUpdate(sql, values, body.transportationPhone, 'transportation_phone', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse1Address1, 'warehouse1_address1', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse1Address2, 'warehouse1_address2', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse1City, 'warehouse1_city', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse1StateOrProvince, 'warehouse1_state_or_province', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse1PostalCode, 'warehouse1_postal_code', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse1Country, 'warehouse1_country', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse1Lat, 'warehouse1_lat', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse1Long, 'warehouse1_long', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse2Address1, 'warehouse2_address1', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse2Address2, 'warehouse2_address2', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse2City, 'warehouse2_city', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse2StateOrProvince, 'warehouse2_state_or_province', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse2PostalCode, 'warehouse2_postal_code', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse2Country, 'warehouse2_country', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse2Lat, 'warehouse2_lat', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse2Long, 'warehouse2_long', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse3Address1, 'warehouse3_address1', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse3Address2, 'warehouse3_address2', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse3City, 'warehouse3_city', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse3StateOrProvince, 'warehouse3_state_or_province', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse3PostalCode, 'warehouse3_postal_code', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse3Country, 'warehouse3_country', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse3Lat, 'warehouse3_lat', true);
		sql = colUtils.columnUpdate(sql, values, body.warehouse3Long, 'warehouse3_long', true);


		sql = colUtils.columnUpdate(sql, values, body.rrcProductEdit, 'rrc_product_edit', false);



		values.push(id);
		sql = sql + ' WHERE id = ?';

		// console.log(mysql.format(sql, values));
		var result = await conn.query(sql, values);

		//	
		//	The following are only updatable by INTERNAL users.
		//
		if ((internalFlag === undefined) || (internalFlag === true)) {

			//Supplier Codes
			if ((body.supplierCodes !== undefined) && (body.supplierCodes !== null)) {
				await conn.query('DELETE FROM vendor_supplier_codes WHERE vendor_id = ?', [id]);

				for (var i = 0; i < body.supplierCodes.length; i++) {
					if (configUtils.get("FEAT_FLAG_RM_2464_VENDOR_SUPPLIER_CODES") === "ON") {
						await conn.query('INSERT INTO vendor_supplier_codes (vendor_id, supplier_Code, store_id, type, charge_disposal_fees, charge_processing_fees, default_condition, pay_partner_fees) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, body.supplierCodes[i].code, body.supplierCodes[i].storeId, body.supplierCodes[i].type, body.supplierCodes[i].chargeDisposalFees, body.supplierCodes[i].chargeProcessingFees, body.supplierCodes[i].defaultCondition, body.supplierCodes[i].payPartnerFees]);
					} else {
						await conn.query('INSERT INTO vendor_supplier_codes (vendor_id, supplier_Code) VALUES (?, ?)', [id, body.supplierCodes[i]]);
					}
				}
			}

			//	Partner Setup
			if ((body.partnerTypes !== undefined) && (body.partnerTypes !== null)) {
				var pTypes = await conn.query('SELECT id,type FROM vendor_partner_types');
				await conn.query('DELETE FROM vendor_to_partner_types WHERE vendor_id = ?', [id]);

				// If partner type is 'RBR', create a default RBR manifest for
				// vendor if it does not already exist
				const rbrPartnerType = _.find(pTypes, ['type', 'RBR']);
				if (body.partnerTypes.findIndex(id => id === rbrPartnerType.id) !== -1) {
					const manifests = await Manifests.getRBRByVendorId(id);
					if (!manifests || manifests.length === 0) {
						const vendor = await Vendors.getById(id);
						await Manifests.createRBRManifest(undefined, vendor[0]);
					}
				}

				for (var i = 0; i < body.partnerTypes.length; i++) {
					if (_.findIndex(pTypes, ['id', body.partnerTypes[i]]) === -1) {
						throw new Error('PTYPE');
					}
					await conn.query('INSERT INTO vendor_to_partner_types (vendor_id, partner_type) VALUES (?, ?)', [id, body.partnerTypes[i]]);
				}
			}

			//	Product Availability
			if ((body.marketplacesAllowed !== undefined) && (body.marketplacesAllowed !== null)) {
				var mplaces = await conn.query('SELECT id FROM listed_on');
				await conn.query('DELETE FROM vendor_to_marketplaces WHERE vendor_id = ?', [id]);

				for (var i = 0; i < body.marketplacesAllowed.length; i++) {
					if (_.findIndex(mplaces, ['id', body.marketplacesAllowed[i]]) === -1) {
						throw new Error('MPLACE');
					}
					await conn.query('INSERT INTO vendor_to_marketplaces (vendor_id, marketplace_id) VALUES (?, ?)', [id, body.marketplacesAllowed[i]]);
				}
			}


		}

		await conn.commit();


		if (body.updatingRushMarketAvailability !== undefined) {
			if ((body.rushMarketAvailability !== undefined) && (body.rushMarketAvailability === 'LOCAL')) {
				GDE.transitionVendorFromAllToLocal(id);
			} else if ((body.rushMarketAvailability !== undefined) && (body.rushMarketAvailability === 'ALL')) {
				GDE.transitionVendorFromLocalToAll(id);
			}
		}

		//	Requeue GDE calc for all drop ship skus from this vendor.
		if (sql.indexOf("drop_ship_fee") >= 0) {
			await gdeActions.queueGDEVendorRecalc(id);
		}

		return result;
	} catch (e) {
		conn.rollback();
		throw (e);
	} finally {
		globals.productPool.releaseConnection(conn);
	}
}

exports.updateColumnMappingById = (id, mid, body) => {
	return new Promise((resolve, reject) => {
		var sql = 'UPDATE vendor_catalog_column_mappings SET date_modified = now()';
		var values = [];

		if (body.column != undefined) {
			values.push(body.column);
			sql = sql + ', template_column = ?';
		}

		values.push(mid);
		values.push(id);
		sql = sql + ' WHERE id = ? AND vendor_id = ?';

		globals.productPool.query(sql, values)
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.updateColumnLabelMappingById = (id, mid, body) => {
	return new Promise((resolve, reject) => {
		var sql = 'UPDATE vendor_catalog_column_label_mappings SET date_modified = now()';
		var values = [];

		if (body.columnLabel != undefined) {
			values.push(body.columnLabel);
			sql = sql + ', template_column_label = ?';
		}

		if (body.dataPointId != undefined) {
			values.push(body.dataPointId);
			sql = sql + ', data_point_id = ?';
		}

		values.push(mid);
		values.push(id);
		sql = sql + ' WHERE id = ? AND vendor_id = ?';

		globals.productPool.query(sql, values)
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}




exports.updateInventoryWorksheetInfoById = (id, mid, firstDataRow, vendorSkuColumn, quantityColumn) => {
	return new Promise((resolve, reject) => {
		var sql = 'UPDATE vendor_inventory_worksheet_info SET date_modified = now()';
		var values = [];

		if (firstDataRow != undefined) {
			values.push(firstDataRow);
			sql = sql + ', first_data_row = ?';
		}

		if (vendorSkuColumn != undefined) {
			values.push(vendorSkuColumn);
			sql = sql + ', vendor_sku_column = ?';
		}

		if (quantityColumn != undefined) {
			values.push(quantityColumn);
			sql = sql + ', quantity_column = ?';
		}

		values.push(mid);
		values.push(id);
		sql = sql + ' WHERE id = ? AND vendor_id = ?';

		globals.productPool.query(sql, values)
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.updateInventoryByVariant = (vendorId, variantSku, quantity) => {
	return new Promise((resolve, reject) => {
		var sql = 'UPDATE vendor_catalog_products SET date_modified = now(), dropship_inventory = ? WHERE vendor_id = ? AND variant_sku = ?';
		var values = [quantity, vendorId, variantSku];

		globals.productPool.query(sql, values)
			.then((result) => {
				resolve(result);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.setPullDataForwardFlag = (vendorId, vendorSku, flag) => {
	return new Promise((resolve, reject) => {
		var sql = 'UPDATE vendor_catalog_products SET date_modified = now(), pull_data_forward_flag = ? WHERE vendor_id = ? AND vendor_sku = ?';
		var values = [flag, vendorId, vendorSku];

		globals.productPool.query(sql, values)
			.then((result) => {
				resolve(result);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.updateInventoryByVendorSku = (vendorId, vendorSku, quantity) => {
	return new Promise((resolve, reject) => {
		var sql = 'UPDATE vendor_catalog_products SET date_modified = now(), dropship_inventory = ? WHERE vendor_id = ? AND vendor_sku = ?';
		var values = [quantity, vendorId, vendorSku];

		globals.productPool.query(sql, values)
			.then((result) => {
				resolve(result);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.updateProductById = async (vid, pid, product) => {
	var sql = 'UPDATE vendor_catalog_products SET date_modified = now()';
	var values = [];

	if (product.status !== undefined) {
		values.push(product.status);
		sql = sql + ', status = ?';
	}
	if (product.productName !== undefined) {
		values.push(product.productName);
		sql = sql + ', product_name = ?';
	}
	if (product.masterId === null) {
		sql = sql + ', master_id = null';
	} else if (product.masterId != undefined) {
		values.push(product.masterId);
		sql = sql + ', master_id = ?';
	}
	if (product.productCost !== undefined) {
		values.push(product.productCost);
		sql = sql + ', product_cost = ?';
	}
	if (product.primaryMaterial !== undefined) {
		values.push(product.primaryMaterial);
		sql = sql + ', primary_material = ?';
	}
	if (product.secondaryMaterial !== undefined) {
		values.push(product.secondaryMaterial);
		sql = sql + ', secondary_material = ?';
	}
	if (product.materialSpecific !== undefined) {
		values.push(product.materialSpecific);
		sql = sql + ', material_specific = ?';
	}
	if (product.primaryColor !== undefined) {
		values.push(product.primaryColor);
		sql = sql + ', primary_color = ?';
	}
	if ((product.colorSpecific === null) || (product.colorSpecific !== undefined)) {
		if (product.colorSpecific === null) {
			sql = sql + ', color_specific = null';
		} else {
			values.push(product.colorSpecific);
			sql = sql + ', color_specific = ?';
		}
	}
	if (product.productSize !== undefined) {
		values.push(product.productSize);
		sql = sql + ', product_size = ?';
	}
	if (product.productWeight !== undefined) {
		values.push(product.productWeight);
		sql = sql + ', product_weight = ?';
	}
	if (product.productHeight !== undefined) {
		values.push(product.productHeight);
		sql = sql + ', product_height = ?';
	}
	if (product.productWidth !== undefined) {
		values.push(product.productWidth);
		sql = sql + ', product_width = ?';
	}
	if (product.productDepth !== undefined) {
		values.push(product.productDepth);
		sql = sql + ', product_depth = ?';
	}
	if (product.numberOfBoxes !== undefined) {
		values.push(product.numberOfBoxes);
		sql = sql + ', number_of_boxes = ?';
	}

	if (product.shippingWeight1 === null) {
		sql = sql + ', shipping_weight1 = null';
	} else if (product.shippingWeight1 != undefined) {
		values.push(product.shippingWeight1);
		sql = sql + ', shipping_weight1 = ?';
	}
	if (product.packageHeight1 === null) {
		sql = sql + ', package_height1 = null';
	} else if (product.packageHeight1 != undefined) {
		values.push(product.packageHeight1);
		sql = sql + ', package_height1 = ?';
	}
	if (product.packageWidth1 === null) {
		sql = sql + ', package_width1 = null';
	} else if (product.packageWidth1 != undefined) {
		values.push(product.packageWidth1);
		sql = sql + ', package_width1 = ?';
	}
	if (product.packageLength1 === null) {
		sql = sql + ', package_length1 = null';
	} else if (product.packageLength1 != undefined) {
		values.push(product.packageLength1);
		sql = sql + ', package_length1 = ?';
	}

	if (product.shippingWeight2 === null) {
		sql = sql + ', shipping_weight2 = null';
	} else if (product.shippingWeight2 != undefined) {
		values.push(product.shippingWeight2);
		sql = sql + ', shipping_weight2 = ?';
	}
	if (product.packageHeight2 === null) {
		sql = sql + ', package_height2 = null';
	} else if (product.packageHeight2 != undefined) {
		values.push(product.packageHeight2);
		sql = sql + ', package_height2 = ?';
	}
	if (product.packageWidth2 === null) {
		sql = sql + ', package_width2 = null';
	} else if (product.packageWidth2 != undefined) {
		values.push(product.packageWidth2);
		sql = sql + ', package_width2 = ?';
	}
	if (product.packageLength2 === null) {
		sql = sql + ', package_length2 = null';
	} else if (product.packageLength2 != undefined) {
		values.push(product.packageLength2);
		sql = sql + ', package_length2 = ?';
	}

	if (product.shippingWeight3 === null) {
		sql = sql + ', shipping_weight3 = null';
	} else if (product.shippingWeight3 != undefined) {
		values.push(product.shippingWeight3);
		sql = sql + ', shipping_weight3 = ?';
	}
	if (product.packageHeight3 === null) {
		sql = sql + ', package_height3 = null';
	} else if (product.packageHeight3 != undefined) {
		values.push(product.packageHeight3);
		sql = sql + ', package_height3 = ?';
	}
	if (product.packageWidth3 === null) {
		sql = sql + ', package_width3 = null';
	} else if (product.packageWidth3 != undefined) {
		values.push(product.packageWidth3);
		sql = sql + ', package_width3 = ?';
	}
	if (product.packageLength3 === null) {
		sql = sql + ', package_length3 = null';
	} else if (product.packageLength3 != undefined) {
		values.push(product.packageLength3);
		sql = sql + ', package_length3 = ?';
	}

	if (product.shippingWeight4 === null) {
		sql = sql + ', shipping_weight4 = null';
	} else if (product.shippingWeight4 != undefined) {
		values.push(product.shippingWeight4);
		sql = sql + ', shipping_weight4 = ?';
	}
	if (product.packageHeight4 === null) {
		sql = sql + ', package_height4 = null';
	} else if (product.packageHeight4 != undefined) {
		values.push(product.packageHeight4);
		sql = sql + ', package_height4 = ?';
	}
	if (product.packageWidth4 === null) {
		sql = sql + ', package_width4 = null';
	} else if (product.packageWidth4 != undefined) {
		values.push(product.packageWidth4);
		sql = sql + ', package_width4 = ?';
	}
	if (product.packageLength4 === null) {
		sql = sql + ', package_length4 = null';
	} else if (product.packageLength4 != undefined) {
		values.push(product.packageLength4);
		sql = sql + ', package_length4 = ?';
	}

	if (product.shippingWeight5 === null) {
		sql = sql + ', shipping_weight5 = null';
	} else if (product.shippingWeight5 != undefined) {
		values.push(product.shippingWeight5);
		sql = sql + ', shipping_weight5 = ?';
	}
	if (product.packageHeight5 === null) {
		sql = sql + ', package_height5 = null';
	} else if (product.packageHeight5 != undefined) {
		values.push(product.packageHeight5);
		sql = sql + ', package_height5 = ?';
	}
	if (product.packageWidth5 === null) {
		sql = sql + ', package_width5 = null';
	} else if (product.packageWidth5 != undefined) {
		values.push(product.packageWidth5);
		sql = sql + ', package_width5 = ?';
	}
	if (product.packageLength5 === null) {
		sql = sql + ', package_length5 = null';
	} else if (product.packageLength5 != undefined) {
		values.push(product.packageLength5);
		sql = sql + ', package_length5 = ?';
	}

	if (product.shippingWeight6 === null) {
		sql = sql + ', shipping_weight6 = null';
	} else if (product.shippingWeight6 != undefined) {
		values.push(product.shippingWeight6);
		sql = sql + ', shipping_weight6 = ?';
	}
	if (product.packageHeight6 === null) {
		sql = sql + ', package_height6 = null';
	} else if (product.packageHeight6 != undefined) {
		values.push(product.packageHeight6);
		sql = sql + ', package_height6 = ?';
	}
	if (product.packageWidth6 === null) {
		sql = sql + ', package_width6 = null';
	} else if (product.packageWidth6 != undefined) {
		values.push(product.packageWidth6);
		sql = sql + ', package_width6 = ?';
	}
	if (product.packageLength6 === null) {
		sql = sql + ', package_length6 = null';
	} else if (product.packageLength6 != undefined) {
		values.push(product.packageLength6);
		sql = sql + ', package_length6 = ?';
	}

	if (product.shippingWeight7 === null) {
		sql = sql + ', shipping_weight7 = null';
	} else if (product.shippingWeight7 != undefined) {
		values.push(product.shippingWeight7);
		sql = sql + ', shipping_weight7 = ?';
	}
	if (product.packageHeight7 === null) {
		sql = sql + ', package_height7 = null';
	} else if (product.packageHeight7 != undefined) {
		values.push(product.packageHeight7);
		sql = sql + ', package_height7 = ?';
	}
	if (product.packageWidth7 === null) {
		sql = sql + ', package_width7 = null';
	} else if (product.packageWidth7 != undefined) {
		values.push(product.packageWidth7);
		sql = sql + ', package_width7 = ?';
	}
	if (product.packageLength7 === null) {
		sql = sql + ', package_length7 = null';
	} else if (product.packageLength7 != undefined) {
		values.push(product.packageLength7);
		sql = sql + ', package_length7 = ?';
	}

	if (product.shippingWeight8 === null) {
		sql = sql + ', shipping_weight8 = null';
	} else if (product.shippingWeight8 != undefined) {
		values.push(product.shippingWeight8);
		sql = sql + ', shipping_weight8 = ?';
	}
	if (product.packageHeight8 === null) {
		sql = sql + ', package_height8 = null';
	} else if (product.packageHeight8 != undefined) {
		values.push(product.packageHeight8);
		sql = sql + ', package_height8 = ?';
	}
	if (product.packageWidth8 === null) {
		sql = sql + ', package_width8 = null';
	} else if (product.packageWidth8 != undefined) {
		values.push(product.packageWidth8);
		sql = sql + ', package_width8 = ?';
	}
	if (product.packageLength8 === null) {
		sql = sql + ', package_length8 = null';
	} else if (product.packageLength8 != undefined) {
		values.push(product.packageLength8);
		sql = sql + ', package_length8 = ?';
	}

	if (product.shippingWeight9 === null) {
		sql = sql + ', shipping_weight9 = null';
	} else if (product.shippingWeight9 != undefined) {
		values.push(product.shippingWeight9);
		sql = sql + ', shipping_weight9 = ?';
	}
	if (product.packageHeight9 === null) {
		sql = sql + ', package_height9 = null';
	} else if (product.packageHeight9 != undefined) {
		values.push(product.packageHeight9);
		sql = sql + ', package_height9 = ?';
	}
	if (product.packageWidth9 === null) {
		sql = sql + ', package_width9 = null';
	} else if (product.packageWidth9 != undefined) {
		values.push(product.packageWidth9);
		sql = sql + ', package_width9 = ?';
	}
	if (product.packageLength9 === null) {
		sql = sql + ', package_length9 = null';
	} else if (product.packageLength9 != undefined) {
		values.push(product.packageLength9);
		sql = sql + ', package_length9 = ?';
	}

	if (product.shippingWeight10 === null) {
		sql = sql + ', shipping_weight10 = null';
	} else if (product.shippingWeight10 != undefined) {
		values.push(product.shippingWeight10);
		sql = sql + ', shipping_weight10 = ?';
	}
	if (product.packageHeight10 === null) {
		sql = sql + ', package_height10 = null';
	} else if (product.packageHeight10 != undefined) {
		values.push(product.packageHeight10);
		sql = sql + ', package_height10 = ?';
	}
	if (product.packageWidth10 === null) {
		sql = sql + ', package_width10 = null';
	} else if (product.packageWidth10 != undefined) {
		values.push(product.packageWidth10);
		sql = sql + ', package_width10 = ?';
	}
	if (product.packageLength10 === null) {
		sql = sql + ', package_length10 = null';
	} else if (product.packageLength10 != undefined) {
		values.push(product.packageLength10);
		sql = sql + ', package_length10 = ?';
	}

	if (product.shippingWeight11 === null) {
		sql = sql + ', shipping_weight11 = null';
	} else if (product.shippingWeight11 != undefined) {
		values.push(product.shippingWeight11);
		sql = sql + ', shipping_weight11 = ?';
	}
	if (product.packageHeight11 === null) {
		sql = sql + ', package_height11 = null';
	} else if (product.packageHeight11 != undefined) {
		values.push(product.packageHeight11);
		sql = sql + ', package_height11 = ?';
	}
	if (product.packageWidth11 === null) {
		sql = sql + ', package_width11 = null';
	} else if (product.packageWidth11 != undefined) {
		values.push(product.packageWidth11);
		sql = sql + ', package_width11 = ?';
	}
	if (product.packageLength11 === null) {
		sql = sql + ', package_length11 = null';
	} else if (product.packageLength11 != undefined) {
		values.push(product.packageLength11);
		sql = sql + ', package_length11 = ?';
	}

	if (product.shippingWeight12 === null) {
		sql = sql + ', shipping_weight12 = null';
	} else if (product.shippingWeight12 != undefined) {
		values.push(product.shippingWeight12);
		sql = sql + ', shipping_weight12 = ?';
	}
	if (product.packageHeight12 === null) {
		sql = sql + ', package_height12 = null';
	} else if (product.packageHeight12 != undefined) {
		values.push(product.packageHeight12);
		sql = sql + ', package_height12 = ?';
	}
	if (product.packageWidth12 === null) {
		sql = sql + ', package_width12 = null';
	} else if (product.packageWidth12 != undefined) {
		values.push(product.packageWidth12);
		sql = sql + ', package_width12 = ?';
	}
	if (product.packageLength12 === null) {
		sql = sql + ', package_length12 = null';
	} else if (product.packageLength12 != undefined) {
		values.push(product.packageLength12);
		sql = sql + ', package_length12 = ?';
	}

	if (product.shippingWeight13 === null) {
		sql = sql + ', shipping_weight13 = null';
	} else if (product.shippingWeight13 != undefined) {
		values.push(product.shippingWeight13);
		sql = sql + ', shipping_weight13 = ?';
	}
	if (product.packageHeight13 === null) {
		sql = sql + ', package_height13 = null';
	} else if (product.packageHeight13 != undefined) {
		values.push(product.packageHeight13);
		sql = sql + ', package_height13 = ?';
	}
	if (product.packageWidth13 === null) {
		sql = sql + ', package_width13 = null';
	} else if (product.packageWidth13 != undefined) {
		values.push(product.packageWidth13);
		sql = sql + ', package_width13 = ?';
	}
	if (product.packageLength13 === null) {
		sql = sql + ', package_length13 = null';
	} else if (product.packageLength13 != undefined) {
		values.push(product.packageLength13);
		sql = sql + ', package_length13 = ?';
	}

	if (product.shippingWeight14 === null) {
		sql = sql + ', shipping_weight14 = null';
	} else if (product.shippingWeight14 != undefined) {
		values.push(product.shippingWeight14);
		sql = sql + ', shipping_weight14 = ?';
	}
	if (product.packageHeight14 === null) {
		sql = sql + ', package_height14 = null';
	} else if (product.packageHeight14 != undefined) {
		values.push(product.packageHeight14);
		sql = sql + ', package_height14 = ?';
	}
	if (product.packageWidth14 === null) {
		sql = sql + ', package_width14 = null';
	} else if (product.packageWidth14 != undefined) {
		values.push(product.packageWidth14);
		sql = sql + ', package_width14 = ?';
	}
	if (product.packageLength14 === null) {
		sql = sql + ', package_length14 = null';
	} else if (product.packageLength14 != undefined) {
		values.push(product.packageLength14);
		sql = sql + ', package_length14 = ?';
	}

	if (product.shippingWeight15 === null) {
		sql = sql + ', shipping_weight15 = null';
	} else if (product.shippingWeight15 != undefined) {
		values.push(product.shippingWeight15);
		sql = sql + ', shipping_weight15 = ?';
	}
	if (product.packageHeight15 === null) {
		sql = sql + ', package_height15 = null';
	} else if (product.packageHeight15 != undefined) {
		values.push(product.packageHeight15);
		sql = sql + ', package_height15 = ?';
	}
	if (product.packageWidth15 === null) {
		sql = sql + ', package_width15 = null';
	} else if (product.packageWidth15 != undefined) {
		values.push(product.packageWidth15);
		sql = sql + ', package_width15 = ?';
	}
	if (product.packageLength15 === null) {
		sql = sql + ', package_length15 = null';
	} else if (product.packageLength15 != undefined) {
		values.push(product.packageLength15);
		sql = sql + ', package_length15 = ?';
	}

	if (product.shippingWeight16 === null) {
		sql = sql + ', shipping_weight16 = null';
	} else if (product.shippingWeight16 != undefined) {
		values.push(product.shippingWeight16);
		sql = sql + ', shipping_weight16 = ?';
	}
	if (product.packageHeight16 === null) {
		sql = sql + ', package_height16 = null';
	} else if (product.packageHeight16 != undefined) {
		values.push(product.packageHeight16);
		sql = sql + ', package_height16 = ?';
	}
	if (product.packageWidth16 === null) {
		sql = sql + ', package_width16 = null';
	} else if (product.packageWidth16 != undefined) {
		values.push(product.packageWidth16);
		sql = sql + ', package_width16 = ?';
	}
	if (product.packageLength16 === null) {
		sql = sql + ', package_length16 = null';
	} else if (product.packageLength16 != undefined) {
		values.push(product.packageLength16);
		sql = sql + ', package_length16 = ?';
	}

	if (product.shippingWeight17 === null) {
		sql = sql + ', shipping_weight17 = null';
	} else if (product.shippingWeight17 != undefined) {
		values.push(product.shippingWeight17);
		sql = sql + ', shipping_weight17 = ?';
	}
	if (product.packageHeight17 === null) {
		sql = sql + ', package_height17 = null';
	} else if (product.packageHeight17 != undefined) {
		values.push(product.packageHeight17);
		sql = sql + ', package_height17 = ?';
	}
	if (product.packageWidth17 === null) {
		sql = sql + ', package_width17 = null';
	} else if (product.packageWidth17 != undefined) {
		values.push(product.packageWidth17);
		sql = sql + ', package_width17 = ?';
	}
	if (product.packageLength17 === null) {
		sql = sql + ', package_length17 = null';
	} else if (product.packageLength17 != undefined) {
		values.push(product.packageLength17);
		sql = sql + ', package_length17 = ?';
	}

	if (product.shippingWeight18 === null) {
		sql = sql + ', shipping_weight18 = null';
	} else if (product.shippingWeight18 != undefined) {
		values.push(product.shippingWeight18);
		sql = sql + ', shipping_weight18 = ?';
	}
	if (product.packageHeight18 === null) {
		sql = sql + ', package_height18 = null';
	} else if (product.packageHeight18 != undefined) {
		values.push(product.packageHeight18);
		sql = sql + ', package_height18 = ?';
	}
	if (product.packageWidth18 === null) {
		sql = sql + ', package_width18 = null';
	} else if (product.packageWidth18 != undefined) {
		values.push(product.packageWidth18);
		sql = sql + ', package_width18 = ?';
	}
	if (product.packageLength18 === null) {
		sql = sql + ', package_length18 = null';
	} else if (product.packageLength18 != undefined) {
		values.push(product.packageLength18);
		sql = sql + ', package_length18 = ?';
	}

	if (product.shippingWeight19 === null) {
		sql = sql + ', shipping_weight19 = null';
	} else if (product.shippingWeight19 != undefined) {
		values.push(product.shippingWeight19);
		sql = sql + ', shipping_weight19 = ?';
	}
	if (product.packageHeight19 === null) {
		sql = sql + ', package_height19 = null';
	} else if (product.packageHeight19 != undefined) {
		values.push(product.packageHeight19);
		sql = sql + ', package_height19 = ?';
	}
	if (product.packageWidth19 === null) {
		sql = sql + ', package_width19 = null';
	} else if (product.packageWidth19 != undefined) {
		values.push(product.packageWidth19);
		sql = sql + ', package_width19 = ?';
	}
	if (product.packageLength19 === null) {
		sql = sql + ', package_length19 = null';
	} else if (product.packageLength19 != undefined) {
		values.push(product.packageLength19);
		sql = sql + ', package_length19 = ?';
	}

	if (product.shippingWeight20 === null) {
		sql = sql + ', shipping_weight20 = null';
	} else if (product.shippingWeight20 != undefined) {
		values.push(product.shippingWeight20);
		sql = sql + ', shipping_weight20 = ?';
	}
	if (product.packageHeight20 === null) {
		sql = sql + ', package_height20 = null';
	} else if (product.packageHeight20 != undefined) {
		values.push(product.packageHeight20);
		sql = sql + ', package_height20 = ?';
	}
	if (product.packageWidth20 === null) {
		sql = sql + ', package_width20 = null';
	} else if (product.packageWidth20 != undefined) {
		values.push(product.packageWidth20);
		sql = sql + ', package_width20 = ?';
	}
	if (product.packageLength20 === null) {
		sql = sql + ', package_length20 = null';
	} else if (product.packageLength20 != undefined) {
		values.push(product.packageLength20);
		sql = sql + ', package_length20 = ?';
	}

	if (product.additionalDims === null) {
		sql = sql + ', additional_dims = null';
	} else if (product.additionalDims != undefined) {
		values.push(product.additionalDims);
		sql = sql + ', additional_dims = ?';
	}
	if (product.seatingCapacity === null) {
		sql = sql + ', seating_capacity = null';
	} else if (product.seatingCapacity != undefined) {
		values.push(product.seatingCapacity);
		sql = sql + ', seating_capacity = ?';
	}

	if (product.leadTime !== undefined) {
		values.push(product.leadTime);
		sql = sql + ', lead_time = ?';
	}

	if (product.shipType !== undefined) {
		values.push(product.shipType);
		sql = sql + ', ship_type = ?';
	}
	if (product.freightClass === null) {
		sql = sql + ', freight_class = null';
	} else if (product.freightClass != undefined) {
		values.push(product.freightClass);
		sql = sql + ', freight_class = ?';
	}
	if (product.nmfcCode === null) {
		sql = sql + ', nmfc_code = null';
	} else if (product.nmfcCode != undefined) {
		values.push(product.nmfcCode);
		sql = sql + ', nmfc_code = ?';
	}
	if (product.countryManufacture !== undefined) {
		values.push(product.countryManufacture);
		sql = sql + ', country_manufacture = ?';
	}
	if (product.cutoffTimeCst !== undefined) {
		values.push(product.cutoffTimeCst);
		sql = sql + ', cutoff_time_cst = ?';
	}
	if (product.partialItem === null) {
		sql = sql + ', partial_item = null';
	} else if (product.partialItem != undefined) {
		values.push(product.partialItem);
		sql = sql + ', partial_item = ?';
	}
	if (product.discontinuedItemFlag !== undefined) {
		values.push(product.discontinuedItemFlag);
		sql = sql + ', discontinued_item_flag = ?';
	}
	if (product.pullDataForwardFlag !== undefined) {
		values.push(product.pullDataForwardFlag);
		sql = sql + ', pull_data_forward_flag = ?';
	}
	if (product.quantityPerCarton !== undefined) {
		values.push(product.quantityPerCarton);
		sql = sql + ', quantity_per_carton = ?';
	}
	if (product.msrp !== undefined) {
		values.push(product.msrp);
		sql = sql + ', msrp = ?';
	}
	if (product.mapPrice !== undefined) {
		values.push(product.mapPrice);
		sql = sql + ', map_price = ?';
	}
	if (product.inMarketPrice !== undefined) {
		values.push(product.inMarketPrice);
		sql = sql + ', in_market_price = ?';
	}
	if (product.shipToMarketPrice !== undefined) {
		values.push(product.shipToMarketPrice);
		sql = sql + ', ship_to_market_price = ?';
	}
	if (product.partnerSellingPrice !== undefined) {
		values.push(product.partnerSellingPrice);
		sql = sql + ', partner_selling_price = ?';
	}
	if (product.assemblyReqd !== undefined) {
		values.push(product.assemblyReqd);
		sql = sql + ', assembly_reqd = ?';
	}

	if (product.mainImageKnockout === null) {
		sql = sql + ', main_image_knockout = null';
	} else if (product.mainImageKnockout !== undefined) {
		values.push(product.mainImageKnockout);
		sql = sql + ', main_image_knockout = ?';
	}
	if (product.mainImageLifestyle === null) {
		sql = sql + ', main_image_lifestyle = null';
	} else if (product.mainImageLifestyle !== undefined) {
		values.push(product.mainImageLifestyle);
		sql = sql + ', main_image_lifestyle = ?';
	}
	if (product.altImage3 === null) {
		sql = sql + ', alt_image3 = null';
	} else if (product.altImage3 !== undefined) {
		values.push(product.altImage3);
		sql = sql + ', alt_image3 = ?';
	}
	if (product.altImage4 === null) {
		sql = sql + ', alt_image4 = null';
	} else if (product.altImage4 !== undefined) {
		values.push(product.altImage4);
		sql = sql + ', alt_image4 = ?';
	}
	if (product.altImage5 === null) {
		sql = sql + ', alt_image5 = null';
	} else if (product.altImage5 !== undefined) {
		values.push(product.altImage5);
		sql = sql + ', alt_image5 = ?';
	}
	if (product.altImage6 === null) {
		sql = sql + ', alt_image6 = null';
	} else if (product.swatchImage6 !== undefined) {
		values.push(product.swatchImage6);
		sql = sql + ', swatch_image6 = ?';
	}

	if (product.prop65 !== undefined) {
		values.push(product.prop65);
		sql = sql + ', prop_65 = ?';
	}
	if (product.prop65Chemicals !== undefined) {
		values.push(product.prop65Chemicals);
		sql = sql + ', prop_65_chemicals = ?';
	}
	if (product.prop65WarningLabel !== undefined) {
		values.push(product.prop65WarningLabel);
		sql = sql + ', prop_65_warning_label = ?';
	}


	if (product.attributeName1 === null) {
		sql = sql + ', attribute_name1 = null';
	} else if (product.attributeName1 !== undefined) {
		values.push(product.attributeName1);
		sql = sql + ', attribute_name1 = ?';
	}
	if (product.attributeValue1 === null) {
		sql = sql + ', attribute_value1 = null';
	} else if (product.attributeValue1 !== undefined) {
		values.push(product.attributeValue1);
		sql = sql + ', attribute_value1 = ?';
	}
	if (product.attributeName2 === null) {
		sql = sql + ', attribute_name2 = null';
	} else if (product.attributeName2 !== undefined) {
		values.push(product.attributeName2);
		sql = sql + ', attribute_name2 = ?';
	}
	if (product.attributeValue2 === null) {
		sql = sql + ', attribute_value2 = null';
	} else if (product.attributeValue2 !== undefined) {
		values.push(product.attributeValue2);
		sql = sql + ', attribute_value2 = ?';
	}
	if (product.attributeName3 === null) {
		sql = sql + ', attribute_name3 = null';
	} else if (product.attributeName3 !== undefined) {
		values.push(product.attributeName3);
		sql = sql + ', attribute_name3 = ?';
	}
	if (product.attributeValue3 === null) {
		sql = sql + ', attribute_value3 = null';
	} else if (product.attributeValue3 !== undefined) {
		values.push(product.attributeValue3);
		sql = sql + ', attribute_value3 = ?';
	}
	if (product.attributeName4 === null) {
		sql = sql + ', attribute_name4 = null';
	} else if (product.attributeName4 !== undefined) {
		values.push(product.attributeName4);
		sql = sql + ', attribute_name4 = ?';
	}
	if (product.attributeValue4 === null) {
		sql = sql + ', attribute_value4 = null';
	} else if (product.attributeValue4 != undefined) {
		values.push(product.attributeValue4);
		sql = sql + ', attribute_value4 = ?';
	}
	if (product.attributeName5 === null) {
		sql = sql + ', attribute_name5 = null';
	} else if (product.attributeName5 !== undefined) {
		values.push(product.attributeName5);
		sql = sql + ', attribute_name5 = ?';
	}
	if (product.attributeValue5 === null) {
		sql = sql + ', attribute_value5 = null';
	} else if (product.attributeValue5 !== undefined) {
		values.push(product.attributeValue5);
		sql = sql + ', attribute_value5 = ?';
	}
	if (product.attributeName6 === null) {
		sql = sql + ', attribute_name6 = null';
	} else if (product.attributeName6 !== undefined) {
		values.push(product.attributeName6);
		sql = sql + ', attribute_name6 = ?';
	}
	if (product.attributeValue6 === null) {
		sql = sql + ', attribute_value6 = null';
	} else if (product.attributeValue6 !== undefined) {
		values.push(product.attributeValue6);
		sql = sql + ', attribute_value6 = ?';
	}

	if (product.primaryCategory !== undefined) {
		values.push(product.primaryCategory);
		sql = sql + ', primary_category = ?';
	}
	if (product.secondaryCategory !== undefined) {
		values.push(product.secondaryCategory);
		sql = sql + ', secondary_category = ?';
	}

	if (product.brandName !== undefined) {
		values.push(product.brandName);
		sql = sql + ', brand_name = ?';
	}
	if (product.manufacturer !== undefined) {
		values.push(product.manufacturer);
		sql = sql + ', manufacturer = ?';
	}
	if (product.upc !== undefined) {
		values.push(product.upc);
		sql = sql + ', upc = ?';
	}
	if (product.mpn !== undefined) {
		values.push(product.mpn);
		sql = sql + ', mpn = ?';
	}

	if (product.bulletPoint1 === null) {
		sql = sql + ', bullet_point1 = null';
	} else if (product.bulletPoint1 !== undefined) {
		values.push(product.bulletPoint1);
		sql = sql + ', bullet_point1 = ?';
	}
	if (product.bulletPoint2 === null) {
		sql = sql + ', bullet_point2 = null';
	} else if (product.bulletPoint2 !== undefined) {
		values.push(product.bulletPoint2);
		sql = sql + ', bullet_point2 = ?';
	}
	if (product.bulletPoint3 === null) {
		sql = sql + ', bullet_point3 = null';
	} else if (product.bulletPoint3 !== undefined) {
		values.push(product.bulletPoint3);
		sql = sql + ', bullet_point3 = ?';
	}
	if (product.bulletPoint4 === null) {
		sql = sql + ', bullet_point4 = null';
	} else if (product.bulletPoint4 !== undefined) {
		values.push(product.bulletPoint4);
		sql = sql + ', bullet_point4 = ?';
	}

	if (product.styleTag1 === null) {
		sql = sql + ', style_tag1 = null';
	} else if (product.styleTag1 !== undefined) {
		values.push(product.styleTag1);
		sql = sql + ', style_tag1 = ?';
	}
	if (product.styleTag2 === null) {
		sql = sql + ', style_tag2 = null';
	} else if (product.styleTag2 !== undefined) {
		values.push(product.styleTag2);
		sql = sql + ', style_tag2 = ?';
	}

	if (product.productDescription !== undefined) {
		values.push(product.productDescription);
		sql = sql + ', product_description = ?';
	}

	if (product.dropshipInventory !== undefined) {
		values.push(product.dropshipInventory);
		sql = sql + ', dropship_inventory = ?';
	}

	if (product.validated !== undefined) {
		if (product.validated === true) {
			if (product.validatedDate === null) {
				values.push(product.validatedBy, product.validatedByType);
				sql = sql + ', validated = true, validated_date = now (), validated_by = ?, validated_by_type = ?';
			}
		} else {
			sql = sql + ', validated = false, validated_date = NULL, validated_by = NULL, validated_by_type = NULL';
		}
	}

	if ((product.coreEligibilityErrors === null) || (product.coreEligibilityErrors !== undefined)) {
		if (product.coreEligibilityErrors === null) {
			sql = sql + ', core_eligibility_errors = null';
		} else {
			values.push(product.coreEligibilityErrors);
			sql = sql + ', core_eligibility_errors = ?';
		}
	}

	if (product.eligibleForTrm != undefined) {
		values.push(product.eligibleForTrm);
		sql = sql + ', eligible_for_trm = ?';
	}
	if ((product.trmEligibilityErrors === null) || (product.trmEligibilityErrors !== undefined)) {
		if (product.trmEligibilityErrors === null) {
			sql = sql + ', trm_eligibility_errors = null';
		} else {
			values.push(product.trmEligibilityErrors);
			sql = sql + ', trm_eligibility_errors = ?';
		}
	}
	if (product.eligibleForDropship != undefined) {
		values.push(product.eligibleForDropship);
		sql = sql + ', eligible_for_dropship = ?';
	}
	if ((product.dropshipEligibilityErrors === null) || (product.dropshipEligibilityErrors !== undefined)) {
		if (product.dropshipEligibilityErrors === null) {
			sql = sql + ', dropship_eligibility_errors = null';
		} else {
			values.push(product.dropshipEligibilityErrors);
			sql = sql + ', dropship_eligibility_errors = ?';
		}
	}
	// if (product.eligibleForLimitedQuantityDropship != undefined) {
	// 	values.push(product.eligibleForLimitedQuantityDropship);
	// 	sql = sql + ', eligible_for_limited_quantity_dropship = ?';
	// }
	// if ((product.limitedQuantityDropshipEligibilityErrors === null) || (product.limitedQuantityDropshipEligibilityErrors !== undefined)) {
	// 	if (product.limitedQuantityDropshipEligibilityErrors === null) {
	// 		sql = sql + ', limited_quantity_dropship_eligibility_errors = null';
	// 	} else {
	// 		values.push(product.limitedQuantityDropshipEligibilityErrors);
	// 		sql = sql + ', limited_quantity_dropship_eligibility_errors = ?';
	// 	}
	// }
	if (product.eligibleForInline !== undefined) {
		values.push(product.eligibleForInline);
		sql = sql + ', eligible_for_inline = ?';
	}
	if ((product.inlineEligibilityErrors === null) || (product.inlineEligibilityErrors !== undefined)) {
		if (product.inlineEligibilityErrors === null) {
			sql = sql + ', inline_eligibility_errors = null';
		} else {
			values.push(product.inlineEligibilityErrors);
			sql = sql + ', inline_eligibility_errors = ?';
		}
	}
	if (product.eligibleForBulkBuys !== undefined) {
		values.push(product.eligibleForBulkBuys);
		sql = sql + ', eligible_for_bulk_buys = ?';
	}
	if ((product.bulkBuysEligibilityErrors === null) || (product.bulkBuysEligibilityErrors !== undefined)) {
		if (product.bulkBuysEligibilityErrors === null) {
			sql = sql + ', bulk_buys_eligibility_errors = null';
		} else {
			values.push(product.bulkBuysEligibilityErrors);
			sql = sql + ', bulk_buys_eligibility_errors = ?';
		}
	}
	if (product.eligibleForOffPrice !== undefined) {
		values.push(product.eligibleForOffPrice);
		sql = sql + ', eligible_for_off_price = ?';
	}
	if ((product.offPriceEligibilityErrors === null) || (product.offPriceEligibilityErrors !== undefined)) {
		if (product.offPriceEligibilityErrors === null) {
			sql = sql + ', off_price_eligibility_errors = null';
		} else {
			values.push(product.offPriceEligibilityErrors);
			sql = sql + ', off_price_eligibility_errors = ?';
		}
	}
	if (product.eligibleForCostBasedReturns !== undefined) {
		values.push(product.eligibleForCostBasedReturns);
		sql = sql + ', eligible_for_cost_based_returns = ?';
	}
	if ((product.costBasedReturnsEligibilityErrors === null) || (product.costBasedReturnsEligibilityErrors !== undefined)) {
		if (product.costBasedReturnsEligibilityErrors === null) {
			sql = sql + ', cost_based_returns_eligibility_errors = null';
		} else {
			values.push(product.costBasedReturnsEligibilityErrors);
			sql = sql + ', cost_based_returns_eligibility_errors = ?';
		}
	}
	if (product.eligibleForRevShareReturns !== undefined) {
		values.push(product.eligibleForRevShareReturns);
		sql = sql + ', eligible_for_rev_share_returns = ?';
	}
	if ((product.revShareReturnsEligibilityErrors === null) || (product.revShareReturnsEligibilityErrors !== undefined)) {
		if (product.revShareReturnsEligibilityErrors === null) {
			sql = sql + ', rev_share_returns_eligibility_errors = null';
		} else {
			values.push(product.revShareReturnsEligibilityErrors);
			sql = sql + ', rev_share_returns_eligibility_errors = ?';
		}
	}
	if (product.validationErrors !== undefined) {
		values.push(product.validationErrors);
		sql = sql + ', validation_errors = ?';
	}
	if (product.searchField !== undefined) {
		values.push(product.searchField);
		sql = sql + ', search_field = ?';
	}

	// 	TODO update searchField
	//	TODO revalidate

	values.push(pid);
	values.push(vid);
	sql = sql + ' WHERE id = ? AND vendor_id = ?';

	// console.log("SQL: " + mysql.format(sql, values));
	// console.log(JSON.stringify(values, undefined, 2));

	var rows = await globals.productPool.query(sql, values);

	return rows;
}



exports.updateVerificationIdById = (id, vid) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query("UPDATE vendors SET date_modified = now(), verification_id = ? WHERE id = ?", [vid, id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.updateWorksheetInfo = (id, body) => {
	return new Promise((resolve, reject) => {
		var sql = 'UPDATE vendor_catalog_worksheet_info SET date_modified = now()';
		var values = [];

		if (body.worksheetNumber != undefined) {
			values.push(body.worksheetNumber);
			sql = sql + ', worksheet_number = ?';
		}

		if (body.firstDataRow != undefined) {
			values.push(body.firstDataRow);
			sql = sql + ', first_data_row = ?';
		}

		values.push(id);
		sql = sql + ' WHERE vendor_id = ?';

		globals.productPool.query(sql, values)
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.verifyMasterIdInImport = (uuid, vendorId, masterId) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('SELECT vendor_sku FROM vendor_catalog_import_' + uuid + ' WHERE vendor_id = ? AND vendor_sku = ?', [vendorId, masterId])
			.then((rows) => {
				if (rows.length === 0) {
					resolve(null);
				} else {
					resolve(rows[0].vendor_sku);
				}
			})
			.catch((e) => {
				reject(e);
			})
	});
}

exports.verifyMasterIdInProducts = (vendorId, masterId) => {
	return new Promise((resolve, reject) => {
		globals.productPool.query('SELECT vendor_sku FROM vendor_catalog_products WHERE vendor_id = ? AND vendor_sku = ?', [vendorId, masterId])
			.then((rows) => {
				if (rows.length === 0) {
					resolve(null);
				} else {
					resolve(rows[0].vendor_sku);
				}
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getImagesToConvert = async (batchSize) => {
	var results = await globals.productPool.query(`SELECT vendor_id, vendor_sku, main_image_knockout, main_image_lifestyle, alt_image3, alt_image4, alt_image5, swatch_image6
																									FROM vendor_catalog_products
																									WHERE (((main_image_knockout IS NOT NULL) AND (LOCATE('rushmarket.com', main_image_knockout) = 0) AND (LOCATE('rushimages', main_image_knockout) = 0)) OR 
																									((main_image_lifestyle IS NOT NULL) AND (LOCATE('rushmarket.com', main_image_lifestyle) = 0) AND (LOCATE('rushimages', main_image_lifestyle) = 0)) OR
																									((alt_image3 IS NOT NULL) AND (LOCATE('rushmarket.com', alt_image3) = 0) AND (LOCATE('rushimages', alt_image3) = 0)) OR
																									((alt_image4 IS NOT NULL) AND (LOCATE('rushmarket.com', alt_image4) = 0) AND (LOCATE('rushimages', alt_image4) = 0)) OR
																									((alt_image5 IS NOT NULL) AND (LOCATE('rushmarket.com', alt_image5) = 0) AND (LOCATE('rushimages', alt_image5) = 0)) OR
																									((swatch_image6 IS NOT NULL) AND (LOCATE('rushmarket.com', swatch_image6) = 0) AND (LOCATE('rushimages', swatch_image6) = 0)))`)

	colUtils.outboundNaming(results);
	return results;

}



exports.getPendingImageDownloads = async (batchSize) => {
	var results = await globals.productPool.query(`SELECT * FROM image_download_queue WHERE status = 'PENDING' ORDER BY date_created LIMIT 0,${batchSize}`);
	colUtils.outboundNaming(results);
	return results;
}



exports.queueImageForDownload = async (vendorId, vendorSku, columnName, url) => {
	var check = await globals.productPool.query("SELECT * FROM image_download_queue WHERE vendor_id = ? AND vendor_sku = ? AND column_name = ? AND url = ?", [vendorId, vendorSku, columnName, url]);
	if (check.length === 0) {
		var results = await globals.productPool.query("INSERT INTO image_download_queue (vendor_id, vendor_sku, column_name, url) VALUES (?, ?, ?, ?)", [vendorId, vendorSku, columnName, url]);
		return true;
	} else return false;

}


exports.markImageFail = async (id) => {
	var results = await globals.productPool.query("UPDATE image_download_queue SET date_processed = now(), status = 'FAIL' WHERE id = ?", [id]);
	return results;
}


exports.markImageSuccess = async (id, newUrl) => {
	var results = await globals.productPool.query("UPDATE image_download_queue SET date_processed = now(), status = 'SUCCESS', new_url = ? WHERE id = ?", [newUrl, id]);
	return results;
}


exports.updateProductImage = async (vendorId, vendorSku, columnName, url) => {
	var results = await globals.productPool.query("UPDATE vendor_catalog_products SET date_modified = now(), " + columnName + " = ? WHERE vendor_id = ? AND vendor_sku = ?", [url, vendorId, vendorSku]);
	return results;
}


exports.logChange = async (updaterId, updaterType, productId, updateType, from, to) => {
	var results = await globals.productPool.query(`INSERT INTO vendor_product_change_log (updater_id, updater_type, vendor_catalog_product_id, update_type, from_value, to_value) 
													VALUES (?, ?, ?, ?, SUBSTRING(?, 1, 500), SUBSTRING(?, 1, 500))`, [updaterId, updaterType, productId, updateType, from, to]);
	return results;
}


exports.logDropshipOOS = async (vendorId, vendorSku) => {
	var results = await globals.pool.query(`INSERT INTO ds_out_of_stock_queue (vendor_id, vendor_sku) 
													VALUES (?, ?)`, [vendorId, vendorSku]);
	return results;
}


exports.createCoreleapTemp = async () => {
	var result = await globals.pool.query("DROP TABLE IF EXISTS vendors_summary_temp");
	result = globals.pool.query("CREATE TABLE vendors_summary_temp LIKE vendors_summary");

	return result;
}


exports.getSummary = async () => {
	var results = await globals.productROPool.query("SELECT id, `name`, rating, manifest_id FROM vendors");

	return results;
}


exports.writeSummary = async (rows) => {
	var sql = "INSERT INTO vendors_summary_temp (id, `name`, rating, manifest_id) VALUES ";
	var values = [];

	for (var i = 0; i < rows.length; i++) {
		sql += "(?, ?, ?, ?)";
		if (i < (rows.length - 1)) {
			sql += ", ";
		}
		values.push(rows[i].id);
		values.push(rows[i].name);
		values.push(rows[i].rating);
		values.push(rows[i].manifest_id);
	}


	// console.log(mysql.format(sql, values));
	var result = await globals.pool.query(sql, values);
	return result;
}


exports.swapCoreleapTemp = async () => {
	var result = await globals.pool.query("DROP TABLE IF EXISTS vendors_summary");
	result = globals.pool.query("RENAME TABLE vendors_summary_temp TO vendors_summary");

	return result;
}


exports.getMarketplaceVendors = async (marketplace) => {
	var rows = await globals.productPool.query(`SELECT vendor_id 
										FROM vendor_to_marketplaces m
												LEFT JOIN listed_on l ON l.id = m.marketplace_id
										WHERE l.platform = ?`, [marketplace])

	colUtils.outboundNaming(rows);

	return rows;
}



exports.getTodaysCategories = async (dow, hour) => {
	var rows = await globals.productPool.query(`SELECT job_json FROM vc_export_schedule WHERE day_of_week = ? AND hour = ?`, [dow, hour]);
	colUtils.outboundNaming(rows);
	return rows;
}



exports.captureTracking = async (sourceOrderName, vendorId, vendorSku, tracking, lineId) => {
	var result = await globals.pool.query(`INSERT INTO ds_vendor_invoices (source_order_name, vendor_id, vendor_sku, tracking, source_line_id) 
																					VALUES (?, ?, ?, ?, ?)`, [sourceOrderName, vendorId, vendorSku, tracking, lineId]);
	return result;
}



exports.captureVendorInvoice = async (sourceOrderName, vendorId, invoiceNumber) => {
	// console.log(mysql.format(`UPDATE ds_vendor_invoices set vendor_invoice_number = ? WHERE source_order_name = ? AND vendor_id - ?`, [invoiceNumber, sourceOrderName, vendorId]));
	var result = await globals.pool.query(`UPDATE ds_vendor_invoices set vendor_invoice_number = ? WHERE source_order_name = ? AND vendor_id = ?`, [invoiceNumber, sourceOrderName, vendorId]);
	return result;
}



exports.getVendorInvoice = async (sourceOrderName, vendorId, invoiceNumber, vendorSku, tracking) => {
	var rows = await globals.pool.query(`SELECT * FROM ds_vendor_invoices 
																				WHERE source_order_name = ? AND vendor_id = ? AND vendor_invoice_number = ? AND vendor_sku = ? AND tracking = ?`, [sourceOrderName, vendorId, invoiceNumber, vendorSku, tracking]);
	colUtils.outboundNaming(rows);
	return rows;
}


exports.getByOutletHost = async (hostname) => {
	var rows = await globals.productPool.query(`SELECT * FROM vendors 
																				WHERE outlet_site_address = ?`, [hostname]);
	colUtils.outboundNaming(rows);
	return rows;
}


exports.checkForTracking = async (sourceOrderName, vendorId, vendorSku, tracking) => {
	var sql = `SELECT * FROM ds_vendor_invoices WHERE source_order_name = ? AND vendor_id = ? `;
	var values = [sourceOrderName, vendorId];

	if ((vendorSku === null) || (vendorSku === undefined)) {
		// sql += ` AND vendor_sku IS NULL `;
	} else {
		sql += ` AND vendor_sku = ? `;
		values.push(vendorSku);
	}

	if ((tracking === null) || (tracking === undefined)) {
		// sql += ` AND tracking IS NULL `;
	} else {
		sql += ` AND tracking = ? `;
		values.push(tracking);
	}


	var rows = await globals.pool.query(sql, values);
	// console.log(mysql.format(sql, values));
	colUtils.outboundNaming(rows);
	return rows;
}


exports.checkForInvoice = async (sourceOrderName, vendorId) => {
	var sql = `SELECT COUNT(*) AS num FROM ds_vendor_invoices WHERE source_order_name = ? AND vendor_id = ? AND vendor_invoice_number IS NOT NULL`;

	var rows = await globals.pool.query(sql, [sourceOrderName, vendorId]);
	// console.log(mysql.format(sql, [sourceOrderName, vendorId]));
	colUtils.outboundNaming(rows);
	return rows;
}


exports.queueDropshipProduct = async (vendorId, vendorSku, quantity, percentOffWholesale, action) => {

	await globals.productPool.query(`UPDATE vendor_catalog_products SET ds_percent_off_wholesale = ? WHERE vendor_id = ? AND vendor_sku = ?`, [percentOffWholesale, vendorId, vendorSku]);

	var sql = `INSERT INTO create_dropship_product_queue (vendor_id, vendor_sku, quantity, percent_off_wholesale, action) VALUES (?, ?, ?, ?, ?)`;

	var result = await globals.pool.query(sql, [vendorId, vendorSku, quantity, percentOffWholesale, action]);
	// console.log(mysql.format(sql, [vendorId, vendorSku, quantity, percentOffWholesale, exclusiveToRush]));
	return result;
}


exports.getAllDropshipQueueProducts = async (whereInfo) => {
	var sql = `SELECT vendor_id, vendor_sku, quantity, action, percent_off_wholesale, exclusive_to_rush FROM create_dropship_product_queue `;
	
	if (whereInfo.clause.length > 0) {
		sql += `${whereInfo.clause} `;
	}
	
	sql += `ORDER BY date_created`;

	// console.log(mysql.format(sql, whereInfo.values));
	var rows = await globals.poolRO.query(sql, whereInfo.values);

	colUtils.outboundNaming(rows);

	return rows;
}


exports.getByVendorSku = async (vendorId, vendorSku) => {
	var sql = `SELECT * FROM vendor_catalog_products WHERE vendor_id = ? AND vendor_sku = ?`;
	
	var rows = await globals.productROPool.query(sql, [vendorId, vendorSku]);

	colUtils.outboundNaming(rows);

	return rows;
}


exports.getMinLikeNewPriceFromCoinPeers = async (vendorId, vendorSku) => {
	var inMarketPrice = null;
	var vskus = '';


	var rows = await globals.productROPool.query(`SELECT vendor_id, vendor_sku FROM coins_to_vendor_skus WHERE CONCAT(vendor_id, vendor_sku) != CONCAT(?,?)  AND coin_id IN
																									(SELECT coin_id FROM coins_to_vendor_skus WHERE vendor_id = ? AND vendor_sku = ?)`, [vendorId, vendorSku, vendorId, vendorSku]);
	colUtils.outboundNaming(rows);

	for (var i=0; i < rows.length; i++) {
		if (vskus.length) {
			vskus += ' OR ';
		}
		vskus += `(vendor_id = '${rows[i].vendorId}' AND vendor_sku = '${rows[i].vendorSku}')`
	}

	if (vskus.length) {
		// console.log(mysql.format(`SELECT MIN(in_market_price) AS price FROM vendor_catalog_products WHERE (${vskus})`));
		rows = await globals.productROPool.query(`SELECT MIN(in_market_price) AS price FROM vendor_catalog_products WHERE (${vskus})`)
		if (rows.length) {
			inMarketPrice = rows[0].price;
		}
	}

	return inMarketPrice;
}
