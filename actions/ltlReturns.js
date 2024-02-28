'use strict'

const globals = require('../globals');
const logUtils = require('../utils/logUtils');
const { sendEmail } = require('../utils/comms');
const configUtils = require('../utils/configUtils');
const { objectToHTMLtable, objectToTextTable } = require('../utils/emailUtils');

const LtlReturnItems = require('../models/ltlReturnItems');
const LtlReturnLogs = require('../models/ltlReturnLogs');
const LtlReturns = require('../models/ltlReturns');
const Partners = require('../models/partners');
const Stores = require('../models/stores');
const Users = require('../models/users');
const Vendors = require('../models/vendors');
const VendorSkus = require('../models/vendorSkus');
const ZipToCities = require('../models/zipToCity');

exports.create = async (ltlReturn, requestPayload) => {
  //	Grab connection here so we can do all the following in the same transaction.
  const conn = await globals.productPool.getConnection()

  try {
    await conn.beginTransaction()
    const { customerZip, userId, userType, vendorId, ltlReturnItems } = ltlReturn

    const zipToCity = customerZip ? await ZipToCities.getByZipCode(customerZip) : null
    if (!zipToCity) {
      throw new Error(`Zip code [${customerZip}] is invalid`)
    }

    const destinationStoreId = zipToCity.nearestRrcStoreId
    const destinationStores = destinationStoreId && await Stores.getById(destinationStoreId)
    const destinationStore = destinationStores && destinationStores.length ? destinationStores[0] : null
    if (!destinationStore) {
      throw new Error(`Nearest RRC for zip code [${customerZip}] not found`)
    }

    const partner = await Partners.getByStoreId(destinationStoreId)
    const facilityLocalZip = partner ?
      await Partners.getFacilityLocalZip(customerZip, partner.facilityId, 'LTL') : undefined
    const localPickupPartner = facilityLocalZip && partner.pickupLtl ? partner : undefined

    const vendors = await Vendors.getById(vendorId)
    const vendor = vendors && vendors.length ? vendors[0] : null
    if (!vendor) {
      throw new Error("Vendor not found")
    }

    const ltlReturnId = await LtlReturns.create(conn, ltlReturn)

    const productInfoTemplates = [];
    for (let ltlReturnItem of ltlReturnItems) {
      const { vendorSku } = ltlReturnItem
      const vendorProducts = vendorId && vendorSku ? await VendorSkus.getByVendor(vendorId, vendorSku) : null
      const vendorProduct = vendorProducts && vendorProducts.length ? vendorProducts[0] : null
      if (!vendorProduct) {
        throw new Error(`Vendor SKU not found [${vendorSku}]`)
      }

      await LtlReturnItems.create(conn, { ...ltlReturnItem, ltlReturnId })

      productInfoTemplates.push({
        'SKU': vendorProduct.vendorSku,
        'Dimensions (L*W*H)': `${vendorProduct.packageLength1}*${vendorProduct.packageWidth1}*${vendorProduct.packageHeight1}`,
        'Weight': vendorProduct.shippingWeight1,
        'On Pallet': ltlReturnItem.onPallet || 'Not specified',
        'Condition': ltlReturnItem.condition,
      });
    }

    await LtlReturnLogs.create(conn, {
      json: JSON.stringify(requestPayload),
      ltlReturnId,
      status: 'New',
      userId,
      userType
    });

    const customerInfoTemplate = {
      'Name': `${ltlReturn.customerFirstName} ${ltlReturn.customerLastName}`,
      'Email': `${ltlReturn.customerEmail}`,
      'Phone': `${ltlReturn.customerPhone}`,
      'Address Line 1': `${ltlReturn.customerAddress1}`,
      'Address Line 2': `${ltlReturn.customerAddress2}`,
      'City': `${ltlReturn.customerCity}`,
      'State': `${ltlReturn.customerState}`,
      'Zip': `${ltlReturn.customerZip}`,
    };

    let url = `https://central.rushrecommerce.com/routing/ltl?rma=${encodeURIComponent(ltlReturn.rma)}&modal=true`;

    const email = {
      from: 'vendorsupport@rushrecommerce.com',
      to: configUtils.get('LTL_RETURN_PICK_UP_NOTIFICATION_EMAIL'),
      subject: 'New LTL Return Pickup Created',
      plainText: `\
${vendor.name} has created a new LTL Return Pick up request. Please create the estimate for their approval.

${url}

Closest return location:

Rush Recommerce
${destinationStore.address.address1}
${destinationStore.address.city}, ${destinationStore.address.state} ${destinationStore.address.zip}

Can a local partner be used? ${localPickupPartner ? `Yes - ${localPickupPartner.name}` : 'No'}

Customer Information
${objectToTextTable(customerInfoTemplate)}

Product Information
${productInfoTemplates.map(objectToTextTable).join('Product Information')}
  `,
      htmlText: `
<p>${vendor.name} has created a new LTL Return Pick up request. Please create the estimate for their approval.</p>
<p>${url}</p>
<p>Closest return location:</p>
<p>
  <b>Rush Recommerce</b>
  <br/>${destinationStore.address.address1}
  <br/>${destinationStore.address.city}, ${destinationStore.address.state} ${destinationStore.address.zip}
</p>
<p>Can a local partner be used? ${localPickupPartner ? `Yes - ${localPickupPartner.name}` : 'No'}</p>
<p>
  <b>Customer Information</b>
  ${objectToHTMLtable(customerInfoTemplate)}
  <b>Product Information</b>
  ${productInfoTemplates.map(objectToHTMLtable).join('<b>Product Information</b>')}
</p>
`
    }

    await sendEmail(email.to, email.subject, email.plainText, email.htmlText, email.from)

    await conn.commit()
  } catch (e) {
    await conn.rollback()
    await logUtils.logException(e)
    throw new Error(`Failed to create LTL Return: ${e.message}`)
  } finally {
    globals.productPool.releaseConnection(conn)
  }
}

