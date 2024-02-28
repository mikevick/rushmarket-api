'use strict';

const colUtils = require('../utils/columnUtils');

exports.updateProductVerifyDone = async (conn, rushSku, { onlineQuickSale, category1, category2 }) => {
	const columns = ['step_verify_done']
	const values = ['Y']

	if (onlineQuickSale) {
		columns.push('online_quick_sale')
		values.push(onlineQuickSale)
	}
	if (category1 && category2) {
		columns.push('category_1', 'category_2')
		values.push(category1, category2)
	}

	return conn.query(`
		UPDATE products
		SET ${columns.map(column => `${column} = ?`).join(', ')}
		WHERE sku = ?
	`, [...values, rushSku])
}


exports.updateVendorCatalogProductImages = async (vendorConn, id, images) => {
	const { columns, values } = images.reduce((result, { field, url }) => {
		switch (field) {
			case 'mainImageLifestyle':
				result.columns.push('main_image_lifestyle')
				result.values.push(url)
				break;
			case 'altImage3':
				result.columns.push('alt_image3')
				result.values.push(url)
				break;
			case 'altImage4':
				result.columns.push('alt_image4')
				result.values.push(url)
				break;
			case 'altImage5':
				result.columns.push('alt_image5')
				result.values.push(url)
				break;
			case 'swatchImage6':
				result.columns.push('swatch_image6')
				result.values.push(url)
				break;
		}
		return result
	}, { columns: [], values: [] });

	return vendorConn.query(`
	UPDATE vendor_catalog_products
	SET ${columns.map(column => `${column} = ?`).join(', ')}
	WHERE id = ?
	`, [...values, id]);
}

exports.updateVendorCatalogProductAsVerified = async (vendorConn, id, validatedBy, validatedByType) => {
	return vendorConn.query(`
		UPDATE vendor_catalog_products
		SET validated = true, validated_by = ?, validated_by_type = ?, validated_date = now()
		WHERE id = ? AND validated = false`, [validatedBy, validatedByType, id]);
}

exports.getProductDataIssue = async (conn, rushSku) => {
	const result = await conn.query('SELECT * FROM product_data_issues_queue WHERE sku = ?', [rushSku]);
	colUtils.outboundNaming(result);
	return result && result.length ? result[0] : undefined;
}

exports.createProductDataIssue = async (conn, rushSku, createdBy, createdByType) => {
	return conn.query(
		'INSERT INTO product_data_issues_queue (sku, status, created_by, created_by_type) VALUES (?, ?, ?, ?)',
		[rushSku, 'OPEN', createdBy, createdByType]
	);
}

exports.updateProductDataIssue = async (conn, rushSku, modifiedBy, modifiedByType) => {
	return conn.query(`
			UPDATE product_data_issues_queue
			SET assigned_user_id = 0, status = 'OPEN', notes = NULL, modified_by = ?, modified_by_type = ?
			WHERE sku = ?`, [modifiedBy, modifiedByType, rushSku]);
}


exports.createVerificationProductActionLog = async (conn, rushSku, userId, userType, verifications) => {
	return conn.query(
		`INSERT INTO product_action_log (sku, action, user_id, user_type, json) VALUES (?, 'VERIFICATION', ?, ?, ?)`,
		[rushSku, userId, userType, JSON.stringify(verifications)]
	);
}

exports.createOnlineQuickSaleProductActionLog = async (conn, rushSku, userId, userType) => {
	return conn.query(
		`INSERT INTO product_action_log (sku, action, user_id, user_type) VALUES (?, 'ONLINE_QUICK_SALE', ?, ?)`,
		[rushSku, userId, userType]
	);
}
