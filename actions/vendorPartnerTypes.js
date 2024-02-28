'use strict'

const VendorPartnerTypes = require('../models/vendorPartnerTypes');


var setVendorPartnerTypes = async (vendorId, partnerTypes, req, resp) => {

    //get type ids for the type list
    let partnerTypesList = [];
    let partnerTypesResp = await VendorPartnerTypes.getPartnerTypesByType(partnerTypes);
    partnerTypesResp.forEach(type => partnerTypesList.push(type.id));
    //get current types stored for vendor
    let vendorPartnerTypesResp = await VendorPartnerTypes.getVendorToPartnerTypesByVendorId(vendorId);
    let i=0;
    for (i=0; i<vendorPartnerTypesResp.length; i++) {
        if (!partnerTypesList.includes(vendorPartnerTypesResp[i]['partnerType'])) {
            VendorPartnerTypes.deleteVendorToPartnerType(vendorPartnerTypesResp[i]['id']);
        } else {
            partnerTypesResp = partnerTypesResp.filter(type => type.id != vendorPartnerTypesResp[i]['partnerType']);
        }
    }

    let j=0;
    for (j=0; j<partnerTypesResp.length; j++) {
        VendorPartnerTypes.createVendorToPartnerType(vendorId, partnerTypesResp[j]['id']);
    }
	return resp;
};

module.exports = {
	setVendorPartnerTypes
}