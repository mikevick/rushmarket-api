'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const soap = require('soap');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');


var url = path.join('./', '', 'RateService_v24.wsdl');

//
//  GET /fedex/rates
//
router.get(`/`, async (req, res, next) => {
	try {
		var date = new Date();
		var resp = {
			statusCode: 200
		};
		var shipDate = new Date(date.getTime() + (req.query.shipDaysOut * 24 * 60 * 60 * 1000)).toISOString();

		console.log("Ship Date: " + shipDate);

		var req = {
			'WebAuthenticationDetail': {
				'UserCredential': {
					'Key': 'UBT2rqSrKg5fh6Pn', //Your Key given by FedEx
					'Password': 'GmzeQdhzFCOfM8pyinrKmWHWo' //Your Password given by FedEx
				}
			},
			'ClientDetail': {
				'AccountNumber': '510087640', //Your Account Number given by FedEx
				'MeterNumber': '100421410' //Your Meter Number given by FedEx
			},
			'Version': {
				'ServiceId': 'crs',
				'Major': '24',
				'Intermediate': '0',
				'Minor': '0'
			},
			'ReturnTransitAndCommit': true,
			'RequestedShipment': {
				'ShipTimestamp': shipDate,
				'DropoffType': 'REGULAR_PICKUP',
				'ServiceType': 'GROUND_HOME_DELIVERY',
				// 'ServiceType': 'STANDARD_OVERNIGHT',
				'PackagingType': 'YOUR_PACKAGING',
				'TotalWeight': {
					'Units': 'LB',
					'Value': "10"
				},
				'Shipper': {
					'Contact': {
						'CompanyName': 'Company Name',
						'PhoneNumber': '5555555555'
					},
					'Address': {
						'StreetLines': [
							'3201 S. 144th Street'
						],
						'City': 'Omaha',
						'StateOrProvinceCode': 'NE',
						'PostalCode': '68144',
						'CountryCode': 'US'
					}
				},
				'Recipient': {
					'Contact': {
						'PersonName': 'Recipient Name',
						'PhoneNumber': '5555555555'
					},
					'Address': {
						'StreetLines': [
							'10305 Hilltop Road'
						],
						'City': 'Bangor',
						'StateOrProvinceCode': 'ME',
						'PostalCode': '04401',
						'CountryCode': 'US',
						'Residential': true
					}
				},
				'ShippingChargesPayment': {
					'PaymentType': 'SENDER',
					'Payor': {
						'ResponsibleParty': {
							'AccountNumber': '510087640' //Your Account Number given by FedEx
						}
					}
				},
				'RateRequestTypes': 'LIST',
				'PackageCount': '1',
				'RequestedPackageLineItems': {
					'GroupPackageCount': 1,
					'Weight': {
						'Units': 'LB',
						'Value': "10"
					},
					'Dimensions': {
						'Length': "4",
						'Width': "6",
						'Height': "10",
						'Units': "IN"
					}
				}
			}
		};



		var client = await soap.createClientAsync(url);
		var desc = client.describe();

		client.RateService.RateServicePort.getRates(req, function (err, result) {

			if ((result !== undefined) && (result.RateReplyDetails !== undefined) && (result.RateReplyDetails.length > 0)) {
				// console.log(JSON.stringify(result, undefined, 2));
				console.log(result.RateReplyDetails[0].ServiceType + " " + result.RateReplyDetails[0].DeliveryDayOfWeek + " " + result.RateReplyDetails[0].DeliveryTimestamp);
			} else {
				console.log('Something bad happened');
			}

			resp.result = result;

			response.respond(resp, res, next);
		});

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


module.exports = router;