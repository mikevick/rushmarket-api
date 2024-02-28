'use strict'

const excel = require('exceljs');
const fs = require('fs').promises;

const globals = require('../globals');

const comms = require('../utils/comms');
const fileUtils = require('../utils/fileUtils')
const colUtils = require('../utils/columnUtils');



var getDefaultShippableSkus = async () => {
	var sql = `SELECT e.sku, p.price, p.product_display, p.can_be_disassembled, e.product_cost AS cost, s.city AS market, p.location_number AS location, c.front_end_space AS cat1, c.front_end_name AS cat2, 
	IF(o.number_of_boxes IS NULL, 0, o.number_of_boxes) AS over_box_count,
	o.package_height1 AS over_pkg_height1, o.package_width1 AS over_pkg_width1, o.package_length1 AS over_pkg_length1, o.shipping_weight1 AS over_weight_1,
	o.package_height2 AS over_pkg_height2, o.package_width2 AS over_pkg_width2, o.package_length2 AS over_pkg_length2, o.shipping_weight2 AS over_weight_2,
	o.package_height3 AS over_pkg_height3, o.package_width3 AS over_pkg_width3, o.package_length3 AS over_pkg_length3, o.shipping_weight3 AS over_weight_3,
	o.package_height4 AS over_pkg_height4, o.package_width4 AS over_pkg_width4, o.package_length4 AS over_pkg_length4, o.shipping_weight4 AS over_weight_4,
	o.package_height5 AS over_pkg_height5, o.package_width5 AS over_pkg_width5, o.package_length5 AS over_pkg_length5, o.shipping_weight5 AS over_weight_5,
	o.package_height6 AS over_pkg_height6, o.package_width6 AS over_pkg_width6, o.package_length6 AS over_pkg_length6, o.shipping_weight6 AS over_weight_6,
	m.vendor_id, p.seller_product_id AS vendor_sku
	FROM metro_sku_eligibility e 
		LEFT JOIN products p ON p.sku = e.sku
		LEFT JOIN manifests m ON m.manifest_id = p.manifest_id
		LEFT JOIN product_shipping_boxes o ON p.sku = o.sku
		LEFT JOIN stores s ON ((s.city_id = e.origin_city_id) AND (p.store_id = s.store_id))
		LEFT JOIN category_mappings cm ON ((cm.category_1 = p.category_1) AND (cm.category_2 = p.category_2))
		LEFT JOIN categories c ON cm.category_id = c.category_id
	WHERE origin_city_id = dest_city_id 
		AND ship_calc_status = 'MISSING_BOXES' 
		AND eligibility = 'SHIPPABLE'
		AND e.shippable = 'Y' 
		AND p.status = 'Live' 
		AND p.online_quick_sale = 'N'
		AND p.online_shopping = 'Y'
	ORDER BY vendor_sku`;

	var rows = await globals.pool.query(sql);
	colUtils.outboundNaming(rows);

	return rows;
}

var getDefaultShippableVC = async (vendorId, vendorSku, conn) => {
	var sql = `SELECT coin_id, p.vendor_sku, product_weight, product_height, product_width, product_depth, 
	IF(number_of_boxes IS NULL, 0, number_of_boxes) AS vc_box_count, 
	package_height1 AS vc_pkg_height1, package_width1 AS vc_pkg_width1, package_length1 AS vc_pkg_length1, shipping_weight1 AS vc_weight_1,
	package_height2 AS vc_pkg_height2, package_width2 AS vc_pkg_width2, package_length2 AS vc_pkg_length2, shipping_weight2 AS vc_weight_2,
	package_height3 AS vc_pkg_height3, package_width3 AS vc_pkg_width3, package_length3 AS vc_pkg_length3, shipping_weight3 AS vc_weight_3,
	package_height4 AS vc_pkg_height4, package_width4 AS vc_pkg_width4, package_length4 AS vc_pkg_length4, shipping_weight4 AS vc_weight_4,
	package_height5 AS vc_pkg_height5, package_width5 AS vc_pkg_width5, package_length5 AS vc_pkg_length5, shipping_weight5 AS vc_weight_5,
	package_height6 AS vc_pkg_height6, package_width6 AS vc_pkg_width6, package_length6 AS vc_pkg_length6, shipping_weight6 AS vc_weight_6
	FROM vendor_catalog_products p
		LEFT JOIN coins_to_vendor_skus c ON ((c.vendor_id = p.vendor_id) AND (c.vendor_sku = p.vendor_sku))
	WHERE p.vendor_id = ? AND p.vendor_sku = ?
`;

	// console.log(mysql.format(sql, [vendorId, vendorSku]));
	var rows = await conn.query(sql, [vendorId, vendorSku]);
	colUtils.outboundNaming(rows);

	return rows;
}


//
//	Build the feed
//
var buildDefaultShippable = async (resp) => {
	var ids = [];
	var skus = await getDefaultShippableSkus();
	var mainSheetInfo = await initMainSheet();
	var prodConn = await globals.productROPool.getConnection();

	try {

		for (var i = 0; i < skus.length; i++) {
			var vcp = await getDefaultShippableVC(skus[i].vendorId, skus[i].vendorSku, prodConn);
			if (vcp.length === 0) {
				console.log(`Couldn't find VC record for ${skus[i].sku} ${skus[i].vendorId} ${skus[i].vendorSku}`);
			}
			await writeMainSheet(mainSheetInfo, skus[i], vcp[0]);
		}

		await completeMainSheet(mainSheetInfo);

	} catch (e) {
		console.log(e);
	} finally {
		await globals.productROPool.releaseConnection(prodConn);
	}

	return resp;
}



