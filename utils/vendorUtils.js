const _ = require('lodash');
const checkGeo = require('check-geographic-coordinates');
const ein = require('ein-validator');
const isValidZipcode = require('is-valid-zipcode');
const memberText = require('./memberTextUtils');
const pv = require('password-validator');
const validator = require('validator');

const Vendors = require('../models/vendors');

const configUtils = require('../utils/configUtils');
const validationUtils = require('../utils/validationUtils');



var createVendorPrefix = (len) => {
	var text = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

	for (var i = 0; i < len; i++)
		text += possible.charAt(Math.floor(Math.random() * possible.length));

	return text;
}



var getVendor = async (vendors, vendorId) => {
	var index = _.findIndex(vendors, function (v) {
		return v.vendorId === vendorId;
	});

	if (index === -1) {
		var v = await Vendors.getById(vendorId);
		if (v.length > 0) {
			vendors.push({
				vendorId: vendorId,
				vendorName: v[0].name
			})

			return v[0].name;
		} else {
			return undefined;
		}
	} else {
		return vendors[index].vendorName;
	}
}



var validateVendor = (req, validateRequired) => {
	return new Promise((resolve, reject) => {
		var invalidEmailFlag = false;
		var invalidInfo = [];
		var prom = [];
		var requiredInfo = [];
		var validationErrors = {
			errorDetails: [],
			message: ""
		}

		// resolve(validationErrors);

		//	Validate required vendor info
		if ((validateRequired === undefined) || (validateRequired)) {
			if ((req.body.catalogFeedType === undefined) || (req.body.catalogFeedType === null) || (req.body.catalogFeedType.trim().length === 0)) {
				requiredInfo.push({
					error: "isRequired",
					field: "catalogFeedType",
					text: "Catalog Feed Type"
				});
			}
			if ((req.body.catalogFeedFormat === undefined) || (req.body.catalogFeedFormat === null) || (req.body.catalogFeedFormat.trim().length === 0)) {
				requiredInfo.push({
					error: "isRequired",
					field: "catalogFeedFormat",
					text: "Catalog Feed Format"
				});
			}
			if ((req.body.catalogFeedFreq === undefined) || (req.body.catalogFeedFreq === null) || (req.body.catalogFeedFreq.trim().length === 0)) {
				requiredInfo.push({
					error: "isRequired",
					field: "catalogFeedFreq",
					text: "Catalog Feed Freq"
				});
			}
			if ((req.body.inventoryFeedType === undefined) || (req.body.inventoryFeedType === null) || (req.body.inventoryFeedType.trim().length === 0)) {
				requiredInfo.push({
					error: "isRequired",
					field: "inventoryFeedType",
					text: "Inventory Feed Type"
				});
			}
			if ((req.body.inventoryFeedFormat === undefined) || (req.body.inventoryFeedFormat === null) || (req.body.inventoryFeedFormat.trim().length === 0)) {
				requiredInfo.push({
					error: "isRequired",
					field: "inventoryFeedFormat",
					text: "Inventory Feed Format"
				});
			}
			if ((req.body.inventoryFeedFreq === undefined) || (req.body.inventoryFeedFreq === null) || (req.body.inventoryFeedFreq.trim().length === 0)) {
				requiredInfo.push({
					error: "isRequired",
					field: "inventoryFeedFreq",
					text: "Inventory Feed Freq"
				});
			}
			if ((req.body.email === undefined) || (req.body.email === null) || (req.body.email.trim().length === 0)) {
				requiredInfo.push({
					error: "isRequired",
					field: "email",
					text: "Vendor Email"
				});
			}
			if ((req.body.name === undefined) || (req.body.name === null) || (req.body.name.trim().length === 0)) {
				requiredInfo.push({
					error: "isRequired",
					field: "name",
					text: "Vendor Name"
				});
			}

			// if ((req.body.taxIdNumber === undefined) || (req.body.taxIdNumber === null) || (req.body.taxIdNumber.trim().length === 0)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "taxIdNumber",
			// 		text: "Tax ID Number"
			// 	});
			// }
			if ((req.body.paymentTerms === undefined) || (req.body.paymentTerms === null) || (req.body.paymentTerms.trim().length === 0)) {
				requiredInfo.push({
					error: "isRequired",
					field: "paymentTerms",
					text: "Payment Terms"
				});
			}
			// if ((req.body.leadTime === undefined) || (req.body.leadTime === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "leadTime",
			// 		text: "Lead Time"
			// 	});
			// }
			// if ((req.body.shippingCutoffCst === undefined) || (req.body.shippingCutoffCst === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "shippingCutoffCst",
			// 		text: "Shipping Cutoff CST"
			// 	});
			// }
			// if ((req.body.map === undefined) || (req.body.map === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "map",
			// 		text: "MAP"
			// 	});
			// }
			// if ((req.body.companyAddress1 === undefined) || (req.body.companyAddress1 === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "companyAddress1",
			// 		text: "Company Address1"
			// 	});
			// }
			// if ((req.body.companyCity === undefined) || (req.body.companyCity === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "companyCity",
			// 		text: "Company City"
			// 	});
			// }
			// if ((req.body.companyStateOrProvince === undefined) || (req.body.companyStateOrProvince === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "companyStateOrProvince",
			// 		text: "Company State Or Province"
			// 	});
			// }
			// if ((req.body.companyPostalCode === undefined) || (req.body.companyPostalCode === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "companyPostalCode",
			// 		text: "Company Postal Code"
			// 	});
			// }
			// if ((req.body.warehouse1Address1 === undefined) || (req.body.warehouse1Address1 === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "warehouse1Address1",
			// 		text: "Warehouse1 Address1"
			// 	});
			// }
			// if ((req.body.warehouse1City === undefined) || (req.body.warehouse1City === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "warehouse1City",
			// 		text: "Warehouse1 City"
			// 	});
			// }
			// if ((req.body.warehouse1StateOrProvince === undefined) || (req.body.warehouse1StateOrProvince === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "warehouse1StateOrProvince",
			// 		text: "Warehouse1 State Or Province"
			// 	});
			// }
			// if ((req.body.warehouse1PostalCode === undefined) || (req.body.warehouse1PostalCode === null)) {
			// 	requiredInfo.push({
			// 		error: "isRequired",
			// 		field: "warehouse1PostalCode",
			// 		text: "Warehouse1 Postal Code"
			// 	});
			// }
		}


		if (req.body.catalogFeedType !== undefined) {
			if ((req.body.catalogFeedType !== 'FTPPUSH') && (req.body.catalogFeedType !== 'FTPPULL') && (req.body.catalogFeedType !== 'EDI') &&
				(req.body.catalogFeedType !== 'GOOGLEDRIVE') && (req.body.catalogFeedType !== 'API') && (req.body.catalogFeedType !== 'LOCAL')) {
				invalidInfo.push({
					error: "invalid",
					field: "catalogFeedType",
					text: "Catalog Feed Type"
				});
			}
		}
		if ((req.body.catalogFeedFormat !== undefined) && (req.body.catalogFeedFormat !== null)) {
			if ((req.body.catalogFeedFormat !== 'TRM') && (req.body.catalogFeedFormat !== 'AMAZON') &&
				(req.body.catalogFeedFormat !== 'WAYFAIR') && (req.body.catalogFeedFormat !== 'CUSTOM')) {
				invalidInfo.push({
					error: "invalid",
					field: "catalogFeedFormat",
					text: "Catalog Feed Format"
				});
			}
		}
		if (req.body.inventoryFeedType !== undefined) {
			if ((req.body.inventoryFeedType !== 'FTPPUSH') && (req.body.inventoryFeedType !== 'FTPPULL') && (req.body.inventoryFeedType !== 'EDI') &&
				(req.body.inventoryFeedType !== 'GOOGLEDRIVE') && (req.body.inventoryFeedType !== 'API') && (req.body.inventoryFeedType !== 'LOCAL')) {
				invalidInfo.push({
					error: "invalid",
					field: "inventoryFeedType",
					text: "Inventory Feed Type"
				});
			}
		}
		if ((req.body.inventoryFeedFormat !== undefined) && (req.body.inventoryFeedFormat !== null)) {
			if ((req.body.inventoryFeedFormat !== 'TRM')) {
				invalidInfo.push({
					error: "invalid",
					field: "inventoryFeedFormat",
					text: "Inventory Feed Format"
				});
			}
		}
		if (req.body.inventoryFeedFreq !== undefined) {
			if ((req.body.inventoryFeedFreq !== 'ADHOC') && (req.body.inventoryFeedFreq !== 'SCHEDULE') && (req.body.inventoryFeedFreq !== 'HOURLY') &&
				(req.body.inventoryFeedFreq !== 'DAILY') && (req.body.inventoryFeedFreq !== 'WEEkLY')) {
				invalidInfo.push({
					error: "invalid",
					field: "inventoryFeedFreq",
					text: "Inventory Feed Frequency"
				});
			}
		}
		if (req.body.rating !== undefined) {
			if ((req.body.rating !== 'NONE') && (req.body.rating !== 'GOOD') && (req.body.rating !== 'BETTER') && (req.body.rating !== 'BEST')) {
				invalidInfo.push({
					error: "invalid",
					field: "rating",
					text: "Rating"
				});
			}
		}
		if (req.body.rushMarketAvailability !== undefined) {
			if ((req.body.rushMarketAvailability !== 'ALL') && (req.body.rushMarketAvailability !== 'LOCAL')) {
				invalidInfo.push({
					error: "invalid",
					field: "rushMarketAvailability",
					text: "Rush Market Availability"
				});
			}
		}
		if (req.body.rrcStatus !== undefined) {
			if ((req.body.rrcStatus !== 'ACTIVE') && (req.body.rrcStatus !== 'INACTIVE')) {
				invalidInfo.push({
					error: "invalid",
					field: "rrcStatus",
					text: "RRC Status Availability"
				});
			}
		}
		if (req.body.rrcNavCreateSellableProducts !== undefined) {
			if ((req.body.rrcNavCreateSellableProducts !== 'Y') && (req.body.rrcNavCreateSellableProducts !== 'N')) {
				invalidInfo.push({
					error: "invalid",
					field: "rrcNavCreateSellableProducts",
					text: "RRC Nav Create SellableProducts"
				});
			}
		}
		if (req.body.lockPricing !== undefined) {
			if ((req.body.lockPricing.toUpperCase() !== 'Y') && (req.body.lockPricing.toUpperCase() !== 'N')) {
				invalidInfo.push({
					error: "invalid",
					field: "lockPricing",
					text: "Lock Pricing"
				});
			}
		}
		if ((req.body.email !== undefined) && (req.body.email !== null)) {
			if (!validator.isEmail(req.body.email)) {
				invalidInfo.push({
					error: "invalid",
					field: "email",
					text: "Vendor Email"
				});
			}
		}
		if (req.body.password !== undefined) {
			var schema = new pv();
			schema
				.is().min(6);

			if (!schema.validate(req.body.password)) {
				invalidInfo.push({
					error: "badpassword",
					field: "password",
					text: "Password"
				});
				validationErrors.message = validationErrors.message + " " + memberText.get("BAD_PASSWORD");
			}
		}

		if ((req.body.alias !== undefined) && (req.body.alias !== null)) {
			if (!req.body.alias.match(/^[a-z0-9]+$/i)) {
				invalidInfo.push({
					error: "invalid",
					field: "alias",
					text: "Alias"
				});
			}
		}

		if (req.body.taxIdNumber != undefined) {
			if (ein.isValid(req.body.taxIdNumber) === false) {
				invalidInfo.push({
					error: "invalid",
					field: "taxIdNumber",
					text: "Tax ID Number"
				});
			}
		}
		if (req.body.websiteAddress != undefined) {
			if (validator.isURL(req.body.websiteAddress) === false) {
				invalidInfo.push({
					error: "invalid",
					field: "websiteAddress",
					text: "Website Address"
				});
			}
		}
		if (req.body.partnerContractType != undefined) {
			if ((req.body.partnerContractType != 'REVENUE_SHARE') && (req.body.partnerContractType != 'COST_BASED')) {
				invalidInfo.push({
					error: "invalid",
					field: "partnerContractType",
					text: "Partner Contract Type"
				});
			} else if ((req.body.partnerContractType === 'REVENUE_SHARE') && (req.body.partnerRevSharePercent === undefined || req.body.partnerRevSharePercent > 100 || req.body.partnerRevSharePercent < 0)) {
				invalidInfo.push({
					error: 'invalid',
					field: 'partnerRevSharePercent',
					text: 'Partner Rev Share Percent'
				});
			}
		}
		if (req.body.leadTime != undefined) {
			if ((!Number.isInteger(req.body.leadTime) && (validator.isInt(req.body.leadTime) === false))) {
				invalidInfo.push({
					error: "invalid",
					field: "leadTime",
					text: "Lead Time"
				});
			}
		}
		if (req.body.shippingCutoffCst != undefined) {
			var colon = req.body.shippingCutoffCst.indexOf(':');
			var valid = true;

			if (colon > 0) {
				var hours = parseInt(req.body.shippingCutoffCst.substring(0, colon));
				var minutes = parseInt(req.body.shippingCutoffCst.substring(colon + 1));

				if (isNaN(hours) || isNaN(minutes)) {
					valid = false;
				} else {
					if ((hours < 0) || (hours > 23) || (minutes < 0) || (minutes > 59)) {
						valid = false;
					}
				}
			} else {
				valid = false;
			}
			if (!valid) {
				invalidInfo.push({
					error: "invalid",
					field: "shippingCutoffCst",
					text: "Shipping Cutoff CST"
				});
			}
		}
		if (req.body.invoiceMethod != undefined) {
			if ((req.body.invoiceMethod != 'EDI') && (req.body.invoiceMethod != 'EMAIL')) {
				invalidInfo.push({
					error: "invalid",
					field: "invoiceMethod",
					text: "Invoice Method"
				});
			}
		}
		if (req.body.map != undefined) {
			if ((req.body.map != true) && (req.body.map != false)) {
				invalidInfo.push({
					error: "invalid",
					field: "map",
					text: "MAP"
				});
			}
		}
		if (req.body.salesName != undefined) {
			if (req.body.salesName.trim().length === 0) {
				invalidInfo.push({
					error: "invalid",
					field: "salesName",
					text: "Sales Name"
				});
			}
		}
		if ((req.body.salesEmail !== undefined) && (req.body.salesEmail !== null)) {
			if (!validator.isEmail(req.body.salesEmail)) {
				invalidInfo.push({
					error: "invalid",
					field: "salesEmail",
					text: "Sales Email"
				});
			}
		}
		if (req.body.orderName != undefined) {
			if (req.body.orderName.trim().length === 0) {
				invalidInfo.push({
					error: "invalid",
					field: "orderName",
					text: "Order Name"
				});
			}
		}
		if ((req.body.orderEmail !== undefined) && (req.body.orderEmail !== null)) {
			if (!validator.isEmail(req.body.orderEmail)) {
				invalidInfo.push({
					error: "invalid",
					field: "orderEmail",
					text: "Order Email"
				});
			}
		}
		if (req.body.apName != undefined) {
			if (req.body.apName.trim().length === 0) {
				invalidInfo.push({
					error: "invalid",
					field: "apName",
					text: "AP Name"
				});
			}
		}
		if ((req.body.apEmail !== undefined) && (req.body.apEmail !== null)) {
			if (!validator.isEmail(req.body.apEmail)) {
				invalidInfo.push({
					error: "invalid",
					field: "apEmail",
					text: "AP Email"
				});
			}
		}
		if (req.body.apPostalCode != undefined) {
			if (isValidZipcode(req.body.apPostalCode) === false) {
				invalidInfo.push({
					error: "invalid",
					field: "apPostalCode",
					text: "AP Postal Code"
				});
			}
		}
		if (req.body.transportationName != undefined) {
			if (req.body.transportationName.trim().length === 0) {
				invalidInfo.push({
					error: "invalid",
					field: "transportationName",
					text: "Transportation Name"
				});
			}
		}
		if ((req.body.transportationEmail !== undefined) && (req.body.transportationEmail !== null)) {
			if (!validator.isEmail(req.body.transportationEmail)) {
				invalidInfo.push({
					error: "invalid",
					field: "transportationEmail",
					text: "Transportation Email"
				});
			}
		}
		if (req.body.csName != undefined) {
			if (req.body.csName.trim().length === 0) {
				invalidInfo.push({
					error: "invalid",
					field: "csName",
					text: "Customer Service Name"
				});
			}
		}
		if ((req.body.csEmail !== undefined) && (req.body.csEmail !== null)) {
			if (!validator.isEmail(req.body.csEmail)) {
				invalidInfo.push({
					error: "invalid",
					field: "csEmail",
					text: "Customer Service Email"
				});
			}
		}
		if (req.body.partsName != undefined) {
			if (req.body.partsName.trim().length === 0) {
				invalidInfo.push({
					error: "invalid",
					field: "partsName",
					text: "Parts Name"
				});
			}
		}
		if ((req.body.partsEmail !== undefined) && (req.body.partsEmail !== null)) {
			if (!validator.isEmail(req.body.partsEmail)) {
				invalidInfo.push({
					error: "invalid",
					field: "partsEmail",
					text: "Parts Email"
				});
			}
		}
		if (req.body.companyPostalCode != undefined) {
			if (isValidZipcode(req.body.companyPostalCode) === false) {
				invalidInfo.push({
					error: "invalid",
					field: "companyPostalCode",
					text: "Company Postal Code"
				});
			}
		}
		if (req.body.warehouse1PostalCode != undefined) {
			if (isValidZipcode(req.body.warehouse1PostalCode) === false) {
				invalidInfo.push({
					error: "invalid",
					field: "warehouse1PostalCode",
					text: "Warehouse1 Postal Code"
				});
			}
		}
		if (req.body.warehouse1Lat != undefined) {
			if (isNaN(req.body.warehouse1Lat) || (parseFloat(req.body.warehouse1Lat) === NaN) || (!checkGeo.latitude(req.body.warehouse1Lat))) {
				invalidInfo.push({
					error: "invalid",
					field: "warehouse1Lat",
					text: "Warehouse 1 Lat"
				});
			}
		}
		if (req.body.warehouse1Long != undefined) {
			if (isNaN(req.body.warehouse1Long) || (parseFloat(req.body.warehouse1Long) === NaN) || (!checkGeo.longitude(req.body.warehouse1Long))) {
				invalidInfo.push({
					error: "invalid",
					field: "warehouse1Long",
					text: "Warehouse 1 Long"
				});
			}
		}
		if (req.body.warehouse2PostalCode != undefined) {
			if (isValidZipcode(req.body.warehouse2PostalCode) === false) {
				invalidInfo.push({
					error: "invalid",
					field: "warehouse2PostalCode",
					text: "Warehouse2 Postal Code"
				});
			}
		}
		if (req.body.warehouse2Lat != undefined) {
			if (isNaN(req.body.warehouse2Lat) || (parseFloat(req.body.warehouse2Lat) === NaN) || (!checkGeo.latitude(req.body.warehouse2Lat))) {
				invalidInfo.push({
					error: "invalid",
					field: "warehouse2Lat",
					text: "Warehouse 2 Lat"
				});
			}
		}
		if (req.body.warehouse2Long != undefined) {
			if (isNaN(req.body.warehouse2Long) || (parseFloat(req.body.warehouse2Long) === NaN) || (!checkGeo.longitude(req.body.warehouse2Long))) {
				invalidInfo.push({
					error: "invalid",
					field: "warehouse2Long",
					text: "Warehouse 2 Long"
				});
			}
		}
		if (req.body.warehouse3PostalCode != undefined) {
			if (isValidZipcode(req.body.warehouse3PostalCode) === false) {
				invalidInfo.push({
					error: "invalid",
					field: "warehouse3PostalCode",
					text: "Warehouse3 Postal Code"
				});
			}
		}
		if (req.body.warehouse3Lat != undefined) {
			if (isNaN(req.body.warehouse3Lat) || (parseFloat(req.body.warehouse3Lat) === NaN) || (!checkGeo.latitude(req.body.warehouse3Lat))) {
				invalidInfo.push({
					error: "invalid",
					field: "warehouse3Lat",
					text: "Warehouse 3 Lat"
				});
			}
		}
		if (req.body.warehouse3Long != undefined) {
			if (isNaN(req.body.warehouse3Long) || (parseFloat(req.body.warehouse3Long) === NaN) || (!checkGeo.longitude(req.body.warehouse3Long))) {
				invalidInfo.push({
					error: "invalid",
					field: "warehouse3Long",
					text: "Warehouse 3 Long"
				});
			}
		}
		if (req.body.outletRevSharePercent != undefined) {
			if (isNaN(req.body.outletRevSharePercent) || (parseFloat(req.body.outletRevSharePercent) === NaN)) {
				invalidInfo.push({
					error: "invalid",
					field: "outletRevSharePercent",
					text: "Outlet Rev Share Percent"
				});
			}
		}
		if (req.body.outletSiteAddress != undefined) {
			if (validator.isURL(req.body.outletSiteAddress) === false) {
				invalidInfo.push({
					error: "invalid",
					field: "outletSiteAddress",
					text: "Outlet Site Address"
				});
			}
		}
		if (req.body.damageDefectiveAllowance != undefined) {
			if (isNaN(req.body.damageDefectiveAllowance) || (parseFloat(req.body.damageDefectiveAllowance) === NaN)) {
				invalidInfo.push({
					error: "invalid",
					field: "damageDefectiveAllowance",
					text: "Damage Defective Allowance"
				});
			}
		}
		if (req.body.preferenceAllowance != undefined) {
			if (isNaN(req.body.damageDefectiveAllowance) || (parseFloat(req.body.preferenceAllowance) === NaN)) {
				invalidInfo.push({
					error: "invalid",
					field: "preferenceAllowance",
					text: "Preference Allowance"
				});
			}
		}
		if (req.body.tariff != undefined) {
			if (isNaN(req.body.tariff) || (parseFloat(req.body.tariff) === NaN)) {
				invalidInfo.push({
					error: "invalid",
					field: "tariff",
					text: "Tariff"
				});
			}
		}
		if (req.body.processingFee != undefined) {
			if (isNaN(req.body.processingFee) || (parseFloat(req.body.processingFee) === NaN)) {
				invalidInfo.push({
					error: "invalid",
					field: "processingFee",
					text: "Processing Fee"
				});
			}
		}
		if (req.body.provideReplacementParts != undefined) {
			if ((req.body.provideReplacementParts != true) && (req.body.provideReplacementParts != false)) {
				invalidInfo.push({
					error: "invalid",
					field: "provideReplacementParts",
					text: "Provide Replacement Parts"
				});
			}
		}
		if (req.body.allow3rdPartySalesAmazon != undefined) {
			if ((req.body.allow3rdPartySalesAmazon != true) && (req.body.allow3rdPartySalesAmazon != false)) {
				invalidInfo.push({
					error: "invalid",
					field: "allow3rdPartySalesAmazon",
					text: "Allow 3rd Party Sales Amazon"
				});
			}
		}
		if (req.body.allow3rdPartySalesEbay != undefined) {
			if ((req.body.allow3rdPartySalesEbay != true) && (req.body.allow3rdPartySalesEbay != false)) {
				invalidInfo.push({
					error: "invalid",
					field: "allow3rdPartySalesEBay",
					text: "Allow 3rd Party Sales eBay"
				});
			}
		}
		if (req.body.allow3rdPartySalesWalmart != undefined) {
			if ((req.body.allow3rdPartySalesWalmart != true) && (req.body.allow3rdPartySalesWalmart != false)) {
				invalidInfo.push({
					error: "invalid",
					field: "allow3rdPartySalesWalmart",
					text: "Allow 3rd Party Sales Walmart"
				});
			}
		}
		if (req.body.allow3rdPartySalesHouzz != undefined) {
			if ((req.body.allow3rdPartySalesHouzz != true) && (req.body.allow3rdPartySalesHouzz != false)) {
				invalidInfo.push({
					error: "invalid",
					field: "allow3rdPartySalesHouzz",
					text: "Allow 3rd Party Sales Houzz"
				});
			}
		}
		if (req.body.internalSeller != undefined) {
			if ((req.body.internalSeller.toLowerCase() != "y") && (req.body.internalSeller.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "internalSeller",
					text: "Internal Seller"
				});
			}
		}
		if (req.body.dsSignedContract != undefined) {
			if ((req.body.dsSignedContract.toLowerCase() != "y") && (req.body.dsSignedContract.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "dsSignedContract",
					text: "DS Signed Contract"
				});
			}
		}
		if (req.body.rbrSignedContract != undefined) {
			if ((req.body.rbrSignedContract.toLowerCase() != "y") && (req.body.rbrSignedContract.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "rbrSignedContract",
					text: "RBR Signed Contract"
				});
			}
		}
		if (req.body.inventoryFeed != undefined) {
			if ((req.body.inventoryFeed.toLowerCase() != "y") && (req.body.inventoryFeed.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "inventoryFeed",
					text: "Inventory Feed"
				});
			}
		}
		if (req.body.groupQuantities != undefined) {
			if ((req.body.groupQuantities.toLowerCase() != "y") && (req.body.groupQuantities.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "groupQuantities",
					text: "Group Quantities"
				});
			}
		}
		if (req.body.calculateCost != undefined) {
			if ((req.body.calculateCost.toLowerCase() != "y") && (req.body.calculateCost.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "calculateCost",
					text: "Calculate Cost"
				});
			}
		}
		if (req.body.manifestIdUpload != undefined) {
			if ((req.body.manifestIdUpload.toLowerCase() != "y") && (req.body.manifestIdUpload.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "manifestIdUpload",
					text: "Manifest Id Upload"
				});
			}
		}
		if (req.body.isParsingTemplate != undefined) {
			if ((req.body.isParsingTemplate.toLowerCase() != "y") && (req.body.isParsingTemplate.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "isParsingTemplate",
					text: "Is Parsing Template"
				});
			}
		}
		if (req.body.shippingLabelPhotoRequired != undefined) {
			if ((req.body.shippingLabelPhotoRequired.toLowerCase() != "y") && (req.body.shippingLabelPhotoRequired.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "shippingLabelPhotoRequired",
					text: "Shipping Label Photo Required"
				});
			}
		}
		if (req.body.shippingLabelPhotoRequiredDaily != undefined) {
			if ((req.body.shippingLabelPhotoRequiredDaily.toLowerCase() != "y") && (req.body.shippingLabelPhotoRequiredDaily.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "shippingLabelPhotoRequiredDaily",
					text: "Shipping Label Photo Required Daily"
				});
			}
		}
		if (req.body.shippingLabelPhotoRequiredBulkReturns != undefined) {
			if ((req.body.shippingLabelPhotoRequiredBulkReturns.toLowerCase() != "y") && (req.body.shippingLabelPhotoRequiredBulkReturns.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "shippingLabelPhotoRequiredBulkReturns",
					text: "Shipping Label Photo Required Bulk Returns"
				});
			}
		}
		if (req.body.shippingLabelPhotoRequiredBulkOverstock != undefined) {
			if ((req.body.shippingLabelPhotoRequiredBulkOverstock.toLowerCase() != "y") && (req.body.shippingLabelPhotoRequiredBulkOverstock.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "shippingLabelPhotoRequiredBulkOverstock",
					text: "Shipping Label Photo Required Bulk Overstock"
				});
			}
		}
		if (req.body.trackingNumberRequired != undefined) {
			if ((req.body.trackingNumberRequired.toLowerCase() != "y") && (req.body.trackingNumberRequired.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "trackingNumberRequired",
					text: "Tracking Number Required"
				});
			}
		}
		if (req.body.trackingNumberRequiredDaily != undefined) {
			if ((req.body.trackingNumberRequiredDaily.toLowerCase() != "y") && (req.body.trackingNumberRequiredDaily.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "trackingNumberRequiredDaily",
					text: "Tracking Number Required Daily"
				});
			}
		}
		if (req.body.trackingNumberRequiredBulkReturns != undefined) {
			if ((req.body.trackingNumberRequiredBulkReturns.toLowerCase() != "y") && (req.body.trackingNumberRequiredBulkReturns.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "trackingNumberRequiredBulkReturns",
					text: "Tracking Number Required Bulk Returns"
				});
			}
		}
		if (req.body.trackingNumberRequiredBulkOverstock != undefined) {
			if ((req.body.trackingNumberRequiredBulkOverstock.toLowerCase() != "y") && (req.body.trackingNumberRequiredBulkOverstock.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "trackingNumberRequiredBulkOverstock",
					text: "Tracking Number Required Bulk Overstock"
				});
			}
		}
		if (req.body.trashPhotoRequired != undefined) {
			if ((req.body.trashPhotoRequired.toLowerCase() != "y") && (req.body.trashPhotoRequired.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "trashPhotoRequired",
					text: "Trash Photo Required"
				});
			}
		}
		if (req.body.trashPhotoRequiredDaily != undefined) {
			if ((req.body.trashPhotoRequiredDaily.toLowerCase() != "y") && (req.body.trashPhotoRequiredDaily.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "trashPhotoRequiredDaily",
					text: "Trash Photo Required Daily"
				});
			}
		}
		if (req.body.trashPhotoRequiredBulkReturns != undefined) {
			if ((req.body.trashPhotoRequiredBulkReturns.toLowerCase() != "y") && (req.body.trashPhotoRequiredBulkReturns.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "trashPhotoRequiredBulkReturns",
					text: "Trash Photo Required Bulk Returns"
				});
			}
		}
		if (req.body.trashPhotoRequiredBulkOverstock != undefined) {
			if ((req.body.trashPhotoRequiredBulkOverstock.toLowerCase() != "y") && (req.body.trashPhotoRequiredBulkOverstock.toLowerCase() != "n")) {
				invalidInfo.push({
					error: "invalid",
					field: "trashPhotoRequiredBulkOverstock",
					text: "Trash Photo Required Bulk Overstock"
				});
			}
		}
		if (req.body.buyerId != undefined) {
			if (!Number.isInteger(req.body.buyerId)) {
				invalidInfo.push({
					error: "invalid",
					field: "buyerId",
					text: "Buyer Id"
				});
			}
		}
		if (req.body.manifestSellerFlag != undefined) {
			if ((req.body.manifestSellerFlag != true) && (req.body.manifestSellerFlag != false)) {
				invalidInfo.push({
					error: "invalid",
					field: "manifestSellerFlag",
					text: "Manifest Seller Flag"
				});
			}
		}
		if (req.body.rrcProductEdit !== undefined) {
			if ((req.body.rrcProductEdit.toUpperCase() !== 'Y') && (req.body.rrcProductEdit.toUpperCase() !== 'N')) {
				invalidInfo.push({
					error: "invalid",
					field: "rrcProductEdit",
					text: "RRC Product Edit"
				});
			}
		}
		if (req.body.rrcAllowReturnRouting !== undefined) {
			if ((req.body.rrcAllowReturnRouting.toUpperCase() !== 'Y') && (req.body.rrcAllowReturnRouting.toUpperCase() !== 'N')) {
				invalidInfo.push({
					error: "invalid",
					field: "rrcAllowReturnRouting",
					text: "RRC Allow Return Routing"
				});
			}
		}

		if (configUtils.get("FEAT_FLAG_RM_2464_VENDOR_SUPPLIER_CODES") === "ON") {

			if (req.body.supplierCodes != undefined) {
				for (var i = 0; i < req.body.supplierCodes.length; i++) {
					if ((req.body.supplierCodes[i].storeId !== null) && (!Number.isInteger(req.body.supplierCodes[i].storeId))) {
						invalidInfo.push({
							error: "invalid",
							field: "storeId",
							text: "Store Id"
						});
					}

					if ((req.body.supplierCodes[i].type !== 'DAILY') && (req.body.supplierCodes[i].type !== 'BULK_OVERSTOCK') && (req.body.supplierCodes[i].type !== 'BULK_RETURNS')) {
						invalidInfo.push({
							error: "invalid",
							field: "type",
							text: "Supplier Code Type"
						});
					}

					if ((req.body.supplierCodes[i].chargeDisposalFees !== 'Y') && (req.body.supplierCodes[i].chargeDisposalFees !== 'N')) {
						invalidInfo.push({
							error: "invalid",
							field: "chargeDisposalFees",
							text: "Charge Disposal Fees"
						});
					}

					if ((req.body.supplierCodes[i].chargeProcessingFees !== 'Y') && (req.body.supplierCodes[i].chargeProcessingFees !== 'N')) {
						invalidInfo.push({
							error: "invalid",
							field: "chargeProcessingFees",
							text: "Charge Processing Fees"
						});
					}

					if ((req.body.supplierCodes[i].defaultCondition !== 'New') && (req.body.supplierCodes[i].defaultCondition !== 'Like New')) {
						invalidInfo.push({
							error: "invalid",
							field: "defaultCondition",
							text: "Default Condition"
						});
					}

					if ((req.body.supplierCodes[i].payPartnerFees !== 'Y') && (req.body.supplierCodes[i].payPartnerFees !== 'N')) {
						invalidInfo.push({
							error: "invalid",
							field: "payPartnerFees",
							text: "Pay Partner Fees"
						});
					}


				}
			}
		}

		validationErrors = validationUtils.finalizeValidationErrors(validationErrors, requiredInfo, invalidInfo);

		resolve(validationErrors);
	});
}


