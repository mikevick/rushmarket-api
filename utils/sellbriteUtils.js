'use strict'

const globals = require('../globals');

const axios = require('axios').create({
  timeout: globals.apiTimeout,
  validateStatus: function (status) {
    return ((status === 404) || (status === 422) || (status === 400) || (status >= 200 && status < 300));
  }
});

const logUtils = require('../utils/logUtils');



exports.setTracking = async (sbOrderSeq, carrier, tracking, coin) => {
  let body = {
    shipment: {
      sb_order_seq: parseInt(sbOrderSeq),
      carrier_name: carrier,
      tracking_number: tracking,
      items: [{
        sku: coin,
        quantity: 1
      }]
    }
  }

  let url = `https://api.sellbrite.com/v1/shipments`;
  let result = null;
  
  try {
    await axios.post(url, body, {
      auth: {
        username: process.env.SELLBRITE_AUTH_TOKEN,
        password: process.env.SELLBRITE_SECRET_KEY
      }
    });
  }
  catch (e) {
    logUtils.logException(e);
    logUtils.log({
      severity: 'ERROR',
      type: 'SELLBRITE',
      message: `Sellbrite Shipment Exception ${sbOrderSeq} ${carrier} ${tracking} ${coin}`
    });
  }

  //  status: 201   body: "Shipment created!"
  //  status: 400   data.error: 
  //  status: 404   data.error: "Order not found"
  //  status: 404   data.error: "Order item with sku 999 on order #13817 cannot be found."
  //  status: 422   data.error: "Only open orders can be shipped."
  //  status: 422   data.error: "Shipment parameters are missing"
  //  status: 422   data.error: "Please provide a valid shipping carrier."    

  console.log(result);

  if (result && (result.status !== 200)) {
    logUtils.log({
      severity: 'ERROR',
      type: 'SELLBRITE',
      message: `Sellbrite Shipment Unepected Status: ${result.status} ${sbOrderSeq} ${carrier} ${tracking} ${coin}`,
      stackTrace: new Error().stack
    });
  }

  return result;
}