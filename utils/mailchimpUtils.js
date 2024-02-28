const mailchimp = require('@mailchimp/mailchimp_marketing');

mailchimp.setConfig({
	apiKey: process.env.MAILCHIMP_API_KEY,
	server: process.env.MAILCHIMP_SERVER_PREFIX
});

const md5 = require('md5');

const Members = require('../models/members');

const logUtils = require('../utils/logUtils');
const memberUtils = require('../utils/memberUtils');
const { bumpExpiration } = require('../models/productHolds');


var mailchimpLists = [];




var addMember = async (emailListName, body) => {
	var listId = undefined;
	var tags = null;

	// console.log(`***** ${emailListName}`)
	try {
		if ((body.email_address === undefined) || (body.email_address === null) || (body.email_address === "")) {
			return;
		} else {
			var listInfo = await lookupList(emailListName);
			if (listInfo === undefined) {
				logUtils.log({
					severity: 'ERROR',
					type: 'MEMBERADD',
					message: emailListName + ' could not be found.  Email: ' + body.email
				});

				// comms.sendEmail('matt@rushmarket.com', 'Mailchimp List Error', emailListName + ' could not be found.  Email: ' + body.email, emailListName + ' could not be found.  Email: ' + body.email);
				return;
			}

			listId = listInfo.id;

			// Save off the tags to be updated separately.
			tags = body.tags;
			delete body.tags;
			var result = await mailchimp.lists.addListMember(listId, body);
			if (result != undefined) {

				// console.log(JSON.stringify(result, undefined, 2))

				if (tags !== undefined) {
					var tagResult = await mailchimp.lists.updateListMemberTags(listId,
						result.id, {
							tags: tags
					});
					
					// console.log(JSON.stringify(tagResult, undefined, 2))

				}
				return result.id;
			} else {
				return;
			}
		}
	} catch (e) {
		//	If the member is already in the list, just ignore.  Otherwise notify of error.
		if (e.response === undefined) {
			console.log("undefined e.response " + e);
			logUtils.log({
				severity: 'WARNING',
				type: 'MEMBERADD',
				message: e,
				stackTrace: e.stack
			});
		} else {
			if (e.response.body === undefined) {
				console.log("undefined e.response.body " + e);
				logUtils.log({
					severity: 'WARNING',
					type: 'MEMBERADD',
					message: e,
					stackTrace: e.stack
				});
			} else {
				if (e.response.body.title === 'Invalid Resource') {
					if (e.response.body.detail.indexOf("fake or invalid") > -1) {
						Members.updateEmailMarketingStatusByEmail(body.email, 'REJECTED');
						logUtils.log({
							severity: 'WARNING',
							type: 'MEMBERADD',
							message: e.response.body.detail,
							stackTrace: e.stack
						});
					} else if (e.response.body.detail.indexOf("merge fields") > -1) {
						logUtils.log({
							severity: 'WARNING',
							type: 'MEMBERADD',
							message: "Email: " + body.email + " Zip: " + body.zip + " Message: " + e.response.body.detail + " " + e.errors[0].message,
							stackTrace: e.stack
						});
					} else if (e.response.body.detail.indexOf("has signed up to a lot of lists very recently") > -1) {
						logUtils.log({
							severity: 'WARNING',
							type: 'MEMBERADD',
							message: e.response.body.detail,
							stackTrace: e.stack
						});
					} else {
						logUtils.log({
							severity: 'WARNING',
							type: 'MEMBERADD',
							message: e.errors !== undefined ? e.errors[0].message : JSON.stringify(body, undefined, 2),
							stackTrace: e.stack
						});
					}
				} else if (e.response.body.title != 'Member Exists') {
					logUtils.log({
						severity: 'WARNING',
						type: 'MEMBERADD',
						message: e.errors !== undefined ? e.errors[0].message : JSON.stringify(body, undefined, 2),
						stackTrace: e.stack
					});
				}
			}
		}
	}
}


