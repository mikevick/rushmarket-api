const app = module.exports = require('express')();
const globals = require('../globals');

//
//	Define API routes
//
app.use(`/${globals.apiVers}/adsFeed`, require('./adsFeed'));
app.use(`/${globals.apiVers}/adRegions`, require('./adRegions'));
app.use(`/${globals.apiVers}/allUsersByType`, require('./allUsersByType'));
app.use(`/${globals.apiVers}/appStatus`, require('./appStatus'));
app.use(`/${globals.apiVers}/appVersions`, require('./appVersions'));
app.use(`/${globals.apiVers}/attributeNameValues`, require('./attributeNameValues'));
app.use(`/${globals.apiVers}/availableRushSkus`, require('./availableRushSkus'));
app.use(`/${globals.apiVers}/barcodes`, require('./barcodes'));
app.use(`/${globals.apiVers}/bubbleMerch`, require('./bubbleMerch'));
app.use(`/${globals.apiVers}/bubbleRanges`, require('./bubbleRanges'));
app.use(`/${globals.apiVers}/bubbleStores`, require('./bubbleStores'));
app.use(`/${globals.apiVers}/carrierSelection`, require('./carrierSelection'));
app.use(`/${globals.apiVers}/cart`, require('./cart'));
app.use(`/${globals.apiVers}/categories`, require('./categories'));
app.use(`/${globals.apiVers}/categoryAttributes`, require('./categoryAttributes'));
app.use(`/${globals.apiVers}/categoryMappings`, require('./categoryMappings'));
app.use(`/${globals.apiVers}/categoryPriceData`, require('./categoryPriceData'));
app.use(`/${globals.apiVers}/categoryProducts`, require('./categoryProducts'));
app.use(`/${globals.apiVers}/coins`, require('./coins'));
app.use(`/${globals.apiVers}/conditions`, require('./conditions'));
app.use(`/${globals.apiVers}/config`, require('./config'));
app.use(`/${globals.apiVers}/crcActivity`, require('./crcActivity'));
app.use(`/${globals.apiVers}/dashboardCards`, require('./dashboardCards'));
app.use(`/${globals.apiVers}/dropshipActivity`, require('./dropshipActivity'));
app.use(`/${globals.apiVers}/emailCaptures`, require('./emailCaptures'));
app.use(`/${globals.apiVers}/emails`, require('./emails'));
app.use(`/${globals.apiVers}/emailTemplates`, require('./emailTemplates'));
app.use(`/${globals.apiVers}/experiment`, require('./experiment'));
app.use(`/${globals.apiVers}/fedexZones`, require('./fedexZones'));
app.use(`/${globals.apiVers}/files`, require('./files'));
app.use(`/${globals.apiVers}/fullInspectionRequired`, require('./fullInspectionRequired'));
app.use(`/${globals.apiVers}/gde`, require('./gde'));
app.use(`/${globals.apiVers}/googleFeed`, require('./googleFeed'));
app.use(`/${globals.apiVers}/jeffData`, require('./jeffData'));
app.use(`/${globals.apiVers}/rates`, require('./rates'));
app.use(`/${globals.apiVers}/fileImageTags`, require('./fileImageTags'));
app.use(`/${globals.apiVers}/fileStorageContexts`, require('./fileStorageContexts'));
app.use(`/${globals.apiVers}/guestOptions`, require('./guestOptions'));
app.use(`/${globals.apiVers}/ids`, require('./ids'));
app.use(`/${globals.apiVers}/imports`, require('./imports'));
app.use(`/${globals.apiVers}/imageResizer`, require('./imageResizer'));
app.use(`/${globals.apiVers}/images`, require('./images'));
app.use(`/${globals.apiVers}/inventory`, require('./inventory'));
app.use(`/${globals.apiVers}/isReadyForOnline`, require('./isReadyForOnline'));
app.use(`/${globals.apiVers}/logMessages`, require('./logging'));
app.use(`/${globals.apiVers}/mailchimpWebhook`, require('./mailchimp'));
app.use(`/${globals.apiVers}/mandrillWebhook`, require('./mandrill'));
app.use(`/${globals.apiVers}/marketplaces`, require('./marketplaces'));
app.use(`/${globals.apiVers}/categoryQuantities`, require('./categoryQuantities'));
app.use(`/${globals.apiVers}/markets`, require('./markets'));
app.use(`/${globals.apiVers}/marketPreviews`, require('./marketPreviews'));
app.use(`/${globals.apiVers}/marketPreviewItems`, require('./marketPreviewItems'));
app.use(`/${globals.apiVers}/metros`, require('./metros'));
app.use(`/${globals.apiVers}/masterData`, require('./masterData'));
app.use(`/${globals.apiVers}/manifests`, require('./manifests'));
app.use(`/${globals.apiVers}/memberFinds`, require('./memberFinds'));
app.use(`/${globals.apiVers}/members`, require('./members'));
app.use(`/${globals.apiVers}/memberCheckouts`, require('./memberCheckouts'));
app.use(`/${globals.apiVers}/memberNotifications`, require('./memberNotifications'));
app.use(`/${globals.apiVers}/memberStats`, require('./memberStats'));
app.use(`/${globals.apiVers}/memberSync`, require('./memberSync'));
app.use(`/${globals.apiVers}/memberTexts`, require('./memberTexts'));
app.use(`/${globals.apiVers}/merchandising`, require('./merchandising'));
app.use(`/${globals.apiVers}/neededOnMarketFloor`, require('./neededOnMarketFloor'));
app.use(`/${globals.apiVers}/onHandReport`, require('./onHandReport'));
app.use(`/${globals.apiVers}/onlinePickups`, require('./onlinePickups'));
app.use(`/${globals.apiVers}/orderLineLog`, require('./orderLineLog'));
app.use(`/${globals.apiVers}/orders`, require('./orders'));
app.use(`/${globals.apiVers}/pallets`, require('./pallets'));
app.use(`/${globals.apiVers}/partnerActivity`, require('./partnerActivity'));
app.use(`/${globals.apiVers}/partnerHub`, require('./partnerHub'));
app.use(`/${globals.apiVers}/partners`, require('./partners'));
app.use(`/${globals.apiVers}/pdfTest`, require('./pdfTest'));
app.use(`/${globals.apiVers}/ping`, require('./pings'));
app.use(`/${globals.apiVers}/productAttributes`, require('./productAttributes'));
app.use(`/${globals.apiVers}/productBuildInspects`, require('./productBuildInspects'));
app.use(`/${globals.apiVers}/productCostRules`, require('./productCostRules'));
app.use(`/${globals.apiVers}/productDamagePricingRules`, require('./productDamagePricingRules'));
app.use(`/${globals.apiVers}/productDataIssuesQueue`, require('./productDataIssuesQueue'));
app.use(`/${globals.apiVers}/productDisposalFeeRules`, require('./productDisposalFeeRules'));
app.use(`/${globals.apiVers}/productDisplayAttributes`, require('./productDisplayAttributes'));
app.use(`/${globals.apiVers}/productFeedbackTypes`, require('./productFeedbackTypes'));
app.use(`/${globals.apiVers}/productHolds`, require('./productHolds'));
app.use(`/${globals.apiVers}/productMissingHardwareRules`, require('./productMissingHardwareRules'));
app.use(`/${globals.apiVers}/productProcessingFeeRules`, require('./productProcessingFeeRules'));
app.use(`/${globals.apiVers}/products`, require('./products'));
app.use(`/${globals.apiVers}/productVerificationAttributes`, require('./productVerificationAttributes'));
app.use(`/${globals.apiVers}/promotions`, require('./promotions'));
app.use(`/${globals.apiVers}/routing`, require('./routing'));
app.use(`/${globals.apiVers}/reports`, require('./reports'))
app.use(`/${globals.apiVers}/rushProducts`, require('./rushProducts'));
app.use(`/${globals.apiVers}/rushProductPrice`, require('./rushProductPrice'));
app.use(`/${globals.apiVers}/outlets`, require('./outlets'));
app.use(`/${globals.apiVers}/sessions`, require('./sessions'));
app.use(`/${globals.apiVers}/shipCalc`, require('./shipCalc'));
app.use(`/${globals.apiVers}/shopifyStores`, require('./shopifyStores'));
app.use(`/${globals.apiVers}/tasks`, require('./scheduledTasks'));
app.use(`/${globals.apiVers}/shopifyProductListing`, require('./shopifyProductListing'));
app.use(`/${globals.apiVers}/shopifyWebhook`, require('./shopify'));
app.use(`/${globals.apiVers}/storageAreas`, require('./storageAreas'));
app.use(`/${globals.apiVers}/storeInfo`, require('./storeInfo'));
app.use(`/${globals.apiVers}/storageLocations`, require('./storageLocations'));
app.use(`/${globals.apiVers}/stores`, require('./stores'));
app.use(`/${globals.apiVers}/supplierCodes`, require('./supplierCodes'));
app.use(`/${globals.apiVers}/supplierCodeSuffix`, require('./supplierCodeSuffix'));
app.use(`/${globals.apiVers}/taxonomies`, require('./taxonomies'));
app.use(`/${globals.apiVers}/targetedCities`, require('./targetedCities'));
app.use(`/${globals.apiVers}/telemetries`, require('./telemetry'));
app.use(`/${globals.apiVers}/templatedEmails`, require('./templatedEmails'));
app.use(`/${globals.apiVers}/tidbitQuestions`, require('./tidbitQuestions'));
app.use(`/${globals.apiVers}/tidbitTypes`, require('./tidbitTypes'));
app.use(`/${globals.apiVers}/users`, require('./users'));
app.use(`/${globals.apiVers}/userTypes`, require('./userTypes'));
app.use(`/${globals.apiVers}/validateToken`, require('./validateTokens'));
app.use(`/${globals.apiVers}/vcGDE`, require('./vcGDE'));
app.use(`/${globals.apiVers}/vendors`, require('./vendors'));
app.use(`/${globals.apiVers}/vendorPartnerTypes`, require('./vendorPartnerTypes'));
app.use(`/${globals.apiVers}/vendorProductChangeLogs`, require('./vendorProductChangeLogs'));
app.use(`/${globals.apiVers}/vendorSkus`, require('./vendorSkus'));
app.use(`/${globals.apiVers}/web`, require('./web'));
app.use(`/${globals.apiVers}/weeklyInspectionAccuracy`, require('./weeklyInspectionAccuracy'));
app.use(`/${globals.apiVers}/zipToCity`, require('./zipToCity'));
