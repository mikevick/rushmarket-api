const isValidZipcode = require('is-valid-zipcode');
const _ = require('lodash');

const {
	promisify
} = require('util');
const sleep = promisify(setTimeout);


const Shopify = require('shopify-api-node');

const Members = require('../models/members');
const RushOrders = require('../models/rushOrders');
const RushProducts = require('../models/rushProducts');
const ShopifyStores = require('../models/shopifyStores');

const configUtils = require('../utils/configUtils')
const cryptoUtils = require('../utils/cryptoUtils');
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const memberUtils = require('../utils/memberUtils');


var shopifyInfo = [];



var addMember = async (cityInfo, req) => {
	try {
		var t = await buildTags(req.body, cityInfo.citySlug);

		var o = {
			first_name: req.body.firstName,
			last_name: req.body.lastName,
			email: req.body.email,
			verified_email: true,
			tags: t
		};

		// console.log("Adding " + cityInfo.city + " " + JSON.stringify(o, undefined, 2));

		var result = await cityInfo.shopify.customer.create(o);
		return result;
	}
	catch(e) {
		if (e.message.indexOf("Unprocessable Entity") === -1) {
			logUtils.logException(e);
			logUtils.log({
				severity: 'WARNING',
				type: 'CUSTOMERCREATE',
				message: 'Shopify Create Error: ' + req.body.email + ' ' + JSON.stringify(o, undefined, 2) + ' <br><br><br><br> ' + JSON.stringify(e, undefined, 2)
			});
		}
	};
}


var addMemberFromMember = (cityInfo, member) => {
	return new Promise((resolve, reject) => {

		var req = {
			body: {
				email: member.email,
				firstName: member.firstName,
				lastName: member.lastName,
				zip: member.zip,
				verifiedMemberFlag: member.verifiedMemberFlag
			}
		}

		addMember(cityInfo, req).
		then((result) => {
			resolve(result);
		});

	});
}




//
//	Build tags from member.
//
var buildTags = async (member, citySlug) => {
	var tags = '';

	if ((member.verifiedMemberFlag != undefined) && ((member.verifiedMemberFlag === true) || (member.verifiedMemberFlag === 1))) {
		if (tags.length > 0) {
			tags = tags += ',';
		}
		tags += 'verified';
	}

	if ((member.zip != undefined) && (member.zip != '')) {
		if (tags.length > 0) {
			tags = tags += ',';
		}
		tags += member.zip;


		var memberType = await memberUtils.determineMemberType(member.zip);
		if (tags.length > 0) {
			tags = tags += ',';
		}
		tags += memberType;

	}

	if ((citySlug !== undefined) && (citySlug !== null)) {
		if (tags.length > 0) {
			tags = tags += ',';
		}
		tags += "homeCity:" + citySlug;
	}

	if ((member.facebookId !== undefined) && (member.facebookId !== null)) {
		if (tags.length > 0) {
			tags = tags += ',';
		}
		tags += "facebook:Y";
	}

	return tags;
}



var customerCount = () => {
	return new Promise((resolve, reject) => {

		var si = getCityInfoByCity("Omaha");
		si.shopify.customer.count()
			.then((result) => {
				resolve(result);
			})
			.catch(e => {
				logUtils.logException(e);
				resolve()
			});
	});
}


//
//	Extract tags from webhook notification.
//
var extractTags = (req) => {
	var result = {
		zip: '',
		verifiedMemberFlag: false,
		facebookFlag: false,
		openBoxPlatform: false
	}
	var tags = _.split(req.body.tags, ",");
	for (var i = 0; i < tags.length; i++) {
		if ((tags[i].trim() !== 'Rush ReCommerce') && (tags[i].trim() !== 'verified') && (!tags[i].trim().startsWith("homeCity:")) && (!tags[i].trim().startsWith("facebook:")) && (!tags[i].trim().startsWith("memberType:"))) {
			result.zip = tags[i].trim();
		} else if (tags[i].trim() === 'Rush ReCommerce') {
			result.openBoxPlatform = true;
		} else if (tags[i].trim() === 'verified') {
			result.verifiedMemberFlag = true;
		} else if (tags[i].trim().startsWith('facebook')) {
			result.facebookFlag = true;
		}
		
	}


	//	Check notes field for a zip
	if (result.zip === '') {
		if ((req.body.note !== null) && (req.body.note.length >= 5)) {
			result.zip = req.body.note.substring(0, 5);
			if (!isValidZipcode(result.zip)) {
				result.zip = '';
			}
		}
	}

	return result;
}





