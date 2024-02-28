'use strict'

const bcrypt = require('bcrypt'),
  SALT_WORK_FACTOR = 10

const globals = require('../globals')
const mysql = require('promise-mysql')
const colUtils = require('../utils/columnUtils')

//	Create Partner
exports.create = async body => {
  try {
    var conn = null
    var id = globals.mongoid.fetch()

    var values = [
      id,
      body.name,
      body.companyAddress1,
      body.companyAddress2,
      body.companyCity,
      body.companyStateOrProvince,
      body.companyCountry,
      body.companyPostalCode,
      body.adminName,
      body.email,
      body.password,
      body.websiteAddress,
      body.taxIdNumber,
      body.paymentTerms,
      body.apName,
      body.apEmail,
      body.apPhone,
      body.apAddress1,
      body.apAddress2,
      body.apCity,
      body.apStateOrProvince,
      body.apCountry,
      body.apPostalCode,
      body.csName,
      body.csEmail,
      body.csPhone,
      body.leadTime,
      body.shippingCutoffCst,
      body.notes,
      body.spFirstUnitFee,
      body.spAddlUnitFee,
      body.ltlFirstUnitFee,
      body.ltlAddlUnitFee,
      body.storageFeePerCubicFoot,
      body.handleLtl,
      body.handleSp,
      body.pickupLtl,
      body.pickupSp,
      body.allowCustomerPickup,
    ]

    conn = await globals.productPool.getConnection()
    await conn.beginTransaction()
    await conn.query(
      `INSERT INTO partners (id, 
			name, company_address1, company_address2, company_city, company_state_or_province, company_country, company_postal_code,
			admin_name, email, password,
			website_address, tax_id_number, payment_terms, 
			ap_name, ap_email, ap_phone, ap_address1, ap_address2, ap_city, ap_state_or_province, ap_country, ap_postal_code,
			cs_name, cs_email, cs_phone,
			lead_time, shipping_cutoff_cst, notes,
			sp_first_unit_fee, sp_addl_unit_fee, 
			ltl_first_unit_fee, ltl_addl_unit_fee, 
			storage_fee_per_cubic_foot, 
			handle_ltl, handle_sp, pickup_ltl, pickup_sp, 
			allow_customer_pickup
) 
			VALUES (?,  
			?, ?, ?, ?, ?, ?, ?,
			?, ?, ?, 
			?, ?, ?,  
			?, ?, ?, ?, ?, ?, ?, ?, ?,  
			?, ?, ?,  
			?, ?, ?,
			?, ?,
			?, ?,
			?, 
			?, ?, ?, ?,
			?)`,
      values
    )

    await conn.commit()
    return id
  } catch (e) {
    conn.rollback()
    throw e
  } finally {
    globals.productPool.releaseConnection(conn)
  }
}

exports.getActivePartners = async () => {
  var sql = `SELECT * FROM partners WHERE status = 'ACTIVE'`

  var vendors = await globals.productROPool.query(sql)

  colUtils.outboundNaming(vendors)

  return vendors
}

exports.getCorporateUsersByEmail = async email => {
    const partners = await globals.productPool.query(
        `SELECT * FROM rrc_corporate_users WHERE affiliated_with_type = 'PARTNER' AND email = ?`,
        [email]
    );
    colUtils.outboundNaming(partners);
    return partners;
}

exports.getById = async id => {
  var rows = await globals.productPool.query('SELECT * FROM partners WHERE id = ?', [id])

  colUtils.outboundNaming(rows)

  return rows
}

exports.getCorporateUserById = async (id) => {
  const query = `
  SELECT email, CONCAT(first_name, ' ', last_name) AS admin_name FROM rrc_corporate_users WHERE id = ?
  UNION
  SELECT email, admin_name FROM partners WHERE id = ?;`
  const params = [id, id];

  let rows = await globals.productPool.query(query, params)
  colUtils.outboundNaming(rows)
  return rows
};

exports.getByName = async name => {
  var rows = await globals.productPool.query('SELECT * FROM partners WHERE name = ?', [name])

  colUtils.outboundNaming(rows)
  return rows
}

exports.getCorporateUserByVerificationId = async vid => {
  var rows = await globals.productPool.query('SELECT * FROM rrc_corporate_users WHERE verification_id = ?', [vid])

  colUtils.outboundNaming(rows)
  return rows
}

exports.getByStoreId = async storeId => {
  return globals.productPool
    .query(
      `
		SELECT p.*, f.id as facility_id
		FROM partners p
		JOIN rrc_facilities f ON f.affiliated_with_id = p.id
		WHERE f.store_id = ? AND f.affiliated_with_type = 'PARTNER'
		LIMIT 1`,
      [storeId]
    )
    .then(rows => colUtils.outboundNaming(rows))
    .then(rows => rows?.[0])
}

