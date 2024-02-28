const globals = require('../globals');

const axios = require('axios').create({
	timeout: globals.apiTimeout,
	validateStatus: function (status) {
		return ((status === 404) || (status === 403) || (status === 400) || (status >= 200 && status < 300));
	}
});
const fs = require('fs-extra');
const pathUtil = require('path');
const streamifier = require('streamifier');


const fileUtils = require('../utils/fileUtils');



var stripEncodings = (fileName) => {
	//	Strip encoded characters logic
	if (fileName !== null) {
		var len = fileName.length;
		var start = 0;
		var idx = fileName.indexOf("%");
		while (idx >= 0) {
			if ((idx >= 0) && ((idx + 2) <= len)) {
				start = idx;

				//  %XX 
				fileName = fileName.substring(0, idx) + fileName.substring(idx + 3);
			} else {
				break;
			}
			idx = fileName.indexOf("%", start);
		}
	}


	return fileName;
}


var constructPath = (storageContext, relativePath, fileName) => {
	var path = '';


	if ((relativePath != undefined) && (relativePath.trim().length > 0)) {
		path = path + relativePath[0] === '/' ? relativePath.substring(1) : relativePath;
		path = path + ((relativePath[relativePath.length - 1]) === '/' ? '' : '/');
	}
	path = path + pathUtil.basename(fileName, pathUtil.extname(fileName));

	if (storageContext.nameCollision === 'UNIQUE') {
		path = path + '-' + new Date().getTime();
	}

	path = path + pathUtil.extname(fileName);

	return path;
}



var deleteImage = (storageContext, req, resp) => {
	return new Promise((resolve, reject) => {
		var streamProm = [];

		var path = constructPath(storageContext, pathUtil.dirname(req.query.relativePath), pathUtil.basename(req.query.relativePath));

		fileUtils.remove(storageContext, path)
			.then((code) => {
				resp.statusCode = code;
				switch (resp.statusCode) {
					case 200:
						break;
					case 404:
						resp.message = 'Image not found.';
						break;
					default:
						resp.message = 'Something unexpected happened.';
						break;
				}

				resolve(resp)
			})
			.catch((e) => {
				reject(e);
			});

	});
}




var storeImageBase64 = (storageContext, req, resp) => {
	return new Promise((resolve, reject) => {
		var streamProm = [];


		//	Tee up streams.
		for (var i = 0; i < req.body.images.length; i++) {
			if (req.body.images[i].base64 != undefined) {
				var buf = Buffer.from(req.body.images[i].base64, 'base64');
				streamProm.push(streamifier.createReadStream(buf));
			}
		}

		uploadStreams(storageContext, req, resp, streamProm, req.body.images, 'fileName')
			.then((resp) => {
				resolve(resp)
			})
			.catch((e) => {
				reject(e);
			});
	});
}





