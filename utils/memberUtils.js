const _ = require('lodash');
const emailvalidator = require('email-validator');
const isValidZipcode = require('is-valid-zipcode');
const legit = require('legit');
const pv = require('password-validator');

const Members = require('../models/members');
const MemberLogins = require('../models/memberLogins');
const TargetedCities = require('../models/targetedCities');
const ZipToCity = require('../models/zipToCity');

const jwtUtils = require('../actions/jwtUtils');
const memberText = require('./memberTextUtils');
const validationUtils = require('../utils/validationUtils');



var createMemberAlias = (len) => {
	var text = "";
	var possible = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

	for (var i = 0; i < len; i++)
		text += possible.charAt(Math.floor(Math.random() * possible.length));

	return text;
}



var determineMemberType = async (zip) => {
	var memberType = "memberType:secondary";
	var zipLookup = await ZipToCity.lookupCity(zip);
	if (zipLookup.length > 0) {
		if (zipLookup[0].type === "PRIMARY") {
			memberType = "memberType:primary";
		}
	}

	return memberType;
}


var determineRegion = async (zip, homeCityId) => {
	var region = "region:oom";

	//	Give preference to home city so if member slotted to city A is setHomeCity'd to city B the region is based on the city.
	if (homeCityId) {
		var cityInfo = await TargetedCities.getById(homeCityId);
		if (cityInfo.length !== undefined) {
			region = `region:${cityInfo[0].citySlug}`;
		}
	}
	else {
		var zipLookup = await ZipToCity.lookupCity(zip);
		if (zipLookup.length > 0) {
			region = `region:${zipLookup[0].city_slug}`;
		}
	}

	// console.log(`Determined region: ${region} ${zip} ${homeCityId}`)
	return region;
}




var generateAccessToken = async (req, resp, memberId) => {
	if (resp.data === undefined) {
		resp.data = {};
	}
	resp.data.accessToken = jwtUtils.signToken({
		memberId: memberId
	});

	req.tempId = memberId;
	await MemberLogins.recordLogin(req, resp);
}



var revalidatePartial = async (id, skipLegit) => {
	try {
		//
		// Grab the newly updated member.
		//

		var rows = await Members.getById(id);
		var r = {
			body: rows[0]
		};

		var validationErrors = await validateMember(r, true, false, true);
		if (validationErrors.errorDetails.length > 0) {
			//
			//	Still not full info so leave PARTIAL and update internal notes.
			//
			await Members.updateById(id, true, {
				internalNotes: validationErrors.message
			}, rows[0]);
		} else {
			//
			//	No validation errors so set status to ACTIVE if not OOM.
			//
			if (r.body.status !== 'OUTSIDE_GEOGRAPHIC') {
				await Members.updateById(id, true, {
					status: 'ACTIVE',
					internalNotes: ''
				}, rows[0]);
			}
			else {
				await Members.updateById(id, true, {
					internalNotes: ''
				}, rows[0]);
			}
		}

		return validationErrors;

	} catch (e) {
		throw new Error(e);
	}
}