var addListMemberFromReq = async (emailListName, req) => {
	var b = await prepareMailchimpBodyFromReq(req);

	try {
		var result = await addMember(emailListName, b);
		// console.log("Mailchimp Result: " + JSON.stringify(result, undefined, 2));
		if (result != undefined) {
			// console.log(result);
			return result;
		} else {
			return;
		}
	} catch (e) {
		//	If the member is already in the list, just ignore.  Otherwise notify of error.
		if (e.response !== undefined) {
			if (e.response.body.title === 'Invalid Resource') {
				if (e.response.body.detail.indexOf("fake or invalid") > -1) {
					await Members.updateEmailMarketingStatusByEmail(req.body.email, 'REJECTED');
					logUtils.log({
						severity: 'WARNING',
						type: 'MEMBERADD',
						message: e.response.body.detail
					});
				} else if (e.response.body.detail.indexOf("merge fields") > -1) {
					logUtils.log({
						severity: 'WARNING',
						type: 'MEMBERADD',
						message: "Email: " + req.body.email + " Zip: " + req.body.zip + " Message: " + e.response.body.detail + " " + e.errors[0].message,
						stackTrace: e.stack
					});
				} else {
					logUtils.log({
						severity: 'WARNING',
						type: 'MEMBERADD',
						message: e.errors !== undefined ? e.errors[0].message : JSON.stringify(bumpExpiration, undefined, 2),
						stackTrace: e.stack
					});
				}
			} else if (e.response.body.title != 'Member Exists') {
				logUtils.log({
					severity: 'WARNING',
					type: 'MEMBERADD',
					message: e.errors !== undefined ? e.errors[0].message : JSON.stringify(b, undefined, 2),
					stackTrace: e.stack
				});
			}
		} else {
			logUtils.log({
				severity: 'WARNING',
				type: 'MEMBERADD',
				message: e.errors !== undefined ? e.errors[0].message : JSON.stringify(b, undefined, 2),
				stackTrace: e.stack
			});
		}
	}
}


var addListMemberFromMember = async (oldEmailListName, emailListName, member) => {

	try {

		var memberType = await memberUtils.determineMemberType(member.zip);
		var region = await memberUtils.determineRegion(member.zip, member.homeCityId);
	
	
		var req = {
			body: {
				email: member.email,
				firstName: member.firstName,
				lastName: member.lastName,
				zip: member.zip,
				emailVerificationFlag: member.emailVerificationFlag,
				homeCityId: member.homeCityId
			}
		}

		//	Attempt to pull all tags over as we move list member to another list.
		if (oldEmailListName !== undefined) {
			var listInfo = await lookupList(oldEmailListName);
			if (listInfo !== undefined) {
				try {
					var m = await mailchimp.lists.getListMember(listInfo.id, md5(member.email.toLowerCase()))
					if (m.tags.length > 0) {
						req.body.tags = m.tags;
					}
				} catch (e) {
					if (e.status === 404) {
						logUtils.logException(member.email + ' not found in ' + oldEmailListName);
					}
				}
			}
		}

		// console.log("Adding list member to " + emailListName);
		var result = await addListMemberFromReq(emailListName, req);
		return result;
	} catch (e) {
		logUtils.log({
			severity: 'ERROR',
			type: 'MEMBERADD',
			message: e.errors !== undefined ? e.errors[0].message : JSON.stringify(requestBody, undefined, 2),
			stackTrace: e.stack
		});
	}
}



var lookupList = async (listName) => {
	try {
		var listFound = false
		var list = undefined;


		//	Lookup lists.
		for (var i = 0; i < mailchimpLists.length; i++) {
			if (mailchimpLists[i].name === listName) {
				listFound = true;
				list = JSON.parse(JSON.stringify(mailchimpLists[i]));
			}
		}

		if (!listFound) {
			var listsResponse = await mailchimp.lists.getAllLists({
				count: 10000
			});

			//	If there's a result, loop through the lists and see if we can find the target list.
			if ((listsResponse != undefined) && (listsResponse.lists != undefined)) {
				for (var i = 0; i < listsResponse.lists.length; i++) {
					if (listName === listsResponse.lists[i].name) {
						listFound = true;
						list = listsResponse.lists[i];
						mailchimpLists.push(listsResponse.lists[i]);
					}
				}
			}
		}

		if (listFound === false) {
			logUtils.log({
				severity: 'ERROR',
				type: 'LOOKUPLIST',
				message: listName + ' could not be found.'
			});

			// comms.sendEmail('matt@rushmarket.com', 'Mailchimp List Error', listName + ' could not be found.  Returning ' + list, 'Mailchimp List Error', listName + ' could not be found.  Returning ' + list);
		}

		return (list);
	} catch (e) {
		logUtils.log({
			severity: 'ERROR',
			type: 'LISTLOOKUP',
			message: e.errors !== undefined ? e.errors[0].message : e,
			stackTrace: e.stack
		});
	}
}