var initMainSheet = async () => {
	var sheetInfo = {
		storageContext: fileUtils.getContext('CATALOG', 'UNIQUE'),
		exportOptions: {
			filename: 'sheets/default-shippable.xlsx',
			tsvFilename: 'sheets/default-shippable.txt',
			useStyles: true,
			useSharedStrings: true
		},
		exportWorkbook: null,
		exportWorksheet: null,
		recipients: 'matt@rushmarket.com',
		rowsProcessed: 0,
		row: 2,
		tsvFile: -1
	}

	sheetInfo.exportWorkbook = new excel.stream.xlsx.WorkbookWriter(sheetInfo.exportOptions);
	sheetInfo.exportWorksheet = sheetInfo.exportWorkbook.addWorksheet('No Boxes Shippable Y');

	var col = 1;

	sheetInfo.exportWorksheet.getCell(1, col++).value = 'coin';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'sku';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'price';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'cost';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'market';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'location';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'cat1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'cat2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'product_display';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'can_be_disassembled';

	sheetInfo.exportWorksheet.getCell(1, col++).value = 'product_height';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'product_width';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'product_depth';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'product_weight';

	sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_box_count';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_box_count';

	sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_height1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_width1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_length1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_weight1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_height2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_width2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_length2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_weight2';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_height3';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_width3';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_length3';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_weight3';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_height4';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_width4';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_length4';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_weight4';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_height5';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_width5';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_length5';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_weight5';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_height6';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_width6';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_pkg_length6';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'over_weight6';

	sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_height1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_width1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_length1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_weight1';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_height2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_width2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_length2';
	sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_weight2';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_height3';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_width3';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_length3';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_weight3';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_height4';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_width4';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_length4';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_weight4';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_height5';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_width5';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_length5';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_weight5';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_height6';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_width6';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_pkg_length6';
	// sheetInfo.exportWorksheet.getCell(1, col++).value = 'vc_weight6';


	await sheetInfo.exportWorksheet.getRow(1).commit();

	// sheetInfo.tsvFile = await fs.open(sheetInfo.exportOptions.tsvFilename, 'w');
	// await sheetInfo.tsvFile.write('id\titem_group_id\ttitle\tdescription\tprice\tcondition\tlink\tavailability\timage_link\tgoogle_product_category\tproduct_category\tbrand\tgtin\tmpn\tidentifier_exists\tcolor\tmaterial\tsize\tproduct_detail\tads_redirect\tproduct_highlight');


	return sheetInfo;
}




var writeMainSheet = async (sheetInfo, sku, vcp) => {
	var mpn = '';
	var tsvBuf = '\n';

	var col = 1;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.coinId : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.sku;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.price;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.cost;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.market;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.location;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.cat2;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.cat1;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.productDisplay;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.canBeDisassembled;

	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.productHeight : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.productWidth : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.productDepth : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.productWeight : '';

	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overBoxCount;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcBoxCount : 0;

	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgHeight1;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgWidth1;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgLength1;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overWeight1;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgHeight2;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgWidth2;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgLength2;
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overWeight2;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgHeight3;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgWidth3;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgLength3;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overWeight3;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgHeight4;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgWidth4;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgLength4;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overWeight4;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgHeight5;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgWidth5;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgLength5;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overWeight5;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgHeight6;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgWidth6;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overPkgLength6;
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = sku.overWeight6;

	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgHeight1 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgWidth1 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgLength1 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcWeight1 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgHeight2 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgWidth2 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgLength2 : '';
	sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcWeight2 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgHeight3 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgWidth3 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgLength3 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcWeight3 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgHeight4 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgWidth4 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgLength4 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcWeight4 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgHeight5 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgWidth5 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgength5 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcWeight5 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgHeight6 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgWidth6 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcPkgLength6 : '';
	// sheetInfo.exportWorksheet.getCell(sheetInfo.row, col++).value = vcp ? vcp.vcWeight6 : '';



	await sheetInfo.exportWorksheet.getRow(sheetInfo.row).commit();

	sheetInfo.row++;
}

var completeMainSheet = async (sheetInfo) => {

	await sheetInfo.exportWorkbook.commit();
	// await exportWorkbook.xlsx.writeFile('sheets/' + jobInfo.exportFile);

	var results = await fileUtils.storeMultipartFile(sheetInfo.storageContext, 'jeff-data', sheetInfo.exportOptions.filename, 'default-shippable.xlsx', false);

	if (results != undefined) {
		comms.sendEmail(sheetInfo.recipients, 'Jeff Data', '', `<br><br><b><a href="${results.url}">Default Shippable Skus</a>`, 'noreply@rushmarket.com', undefined, undefined);
		console.log("URL: " + results.url);
	}

	//	Remove the local exported products file.
	await fs.unlink(sheetInfo.exportOptions.filename);
}



module.exports = {
	buildDefaultShippable
}