//
//	Retrieve the shopify info for the city from the cached info by city.
//
var getCityInfoByCity = (city, rushInsiderFlag) => {
	var si = _.cloneDeep(_.find(shopifyInfo, function (o) {
		return o.city === city;
	}));

	if (si != undefined) {

		//	11/14/2022 Rush Insiders list
		if (rushInsiderFlag) {
			si.emailListName = configUtils.get("RUSH_INSIDERS_MC_AUDIENCE") ? configUtils.get("RUSH_INSIDERS_MC_AUDIENCE") : 'Rush Insiders';
		}
				
		return si;
	} else {
		return null;
	}
}


//
//	Retrieve the shopify info for the city from the cached info by city ID.
//
var getCityInfoByCityId = (cityId, rushInsiderFlag) => {
	if (cityId === 0) {
		return {
			"id": 0,
			"city": null,
			"citySlug": null,
			"cityId": 0,
			"shopName": null,
			"shopDomain": null,
			"referToUrl": null,
			"tidioUrl": null,
			"logoUrl": null,
			"emailListName": process.env.MAILCHIMP_OUTLIER_LIST,
			"keyInfo": null,
			"facebookUrl": null,
			"instagramUrl": null,
			"contactEmail": null,
			"deliveryEmail": null,
			"careersEmail": null,
			"shopify": null
		}
	}


	var si = _.cloneDeep(_.find(shopifyInfo, function (o) {
		return o.cityId === cityId;
	}));

	if (si != undefined) {
		//	11/14/2022 Rush Insiders list
		if (rushInsiderFlag) {
			si.emailListName = configUtils.get("RUSH_INSIDERS_MC_AUDIENCE") ? configUtils.get("RUSH_INSIDERS_MC_AUDIENCE") : 'Rush Insiders';
		}
		

		return si;
	} else {
		return null;
	}
}


//
//	Retrieve the shopify info for the city from the cached info by shop name.
//
var getCityInfoByShop = (shop, homeStoreId) => {
	var si = _.cloneDeep(_.find(shopifyInfo, function (o) {
		return o.shopName === shop;
	}));

	var hsi = si;
	if (homeStoreId != undefined) {
		hsi = _.cloneDeep(_.find(shopifyInfo, function (o) {
			return o.id === homeStoreId;
		}));
		if (hsi != undefined) {
			si.emailListName = hsi.emailListName;
		}
	}

	if (si != undefined) {
		return si;
	} else {
		return null;
	}
}


//
//	Retrieve the shopify info for the city from the cached info by shop name.
//
var getCityInfoByShopId = (shopifyStoreId) => {
	if (shopifyStoreId === 0) {
		return {
			"id": 0,
			"city": null,
			"citySlug": null,
			"cityId": 0,
			"shopName": null,
			"shopDomain": null,
			"referToUrl": null,
			"tidioUrl": null,
			"logoUrl": null,
			"emailListName": process.env.MAILCHIMP_OUTLIER_LIST,
			"keyInfo": null,
			"facebookUrl": null,
			"instagramUrl": null,
			"contactEmail": null,
			"deliveryEmail": null,
			"careersEmail": null,
			"shopify": null
		}
	}


	var si = _.cloneDeep(_.find(shopifyInfo, function (o) {
		return o.id === shopifyStoreId;
	}));

	if (si != undefined) {
		return si;
	} else {
		return null;
	}
}


var dumpCityInfo = () => {
	console.log(JSON.stringify(shopifyInfo, undefined, 2));
}



