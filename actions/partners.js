'use strict';

const _ = require('lodash');
const bcrypt = require('bcrypt');
const moment = require('moment-timezone');
const { v1: uuidv1 } = require('uuid');

const { isPartnerFeeCharged } = require('../actions/productsProcessCommon');

const Partners = require('../models/partners');
const PartnerLogins = require('../models/partnerLogins');
const RushOrders = require('../models/rushOrders');
const Vendors = require('../models/vendors');

const jwtUtils = require('./jwtUtils');

const comms = require('../utils/comms');
const memberText = require('../utils/memberTextUtils');

const {
	formatResp
} = require('../utils/response');
const {
	validatePartner,
	validatePartnerFacility,
	validatePartnerUser
} = require('../utils/partnerUtils');



//
//	GET partner schema 
//
var getPartnerSchema = async (req, resp) => {
	var rows = await Partners.getPartnerSchema();
	if (rows.length === 0) {
		formatResp(resp, undefined, 404, "Could not find schema.")
	} else {
		resp.data.schema = rows;
	}
}



//
//	Partner create.
//
var create = async (req, resp) => {

	// 
	//	Validate Partner
	//
	var validationErrors = await validatePartner(req);
	if (validationErrors.errorDetails.length > 0) {
		resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
	} else {
		var rows = await Partners.getByName(req.body.name);
		if (rows.length > 0) {
			resp = formatResp(resp, undefined, 409, "Partner with this name already exists.");
		} else {
			var id = await Partners.create(req.body)
			resp.id = id;
		}
	}
}


//
//	GET all partners
//
var getAll = async (where, offset, limit, resp, sortBy) => {
	var result = await Partners.getAll(where, offset, limit, sortBy);
	resp.metaData.totalCount = result.totalCount;
	if (result.partners.length === 0) {
		formatResp(resp, undefined, 200, memberText.get("VENDOR_404"))
	} else {
		resp.data.partners = result.partners;
		for (var i = 0; i < resp.data.partners.length; i++) {
			delete resp.data.partners[i].password;
		}
	}

	return resp;
}


//
//	GET specific partner
//
var getById = async (req, resp) => {
	var rows = await Partners.getById(req.params.id);
	if (rows.length === 0) {
		formatResp(resp, ['data'], 404, `Partner user doesn't exist`)
	} else {
		resp.data = rows[0];
		resp.data.role = 'ADMIN';
		resp.data.userType = 'PARTNER';

		if ((req.decoded != undefined) &&
			(req.decoded.partnerId != undefined)) {
			delete resp.data.id;
		}
		delete resp.data.password;
	}
}


//
//	Partner Login
//
var login = async (req, resp) => {
	var type = 'PARTNER';
	var rows = await Partners.getCorporateUsersByEmail(req.body.email);
	if (rows.length === 0) {
		type = 'PARTNERUSER';
		rows = await Partners.getUserByEmail(req.body.email)
	}

	//	No vendor with this email.
	if (rows.length === 0) {
		resp = formatResp(resp, ["data"], 401, memberText.get("LOGIN_FAIL"));
	} else if ((type === 'PARTNER') && ((rows[0].rrcStatus && (rows[0].rrcStatus !== 'ACTIVE')) || (rows[0].status !== 'ACTIVE'))) {
		resp = formatResp(resp, ["data"], 403, "Access denied,");
	} else {

		//	Password check.
		if ((rows[0].password === null) || (bcrypt.compareSync(req.body.password, rows[0].password) === false)) {
			resp = formatResp(resp, ["data"], 401, memberText.get("LOGIN_FAIL"));
		}
		//	All good so create JWT token and record the login.
		else {
			resp.data.partnerFlag = true;
			resp.data.passwordResetFlag = (!rows[0].passwordResetFlag) ? true : false;

			if (type === 'PARTNER') {
				let partnerId = rows[0].affiliatedWithId ? rows[0].affiliatedWithId : rows[0].id;
				req.partnerId = partnerId;
				req.userId = rows[0].affiliatedWithId ? rows[0].id : undefined;
				resp.data.userType = 'PARTNER';
				resp.data.role = 'ADMIN';
				resp.data.accessToken = jwtUtils.signToken({
					partnerId: partnerId,
					identity: {
						partnerId: partnerId,
						userId: req.userId,
						type: 'PARTNER',
						role: 'ADMIN'
					}
				});
			} else if (type === 'PARTNERUSER') {
				req.partnerId = rows[0].partnerId;
				req.userId = rows[0].id;
				resp.data.userType = 'PARTNERUSER'
				resp.data.role = rows[0].role;
				resp.data.accessToken = jwtUtils.signToken({
					partnerId: rows[0].id,
					identity: {
						partnerId: rows[0].partnerId,
						facilityId: rows[0].facilityId,
						userId: rows[0].id,
						type: 'PARTNERUSER',
						role: rows[0].role
					}
				});
			}

			await PartnerLogins.recordLogin(req, resp)
		}
	}
}