exports.getAll = async (whereInfo, offset, limit, sortBy) => {
  var prom = []
  var resp = {
    totalCount: 0,
    partners: [],
  }

  if (sortBy === undefined) {
    sortBy = 'name ASC'
  }

  var count = await globals.productPool.query(
    `SELECT count(*) as num FROM partners p ${whereInfo.clause}`,
    whereInfo.values
  )
  resp.totalCount = count[0].num
  let sql = `SELECT p.* FROM partners p ${whereInfo.clause} ORDER BY ${sortBy} LIMIT ?, ?`
  whereInfo.values.push(offset)
  whereInfo.values.push(limit)

  // console.log(mysql.format(sql, whereInfo.values))
  var rows = await globals.productPool.query(sql, whereInfo.values)
  colUtils.outboundNaming(rows)

  resp.partners = rows

  return resp
}

exports.getPartnerSchema = async () => {
  var sql = `SELECT column_name, column_default, data_type, character_maximum_length, numeric_precision, numeric_scale, 
										datetime_precision, column_type FROM information_schema.columns WHERE table_schema = 'vendors' and table_name = 'partners' 
										ORDER BY ordinal_position`
  var rows = await globals.productPool.query(sql)

  colUtils.outboundNaming(rows)

  rows.forEach(row => {
    if (row.dataType === 'enum') {
      var values = row.columnType.substring(5, row.columnType.length - 1).replace(/'/g, '')
      row.enumValues = values.split(',')
    }
  })

  return rows
}

//	Update partner.
exports.updateById = async (id, body, internalFlag) => {
  try {
    var conn = await globals.productPool.getConnection()
    await conn.beginTransaction()

    var sql = 'UPDATE partners SET date_modified = now()'
    var values = []

    //
    //	The following are only updatable by INTERNAL users.
    //
    if (internalFlag === undefined || internalFlag === true) {
      sql = colUtils.columnUpdate(sql, values, body.name, 'name', false)
      sql = colUtils.columnUpdate(sql, values, body.notes, 'notes', true)

      //	Partner Setup
      sql = colUtils.columnUpdate(sql, values, body.spFirstUnitFee, 'sp_first_unit_fee', true)
      sql = colUtils.columnUpdate(sql, values, body.spAddlUnitFee, 'sp_addl_unit_fee', true)
      sql = colUtils.columnUpdate(sql, values, body.ltlFirstUnitFee, 'ltl_first_unit_fee', true)
      sql = colUtils.columnUpdate(sql, values, body.ltlAddlUnitFee, 'ltl_addl_unit_fee', true)
      sql = colUtils.columnUpdate(sql, values, body.storageFeePerCubicFoot, 'storage_fee_per_cubic_foot', true)
      sql = colUtils.columnUpdate(sql, values, body.paymentTerms, 'payment_terms', true)

      //	Admin
      sql = colUtils.columnUpdate(sql, values, body.status, 'status', false)
      sql = colUtils.columnUpdate(sql, values, body.rrcStatus, 'rrc_status', false)

      //
      sql = colUtils.columnUpdate(sql, values, body.leadTime, 'lead_time', true)
      sql = colUtils.columnUpdate(sql, values, body.shippingCutoffCst, 'shipping_cutoff_cst', false)
      sql = colUtils.columnUpdate(sql, values, body.handleLtl, 'handle_ltl', false)
      sql = colUtils.columnUpdate(sql, values, body.handleSp, 'handle_sp', false)
      sql = colUtils.columnUpdate(sql, values, body.pickupLtl, 'pickup_ltl', false)
      sql = colUtils.columnUpdate(sql, values, body.pickupSp, 'pickup_sp', false)
      sql = colUtils.columnUpdate(sql, values, body.allowCustomerPickup, 'allow_customer_pickup', false)
    }

    //
    //	The following are updateable by all users.
    //

    //	Company Info
    sql = colUtils.columnUpdate(sql, values, body.email, 'email', false)
    if (body.password !== undefined && body.password !== null) {
      var hash = bcrypt.hashSync(body.password, SALT_WORK_FACTOR)
      sql = sql + ', password = ?'
      values.push(hash)
    }
    sql = colUtils.columnUpdate(sql, values, body.taxIdNumber, 'tax_id_number', true)
    sql = colUtils.columnUpdate(sql, values, body.companyAddress1, 'company_address1', true)
    sql = colUtils.columnUpdate(sql, values, body.companyAddress2, 'company_address2', true)
    sql = colUtils.columnUpdate(sql, values, body.companyCity, 'company_city', true)
    sql = colUtils.columnUpdate(sql, values, body.companyStateOrProvince, 'company_state_or_province', true)
    sql = colUtils.columnUpdate(sql, values, body.companyPostalCode, 'company_postal_code', true)
    sql = colUtils.columnUpdate(sql, values, body.companyCountry, 'company_country', true)
    sql = colUtils.columnUpdate(sql, values, body.websiteAddress, 'website_address', true)

    sql = colUtils.columnUpdate(sql, values, body.passwordResetFlag, 'password_reset_flag', true)
    sql = colUtils.columnUpdate(sql, values, body.verificationId, 'verification_id', true)

    //	Contacts
    sql = colUtils.columnUpdate(sql, values, body.adminName, 'admin_name', true)
    sql = colUtils.columnUpdate(sql, values, body.apName, 'ap_name', true)
    sql = colUtils.columnUpdate(sql, values, body.apEmail, 'ap_email', true)
    sql = colUtils.columnUpdate(sql, values, body.apPhone, 'ap_phone', true)
    sql = colUtils.columnUpdate(sql, values, body.apAddress1, 'ap_address1', true)
    sql = colUtils.columnUpdate(sql, values, body.apAddress2, 'ap_address2', true)
    sql = colUtils.columnUpdate(sql, values, body.apCity, 'ap_city', true)
    sql = colUtils.columnUpdate(sql, values, body.apStateOrProvince, 'ap_state_or_province', true)
    sql = colUtils.columnUpdate(sql, values, body.apPostalCode, 'ap_postal_code', true)
    sql = colUtils.columnUpdate(sql, values, body.apCountry, 'ap_country', true)
    sql = colUtils.columnUpdate(sql, values, body.csName, 'cs_name', true)
    sql = colUtils.columnUpdate(sql, values, body.csEmail, 'cs_email', true)
    sql = colUtils.columnUpdate(sql, values, body.csPhone, 'cs_phone', true)

    values.push(id)
    sql = sql + ' WHERE id = ?'

    // console.log(mysql.format(sql, values));
    var result = await conn.query(sql, values)

    await conn.commit()

    return result
  } catch (e) {
    conn.rollback()
    throw e
  } finally {
    globals.productPool.releaseConnection(conn)
  }
}

exports.updateVerificationIdById = async (id, vid) => {
  var rows = await globals.productPool.query(
    'UPDATE rrc_corporate_users SET date_modified = now(), verification_id = ? WHERE id = ?',
    [vid, id]
  )
  return rows
}

exports.createFacility = async (withId, type, body) => {
  var id = globals.mongoid.fetch()
  var sql = `INSERT INTO rrc_facilities (id, affiliated_with_id, affiliated_with_type, name, address1, address2, city, state_or_province, postal_code, country, lat, lng, store_id)
								VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

  console.log(
    mysql.format(sql, [
      id,
      withId,
      type,
      body.name,
      body.address1,
      body.address2,
      body.city,
      body.stateOrProvince,
      body.postalCode,
      body.country,
      body.lat,
      body.lng,
      body.storeId,
    ])
  )
  var result = await globals.productPool.query(sql, [
    id,
    withId,
    type,
    body.name,
    body.address1,
    body.address2,
    body.city,
    body.stateOrProvince,
    body.postalCode,
    body.country,
    body.lat,
    body.lng,
    body.storeId,
  ])
  result.facilityId = id

  return id
}

exports.getAllFacilities = async (whereInfo, offset, limit, sortBy) => {
  var prom = []
  var resp = {
    totalCount: 0,
    facilities: [],
  }

  if (sortBy === undefined) {
    sortBy = 'name ASC'
  }

  var count = await globals.productPool.query(
    `SELECT count(*) as num FROM rrc_facilities p ${whereInfo.clause}`,
    whereInfo.values
  )
  resp.totalCount = count[0].num
  let sql = `SELECT p.* FROM rrc_facilities p ${whereInfo.clause} ORDER BY ${sortBy} LIMIT ?, ?`
  whereInfo.values.push(offset)
  whereInfo.values.push(limit)

  // console.log(mysql.format(sql, whereInfo.values))
  var rows = await globals.productPool.query(sql, whereInfo.values)
  colUtils.outboundNaming(rows)

  resp.facilities = rows

  return resp
}

exports.getAllFacilityStoreIdsByPartnerId = async partnerId => {
  let sql = `SELECT f.store_id FROM rrc_facilities f WHERE affiliated_with_id = ?`

  var rows = await globals.productPool.query(sql, [partnerId])
  colUtils.outboundNaming(rows)

  return rows
}

exports.getAllFacilityStoreIdsByPartnerUserId = async (partnerId, userId) => {
  let sql = `SELECT f.store_id FROM rrc_facilities f 
									LEFT JOIN rrc_facility_users u ON u.facility_id = f.id 
								WHERE affiliated_with_id = ? AND u.id = ?`

  var rows = await globals.productPool.query(sql, [partnerId, userId])
  colUtils.outboundNaming(rows)

  return rows
}

exports.getFacilityById = async id => {
  var rows = await globals.productPool.query('SELECT * FROM rrc_facilities WHERE id = ?', [id])

  colUtils.outboundNaming(rows)

  return rows
}

exports.getFacilityByUser = async userId => {
  const result = await globals.productPool.query(
    `
		SELECT f.*
		FROM rrc_facilities f
			LEFT JOIN rrc_facility_users u ON u.facility_id = f.id
		WHERE u.id = ?`,
    [userId]
  )
  colUtils.outboundNaming(result)
  return result && result.length ? result[0] : undefined
}

exports.getFacilityByStoreId = async storeId => {
  var rows = await globals.productPool.query('SELECT * FROM rrc_facilities WHERE store_id = ?', [storeId])

  colUtils.outboundNaming(rows)

  return rows
}

//	Update Partner Facility.
exports.updateFacilityById = async (id, body) => {
  try {
    var conn = await globals.productPool.getConnection()
    await conn.beginTransaction()

    var sql = 'UPDATE rrc_facilities SET date_modified = now()'
    var values = []

    sql = colUtils.columnUpdate(sql, values, body.name, 'name', false)
    sql = colUtils.columnUpdate(sql, values, body.address1, 'address1', true)
    sql = colUtils.columnUpdate(sql, values, body.address2, 'address2', true)
    sql = colUtils.columnUpdate(sql, values, body.city, 'city', true)
    sql = colUtils.columnUpdate(sql, values, body.stateOfProvince, 'stateOfProvince', true)
    sql = colUtils.columnUpdate(sql, values, body.postalCode, 'postalCode', true)
    sql = colUtils.columnUpdate(sql, values, body.country, 'country', true)
    sql = colUtils.columnUpdate(sql, values, body.lat, 'lat', true)
    sql = colUtils.columnUpdate(sql, values, body.lng, 'lng', true)
    sql = colUtils.columnUpdate(sql, values, body.storeId, 'storeId', true)

    values.push(id)
    sql = sql + ' WHERE id = ?'

    // console.log(mysql.format(sql, values));
    var result = await conn.query(sql, values)

    await conn.commit()

    return result
  } catch (e) {
    conn.rollback()
    throw e
  } finally {
    globals.productPool.releaseConnection(conn)
  }
}

exports.delFacilityById = async id => {
  var result = await globals.productPool.query('DELETE FROM rrc_facilities WHERE id = ?', [id])

  return result
}

exports.getByVerificationId = async verificationId => {
  var sql = `
SELECT affiliated_with_id AS partner_id, id, role, affiliated_with_type AS typ, NULL AS facility_id
	FROM rrc_corporate_users WHERE verification_id = ?
UNION
SELECT p.id AS partner_id, u.id, role, 'PARTNERUSER' AS typ, facility_id 
	FROM rrc_facility_users u
	LEFT JOIN rrc_facilities l ON l.id = u.facility_id
	LEFT JOIN partners p ON l.affiliated_with_id = p.id
	WHERE u.verification_id = ?
`

  var rows = await globals.productPool.query(sql, [verificationId, verificationId])
  colUtils.outboundNaming(rows)
  return rows
}

exports.getUserById = async id => {
  var sql = `SELECT * FROM rrc_facility_users WHERE id = ?`

  var rows = await globals.productPool.query(sql, [id])
  colUtils.outboundNaming(rows)
  return rows
}

exports.getUserByEmail = async email => {
  var sql = `SELECT p.id AS partner_id, u.*
							FROM rrc_facility_users u 
								LEFT JOIN rrc_facilities l ON l.id = u.facility_id
								LEFT JOIN partners p ON l.affiliated_with_id = p.id
							WHERE u.email = ?`

  var rows = await globals.productPool.query(sql, [email])
  colUtils.outboundNaming(rows)
  return rows
}

exports.createPartnerFacilityUser = async (partnerId, createdBy, facilityId, email, firstName, lastName, role) => {
  var id = globals.mongoid.fetch()
  var sql = `INSERT INTO rrc_facility_users (id, created_by, facility_id, email, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?, ?)`

  var result = await globals.productPool.query(sql, [id, createdBy, facilityId, email, firstName, lastName, role])
  result.userId = id
  return result
}

exports.updateUserVerificationIdById = async (id, vid) => {
  var result = await globals.productPool.query(
    'UPDATE rrc_facility_users SET date_modified = now(), verification_id = ? WHERE id = ?',
    [vid, id]
  )

  return result
}

//	Update partner user.
exports.updateUserById = async (id, body, internalFlag) => {
  try {
    var conn = await globals.productPool.getConnection()
    await conn.beginTransaction()

    var sql = 'UPDATE rrc_facility_users SET date_modified = now()'
    var values = []

    //
    //	The following are only updatable by INTERNAL users.
    //
    sql = colUtils.columnUpdate(sql, values, body.status, 'status', false)
    sql = colUtils.columnUpdate(sql, values, body.firstName, 'first_name', false)
    sql = colUtils.columnUpdate(sql, values, body.lastName, 'last_name', false)
    sql = colUtils.columnUpdate(sql, values, body.email, 'email', false)
    sql = colUtils.columnUpdate(sql, values, body.role, 'role', false)
    if (body.password !== undefined && body.password !== null) {
      var hash = bcrypt.hashSync(body.password, SALT_WORK_FACTOR)
      sql = sql + ', password = ?'
      values.push(hash)
    }

    sql = colUtils.columnUpdate(sql, values, body.passwordResetFlag, 'password_reset_flag', true)
    sql = colUtils.columnUpdate(sql, values, body.verificationId, 'verification_id', true)

    values.push(id)
    sql = sql + ' WHERE id = ?'

    // console.log(mysql.format(sql, values));
    var result = await conn.query(sql, values)

    await conn.commit()

    return result
  } catch (e) {
    conn.rollback()
    throw e
  } finally {
    globals.productPool.releaseConnection(conn)
  }
}

//	Update corporate user.
exports.updateCorporateUserById = async (id, body) => {
    try {
        var conn = await globals.productPool.getConnection();
        await conn.beginTransaction();

        var sql = 'UPDATE rrc_corporate_users SET date_modified = now()';
        var values = [];

        // TODO: can we update affiliated_with_id and affiliated_with_type?
        sql = colUtils.columnUpdate(sql, values, body.status, 'status', false);
        sql = colUtils.columnUpdate(sql, values, body.firstName, 'first_name', false);
        sql = colUtils.columnUpdate(sql, values, body.lastName, 'last_name', false);
        sql = colUtils.columnUpdate(sql, values, body.email, 'email', false);
        sql = colUtils.columnUpdate(sql, values, body.role, 'role', false);
        sql = colUtils.columnUpdate(sql, values, body.verificationId, 'verification_id', true);

        if (body.password !== undefined && body.password !== null) {
            const hash = bcrypt.hashSync(body.password, SALT_WORK_FACTOR);
            sql = colUtils.columnUpdate(sql, values, hash, 'password', false);
        }
        sql = colUtils.columnUpdate(sql, values, body.passwordResetFlag, 'password_reset_flag', false);


        values.push(id);
        sql = sql + ' WHERE id = ?';

        // console.log(mysql.format(sql, values));
        var result = await conn.query(sql, values);

        await conn.commit();

        return result;
    } catch (e) {
        conn.rollback();
        throw e;
    } finally {
        globals.productPool.releaseConnection(conn);
    }
}

exports.getAllUsers = async (whereInfo, offset, limit, sortBy) => {
  var prom = []
  var resp = {
    totalCount: 0,
    users: [],
  }

  if (sortBy === undefined) {
    sortBy = 'name ASC'
  }

  var count = await globals.productPool.query(
    `SELECT count(*) as num FROM rrc_facility_users ${whereInfo.clause}`,
    whereInfo.values
  )
  resp.totalCount = count[0].num
  let sql = `SELECT * FROM rrc_facility_users ${whereInfo.clause} ORDER BY ${sortBy} LIMIT ?, ?`
  whereInfo.values.push(offset)
  whereInfo.values.push(limit)

  // console.log(mysql.format(sql, whereInfo.values))
  var rows = await globals.productPool.query(sql, whereInfo.values)
  colUtils.outboundNaming(rows)

  resp.users = rows

  return resp
}

exports.delUserById = async id => {
  var result = await globals.productPool.query('DELETE FROM rrc_facility_users WHERE id = ?', [id])

  return result
}

exports.getFacilityLocalZip = async (destZip, facilityId, shipType) => {
  return globals.productROPool
    .query(
      `
		SELECT flz.*
		FROM vendors.rrc_facility_local_zips flz
		WHERE
		    flz.zip = ?
		    AND flz.facility_id = ?
				AND flz.ship_type = ?
		LIMIT 1`,
      [destZip, facilityId, shipType]
    )
    .then(rows => colUtils.outboundNaming(rows))
    .then(rows => rows?.[0])
}

//  Product checked in during month and not sold in this month
exports.getCheckedInThisMonthNotSold = async (dateStart, dateEnd) => {
  let sql = `SELECT pal.sku, p.store_id, pal.date_created AS date_located, pal.action, 
                oll.date_created AS date_purchased, oll.type, p.status, m.vendor_id, p.seller_product_id
							FROM products p
								LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
								LEFT JOIN stores s ON p.store_id = s.store_id
                LEFT JOIN product_action_log pal ON pal.id = (
                  SELECT id
                    FROM product_action_log
                    WHERE ACTION = 'BUILD_LOCATE'
                      AND sku = p.sku
                    ORDER BY id ASC
                    LIMIT 1
                  )
                LEFT JOIN order_line_static ols ON ((p.sku = ols.sku) AND (ols.status = 'Ship'))
                LEFT JOIN order_line_log oll ON ols.id = oll.order_line_static_id
              WHERE pal.action = 'BUILD_LOCATE'
                AND pal.date_created >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}' 
                AND pal.date_created <= '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
                AND ((oll.date_created IS NULL) OR ((oll.date_created > '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}') AND (oll.type = 'FULFILLED')))
                AND s.partner_facility = 'Y'
              GROUP BY pal.sku
              ORDER BY pal.date_created, sku`

  // console.log(mysql.format(sql, [dateStart, dateEnd]));
  let rows = await globals.poolRO.query(sql, [dateStart, dateEnd])
  colUtils.outboundNaming(rows)

  return rows
}

//  Product checked in during prior month and not sold in this month
exports.getCheckedInPriorMonthNotSold = async (dateStart, dateEnd) => {
  let sql = `SELECT pal.sku, p.store_id, pal.date_created AS date_located, pal.action, 
                oll.date_created AS date_purchased, oll.type, p.status, m.vendor_id, p.seller_product_id
              FROM products p
		            LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
		            LEFT JOIN stores s ON p.store_id = s.store_id
                LEFT JOIN product_action_log pal ON pal.id = (
                  SELECT id
                  FROM product_action_log
                  WHERE ACTION = 'BUILD_LOCATE'
                    AND sku = p.sku
                  ORDER BY id ASC
                  LIMIT 1
                )                
                LEFT JOIN order_line_static ols ON((p.sku = ols.sku) AND (ols.status = 'Ship'))
                LEFT JOIN order_line_items oli ON oli.source_line_id = ols.source_line_id
                LEFT JOIN orders o ON o.order_id = oli.order_id
                LEFT JOIN order_line_log oll ON ols.id = oll.order_line_static_id
		          WHERE pal.action = 'BUILD_LOCATE'
                AND pal.date_created <= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}' 
                AND s.partner_facility = 'Y'
                AND ((oll.date_created IS NULL) OR ((oll.date_created > '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}') AND (oll.type = 'FULFILLED')))
		          GROUP BY pal.sku
		          ORDER BY pal.date_created, sku`;
  
  // console.log(mysql.format(sql, [dateStart]));
  let rows = await globals.poolRO.query(sql, [dateStart])
  colUtils.outboundNaming(rows)

  return rows
}

/*  Product checked in during month and sold during month */
exports.getCheckedInThisMonthSold = async (dateStart, dateEnd) => {

  let sql = `SELECT pal.sku, p.store_id, pal.date_created AS date_located, pal.action, oll.date_created AS date_purchased, o.source_order_name, p.status, p.store_id, m.vendor_id, p.seller_product_id
                FROM products p
                  LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
                  LEFT JOIN stores s ON p.store_id = s.store_id
                  LEFT JOIN product_action_log pal ON pal.id = (
                    SELECT id
                      FROM product_action_log
                      WHERE ACTION = 'BUILD_LOCATE'
                        AND sku = p.sku
                      ORDER BY id ASC
                      LIMIT 1
                  )
                  LEFT JOIN order_line_static ols ON ((p.sku = ols.sku) AND (ols.status = 'Ship'))
									LEFT JOIN order_line_items oli ON oli.source_line_id = ols.source_line_id
									LEFT JOIN orders o ON o.order_id = oli.order_id
									LEFT JOIN order_line_log oll ON ols.id = oll.order_line_static_id
                WHERE pal.action = 'BUILD_LOCATE'
                  AND pal.date_created >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}' 
                  AND pal.date_created <= '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
                  AND oll.date_created >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}' 
                  AND oll.date_created <= '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
									AND oll.type = 'FULFILLED'
                  AND s.partner_facility = 'Y'
                  GROUP BY pal.sku
                  ORDER BY pal.date_created, sku`

  // console.log(mysql.format(sql, [dateStart, dateEnd, dateStart, dateEnd]));
  let rows = await globals.poolRO.query(sql, [dateStart, dateEnd, dateStart, dateEnd])
  colUtils.outboundNaming(rows)

  return rows
}

/*  Product checked in during prior month and sold during month */
exports.getCheckedInPriorMonthSold = async (dateStart, dateEnd) => {
  let sql = `SELECT pal.sku, p.store_id, pal.date_created AS date_located, pal.action, 
                  oll.date_created AS date_purchased, o.source_order_name, p.status, p.store_id, m.vendor_id, p.seller_product_id
              FROM products p
                LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
                LEFT JOIN stores s ON p.store_id = s.store_id
                LEFT JOIN product_action_log pal ON pal.id = (
                  SELECT id
                    FROM product_action_log
                    WHERE ACTION = 'BUILD_LOCATE'
                      AND sku = p.sku
                    ORDER BY id ASC
                    LIMIT 1
                )
                LEFT JOIN order_line_static ols ON ((p.sku = ols.sku) AND (ols.status = 'Ship'))
                LEFT JOIN order_line_items oli ON oli.source_line_id = ols.source_line_id
                LEFT JOIN orders o ON o.order_id = oli.order_id
                LEFT JOIN order_line_log oll ON ols.id = oll.order_line_static_id
              WHERE pal.action = 'BUILD_LOCATE'
                AND pal.date_created < '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}'
                AND oll.date_created >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}' 
                AND oll.date_created <= '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
                AND oll.type = 'FULFILLED'
                AND s.partner_facility = 'Y'
              GROUP BY pal.sku
              ORDER BY pal.date_created, sku`;

  // console.log(mysql.format(sql, [dateStart, dateStart, dateEnd]));
  let rows = await globals.poolRO.query(sql, [dateStart, dateStart, dateEnd])
  colUtils.outboundNaming(rows)

  return rows
}

exports.loadStorageFeeInfo = async () => {
  let sql = `SELECT p.id as partner_id, p.name, f.id as facility_id, f.name, f.store_id, f.storage_fee_per_cubic_foot
								FROM partners p
									LEFT JOIN rrc_facilities f ON f.affiliated_with_id = p.id
								ORDER BY p.name`

  let rows = await globals.productROPool.query(sql)
  colUtils.outboundNaming(rows)

  return rows
}

exports.captureStorageFee = async (monthBeginning, sku, storeId, storageFee, cubicFeet, daysInStorage) => {
  let sql = `INSERT IGNORE INTO partner_storage_fees (month_beginning, sku, store_id, storage_fee, cubic_feet, days_in_storage) VALUES (?, ?, ?, ?, ?, ?)`

  let result = null

  result = await globals.pool.query(sql, [monthBeginning, sku, storeId, storageFee, cubicFeet, daysInStorage])

  return result
}

exports.getEDDInputs = async storeId => {
  let sql = `SELECT p.id AS partner_id, p.shipping_cutoff_cst, p.lead_time, 
									f.id AS facility_id, f.name, f.address1, f.address2, f.city, f.state_or_province, f.postal_code, f.ltl_transit_days, f.sp_transit_days,
									f.sp_delivery_days_min, f.sp_delivery_days_max, f.sp_edd_text, f.ltl_delivery_days_min, f.ltl_delivery_days_max, f.ltl_edd_text
								FROM rrc_facilities f 
									LEFT JOIN partners p ON f.affiliated_with_id = p.id
								WHERE store_id = ?`

  let rows = await globals.productROPool.query(sql, [storeId])
  colUtils.outboundNaming(rows)

  return rows
}

exports.zipCheck = async (storeId, shipType, zip) => {
  let sql = `SELECT z.id 
							FROM rrc_facility_local_zips z 
								LEFT JOIN rrc_facilities f ON f.id = z.facility_id
								LEFT JOIN partners p ON p.id = f.affiliated_with_id
							WHERE f.store_id = ? AND z.zip = ? AND z.ship_type = 'Small Parcel' AND p.handle_sp = 1`

  if (shipType === 'LTL') {
    sql = `SELECT z.id 
		FROM rrc_facility_local_zips z 
			LEFT JOIN rrc_facilities f ON f.id = z.facility_id
			LEFT JOIN partners p ON p.id = f.affiliated_with_id
		WHERE f.store_id = ? AND z.zip = ? AND z.ship_type = 'LTL' AND p.handle_ltl = 1`
  }

  // console.log(mysql.format(sql, [storeId, zip, shipType]))
  let rows = await globals.productROPool.query(sql, [storeId, zip, shipType])
  colUtils.outboundNaming(rows)

  return rows
}


exports.getLocalShipCost = async (sku, shipType, zip) => {
  let sql = `SELECT lc.id AS carrier_id, lc.name, local_carrier_type, cz.zip, cz.extended_flag, lc.transit_days, 
                  lc.small_parcel_rule, lc.small_parcel_base_rate, lc.small_parcel_base_rate_max, lc.small_parcel_extended_rate, lc.small_parcel_extended_rate_max, 
                  lc.ltl_rule, lc.ltl_base_rate, lc.ltl_extended_rate
                FROM products p 
                  LEFT JOIN stores s ON s.store_id = p.store_id 
                  LEFT JOIN local_carrier_to_city lcc ON s.city_id = lcc.targeted_city_id
                  LEFT JOIN local_carriers lc ON lcc.local_carrier_id = lc.id
                  LEFT JOIN local_carrier_zips cz ON cz.local_carrier_id = lc.id 
                WHERE sku = ?
                  AND cz.ship_type = ?
                  and cz.zip = ?
                  AND s.partner_facility = 'Y' 
                  AND local_carrier_type = 'PARTNER' `;
  
  let rows = await globals.poolRO.query(sql, [sku, shipType, zip]);
  colUtils.outboundNaming(rows);

  return rows;
}


exports.loadHolidays = async partnerId => {
  var holidays = []

  try {
    var h = await globals.productROPool.query('SELECT day, label FROM partner_holidays WHERE partner_id = ?', [
      partnerId,
    ])
  } catch (e) {
    console.log(e)
  }

  for (var i = 0; i < h.length; i++) {
    holidays.push({
      day: h[i].day,
      label: h[i].label,
    })
  }

  return holidays
}



//  When processing November, I want to look at partner skus that first showed up in the product_location_log before Dec 1 AND that are either not sold or were sold on or after Nov 1.
exports.getCandidateSkusForStorageFees = async (dateStart, dateEnd) => {
  let sql = `SELECT pll.sku, p.store_id, pll.date_created AS date_located, 
                ols.id, oll.order_line_static_id, ols.status, oll.date_created AS date_purchased, oll.type, p.status, m.vendor_id, p.seller_product_id,
                pal.date_created AS date_trashed, pal.action
              FROM products p
                LEFT JOIN manifests m ON p.manifest_id = m.manifest_id
                LEFT JOIN stores s ON p.store_id = s.store_id
                LEFT JOIN order_line_static ols ON ((p.sku = ols.sku) AND (ols.status = 'Ship'))
                LEFT JOIN order_line_items oli ON oli.source_line_id = ols.source_line_id
                LEFT JOIN orders o ON o.order_id = oli.order_id
                LEFT JOIN order_line_log oll ON ols.id = oll.order_line_static_id 
                LEFT JOIN product_location_log pll ON pll.location_log_id = (
                    SELECT location_log_id
                      FROM product_location_log
                      WHERE sku = p.sku
                      ORDER BY location_log_id ASC
                      LIMIT 1
                )
                LEFT JOIN product_action_log pal ON pal.id = (
                    SELECT id
			                FROM product_action_log
			                WHERE ACTION = 'TRASHED'
			                  AND sku = p.sku
			                ORDER BY id ASC
			                LIMIT 1
                )                
              WHERE pll.date_created <= '${dateEnd.substring(0, 10)} ${dateEnd.substring(11, 19)}'
                AND ((pal.date_created IS NULL) OR (pal.date_created >= '2022-10-01-05:59'))
                AND s.partner_facility = 'Y'
                AND ((oll.date_created IS NULL) OR ((oll.date_created >= '${dateStart.substring(0, 10)} ${dateStart.substring(11, 19)}') AND (oll.type = 'FULFILLED')))
              GROUP BY pll.sku
              ORDER BY pll.date_created, sku`;
  
  // console.log(mysql.format(sql, [dateStart]));
  let rows = await globals.poolRO.query(sql, [dateStart])
  colUtils.outboundNaming(rows)

  return rows
}


exports.getProductLogHistory = async (sku) => {
  let sql = `SELECT sku, store_id_from, location_from, store_id_to, location_to, date_created, sa.pay_storage_fees
	            FROM product_location_log pll
		            LEFT JOIN storage_locations sl ON (pll.store_id_to = sl.store_id AND pll.location_to = sl.location_number)
		            LEFT JOIN storage_areas sa ON (sa.store_id = sl.store_id AND sa.storage_area = sl.storage_area)
	            WHERE sku = ${sku}
		            AND pay_storage_fees IS NOT NULL
              ORDER BY date_created`;
  
  // console.log(mysql.format(sql, [sku]));
  let rows = await globals.poolRO.query(sql)
  colUtils.outboundNaming(rows)

  return rows
}
