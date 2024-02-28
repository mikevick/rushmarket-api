const checkGeo = require('check-geographic-coordinates');
const ein = require('ein-validator');
const isValidZipcode = require('is-valid-zipcode');
const memberText = require('./memberTextUtils');
const pv = require('password-validator');
const validator = require('validator');

const validationUtils = require('../utils/validationUtils');



var validatePartner = async (req, validateRequired) => {
	var invalidEmailFlag = false;
	var invalidInfo = [];
	var prom = [];
	var requiredInfo = [];
	var validationErrors = {
		errorDetails: [],
		message: ""
	}

	//	Validate required vendor info
	if ((validateRequired === undefined) || (validateRequired)) {
		if ((req.body.email === undefined) || (req.body.email === null) || (req.body.email.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "email",
				text: "Partner Email"
			});
		}
		if ((req.body.name === undefined) || (req.body.name === null) || (req.body.name.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "name",
				text: "Partner Name"
			});
		}

		if ((req.body.paymentTerms === undefined) || (req.body.paymentTerms === null) || (req.body.paymentTerms.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "paymentTerms",
				text: "Payment Terms"
			});
		}


	}


	if (req.body.companyPostalCode != undefined) {
		req.body.companyPostalCode = req.body.companyPostalCode.trim();
		if (isValidZipcode(req.body.companyPostalCode) === false) {
			invalidInfo.push({
				error: "invalid",
				field: "companyPostalCode",
				text: "Company Postal Code"
			});
		}
	}

	if ((req.body.email !== undefined) && (req.body.email !== null)) {
		req.body.email = req.body.email.trim();
		if (!validator.isEmail(req.body.email)) {
			invalidInfo.push({
				error: "invalid",
				field: "email",
				text: "Email"
			});
		}
	}

	if (req.body.password !== undefined) {
		req.body.password = req.body.password.trim();

		var schema = new pv();
		schema
			.is().min(6);

		if (!schema.validate(req.body.password)) {
			invalidInfo.push({
				error: "badpassword",
				field: "password",
				text: "Password"
			});
			validationErrors.message = validationErrors.message + " " + memberText.get("BAD_PASSWORD");
		}
	}


	if (req.body.websiteAddress != undefined) {
		req.body.websiteAddress = req.body.websiteAddress.trim();
		if (validator.isURL(req.body.websiteAddress) === false) {
			invalidInfo.push({
				error: "invalid",
				field: "websiteAddress",
				text: "Website Address"
			});
		}
	}


	if (req.body.taxIdNumber != undefined) {
		req.body.taxIdNumber = req.body.taxIdNumber.trim();
		if (ein.isValid(req.body.taxIdNumber) === false) {
			invalidInfo.push({
				error: "invalid",
				field: "taxIdNumber",
				text: "Tax ID Number"
			});
		}
	}


	if (req.body.adminName != undefined) {
		req.body.adminName = req.body.adminName.trim();
		if (req.body.adminName.length === 0) {
			invalidInfo.push({
				error: "invalid",
				field: "adminName",
				text: "Admin Name"
			});
		}
	}
	if (req.body.apName != undefined) {
		req.body.apName = req.body.apName.trim();
		if (req.body.apName.length === 0) {
			invalidInfo.push({
				error: "invalid",
				field: "apName",
				text: "AP Name"
			});
		}
	}
	if ((req.body.apEmail !== undefined) && (req.body.apEmail !== null)) {
		req.body.apEmail = req.body.apEmail.trim();
		if (!validator.isEmail(req.body.apEmail)) {
			invalidInfo.push({
				error: "invalid",
				field: "apEmail",
				text: "AP Email"
			});
		}
	}
	if (req.body.apPostalCode != undefined) {
		if (isValidZipcode(req.body.apPostalCode) === false) {
			invalidInfo.push({
				error: "invalid",
				field: "apPostalCode",
				text: "AP Postal Code"
			});
		}
	}
	if (req.body.csName != undefined) {
		req.body.csName = req.body.csName.trim();
		if (req.body.csName.length === 0) {
			invalidInfo.push({
				error: "invalid",
				field: "csName",
				text: "Customer Service Name"
			});
		}
	}
	if ((req.body.csEmail !== undefined) && (req.body.csEmail !== null)) {
		req.body.csEmail = req.body.csEmail.trim();
		if (!validator.isEmail(req.body.csEmail)) {
			invalidInfo.push({
				error: "invalid",
				field: "csEmail",
				text: "Customer Service Email"
			});
		}
	}

	if (req.body.leadTime != undefined) {
		req.body.leadTime = req.body.leadTime;
		if ((!Number.isInteger(req.body.leadTime) && (validator.isInt(req.body.leadTime) === false))) {
			invalidInfo.push({
				error: "invalid",
				field: "leadTime",
				text: "Lead Time"
			});
		}
	}

	if (req.body.shippingCutoffCst != undefined) {
		req.body.shippingCutoffCst = req.body.shippingCutoffCst.trim();
		var colon = req.body.shippingCutoffCst.indexOf(':');
		var valid = true;

		if (colon > 0) {
			var hours = parseInt(req.body.shippingCutoffCst.substring(0, colon));
			var minutes = parseInt(req.body.shippingCutoffCst.substring(colon + 1));

			if (isNaN(hours) || isNaN(minutes)) {
				valid = false;
			} else {
				if ((hours < 0) || (hours > 23) || (minutes < 0) || (minutes > 59)) {
					valid = false;
				}
			}
		} else {
			valid = false;
		}
		if (!valid) {
			invalidInfo.push({
				error: "invalid",
				field: "shippingCutoffCst",
				text: "Shipping Cutoff CST"
			});
		}
	}

	if (req.body.rrcStatus !== undefined) {
		req.body.rrcStatus = req.body.rrcStatus.trim();
		if ((req.body.rrcStatus !== 'ACTIVE') && (req.body.rrcStatus !== 'INACTIVE')) {
			invalidInfo.push({
				error: "invalid",
				field: "rrcStatus",
				text: "RRC Status"
			});
		}
	}

	if (req.body.status !== undefined) {
		req.body.status = req.body.status.trim();
		if ((req.body.status !== 'ACTIVE') && (req.body.status !== 'INACTIVE')) {
			invalidInfo.push({
				error: "invalid",
				field: "status",
				text: "Status"
			});
		}
	}

	if (req.body.spFirstUnitFee != undefined) {
		if (isNaN(req.body.spFirstUnitFee) || (parseFloat(req.body.spFirstUnitFee) === NaN)) {
			invalidInfo.push({
				error: "invalid",
				field: "spFirstUnitFee",
				text: "Small Parcel First Unit Fee"
			});
		}
	}

	if (req.body.spAddlUnitFee != undefined) {
		if (isNaN(req.body.spAddlUnitFee) || (parseFloat(req.body.spAddlUnitFee) === NaN)) {
			invalidInfo.push({
				error: "invalid",
				field: "spAddlUnitFee",
				text: "Small Parcel Additional Unit Fee"
			});
		}
	}

	if (req.body.ltlFirstUnitFee != undefined) {
		if (isNaN(req.body.ltlFirstUnitFee) || (parseFloat(req.body.ltlFirstUnitFee) === NaN)) {
			invalidInfo.push({
				error: "invalid",
				field: "ltlFirstUnitFee",
				text: "LTL First Unit Fee"
			});
		}
	}

	if (req.body.ltlAddlUnitFee != undefined) {
		if (isNaN(req.body.ltlAddlUnitFee) || (parseFloat(req.body.ltlAddlUnitFee) === NaN)) {
			invalidInfo.push({
				error: "invalid",
				field: "ltlAddlUnitFee",
				text: "LTL Additional Unit Fee"
			});
		}
	}

	if (req.body.storageFeePerCubicFoot != undefined) {
		if (isNaN(req.body.storageFeePerCubicFoot) || (parseFloat(req.body.storageFeePerCubicFoot) === NaN)) {
			invalidInfo.push({
				error: "invalid",
				field: "storageFeePerCubicFoot",
				text: "Storage Fee Per Cubic Foot"
			});
		}
	}

	if (req.body.handleLtl !== undefined) {
		if ((req.body.handleLtl.toUpperCase() !== 'TRUE') && (req.body.handleLtl.toUpperCase() !== 'FALSE') &&
				(req.body.handleLtl.toUpperCase() !== true) && (req.body.handleLtl.toUpperCase() !== false)) {
			invalidInfo.push({
				error: "invalid",
				field: "handleLtl",
				text: "Handle LTL"
			});
		}
	}

	if (req.body.handleSp !== undefined) {
		if ((req.body.handleSp.toUpperCase() !== 'TRUE') && (req.body.handleSp.toUpperCase() !== 'FALSE') &&
				(req.body.handleSp.toUpperCase() !== true) && (req.body.handleSp.toUpperCase() !== false)) {
			invalidInfo.push({
				error: "invalid",
				field: "handleSp",
				text: "Handle Small Parcel"
			});
		}
	}

	if (req.body.pickupLtl !== undefined) {
		if ((req.body.pickupLtl.toUpperCase() !== 'TRUE') && (req.body.pickupLtl.toUpperCase() !== 'FALSE') &&
				(req.body.pickupLtl.toUpperCase() !== true) && (req.body.pickupLtl.toUpperCase() !== false)) {
			invalidInfo.push({
				error: "invalid",
				field: "pickupLtl",
				text: "Pickup LTL"
			});
		}
	}

	if (req.body.pickupSp !== undefined) {
		if ((req.body.pickupSp.toUpperCase() !== 'TRUE') && (req.body.pickupSp.toUpperCase() !== 'FALSE') &&
				(req.body.pickupSp.toUpperCase() !== true) && (req.body.pickupSp.toUpperCase() !== false)) {
			invalidInfo.push({
				error: "invalid",
				field: "pickup",
				text: "Pickup Small Parcel"
			});
		}
	}

	if (req.body.allowCustomerPickup !== undefined) {
		if ((req.body.allowCustomerPickup.toUpperCase() !== 'TRUE') && (req.body.allowCustomerPickup.toUpperCase() !== 'FALSE') &&
				(req.body.allowCustomerPickup.toUpperCase() !== true) && (req.body.allowCustomerPickup.toUpperCase() !== false)) {
			invalidInfo.push({
				error: "invalid",
				field: "allowCustomerPickup",
				text: "Allow Customer Pickup"
			});
		}
	}

	validationErrors = validationUtils.finalizeValidationErrors(validationErrors, requiredInfo, invalidInfo);

	return validationErrors;
}