//
//	Reset partner password
//
var resetPassword = async (req, resp) => {
	var type = 'PARTNER';
	var rows = await Partners.getCorporateUsersByEmail(req.body.email, true);

	if (rows.length === 0) {
		type = 'PARTNERUSER';
		rows = await Partners.getUserByEmail(req.body.email)
	}

	if (type === 'PARTNERUSER') {
		await resetUserPassword(req, resp);
	} else {

		if (rows.length > 0) {
			var id = rows[0].id;
			var vid = uuidv1();
			var partner = rows[0];

			//
			//	Only set an ID if there isn't one already.
			//
			if ((partner.verificationId === null) || (partner.verificationId.trim().length === 0)) {
				partner.verificationId = vid;
			}

			//
			//	If password is null send special message for the one-time switch from shopify to rushmarket.com.
			//

			//	Says vendor but this method is actually quite generic.
			partner.name = `${partner.firstName} ${partner.lastName}`
			comms.sendRRCResetEmail(partner);
			await Partners.updateVerificationIdById(id, partner.verificationId);
		} else {
			resp = formatResp(resp, undefined, 404, "Email not found.");
		}
	}
}



//
//	Change Partner Password
//
var changePassword = async (req, resp) => {
	var partner = null;
	var type = 'PARTNER';

	var rows = await Partners.getByVerificationId(req.body.verificationId);
	if (rows.length === 0) {
		resp = formatResp(resp, undefined, 404, memberText.get("CHANGE_PSWD_ID_NOT_FOUND"));
		return resp;
	} else {
		partner = rows[0];

		if (partner.typ === 'PARTNER') {
			type = 'PARTNER';
			await Partners.updateCorporateUserById(partner.id, {
				password: req.body.password,
				passwordResetFlag: true,
				verificationId: null
			}, partner);
		} else if (partner.typ === 'PARTNERUSER') {
			type = 'PARTNERUSER';
			await Partners.updateUserById(partner.id, {
				password: req.body.password,
				passwordResetFlag: true,
				verificationId: null
			}, partner);
		}

		//
		//	We've just updated the password successfully and now we're going to "login" the partner.
		//
		if (resp.data === undefined) {
			resp.data = {};
		}

		if (type === 'PARTNER') {
			resp.data.userType = 'PARTNER';
			resp.data.role = 'ADMIN';
			resp.data.accessToken = jwtUtils.signToken({
				partnerId: rows[0].id,
				identity: {
					partnerId: rows[0].id,
					type: 'PARTNER',
					role: 'ADMIN'
				}
			});
		} else if (type === 'PARTNERUSER') {
			resp.data.userType = 'PARTNERUSER'
			resp.data.role = rows[0].role;
			resp.data.accessToken = jwtUtils.signToken({
				partnerId: rows[0].id,
				identity: {
					partnerId: rows[0].partnerId,
					facilityId: rows[0].facilityId,
					userId: rows[0].id,
					type: 'PARTNERUSER',
					role: rows[0].role
				}
			});
		}


		req.tempId = partner.id;
		await PartnerLogins.recordLogin(req, resp)

		return resp;
	}
}