var loadKeys = () => {
	return new Promise((resolve, reject) => {
		try {
			shopifyInfo = [];
			ShopifyStores.getAll('API')
				.then((rows) => {
					for (var i = 0; i < rows.length; i++) {
						if (rows[i].info === null) {
							logUtils.log({
								severity: 'ERROR',
								type: 'SHOPIFY',
								message: 'Keys Not Found for : ' + rows[i].city
							});
					
							continue;
						}
						var si = {
							"id": rows[i].id,
							"city": rows[i].city,
							"citySlug": rows[i].citySlug,
							"cityId": rows[i].cityId,
							"shopName": rows[i].shopName,
							"shopDomain": rows[i].shopDomain,
							"referToUrl": rows[i].referToUrl,
							"tidioUrl": rows[i].tidioUrl,
							"logoUrl": rows[i].logoUrl,
							"emailListName": rows[i].emailListName,
							"keyInfo": JSON.parse(cryptoUtils.decrypt(rows[i].info)),
							"facebookUrl": rows[i].facebookUrl,
							"instagramUrl": rows[i].instagramUrl,
							"contactEmail": rows[i].contactEmail,
							"deliveryEmail": rows[i].deliveryEmail,
							"careersEmail": rows[i].careersEmail,
							"shopify": null
						}
						si.shopify = new Shopify({
							shopName: si.shopName,
							apiKey: si.keyInfo.apiKey,
							password: si.keyInfo.apiPswd,
							autoLimit: true
						});

						si.shopify.on('callLimits', (limits) => function () {
							if (limits.current > 1) {
								// console.log("sleeping " + limits);
								sleep(5000);
							};
						});

						shopifyInfo.push(si);
					}

					console.log(rows.length + " shopify loaded.");

					// dumpCityInfo();
					// console.log(JSON.stringify(shopifyInfo, undefined, 2));
					resolve(shopifyInfo);
				})
				.catch((e) => {
					reject(e);
				});
		} catch (e) {
			reject(e);
		}
	});
}

// var lookupAndUpdateMemberEmail = (id, origEmail, email) => {
// 	return new Promise((resolve, reject) => {

// 		shopify.customer.search({
// 				query: `email:${origEmail}`
// 			})
// 			.then((result) => {
// 				//
// 				//	Should only be one result.
// 				//
// 				if (result.length != 1) {

// 				} else {
// 					return updateMember(result[0].id, {
// 						email: email
// 					});
// 				}
// 			})
// 			.then((result) => {
// 				if (result != undefined) {
// 					return Members.updateShopfiyIdById(id, result.id);
// 				} else {
// 					return;
// 				}
// 			})
// 			.then((result) => {
// 				resolve(result);
// 			})
// 			.catch(e => {
// 				logUtils.logExceptionAndResolve(resolve, e);
// 				logUtils.log({
// 					severity: 'INFO',
// 					type: 'EMAILUPDATE',
// 					message: 'Shopify Lookup and Update Email Error Shopify ID: ' + origEmail + ' ' + email + ' <br><br><br><br> ' + JSON.stringify(e, undefined, 2)
// 				});
// 			});
// 	});
// }


// var lookupAndUpdateMemberInfo = (cityInfo, id, member, newMember, tags) => {
// 	return new Promise((resolve, reject) => {

// 		cityInfo.shopify.customer.search({
// 				query: `email:${member.email}`
// 			})
// 			.then((result) => {
// 				//
// 				//	Should only be one result.
// 				//
// 				if (result.length != 1) {

