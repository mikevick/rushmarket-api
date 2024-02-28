const router = require("express").Router();

const jwtUtils = require("../../actions/jwtUtils");
const logUtils = require("../../utils/logUtils");
const reportHelper = require("../../utils/reportHelper");
const comms = require("../../utils/comms");
const configUtils = require("../../utils/configUtils");
const fileUtils = require("../../utils/fileUtils");
const fs = require("fs").promises;

const {
  respond,
  SUCCESS_RESPONSE,
  ACCESS_DENIED_RESPONSE,
} = require("../../utils/response");

const vendorCatalog = require("../../actions/vendorCatalogService");

const INTERNAL_APP_TYPE = "INT";
const INTERNAL_APP_HEADER = "x-app-type";

const REPORT_TITLE = "Product Creation Report";
const FILE_NAME = "weekly-production-creation-report.xlsx";
const FILE_PATH = "upload/";

/**
 * Used to generate a report for products created in the last 7 days
 */
router.get("/", jwtUtils.verifyToken, async (req, res, next) => {
  if (req.get(INTERNAL_APP_HEADER) !== INTERNAL_APP_TYPE) {
    return respond(ACCESS_DENIED_RESPONSE, res, next);
  }

  try {
    const productsCreated = await vendorCatalog.getProductsCreatedWithinDays(
      7
    );

    if (productsCreated.length === 0) {
      return res.send(404, { message: "Error: No products found" });
    }

    const report = reportHelper.generateReport(productsCreated, REPORT_TITLE);
    await report.xlsx.writeFile(FILE_PATH + FILE_NAME);

    const storageContext = fileUtils.getContext("CATALOG", "UNIQUE");

    const results = await fileUtils.storeMultipartFile(
      storageContext,
      FILE_PATH + FILE_NAME,
      FILE_PATH + FILE_NAME,
      FILE_NAME,
      false
    );

    const weeklyProductCreationRecievers = configUtils.get(
      "WEEKLY_PRODUCT_CREATION_EMAILS"
    );
    const reciever =
      weeklyProductCreationRecievers != null
        ? weeklyProductCreationRecievers
        : "sescalante@rushmarket.com";

    if (results.url !== null && results.url !== "") {
      comms.sendEmail(
        reciever,
        "VC Product Creation Report",
        "",
        `<br><br><b><a href="${results.url}">Product Creation Report</a>`,
        "noreply@rushmarket.com",
        undefined,
        undefined
      );
    }

    // Remove the local exported products file.
    await fs.unlink(FILE_PATH + FILE_NAME);

    return respond(SUCCESS_RESPONSE, res, next);
  } catch (error) {
    logUtils.logException(error)
    return res.send(500, { message: "System error has occurred." });
  }
});

module.exports = router;