//
//	Update partner
//
var update = async (req, resp) => {
	var p = await Partners.getById(req.params.id);
	if (p.length === 0) {
		return formatResp(resp, undefined, 404, 'Partner not found.');
	}

	var validationErrors = await validatePartner(req, false);
	if (validationErrors.errorDetails.length > 0) {
		return formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
	}

	if (req.body.name !== undefined) {
		p = await Partners.getByName(req.body.name.trim());
		if ((p.length > 0) && (p[0].id != req.params.id)) {
			return formatResp(resp, undefined, 409, 'Partner with this name already exists.');
		}
	}

	try {
		// TODO: this is a temporary work around for a corporate user to be
		// able to update their password via PUT /partners/{id}. Eventually,
		// a corporate user should update their password via PUT
		// /partners/{id}/corporateUser/{userid} when that endpoint is
		// implemented. The password and passwordResetFlag columns in the
		// partners table will be removed.
		if (req.body.password !== undefined) {
			const rows = await Partners.updateCorporateUserById(req.decoded.identity.userId, req.body);
			if ((rows === undefined) || (rows.affectedRows === 0)) {
				return formatResp(resp, undefined, 404, 'Partner not found.');
			}
		}

		const rows = await Partners.updateById(req.params.id, req.body, req.params.internalFlag);
		if ((rows === undefined) || (rows.affectedRows === 0)) {
			return formatResp(resp, undefined, 404, 'Partner not found.');
		}

		return resp;
	} catch (e) {
		throw (e);
	}
}


//
//	Create Partner Facility
//
var createPartnerFacility = async (req, resp) => {

	var partnerRows = await Partners.getById(req.params.id);
	if (partnerRows.length === 0) {
		formatResp(resp, ['data'], 404, 'Partner not found.')
	} else {
		//	Validate Partner Facility
		var validationErrors = await validatePartnerFacility(req);
		if (validationErrors.errorDetails.length > 0) {
			resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
		} else {
			var rows = await Partners.getByName(req.body.name);
			if (rows.length > 0) {
				resp = formatResp(resp, undefined, 409, memberText.get("VENDOR_COLL"));
			} else {
				var id = await Partners.createFacility(req.params.id, 'PARTNER', req.body)
				resp.id = id;
			}
		}
	}
}



//
//	GET All Partner Facilites
//
var getAllFacilities = async (id, where, offset, limit, resp, sortBy) => {
	var p = await Partners.getById(id);
	if (p.length === 0) {
		formatResp(resp, ['data'], 404, 'Partner not found.')
	} else {
		var result = await Partners.getAllFacilities(where, offset, limit, sortBy);
		resp.metaData.totalCount = result.totalCount;
		resp.data.facilities = result.facilities;
	}

	return resp;
}


//
//	GET Specific Partner Facility
//
var getFacilityById = async (req, resp) => {
	var p = await Partners.getById(req.params.id);
	if (p.length === 0) {
		formatResp(resp, ['data'], 404, 'Partner not found.')
	} else {
		var rows = await Partners.getFacilityById(req.params.fid);
		if (rows.length === 0) {
			formatResp(resp, ['data'], 404, 'Facility not found.')
		} else {
			resp.data = rows[0];

			if ((req.decoded != undefined) &&
				(req.decoded.partnerId != undefined)) {
				delete resp.data.id;
			}
		}
	}

	return resp;
}


//
//	Update Partner Facility
//
var updateFacility = async (req, resp) => {
	var prom = [];

	var p = await Partners.getById(req.params.id);
	if (p.length === 0) {
		resp = formatResp(resp, undefined, 404, 'Partner not found.');
		return resp;
	}

	var validationErrors = await validatePartnerFacility(req, false);
	if (validationErrors.errorDetails.length > 0) {
		resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
		return resp;
	} else {

		if (req.body.name !== undefined) {
			p = await Partners.getByName(req.body.name.trim());
			if ((p.length > 0) && (p[0].id != req.params.id)) {
				resp = formatResp(resp, undefined, 409, 'Partner with this name already exists.');
				return resp;
			}
		}

		try {
			var rows = await Partners.updateFacilityById(req.params.fid, req.body);
			if ((rows === undefined) || (rows.affectedRows === 0)) {
				resp = formatResp(resp, undefined, 404, 'Partner not found.');
			}
			return resp;
		} catch (e) {
			throw (e);
		}
	}
}




//
//	Delete Partner Facility
//
var removeFacility = async (partnerId, facilityId, req, resp) => {
	var result = await Partners.delFacilityById(facilityId);
	if ((result === undefined) || (result.affectedRows === 0)) {
		resp = formatResp(resp, undefined, 404, 'Facility not found.');
	}
}