var storeImageMultipart = (storageContext, req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];
		var streamProm = [];


		//	Tee up streams.
		for (var i = 0; i < req.files.length; i++) {
			streamProm.push(fs.createReadStream(req.files[i].path));
		}

		uploadStreams(storageContext, req, resp, streamProm, req.files, 'originalname')
			.then((resp) => {
				for (var i = 0; i < req.files.length; i++) {
					prom.push(fs.unlink(req.files[i].path));
				}

				return Promise.all(prom);
			})
			.then(() => {
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



var storeImageUrls = (storageContext, req, resp) => {
	return new Promise((resolve, reject) => {
		var streamProm = [];


		//	Tee up streams
		for (var i = 0; i < req.body.images.length; i++) {
			if (req.body.images[i].url != undefined) {
				streamProm.push(axios({
					method: 'get',
					url: req.body.images[i].url,
					responseType: 'stream'
				}));
			}
		}

		uploadStreams(storageContext, req, resp, streamProm, req.body.images, 'fileName')
			.then((resp) => {
				resolve(resp)
			})
			.catch((e) => {
				reject(e);
			});
	});
}


var uploadStreams = async (storageContext, req, resp, streamProm, imagesArray, nameField) => {
	var imageUrls = [];
	var prom = [];


	var response = await Promise.all(streamProm);
	for (var i = 0; i < imagesArray.length; i++) {
		var theStream = null;

		//	
		//	Find the stream.
		//
		if (response[i].data != undefined) {
			theStream = response[i].data;
		} else if (response[i].readable != undefined) {
			//	
			//	If this is a multipart upload, inject a status.
			//
			if (response[i].readable) {
				response[i].status = 200;
			} else {
				response[i].status = 500;
			}

			theStream = response[i];
		}


		//
		//	If stream response is good, upload it to Azure storage. 
		//
		if ((response[i].status != undefined) && (response[i].status === 200)) {
			imagesArray[i][nameField] = stripEncodings(imagesArray[i][nameField].replace(/[^ -~]+/g, ""));
			if (pathUtil.extname(imagesArray[i][nameField]) === '') {
				if (response[i].headers["content-type"] === 'image/jpeg') {
					imagesArray[i][nameField] = imagesArray[i][nameField] + '.jpg';
				}
				else if (response[i].headers["content-type"] === 'image/gif') {
					imagesArray[i][nameField] = imagesArray[i][nameField] + '.gif';
				}
				else if (response[i].headers["content-type"] === 'image/bmp') {
					imagesArray[i][nameField] = imagesArray[i][nameField] + '.bmp';
				}
				else if (response[i].headers["content-type"] === 'image/png') {
					imagesArray[i][nameField] = imagesArray[i][nameField] + '.png';
				}
			}
			var path = constructPath(storageContext, req.query.relativePath, imagesArray[i][nameField].replace(/[^ -~]+/g, ""));

			var info = {
				fileName: imagesArray[i][nameField],
				statusCode: 200,
				message: "Success.",
				url: storageContext.baseUri + '/' + storageContext.baseFolder + '/' + path
			};

			if (storageContext.nameCollision === 'UNIQUE') {
				info.newFileName = pathUtil.basename(path);
			}

			imageUrls.push(info);

			prom.push(fileUtils.storeFromStream(storageContext, path, theStream));
		} else {
			imageUrls.push({
				fileName: imagesArray[i][nameField],
				statusCode: response[i].status,
				message: response[i].statusText + ".",
				url: null
			});
			prom.push({
				fileName: imagesArray[i][nameField],
				statusCode: response[i].status,
				message: response[i].statusText + ".",
				url: null
			});
		}
	}
	var result = await Promise.all(prom);
	prom = [];
	var partial = false;
	var atLeastOne = false;

	resp.data = {};
	resp.data.imageUrls = [];

	for (var i = 0; i < imagesArray.length; i++) {
		if (result[i].statusCode != 201) {
			partial = true;
			imageUrls[i].statusCode = result[i].statusCode;
			imageUrls[i].message = result[i].message;
			if (storageContext.nameCollision != 'DENY') {
				imageUrls[i].url = null;
			}
		} else {
			atLeastOne = true;
		}
		resp.data.imageUrls.push(imageUrls[i]);

		if (((imageUrls[i].statusCode === 201) || (imageUrls[i].statusCode === 200)) && 
			(req.query.saveToCoreleap !== undefined) && (req.query.saveToCoreleap === "true")) {
			var temp = {
				id: 0
			}

			var r = await fileUtils.createFile(imageUrls[i].fileName, imageUrls[i].newFileName, imageUrls[i].url, req.query.context, req.query.relativePath, req.query.nameCollision, req.query.sku, req.query.vendorId, req.query.vendorSku, null, req.query.tag, temp);
			imageUrls[i].fileId = r.id;
		}
	}

	if (atLeastOne && partial) {
		resp.statusCode = 206;
		resp.message = "Some uploads successful.";
	} else if (!atLeastOne) {
		resp.statusCode = 406;
		resp.message = "No uploads successful.";
	}

	result = await Promise.all(prom);
	return resp;
}


module.exports = {
	deleteImage,
	storeImageBase64,
	storeImageMultipart,
	storeImageUrls
}