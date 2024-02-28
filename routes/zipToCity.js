'use strict';

const _ = require('lodash');
const express = require('express');
const multer = require('multer');
const os = require('os');
const fs = require('fs');
const router = express.Router();

const {
	addZips,
	deleteZips,
	getAll,
	runLocationCalculations,
	updateType,
	updateLocations
} = require('../actions/zipToCity');

const { 
	processZips
} = require('../actions/memberMovements')

const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const { respond } = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//
//  GET /zipToCity
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		};
		var sortBy = "city_id";
		var whereInfo = {
			clause: '',
			values: []
		};

		if (req.get('x-app-type') != 'INT') {
			respond(resp, res, next, undefined, 403, "Access denied.");
		} else {

			if (req.query.cityId) {
				if (req.query.cityId.indexOf(',') >= 0) {
					var s = _.split(req.query.cityId, ',')
					var placeholders = '';
					for (var i = 0; i < s.length; i++) {
						if (placeholders.length > 0) {
							placeholders += ', ';
						}
						placeholders += '?';
					}
					whereInfo = sqlUtils.appendWhere(whereInfo, 'city_id IN (' + placeholders + ')', s);
				} else {
					whereInfo = sqlUtils.appendWhere(whereInfo, 'city_id = ?', req.query.cityId);
				}
			}

			if (req.query.sortBy) {
				sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['zip', 'type']);

				if (sortBy === 'field') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
				} else if (sortBy === 'direction') {
					respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
				}
			}


			resp = await getAll(whereInfo, sortBy, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})


//
//  POST /zipToCity
//
router.post(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: "Success.",
			data: {}
		};


		if ((req.body.type !== undefined) && (req.body.type !== 'PRIMARY') && (req.body.type !== 'SECONDARY')) {
			delete resp.data;
			respond(resp, res, next, ["id"], 400, memberText.get("INVALID").replace('%invalid%', "type"));
		}
		else if ((req.body.cityId === undefined) || (req.body.zips === undefined) || (req.body.type === undefined)) {
			delete resp.data;
			respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "cityId, zips, type"));
		} else {

			resp = await addZips(req.body, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  PUT /zipToCity
//
router.put(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};


		if ((req.body.type !== undefined) && (req.body.type !== 'PRIMARY') && (req.body.type !== 'SECONDARY')) {
			delete resp.data;
			respond(resp, res, next, ["id"], 400, memberText.get("INVALID").replace('%invalid%', "type"));
		}
		else if (req.body.type === undefined) {
			delete resp.data;
			respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "type"));
		} else {

			resp = await updateType(req.body, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});


//
//  DELETE /zipToCity
//
router.delete(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Success.",
			data: {}
		};


		if ((req.body.cityId === undefined) || (req.body.zips === undefined)) {
			respond(resp, res, next, ["id"], 400, memberText.get("MISSING_REQUIRED").replace('%required%', "cityId, zips"));
		} else {

			resp = await deleteZips(req.body, resp);
			respond(resp, res, next);
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});



const upload = multer({ dest: os.tmpdir() });
router.post('/updateLocations', upload.single('zipDataCsvFile'), async (req, res, next) => {
	try {
		if (req.get('x-app-type') !== 'INT') {
			respond({}, res, next, [], 403, "Access denied.");
			return;
		}

		const updatedLocations = await updateLocations(req.file);
		const updatedStores = await runLocationCalculations();

		try {
			// delete the uploaded file after processing complete
			fs.unlinkSync(req.file.path);
		} catch(e) {
			const error = new Error(`Failed to clean up zip data CSV file after upload:\n${e.message}`);
			await logUtils.logException(error);
		}

		const response = {
			statusCode: 200,
			message: 'Success.',
			data: {
				updatedLocations,
				updatedStores
			}
		}

		respond(response, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, {});
	}
});



router.put('/updateNearestStores', async (req, res, next) => {
	try {
		if (req.get('x-app-type') !== 'INT') {
			respond({}, res, next, [], 403, "Access denied.");
			return;
		}
		
		const updatedRecords = await runLocationCalculations();

		const response = {
			statusCode: 200,
			message: 'Success.',
			data: {
				updatedRecords
			}
		}

		respond(response, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, {});
	}
});




//
//  POST /zipToCity/processZips
//
router.post(`/processZips`, upload.array('zips'), async (req, res, next) => {
  var resp = {
    statusCode: 201,
    message: 'Success.'
  };


  if (req.get('x-app-type') !== 'INT') {
    respond(resp, res, next, undefined, 403, 'Access denied.')
  } else {

   try {
     await processZips(req.files[0].path, resp);
     respond(resp, res, next);
   } catch (e) {
     logUtils.routeExceptions(e, req, res, next, resp);
   } finally {
     fs.unlinkSync(req.files[0].path);
	  }
  }
})





module.exports = router