//
//	Create Partner Facility User
//
var createPartnerFacilityUser = async (partnerId, facilityId, req, resp) => {
	var sortBy = 'first_name ASC, last_name ASC';
	var whereInfo = {
		join: '',
		clause: 'WHERE 1 = 1 AND active = 1',
		values: []
	};

	var partner = await Partners.getById(partnerId);
	var facility = await Partners.getFacilityById(facilityId);


	if (partner.length === 0) {
		resp = formatResp(resp, undefined, 404, "Partner not found.");
	} else if (facility.length === 0) {
		resp = formatResp(resp, undefined, 404, "Facility not found.");
	} else {

		var user = await Partners.getUserByEmail(req.body.email);

		if (user.length > 0) {
			resp = formatResp(resp, undefined, 409, "User with this email already exists.");
		} else {
			//	Validate Partner Facility
			var validationErrors = await validatePartnerUser(req);
			if (validationErrors.errorDetails.length > 0) {
				resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
			} else {


				var result = await Partners.createPartnerFacilityUser(partnerId, req.createdBy, req.params.fid, req.body.email, req.body.firstName, req.body.lastName, req.body.role);
				await resetUserPassword(req, resp);
				resp.id = result.userId;
			}
		}
	}
}


//
//	GET Specific Partner User
//
var getUserById = async (userId, req, resp) => {
	var rows = await Partners.getUserById(userId);
	if (rows.length === 0) {
		formatResp(resp, ['data'], 404, `Partner user doesn't exist`)
	} else {
		resp.data = rows[0];

		if ((req.decoded != undefined) &&
			(req.decoded.partnerId != undefined)) {
			delete resp.data.id;
		}
		delete resp.data.password;
	}
}





//
//	Partner Facility User Reset Password
//
var resetUserPassword = async (req, resp) => {
	var rows = await Partners.getUserByEmail(req.body.email, true);
	if (rows.length > 0) {
		var id = rows[0].id;
		var vid = uuidv1();
		var user = rows[0];

		//
		//	Only set an ID if there isn't one already.
		//
		if ((user.verificationId === null) || (user.verificationId.trim().length === 0)) {
			user.verificationId = vid;
		}

		//
		//	If password is null send special message for the one-time switch from shopify to rushmarket.com.
		//
		user.name = user.firstName;
		comms.sendRRCResetEmail(user);
		await Partners.updateUserVerificationIdById(id, user.verificationId);
	} else {
		resp = formatResp(resp, undefined, 404, "Email not found.");
	}
}


//
//	GET All Partner Facility Users
//
var getAllUsers = async (partnerId, facilityId, where, offset, limit, resp, sortBy) => {
	var p = await Partners.getById(partnerId);
	var f = await Partners.getFacilityById(facilityId);

	if (p.length === 0) {
		formatResp(resp, ['data', 'metaData'], 404, 'Partner not found.')
	} else if (f.length === 0) {
		formatResp(resp, ['data', 'metaData'], 404, 'Facility not found.')
	} else {
		var result = await Partners.getAllUsers(where, offset, limit, sortBy);
		resp.metaData.totalCount = result.totalCount;

		resp.data.users = result.users;
		for (var i = 0; i < resp.data.users.length; i++) {
			delete resp.data.users[i].password;
		}
	}

	return resp;
}



//
//	Update Facility User
//
var updateUser = async (req, resp) => {
	var prom = [];

	var isWorker = false;
	var p = await Partners.getById(req.params.id);
	var f = await Partners.getFacilityById(req.params.fid);

	if (req.decoded && req.decoded.identity && req.decoded.identity.role && req.decoded.identity.role === 'WORKER') {
		isWorker = true;
		delete req.body.facilityId;
		delete req.body.status;
		delete req.body.password;
		delete req.body.role;
		delete req.body.passwordResetFlag;
		delete req.body.verificationId;
	}


	if (p.length === 0) {
		formatResp(resp, ['data', 'metaData'], 404, 'Partner not found.')
	} else if (f.length === 0) {
		formatResp(resp, ['data', 'metaData'], 404, 'Facility not found.')
	} else {

		var validationErrors = await validatePartnerUser(req, false);
		if (validationErrors.errorDetails.length > 0) {
			resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
			return resp;
		} else {

			if (req.body.email !== undefined) {
				p = await Partners.getUserByEmail(req.body.email.trim());
				if ((p.length > 0) && (p[0].id != req.params.id)) {
					resp = formatResp(resp, undefined, 409, 'User with this email already exists.');
					return resp;
				}
			}

			try {
				var rows = await Partners.updateUserById(req.params.uid, req.body);
				if ((rows === undefined) || (rows.affectedRows === 0)) {
					resp = formatResp(resp, undefined, 404, 'User not found.');
				}
				return resp;
			} catch (e) {
				throw (e);
			}
		}
	}
}


