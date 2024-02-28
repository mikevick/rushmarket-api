"use strict";

const _ = require("lodash");
const PdfPrinter = require("pdfmake");

const CarrierSelection = require("../actions/carrierSelection");

const fonts = require("../doc-definitions/fonts");
const {
  getMultiOrderPdfDocDefinition,
} = require("../doc-definitions/multiOrderDetails");
const {
  getSingleOrderPdfDocDefinition,
} = require("../doc-definitions/singleOrderDetails");

const globals = require("../globals");

const partnerActions = require("../actions/partners");

const Members = require("../models/members");
const Partners = require("../models/partners");
const Products = require("../models/products");
const Users = require("../models/users");
const { getVendorById } = require("../models/productsProcessCondition");
const RushProducts = require("../models/rushProducts");
const RushOrders = require("../models/rushOrders");

const { sendEmail } = require("../utils/comms");
const configUtils = require("../utils/configUtils");
const fedexUtils = require("../utils/fedexUtils");
const logUtils = require("../utils/logUtils");
const memberText = require("../utils/memberTextUtils");
const { formatResp } = require("../utils/response");
const sellbriteUtils = require("../utils/sellbriteUtils");
const shopifyUtils = require("../utils/shopifyUtils");

exports.getOrders = async (productStoreId, options) => {
  return RushOrders.getOrders(productStoreId, options);
};

exports.getOrdersPdf = async (
  orderIds,
  productStoreId,
  forceMultiOrderFormat = false
) => {
  const printer = new PdfPrinter(fonts);

  const orders = await Promise.all(orderIds.map(orderId => getOrder(orderId, productStoreId)));
  const notFound = orders.reduce((result, order) => result || !order, false);
  if (notFound) {
    return;
  }

  const docDefinition =
    orders.length === 1 && !forceMultiOrderFormat
      ? await getSingleOrderPdfDocDefinition(orders[0])
      : await getMultiOrderPdfDocDefinition(orders);

  return {
    cleanUp: docDefinition.cleanUp,
    doc: printer.createPdfKitDocument(docDefinition, {}),
  };
};

