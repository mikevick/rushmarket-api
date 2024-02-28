const GDE = require('../models/gdeModel');
const Partners = require('../models/partners');
const RushProducts = require('../models/rushProducts');
const Vendors = require('../models/vendors');
const ZipToCity = require('../models/zipToCity');

exports.get = async (skus, destZip, resp) => {
	resp.data.carriers = [];

	for (var i = 0; i < skus.length; i++) {
		var carrier = 'National';

		//	Get the products city, manifest source and carrier if there is one and ship types supported for that zip.
		var productCandC = await RushProducts.getProductCityAndCarrier(skus[i], destZip);

		// If there isn't a product or it's dropship product or a carrier or a ship type, it's National.
		if ((productCandC.length === 0) || (productCandC[0].manifestSource === 'DS') ||
			(productCandC[0].originCarrierId === null) || (productCandC[0].destCarrierId === null) || (productCandC[0].originCarrierId !== productCandC[0].destCarrierId) ||
			(productCandC[0].productShipType === null) || (productCandC[0].destCarrierShipType === null)) {
			carrier = 'National';
		} else {
			//	Get ship type for product
			var shipType = productCandC[0].productShipType;
			
			if (shipType === null) {
				shipType = await Vendors.getProductByVendorSku(productCandC[0].vendorId, productCandC[0].sellerProductId);
				if (shipType.length > 0) {
					shipType = shipType[0].shipType;
				}
				else {
					shipType = null;
				}
			}
			for (var j = 0; j < productCandC.length; j++) {
				//	If the carrier supports the 
				if ((((shipType === null) || (shipType.toLowerCase() === 'small parcel')) && (productCandC[j].destCarrierShipType.toLowerCase() === 'small parcel')) ||
					((shipType !== null) && (shipType.toLowerCase() === 'ltl') && (productCandC[j].destCarrierShipType.toLowerCase() === 'ltl'))) {
					carrier = 'Local'
				}
			}
		}

		resp.data.carriers.push({
			sku: skus[i],
			destZip: destZip,
			carrier: carrier
		})
	}

	return resp;
}

const SMALL_PARCEL = 'Small Parcel';
const LTL = 'LTL';
exports.isRrcOrderLocalDelivery = async (productStoreId, destZip, skus) => {
	const zipToCity = await ZipToCity.getByZipCode(destZip);

	const products = (
		await Promise.all(skus.map(async sku => {
			const product = await RushProducts.getSku(sku).then(rows => rows?.[0]);
			if (!product) {
				return;
			}

			// if shipType not present on the product, try to obtain it from the vendor catalog
			if (!product.shipType && product.vendorId && product.sellerProductId) {
				const vcp = await Vendors.getProductByVendorSku(product.vendorId, product.sellerProductId).then(rows => rows?.[0]);
				product.shipType = vcp?.shipType;
			}

			// else default to Small Parcel
			if (!product.shipType) {
				product.shipType = SMALL_PARCEL;
			}

			const gdeData = zipToCity && await GDE.getGDEData(sku, zipToCity.cityId).then(rows => rows?.[0]);
			product.localShipCost = gdeData?.localShipCost;
			product.nationalShipCost = gdeData?.nationalShipCost;

			return product;
		})))
		.filter(product => product);

	const includesUnknownProduct = products.length !== skus.length;
	if (includesUnknownProduct) {
		return false;
	}

	const partner = await Partners.getByStoreId(productStoreId);
	if (!partner) {
		return false;
	}

	const includesLtl = !!products.find(product => product.shipType === LTL);
	if (includesLtl) {
		return partner.handleLtl && await Partners.getFacilityLocalZip(destZip, partner.facilityId, LTL);
	}

	const validShipCosts = products.reduce((valid, product) =>
		valid && (typeof product.localShipCost === 'number' && product.localShipCost > 0 &&
			typeof product.nationalShipCost === 'number' && product.nationalShipCost > 0), true);

	if (validShipCosts) {
		const localShipCost = products.reduce((sum, product) => sum + product.localShipCost, 0);
		const nationalShipCost = products.reduce((sum, product) => sum + product.nationalShipCost, 0);
		return localShipCost <= nationalShipCost &&
			((partner.handleSp && await Partners.getFacilityLocalZip(destZip, partner.facilityId, SMALL_PARCEL)) ||
			(partner.handleLtl && await Partners.getFacilityLocalZip(destZip, partner.facilityId, LTL)));
	}

	return partner.handleSp && await Partners.getFacilityLocalZip(destZip, partner.facilityId, SMALL_PARCEL);
}