exports.get = async (dateCreatedStart, dateCreatedEnd, options) => {
  const result = await LtlReturns.get(undefined, dateCreatedStart, dateCreatedEnd, options)
  return options.countOnly ? result : Promise.all(result.map(async ({ userId, ...row }) => ({
    ...row,
    userName: (await Users.getById(userId))?.[0]?.userName
  })))
}

exports.update = async (ltlReturn, vendor, requestReferer, requestPayload) => {
  //	Grab connection here so we can do all the following in the same transaction.
  const conn = await globals.productPool.getConnection()

  try {
    await conn.beginTransaction()
    const { id, status, userId, userType } = ltlReturn

    const { affectedRows } = await LtlReturns.update(conn, ltlReturn)
    const updated = affectedRows && await LtlReturns.getById(conn, id)
    if (!updated) {
      throw new Error('not found')
    }

    const email = {
      from: 'vendorsupport@rushrecommerce.com'
    }

    switch (status) {
      case 'Approved':
        email.to = configUtils.get('LTL_RETURN_PICK_UP_NOTIFICATION_EMAIL')
        email.subject = `Approved LTL Return Pickup - ${updated.rma}`
        email.plainText = `${vendor.name} has approved the LTL Return Pick up request. Please schedule the return pick up from the customer.`
        email.htmlText = `<p>${vendor.name} has approved the LTL Return Pick up request. Please schedule the return pick up from the customer.</p>`
        await sendEmail(email.to, email.subject, email.plainText, email.htmlText, email.from)
        break
      case 'Declined':
        email.to = configUtils.get('LTL_RETURN_PICK_UP_NOTIFICATION_EMAIL')
        email.subject = `Not Approved LTL Return Pickup - ${updated.rma}`
        email.plainText = `${vendor.name} has not approved the LTL Return Pick up request.`
        email.htmlText = `<p>${vendor.name} has not approved the LTL Return Pick up request.</p>`
        await sendEmail(email.to, email.subject, email.plainText, email.htmlText, email.from)
        break
      case 'Estimated':
        const showEstRecovery = vendor.rrcLtlReturnsShowEstRecovery === 'Y'
        email.to = vendor.ltlReturnsEmail
        email.subject = `LTL Return Pickup Estimated - ${updated.rma}`
        email.plainText = `Here is the estimated LTL Pick Up cost${showEstRecovery ? ' and the estimated recovery' : ''}. Please approve or disapprove of this\n\n` +
          `Estimated Cost: $${updated.estShipCost.toFixed(2)}\n` +
          (showEstRecovery ? `Estimated Recovery: $${updated.estRecovery.toFixed(2)}\n` : '') +
          `Approve/Not Approve: ${requestReferer}routing/ltl?id=${updated.id}`
        email.htmlText = `<p>Here is the estimated LTL Pick Up cost${showEstRecovery ? ' and the estimated recovery' : ''}. Please approve or disapprove of this</p>` +
          '<p>' +
          `<strong>Estimated Cost:</strong> $${updated.estShipCost.toFixed(2)}` +
          (showEstRecovery ? `<br /><strong>Estimated Recovery:</strong> $${updated.estRecovery.toFixed(2)}` : '') +
          `<br /><a href="${requestReferer}routing/ltl?id=${updated.id}">Approve/Not Approve</a>` +
          '</p>'
        await sendEmail(email.to, email.subject, email.plainText, email.htmlText, email.from)
        break
      case 'Scheduled':
        email.to = vendor.ltlReturnsEmail
        email.subject = `LTL Return Pickup Scheduled- ${updated.rma}`
        email.plainText = 'We have scheduled the LTL Pick Up for the customer.\n\n' +
          `Tracking #/BOL #: ${updated.trackingNumber}\n` +
          `Estimated Pick Up: ${updated.estDaysToPickup} days`
        email.htmlText = '<p>We have scheduled the LTL Pick Up for the customer.</p>' +
          '<p>' +
          `<strong>Tracking #/BOL #:</strong> ${updated.trackingNumber}` +
          `<br /><strong>Estimated Pick Up:</strong> ${updated.estDaysToPickup} days` +
          '</p>'
        await sendEmail(email.to, email.subject, email.plainText, email.htmlText, email.from)
        break
    }

    await LtlReturnLogs.create(conn, {
      json: JSON.stringify(requestPayload),
      ltlReturnId: id,
      status,
      userId,
      userType
    })

    await conn.commit()
  } catch (e) {
    await conn.rollback()
    await logUtils.logException(e)
    throw new Error(`Failed to update LTL Return: ${e.message}`)
  } finally {
    globals.productPool.releaseConnection(conn)
  }
}