//
//	Prepare a mailchimp body from a request member.
//
var prepareMailchimpBodyFromReq = async (req) => {
	var phone = req.body.phone === null ? '' : req.body.phone;

	var memberType = await memberUtils.determineMemberType(req.body.zip);
	var region = await memberUtils.determineRegion(req.body.zip, req.body.homeCityId);

	var b = {
		email_address: req.body.email,
		status: 'subscribed',
		merge_fields: {
			FNAME: req.body.firstName ? req.body.firstName : '',
			LNAME: req.body.lastName ? req.body.lastName : '',
			MMERGE3: req.body.zip,
			MMERGE5: req.body.emailVerificationFlag === true ? 'Y' : '',
			PHONE_NUMB: phone
		},
		tags: []
	}

	if (req.body.tags && req.body.tags.length) {
		// console.log("Tags: " + JSON.stringify(req.body.tags, undefined, 2));
		for (var i = 0; i < req.body.tags.length; i++) {
			//	If name isn't present this member was likely created from shopify POS
			if ((req.body.tags[i].name !== undefined) && ((req.body.tags[i].name.indexOf('memberType:') === 0) || (req.body.tags[i].name.indexOf('region:') === 0))) {
				b.tags.push({
					name: req.body.tags[i].name,
					status: "inactive"
				})
			} else {
				b.tags.push({
					name: req.body.tags[i].name,
					status: "active"
				});
			}
		}
	}

	b.tags.push({
		name: memberType,
		status: "active"
	});

	b.tags.push({
		name: region,
		status: "active"
	});

	if (req.body.rushInsiderFlag) {
		b.tags.push({
			name: `rushInsiderFlag:true`,
	 		status: "active"
		});
	}
	else {
		b.tags.push({
			name: `rushInsiderFlag:false`,
			status: "active"
		});
	}

	// console.log(JSON.stringify(b.tags, undefined, 2))
	return b;
}