// 				} else {
// 					return updateMember(cityInfo, result[0].id, {
// 						email: newMember.email != undefined ? newMember.email : member.email,
// 						first_name: newMember.firstName != undefined ? newMember.firstName : member.firstName,
// 						last_name: newMember.lastName != undefined ? newMember.lastName : member.lastName,
// 						tags: tags
// 					});
// 				}
// 			})
// 			.then((result) => {
// 				if (result != undefined) {
// 					return Members.updateShopfiyIdById(id, result.id);
// 				} else {
// 					return;
// 				}
// 			})
// 			.then((result) => {
// 				resolve(result);
// 			})
// 			.catch(e => {
// 				logUtils.logExceptionAndResolve(resolve, e);
// 				logUtils.log({
// 					severity: 'WARNING',
// 					type: 'EMAILUPDATE',
// 					message: 'Shopify Lookup and Update Info Error Shopify ID: ' + member.email + ' ' + newMember.email + ' <br><br><br><br> ' + JSON.stringify(e, undefined, 2)
// 				});
// 			});
// 	});
// }


//
//	Determine if an update to shopify is actually necessary and prepare request body.
//
var prepareShopifyUpdateBody = async (member, newMember) => {
	var resp = {
		isUpdatedFlag: false,
		updateBody: {}
	}
	var zip = null;


	var hcId = (newMember.homeCityId !== undefined) ? newMember.homeCityId : member.homeCityId;
	if ((hcId === null) || (hcId === undefined)) {
		hcId = 0;
		member.homeCityId = 0;
	}

	var cityInfo = getCityInfoByCityId(hcId);

	if (cityInfo === null) {
		// console.log("Member: " + JSON.stringify(member, undefined, 2));
		// console.log("New member: " + JSON.stringify(newMember, undefined, 2));
		dumpCityInfo();
	}


	var origTags = '';
	if ((member.zip != undefined) && (member.zip != '')) {
		origTags = origTags + member.zip;
	}
	if ((member.verifiedMemberFlag != undefined) && ((member.verifiedMemberFlag === true) || (member.verifiedMemberFlag === 1))) {
		if (origTags.length > 0) {
			origTags = origTags += ', ';
		}
		origTags = origTags += 'verified';
	}

	var tags = '';
	if ((newMember.zip != undefined) && (newMember.zip != '')) {
		tags = tags + newMember.zip;
		zip = newMember.zip;
	} else if ((member.zip != undefined) && (member.zip != '')) {
		tags = tags + member.zip;
		zip = member.zip;
	}
	if ((newMember.verifiedMemberFlag != undefined) && ((newMember.verifiedMemberFlag === true) || (newMember.verifiedMemberFlag === "1") || (member.verifiedMemberFlag === 1))) {
		if (tags.length > 0) {
			tags = tags += ', ';
		}
		tags = tags += 'verified';
	} else if ((newMember.verifiedMemberFlag === undefined) && ((member.verifiedMemberFlag === true) || (member.verifiedMemberFlag === 1))) {
		if (tags.length > 0) {
			tags = tags += ', ';
		}
		tags = tags += 'verified';
	}

	if (cityInfo.citySlug !== undefined) {
		if (tags.length > 0) {
			tags = tags += ', ';
		}
		tags += "homeCity:" + cityInfo.citySlug;
	}

	if ((newMember.tags !== undefined) && (newMember.tags.indexOf('facebook:') > -1)) {
		if (tags.length > 0) {
			tags = tags += ', ';
		}
		tags += "facebook:Y";
	}

	var memberType = await memberUtils.determineMemberType(zip);
	if (tags.length > 0) {
		tags = tags += ', ';
	}
	tags += memberType;


	var updateBody = {
		email: newMember.email != undefined ? newMember.email : member.email,
		first_name: newMember.firstName != undefined ? newMember.firstName : member.firstName,
		last_name: newMember.lastName != undefined ? newMember.lastName : member.lastName,
		tags: tags
	};


	// console.log("Shopify Update: " + JSON.stringify(updateBody, undefined, 2));

	if ((updateBody.email != member.email) || (updateBody.first_name != member.firstName) || (updateBody.last_name != member.lastName) || (updateBody.tags != origTags)) {
		resp.isUpdatedFlag = true;
		resp.updateBody = updateBody;
	}

	return resp;
}