var validateUPCs = async (limit) => {
	var offset = 0;
	var prom = [];
	var resp = {
		validUPCs: 0,
		nullUPCs: 0,
		invalidUPCs: 0,
		nullUPC: [],
		invalidUPC: []
	};
	var sortBy = 'upc ASC';
	var whereInfo = {
		clause: "",
		values: []
	}
	var valid = true;
	var vendors = [];
	var vname = undefined;


	var result = await Vendors.getAllProducts(whereInfo, sortBy, offset, limit);
	while (result.rows.length > 0) {
		var rows = result.rows;
		for (var i = 0; i < rows.length; i++) {
			valid = true;
			if (rows[i].upc === null) {
				vname = await getVendor(vendors, rows[i].vendorId);
				resp.nullUPCs++;
				resp.nullUPC.push({
					id: rows[i].id,
					vendorId: rows[i].vendorId,
					vendorName: vname,
					vendorSku: rows[i].vendorSku
				});
			} else {

				try {
					if (gtin.validate(rows[i].upc.toString()) === false) {
						valid = false;
					}
				} catch (e) {
					if (e.message === 'Barcode is not of a valid format') {
						valid = false;
					}
				}

				if (!valid) {
					vname = await getVendor(vendors, rows[i].vendorId);
					resp.invalidUPCs++;
					resp.invalidUPC.push({
						id: rows[i].id,
						vendorId: rows[i].vendorId,
						vendorName: vname,
						vendorSku: rows[i].vendorSku,
						productName: rows[i].productName,
						upc: rows[i].upc
					})
				} else {
					resp.validUPCs++;
				}
			}

			offset++;
		}
		whereInfo.values = [];
		result = await Vendors.getAllProducts(whereInfo, sortBy, offset, limit);
	}

	return resp;
}


