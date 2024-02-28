if ((process.env.NODE_ENV === 'prod') && (process.env.APPINSIGHTS_INSTRUMENTATIONKEY != undefined)) {
	const appInsights = require("applicationinsights");
	appInsights.setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY)
	appInsights.start();
} 

// const fs = require('fs');
const comms = require('./utils/comms');
try {
	// fs.appendFileSync("debug.txt", new Date() + "\r\n");
	// fs.appendFileSync("debug.txt", "top of server.js\r\n");
	'use strict';

	const blocked = require('blocked-at')
	const bodyParser = require('body-parser');
	const cors = require('cors');


	const compression = require('compression');
	const express = require('express');
	// const expressGraphql = require('express-graphql');
	// const { buildSchema } = require('graphql');
	const MongoId = require('mongoid-js').MongoId;
	const mung = require('express-mung');
	const mysql = require('promise-mysql');

	const globals = require('./globals');

	const appIds = require('./actions/appIds');

	const routes = require('./routes');

	const configUtils = require('./utils/configUtils');
	const exceptions = require('./utils/logUtils');
	const fileUtils = require('./utils/fileUtils');
	const memberText = require('./utils/memberTextUtils');
	const shopifyUtils = require('./utils/shopifyUtils');
	const sqlUtils = require('./utils/sqlUtils');
	const storeUtils = require('./utils/storeUtils');
	const telemUtils = require('./utils/telemetry');



	// blocked((time, stack) => {
	// 	console.log(`Blocked for ${time}ms, operation started here:` + JSON.stringify(stack, undefined, 2));
	// }, {threshold: process.env.BLOCKED_THRESHOLD ? process.env.BLOCKED_THRESHOLD : 500})


	//
	//	Init mongo ID generator
	//
	globals.mongoid = new MongoId(process.env.systemid ? process.env.systemid : 1);


	if ((process.env.DB_HOST === undefined) ||
		(process.env.DB_USER === undefined) ||
		(process.env.DB_PSWD === undefined) ||
		(process.env.DB === undefined) ||
		(process.env.DB_TIMEOUT === undefined) ||
		(process.env.DB_ACQUIRE_TIMEOUT === undefined) ||
		(process.env.DB_CONN_LIMIT === undefined) ||
		(process.env.DB_CONN_TIMEOUT === undefined)) {
		console.log("Database variables not defined.");
		process.exit();
	}
	// fs.appendFileSync("debug.txt", require('os').arch() + " " + process.env.DB_HOST + " " + process.env.DB_USER + "\r\n");
	console.log(require('os').arch() + " " + process.env.DB_HOST + " " + process.env.DB_USER);


	var prom = [];

	
	//
	//	Init mysql connection pool.
	//
	// fs.appendFileSync("debug.txt", "Initializing coreleap connection pool...\r\n");
	console.log("Initializing coreleap connection pool..." + process.env.DB_USER + " / " + process.env.DB_HOST);
	prom.push(mysql.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PSWD,
		database: process.env.DB,
		connectionLimit: parseInt(process.env.DB_CONN_LIMIT),
		connectTimeout: parseInt(process.env.DB_CONN_TIMEOUT),
		acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT),
		timeout: parseInt(process.env.DB_TIMEOUT)
	}));


	//
	//	Init mysql connection pool.
	//
	// fs.appendFileSync("debug.txt", "Initializing coreleap connection pool...\r\n");
	console.log("Initializing coreleap RO connection pool... " + process.env.DB_RO_USER + " / " + process.env.DB_RO_HOST);
	prom.push(mysql.createPool({
		host: process.env.DB_RO_HOST,
		user: process.env.DB_RO_USER,
		password: process.env.DB_RO_PSWD,
		database: process.env.DB,
		connectionLimit: parseInt(process.env.DB_CONN_LIMIT),
		connectTimeout: parseInt(process.env.DB_CONN_TIMEOUT),
		acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT),
		timeout: parseInt(process.env.DB_TIMEOUT)
	}));


	//
	//	Init mysql connection pool.
	//

	// fs.appendFileSync("debug.txt", "Initializing product connection pool...\r\n");
	console.log("Initializing product connection pool...");
	prom.push(mysql.createPool({
		host: process.env.PRODUCT_DB_HOST,
		user: process.env.PRODUCT_DB_USER,
		password: process.env.PRODUCT_DB_PSWD,
		database: process.env.PRODUCT_DB,
		connectionLimit: parseInt(process.env.PRODUCT_DB_CONN_LIMIT),
		connectTimeout: parseInt(process.env.PRODUCT_DB_CONN_TIMEOUT),
		acquireTimeout: parseInt(process.env.PRODUCT_DB_ACQUIRE_TIMEOUT),
		timeout: parseInt(process.env.PRODUCT_DB_TIMEOUT)
	}));


	//
	//	Init mysql connection pool.
	//

	// fs.appendFileSync("debug.txt", "Initializing product connection pool...\r\n");
	console.log("Initializing product RO connection pool...");
	prom.push(mysql.createPool({
		host: process.env.PRODUCT_DB_RO_HOST,
		user: process.env.PRODUCT_DB_RO_USER,
		password: process.env.PRODUCT_DB_RO_PSWD,
		database: process.env.PRODUCT_DB,
		connectionLimit: parseInt(process.env.PRODUCT_DB_CONN_LIMIT),
		connectTimeout: parseInt(process.env.PRODUCT_DB_CONN_TIMEOUT),
		acquireTimeout: parseInt(process.env.PRODUCT_DB_ACQUIRE_TIMEOUT),
		timeout: parseInt(process.env.PRODUCT_DB_TIMEOUT)
	}));

	//
	//	Init mysql connection pool.
	//

	// fs.appendFileSync("debug.txt", "Initializing product connection pool...\r\n");
	console.log("Initializing log connection pool...");
	prom.push(mysql.createPool({
		host: process.env.LOG_DB_HOST,
		user: process.env.LOG_DB_USER,
		password: process.env.LOG_DB_PSWD,
		database: process.env.LOG_DB,
		connectionLimit: parseInt(process.env.LOG_DB_CONN_LIMIT),
		connectTimeout: parseInt(process.env.LOG_DB_CONN_TIMEOUT),
		acquireTimeout: parseInt(process.env.LOG_DB_ACQUIRE_TIMEOUT),
		timeout: parseInt(process.env.LOG_DB_TIMEOUT)
	}));



	Promise.all(prom).then((poolResult) => {
		globals.pool = poolResult[0];
		globals.poolRO = poolResult[1];
		globals.productPool = poolResult[2];
		globals.productROPool = poolResult[3];
		globals.logPool = poolResult[4];

		//
		//  Load cached info.
		//
		configUtils.load();
		memberText.load();
		shopifyUtils.loadKeys();
		fileUtils.loadContexts();
		storeUtils.loadHoursAndCutoffs();
	})
	.catch((e) => {
		throw(e);
	})

	//
	//	Catch leaking promise rejections.
	//
	process.on('unhandledRejection', error => {
		console.log("UnhandledRejection: " + error);
		exceptions.logException(error);
		// comms.sendEmail('matt@rushmarket.com', 'Unhandled Rejection', error, error);
	});


	//
	//	Catch uncaught exceptions.
	//
	process.on('uncaughtException', (error, origin) => {
		console.log("Uncaught Exception: " + error + '/n' + origin);
		exceptions.logException(error);
		// comms.sendEmail('matt@rushmarket.com', 'Uncaught Exception', error + '/n' + origin, error + '/n' + origin);
		// process.exit(1);
	});


	//
	//	Init express framework.
	//
	var app = express();
	app.use(cors());
	app.use(compression());

	//	Parse request bodies into JSON objects
	try {
		app.use(bodyParser.json({
			limit: 1024 * 1024 * process.env.MAX_REQ_BODY_MB
		}));
	} catch (e) {
		console.log("Exception: " + e);
	}

	app.use(bodyParser.urlencoded({
		extended: false
	}));


	//	Validate request API key and log telemetry
	app.use(function (req, res, next) {
		var id = req.get('x-app-id');

		appIds.appIdCheck(req, id)
			.then((result) => {
				if (!result) {
					res.statusCode = 403;
					res.send();
				} else {
					var p = null;
					if (req.body.password != undefined) {
						p = req.body.password;
						req.body.password = 'REDACTED';
					}

					telemUtils.log(req, res).then((resp) => {

						if (req.body.password != undefined) {
							req.body.password = p;
						}
						next();
					}, (errorMessage) => {
						console.log(new Date() + " Telem middleware exception " + errorMessage);

						comms.sendEmail('matt@rushmarket.com', 'Telem Middleware Exception', errorMessage, errorMessage);
						res.send(errorMessage);
					});
				}
			})
	})

	//	Capture and log the API response.
	app.use(mung.json(
		function transform(body, req, res) {
			res.removeHeader("X-Powered-By");
			telemUtils.logResponse(req, res, body).then((resp) => {}, (errorMessage) => {
				res.removeHeader("X-Powered-By");
				res.send(errorMessage);
				console.log("Telem Response Error" + errorMessage);
			});
			return body;
		}, {
			mungError: true
		}
	))


	//	Map our API routes.
	app.use(routes);

	app.get('*', function (req, res, next) {
		res.status(404).send({
			statusCode: 404,
			message: 'Page Not Found'
		});
	});

	//	Generalized Error Handling for routes not otherwise defined.
	// app.use(function(req, res, next) {
	// 	let err = new Error('Page Not Found');
	// 	err.statusCode = 404;
	// 	next(err);
	// });

	//	Error-handling
	app.use(function (err, req, res, next) {
		console.log("Error-Handling Middleware (" + process.env.NODE_ENV + ") " + err.message);
		console.log("Error-Handling Middleware (" + process.env.NODE_ENV + ") " + JSON.stringify(err, undefined, 2));
		comms.sendEmail('matt@rushmarket.com', 'Error-Handling Middleware Exception', err.message + ": " + req.originalUrl + " " + JSON.stringify(req.body, undefined, 2) + " " + JSON.stringify(err.stack, undefined, 2), err.message + ": " + req.originalUrl + " " + JSON.stringify(req.body, undefined, 2) + " " + JSON.stringify(err.stack, undefined, 2));
		if (!err.statusCode) err.statusCode = 500;
		res.status(err.statusCode).send(err.message);
	})

  
	//
	//	Listen for incoming requests.
	//
	var port = process.env.PORT ? process.env.PORT : 3000;
	var server = app.listen(port, () => {
		console.log(`API Version ${globals.apiVers} running on ${require('os').arch()} port ${port}...`);
		if (process.env.SHOW_GLOBALS) {
			console.log('Globals: ' + JSON.stringify(globals, undefined, 2));
		}
	});
	server.keepAliveTimeout = 0;

} catch (e) {
	// fs.appendFileSync("debug.txt", "Catch " + e);
	console.log("Catch " + e + "\n\n" + JSON.stringify(e, undefined, 2));
	comms.sendEmail('matt@rushmarket.com', 'Server.js Exception (' + process.env.NODE_ENV + ')', e, e);
	comms.sendEmail('matt@rushmarket.com', 'Server.js Exception (' + process.env.NODE_ENV + ')', e.message, e.message);
}