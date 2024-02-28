const moment = require('moment-timezone');
const { fedex } = require('rushutils-ship');
var Mutex = require('async-mutex').Mutex;
const url = require('url');
const {
  v1: uuidv1
} = require('uuid');




var authToken = null;
var authTokenExpire = null;
var authMutex = new Mutex();



//	Obtain OAuth token from FedEx.  
var getAuthToken = async () => {

	const axios = require('axios').create({
		timeout: 10000,
		headers: {
			"Content-Type": "application/x-www-form-urlencoded"
		},
		validateStatus: function (status) {
			return ((status === 200) || (status === 401) || (status === 403) || (status === 429) || (status === 500) || (status === 503));
		}
	});

	var body = new url.URLSearchParams({
		grant_type: "client_credentials",
		client_id: process.env.FEDEX_RRC_REST_KEY,
		client_secret: process.env.FEDEX_RRC_REST_SECRET
	});

	var response = null;
	while (1) {
		var now = moment();
		if ((authToken !== null) && (authTokenExpire.isAfter(now))) {
			break;
		}

		response = await axios.post(`${process.env.FEDEX_REST_URL}/oauth/token`, body);

		if ((response.status === 503) || (response.status === 429)) {
			await sleep(1000);
		} else {
			if (response.status === 200) {
				authToken = response.data.access_token;
				authTokenExpire = new moment().add(response.data.expires_in, "seconds");
				// console.log(authTokenExpire.format("YYYY-MM-DD HH:mm:ss"));
				// console.log(JSON.stringify(response.data, undefined, 2));
			} else {
				authToken = null;
			}
			break;
		}
	}

	return response;
}




exports.createLabel = async (orderId, shipper, recipient, boxes) => {
  let resp = {
    statusCode: 200,
    message: 'Success',
    data: {}
  }

	const release = await authMutex.acquire();
	try {
		await getAuthToken();
	} finally {
		release();
	}


	const axios = require('axios').create({
		timeout: 10000,
		headers: {
			'content-type': 'application/json',
			'authorization': `Bearer ${authToken}`,
			'X-locale': 'en_US',
			'x-customer-transaction-id': uuidv1()
		},
		validateStatus: function (status) {
			return ((status === 200) || (status === 400) || (status === 401) || (status === 403) || (status === 404) || (status === 422) || (status === 429) || (status === 500) || (status === 503));
		}
	});


  let packageArray = [];
  let totalWeight = 0.0;
  for (var i = 0; i < boxes.length; i++) {
    totalWeight += boxes[i].weight;

    //	Round dimensions up.
    boxes[i].length = Math.ceil(boxes[i].length);
    boxes[i].width = Math.ceil(boxes[i].width);
    boxes[i].height = Math.ceil(boxes[i].height);

    //	Limit weight to 1 decimal place.
    boxes[i].weight = Math.round(boxes[i].weight * 10) / 10;

    packageArray.push({
      weight: { //	Weight can have 1 decimal place
       units: "LB",
       value: boxes[i].weight
      },
      dimensions: { // Dimensions do NOT support decimals
        length: boxes[i].length,
        width: boxes[i].width,
        height: boxes[i].height,
        units: "IN"
      }
    })
  }

	if (orderId) {
		for (var i = 0; i < boxes.length; i++) {
			packageArray[i].customerReferences = [];
			packageArray[i].customerReferences.push({
				customerReferenceType: 'CUSTOMER_REFERENCE',
				value: orderId
			});
		}
	}



	let req = {
    mergeLabelDocOption: "LABELS_ONLY",
		labelResponseOptions: "URL_ONLY",
		requestedShipment: {
			shipper: {
				contact: {
					personName: `${shipper.name}`,
					phoneNumber: shipper.phoneNumber,
					companyName: `${shipper.company}`
				},
				address: {
					streetLines: [
						`${shipper.address1}`,
            `${shipper.address2 ? shipper.address2 : ''}`
					],
					city: `${shipper.city}`,
					stateOrProvinceCode: `${shipper.stateOrProvinceCode}`,
					postalCode: `${shipper.postalCode}`,
					countryCode: `${shipper.countryCode}`
				}
			},
			recipients: [{
				contact: {
					personName: `${recipient.name}`,
					phoneNumber: recipient.phoneNumber,
					phoneExtension: recipient.phoneExtension,
					companyName: `${recipient.company}`
				},
				address: {
					streetLines: [
						`${recipient.address1}`,
            `${recipient.address2 ? recipient.address2 : ''}`
					],
					city: `${recipient.city}`,
					stateOrProvinceCode: `${recipient.stateOrProvinceCode}`,
					postalCode: `${recipient.postalCode}`,
					countryCode: `${recipient.countryCode}`,
          residential: true
				},
				deliveryInstructions: ""
			}],
			shipDatestamp: moment().format('YYYY-MM-DD'),
			serviceType: "GROUND_HOME_DELIVERY",
			packagingType: "YOUR_PACKAGING",
			pickupType: "USE_SCHEDULED_PICKUP",
			blockInsightVisibility: false,
			shippingChargesPayment: {
				paymentType: "SENDER"
			},
			labelSpecification: {
				labelFormatType: "COMMON2D",
				imageType: "ZPLII",
				labelStockType: "STOCK_4X6"
			},
			requestedPackageLineItems: packageArray		
    },
		accountNumber: {
			value: process.env.FEDEX_RRC_ACCOUNT
		},
		shipAction: "CONFIRM",
		oneLabelAtATime: false
	}

	var fedexResp = await axios.post(`${process.env.FEDEX_REST_URL}/ship/v1/shipments`, JSON.stringify(req));

  resp.statusCode = fedexResp.status;
  if (resp.statusCode !== 200) {
    if ((fedexResp.data.errors) && (fedexResp.data.errors.length)) {
      resp.data.errors = fedexResp.data.errors;
			resp.message = fedexResp.data.errors[0].message;

			if (fedexResp.data.errors[0].parameterList) {
				resp.message += `${resp.message} - ${fedexResp.data.errors[0].parameterList[0].value}`;
			}
    }
  }
  else {


    resp.data.boxes = boxes;
    for (let i=0; i < fedexResp.data.output.transactionShipments[0].pieceResponses.length; i++) {
      boxes[i].labelUrl = fedexResp.data.output.transactionShipments[0].pieceResponses[i].packageDocuments[0].url;
			var label = await axios.get(fedexResp.data.output.transactionShipments[0].pieceResponses[i].packageDocuments[0].url, {
				responseType: 'text'
			});
			
			if (label.status === 200) {
				boxes[i].fileText = label.data;
			}

			boxes[i].masterTrackingNumber = fedexResp.data.output.transactionShipments[0].pieceResponses[i].masterTrackingNumber;
      boxes[i].trackingNumber = fedexResp.data.output.transactionShipments[0].pieceResponses[i].trackingNumber;
      boxes[i].packageSequenceNumber = fedexResp.data.output.transactionShipments[0].pieceResponses[i].packageSequenceNumber;
    }
  }


	return resp;
}