//
//	Delete Partner User
//
var removeUser = async (partnerId, facilityId, userId, req, resp) => {
	var result = await Partners.delUserById(userId);
	if ((result === undefined) || (result.affectedRows === 0)) {
		resp = formatResp(resp, undefined, 404, 'User not found.');
	}
}



var captureStorageFees = async (req, resp) => {
	let lastMonth = generateDateRange(req.query.monthsBack);
	let storageFees = await Partners.loadStorageFeeInfo();

	await processCandidateSkusForStorageFees(storageFees, lastMonth.dateStart, lastMonth.dateEnd);
}


var processCandidateSkusForStorageFees = async (storageFees, dateStart, dateEnd) => {
	let skus = await Partners.getCandidateSkusForStorageFees(dateStart.format('YYYY-MM-DD HH:mm'), dateEnd.format('YYYY-MM-DD HH:mm'));

	await processSkuStorageFees(storageFees, dateStart, dateEnd, skus);
}





var generateDateRange = (monthsBack) => {
	if (monthsBack === undefined) {
		monthsBack = 1;
	}

	let lastMonth = {
		dateStart:  moment().subtract(monthsBack, 'months').startOf('month'),
		dateEnd: moment().subtract(monthsBack, 'months').endOf('month').add(1, 'days')
	}

	lastMonth.dateStart.minute(0);
	lastMonth.dateStart.second(0);
	lastMonth.dateEnd.minute(59)
	lastMonth.dateEnd.second(59);
	if (lastMonth.dateStart.isDST()) {
		lastMonth.dateStart.hour(5);
	} else {
		lastMonth.dateStart.hour(6);
	}

	if (lastMonth.dateEnd.isDST()) {
		lastMonth.dateEnd.hour(4);
	} else {
		lastMonth.dateEnd.hour(5);
	}

	console.log(`${lastMonth.dateStart.format('YYYY-MM-DD HH:mm:ss')} ${lastMonth.dateStart.isDST()}`);
	console.log(`${lastMonth.dateEnd.format('YYYY-MM-DD HH:mm:ss')} ${lastMonth.dateEnd.isDST()}`);

	return lastMonth;
}



var processSkuStorageFees = async (storageFees, dateStart, dateEnd, skus) => {
	let daysInMonth = dateStart.daysInMonth();

	for (let i = 0; i < skus.length; i++) {
		let sku = skus[i];

		let partner = _.find(storageFees, (p) => {
			return sku.storeId === p.storeId
		});

		if (!partner) {
			logUtils.log({
				severity: 'ERROR',
				type: 'STORAGE_FEES',
				message: `Coudn't find partner for ${sku.sku}.`,
				stackTrace: new Error().stack
			})
			continue;
		}

		
		let vSku = await Vendors.getByVendorSku(sku.vendorId, sku.sellerProductId);
		if (!vSku) {
			logUtils.log({
				severity: 'ERROR',
				type: 'STORAGE_FEES',
				message: `Couldn't find vsku for ${sku.sku}.`,
				stackTrace: new Error().stack
			})
			continue;
		}


		let monthlyStorageFee = determineMonthlyStorageFeeForVSku(partner.storageFeePerCubicFoot, vSku[0]);

		let locations = await Partners.getProductLogHistory(sku.sku);
		let daysInStorage = processDaysInStorage(locations, dateStart, dateEnd, sku);
		let pctOfMonth = daysInStorage / daysInMonth;
		let storageFee = pctOfMonth <= 0 ? 0.00 : Math.round((monthlyStorageFee.storageFee * pctOfMonth) * 100) / 100;

	  //  See if this is a partner processing their own products.
		const captureFees = await isPartnerFeeCharged(partner.partnerId, { rushSku: sku.sku });
	  if (!captureFees) {
    	storageFee = 0.00;
  	}

		await Partners.captureStorageFee(dateStart.format('YYYY-MM-DD'), sku.sku, sku.storeId, storageFee, monthlyStorageFee.cubicFeet, daysInStorage);
	}
}


