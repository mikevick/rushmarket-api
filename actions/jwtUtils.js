'use strict';

const jwt = require('jsonwebtoken');

const globals = require('../globals');
const memberText = require('../utils/memberTextUtils');



//
//	Sign the token identifying the signing organization which will provide an extra layer of validation.
//
var signToken = (obj) => {
	obj.signingOrganization = 'CORELEAP';

	var j = jwt.sign(obj, process.env.JWT_SECRET_KEY);
	return j;
}




//
//	Route middleware to verify a token
//
var verifyToken = (req, res, next) => {
	try {
		// check header or url parameters or post parameters for token
		var token = req.body.token || req.query.token || req.get('x-access-token');

		// verify token
		if (token) {
			// var decoded = jwt.decode(token, {complete: true});
			// console.log(decoded.header);
			// console.log(decoded.payload);

			// verifies secret and checks exp
			jwt.verify(token, process.env.JWT_SECRET_KEY, async function (err, decoded) {
				if (err) {
					return res.status(401).json({
						statusCode: 401,
						message: memberText.get("TOK_AUTH_FAIL")
					});
				} else {
					//	Validate this token.
					var rows = await validateToken(decoded, token);


					// if everything is good, save the encoded information to request for use in other routes
					// if ((rows.length === 1) && (decoded.signingOrganization != undefined) && (decoded.signingOrganization === 'CORELEAP')) {
					if (rows && rows.length === 1) {
						req.decoded = decoded;
						if (req.query.bypassNext === undefined) {
							next();
						}
					} else {
						return res.status(401).json({
							statusCode: 401,
							message: memberText.get("TOK_AUTH_FAIL")
						});
					}
				}
			});

		} else {

			if (req.get('x-app-type') === 'INT') {
				next();
			} else {
				// if there is no token
				// return an error
				return res.status(401).send({
					statusCode: 401,
					message: memberText.get("TOK_MISSING")
				});
			}
		}
	} catch (e) {
		console.log(e);
	}
};


//
//	Inline function to verify a token
//
var verifyTokenInline = async (req, resp) => {
	try {
		// check header or url parameters or post parameters for token
		var token = req.body.token || req.query.token || req.get('x-access-token');

		// verify token
		if (token) {
			// verifies secret and checks exp
			resp = await jwt.verify(token, process.env.JWT_SECRET_KEY, async function (err, decoded) {
				if (err) {
					resp.statusCode = 401;
					resp.message = memberText.get("TOK_AUTH_FAIL");
					return resp;
				} else {
					//	Validate this token.
					var rows = await validateToken(decoded, token);

					// if everything is good, save the encoded information to request
					if (rows.length === 1) {
						req.decoded = decoded;
						return resp;
					} else {
						resp.statusCode = 401;
						resp.message = memberText.get("TOK_AUTH_FAIL");
						return resp;
					}

				}
			});

			return resp;
		} else {

			if (req.get('x-app-type') === 'INT') {
				return resp;
			} else {
				// if there is no token return an error
				resp.statusCode = 401;
				resp.message = memberText.get("TOK_AUTH_FAIL");
				return resp;
			}
		}
	} catch (e) {
		console.log(e);
	}

	return resp;
};


var validateToken = async (decoded, token) => {
	var rows = null;

	try {
		var conn = await globals.pool.getConnection();
		if (decoded.memberId !== undefined) {
			rows = await conn.query("SELECT * FROM member_logins WHERE member_id = ? AND active_flag = true AND auth_token = ?", [decoded.memberId, token]);
		} else if (decoded.userId !== undefined) {
			rows = await conn.query("SELECT * FROM user_logins WHERE user_id = ? AND active_flag = true AND auth_token = ?", [decoded.userId, token]);
		} else if (decoded.identity !== undefined) {
			if (decoded.identity.partnerId) {
				if (decoded.identity.userId) {
					rows = await conn.query("SELECT * FROM partner_logins WHERE partner_id = ? AND user_id = ? AND active_flag = true AND auth_token = ?", [decoded.identity.partnerId, decoded.identity.userId, token]);
				}
				else {
					rows = await conn.query("SELECT * FROM partner_logins WHERE partner_id = ? AND user_id IS NULL AND active_flag = true AND auth_token = ?", [decoded.partnerId, token]);
				}
			}
		} else if (decoded.vendorId !== undefined) {
			rows = await conn.query("SELECT * FROM vendor_logins WHERE vendor_id = ? AND active_flag = true AND auth_token = ?", [decoded.vendorId, token]);
		} else if (decoded.sessionId !== undefined) {
			rows = await conn.query("SELECT * FROM sessions WHERE id = ? AND auth_token = ?", [decoded.sessionId, token]);;
		}

	} catch (e) {
		throw new Error("Token lookup exception " + e.message);
	} finally {
		conn.release();
	}

	return rows;
}



module.exports = {
	signToken,
	verifyToken,
	verifyTokenInline
}