const getOrder = (exports.getOrder = async (
  sourceOrderName,
  productStoreId,
  internalFlag
) => {
  const order = await RushOrders.getOrder(sourceOrderName, productStoreId);
  if (!order) {
    return;
  }

  const member =
    order.customerEmail &&
    (await Members.getMemberByEmail(order.customerEmail));

  const orderDisabled =
    (order.riskLevel === "High" || order.riskLevel === "Medium") &&
    (order.riskStatus === "NEW" || order.riskStatus === "CANCEL");

  const orderId = order.orderId;
  const rawLineItems = await RushOrders.getOrderLineItems(
    productStoreId,
    {
      sourceOrderName,
    },
    internalFlag
  );

  if (!rawLineItems.length) {
    return null;
  }

  const skus = rawLineItems
    .filter((lineItem) => !lineItem.fulfillmentMethod || lineItem.fulfillmentMethod.toLowerCase() === "delivery")
    .map((lineItem) => lineItem.sku)
    .filter((sku) => sku);
  const carrier =
    order.sourceName !== "marketplace" &&
    skus.length &&
    order.zip &&
    (await CarrierSelection.isRrcOrderLocalDelivery(
      productStoreId,
      order.zip,
      skus
    ))
      ? "Local"
      : "National";

  const lineItems = await Promise.all(
    rawLineItems.map(async (lineItem) => {
      // if there is a Vendor Catalog record, let's use that data because it should be more accurate
      const vendorCatalogProduct =
        lineItem.vendorId &&
        lineItem.sellerProductId &&
        (await Products.getVendorCatalogProduct(
          lineItem.vendorId,
          lineItem.sellerProductId
        ));
      if (vendorCatalogProduct) {
        // use the image from VC if we have one
        if (lineItem.onlineQuickSale === "N") {
          const imageUrl = [
            "mainImageKnockout",
            "mainImageLifestyle",
            "altImage3",
            "altImage4",
            "altImage5",
          ].reduce(
            (result, column) =>
              result || vendorCatalogProduct[column] || undefined,
            null
          );
          if (imageUrl) {
            lineItem.image = imageUrl;
          }
        }

        // get a ship type if it is empty
        if (!lineItem.shipType) {
          lineItem.shipType = vendorCatalogProduct.shipType;
        }

        // get the original or adjusted box dimensions for all valid boxes and create array of boxes
        if (lineItem.GDEBoxDimensions) {
          // deserialize GDE box dimensions
          lineItem.GDEBoxDimensions = JSON.parse(
            lineItem.GDEBoxDimensions
          ).boxes;
          lineItem.adjustedBoxDims = true;
          lineItem.boxes = lineItem.GDEBoxDimensions.reduce((boxes, boxDim) => {
            if (!boxDim.length || !boxDim.height || !boxDim.width) {
              return boxes;
            }

            // sort the dimensions lowest to highest and assign to height/width/length in that order
            const [height, width, length] = [
              boxDim.length,
              boxDim.height,
              boxDim.width,
            ].sort();
            boxes.push({
              packageHeight: height,
              packageWidth: width,
              packageLength: length,
            });
            return boxes;
          }, []);
          lineItem.numberOfBoxes = lineItem.boxes.length;
        }
      }

      // set ship type to small parcel if it is still empty
      if (!lineItem.shipType) {
        lineItem.shipType = "Small Parcel";
      }

      // default the number of boxes to 0 if still empty
      if (!lineItem.numberOfBoxes) {
        lineItem.numberOfBoxes = 0;
      }

      // if the item is not in the market you are viewing, disable the line
      // must have a valid SKU to disable it
      lineItem._disabled =
        orderDisabled ||
        (productStoreId !== lineItem.productStoreId &&
          typeof lineItem.sku === "number" &&
          lineItem.sku.toString().length === 7) ||
        ["STS", "DS"].includes(lineItem.manifestSource);

      // show data for transferred items
      lineItem._showTransferredItemData =
        productStoreId === lineItem.memberStoreId &&
        lineItem.orderLineStatus?.toLowerCase() === "transferred";

      return {
        ...lineItem,
        carrier:
          !lineItem.fulfillmentMethod ||
          lineItem.fulfillmentMethod === "Delivery"
            ? carrier
            : "",
        riskLevel: order.riskLevel,
      };
    })
  );

  // set LTL shipping flag and save store name in LTLShippingProductLocations array
  const { ltlShipping, ltlProductLocations } = lineItems.reduce(
    (result, lineItem) => {
      result.ltlShipping = result.ltlShipping || lineItem.shipType === "LTL";
      result.ltlProductLocations.push(lineItem.productStoreName?.toLowerCase());
      return result;
    },
    {
      ltlShipping: false,
      ltlProductLocations: [],
    }
  );

  if (ltlShipping) {
    lineItems.forEach((lineItem) => {
      // if line item is a national delivery, ship type is not LTL, order_line_static_id has a value
      // and the store name is the same as another LTL line item set ship type to LTL as well
      if (
        lineItem.fulfillmentMethod === "Delivery" &&
        lineItem.carrier === "National" &&
        lineItem.shipType !== "LTL" &&
        lineItem.orderLineStaticId &&
        ltlProductLocations.includes(lineItem.productStoreName?.toLowerCase())
      ) {
        updateOrderLineStatic(
          lineItem.orderLineStaticId,
          98,
          "INTERNAL",
          "LTL"
        );
        lineItem.shipType = "LTL";
      }
    });
  }

  if (!order.platformChannel) {
    order.platformChannel = "Rush Market";
  } else if (
    order.platformChannel.toLowerCase().includes(".rushrecommerce.com")
  ) {
    // set hosted site name from vendor config if we have one
    const vendorId = lineItems?.length && lineItems[0].vendorId?.trim();
    if (vendorId) {
      const vendor = await getVendorById(undefined, vendorId);
      if (vendor.partnerOutletName) {
        order.platformChannel = vendor.partnerOutletName;
      }
    }
  }

  return {
    carrier,
    lineItems,
    ltlShipping,
    member: {
      homeCity: member?.homeCity,
    },
    order: {
      ...order,
      _disabled: orderDisabled,
    },
  };
});

const updateOrderLineStatic = async (
  orderLineStaticId,
  userId,
  userType,
  shipType
) => {
  const existing = await RushOrders.getOrderLineStatic(orderLineStaticId);
  if (!existing || existing.shipType === shipType) {
    return;
  }

  await RushOrders.updateOrderLineStatic(undefined, orderLineStaticId, {
    shipType,
  });
  await RushOrders.createOrderLineChangeLog(
    undefined,
    orderLineStaticId,
    "SHIP_TYPE",
    existing.shipType,
    shipType,
    userId,
    userType
  );
};

