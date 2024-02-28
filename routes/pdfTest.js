'use strict';

const express = require('express');
const fs = require('fs');
const PDFDoc = require('pdfkit');
const router = express.Router();

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');


//
//  GET /pdfTest
//
router.get(`/`, async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: "Test"
		};

		var doc = new PDFDoc();

		// Pipe its output somewhere, like to a file or HTTP response
		// See below for browser usage
		doc.pipe(fs.createWriteStream('output.pdf'));

		// Add an image, constrain it to a given size, and center it vertically and horizontally
		doc.image('images/logo_black.png', 50, 20, {
			fit: [150, 50],
			align: 'left',
			valign: 'top'
		});

		// Embed a font, set the font size, and render some text
		doc
		.font('fonts/Calibri Regular.ttf')
		.fontSize(20)
			.text('DROP SHIP', 450, 20)
			.text('PURCHASE ORDER', 390, 40);

		// line cap settings
		doc.lineWidth(2);
		doc.lineCap('butt')
			.moveTo(50, 60)
			.lineTo(550, 60)
			.stroke();

		doc
			.font('fonts/Calibri Bold.ttf')
			.fontSize(11)
			.text('Ship To', 50, 80)
			.text('Vendor', 300, 80);


			doc.lineWidth(1)
				.lineCap('butt')
				.moveTo(50, 150)
				.lineTo(200, 150)
				.stroke();
	
			doc.lineWidth(1)
				.lineCap('butt')
				.moveTo(300, 150)
				.lineTo(550, 150)
				.stroke();
		
				doc
				.font('fonts/Calibri Bold.ttf')
				.fontSize(11)
				.text('PO Number', 50, 154)
				.text('Bill To', 300, 154);
		
				doc.lineWidth(1)
					.lineCap('butt')
					.moveTo(50, 168)
					.lineTo(200, 168)
					.stroke();
		
					doc.lineWidth(1)
					.lineCap('butt')
					.moveTo(300, 224)
					.lineTo(550, 224)
					.stroke();
	
					doc
					.font('fonts/Calibri Bold.ttf')
					.fontSize(11)
					.text('Shipping Service', 300, 228)
					.text('Ship Date', 300, 240);

					doc.lineWidth(1)
					.lineCap('butt')
					.moveTo(50, 300)
					.lineTo(550, 300)
					.stroke();
	
					doc.lineWidth(1)
					.lineCap('butt')
					.moveTo(50, 318)
					.lineTo(550, 318)
					.stroke();
	
					doc.rect(50, 301, 500, 16)
					.fillAndStroke("#CACACA", "#CACACA");

					doc
					.fillAndStroke("#000", "#000")
					.font('fonts/Calibri Bold.ttf')
					.fontSize(11)
					.text('Qty', 400, 304)
					.text('Item Cost', 432, 304)
					.text('Total Cost', 495, 304);

					doc
					.font('fonts/Calibri Bold.ttf')
					.fontSize(11)
					.text('Description', 50, 324)
					.text('Vendor SKU', 120, 342)
					.text('UPC', 120, 356);

					doc.lineWidth(1)
					.lineCap('butt')
					.moveTo(50, 368)
					.lineTo(550, 368)
					.stroke();

					doc
					.font('fonts/Calibri Regular.ttf')
					.fontSize(11)
					.text('Damage/Defective Allowance', 300, 395);

					doc.lineWidth(1)
					.lineCap('butt')
					.moveTo(50, 430)
					.lineTo(550, 430)
					.stroke();
	
					doc.lineWidth(1)
					.lineCap('butt')
					.moveTo(50, 448)
					.lineTo(550, 448)
					.stroke();
	
					doc.rect(50, 431, 500, 16)
					.fillAndStroke("#CACACA", "#CACACA");

					doc
					.fillAndStroke("#000", "#000")
					.font('fonts/Calibri Bold.ttf')
					.fontSize(11)
					.text('Total', 412, 434);



		// Finalize PDF file
		doc.end();

		response.respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
});

module.exports = router;