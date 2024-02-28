'use strict'

const {
	formatResp
} = require('../utils/response')
const sqlUtils = require('../utils/sqlUtils')


const MemberCheckouts = require('../models/memberCheckouts')




// Create metro
var create = async (checkoutId, memberId, sessionId, firstName, lastName,
	address1, address2, city, state, zip,
	country, email, phone, activeFlag, note, resp) => {

	var rows = await MemberCheckouts.getByCheckoutId(checkoutId);

	if (rows.length > 0) {
		formatResp(resp, ["id"], 409, 'Member checkout with that id already exists.');
	} else {
		if ((activeFlag === "false") || (activeFlag === false) || (activeFlag === 0) || (activeFlag === "0")) {
			activeFlag = false;
		} else {
			activeFlag = true;
		}

		var result = await MemberCheckouts.create(checkoutId, memberId, sessionId, firstName, lastName,
			address1, address2, city, state, zip,
			country, email, phone, activeFlag, note);

		if (result === null) {
			formatResp(resp, ["id"], 409, 'Member checkout with that id already exists.');
		} else {
			resp.id = result;
		}
	}

	return resp;
}




var updateById = async (id, req, resp) => {
	var rows1 = await MemberCheckouts.getByCheckoutId(id);
	var rows2 = await MemberCheckouts.getByMemberId(id);
	var rows3 = await MemberCheckouts.getBySessionId(id);
	var setInfo = {
		clause: '',
		values: []
	}

	if ((rows1.length === 0) && (rows2.length === 0) && (rows3.length === 0)) {
		formatResp(resp, ["id"], 404, 'Member checkout not found.');
	} else {

		if (rows2.length > 0) {
			id = rows2[0].checkoutId;
		}

		if (rows3.length > 0) {
			id = rows3[0].checkoutId;
		}

		if (req.body.firstName) {
			setInfo = sqlUtils.appendSet(setInfo, 'first_name = ?', req.body.firstName);
		}
		if (req.body.lastName) {
			setInfo = sqlUtils.appendSet(setInfo, 'last_name = ?', req.body.lastName);
		}
		if (req.body.address1) {
			setInfo = sqlUtils.appendSet(setInfo, 'address_1 = ?', req.body.address1);
		}
		if (req.body.address2) {
			setInfo = sqlUtils.appendSet(setInfo, 'address_2 = ?', req.body.address2);
		}
		if (req.body.city) {
			setInfo = sqlUtils.appendSet(setInfo, 'city = ?', req.body.city);
		}
		if (req.body.state) {
			setInfo = sqlUtils.appendSet(setInfo, 'state = ?', req.body.state);
		}
		if (req.body.zip) {
			setInfo = sqlUtils.appendSet(setInfo, 'zip = ?', req.body.zip);
		}
		if (req.body.country) {
			setInfo = sqlUtils.appendSet(setInfo, 'country = ?', req.body.country);
		}
		if (req.body.email) {
			setInfo = sqlUtils.appendSet(setInfo, 'email = ?', req.body.email);
		}
		if (req.body.phone) {
			setInfo = sqlUtils.appendSet(setInfo, 'phone = ?', req.body.phone);
		}
		if (req.body.note) {
			setInfo = sqlUtils.appendSet(setInfo, 'note = ?', req.body.note);
		}
		if (req.body.checkoutId) {
			setInfo = sqlUtils.appendSet(setInfo, 'checkout_id = ?', req.body.checkoutId);
		}
		if (req.body.activeFlag) {
			if ((req.body.activeFlag === "false") || (req.body.activeFlag === false) || (req.body.activeFlag === 0) || (req.body.activeFlag === "0")) {
				req.body.activeFlag = false;
			} else {
				req.body.activeFlag = true;
			}


			setInfo = sqlUtils.appendSet(setInfo, 'active_flag = ?', req.body.activeFlag);
		}


		var updateResult = await MemberCheckouts.updateByCheckoutId(id, setInfo);

		if (updateResult.affectedRows === 0) {
			formatResp(resp, undefined, 404, 'Member checkout not updated.');
		} else {
			resp.data = updateResult;
		}
	}
	return resp;
}



var getById = async (id, resp) => {
	var rows1 = await MemberCheckouts.getByCheckoutId(id);
	var rows2 = await MemberCheckouts.getByMemberId(id);
	var rows3 = await MemberCheckouts.getBySessionId(id);

	if ((rows1.length === 0) && (rows2.length === 0) && (rows3.length === 0)) {
		formatResp(resp, undefined, 404, 'Member checkout not found.');
	} else {
		if (rows1.length > 0) {
			resp.data = rows1;
		} else if (rows2.length > 0) {
			resp.data = rows2;
		} else {
			resp.data = rows3;
		}

		if (resp.data.activeFlag === 1) {
			resp.data.activeFlag = true;
		} else {
			resp.data.activeFlag = false;
		}

	}

	return resp
}



var remove = async (id, resp) => {
	var metro = await Metros.getById(id)

	if (metro.length === 0) {
		formatResp(resp, undefined, 404, 'Metros not found.')
	} else {
		await Metros.removeById(id)
	}

	return resp
}




module.exports = {
	create,
	updateById,
	getById,
	remove
}