var customerSame = (customer, body) => {
	var same = true;

	if ((customer.email === null) && (body.email !== "")) {
		// console.log("email null not same");
		return false;
	}

	if ((customer.email != null) && (customer.email !== body.email)) {
		// console.log("email not same");
		return false;
	}

	if (customer.first_name !== body.first_name) {
		// console.log("first_name not same");
		return false;
	}

	if (customer.last_name !== body.last_name) {
		// console.log("last_name not same");
		return false;
	}

	var customerTags = _.split(customer.tags, ",");
	var bodyTags = _.split(body.tags, ",");

	//	If different number of tags, not same.
	if (customerTags.length != bodyTags.length) {
		// console.log("different tag lengths");
		return false;
	}

	//	Same number, verify content.
	for (var i = 0; i < customerTags.length; i++) {
		var found = false;
		for (var j = 0; j < bodyTags.length; j++) {
			if (customerTags[i].trim() === bodyTags[j].trim()) {
				found = true;
			}
		}
		if (!found) {
			// console.log("tags not same: " + customer.tags + " " + body.tags);
			return false;
		}
	}

	return true;
}



var updateMember = async (cityInfo, id, body) => {
	try {

		if ((cityInfo !== null) && (cityInfo.shopify !== null)) {
			var customer = await cityInfo.shopify.customer.get(id);

			//	Only perform update if something is different.
			if (!customerSame(customer, body)) {
				// console.log("Updating " + cityInfo.city + " ID: " + id + " " + JSON.stringify(customer, undefined, 2) + " " + JSON.stringify(body, undefined, 2));
				var result = await cityInfo.shopify.customer.update(id, body);
				return result;
			} else {
				// console.log("same");
			}
		}
	} catch (e) {
		logUtils.logException(e);
		logUtils.log({
			severity: 'INFO',
			type: 'EMAILUPDATE',
			message: 'Shopify Update Error Shopify ID: ' + id + ' ' + JSON.stringify(body, undefined, 2) + ' <br><br><br><br> ' + JSON.stringify(e, undefined, 2)
		});
	}
}


var updateMemberInfo = async (sourceStoreId, memberId, updateInfo) => {
	var prom = [];

	try {
		var stores = await Members.getLinkedShopifyStores(memberId, 0);
		for (var i = 0; i < stores.length; i++) {
			// console.log("Updating member info (utils): " + stores[i].shopifyStoreId + " " + stores[i].shopifyCustomerId + " " + JSON.stringify(updateInfo.updateBody, undefined, 2));
			prom.push(updateMember(getCityInfoByShopId(stores[i].shopifyStoreId), stores[i].shopifyCustomerId, updateInfo.updateBody));
		}

		var result = await Promise.all(prom);
		return result;
	} catch (e) {
		logUtils.logException(e);
		logUtils.log({
			severity: 'INFO',
			type: 'EMAILUPDATE',
			message: 'Shopify Update Error Shopify ID: ' + memberId + ' Store: ' + sourceStoreId + ' <br><br><br><br> ' + JSON.stringify(e, undefined, 2)
		});
	}
}


var updateMemberEmail = (id, shopifyCustomerId, origEmail, email) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		if (shopifyCustomerId != undefined) {
			prom.push(updateMember(shopifyCustomerId, {
				email: email
			}));
		} else {
			prom.push(lookupAndUpdateMemberEmail(id, origEmail, email))
		}
		Promise.all(prom)
			.then((result) => {
				resolve(result);
			})
			.catch(e => {
				logUtils.logException(e);
				logUtils.log({
					severity: 'INFO',
					type: 'EMAILUPDATE',
					message: 'Shopify Lookup and Update Email Error Shopify ID: ' + id + ' Orig: ' + origEmail + ' ' + email + ' <br><br><br><br> ' + JSON.stringify(e, undefined, 2)
				});
				resolve();
			});
	});
}