exports.updateOrderLineItems = async (sourceOrderName, data, userDetails) => {
  const lineItems = await RushOrders.getOrderLineItems(
    userDetails.productStoreId,
    {
      sourceOrderName,
    }
  );
  return Promise.all(
    lineItems.map((item) =>
      updateOrderLineItem(item.sourceLineId, item.sku, data, userDetails)
    )
  ).then((results) =>
    results.reduce((allUpdated, result) => allUpdated && result, true)
  );
};

const updateOrderLineItem = exports.updateOrderLineItem = async (
  sourceLineId,
  rushSku,
  data,
  { partnerName, productStoreId, userEmail, userId, userType },
  resp
) => {
  const existing = await RushOrders.getOrderLineItemBySource(sourceLineId, rushSku)
  if (!existing) {
    throw new Error(`Order line item with source line id [${sourceLineId}] and rush sku [${rushSku}] not found.`)
  }

  //	Grab connection here so we can do all the following in the same transaction.
  const conn = await globals.pool.getConnection();

  try {
    await conn.beginTransaction();

    //	Add order line change log entry
    const lineStaticUpdate = {};
    if (typeof data.status !== "undefined" && (data.status !== existing.orderLineStatus || data.status === "Ship")) {
      async function updateStatus() {
        lineStaticUpdate.status = data.status;
        await RushOrders.createOrderLineChangeLog(
          conn,
          existing.orderLineStaticId,
          "STATUS",
          existing.orderLineStatus,
          data.status,
          userId,
          userType
        );
      }

      switch (data.status) {
        case null:
          await updateStatus();
          break;
        case "Printed":
          if (
            existing.orderLineStatus &&
            existing.orderLineStatus !== "Issue" &&
            existing.orderLineStatus !== "Resolved"
          ) {
            break;
          }
          await updateStatus();
          break;
        case "Resolved":
          lineStaticUpdate.resolutionReason = data.resolutionReason;
          lineStaticUpdate.resolutionNotes = data.resolutionNotes;
          await updateStatus();

          if (data.resolutionReason === "keep_the_product") {
            data.status = "Printed";
            existing.orderLineStatus = "Resolved";
            await updateStatus();
          }

          await notifyIssueReporter(
            conn,
            existing.orderLineStaticId,
            existing.sku,
            data.resolutionReason,
            data.resolutionNotes
          );
          break;
        case "Issue":
          if (!data.issueReason) {
            throw new Error("issueReason required to update status to [Issue]");
          }
          lineStaticUpdate.issueReason = data.issueReason;

          if (data.issueReason === "Other" && !data.notes) {
            throw new Error("notes required to update status to [Issue]");
          }
          lineStaticUpdate.notes = data.notes;

          const email = {
            from: "service@rushmarket.com",
            to: configUtils.get("PARTNER_ITEM_ISSUE_EMAILS"),
            subject: "Item has a Fulfillment Issue",
            plainText:
              `Problem Order: ${existing.sourceOrderName}\n` +
              `Partner Name: ${partnerName}\n` +
              `Partner Contact: ${userEmail}\n` + 
              `SKU #: ${existing.sku}\n` +
              `Issue Selected: ${data.issueReason}\n` +
              `Note: ${data.notes}`,
            htmlText: `<p><strong>Problem Order:</strong> ${existing.sourceOrderName}</p>
												<p><strong>Partner Name:</strong> ${partnerName}</p>
                        <p><strong>Partner Contact:</strong> ${userEmail}</p> 
												<p><strong>SKU #:</strong> ${existing.sku}</p>
												<p><strong>Issue Selected:</strong> ${data.issueReason}</p>
												<p><strong>Note:</strong> ${data.notes}</p>`,
          }
          await sendEmail(email.to, email.subject, email.plainText, email.htmlText, email.from)

          await updateStatus();
          break;
        case "Ship":
          let carrier = "FedEx"
          if (data.boxes) {
            let labelResp = await createFedExLabel(existing, data.boxes);
            if (labelResp.statusCode !== 200) {
              throw new Error(
                `Error generating shipping label:  ${
                  labelResp.message
                } -- ${JSON.stringify(labelResp.data.errors)}.`
              );
            } else {
              data.trackingNumber = labelResp.data.boxes[0].masterTrackingNumber
                ? labelResp.data.boxes[0].masterTrackingNumber
                : 0;
              if (!resp.data) {
                resp.data = {};
              }
              resp.data.boxes = labelResp.data.boxes;
              lineStaticUpdate.shipping_labels = JSON.stringify(
                resp.data.boxes
              );
            }
          } else if (data.trackingNumber) {
            carrier = null;
            lineStaticUpdate.tracking_info = data.trackingNumber.substring(
              0,
              499
            );
          } else {
            // LOCAL - no special logic.
          }

          await updateStatus();

          //	Record tracking and fulfill item with shopify/sellbrite
          if (data.trackingNumber) {
            await RushOrders.updateOrderLineTracking(conn, existing.orderLineItemId, carrier, data.trackingNumber)

            if (existing.sourceName === "marketplace") {
              await sellbriteUtils.setTracking(existing.sourceOrderId, carrier, data.trackingNumber, existing.coinId)
            } else {
              await shopifyUtils.fulfillSku(existing.sku, carrier, data.trackingNumber)
            }
          } else {
            //	This is where local fulfillments with no tracking would land.
            if (existing.sourceName !== "marketplace") {
              await shopifyUtils.fulfillSku(existing.sku, carrier, data.trackingNumber)
            }
          }

          //	Capture the partner fulfillment fee
          await partnerActions.captureFulfillmentFee(existing.storeId, [existing.sku])
          break;
      }
    }

    await RushOrders.updateOrderLineStatic(conn, existing.orderLineStaticId, lineStaticUpdate)

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    await logUtils.logException(e);
    throw new Error(
      `Failed to update sourceLineId [${sourceLineId}]: ${e.message}`
    );
  } finally {
    globals.pool.releaseConnection(conn);
  }
  return true;
}

