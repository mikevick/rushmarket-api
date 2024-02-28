'use strict';

var formatResp = (resp, properties, statusCode, message, errors) => {
	// prune unnecessary elements of the response
	if (properties != undefined) {
		for (var i = 0; i < properties.length; i++) {
			delete resp[properties[i]];
		}
	}

	if ((statusCode != undefined) && (statusCode != null)) {
    resp.statusCode = statusCode;
  }
  if ((message != undefined) && (message != null)) {
    resp.message = message;
  }
  if ((errors != undefined) && (errors != null)) {
    resp.errorDetails = errors;
	}
	
	return resp;
}

var respond = (resp, res, next, properties, statusCode, message, errors) => {
	resp = formatResp(resp, properties, statusCode, message, errors);
  res.status(resp.statusCode);
  res.send(resp);
}

const SUCCESS_RESPONSE = {
	statusCode: 200,
	message: "Success.",
	data: {}
}

const ACCESS_DENIED_RESPONSE = {
	statusCode: 403,
	message: "Access denied.",
	data: {}
}

module.exports = { 
	formatResp,
	respond,
	SUCCESS_RESPONSE,
	ACCESS_DENIED_RESPONSE
}