//
//	Determine if an update to mailchimp is actually necessary and prepare request body.
//
var prepareMailchimpUpdateBody = async (member, newMember, updateFromShopify) => {
	var resp = {
		isUpdatedFlag: false,
		requireAdd: false,
		updateBody: {}
	}

	var status = member.emailMarketingStatus;
	if (newMember.emailMarketingStatus != undefined) {
		status = newMember.emailMarketingStatus;
	}

	if (status === 'REJECTED') {
		status = 'SUBSCRIBED';
	}

	//	If original email is CLEANED or UNSUBSCRIBED and we're updating email, must add a new mailchimp member.
	if ((member.email != newMember.email) && ((member.emailMarketingStatus === 'CLEANED') || (member.emailMarketingStatus === 'UNSUBSCRIBED'))) {
		resp.requireAdd = true;
	}

	if ((newMember.email != undefined) && (member.email != newMember.email)) {
		status = 'SUBSCRIBED';
	}



	var updateBody = {};
	if (updateFromShopify != undefined) {
		updateBody = {
			email_address: newMember.email != undefined ? newMember.email : member.email,
			merge_fields: {
				FNAME: newMember.first_name != undefined ? newMember.first_name : member.firstName,
				LNAME: newMember.last_name != undefined ? newMember.last_name : member.lastName,
				MMERGE3: newMember.zip != undefined ? newMember.zip : member.zip,
				MMERGE5: ((newMember.emailVerificationFlag != undefined) && (newMember.emailVerificationFlag === true)) ? 'Y' : '',
			},
			status: status.toLowerCase(),
			status_if_new: status.toLowerCase()
		}
	} else {

		updateBody = {
			email_address: newMember.email != undefined ? newMember.email : member.email,
			merge_fields: {
				FNAME: newMember.firstName != undefined ? newMember.firstName : member.firstName,
				LNAME: newMember.lastName != undefined ? newMember.lastName : member.lastName,
				MMERGE3: newMember.zip != undefined ? newMember.zip : member.zip,
			},
			status: status.toLowerCase(),
			status_if_new: status.toLowerCase(),
			tags: []
		}
	}


	if (newMember.zip) {
		var memberType = null;
		memberType = await memberUtils.determineMemberType(newMember.zip);

		if (memberType !== null) {
			updateBody.tags.push({
				name: memberType,
				status: "active"
			});
		}
	}


	if (newMember.zip || newMember.homeCityId) {
		var region = await memberUtils.determineRegion(newMember.zip, newMember.homeCityId);
		if (region) {
			updateBody.tags.push({
				name: region,
				status: "active"
			})
		}
	}

	if (member.rushInsiderFlag) {
		updateBody.tags.push({
			name: 'rushInsiderFlag:false',
			status: 'inactive'			
		})

		updateBody.tags.push({
			name: 'rushInsiderFlag:true',
			status: 'active'			
		})
	}
	else {
		updateBody.tags.push({
			name: 'rushInsiderFlag:true',
			status: 'inactive'			
		})

		updateBody.tags.push({
			name: 'rushInsiderFlag:false',
			status: 'active'			
		})
	}


	if ((updateBody.email_address != member.email) || (updateBody.merge_fields.FNAME != member.firstName) || (updateBody.merge_fields.LNAME != member.lastName) ||
		(updateBody.merge_fields.MMERGE3 != member.zip) || (updateBody.status.toUpperCase() != member.emailMarketingStatus) || (memberType !== null)) {
		resp.isUpdatedFlag = true;
		resp.updateBody = updateBody;
	}

	// console.log("mailchimp update body: " + JSON.stringify(updateBody, undefined, 2));

	return resp;
}



var removeListMember = async (emailListName, email) => {
	var listId = undefined;

	try {
		if ((email === undefined) || (email === null) || (email === '')) {
			return undefined;
		} else {
			// console.log(`Removing ${email} from ${emailListName}`)
			var listInfo = await lookupList(emailListName);
			if (listInfo === undefined) {
				logUtils.log({
					severity: 'ERROR',
					type: 'REMOVELISTMEMBER',
					message: emailListName + ' could not be found.  Email: ' + email
				});

				return;
			}

			listId = listInfo.id;

			var id = md5(email.toLowerCase());

			// console.log("Deleting list member from " + emailListName);
			var result = await mailchimp.lists.deleteListMember(listId, id);
			// console.log(`Removing result: ${result}`)
			return result;
		}
	} catch (e) {
		// console.log(`Removing Exception: ${e}`)
		if ((e.status !== 404) && (e.response.body.detail.indexOf("already a list memeber") === -1) && (e.response.body.detail.indexOf("list member cannot be removed") === -1)) {
			logUtils.log({
				severity: 'ERROR',
				type: 'REMOVELISTMEMBER',
				message: e.errors !== undefined ? e.errors[0].message : JSON.stringify(e, undefined, 2),
				stackTrace: e.stack
			});
		}
	}
}


var updateEmailVerification = async (emailListName, email) => {
	var updateBody = {};
	updateBody = {
		email_address: email,
		merge_fields: {
			MMERGE5: "Y"
		}
	}

	try {
		var result = await updateMember(emailListName, md5(email.toLowerCase()), updateBody);
		return result;

	} catch (e) {
		logUtils.log({
			severity: 'ERROR',
			type: 'UPDATEVERIFICATION',
			message: e.errors !== undefined ? e.errors[0].message : JSON.stringify(updateBody, undefined, 2),
			stackTrace: e.stack
		});
	}
}