var processDaysInStorage = (locations, dateStart, dateEnd, sku) => {
	let spanStartDate = null;
	let currentLocationUpdate = null;
	let daysInStorage = 0;
	let lastLocationUpdate = null;
	let paySpan = false;
	let terminalDate = sku.dateTrashed ? new moment(sku.dateTrashed) : sku.datePurchased ? new moment(sku.datePurchased) : null;


	//	Set the terminal date for the sku to be purchase or trashed date if within target month.  Otherwise end of the month.
	if (!terminalDate || terminalDate.isAfter(dateEnd)) {
		terminalDate = dateEnd;
	}

	spanStartDate = terminalDate;

	//	Determine pay state entering the month and set 
	for (let i = 0; i < locations.length; i++) {
		currentLocationUpdate = new moment(locations[i].dateCreated);

		//	If we're beyond terminal date, calculate days in last span
		if (currentLocationUpdate.isAfter(terminalDate)) {
			daysInStorage += terminalDate.diff(spanStartDate, 'days');
			paySpan = false;
			break;
		}

		//	Prior month
		if (currentLocationUpdate.isBefore(dateStart)) {
			if (locations[i].payStorageFees === 'Y') {
				paySpan = true;
				lastLocationUpdate = new moment(currentLocationUpdate);
				spanStartDate = dateStart;
			}
			else {
				paySpan = false;
			}
		}


		//	If we're past the start of the target month 
		if (currentLocationUpdate.isSameOrAfter(dateStart)) {

			//	If transitioning to a pay fees location
			if (!paySpan && (locations[i].payStorageFees === 'Y')) {
				paySpan = true;
				spanStartDate = currentLocationUpdate;
			}

			//	Already in a pay fees location and it keeps going
			else if (paySpan && (locations[i].payStorageFees === 'Y')) {
				
				//	if last location update was prior month and we're still in pay location, start the current span at the beginning of the month
				if (lastLocationUpdate.isBefore(dateStart)) {
					spanStartDate = dateStart;
				}
			}

			//	Was in a pay fees location, transitioning to no pay.  Capture days in span.
			else if (paySpan && (locations[i].payStorageFees === 'N')) {
				paySpan = false;
				daysInStorage += currentLocationUpdate.diff(spanStartDate, 'days');
			}
				
			else if (locations[i].payStorageFees === 'N') {

				paySpan = false;
			}

			lastLocationUpdate = new moment(currentLocationUpdate);
		}
	}

	//	If in a pay span and no terminating event
	if (paySpan) {
		if (spanStartDate.isSame(dateStart) && terminalDate.isSame(dateEnd)) {
			daysInStorage += terminalDate.diff(spanStartDate, 'days') + 1;
		}
		else {
			daysInStorage += terminalDate.diff(spanStartDate, 'days');
		}
	}

	return daysInStorage;
}

var determineMonthlyStorageFeeForVSku = (storageFeePerCubicFoot, vSku) => {
	let result = {
		storageFee: 0.0,
		cubicFeet: 0.0
	}

	//	We had a case where a sku got trashed and then the vendor sku got deleted.  In that case boxes can't be looked up.
	if (!vSku) {
		return result;
	}

	for (let i = 1; i <= vSku.numberOfBoxes; i++) {
		result.cubicFeet = (vSku[`packageHeight${i}`] * vSku[`packageWidth${i}`] * vSku[`packageLength${i}`]) / 1728;
		result.storageFee += result.cubicFeet * storageFeePerCubicFoot;
	}

	result.storageFee = Math.round(result.storageFee * 100) / 100;

	return result;
}


