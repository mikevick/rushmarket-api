const memberText = require('./memberTextUtils');

var finalizeValidationErrors = (validationErrors, requiredInfo, invalidInfo) => {
	var invalid = "";
	var required = "";

	for (var i = 0; i < invalidInfo.length; i++) {
		if (invalid.length > 0) {
			invalid = invalid + ", ";
		}
		invalid = invalid + invalidInfo[i].text;
	}

	if (invalid.length > 0) {
		validationErrors.message = validationErrors.message + " " + memberText.get("INVALID").replace('%invalid%', invalid);
	}


	for (var i = 0; i < requiredInfo.length; i++) {
		if (required.length > 0) {
			required = required + ", ";
		}
		required = required + requiredInfo[i].text;
	}

	if (required.length > 0) {
		validationErrors.message = validationErrors.message + " " + memberText.get("MISSING_REQUIRED").replace('%required%', required);
	}


	validationErrors.errorDetails = validationErrors.errorDetails.concat(requiredInfo);
	validationErrors.errorDetails = validationErrors.errorDetails.concat(invalidInfo);
	validationErrors.message = validationErrors.message.trim();

	return validationErrors;
}



module.exports = {
	finalizeValidationErrors
}