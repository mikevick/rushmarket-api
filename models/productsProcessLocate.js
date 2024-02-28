'use strict';

exports.updateProductLocateDone = async (conn, rushSku, locationNumber, partnerReceiptInspectionCubicInches, partnerReceiptInspectionFee) => {
	return conn.query(`
		UPDATE products
		SET
			step_build_locate_done = 'Y',
			location_number = ?,
			partner_receipt_inspection_cubic_inches = ?,
			partner_receipt_inspection_fee = ?
		WHERE sku = ?`, [locationNumber, partnerReceiptInspectionCubicInches, partnerReceiptInspectionFee, rushSku]);
}