var notifyIssueReporter = async (
  conn,
  orderLineStaticId,
  sku,
  resolutionReason,
  resolutionNotes
) => {
  //	Get info about the original issue reporter
  let issue = await RushOrders.getLastIssue(conn, orderLineStaticId);

  if (issue.length) {
    let toEmail = "matt@rushmarket.com";

    switch (issue[0].userType) {
      case "INTERNAL":
        let user = await Users.getById(issue[0].userId);
        if (user.length) {
          toEmail = user[0].email;
        }
        break;

      case "PARTNER":
        let partner = await Partners.getById(issue[0].userId);
        if (partner.length) {
          toEmail = partner[0].email;
        }
        break;

      case "PARTNERUSER":
        let partnerUser = await Partners.getUserById(issue[0].userId);
        if (partnerUser.length) {
          toEmail = partnerUser[0].email;
        }
        break;
    }

    const email = {
      from: "service@rushmarket.com",
      to: toEmail,
      subject: "Product with an issue has been Resolved",
      plainText:
        `SKU #: ${sku}\n` +
        `Resolution: ${resolutionReason}\n` +
        `Note: ${resolutionNotes}`,
      htmlText: `
									<p><strong>SKU #:</strong> ${sku}</p>
									<p><strong>Resolution:</strong> ${resolutionReason}</p>
									<p><strong>Note:</strong> ${resolutionNotes}</p>`,
    };
    await sendEmail(
      email.to,
      email.subject,
      email.plainText,
      email.htmlText,
      email.from
    );
  }
};

var createFedExLabel = async (existing, boxes) => {
  boxes.map((box) => {
    const [height, width, length] = [box.length, box.height, box.width].sort(
      function (a, b) {
        return a - b;
      }
    );
    box.height = height;
    box.width = width;
    box.length = length;
  });

  let partnerFacility = await Partners.getFacilityByStoreId(existing.storeId);
  if (!partnerFacility.length) {
    throw new Error(
      "Failed to generate shipping label because facility not found"
    );
  } else {
    partnerFacility = partnerFacility[0];
  }

  let partner = await Partners.getById(partnerFacility.affiliatedWithId);
  if (!partner.length) {
    throw new Error(
      "Failed to generate shipping label because partner not found"
    );
  } else {
    partner = partner[0];
  }

  let shipper = {
    name: partnerFacility.name,
    phoneNumber: partnerFacility.phoneNumber,
    company: partner.name,
    address1: partnerFacility.address1,
    address2: partnerFacility.address2 ? partnerFacility.address2 : "",
    city: partnerFacility.city,
    stateOrProvinceCode: partnerFacility.stateOrProvince,
    postalCode: partnerFacility.postalCode,
    countryCode: partnerFacility.country,
  };

  let recipient = {
    name: existing.fullName,
    phoneNumber: existing.phoneNumber,
    phoneExtension: existing.phoneExt,
    company: existing.company,
    address1: existing.address1,
    address2: existing.address2 ? existing.address2 : "",
    city: existing.city,
    stateOrProvinceCode: existing.state,
    postalCode: existing.zip,
    countryCode: "US",
  };

  let labelResp = await fedexUtils.createLabel(
    existing.sourceOrderName,
    shipper,
    recipient,
    boxes
  );

  return labelResp;
};