//
//	Update this member's info in mailchimp.
//
var updateListMember = async (emailListName, origEmail, updateInfo) => {
	var prom = [];

	try {
		if ((updateInfo.requireAdd) || (origEmail === null)) {
			prom.push(addMember(emailListName, updateInfo.updateBody));
		} else {
			prom.push(updateMember(emailListName, md5(origEmail.toLowerCase()), updateInfo.updateBody));
		}

		var result = await Promise.all(prom);
		return result;
	} catch (e) {

		logUtils.log({
			severity: 'WARNING',
			type: 'UPDATELISTMEMBER',
			message: origEmail + " UpdateInfo: " + JSON.stringify(updateInfo, undefined, 2),
			stackTrace: e.stack
		})

		logUtils.log({
			severity: 'WARNING',
			type: 'UPDATELISTMEMBER',
			message: e,
			stackTrace: e.stack
		})

		if ((e.response !== undefined) && (e.response.body !== undefined) && (e.response.body.detail !== undefined) && (e.response.body.detail.indexOf("already a list memeber") === -1)) {
			logUtils.log({
				severity: 'WARNING',
				type: 'UPDATELISTMEMBER',
				message: e.errors != undefined ? e.errors[0].message : JSON.stringify(updateInfo, undefined, 2),
				stackTrace: e.stack
			});
		} else {
			logUtils.log({
				severity: 'WARNING',
				type: 'UPDATELISTMEMBER',
				message: e,
				stackTrace: e.stack
			})
		}
	}
}



var updateMember = async (emailListName, id, body) => {
	var requestBody = {};

	try {
		if (Object.keys(body).length === 0) {
			// console.log("empty body");
			return;
		}
		var listInfo = await lookupList(emailListName);
		if (listInfo === undefined) {
			logUtils.log({
				severity: 'ERROR',
				type: 'UPDATEMEMBER',
				message: emailListName + ' could not be found.  Email: ' + email
			});

			return;
		}

		listId = listInfo.id;

		var result = await mailchimp.lists.updateListMember(listId, id, body);

		if (body.tags !== undefined) {

			body.tags.push({
				name: "memberType:primary",
				status: "inactive"
			});
		
			body.tags.push({
				name: "memberType:secondary",
				status: "inactive"
			});
			
			var tags = [
				body.tags
			];

			// console.log("update tags: " + JSON.stringify(tags, undefined, 2));

			result = await mailchimp.lists.updateListMemberTags(
				listId,
				id, {
					tags: tags
				}
			);
		}

		return result;

	} catch (e) {
		// console.log("mailchimp updatemember: " + JSON.stringify(body, undefined, 2));
		logUtils.log({
			severity: 'WARNING',
			type: 'MEMBERUPDATE',
			message: e,
			stackTrace: e.stack
		});

		if (e.response !== undefined) {
			console.log("e.response");
		}
		if (e.response.body !== undefined) {
			console.log("e.response.body");
		}
		if (e.response.body.title !== undefined) {
			console.log("e.response.body.title: " + e.response.body.title);
		}


		if (e.response.body.title === 'Invalid Resource') {
			await Members.updateEmailMarketingStatusByEmail(body.email, 'UNSUBSCRIBED');
			logUtils.log({
				severity: 'WARNING',
				type: 'MEMBERUPDATE',
				message: "Invalid resource: " + e.errors !== undefined ? e.errors[0].message : JSON.stringify(body, undefined, 2),
				stackTrace: e.stack
			});
		} else if (e.response.body.title === 'Resource Not Found') {
			await Members.updateEmailMarketingStatusByEmail(body.email, 'UNSUBSCRIBED');
			logUtils.log({
				severity: 'WARNING',
				type: 'MEMBERUPDATE',
				message: "Resource Not Found: " + e.errors !== undefined ? JSON.stringify(e.errors, undefined, 2) : JSON.stringify(body, undefined, 2),
				stackTrace: e.stack
			});
		} else {
			// console.log("Updating: " + body.email_address);
			logUtils.log({
				severity: 'WARNING',
				type: 'MEMBERUPDATE',
				message: e.errors !== undefined ? e.errors[0].message : JSON.stringify(body, undefined, 2),
				stackTrace: e.stack
			});
		}

		throw e;
	};
}


