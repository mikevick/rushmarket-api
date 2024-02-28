'use strict';

const bcrypt = require('bcrypt'), SALT_WORK_FACTOR = 10;
const { BitlyClient } = require('bitly');
const bitly = new BitlyClient('4279a153d8dc129b4a8d80e5da1b8e78074019b3', {});
const isValidZipcode = require('is-valid-zipcode');
const Multipassify = require('multipassify');
const { v1: uuidv1 } = require('uuid');


const Coins = require('../models/coins');
const MasterData = require('../models/masterData');
const MemberOrders = require('../models/memberOrders');
const Members = require('../models/members');
const MemberLogins = require('../models/memberLogins');
const MemberTidbits = require('../models/memberTidbits');
const Messages = require('../models/messages');
const ProductHolds = require('../models/productHolds');
const Stores = require('../models/stores');
const TargetedCities = require('../models/targetedCities');
const TidbitTypes = require('../models/tidbitTypes');
const Vendors = require('../models/vendors');
const ZipToCity = require('../models/zipToCity');


const {
	sendEmail,
	sendNotificationEmail
} = require('../utils/comms');
const configUtils = require('../utils/configUtils')
const jwtUtils = require('../actions/jwtUtils');
const logUtils = require('../utils/logUtils');
const mailchimpUtils = require('../utils/mailchimpUtils');
const memberUtils = require('../utils/memberUtils');
const {
	revalidatePartial,
	validateMember
} = require('../utils/memberUtils');
const memberText = require('../utils/memberTextUtils');
const { formatResp } = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');
const shopifyUtils = require('../utils/shopifyUtils');



var slottingAlgo = process.env.SLOTTING_ALGO ? process.env.SLOTTING_ALGO : "OUT_OF_MARKET";



//
//	Add a member.
//
var addMember = async (sourceShop, city, req, hash, verificationId, validationErrors) => {
	var cityId = 0;
	var cityInfo = null;
	var inStoreFlag = false;
	var newId = null;
	var notes = validationErrors.errorDetails.length > 0 ? validationErrors.message : null;
	var physicalCityInfo = null;
	var physicalStore = undefined;
	var prom = [];
	var shopifyCustomerId = 0;
	var status = (notes === null) ? ((city != undefined) ? 'ACTIVE' : 'OUTSIDE_GEOGRAPHIC') : (city != undefined) ? 'PARTIAL' : 'OUTSIDE_GEOGRAPHIC';
	var storeId = 0;
	var verifiedMemberFlag = ((req.body.verifiedMemberFlag != undefined) && (req.body.verifiedMemberFlag === true)) ? true : false;



	//	Special case status setting if FB signup.
	if (req.body.facebookId && 
			city && 
			(validationErrors.errorDetails.length === 1) && 
			(validationErrors.errorDetails[0].field === 'password')) {
		status = 'ACTIVE'
	}


	if (sourceShop != undefined) {
		inStoreFlag = true;
	}


	//	3/30/2021	Taking out auto checkin per Marcus' direction
	//
	//	Special case status initialization if this is an add from shopify
	// if (sourceShop != undefined) {
	// 	//	2019-07-26 Set the instore flag = true so a member added from shopify will get checked in.
	// 	inStoreFlag = true;
	// 	req.body.inStoreInfo = {};
	// 	req.body.inStoreInfo.guestCount = 0;

	// 	//	Physical stores
	// 	if ((sourceShop === 'rushmarket.myshopify.com') || (sourceShop === 'rushmarkettest.myshopify.com')) {
	// 		req.body.inStoreInfo.storeId = 104;
	// 	} else if ((sourceShop === 'rushmarketlincoln.myshopify.com') || (sourceShop === 'rushmarketlincolntest.myshopify.com')) {
	// 		req.body.inStoreInfo.storeId = 105;
	// 	}

	// 	//	Online only
	// 	else {
	// 		inStoreFlag = false;
	// 		delete req.body.inStoreInfo;
	// 	}

	// 	if ((notes != null) && (notes.length > 0) && ((req.body.zip === null) || (req.body.zip.length < 5))) {
	// 		status = 'PARTIAL';
	// 	}
	// }

	//	If city is populated, the member was slotted into a home market.
	if (city && (req.body.zip !== '')) {
		cityInfo = shopifyUtils.getCityInfoByCity(city, req.body.rushInsiderFlag);
		storeId = cityInfo.id;
		cityId = cityInfo.cityId;
		if (sourceShop != undefined) {
			shopifyCustomerId = req.body.id;
		}
	}

	//
	//	3/29/2021 - Marcus directed that if no zip provided in POS, member should be sloted to OOM.
	//	
	//	2/14/2023	- As part of Mailchimp restructure, if POS and no zip
	//
	// If sourceShop is populated, the member was added from Shopify.
	else if (sourceShop != undefined) {
		if (req.body.zip === "") {
			cityInfo = shopifyUtils.getCityInfoByShop(sourceShop);
			// storeId = cityInfo.id;
			// cityId = cityInfo.cityId;
			shopifyCustomerId = req.body.id;
		}
	}

	//	If member signing up in-store, verify them and set flag.
	if (req.body.inStoreInfo != undefined) {
		inStoreFlag = true;
		verifiedMemberFlag = true;
		req.body.verifiedMemberFlag = true;
	}


	if (req.body.homeCityId === undefined) {
		req.body.homeCityId = cityId;
	}
	

	newId = await Members.create(status, req.body.firstName, req.body.lastName, req.body.email, hash, req.body.zip, storeId, cityId, verificationId, verifiedMemberFlag, notes,
		req.body.facebookId, req.body.photoUrl, req.body.marketingMedium, req.body.marketingSource, req.body.marketingCampaign, req.body.marketingTerm, req.body.marketingContent, inStoreFlag,
		req.body.rushInsiderFlag);

	if (req.body.inStoreInfo != undefined) {
		physicalStore = await Stores.getById(req.body.inStoreInfo.storeId);
		physicalCityInfo = shopifyUtils.getCityInfoByCity(physicalStore[0].address.city);
	}

	//	Signing up in physical store use store's city info if not already populated.
	if ((cityInfo === null) && (physicalStore != undefined) && (physicalStore[0] != undefined)) {
		cityInfo = physicalCityInfo;
	}



	//	If we have cityInfo, an email and a home storeId add to city's mailing list.
	if ((storeId > 0) && (cityInfo !== null) && (req.body.email != null) && (req.body.email.trim().length > 0)) {
		req.body.citySlug = cityInfo.citySlug;
		await mailchimpUtils.addListMemberFromReq(cityInfo.emailListName, req);
		await mailchimpUtils.removeListMember(configUtils.get("MAILCHIMP_NON_MEMBER_LIST"), req.body.email);
	}


	//	If not slotted and algo is OUT_OF_MARKET add to outliers.
	if ((slottingAlgo === 'OUT_OF_MARKET') && (storeId === 0) && (req.body.email !== undefined) && (req.body.email.trim().length > 0)) {
		req.body.citySlug = 'oom';
		await mailchimpUtils.addListMemberFromReq(process.env.MAILCHIMP_OUTLIER_LIST, req);
		await mailchimpUtils.removeListMember(configUtils.get("MAILCHIMP_NON_MEMBER_LIST"), req.body.email);
	}

	//	If member being added via API, add to shopify, otherwise resolve the customer id from the request.
	if ((sourceShop === undefined) && (cityInfo !== null)) {
		var citySlug = cityInfo.citySlug;
		var result = await shopifyUtils.addMember(cityInfo, req);

		//	If the shopify add was successful, link the shopify customer id
		if ((result !== undefined) && (result !== null) && (result.id > 0)) {
			await Members.linkMemberToShopifyStore(newId, cityInfo.shopName, result.id);
		}


		//	2020-06-29 No more hub.
		//	Add the member to the hub shopify store.
		// var hubCityInfo = shopifyUtils.getCityInfoByShopId(cityInfo.hubShopifyStoreId);
		// if (cityInfo.id !== hubCityInfo.id) {
		// 	hubCityInfo.citySlug = citySlug;
		// 	result = await shopifyUtils.addMember(hubCityInfo, req);

		// 	//	If the shopify add was successful, link the shopify customer id
		// 	if ((result !== undefined) && (result !== null) && (result.id > 0)) {
		// 		await Members.linkMemberToShopifyStore(newId, hubCityInfo.shopName, result.id);
		// 	}
		// }


		//	If in-store signup and the member's home city is different from the physical store, add them to the physical store's shopify store.
		if ((physicalCityInfo !== null) && (physicalCityInfo.id !== cityInfo.id)) {
			// hubCityInfo.citySlug = citySlug;
			result = await shopifyUtils.addMember(physicalCityInfo, req);
			if ((result !== undefined) && (result !== null) && (result.id > 0)) {
				await Members.linkMemberToShopifyStore(newId, physicalCityInfo.shopName, result.id);
			}
		}

	} else {

		if (sourceShop != undefined) {
			shopifyCustomerId = req.body.id;
		}

		if (shopifyCustomerId > 0) {
			await Members.linkMemberToShopifyStore(newId, sourceShop, shopifyCustomerId);

			//	Member added via shopify so update because we would have set verified to true.
			var shopifyUpdateInfo = await shopifyUtils.prepareShopifyUpdateBody({
				homeCityId: storeId
			}, req.body);
			var r = await shopifyUtils.updateMemberInfo(0, newId, shopifyUpdateInfo)

			//	2020-06-29 No more hub.
			//	Add to hub shopify store.
			// var hubCityInfo = shopifyUtils.getCityInfoByShopId(cityInfo.hubShopifyStoreId);
			// if (cityInfo.id !== hubCityInfo.id) {
			// 	hubCityInfo.citySlug = cityInfo.citySlug;
			// 	result = await shopifyUtils.addMember(hubCityInfo, req);

			// 	//	If the shopify add was successful, link the shopify customer id
			// 	if ((result !== undefined) && (result !== null) && (result.id > 0)) {
			// 		await Members.linkMemberToShopifyStore(newId, hubCityInfo.shopName, result.id);
			// 	}
			// }
		}
	}

	//
	//	If this is an in-store signup, check the member in.
	//
	// if (inStoreFlag === true) {
	// 	var checkinId = await MemberCheckIns.checkin(newId, req.body.firstName, req.body.lastName, req.body.email, 'Y', req.body.inStoreInfo.storeId, 'Y', req.body.inStoreInfo.guestCount);
	// 	if ((req.body.inStoreInfo.guestCount > 0) && (req.body.inStoreInfo.guestBreakdown != undefined) && (req.body.inStoreInfo.guestBreakdown.length > 0)) {
	// 		// console.log('Length: ' + req.body.inStoreInfo.guestBreakdown.length);
	// 		for (var i = 0; i < req.body.inStoreInfo.guestBreakdown.length; i++) {
	// 			await MemberCheckIns.recordBreakdown(checkinId, req.body.inStoreInfo.guestBreakdown[i].guestOptionId, req.body.inStoreInfo.guestBreakdown[i].guestCount);
	// 		}
	// 	}
	// }


	return newId;
}


