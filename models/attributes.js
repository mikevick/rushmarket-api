'use strict'

const globals = require('../globals')
const colUtils = require('../utils/columnUtils')

exports.getAll = async () => {
	
	var rows = await globals.productPool.query("SELECT DISTINCT(primary_material), 'Primary Material' AS att, primary_material AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE primary_material IS NOT NULL AND LENGTH(primary_material) > 0 " + 
																				"UNION " + 
																				"SELECT DISTINCT(secondary_material), 'Secondary Material' AS att, secondary_material AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE secondary_material IS NOT NULL AND LENGTH(secondary_material) > 0 " +
																				"UNION " + 
																				"SELECT DISTINCT(material_specific), 'Material Specific' AS att, material_specific AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE material_specific IS NOT NULL AND LENGTH(material_specific) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(primary_color), 'Primary Color' AS att, primary_color AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE primary_color IS NOT NULL AND LENGTH(primary_color) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(color_specific), 'Color Specific' AS att, color_specific AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE color_specific IS NOT NULL AND LENGTH(color_specific) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(product_size), 'Product Size' AS att, product_size AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE product_size IS NOT NULL AND LENGTH(product_size) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(style_tag1), 'Style' AS att, style_tag1 AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE style_tag1 IS NOT NULL AND LENGTH(style_tag1) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(style_tag2), 'Style' AS att, style_tag2 AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE style_tag2 IS NOT NULL AND LENGTH(style_tag2) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(CONCAT(attribute_name1, CONCAT('~~~', attribute_value1))), TRIM(attribute_name1) AS att, attribute_value1 AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE attribute_name1 IS NOT NULL AND attribute_value1 IS NOT NULL AND LENGTH(attribute_name1) > 0 AND LENGTH(attribute_value1) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(CONCAT(attribute_name2, CONCAT('~~~', attribute_value2))), TRIM(attribute_name2) AS att, attribute_value2 AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE attribute_name2 IS NOT NULL AND attribute_value2 IS NOT NULL AND LENGTH(attribute_name2) > 0 AND LENGTH(attribute_value2) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(CONCAT(attribute_name3, CONCAT('~~~', attribute_value3))), TRIM(attribute_name3) AS att, attribute_value3 AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE attribute_name3 IS NOT NULL AND attribute_value3 IS NOT NULL AND LENGTH(attribute_name3) > 0 AND LENGTH(attribute_value3) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(CONCAT(attribute_name4, CONCAT('~~~', attribute_value4))), TRIM(attribute_name4) AS att, attribute_value4 AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE attribute_name4 IS NOT NULL AND attribute_value4 IS NOT NULL AND LENGTH(attribute_name4) > 0 AND LENGTH(attribute_value4) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(CONCAT(attribute_name5, CONCAT('~~~', attribute_value5))), TRIM(attribute_name5) AS att, attribute_value5 AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE attribute_name5 IS NOT NULL AND attribute_value5 IS NOT NULL AND LENGTH(attribute_name5) > 0 AND LENGTH(attribute_value5) > 0 " +
																				"UNION " +
																				"SELECT DISTINCT(CONCAT(attribute_name6, CONCAT('~~~', attribute_value6))), TRIM(attribute_name6) AS att, attribute_value6 AS val " +
																					"FROM vendor_catalog_products " +
																					"WHERE attribute_name6 IS NOT NULL AND attribute_value6 IS NOT NULL AND LENGTH(attribute_name6) > 0 AND LENGTH(attribute_value6) > 0 " +
																				"ORDER BY att, val");

	colUtils.outboundNaming(rows);

  return rows;
}




exports.getCached = async () => {

	var rows = await globals.productPool.query("SELECT json FROM attribute_cache");

	return rows;
}



exports.updateCache = async (json) => {

	await globals.productPool.query("UPDATE attribute_cache SET date_modified = now(), json = ?", [JSON.stringify(json)]);
}
