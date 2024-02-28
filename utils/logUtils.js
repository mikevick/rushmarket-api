'use strict';

const Logging = require('../models/logging')


//
//	General route controller exception handling function
//
var routeExceptions = (e, req, res, next, resp, properties) => {

	// prune unnecessary elements of the response
	if (properties != undefined) {
		for (var i = 0; i < properties.length; i++) {
			delete resp[properties[i]];
		}
	}

	if (req != undefined) {
		logException(e, req);
	}
	resp.statusCode = 500;
	resp.message = e.message ? e.message : 'System error has occurred.';

	if (res != undefined) {
		res.status(resp.statusCode);
		res.send(resp)
		// next();
	}
}



//
//	General exception handling function
//
var handleExceptions = (e, resp, properties, resolve, reject, req, res) => {
	var prom = [];

	if (resp != undefined) {
		// prune unnecessary elements of the response
		if (properties != undefined) {
			for (var i = 0; i < properties.length; i++) {
				delete resp[properties[i]];
			}
		}

		if (req != undefined) {
			prom.push(logException(e, req));
		}
		resp.statusCode = 500;
		resp.message = e.message ? e.message : 'System error has occurred.';

		if ((res != undefined) && (res != null)) {
			res.status(resp.statusCode);
			res.send(resp)
			// next();
		}
	} else {
		reject(e)
	}
}


var logExceptionAndResolve = (error, req) => {
	logException(error, req);
}

//
//	Log API exceptions.
//
var logException = (error, req) => {
	return new Promise((resolve, reject) => {
		try {
			var sessionId = null;

			if ((req != undefined) && (req.query.sessionId != undefined)) {
				sessionId = req.query.sessionId;
			}

			var msg = null;
			if (typeof error === 'string') {
				msg = error;
			}
			else {
				msg = error ? error.message ? error.message : null : null;
			}
			var stackTrace = error ? error.stack ? error.stack : null : null;

			log({
					severity: 'ERROR',
					type: 'API',
					message: msg,
					sessionId: sessionId,
					stackTrace: stackTrace
				})
				.then((id) => {
					resolve(id);

				})
				.catch((e) => {
					reject(e);
				})

		} catch (e) {
			reject(e);
		}
	});
}


var log = (event) => {
	return new Promise((resolve, reject) => {
		try {
			var conn = null;
			var epochMilliseconds = new Date().getTime();
			var severity = 'INFO';
			var type = 'GENERAL';
			var msg = null;
			var sessionId = null;
			var stack = null;

			if ((event.epochMilliseconds != undefined) && (event.epochMilliseconds != null)) {
				epochMilliseconds = event.epochMilliseconds;
			}
			if ((event.severity != undefined) && (event.severity != null)) {
				severity = event.severity;
			}
			if ((event.type != undefined) && (event.type != null)) {
				type = event.type;
			}
			if ((event.message != undefined) && (event.message != null)) {
				msg = `'${event.message}'`;
			}
			if ((event.sessionId != undefined) && (event.sessionId != null)) {
				sessionId = `'${event.sessionId}'`;
			}
			if (event.stackTrace != undefined) {
				stack = `'${event.stackTrace}'`;
			}

			
			if ((msg !== null) && (msg.length > 4096)) {
				msg = msg.substring(0,4090);
			}


			Logging.create(epochMilliseconds, severity, type, msg, sessionId, stack)
				.then((id) => {
					resolve(id);
				})
				.catch((e) => {
					reject(e);
				})

		} catch (e) {
			reject(e);
		}
	});
}


var showTimeDiff = (label, lastTime) => {
	var newTime = new Date().getTime();
	console.log(`${label} - ${newTime - lastTime}`);
	return newTime;
}




module.exports = {
	handleExceptions,
	routeExceptions,
	log,
	logException,
	logExceptionAndResolve,
	showTimeDiff
}