var validateMember = async (req, validateRequired, skipPassword, skipLegit) => {
	try {
		var invalidEmailFlag = false;
		var invalidInfo = [];
		var result = undefined;
		var requiredInfo = [];
		var validationErrors = {
			errorDetails: [],
			message: ""
		}

		//	Validate required member info


		//	As of 4/13/21 first and last name are no longer required.
		//
		// if (validateRequired && ((req.body.firstName === undefined) || (req.body.firstName === null) || (req.body.firstName.trim().length === 0))) {
		// 	requiredInfo.push({
		// 		error: "isRequired",
		// 		field: "firstName",
		// 		text: "First Name"
		// 	});
		// }
		// if (validateRequired && ((req.body.lastName === undefined) || (req.body.lastName === null) || (req.body.lastName.trim().length === 0))) {
		// 	requiredInfo.push({
		// 		error: "isRequired",
		// 		field: "lastName",
		// 		text: "Last Name"
		// 	});
		// }
		if (validateRequired && ((req.body.zip === undefined) || (req.body.zip === null) || (req.body.zip.length === 0))) {
			requiredInfo.push({
				error: "isRequired",
				field: "zip",
				text: "Zip Code"
			});
		}
		if (validateRequired && ((req.body.email === undefined) || (req.body.email === null))) {
			requiredInfo.push({
				error: "isRequired",
				field: "email",
				text: "Email"
			});
		}
		if (validateRequired && ((skipPassword === undefined) || (skipPassword === false)) && ((req.body.password === undefined) || (req.body.password === null))) {
			requiredInfo.push({
				error: "isRequired",
				field: "password",
				text: "Password"
			});
		}


		if (req.body.email !== undefined) {
			if (emailvalidator.validate(req.body.email) === false) {
				invalidEmailFlag = true;
				invalidInfo.push({
					error: "invalid",
					field: "email",
					text: "Email"
				});
			}
		}


		if ((req.body.firstName !== undefined) && (req.body.firstName !== null) && (req.body.firstName.trim().length === 0)) {
			invalidInfo.push({
				error: "invalid",
				field: "firstName",
				text: "First Name"
			});
		}
		if ((req.body.lastName !== undefined) && (req.body.lastName !== null) && (req.body.lastName.trim().length === 0)) {
			invalidInfo.push({
				error: "invalid",
				field: "lastName",
				text: "Last Name"
			});
		}


		if (req.body.emailVerificationFlag !== undefined) {
			if ((req.body.emailVerificationFlag !== true) && (req.body.emailVerificationFlag !== false)) {
				invalidInfo.push({
					error: "invalid",
					field: "emailVerificationFlag",
					text: "Email Verification Flag"
				});
			}
		}
		if (req.body.verifiedMemberFlag !== undefined) {
			if ((req.body.verifiedMemberFlag !== true) && (req.body.verifiedMemberFlag !== false)) {
				invalidInfo.push({
					error: "invalid",
					field: "verifiedMemberFlag",
					text: "Verfiied Member Flag"
				});
			}
		}
		if (req.body.status !== undefined) {
			if ((req.body.status !== "ACTIVE") &&
				(req.body.status !== "PARTIAL") &&
				(req.body.status !== "INACTIVE") &&
				(req.body.status !== "REVOKED_COMPETITOR") &&
				(req.body.status !== "REVOKED_OUTSIDE_AREA") &&
				(req.body.status !== "REVOKED_GENERAL") &&
				(req.body.status !== "OUTSIDE_GEOGRAPHIC") &&
				(req.body.status !== "DUPLICATE")) {
				invalidInfo.push({
					error: "invalid",
					field: "status",
					text: "Status"
				});
			}
		}
		if (req.body.emailMarketingStatus !== undefined) {
			if ((req.body.emailMarketingStatus !== "SUBSCRIBED") &&
				(req.body.emailMarketingStatus !== "UNSUBSCRIBED") &&
				(req.body.emailMarketingStatus !== "CLEANED") &&
				(req.body.emailMarketingStatus !== "REJECTED")) {
				invalidInfo.push({
					error: "invalid",
					field: "emailMarketingStatus",
					text: "Email Marketing Status"
				});
			}
		}
		if ((req.body.zip !== undefined) && (req.body.zip !== null)) {
			if (((req.body.zip.length > 0) && (isValidZipcode(req.body.zip) === false))) {
				invalidInfo.push({
					error: "invalid",
					field: "zip",
					text: "Zip Code"
				});
			}
		}


		if ((req.body.password !== undefined) && (skipPassword === undefined)) {
			var schema = new pv();
			schema
				.is().min(6);
				// .is().max(40)
				// .has().uppercase()
				// .has().lowercase()
				// .has().letters()
				// .has().digits()
				// .has().symbols()
				// .has().not().spaces();

			if (!schema.validate(req.body.password)) {
				invalidInfo.push({
					error: "badpassword",
					field: "password",
					text: "Password"
				});
				validationErrors.message = validationErrors.message + " " + memberText.get("BAD_PASSWORD");
			}
		}


		if ((req.body.email !== undefined) && (req.body.email !== null) && (req.body.email.length > 0) && ((skipLegit === undefined) || (skipLegit === false))) {
			try {
				if ((!req.body.email.toLowerCase().endsWith('@mmm.com')) && (!req.body.email.toLowerCase().endsWith('@icloud.com')) && (!req.body.email.toLowerCase().endsWith('@mac.com')) && (!req.body.email.toLowerCase().endsWith('@firstdata.com'))) {
					result = await legit(req.body.email);
				}

				if (!invalidEmailFlag && (result !== undefined) && (result.length > 0)) {
					if (result[0].isValid === false) {
						invalidInfo.push({
							error: "invalid",
							field: "email",
							text: "Email"
						});
					}
				}

			} catch (e) {
				if (req.body.email !== undefined) {
					if (!invalidEmailFlag) {
						invalidInfo.push({
							error: "invalid",
							field: "email",
							text: "Email"
						});
					}
				}
			}

		}

		validationErrors = validationUtils.finalizeValidationErrors(validationErrors, requiredInfo, invalidInfo);

		return validationErrors;
	} catch (e) {
		throw new Error(e);
	}
}



module.exports = {
	createMemberAlias,
	determineMemberType,
	determineRegion,
	generateAccessToken,
	revalidatePartial,
	validateMember
};