var fulfillSku = async (sku, carrier, tracking, trackingUrl) => {
	let lineItemId = null;
	let prom = [];
	let resp = {
		statusCode: 200,
		message: 'Success',
		data: {}
	}
	let si = getCityInfoByCity("Omaha");


	resp.data.fulfillments = [];
	resp.data.fulfillments.push({
		sku: sku,
		statusCode: 200,
		message: memberText.get("GET_SUCCESS")
	})

	//	Look up order and variant information for each sku.
	let lineItems = [];
	let shopifyInventoryItemIds = '';
	let shopifyOrderVariants = await RushOrders.getShopifyOrderAndVariant([sku]);

	for (let i = 0; i < resp.data.fulfillments.length; i++) {
		let index = _.findIndex(shopifyOrderVariants, function (o) {
			return o.sku === resp.data.fulfillments[i].sku
		});
		if (index === -1) {
			resp.data.fulfillments[i].statusCode = 404;
			resp.data.fulfillments[i].message = "SKU not found.";
		} else {
			lineItems.push({
				id: shopifyOrderVariants[index].sourceLineId
			});
			if (shopifyInventoryItemIds.length > 0) {
				shopifyInventoryItemIds += ',';
			}
			shopifyInventoryItemIds += shopifyOrderVariants[index].shopifyInventoryItemId;
		}
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
		location_id: shopifyOrderVariants[0].shopifyLocationId,
		line_items: lineItems
	};

	if ((tracking !== undefined) && (tracking !== null)) {
		params.tracking_number = tracking;
	}
	if ((trackingUrl !== undefined) && (trackingUrl !== null)) {
		params.tracking_url = trackingUrl;
	}
	if ((carrier !== undefined) && (carrier !== null)) {
		params.tracking_company = carrier;
	}

	try {
		console.log("fulfillment: " + shopifyOrderVariants[0].sourceOrderId + " " + JSON.stringify(params, undefined, 2));
		var result = await si.shopify.fulfillment.create(shopifyOrderVariants[0].sourceOrderId, params);
		await RushProducts.clearBoxLocation([sku]);
		// console.log("fulfillment result: " + JSON.stringify(result, undefined, 2));
	} catch (e) {
		console.log(`Fulfillment exception: ${e}`)

		if ((e.message !== undefined) && (e.message.indexOf("422") === -1)) {
			await logUtils.log({
				severity: 'ERROR',
				type: 'FULFILL',
				message: "Non-422: " + e.message,
				stackTrace: new Error().stack
			})
			resp.statusCode = 500;
			resp.message = "Something unexpected happened - " + e.message;

			// console.log("Fulfillment: " + e.message);

			if ((e.response !== undefined) && (e.response.body !== undefined) && (e.response.body.errors !== undefined)) {
				logUtils.log({
					severity: 'ERROR',
					type: 'FULFILL',
					message: "Specific errors: " + JSON.stringify(e.response.body.errors),
					stackTrace: new Error().stack
				})
				// console.log("Specific errors: " + JSON.stringify(e.response.body.errors));
			}
		} else if ((e.message.indexOf("422") > -1)) {
			if ((e.response !== undefined) && (e.response.body !== undefined) && (e.response.body.errors !== undefined)) {
				let message = "422 Specific errors: " + JSON.stringify(e.response.body.errors);
				if (message.indexOf("is already fulfilled") === -1) {
					logUtils.log({
						severity: 'ERROR',
						type: 'FULFILL',
						message: "422 Specific errors: " + JSON.stringify(e.response.body.errors),
						stackTrace: new Error().stack
					})
				}
			}

			resp.statusCode = 409;
			resp.message = "SKU(s) already fulfilled.";
		} else {
			logUtils.log({
				severity: 'ERROR',
				type: 'FULFILL',
				message: "General Exception: " + e,
				stackTrace: new Error().stack
			})

		}
	}

	return resp;
}


module.exports = {
	addMember,
	addMemberFromMember,
	buildTags,
	customerCount,
	dumpCityInfo,
	extractTags,
	fulfillSku,
	getCityInfoByCity,
	getCityInfoByCityId,
	getCityInfoByShop,
	getCityInfoByShopId,
	loadKeys,
	prepareShopifyUpdateBody,
	updateMemberEmail,
	updateMemberInfo
}