//
//	Capture feedback and email to support.
//
var captureFeedback = (req, resp) => {
	return new Promise((resolve, reject) => {
		var member = null;

		Members.getById(req.params.id, true)
			.then((rows) => {

				if (rows.length === 0) {
					resp = formatResp(resp, undefined, 404, memberText.get("MEMBER_404"));
				} else {
					member = rows[0];

					sendEmail(process.env.FEEDBACK_EMAIL, 'Member Feedback', "(" + member.id + ") " + member.firstName + " " + member.lastName + " " + member.email + ",\n\n" + req.body.feedback, "(" + member.id + ") " + member.firstName + " " + member.lastName + " " + member.email + ",<br><br>" + req.body.feedback, process.env.EMAIL_USER);
				}

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	Capture feedback and email to support.
//
var captureFeedbackUnknown = (req, resp) => {
	return new Promise((resolve, reject) => {
		var member = null;
		var subject = 'New Member Feedback';

		if (req.body.subject != undefined) {
			subject = req.body.subject;
		}

		sendEmail(process.env.FEEDBACK_EMAIL, subject, "(" + req.body.email + "),\n\n" + req.body.feedback, "(" + req.body.email + "),<br><br>" + req.body.feedback, process.env.EMAIL_USER);

		resolve(resp);
	});
}



//
//	Change email.
//
var changeEmail = async (internalFlag, req, resp) => {
	var cityInfo = null;
	var mailchimpUpdateInfo = null;
	var member = null;
	var prom = [];
	var shopifyUpdateInfo = null;


	//
	//	Validate supplied fields
	//
	var validationErrors = await validateMember(req, false);
	if (validationErrors.errorDetails.length > 0) {
		resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
		return resp;
	} else {
		var rows = await Members.getById(req.params.id);
		if (rows.length === 0) {
			resp = formatResp(resp, undefined, 404, memberText.get("MEMBER_404"));
			return resp;
		} else {
			member = rows[0];

			cityInfo = shopifyUtils.getCityInfoByShopId(member.homeShopifyStoreId);

			//	Check to see if shopify and/or mailchimp update is necessary.  
			mailchimpUpdateInfo = await mailchimpUtils.prepareMailchimpUpdateBody(member, req.body);
			shopifyUpdateInfo = await shopifyUtils.prepareShopifyUpdateBody(member, req.body);

			//
			//	Make sure new email isn't already in use.
			//
			rows = await Members.getByEmail(req.body.email);
			if ((rows.length > 0) && (member.email != req.body.email)) {
				resp = formatResp(resp, undefined, 400, memberText.get("EMAIL_COLL"));
				return resp;
			} else {
				if (member.email != req.body.email) {
					resp.message = memberText.get("UPDATE_SUCCESS");
					prom.push(Members.updateById(req.params.id, internalFlag, {
						email: req.body.email,
						emailMarketingStatus: 'SUBSCRIBED'
					}, member));

					//
					//	Attempt to update in Shopify and Mailchimp.
					//
					if (mailchimpUpdateInfo.isUpdatedFlag === true) {
						prom.push(mailchimpUtils.updateListMember(cityInfo.emailListName, member.email, mailchimpUpdateInfo));
					}
					// prom.push(shopifyUtils.updateMemberEmail(cityinfo, member.id, member.shopifyCustomerId, member.email, req.body.email));
					if (shopifyUpdateInfo.isUpdatedFlag === true) {
						prom.push(shopifyUtils.updateMemberInfo(0, member.id, shopifyUpdateInfo));
					}

					var results = await Promise.all(prom);
					var mailchimpUpdated = true;
					var membersUpdated = true;
					var shopifyUpdated = true;

					if ((results[0] === undefined) || (results[0].updateFlag != true)) {
						membersUpdated = false;
					}

					if ((mailchimpUpdateInfo.isUpdatedFlag === true) && (results[1] === undefined)) {
						mailchimpUpdated = false;
					}

					if ((shopifyUpdateInfo.isUpdatedFlag === true) && (member.status != 'OUTSIDE_GEOGRAPHIC') && ((results[2] === undefined) || (results[2].length === 0))) {
						shopifyUpdated = false;
					}

					//	If the member was updated
					if ((mailchimpUpdateInfo.isUpdatedFlag && !mailchimpUpdated) || (shopifyUpdateInfo.isUpdatedFlag && !shopifyUpdated)) {
						prom.push(logUtils.log({
							severity: 'WARNING',
							type: 'MEMBERUPDATE',
							message: req.params.id + " - check that member is in sync. Mailchimp: " + mailchimpUpdated + " shopifyUpdated: " + shopifyUpdated + ".",
							stackTrace: new Error().stack
						}))
					}

					await sendNotificationEmail({
						oldEmail: member.email,
						newEmail: req.body.email,
						firstName: member.firstName,
						homeCityId: member.homeCityId
					});

					return resp;
				} else {
					resp = formatResp(resp, undefined, 400, memberText.get("EMAIL_COLL"));
					return resp;
				}
			}
		}
	}
}



//
//	Change Password
//
var changePassword = async (req, resp) => {
	var member = null;
	var whereInfo = {
		clause: "",
		values: []
	};

	whereInfo = sqlUtils.appendWhere(whereInfo, "verification_id = ?", req.body.verificationId);

	var result = await Members.getAll(whereInfo, "last_name", 0, 1);
	if (result.rows.length === 0) {
		resp = formatResp(resp, undefined, 404, memberText.get("CHANGE_PSWD_ID_NOT_FOUND"));
		return resp;
	} else {
		member = result.rows[0];

		result = await Members.updateById(member.id, false, {
			password: req.body.password,
			emailVerificationFlag: true,
			verificationId: null
		}, member);

		await Members.recordVerificationId(member, req.body.verificationId);

		//												
		//	If the member is in PARTIAL status, they were imported from Shopify and may not have all information normally required.
		// 	Revalidate the member and update status / internal notes if needed.
		//
		if (member.status === 'PARTIAL') {
			await memberUtils.revalidatePartial(member.id);
			// result = await Members.getById(member.id);
			// member = result[0];

			// resp = findMissingFromNotes(member, resp);
		}

		//
		//	We've just updated the password successfully and now we're going to "login" the member.
		//
		if (resp.data === undefined) {
			resp.data = {};
		}
		resp.data.accessToken = jwtUtils.signToken({
			memberId: member.id
		});

		req.tempId = member.id;
		await MemberLogins.recordLogin(req, resp);

		return resp;
	}
}



//
//	Check in member.
//
var checkIn = (req, resp) => {
	return new Promise((resolve, reject) => {
		var cityInfo = null;
		var member = null;
		var prom = [];
		var store = null;

		prom.push(Members.getById(req.body.memberId, true));
		prom.push(Stores.getById(req.body.physicalStoreId));

		Promise.all(prom)
			.then((rows) => {
				if (rows[0].length === 0) {
					resp = formatResp(resp, undefined, 404, memberText.get("MEMBER_404"));
					resolve(resp);
				} else if (rows[1].length === 0) {
					resp = formatResp(resp, undefined, 404, memberText.get("STORE_NOT_FOUND"));
					resolve(resp);
				} else {
					member = rows[0][0];
					store = rows[1][0];

					cityInfo = shopifyUtils.getCityInfoByCity(store.address.city);

					Members.getLinkedShopifyStoreByPhysStore(req.body.memberId, req.body.physicalStoreId)
						.then((results) => {
							prom = [];
							//
							//	If member not linked to the store, add and link
							//
							if (results.length === 0) {

								//	Add the member to the shopify store.
								prom.push(shopifyUtils.addMemberFromMember(cityInfo, member));
							}

							return Promise.all(prom);
						})
						.then((results) => {
							// console.log(JSON.stringify(results, undefined, 2));
							prom = [];
							if ((results != undefined) && (results.length > 0)) {
								// console.log("linking " + member.id + " " + cityInfo.shopName + " " + results[2].id);
								//	Link the member to the shopify store.
								prom.push(Members.linkMemberToShopifyStore(member.id, cityInfo.shopName, results[2].id));
							} else {
								// console.log("not linking");
							}
							return Promise.all(prom);
						})
						.then((results) => {


							// 	// prom.push(MemberCheckIns.checkin(member.firstName, member.lastName, member.email, 'Y', req.body.physicalStoreId, 'N', 0));

							resolve(resp);

						})
						.catch((e) => {
							reject(e);
						})

				}

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//	Store tidbit.
//
var createTidbit = (req, resp) => {
	return new Promise((resolve, reject) => {

		Members.getById(req.params.id)
			.then((result) => {
				if (result.length === 0) {
					resp = formatResp(resp, undefined, 404, "Member not found.")
					resolve(resp);
				} else {
					// 
					//	Validate tidbitType
					//
					TidbitTypes.getByName(req.body.tidbitType)
						.then((rows) => {
							if (rows.length === 0) {
								resp = formatResp(resp, undefined, 404, "Tidbit type not found.");
								resolve(resp);
							} else {
								MemberTidbits.create(req.params.id, rows[0].id, req.body.value, req.body.tidbitQuestionId, req.body.needsReviewFlag)
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


var findMissing = async (member, resp) => {

	var validationErrors = await revalidatePartial(member.id);
	if (resp.data === undefined) {
		resp.data = {};
	}

	resp.data.firstName = member.firstName;
	resp.data.lastName = member.lastName;
	resp.data.email = member.email;

	if (validationErrors.errorDetails.length > 0) {
		resp.data.missing = [];

		for (var i = 0; i < validationErrors.errorDetails.length; i++) {
			var note = '';
			if (validationErrors.errorDetails[i].error === 'isRequired') {
				note = validationErrors.errorDetails[i].text + ' required.';
			} else if (validationErrors.errorDetails[i].error === 'invalid') {
				var value = '';
				switch (validationErrors.errorDetails[i].field) {
					case "firstName":
						value = member.firstName;
						break;
					case "lastName":
						value = member.lastName;
						break;
					case "zip":
						value = member.zip;
						break;
				}

				note = validationErrors.errorDetails[i].text + ' ' + value + ' is invalid.';
			}

			var o = {
				fieldName: validationErrors.errorDetails[i].field,
				note: note
			}

			resp.data.missing.push(o);
		}
	}

	return resp;
}

//
//	Generate RM Com URL
//
var generateRMComUrl = (req, resp) => {
	return new Promise((resolve, reject) => {
		var member = null;
		var url = '';
		Members.getById(req.params.id, true)
			.then((rows) => {

				if (rows.length === 0) {
					resp = formatResp(resp, ["data"], 404, memberText.get("MEMBER_404"));
					resolve(resp);
				} else if (rows[0].homeShopifyStoreId === 0) {
					resp = formatResp(resp, ["data"], 403, "Members outside market can't be redirected to store.");
					resolve(resp);
				} else {
					member = rows[0];

					let accessToken = jwtUtils.signToken({
						memberId: member.id
					});
					resp.data.accessToken = accessToken;
					req.tempId = member.id;
					MemberLogins.recordLogin(req, resp);

					let buf = Buffer.from(accessToken);
					let encodedData = buf.toString('base64');
					
					//get the shop with url
					MasterData.getMasterDataByType("memberShopWithUrl")
						.then((rows) => {
						 	if (rows.length === 0) {
						 		resp = formatResp(resp, ["data"], 404, "Shop with URL not found.")
						 	} else {
								// Generate the RM Com URL
								 url = rows[0].value.replace('{accessToken}', encodedData);
								 resp.data.url = url;
								resolve(resp);
						 	}
						})
						.catch((e) => {
						 	reject(e);
						})
				}
			})
			.catch((e) => {
				reject(e);
			});
	});
}

//
//	Generate Multipassify URL
//
var generateMultipassifyUrl = async (req, resp) => {
	try {
		var member = null;

		var rows = await Members.getById(req.params.id, true);

		if (rows.length === 0) {
			resp = formatResp(resp, ["data"], 404, memberText.get("MEMBER_404"));
			return resp;
		} else if (rows[0].homeShopifyStoreId === 0) {
			resp = formatResp(resp, ["data"], 403, "Members outside market can't be redirected to store.");
			return resp;
		} else {
			member = rows[0];

			var cityInfo = shopifyUtils.getCityInfoByCityId(member.homeCityId);
			var multipassify = null;
			multipassify = new Multipassify(cityInfo.keyInfo.multipassSecret);

			// Create shopify customer data hash
			var customerData = {
				email: member.email,
				verified_email: true
				// created_at: 
			};

			if ((member.firstName != undefined) && (member.firstName != null) && (member.firstName.trim().length > 0)) {
				customerData.first_name = member.firstName;
			}

			if ((member.lastName != undefined) && (member.lastName != null) && (member.lastName.trim().length > 0)) {
				customerData.last_name = member.lastName;
			}

			var tags = await shopifyUtils.buildTags(member, cityInfo.citySlug);
			if (tags.length > 0) {
				customerData.tag_string = tags;
			}

			if (member.storeInfo.referToUrl != null) {
				customerData.return_to = member.storeInfo.referToUrl;
			}

			if ((req.body.redirectUrl != undefined) && (req.body.redirectUrl != null) && (req.body.redirectUrl.trim().length > 0)) {
				customerData.return_to = req.body.redirectUrl;
			}


			// Encode a Multipass token
			var token = multipassify.encode(customerData);

			// Generate a Shopify multipass URL to your shop
			var url = multipassify.generateUrl(customerData, member.storeInfo.shopName);


			url = url.replace(cityInfo.shopName, cityInfo.shopDomain);

			resp.data.url = url;
			resp.data.token = token;

			return resp;
		}
	}
	catch(e) {
		rethrow(e);
	};
}



var generatePasswordURL = async (req, resp) => {
	var member = null;
	var verificationId = uuidv1();

	var rows = await Members.getById(req.params.id, true);
	if (rows.length === 0) {
		resp = formatResp(resp, ["data"], 404, memberText.get("MEMBER_404"));
		return resp;
	} else {
		member = rows[0];

		await Members.updateVerificationIdById(member.id, verificationId);

		resp.data.url = process.env.EMAIL_TEMPS_PSWDRESETURL + verificationId;
		try {
			var result = await bitly.shorten(resp.data.url);
			resp.data.url = result.link;
		} catch (e) {
			throw e;
		}

		return resp;

	}
}



//
//	Member Get All
//
var getAll = (where, sortBy, offset, limit, resp, includeShopifyInfo) => {
	return new Promise((resolve, reject) => {

		Members.getAll(where, sortBy, offset, limit, includeShopifyInfo)
			.then((result) => {
				resp.metaData.totalCount = result.totalCount;
				if (result.rows.length === 0) {
					formatResp(resp, undefined, 404, "No members found.")
				} else {
					resp.data.members = result.rows;
				}

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//	Member Get By Id
//
var getById = async (req, resp) => {

	var includeShopifyInfo = false;


	if (((req.query.includeShopifyInfo !== undefined) && (req.query.includeShopifyInfo === "true")) ||
		((req.query.includeStoreInfo !== undefined) && (req.query.includeStoreInfo === "true"))) {
		includeShopifyInfo = true;
	}


	//	If this is an alias, look up the member ID.
	if (req.params.id.length === 8) {
		req.params.id = await Members.getByAlias(req.params.id);
	}

	var rows = await Members.getById(req.params.id, includeShopifyInfo);
	if (rows.length === 0) {
		resp = formatResp(resp, undefined, 404, memberText.get("MEMBER_404"));
		return resp;
	} else {

		//	If zip doesn't match up to a zip in the table, mark member as secondary.
		if (rows[0].memberType === null) {
			rows[0].memberType = 'SECONDARY';
		} 
		

		//	If member is SECONDARY, override some information with the non-city-specific versions.
		if (rows[0].memberType === 'SECONDARY') {
			var nationalInfo = await TargetedCities.getTargetCityById(0);
			if (nationalInfo.length > 0) {
				if (rows[0].storeInfo !== undefined) {
					rows[0].storeInfo.logoUrl = nationalInfo[0].logoUrl;
					rows[0].storeInfo.targetedCity.logoUrl = nationalInfo[0].logoUrl;
				}

				if (rows[0].storeInfo !== undefined) {
					rows[0].storeInfo.facebookUrl = nationalInfo[0].facebookUrl;
					rows[0].storeInfo.targetedCity.facebookUrl = nationalInfo[0].facebookUrl;
				}

				if (rows[0].storeInfo !== undefined) {
					rows[0].storeInfo.facebookPixelId = nationalInfo[0].facebookPixelId;
					rows[0].storeInfo.targetedCity.facebookPixelId = nationalInfo[0].facebookPixelId;
				}

				if (rows[0].storeInfo !== undefined) {
					rows[0].storeInfo.instagramUrl = nationalInfo[0].instagramUrl;
					rows[0].storeInfo.targetedCity.instagramUrl = nationalInfo[0].instagramUrl;
				}

				if (rows[0].storeInfo !== undefined) {
					rows[0].storeInfo.contactEmail = nationalInfo[0].contactEmail;
					rows[0].storeInfo.targetedCity.contactEmail = nationalInfo[0].contactEmail;
				}

				if (rows[0].storeInfo !== undefined) {
					rows[0].storeInfo.deliveryEmail = nationalInfo[0].deliveryEmail;
					rows[0].storeInfo.targetedCity.deliveryEmail = nationalInfo[0].deliveryEmail;
				}

				if (rows[0].storeInfo !== undefined) {
					rows[0].storeInfo.careersEmail = nationalInfo[0].careersEmail;
					rows[0].storeInfo.targetedCity.careersEmail = nationalInfo[0].careersEmail;
				}
			}
		}	
		
		

		resp.data = rows[0];
		var missingResp = await findMissing(resp.data, {});

		if ((missingResp != undefined) && (missingResp.data != undefined) && (missingResp.data.missing != undefined)) {
			resp.data.missing = missingResp.data.missing;
		}


		//
		//	If this is an external API request, remove password.
		//
		if (req.get('x-app-type') === 'EXT') {
			delete resp.data.password;
			delete resp.data.dateCreated;
			delete resp.data.dateModified;
			delete resp.data.verificationId;
			delete resp.data.facebookId;
			delete resp.data.emailVerificationFlag;
			delete resp.data.shopifyCustomerId;
			delete resp.data.emailMarketingStatus;
			delete resp.data.newEmail;
			// delete resp.data.id;
		}
		return resp;
	}
}


var getByVerificationId = async (req, resp) => {
	var member = null;

	var result = await Members.getByVerificationId(req.query.verificationId);
	if (result.length === 0) {
		var history = await Members.checkVerificationIdHistory(req.query.verificationId);
		if (history.length === 0) {
			if (req.query.verificationId !== '*|VID|*') {
				sendEmail('matt@rushmarket.com', '(' + process.env.NODE_ENV + ') Invalid verification ID in getByVerificationId: ', req.query.verificationId, req.query.verificationId);
			}

			resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "verificationId"));
			return resp;
		} else {
			req.params.id = history[0].id;

			var result = await Members.getById(history[0].id);
			member = result[0];
		}
	} else {
		member = result[0];
	}

	if (member != null) {
		resp = await findMissing(member, resp);
	}

	return resp;
}


//
//	Member Check Ins    NOTE: commented out - not in use 4/8/2019.
//
// var getCheckIns = (req, resp, offset, limit) => {
// 	return new Promise((resolve, reject) => {

// 		Members.get(req.params.idwhere, sortBy, offset, limit)
// 			.then((result) => {
// 				resp.metaData.totalCount = result.totalCount;
// 				if (result.rows.length === 0) {
// 					formatResp(resp, undefined, 404, "No members found.")
// 				} else {
// 					resp.data.members = result.rows;
// 				}

// 				resolve(resp);
// 			})
// 			.catch((e) => {
// 				reject(e);
// 			});
// 	});
// }




//
//	Get find by id
//
var getMemberFindById = async (id, findId, resp) => {
	resp.data.finds = await Members.getMemberFindById(id, findId);
	if (resp.data.finds.length === 0) {
		resp.statusCode = 404;
		resp.message = "Member find not found.";
		delete resp.data;
	}

	return resp;
}



//
//	Get all finds
//
var getMemberFinds = async (id, store, label, coinId, sortBy, resp) => {
	resp.data.finds = await Members.getMemberFinds(id, store, label, coinId, sortBy);

	return resp;
}

//
//	Get recent views
//
var getMemberRecentViews = async (id, store, limit, offset, resp) => {
	var result = await Members.getMemberRecentViews(id, store, limit, offset);

    if (result.totalCount > 0) {
		resp.metaData.totalCount = result.totalCount;
		resp.data.recentlyViewed = result.rows;
	} else {
        formatResp(resp, undefined, 404, 'No recent views for member found.');
    } 

    return resp;
}

//
// Create a member recent view
//
var createRecentView = async (memberId, store, coinId, resp) => {
	var result = await Members.createRecentViewByMember(memberId, store, coinId);

	if (result.id === undefined) {
		resp.statusCode = 200;
		resp.message = memberText.get("UPDATE_SUCCESS");
	} else {
		resp.id = result.id;
	}

	return resp;
}

//
//	Create a member message.
//
var createMemberMessage = async (fromMemberId, toMemberId, message, resp) => {
	var prom = [];

	prom.push(Members.getById(fromMemberId));
	prom.push(Members.getById(toMemberId));

	var members = await Promise.all(prom);

	if ((members[0].length === 0) || (members[1].length === 0)) {
		resp.statusCode = 404;
		resp.message = "Member not found.";
		return resp;
	}

	await Messages.createMessage(fromMemberId, toMemberId, message);

	return resp;
};



//
//	Create a message reply.
//
var createMemberMessageReply = async (fromMemberId, origMessageId, message, resp) => {

	var member = await Members.getById(fromMemberId);

	if (member.length === 0) {
		resp.statusCode = 404;
		resp.message = "Member not found.";
		return resp;
	}

	var messages = await Messages.getById(fromMemberId, origMessageId);
	if (messages.length !== 1) {
		resp.statusCode = 404;
		resp.message = "Message not found.";
		return resp;
	}

	//	If the message sent from the 0 user or not of MESSAGE type can't reply.
	if ((messages[0].fromMemberId === "0") || (messages[0].deliveryType !== 'MESSAGE')) {
		resp.statusCode = 409;
		resp.message = "Can't reply to this message."
		return resp;
	}

	await Messages.createMessage(fromMemberId, messages[0].fromMemberId, message);

	return resp;
};



//
//	Get message by id
//
var getMemberMessageById = async (id, messageId, resp) => {
	var messages = await Messages.getById(id, messageId);

	if (messages.length !== 1) {
		resp.statusCode = 404;
		resp.message = "Message not found.";
	} else {
		resp.data = messages[0];
	}

	return resp;
}



//
//	Delete message by id
//
var deleteMemberMessageById = async (id, messageId, resp) => {
	var result = await Messages.deleteById(id, messageId);

	if (result.affectedRows !== 1) {
		resp.statusCode = 404;
		resp.message = "Message not found.";
	}

	return resp;
}



//
//	Update message by id
//
var updateMemberMessageById = async (id, messageId, body, resp) => {
	var status = body.status;

	if (status !== undefined) {
		var result = await Messages.updateStatusById(id, messageId, status);

		if (result.affectedRows !== 1) {
			resp.statusCode = 404;
			resp.message = "Message not found.";
		}
	} else {
		resp = formatResp(resp, undefined, 400, memberText.get("MISSING_REQUIRED").replace('%required%', "status"));
	}

	return resp;
}




//
//	Get messages
//
var getMemberMessages = async (id, offset, limit, resp) => {
	resp.data.messages = await Messages.getByMemberId(id, offset, limit);

	return resp;
}




//
//	Member Get All Orders
//
var getOrders = async (req, resp, offset, limit) => {
	var prom = [];

	var result = await Members.getById(req.params.id);
	if (result.length === 0) {
		resp = formatResp(resp, undefined, 404, "Member not found.")
		return resp;
	} else {
		result = await MemberOrders.getOrdersByEmail(result[0].email, offset, limit);
		resp.metaData.totalCount = result.totalCount;
		resp.data.orders = result.rows;

		for (var i = 0; i < result.rows.length; i++) {
			resp.data.orders[i].shopifyOrderId = resp.data.orders[i].sourceOrderId;
			prom.push(MemberOrders.getLineItemsByOrder(result.rows[i].orderId));
		}

		result = await Promise.all(prom);

		for (var i = 0; i < resp.data.orders.length; i++) {
			var items = result[i].rows;
			for (var j = 0; j < items.length; j++) {
				resp.data.orders[i].lineItems.push(items[j])
			}
		}

		return resp;
	}
}



//
//	Member Get Tidbits
//
var getTidbits = (req, resp, offset, limit) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		Members.getById(req.params.id)
			.then((result) => {
				if (result.length === 0) {
					resp = formatResp(resp, undefined, 404, "Member not found.");
					resolve(resp);
				} else {
					MemberTidbits.getAll(req.params.id, offset, limit)
						.then((result) => {
							resp.metaData.totalCount = result.totalCount;
							resp.data.tidbits = result.rows;

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
//	Member Get Tidbit by Id
//
var getTidbitById = (req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		Members.getById(req.params.id)
			.then((result) => {
				if (result.length === 0) {
					resp = formatResp(resp, undefined, 404, "Member not found.");
					resolve(resp);
				} else {
					MemberTidbits.getById(req.params.id, req.params.tid)
						.then((result) => {
							resp.data.tidbits = result.rows;

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
//	Marketing Attribution
//
var marketingAttribution = async (req, resp) => {

	try {

		var result = await Members.logMarketingAttribution(req.params.id, req.body.marketingMedium, req.body.marketingSource, req.body.marketingCampaign,
																											req.body.marketingTerm, req.body.marketingContent);

		resp.id = result;

		return resp;
	} catch (e) {
		throw new Error(e);
	};
}



//
//	Get Marketing Attribution
//
var getMarketingAttribution = async (req, offset, limit, resp) => {

	try {

		var result = await Members.getMarketingAttribution(req.params.id, offset, limit);

		resp.metaData.totalCount = result.totalCount;
		resp.data.marketingAttributions = result.rows;

		return resp;
	} catch (e) {
		throw new Error(e);
	};
}



//
//	Notify Members of Changes to Items in their Finds Lists
//
var notify = async (req, resp) => {

	//	Notify members of specific events (price drops, rush factor changes, new fresh finds, product purchase, etc) based on their personal settings for
	//	how they prefer to be notified.

	//	Find all members with the item on a finds list and get their notification settings.
	var membersToNotify = await Members.getMembersToNotify(req.query.productId);

	//	Are we sending out customized messaging for each type of event?  
	//	



	return resp;
}



//
//	Member Delete
//
var remove = (req, resp) => {
	return new Promise((resolve, reject) => {

		Members.delById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, undefined, 404, "Member not found.");
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	Delete Member Finds
//
var removeFinds = async (id, label, resp) => {
	var result = await Members.delFinds(id, label);

	return result;
}



//
//	Delete Specific Member Find
//
var removeFindById = async (id, store, findId, resp) => {
	var result = await Members.delFindById(id, findId);
	var count = await Members.getMemberFinds(id, store);

	resp.findsCount = count.length;

	return result;
}


//
//	Update Specific Member Find
//
var updateFindById = async (id, findId, label, sortOrder, resp) => {
	var result = await Members.updateFindById(id, findId, label, sortOrder);

	return result;
}




//
//	Member Delete Tidbit
//
var removeTidbit = (req, resp) => {
	return new Promise((resolve, reject) => {

		Members.getById(req.params.id)
			.then((result) => {
				if (result.length === 0) {
					resp = formatResp(resp, undefined, 404, "Member not found.");
					resolve(resp);
				} else {
					MemberTidbits.deleteById(req.params.id, req.params.tid)
						.then((rows) => {
							if ((rows === undefined) || (rows.affectedRows === 0)) {
								resp = formatResp(resp, undefined, 404, "Tidbit not found.");
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
//	Store Find.	
//
var storeFind = async (store, memberId, label, coinId, sortOrder, resp) => {
	var coin = null;

	//	Validate COIN before storing.
	var coinResult = await Coins.getById(coinId);
	if (coinResult.coin.length !== 0) {
		coin = coinId;
	}
	//	If COIN not found, try to lookup by vendor ID/SKU.
	else if (coinId.length > 25) {
		var vendorId = coinId.substring(0, 24);
		var vendorSku = coinId.substring(25).toUpperCase().replace(/-/g, '.');
		var product = await Vendors.getProductByVendorSku(vendorId, vendorSku);

		if (product.length > 0) {
			coin = coinId;
		}
	}


	//	Originally this was going to return a 404 if the COIN couldn't be found.   Instead we're going to assume it's a
	//	quick sale item where the rush sku is used as the handle instead of the COIN.  We'll just use that rush sku as a proxy
	//	for the COIN on the peg board.
	if (coin === null) {
		// resp.statusCode = 404;
		// resp.message = "Product COIN could not be found."
		// return resp;
		coin = coinId;
	}

	var result = await Members.storeFindByMember(store, memberId, label, coin, sortOrder);


	if (result.id === undefined) {
		resp.statusCode = 409;
		resp.message = "Product already associated with this list.";
	} else {
		resp.id = result.id;
		resp.findsCount = result.findsCount;
	}

	return resp;
}



//
//	Member Delete Tidbit
//
var updateTidbit = (req, resp) => {
	return new Promise((resolve, reject) => {

		Members.getById(req.params.id)
			.then((result) => {
				if (result.length === 0) {
					resp = formatResp(resp, undefined, 404, "Member not found.");
					resolve(resp);
				} else {
					MemberTidbits.updateById(req.params.tid, req.body)
						.then((rows) => {
							if ((rows === undefined) || (rows.affectedRows === 0)) {
								resp = formatResp(resp, undefined, 404, "Tidbit not found.");
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
//	Set Home City - Logic involved with setting a memeber's home city.
//
var setHomeCity = async (req, resp) => {
	var cityInfo = null;
	var member = null;
	var oldCityInfo = null;
	var oldEmailListName = undefined;
	var prom = [];
	var results = null;


	//
	//	If sourceShop has been provided, this is a signup coming from a shopify customer create.
	//
	cityInfo = shopifyUtils.getCityInfoByCityId(req.body.cityId);
	// if (cityInfo === null) {
	// 	return formatResp(resp, undefined, 404, "Unknown city ID.");
	// }

	var rows = await Members.getById(req.params.id, true);
	if (rows.length === 0) {
		resp = formatResp(resp, undefined, 404, memberText.get("MEMBER_404"));
		return resp;
	} else {
		member = rows[0];
		var r = {
			body: member
		}

		var validationErrors = await validateMember(r, true, true);
		if (validationErrors.errorDetails.length > 0) {
			resp = formatResp(resp, undefined, 400, "Member must complete signup to be slotted in a market.");
			return resp;
		} else {

			if (member.homeShopifyStoreId > 0) {
				oldCityInfo = shopifyUtils.getCityInfoByCityId(member.homeCityId);
				oldEmailListName = oldCityInfo.emailListName;
			}

			var stores = await Members.getLinkedShopifyStores(member.id, 0);

			// Set home market to outside
			if ((slottingAlgo === 'OUT_OF_MARKET') && (req.body.cityId === 0)) {

				//	Update member's home shopify store id.
				prom.push(Members.updateById(member.id, true, {
					homeShopifyStoreId: 0,
					homeCityId: 0,
					status: 'OUTSIDE_GEOGRAPHIC'
				}, member));

				if (req.body.cityId !== member.homeCityId) {
					prom.push(mailchimpUtils.addListMemberFromMember(oldEmailListName, process.env.MAILCHIMP_OUTLIER_LIST, member));

					//	If this member already associated with a city, unsubscribe them from that city's mailing list.
					if (member.homeShopifyStoreId > 0) {
						prom.push(mailchimpUtils.removeListMember(oldEmailListName, member.email))
					}

					results = await Promise.all(prom);
				}

			} else if (cityInfo.cityId !== member.homeCityId) {

				var updateBody = {
					homeCityId: cityInfo.cityId,
					homeShopifyStoreId: cityInfo.id,
					status: 'ACTIVE'
				}

				member.citySlug = cityInfo.citySlug;

				//	Update member's home shopify store id.
				await Members.updateById(member.id, true, updateBody, member);

				//	Update the homeCityId on the member object so it can be used below
				member.homeCityId = updateBody.homeCityId;

				var mailchimpUpdateInfo = await mailchimpUtils.prepareMailchimpUpdateBody(member, updateBody);
				mailchimpUpdateInfo.updateBody.homeCityId = updateBody.homeCityId;

				if ((oldEmailListName !== 'Rush Market') || (cityInfo.emailListName !== 'Rush Market')) {
					prom.push(mailchimpUtils.addListMemberFromMember(oldEmailListName, cityInfo.emailListName, member));
				}
				else if (mailchimpUpdateInfo.isUpdatedFlag === true) {
					mailchimpUtils.updateListMember(oldEmailListName, member.email, mailchimpUpdateInfo);
				}

				//	2/5/21	Want to update tagging so even if the home shopify store is the same as member's city, update it.
				//	Only one shopify store for now so I'm not sending in the "source" id.  Sending in 0.
				//
				// if (member.homeShopifyStoreId !== cityInfo.id) {
					var shopifyUpdateInfo = await shopifyUtils.prepareShopifyUpdateBody(member, updateBody);
					var found = false;
					for (var i = 0; i < stores.length; i++) {
						shopifyUtils.updateMemberInfo(0, member.id, shopifyUpdateInfo)
						if (stores[i].shopifyStoreId === cityInfo.id) {
							found = true;
						}
					}
				// }


				//	Only if this member is associated with the OUTLIERS list or is an old style city-specific list will we remove it from the old list.
				if (member.homeCityId > 0) {
					if (oldEmailListName !== 'Rush Market') {
						prom.push(mailchimpUtils.removeListMember(oldEmailListName, member.email));
					}
				} else if (slottingAlgo === 'OUT_OF_MARKET') {
					prom.push(mailchimpUtils.removeListMember(process.env.MAILCHIMP_OUTLIER_LIST, member.email))
				}

				if (!found) {
					prom.push(shopifyUtils.addMemberFromMember(cityInfo, member));
				}

				results = await Promise.all(prom);
			
			}

			//	Not switching cities, so just update tags.
			else if (cityInfo.cityId === member.homeCityId) {
				var updateBody = {
					homeCityId: cityInfo.cityId,
					homeShopifyStoreId: cityInfo.id,
					status: 'ACTIVE'
				}

				var shopifyUpdateInfo = await shopifyUtils.prepareShopifyUpdateBody(member, updateBody);
				var found = false;
				for (var i = 0; i < stores.length; i++) {
					shopifyUtils.updateMemberInfo(0, member.id, shopifyUpdateInfo)
					if (stores[i].shopifyStoreId === cityInfo.id) {
						found = true;
					}
				}

				var mailchimpUpdateInfo = await mailchimpUtils.prepareMailchimpUpdateBody(member, updateBody);
				if (mailchimpUpdateInfo.isUpdatedFlag === true) {
					mailchimpUtils.updateListMember(oldEmailListName, member.email, mailchimpUpdateInfo);
				}

			}

			//
			//	results[0] = member update
			//	results[1] = mailchimp add list member
			//	results[2] = malchimp list remove
			//	results[3] = shopify add member from member (conditional)
			//

			prom = [];
			if ((results !== undefined) && (results !== null) && (results[3] !== undefined)) {
				prom.push(Members.linkMemberToShopifyStore(member.id, cityInfo.shopName, results[3].id));
			}

			await Promise.all(prom);
			return resp;
		}
	}
}



var setHomeCityByZip = async (req, resp) => {
	var zip = req.body.zip;


	if (!isValidZipcode(zip)) {
		resp = formatResp(resp, undefined, 400, "Zip is invalid.");
	} else {
		var city = await ZipToCity.lookupCity(req.body.zip);
		if (city.length > 0) {
			var cityInfo = shopifyUtils.getCityInfoByCity(city[0].city);
			if ((cityInfo === undefined) || (cityInfo === null)) {
				// console.log("No city info for: " + req.body.zip);
			}
			req.body.cityId = cityInfo.cityId;
			resp = await setHomeCity(req, resp);
		} else {
			req.body.cityId = 0;
			resp.statusCode = 202;
			resp.message = memberText.get("SIGNUP_INSTORE_OUTSIDE_SUCCESS");
			resp = await setHomeCity(req, resp);
		}
	}

	return resp;
}



var setHomeCityByZipByVerificationId = async (req, resp) => {
	var zip = req.body.zip;


	var history = await Members.checkVerificationIdHistory(req.query.verificationId);
	if (history.length === 0) {

		sendEmail('matt@rushmarket.com', 'Setting home city with invalid verification ID ', req.query.verificationId, req.query.verificationId);

		resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "verificationId"));
		return resp;

	} else {
		req.params.id = history[0].id;

		resp = await setHomeCityByZip(req, resp);
	}

	return resp;
}



//
//	Member Signup - this can be called via a POST /members or a result of a shopify webhook notification.
//
var signup = async (req, resp, sourceShop) => {
	var cityInfo = null;


	//	If sourceShop has been provided, this is a signup coming from a shopify customer create.
	if (sourceShop != undefined) {
		cityInfo = shopifyUtils.getCityInfoByShop(sourceShop);
	}

	var validationErrors = await validateMember(req, true);
	if ((validationErrors.errorDetails.length > 0) && (sourceShop === undefined) && (req.body.facebookId == null)) {
		resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
		return resp;
	}

	//	Verify this email hasn't already been used.
	var rows = await Members.getByEmail(req.body.email, true);
	if ((rows.length > 0) && (req.body.email.trim().length > 0)) {
		return await signupExistingMember(req, resp, sourceShop, rows[0]);
	}

	//	We have not seen this email before.
	//	Look for duplicate name with empty email.  These were happenging with members created via POS without an email address.
	var dupe = await checkForEmptyEmailDupeName(req, rows);
	if (dupe) {
		return resp;
	}


	//	Regular new member logic.
	await regularNewMemberLogic(req, resp, sourceShop, validationErrors, cityInfo);

	return resp;
}


var checkForEmptyEmailDupeName = async (req, rows) => {
	var dupe = false;
	rows.forEach((row) => {
		if ((req.body.email.trim().length === 0) && (req.body.firstName === row.firstName) && (req.body.lastName === row.lastName)) {
			dupe = true;
		}
	})

	return dupe;
}



var regularNewMemberLogic = async (req, resp, sourceShop, validationErrors, cityInfo) => {
	var hash = null;
	var newId = null;

	if (req.body.password != undefined) {
		hash = bcrypt.hashSync(req.body.password, SALT_WORK_FACTOR);
	}

	//	Attempt to slot member into a city.
	var cityByZip = await ZipToCity.lookupCity(req.body.zip);
	var verificationId = uuidv1();

	//	If algo = NATIONAL and the zip couldn't be looked up, add member as national.
	if (slottingAlgo === 'NATIONAL') {
		if (!cityByZip || !cityByZip.length === 0) {
			cityInfo = shopifyUtils.getCityInfoByCity('National');
			newId = await addMember(sourceShop, 'National', req, hash, verificationId, validationErrors);
		} else {
			cityInfo = shopifyUtils.getCityInfoByCity(cityByZip[0].city);
			newId = await addMember(sourceShop, cityByZip[0].city, req, hash, verificationId, validationErrors);
		}
	} else if (slottingAlgo === 'OUT_OF_MARKET') {
		if (!cityByZip || !cityByZip.length) {
			if (!req.body.inStoreInfo && !sourceShop) {
				resp = formatResp(resp, undefined, 202, memberText.get("SIGNUP_OUTSIDE_SUCCESS"));
			} else if (sourceShop === undefined) {
				resp = formatResp(resp, undefined, 202, memberText.get("SIGNUP_INSTORE_OUTSIDE_SUCCESS"));
			}
			//	If outside market, don't set verification id
			//	1/4/2020 NOTE: Members created thru POS without a ZIP never get their verification ID set.
			//	This eventually ends up in them getting an email verification email with no verification ID.
			//	As of this note, the original reason for not setting the verification ID has been lost and we
			//	don't think this presents an issue.   Going to set the ID for everyone.
			newId = await addMember(sourceShop, undefined, req, hash, verificationId, validationErrors);
		} else {
			cityInfo = shopifyUtils.getCityInfoByCity(cityByZip[0].city, req.body.rushInsiderFlag);
			req.body.storeInfo = {};
			req.body.storeInfo.logoUrl = cityInfo.logoUrl;
			req.body.homeCityId = cityInfo.cityId;

			newId = await addMember(sourceShop, cityByZip[0].city, req, hash, verificationId, validationErrors);
		}
	}

	// console.log(resp.statusCode + " " + sourceShop);

	//	If normal in-market create, send verification email.
	if ((resp.statusCode === 200) || (resp.statusCode === 201) || (resp.statusCode === 202)) {

		await memberUtils.generateAccessToken(req, resp, newId);

		//	If there's a session ID, attempt to link cart with the member.
		if ((req.decoded !== undefined) && (req.decoded.sessionId !== undefined) && (req.decoded.sessionId !== null)) {
			await ProductHolds.linkCart(req.decoded.sessionId, newId);
		}		
		

		req.body.verificationId = verificationId;
		resp.storeInfo = await Members.populateStoreInfo(newId);

		// if (cityInfo != undefined) {
		// 	resp.storeInfo = JSON.parse(JSON.stringify(cityInfo));
		// 	// resp.storeInfo.shopify = {};
		// 	// resp.storeInfo.shopify.id = resp.storeInfo.id;

		// 	// resp.storeInfo.store = {};
		// 	// resp.storeInfo.targetedCity = {};
		// 	delete resp.storeInfo.shopify;
		// 	delete resp.storeInfo.keyInfo;
		// 	req.body.storeInfo = cityInfo;
		// }
		if ((resp.statusCode === 200) || (resp.statusCode === 201)) {
			// sendVerificationEmail(req.body);
		}

		delete resp.storeInfo.id;
		delete resp.storeInfo.referToUrl;
		delete resp.storeInfo.shopName;
		delete resp.storeInfo.shopDomain;
		delete resp.storeInfo.tidioUrl;
		delete resp.storeInfo.active;
		delete resp.storeInfo.address;
		delete resp.storeInfo.city;
		delete resp.storeInfo.description;
		delete resp.storeInfo.storeId;
		delete resp.storeInfo.lat;
		delete resp.storeInfo.lng;
		delete resp.storeInfo.onlineAvailable;
		delete resp.storeInfo.state;
		delete resp.storeInfo.storeName;
		delete resp.storeInfo.type;
		delete resp.storeInfo.zip;
		delete resp.storeInfo.homeCity;
		delete resp.storeInfo.homeCityId;
		delete resp.storeInfo.careersEmail;
		delete resp.storeInfo.contactEmail;
		delete resp.storeInfo.deliveryEmail;
		delete resp.storeInfo.facebookUrl;
		delete resp.storeInfo.instagramUrl;
		delete resp.storeInfo.logoUrl;

	}
}



//	Member with that email exists.  If not a signup from shopify, reject.
var signupExistingMember = async (req, resp, sourceShop, member) => {

	// Shopify POS signup check
	if (sourceShop === undefined) {
		if (member.emailVerificationFlag === false) {
			// sendVerificationEmail(member);
			resp = formatResp(resp, undefined, 401, memberText.get("SIGNUP_EXISTS_VALIDATE"));
		} else {
			resp = formatResp(resp, undefined, 401, memberText.get("SIGNUP_EXISTS"));
		}

		return resp;

		//	There's a member with this email and not a POS signup, so just add the store if it isn't already there.
	} else {
		await Members.linkMemberToShopifyStore(member.id, sourceShop, req.body.id);
		return resp;
	}
}



var tagMember = async (member) => {
	//	Update (tag) the member in shopify.
	var shopifyUpdateInfo = await shopifyUtils.prepareShopifyUpdateBody(member, member);
	var shopifyResult = await shopifyUtils.updateMemberInfo(0, member.id, shopifyUpdateInfo);

	if ((member.email !== null) && (member.email.trim().length > 0)) {
		var cityInfo = shopifyUtils.getCityInfoByCityId(member.homeCityId);
		if (cityInfo !== null) {
			var mailchimpUpdateInfo = await mailchimpUtils.prepareMailchimpUpdateBody(member, member);
			var mailchimpResult = await mailchimpUtils.updateListMember(cityInfo.emailListName, member.email, mailchimpUpdateInfo);
		}
	}
}


var updateByVerificationId = async (internalFlag, req, resp) => {

	var history = await Members.checkVerificationIdHistory(req.query.verificationId);
	if (history.length === 0) {

		if (req.query.verificationId !== '*|VID|*') {
			sendEmail('matt@rushmarket.com', '(' + process.env.NODE_ENV + ') Invalid verification ID in updateByVerificationId: ', req.query.verificationId, req.query.verificationId);
		}

		resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "verificationId"));
		return resp;

	} else {
		req.params.id = history[0].id;

		resp = await update(internalFlag, req, resp);

		var member = await Members.getById(history[0].id);

		resp = await findMissing(member[0], resp);

		return resp;
	}

}


//
//	Member Update - this can be called via a PUT /members or as result of a shopify webhook notification.
//
var update = async (internalFlag, req, resp, sourceShop) => {
	var cityInfo = null;
	var mailchimpUpdateInfo = null;
	var member = null;
	var prom = [];
	var resetHomeCityFlag = false;
	var resetCityId = 0;
	var shopifyUpdateInfo = null;
	var sourceStoreId = 0;
	var updatingEmail = false;


	//
	//	Validate supplied fields.  If the update isn't coming from a shopify store, respond with validation errors.
	//
	var validationErrors = await validateMember(req, false);
	if ((validationErrors.errorDetails.length > 0) && (sourceShop === undefined)) {
		resp = formatResp(resp, undefined, 400, validationErrors.message, validationErrors.errorDetails);
		return resp;
	} else {

		//
		//	Can't update certain fields if this is an external API user.
		//
		if (internalFlag === false) {
			delete req.body.photoUrl;
			delete req.body.facebookId;
		}

		//
		//	Get member as it is in the database to use as a baseline for what's updated.
		//
		var rows = await Members.getById(req.params.id);
		if (rows.length === 0) {
			resp = formatResp(resp, undefined, 404, memberText.get("MEMBER_404"));
			return resp;
		} else {
			member = rows[0];

			//
			//	If sourceShop has been provided, this is a update coming from a shopify customer update.
			//
			if (sourceShop != undefined) {
				cityInfo = shopifyUtils.getCityInfoByCityId(member.homeCityId, member.rushInsiderFlag);
				sourceStoreId = cityInfo.id;
			}

			// If we don't have cityInfo yet, get it by home shop id.
			if (cityInfo === null) {
				cityInfo = shopifyUtils.getCityInfoByCityId(member.homeCityId, member.rushInsiderFlag);
			}


			//	Check to see if shopify and/or mailchimp update is necessary.  
			mailchimpUpdateInfo = await mailchimpUtils.prepareMailchimpUpdateBody(member, req.body);
			shopifyUpdateInfo = await shopifyUtils.prepareShopifyUpdateBody(member, req.body);

			//
			//	Check to see if the zip is in market.
			//
			rows = await ZipToCity.lookupCity((req.body.zip != undefined) ? req.body.zip : member.zip);

			//
			//	If zip is changing, check to see if it affects status.
			//
			if ((req.body.zip != undefined) && (req.body.zip != member.zip)) {
				//	If the zip couldn't be looked up, add as outside our geographic areas.
				if ((rows === undefined) || (rows.length === 0)) {
					if (member.status != 'OUTSIDE_GEOGRAPHIC') {
						resetHomeCityFlag = true;
						resetCityId = 0;
					}
				} else {
					if ((member.status === 'OUTSIDE_GEOGRAPHIC') || (member.status === 'PARTIAL')) {
						cityInfo = shopifyUtils.getCityInfoByCity(rows[0].city, member.rushInsiderFlag);
						resetHomeCityFlag = true;
						resetCityId = cityInfo.cityId;
					}
				}
			}

			rows = await Promise.all(prom);

			//
			//	If changing email, make sure email isn't already in use.  If update is coming from Shopify this should never happen.
			//
			rows = await Members.getByEmail(req.body.email, true);
			prom = [];

			if ((rows.length > 0) && (req.body.email != undefined) && (member.email != req.body.email)) {
				resp = formatResp(resp, undefined, 400, memberText.get("EMAIL_COLL"));
				return resp;
			} else {

				if ((req.body.email != undefined) && (member.email != req.body.email)) {
					updatingEmail = true;
					req.body.emailMarketingStatus = 'SUBSCRIBED';
				}

				prom.push(Members.updateById(req.params.id, internalFlag, req.body, member));

				//
				//	If current marketing status is CLEANED or UNSUBSCRIBED will need to add new email address to mailchimp.
				//
				if (mailchimpUpdateInfo.isUpdatedFlag === true) {
					// console.log("Home ID: " + member.homeShopifyStoreId + " city id: " + ((cityInfo != null) ? cityInfo.id : null));
					if ((cityInfo != null) && (cityInfo.id === member.homeShopifyStoreId)) {
						prom.push(mailchimpUtils.updateListMember(cityInfo.emailListName, member.email, mailchimpUpdateInfo));
					} else {
						prom.push(mailchimpUtils.updateListMember(process.env.MAILCHIMP_OUTLIER_LIST, member.email, mailchimpUpdateInfo));
					}
				} else {
					prom.push(Promise.resolve(true));
				}


				//
				//	If update initiated from API, update all shopify stores associated with member.  
				//	Otherwise if initiated from shopify, update all but the store that update came from.
				//
				//	Get list of store IDs the member is associated with, remove the source store ID.  Update the rest.
				//
				if (shopifyUpdateInfo.isUpdatedFlag === true) {
					// console.log("Updating member info: " + sourceStoreId + " " + member.id + " " + JSON.stringify(shopifyUpdateInfo, undefined, 2));
					prom.push(shopifyUtils.updateMemberInfo(sourceStoreId, member.id, shopifyUpdateInfo));
				}

				var results = await Promise.all(prom);
				prom = [];


				var mailchimpUpdated = true;
				var membersUpdated = true;
				var shopifyUpdated = true;

				if ((results[0] === undefined) || (results[0].updateFlag != true)) {
					membersUpdated = false;
				}

				if ((mailchimpUpdateInfo.isUpdatedFlag === true) && (results[1] === undefined)) {
					mailchimpUpdated = false;
				}

				//	Only test this if update not initiated from shopify.
				if ((shopifyUpdateInfo.isUpdatedFlag === true) && (member.status != 'OUTSIDE_GEOGRAPHIC') && (sourceShop === undefined)) {
					if ((results[2] === undefined) || (results[2].length === 0)) {
						shopifyUpdated = false;
					}
				}

				//	If the member was updated
				if ((mailchimpUpdateInfo.isUpdatedFlag && !mailchimpUpdated) || (shopifyUpdateInfo.isUpdatedFlag && !shopifyUpdated)) {
					prom.push(logUtils.log({
						severity: 'WARNING',
						type: 'MEMBERUPDATE',
						message: req.params.id + " - check that member is in sync. Mailchimp: " + mailchimpUpdated + " shopifyUpdated: " + shopifyUpdated + ".",
						stackTrace: new Error().stack
					}))
				}

				// 
				//	Only send the notification email if it's the member making the change or it's us making the change for them.
				//
				if ((!internalFlag || ((req.body.memberNotificationFlag != undefined) && (req.body.memberNotificationFlag === true)))) {
					sendNotificationEmail({
						homeCityId: member.homeCityId,
						oldEmail: member.email,
						newEmail: req.body.email ? req.body.email : member.email,
						storeInfo: member.storeInfo,
						firstName: req.body.firstName != undefined ? req.body.firstName : member.firstName
					});
				}

				//												
				//	If the member is in PARTIAL status, they were imported from Shopify and may not have all information normally required.
				// 	Revalidate the member and update status / internal notes if needed.
				//
				if ((member.status === 'PARTIAL') && ((req.body.status === undefined) || (req.body.status === 'PARTIAL'))) {
					// console.log("Revalidating partial");
					prom.push(memberUtils.revalidatePartial(req.params.id));
				}

				await Promise.all(prom);
				prom = [];

				if (resetHomeCityFlag) {
					// console.log("Setting home city on update!");
					prom.push(setHomeCity({
						params: {
							id: req.params.id
						},
						body: {
							cityId: resetCityId
						}
					}, {
						statusCode: 200,
						message: memberText.get("HOME_CITY_SUCCESS")
					}));

					if (resetCityId === 0) {
						resp.statusCode = 202;
						resp.message = memberText.get("SIGNUP_INSTORE_OUTSIDE_SUCCESS");
					}
				}

				await Promise.all(prom);

				return resp;
			}
		}
	}
}



//
//	Verify Email
//
var verifyEmail = async (req, resp) => {
	var cityInfo = null;
	var member = null;
	var prom = [];

	try {

		var result = await Members.getByVerificationId(req.query.verificationId);
		if (result.length === 0) {

			//	
			//	See if the verification ID had already been used.
			//
			var history = await Members.checkVerificationIdHistory(req.query.verificationId);
			if (history.length === 0) {

				if (req.query.verificationId !== '*|VID|*') {
					sendEmail('matt@rushmarket.com', '(' + process.env.NODE_ENV + ') Invalid verification ID in verifyEmail: ', req.query.verificationId, req.query.verificationId);
				}

				resp = formatResp(resp, undefined, 400, memberText.get("INVALID").replace('%invalid%', "verificationId"));
				return resp;

			} else {
				if (history[0].emailVerificationFlag != 1) {
					sendEmail('matt@rushmarket.com', 'Email Verification Flag Inconsistency', (result.length > 0) ? result[0].id : " " + " " + req.query.verificationId, (result.length > 0) ? result[0].id : " " + " " + req.query.verificationId);
				}

				return resp;
			}
		} else {
			member = result[0];


			cityInfo = shopifyUtils.getCityInfoByCityId(member.homeCityId);

			//
			//	If email verification flag is false, this is the verification attempt for the original email address.
			//
			if ((member.emailVerificationFlag === false) || (member.emailVerificationFlag === 0)) {
				resp = await findMissing(member, resp);
				if ((resp.data != undefined) && (resp.data.missing != undefined)) {
					resp.data.homeShopifyStoreId = member.homeShopifyStoreId;
				}

				await Members.markEmailVerified(member, req.query.verificationId);

				await mailchimpUtils.updateEmailVerification(cityInfo.emailListName, member.email);

				return resp;
			}
			//
			//	If there's a new email address, it's being validated.
			//
			//	UPDATE: Decision 8/20 to not validate an updated email.
			//
			else {

				resp = await findMissing(member, resp);
				if ((resp.data != undefined) && (resp.data.missing != undefined)) {
					resp.data.homeShopifyStoreId = member.homeShopifyStoreId;
				}

				if ((member.newEmail != null) && (member.newEmail.length > 0) && (member.email != member.newEmail)) {
					await Members.updateById(member.id, false, {
						email: member.newEmail,
						emailMarketingStatus: 'SUBSCRIBED',
						verificationId: null,
						updatingEmailFlag: true
					}, member);
				}

				return resp;
			}
		}
	} catch (e) {
		throw new Error(e);
	};
}



module.exports = {
	captureFeedback,
	captureFeedbackUnknown,
	changeEmail,
	changePassword,
	checkIn,
	createMemberMessage,
	createMemberMessageReply,
	createRecentView,
	createTidbit,
	deleteMemberMessageById,
	findMissing,
	generateRMComUrl,
	generateMultipassifyUrl,
	generatePasswordURL,
	getAll,
	getById,
	getByVerificationId,
	// getCheckIns,
	getMarketingAttribution,
	getMemberFindById,
	getMemberFinds,
	getMemberMessageById,
	getMemberMessages,
	getMemberRecentViews,
	getOrders,
	getTidbitById,
	getTidbits,
	marketingAttribution,
	notify,
	regularNewMemberLogic,
	remove,
	removeFindById,
	removeFinds,
	removeTidbit,
	setHomeCity,
	setHomeCityByZip,
	setHomeCityByZipByVerificationId,
	signup,
	storeFind,
	tagMember,
	update,
	updateByVerificationId,
	updateFindById,
	updateMemberMessageById,
	updateTidbit,
	verifyEmail
}