var updateMemberStatus = async (emailListName, email, status) => {
	var listId = undefined;
	var prom = [];

	try {
		var listInfo = await lookupList(emailListName);
		if (listInfo === undefined) {
			logUtils.log({
				severity: 'ERROR',
				type: 'UPDATEMEMBERSTATUS',
				message: emailListName + ' could not be found.  Email: ' + email
			});

			return;
		}

		listId = listInfo.id;

		var mcStatus = 'SUBSCRIBED';
		if (status === 'REJECTED') {
			mcStatus = 'rejected';
		} else if (status === 'UNSUBSCRIBED') {
			mcStatus = 'unsubscribed';
		} else if (status === 'CLEANED') {
			mcStatus = 'cleaned';
		}


		//	If list found add member.
		var result = await mailchimp.lists.updateListMember(listId, md5(email.toLowerCase()), {
			email_address: email,
			status: mcStatus
		});
		return result;
	} catch (e) {
		logUtils.log({
			severity: 'ERROR',
			type: 'UPDATESTATUS',
			message: e.errors !== undefined ? e.errors[0].message : JSON.stringify(requestBody, undefined, 2),
			stackTrace: e.stack
		});
	}
}



var captureEmail = async (emailListName, email, zip, slug, tags) => {
	var listId = undefined;

	try {
		var listInfo = await lookupList(emailListName);
		if (listInfo === undefined) {
			logUtils.log({
				severity: 'ERROR',
				type: 'CAPTUREEMAIL',
				message: emailListName + ' could not be found.  Email: ' + email
			});

			return;
		}

		listId = listInfo.id;

		var b = {
			email_address: email,
			status: 'subscribed',
			merge_fields: {
				MMERGE3: zip,
			}
		}


		var result = await mailchimp.lists.addListMember(listId, b);
		if (result !== undefined) {
			var tagBody = {
				tags: [{
					name: slug,
					status: "active"
				}]				
			}

			if (Array.isArray(tags)) { 
				for (let i = 0; i < tags.length; i++) {
					tagBody.tags.push({
						name: tags[i],
						status: "active"
					})
				}
			}

			var tagResult = await mailchimp.lists.updateListMemberTags(listId,
				result.id, tagBody
			);
			return result.id;
		} else {
			return;
		}
	} catch (e) {
		//	If the member is already in the list, just ignore.  Otherwise notify of error.
		if (e.response === undefined) {
			console.log("undefined e.response " + e);
			logUtils.log({
				severity: 'WARNING',
				type: 'CAPTUREEMAIL',
				message: e,
				stackTrace: e.stack
			});
		} else {
			if (e.response.body === undefined) {
				console.log("undefined e.response.body " + e);
				logUtils.log({
					severity: 'WARNING',
					type: 'CAPTUREEMAIL',
					message: e,
					stackTrace: e.stack
				});
			} else {
				if (e.response.body.title === 'Invalid Resource') {
					// if (e.response.body.detail.indexOf("fake or invalid") > -1) {
					// 	Members.updateEmailMarketingStatusByEmail(email, 'REJECTED');
					// 	logUtils.log({
					// 		severity: 'WARNING',
					// 		type: 'CAPTUREEMAIL',
					// 		message: e.response.body.detail,
					// 		stackTrace: e.stack
					// 	});
				} else if (e.response.body.detail.indexOf("merge fields") > -1) {
					logUtils.log({
						severity: 'WARNING',
						type: 'CAPTUREEMAIL',
						message: "Email: " + email + " Zip: " + zip + " Message: " + e.response.body.detail + " " + e.errors[0].message,
						stackTrace: e.stack
					});
				} else if (e.response.body.detail.indexOf("has signed up to a lot of lists very recently") > -1) {
					logUtils.log({
						severity: 'WARNING',
						type: 'CAPTUREEMAIL',
						message: e.response.body.detail,
						stackTrace: e.stack
					});
				} else {
					var m = e.response.body.detail ? e.response.body.detail : (e.errors !== undefined ? e.errors[0].message : JSON.stringify(b, undefined, 2))
					logUtils.log({
						severity: 'WARNING',
						type: 'CAPTUREEMAIL',
						message: m,
						stackTrace: e.stack
					});
				}
			}
		}
	}
}






module.exports = {
	addListMemberFromReq,
	addListMemberFromMember,
	captureEmail,
	lookupList,
	prepareMailchimpBodyFromReq,
	prepareMailchimpUpdateBody,
	removeListMember,
	updateEmailVerification,
	// updateMemberEmail,
	updateListMember,
	updateMemberStatus
}