exports.clear = async (conn, rushSku) => {
  return conn.query(`DELETE FROM product_quick_sales WHERE sku = ?`, [rushSku])
}

exports.create = async (conn, productQuickSale) => {
  const { sku, color, material, size, dimensions, weight, bullets, createdBy, createdByType } = productQuickSale
  return conn.query(`
	  INSERT INTO product_quick_sales
	      (sku, color, material, size, dimensions, weight, bullets, created_by, created_by_type, date_created)
	  VALUES
	      (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, [sku, color, material, size, dimensions, weight, bullets, createdBy, createdByType])
}