var validatePartnerFacility = async (req, validateRequired) => {
	var invalidInfo = [];
	var requiredInfo = [];
	var validationErrors = {
		errorDetails: [],
		message: ""
	}

	//	Validate required vendor info
	if ((validateRequired === undefined) || (validateRequired)) {
		if ((req.body.name === undefined) || (req.body.name === null) || (req.body.name.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "name",
				text: "Facility Name"
			});
		}
		if ((req.body.address1 === undefined) || (req.body.address1 === null) || (req.body.address1.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "name",
				text: "Partner Name"
			});
		}

		if ((req.body.city === undefined) || (req.body.city === null) || (req.body.city.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "city",
				text: "Facility City"
			});
		}

		if ((req.body.stateOrProvince === undefined) || (req.body.stateOrProvince === null) || (req.body.stateOrProvince.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "stateOrProvince",
				text: "Facility State or Province"
			});
		}

		if ((req.body.postalCode === undefined) || (req.body.postalCode === null) || (req.body.postalCode.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "postalCode",
				text: "Facility Postal Code"
			});
		}

		if ((req.body.country === undefined) || (req.body.country === null) || (req.body.country.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "country",
				text: "Facility Country"
			});
		}
	}


	if (req.body.postalCode != undefined) {
		req.body.postalCode = req.body.postalCode.trim();
		if (isValidZipcode(req.body.postalCode) === false) {
			invalidInfo.push({
				error: "invalid",
				field: "postalCode",
				text: "Facility Postal Code"
			});
		}
	}

	if (req.body.lat != undefined) {
		if (isNaN(req.body.lat) || (parseFloat(req.body.lat) === NaN) || (!checkGeo.latitude(req.body.lat))) {
			invalidInfo.push({
				error: "invalid",
				field: "lat",
				text: "Facility Lat"
			});
		}
	}
	if (req.body.lng != undefined) {
		if (isNaN(req.body.lng) || (parseFloat(req.body.lng) === NaN) || (!checkGeo.longitude(req.body.lng))) {
			invalidInfo.push({
				error: "invalid",
				field: "long",
				text: "Facility Lng"
			});
		}
	}

	validationErrors = validationUtils.finalizeValidationErrors(validationErrors, requiredInfo, invalidInfo);

	return validationErrors;
}