var sameUPCIssues = async (limit) => {
	var resp = {
		vendorsWithDupeUPCs: 0,
		upcsWithMultipleMPNs: 0,
		vendorsWithDupeUPC: [],
		upcsWithMultipleMPN: []
	};
	var vendors = [];
	var vname = undefined;


	//	Get skus that share a UPC
	var rows = await Vendors.getMultipleUPCs();

	// //	Get distinct concatenations of manufacturer and mpn.
	// var manuMPN = await Vendors.getDistinctManuMPN();

	var valid = true;
	for (var i = 0; i < rows.length; i++) {
		try {
			if (gtin.validate(rows[i].upc.toString()) === false) {
				valid = false;
			}
		} catch (e) {
			if (e.message === 'Barcode is not of a valid format') {
				valid = false;
			}
		}

		if (valid) {
			//	Check for duplicate UPC for the same vendor.
			//	Vendors.
			var vendorsWithDupes = await Vendors.getVendorsWithDupeUPCs(rows[i].upc);
			for (var j = 0; j < vendorsWithDupes.length; j++) {
				var discrepData = await Vendors.getDiscrepancyDataByUPCVendor(rows[i].upc, vendorsWithDupes[j].vendorId);

				resp.vendorsWithDupeUPCs++;
				var o = {
					vendorSkus: []
				}
				for (var k = 0; k < discrepData.length; k++) {
					o.vendorSkus.push({
						upc: rows[i].upc,
						vendorName: discrepData[k].vendorName,
						vendorSku: discrepData[k].vendorSku,
						manufacturer: discrepData[k].manufacturer,
						mpn: discrepData[k].mpn
					})
				}

				resp.vendorsWithDupeUPC.push(o);

			}

			//	Check for different Manufacturer MPNs for same UPC.
			var mpns = await Vendors.getUPCsByMPN(rows[i].upc);

			if (mpns.length > 1) {
				var o = {
					mpns: []
				}
				for (var k = 0; k < mpns.length; k++) {
					resp.upcsWithMultipleMPNs++;
					vname = await getVendor(vendors, mpns[k].vendorId);
					o.mpns.push({
						upc: rows[i].upc,
						vendorName: vname,
						vendorSku: mpns[k].vendorSku,
						manufacturer: mpns[k].manufacturer,
						mpn: mpns[k].mpn
					})
				}

				resp.upcsWithMultipleMPN.push(o)
			}

		}

		valid = true;
	}

	return resp;
}






module.exports = {
	createVendorPrefix,
	getVendor,
	sameUPCIssues,
	validateVendor,
	validateUPCs
}