exports.fulfill = async (req, resp) => {
  var lineItemId = null;
  var prom = [];
  var si = shopifyUtils.getCityInfoByCity("Omaha");

  resp.data.fulfillments = [];
  for (var i = 0; i < req.body.skus.length; i++) {
    resp.data.fulfillments.push({
      sku: req.body.skus[i],
      statusCode: 200,
      message: memberText.get("GET_SUCCESS"),
    });
  }

  //	Look up order and variant information for each sku.
  var lineItems = [];
  var shopifyInventoryItemIds = "";
  var shopifyOrderVariants = await RushOrders.getShopifyOrderAndVariant(
    req.body.skus
  );

  for (var i = 0; i < resp.data.fulfillments.length; i++) {
    var index = _.findIndex(shopifyOrderVariants, function (o) {
      return o.sku === resp.data.fulfillments[i].sku;
    });
    if (index === -1) {
      resp.data.fulfillments[i].statusCode = 404;
      resp.data.fulfillments[i].message = "SKU not found.";
    } else {
      lineItems.push({
        id: shopifyOrderVariants[index].sourceLineId,
      });
      if (shopifyInventoryItemIds.length > 0) {
        shopifyInventoryItemIds += ",";
      }
      shopifyInventoryItemIds +=
        shopifyOrderVariants[index].shopifyInventoryItemId;
    }
  }

  if (lineItems.length === 0) {
    formatResp(resp, ["data"], 404, "Order line items not found.");
    return resp;
  }

  var params = {
    inventory_item_ids: shopifyInventoryItemIds,
  };

  //	Create the fulfillment.
  params = {
    location_id: shopifyOrderVariants[0].shopifyLocationId,
    line_items: lineItems,
  };

  if (
    req.body.trackingNumber !== undefined &&
    req.body.trackingNumber !== null
  ) {
    params.tracking_number = req.body.trackingNumber;
  }
  if (req.body.trackingUrl !== undefined && req.body.trackingUrl !== null) {
    params.tracking_url = req.body.trackingUrl;
  }
  if (req.body.carrier !== undefined && req.body.carrier !== null) {
    params.tracking_company = req.body.carrier;
  }

  try {
    console.log(
      "fulfillment: " +
        shopifyOrderVariants[0].sourceOrderId +
        " " +
        JSON.stringify(params, undefined, 2)
    );
    var result = await si.shopify.fulfillment.create(
      shopifyOrderVariants[0].sourceOrderId,
      params
    );
    await RushProducts.clearBoxLocation(req.body.skus);
    // console.log("fulfillment result: " + JSON.stringify(result, undefined, 2));
  } catch (e) {
    console.log(`Fulfillment exception: ${e}`);
    logUtils.log({
      severity: "ERROR",
      type: "FULFILL",
      message: "Params: " + JSON.stringify(params, undefined, 2),
      stackTrace: new Error().stack,
    });

    if (e.message !== undefined && e.message.indexOf("422") === -1) {
      logUtils.log({
        severity: "ERROR",
        type: "FULFILL",
        message: "Non-422: " + e.message,
        stackTrace: new Error().stack,
      });
      resp.statusCode = 500;
      resp.message = "Something unexpected happened - " + e.message;

      // console.log("Fulfillment: " + e.message);

      if (
        e.response !== undefined &&
        e.response.body !== undefined &&
        e.response.body.errors !== undefined
      ) {
        logUtils.log({
          severity: "ERROR",
          type: "FULFILL",
          message: "Specific errors: " + JSON.stringify(e.response.body.errors),
          stackTrace: new Error().stack,
        });
        // console.log("Specific errors: " + JSON.stringify(e.response.body.errors));
      }
    } else if (e.message.indexOf("422") > 0) {
      if (
        e.response !== undefined &&
        e.response.body !== undefined &&
        e.response.body.errors !== undefined
      ) {
        logUtils.log({
          severity: "ERROR",
          type: "FULFILL",
          message:
            "422 Specific errors: " + JSON.stringify(e.response.body.errors),
          stackTrace: new Error().stack,
        });
        // console.log("Specific errors: " + JSON.stringify(e.response.body.errors));
      }

      resp.statusCode = 409;
      resp.message = "SKU(s) already fulfilled.";
    } else {
      logUtils.log({
        severity: "ERROR",
        type: "FULFILL",
        message: "General Exception: " + e,
        stackTrace: new Error().stack,
      });
    }
  }

  return resp;
};