var validatePartnerUser = async (req, validateRequired) => {
	var invalidInfo = [];
	var requiredInfo = [];
	var validationErrors = {
		errorDetails: [],
		message: ""
	}

	//	Validate required vendor info
	if ((validateRequired === undefined) || (validateRequired)) {
		if ((req.body.firstName === undefined) || (req.body.firstName === null) || (req.body.firstName.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "firstName",
				text: "First Name"
			});
		}
		if ((req.body.lastName === undefined) || (req.body.lastName === null) || (req.body.lastName.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "lastName",
				text: "Last Name"
			});
		}

		if ((req.body.email === undefined) || (req.body.email === null) || (req.body.email.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "email",
				text: "Email"
			});
		}

		if ((req.body.role === undefined) || (req.body.role === null) || (req.body.role.trim().length === 0)) {
			requiredInfo.push({
				error: "isRequired",
				field: "stateOrProvince",
				text: "Facility State or Province"
			});
		}
	}


	if ((req.body.email !== undefined) && (req.body.email !== null)) {
		req.body.email = req.body.email.trim();
		if (!validator.isEmail(req.body.email)) {
			invalidInfo.push({
				error: "invalid",
				field: "email",
				text: "User Email"
			});
		}
	}

	if (req.body.password !== undefined) {
		req.body.password = req.body.password.trim();

		var schema = new pv();
		schema
			.is().min(6);

		if (!schema.validate(req.body.password)) {
			invalidInfo.push({
				error: "badpassword",
				field: "password",
				text: "Password"
			});
			validationErrors.message = validationErrors.message + " " + memberText.get("BAD_PASSWORD");
		}
	}

	if (req.body.role != undefined) {
		req.body.role = req.body.role.trim();
		if ((req.body.role !== 'MANAGER') && (req.body.role !== 'WORKER')) {
			invalidInfo.push({
				error: "invalid",
				field: "role",
				text: "Role"
			});
		}
	}

	validationErrors = validationUtils.finalizeValidationErrors(validationErrors, requiredInfo, invalidInfo);

	return validationErrors;
}



module.exports = {
	validatePartner,
	validatePartnerFacility,
	validatePartnerUser
}