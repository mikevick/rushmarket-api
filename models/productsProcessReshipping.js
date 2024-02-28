'use strict';

exports.clearProductShippingBoxes = async (conn, rushSku) => {
	return conn.query(`DELETE FROM product_shipping_boxes WHERE sku = ?`, [rushSku]);
}

function getColumnsAndValuesForBoxes(boxes) {
	return boxes.slice(0, 19).reduce((results, box, index) => {
		// sort the dimensions lowest to highest and assign to height/width/length in that order
		const [height, width, length] = [box.packageHeight, box.packageWidth, box.packageLength].sort();

		const columnNumber = index + 1;
		return {
			columns: [
				...results.columns,
				`package_height${columnNumber}`,
				`package_width${columnNumber}`,
				`package_length${columnNumber}`,
				`shipping_weight${columnNumber}`
			],
			values: [...results.values, height, width, length, box.shippingWeight]
		};
	}, { columns: [], values: [] });
}

exports.createProductShippingBoxes = async (conn, rushSku, boxes) => {
	const { columns: boxColumns, values: boxValues } = getColumnsAndValuesForBoxes(boxes);
	const columns = ['sku', 'number_of_boxes', ...boxColumns];
	const values = [rushSku, Math.min(boxes.length, 20), ...boxValues];

	const columnsString = columns.join(', ');
	const valuesString = values.map(() => '?').join(', ');

	return conn.query(`INSERT INTO product_shipping_boxes (${columnsString}) VALUES (${valuesString})`, values);
}

exports.updateVendorCatalogProductBoxes = async (productConn, vendorCatalogProductId, boxes) => {
	const { columns, values } = getColumnsAndValuesForBoxes(boxes);

	const columnsString = [...columns, 'number_of_boxes'].map(column => `${column} = ?`).join(', ');

	productConn.query(`
		UPDATE vendor_catalog_products
		SET ${columnsString}
		WHERE id = ?`, [...values, Math.min(boxes.length, 20), vendorCatalogProductId]);
}

exports.updateProductReshippingDone = async (conn, rushSku, shipType, processingFee, reusePackaging, inOriginalBoxes, incorrectBoxDims) => {
	return conn.query(`
		UPDATE products
		SET ship_type = ?,
		    processing_fee = ?,
		    shippable = ?,
		    reuse_original_boxes = ?,
		    in_original_boxes = ?,
				incorrect_box_dims = ?,
		    local_shipping = 'Y',
		    step_reshipping_done = 'Y'
		WHERE sku = ?`,
		[shipType, processingFee, reusePackaging, reusePackaging, inOriginalBoxes, incorrectBoxDims, rushSku]);
}