//
//	Capture fulfillment fee
//
var captureFulfillmentFee = async (storeId, skus) => {
	let resp = {
		statusCode: 201,
		message: 'Success.',
		data: {}
	};


	let orders = [];
	let facility = await Partners.getFacilityByStoreId(storeId);
	if (facility.length === 0) {
		formatResp(resp, ['data', 'metaData'], 404, 'Facility not found.')
		return;
	}	
	facility = facility[0];
	
	let partner = await Partners.getById(facility.affiliatedWithId);
	if (partner.length === 0) {
		formatResp(resp, ['data', 'metaData'], 404, 'Partner not found.')
		return;
	} else 

	partner = partner[0];
	
	

	//	Get order line info for all skus to be fulfilled. Note, they may or may not be from the same order.
	let shopifyOrderVariants = await RushOrders.getShopifyOrderAndVariant(skus);

	//	Initialize response.
	resp.data.fulfillments = [];
	for (var i = 0; i < skus.length; i++) {
		resp.data.fulfillments.push({
			sku: skus[i],
			statusCode: 200,
			message: memberText.get("GET_SUCCESS")
		})
	}


	//	Process each sku.
	for (var i = 0; i < resp.data.fulfillments.length; i++) {
		var index = _.findIndex(shopifyOrderVariants, function (o) {
			return o.sku === resp.data.fulfillments[i].sku
		});
		if (index === -1) {
			resp.data.fulfillments[i].statusCode = 404;
			resp.data.fulfillments[i].message = "SKU line not found.";
		} else {
			let so = shopifyOrderVariants[index];

			//	If this item's store doesn't match that of the facility don't allow access.
			if ((so.storeId !== facility.storeId) || (facility.affiliatedWithId !== partner.id)) {
				resp.data.fulfillments[i].statusCode = 403;
				resp.data.fulfillments[i].message = "SKU access denied.";
			}
			//	Ensure the fulfillment fee hasn't already been captured.
			else if (so.partnerFulfillmentFee) {
				resp.data.fulfillments[i].message = "Fulfillment fee already captured.";
			} else {

				let fulfillmentFee = 0;
				let shipType = (!so.shipType) ? 'Small Parcel' : so.shipType;
				resp.data.fulfillments[i].shipType = shipType;
				resp.data.fulfillments[i].fulfillmentFee = 0;


				//	See if any skus in this order from this partner facility are LTL
				let currentOrder = await getCurrentOrderInfo(so.orderId, so.storeId, orders);

				//	If there is an LTL item in this order and this sku is SP, treat it like an additional LTL item.
				if (currentOrder.ltlFlag && (shipType === 'Small Parcel')) {
					fulfillmentFee = facility.ltlAddlUnitFee;
				} else {
					//	Lookup the other items with the same ship type in the order the sku is in.
					let fulfilledLines = await RushOrders.getFulfilledLinesByShipTypeAndStore(so.orderId, so.sourceLineId, so.storeId, shipType);

					//	No fulfilled lines from the same partner and ship type, this is the first.
					if (fulfilledLines.length == 0) {
						if (shipType === 'Small Parcel') {
							fulfillmentFee = facility.spFirstUnitFee;
						} else {
							fulfillmentFee = facility.ltlFirstUnitFee;
						}
					}
					//	This is an additional unit on the order.
					else {
						if (shipType === 'Small Parcel') {
							fulfillmentFee = facility.spAddlUnitFee;
						} else {
							fulfillmentFee = facility.ltlAddlUnitFee;
						}
					}
				}

				//  See if this is a partner processing their own products.
				const captureFees = await isPartnerFeeCharged(partner.id, { rushSku: resp.data.fulfillments[i].sku });
  			if (!captureFees) {
    			fulfillmentFee = 0.00;
  			}

				resp.data.fulfillments[i].fulfillmentFee = fulfillmentFee;
				await RushOrders.capturePartnerFulfillmentFee(so.sourceLineId, fulfillmentFee);
			}
		}
	}
}



var getCurrentOrderInfo = async (orderId, storeId, orders) => {
	let currentOrder = {}

	let index = _.findIndex(orders, function (o) {
		return o.orderId === orderId;
	})
	if (index === -1) {
		let ltl = await RushOrders.ltlCheck(orderId, storeId);
		currentOrder.ltlFlag = (ltl.length > 0) ? true : false;
		currentOrder.orderId = orderId

		orders.push(currentOrder);
	} else {
		currentOrder = orders[index];
	}

	return currentOrder;
}



module.exports = {
	captureStorageFees,
	changePassword,
	create,
	createPartnerFacility,
	createPartnerFacilityUser,
	captureFulfillmentFee,
	getAll,
	getAllFacilities,
	getAllUsers,
	getFacilityById,
	getById,
	getPartnerSchema,
	getUserById,
	login,
	removeFacility,
	removeUser,
	resetPassword,
	resetUserPassword,
	update,
	updateFacility,
	updateUser
}
