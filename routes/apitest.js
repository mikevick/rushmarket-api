'use strict'

const globals = require('../globals');

const axios = require('axios').create({
  timeout: globals.apiTimeout,
  validateStatus: function (status) {
    return ((status === 404) || (status === 422) || (status === 400) || (status >= 200 && status < 300));
  }
});

const express = require('express');
const {
  fedex
} = require('rushutils-ship');
const router = express.Router();

const {
  respond
} = require('../utils/response');


router.get(`/sellbrite/:id`, async (req, res, next) => {
  const resp = {
    statusCode: 200,
    message: 'Success',
    data: {}
  };

  let url = `https://api.sellbrite.com/v1/orders/${req.params.id}`;

  let result = await axios.get(url, {
    auth: {
      username: '3eea62a8-f73d-4077-ab50-179ecf52ed2d',
      password: 'ccb486442dda651214048bdce81cfdc6'
    }
  });

  let body = {
    shipment: {
      sb_order_seq: parseInt(req.params.id),
      carrier_name: 'FedEx',
      tracking_number: '278594794117',
      items: [{
        sku: '1713C82429F',
        quantity: 1
      }]
    }
  }
  console.log(result.data);

  url = `https://api.sellbrite.com/v1/shipments`;
  result = await axios.post(url, body, {
    auth: {
      username: '3eea62a8-f73d-4077-ab50-179ecf52ed2d',
      password: 'ccb486442dda651214048bdce81cfdc6'
    }
  });

  //  status: 201   body: "Shipment created!"
  //  status: 400   data.error: 
  //  status: 404   data.error: "Order not found"
  //  status: 404   data.error: "Order item with sku 999 on order #13817 cannot be found."
  //  status: 422   data.error: "Only open orders can be shipped."
  //  status: 422   data.error: "Shipment parameters are missing"
  //  status: 422   data.error: "Please provide a valid shipping carrier."    

  console.log(result.data);

  resp.data = result.data;

  respond(resp, res, next);
})



module.exports = router