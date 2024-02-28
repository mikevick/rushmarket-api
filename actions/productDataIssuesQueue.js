'use strict';

const {
	formatResp
} = require('../utils/response');
const ProductDataIssuesQueue = require('../models/productDataIssuesQueue');
const ProductVerifications = require('../models/productVerifications');
const VendorSkus = require('../models/vendorSkus');



var getAll = async (whereInfo, sortBy, offset, limit, resp) => {
	let getAllResult = await ProductDataIssuesQueue.getAll(whereInfo, sortBy, offset, limit);


	if (getAllResult.rows.length === 0) {
		formatResp(resp, undefined, 404, 'No product data issues found.');
	} else {


		var prom = [];
		for (var i = 0; i < getAllResult.rows.length; i++) {
			prom.push(ProductVerifications.get(getAllResult.rows[i].sku));
			prom.push(VendorSkus.getByVendor(getAllResult.rows[i].vendorId, getAllResult.rows[i].sellerProductId));
		}

		var results = await Promise.all(prom);

		var promIndex = 0;
		for (var i = 0; i < getAllResult.rows.length; i++) {
			getAllResult.rows[i].issues = [];
			for (var k = 0; k < results[promIndex].length; k++) {
				getAllResult.rows[i].issues.push({
					key: results[promIndex][k].key,
					value: results[promIndex][k].value,
					done: results[promIndex][k].done,
					doneBy: results[promIndex][k].doneBy,
					dateDone: results[promIndex][k].dateDone
				});
			}
			promIndex++;
			getAllResult.rows[i].vendorCatalogProductId = (results[promIndex].length > 0) ? results[promIndex][0].id : null;
			if (getAllResult.rows[i].onlineQuickSale === 'N') {
				getAllResult.rows[i].productName = (results[promIndex].length > 0) ? results[promIndex][0].productName : null;
			}
			promIndex++;
		}

		resp.data.productDataIssuesQueue = getAllResult.rows;
		resp.metaData.totalCount = getAllResult.totalCount;
	}

	return resp;
}

var getById = async (id, resp) => {
	let getByIdResult = await ProductDataIssuesQueue.getById(id);

	if (getByIdResult.rows.length === 0) {
		formatResp(resp, undefined, 404, 'No product data issue found.');
	} else {
		resp.data.productDataIssuesQueue = getByIdResult.rows;
	}
	return resp;
}


var getIssueTypes = async (resp) => {
	let rows = await ProductDataIssuesQueue.getIssueTypes();

	if (rows.length === 0) {
		formatResp(resp, undefined, 404, 'No issue types found.');
	} else {
		resp.data.issueTypes = [];
		for (var i=0; i < rows.length; i++) {
			resp.data.issueTypes.push(rows[i].key);
		}
	}
	return resp;
}


var create = async (sku, status, createdBy, createdByType, assignedUserId, resp) => {
	let result = await ProductDataIssuesQueue.create(sku, status, createdBy, createdByType, assignedUserId);
	resp.id = result;
	return resp;
}

var updateById = async (id, setInfo, resp) => {
	let getByIdResult = await ProductDataIssuesQueue.getById(id);
	if (getByIdResult.length === 0) {
		formatResp(resp, undefined, 404, 'No product data issue found.');
	} else {
		let updateResult = await ProductDataIssuesQueue.updateById(id, setInfo);

		if (updateResult.rows.length === 0) {
			formatResp(resp, undefined, 404, 'product data issue not updated.')
		} else {
			resp.data = updateResult.rows
		}
	}
	return resp
}

async function updateProductVerification(sku, key, setInfo, resp) {
	let productVerificationRows = await ProductVerifications.get(sku);
	let productVerificiations = productVerificationRows.filter(pv => pv.key === key);

	if (productVerificiations.length === 0) {
		return formatResp(resp, undefined, 404, 'No product verifications found.');
	}

	const result = await ProductVerifications.update(sku, key, setInfo);
	if (result.affectedRows === 0) {
		return formatResp(resp, undefined, 404, 'Product verifications not updated.');
	}
	return resp;
}

var remove = async (id, resp) => {
	let removeResult = await ProductDataIssuesQueue.deleteById(id);

	if (removeResult.length === 0) {
		resp = formatResp(resp, undefined, 404, 'product data issue not found.');
	}
	return resp;
}

module.exports = {
	getAll,
	getById,
	getIssueTypes,
	create,
	updateById,
	updateProductVerification,
	remove
}
