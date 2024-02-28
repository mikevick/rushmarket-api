const express = require('express');
const router = express.Router();

const jwtUtils = require('../actions/jwtUtils');
const {
	respond
} = require('../utils/response');


//
//  GET /validateToken
//
router.get(`/`, jwtUtils.verifyToken, (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
		};

		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["data"]);
	}
});


module.exports = router;