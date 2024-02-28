'use strict'

const check = require('check-types');
const express = require('express')
const axios = require('axios');
const router = express.Router()
const sharp = require('sharp');

const logUtils = require('../utils/logUtils')
const {
	respond
} = require('../utils/response');


// Create
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 201,
			message: 'Success.'
		}

		var	fit = 'contain';
		var height = undefined;
		var width = undefined;
		var quality = 80;

		if (check.integer(parseInt(req.query.h))) {
			height = parseInt(req.query.h);
		}

		if (check.integer(parseInt(req.query.w))) {
			width = parseInt(req.query.w);
		}

		if ((req.query.q !== undefined) && (check.integer(parseInt(req.query.q)))) {
			quality = parseInt(req.query.q);
		}

		// var rawParams = url.parse(req.url).query.split('&');
		// var imgParam = '';
		// for (var i=0; i < rawParams.length; i++) {
		// 	if (rawParams[i].startsWith('img=')) {
		// 		imgParam = rawParams[i].substring(4);
		// 	}
		// }

		if ((parseInt(req.query.q) < 0) || (parseInt(req.query.q) > 100)) {
			resp.statusCode = 400;
			resp.message = "Quality must be 0-100";
			respond(resp, res, next);
		}
		else if ((req.query.fit !== undefined) && (req.query.fit !== 'contain') && (req.query.fit !== 'crop') && (req.query.fit !== 'scale')) {
			resp.statusCode = 400;
			resp.message = "Param fit must be contain, crop or scale";
			respond(resp, res, next);
		}
		else if ((req.query.img === undefined) || (req.query.img === null) || (Array.isArray(req.query.img)) || (req.query.img.startsWith('null'))) {
			resp.statusCode = 400;
			resp.message = "Invalid image.";
			respond(resp, res, next);
		} else {

			if (req.query.fit) {
				if (req.query.fit === 'crop') {
					fit = 'cover';
				}
				else if (req.query.fit === 'scale') {
					fit = 'inside';
				}
			}
			var imgParam = req.url.substring(req.url.indexOf("img=") + 4);

			if (!imgParam.startsWith("http")) {
				imgParam = "http:" + imgParam;
			}

			// console.log("Processing image height: " + height + " width: " + width + " " + imgParam);
			imgParam = imgParam.replace("%3F", "?");
			// console.log("Processing image height: " + height + " width: " + width + " " + imgParam);


			// Retrieve the image by URL.   
			try {
				var img = await axios.get(imgParam, {
					responseType: 'stream'
				});


				// Check content type.
				if ((img.headers) && (img.headers["content-type"])) {
					if ((img.headers["content-type"].startsWith('text/html')) || 
							(img.headers["content-type"].startsWith('application/json')) || 
							// (img.headers["content-type"].startsWith('application/octet-stream')) || 
							(img.headers["content-type"] === 'application/x-httpd-php')) {
						throw new Error(`Invalid content type ${img.headers["content-type"]} resizing image ${imgParam}`);
					}
				}

				//	Resize and pipe the result to response.
				var result = await img.data
					.pipe(sharp({ failOnError: false }).resize(width, height, {fit: fit, background: '#FFFFFF'}).toFormat('jpeg', {
						progressive: true,
						quality: quality
					}))
					.on('error', function (e) {
						resp.statusCode = 404;
						resp.message = e.message;
						respond(resp, res, next);
					})
					.pipe(res);
			} catch (e) {
				if (e.message.indexOf('status code 4') == 0) {
					console.log(`${new Date} Image exception: ${e.message}  ${imgParam}`);
				}
				resp.statusCode = 404;
				resp.message = e.message;
				respond(resp, res, next);
			}
		}
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined)
	}
})


module.exports = router;