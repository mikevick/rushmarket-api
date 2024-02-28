const fs = require('fs');
const mime = require('mime-types');
const {
	Aborter,
	BlobURL,
	BlockBlobURL,
	ContainerURL,
	ServiceURL,
	StorageURL,
	SharedKeyCredential,
	uploadStreamToBlockBlob
} = require("@azure/storage-blob");

const _ = require('lodash');

const pathUtil = require('path');

const Files = require('../models/files');
const FileStorageContexts = require('../models/fileStorageContexts');
const Vendors = require('../models/vendors');

const response = require('./response');


var storageContexts = [];




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



async function containerCheck(context, serviceURL, containerURL) {
	var found = false;

	// List containers
	let marker;
	do {
		const listContainersResponse = await serviceURL.listContainersSegment(
			Aborter.none,
			marker
		);

		marker = listContainersResponse.marker;
		for (const container of listContainersResponse.containerItems) {
			// console.log(container.name);
			if (container.name === context.baseFolder) {
				found = true;
			}
		}
	} while (marker);

	if (!found) {
		await containerURL.create(Aborter.none, {
			access: 'container'
		});
	}
}


var getContext = (contextName, nameCollision) => {
	var c = _.find(storageContexts, function (o) {
		return o.name === contextName;
	});

	if (c != undefined) {
		c.nameCollision = nameCollision;

		return c;
	} else {
		return null;
	}
}


var loadContexts = () => {
	return new Promise((resolve, reject) => {
		var prom = [];

		storageContexts = [];
		try {
			FileStorageContexts.getAll()
				.then((rows) => {
					for (var i = 0; i < rows.length; i++) {
						var si = {
							"id": rows[i].id,
							"name": rows[i].name,
							"baseUri": rows[i].baseUri,
							"baseFolder": rows[i].baseFolder,
							"account": rows[i].keys.account,
							"accountKey": rows[i].keys.accountKey
						}
						storageContexts.push(si);

						var sharedKeyCredential = new SharedKeyCredential(si.account, si.accountKey);
						var pipeline = StorageURL.newPipeline(sharedKeyCredential);

						var serviceURL = new ServiceURL(
							'http:' + si.baseUri,
							pipeline
						);


						// Create a container if it doesn't exist.
						var containerURL = ContainerURL.fromServiceURL(serviceURL, si.baseFolder);
						prom.push(containerCheck(si, serviceURL, containerURL));
					}

					return Promise.all(prom);
				})
				.then(() => {
					console.log(storageContexts.length + " image contexts loaded.");
					resolve(storageContexts);
				})
				.catch((e) => {
					reject(e);
				});
		} catch (e) {
			reject(e);
		}
	});
}


async function remove(storageContext, fileName) {
	const account = storageContext.account;
	const accountKey = storageContext.accountKey;


	const sharedKeyCredential = new SharedKeyCredential(account, accountKey);
	const pipeline = StorageURL.newPipeline(sharedKeyCredential);

	const serviceURL = new ServiceURL(
		'http:' + storageContext.baseUri,
		pipeline
	);


	const containerURL = ContainerURL.fromServiceURL(serviceURL, storageContext.baseFolder);
	let response = null;

	// Delete a blob
	const blobName = fileName;
	const blobURL = BlobURL.fromContainerURL(containerURL, blobName);
	try {
		var r = await blobURL.delete();
		return 200;
	} catch (e) {
		return e.statusCode;
	}

}


async function storeFromStream(storageContext, fileName, fileStream) { 
	const account = storageContext.account;
	const accountKey = storageContext.accountKey;


	const sharedKeyCredential = new SharedKeyCredential(account, accountKey);
	const pipeline = StorageURL.newPipeline(sharedKeyCredential);

	const serviceURL = new ServiceURL(
		'http:' + storageContext.baseUri,
		pipeline
	);


	const containerURL = ContainerURL.fromServiceURL(serviceURL, storageContext.baseFolder);
	let marker;
	let response = null;

	// If nameCollision = DENY, make sure there isn't a blob with this name already. 
	if (storageContext.nameCollision === 'DENY') {
		var found = false;
		// List blobs
		do {
			const listBlobsResponse = await containerURL.listBlobFlatSegment(
				Aborter.none,
				marker
			);

			marker = listBlobsResponse.marker;
			for (const blob of listBlobsResponse.segment.blobItems) {
				// console.log(`Blob: ${blob.name}  fileName: ${fileName}`);
				if (blob.name === fileName) {
					found = true;
					// console.log("FOUND");
				}
			}
		} while (marker);

		if (found) {
			response = {};
			response.statusCode = 409;
			response.message = `File ${fileName} already exists.`;
			return response;
		}
	}

	if (!found) {
		var contentType = mime.lookup(fileName) || 'application/octet-stream';

		// Create a blob
		const blobName = fileName;
		const blobURL = BlobURL.fromContainerURL(containerURL, blobName);
		const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);

		// Parallel uploading a Readable stream with uploadStreamToBlockBlob in Node.js runtime
		// uploadStreamToBlockBlob is only available in Node.js
		try {
			response = await uploadStreamToBlockBlob(
				Aborter.timeout(30 * 60 * 1000), // Abort uploading with timeout in 30mins
				fileStream,
				blockBlobURL,
				4 * 1024 * 1024,
				20, {
					blobHTTPHeaders: {
						blobContentType: contentType
					}
				}
			);

			response.statusCode = response._response.status;
		} catch (e) {
			response = {};
			switch (e.code) {
				case "REQUEST_ABORTED_ERROR":
					response.statusCode = 408;
					response.message = e.message + ".";
					break;

				default:
					response.statusCode = e.code;
					response.message = e.message + ".";
					break;
			}
		}
	}


	return response;
}


//
//	Store one or more files to a storage context.
//
// var storeMultipart = (storageContext, relativePath, files, resp) => {
// 	return new Promise((resolve, reject) => {
// 		var prom = [];
// 		var streamProm = [];


// 		//	Tee up streams.
// 		for (var i = 0; i < files.length; i++) {
// 			streamProm.push(fs.createReadStream(files[i].path));
// 		}

// 		uploadStreams(storageContext, resp, relativePath, files, streamProm, 'originalname')
// 			.then((resp) => {
// 				for (var i = 0; i < req.files.length; i++) {
// 					prom.push(fs.unlink(req.files[i].path));
// 				}

// 				return Promise.all(prom);
// 			})
// 			.then(() => {
// 				resolve(resp);
// 			})
// 			.catch((e) => {
// 				reject(e);
// 			});
// 	});
// }


//
//	Store file to a storage context.
//
var storeMultipartFile = (storageContext, relativePath, uploadFromPath, fileName, deleteAfterStoreFlag) => {
	return new Promise((resolve, reject) => {
		var prom = [];
		var streamProm = [];
		var resp = {
			statusCode: 200,
			url: null
		}


		//	Tee up stream.
		streamProm.push(fs.createReadStream(uploadFromPath));

		uploadStreamToAzureStorage(storageContext, relativePath, streamProm, fileName)
			.then((result) => {
				resp.statusCode = result.statusCode;
				resp.message = result.message;
				resp.url = result.url;
				
				if (deleteAfterStoreFlag) {
					prom.push(fs.unlink(uploadFromPath));
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




// var uploadStreams = (storageContext, resp, relativePath, streamProm, filesArray, nameField) => {
// 	return new Promise((resolve, reject) => {
// 		var fileUrls = [];
// 		var prom = [];


// 		Promise.all(streamProm)
// 			.then((response) => {
// 				for (var i = 0; i < filesArray.length; i++) {
// 					var theStream = null;

// 					//	
// 					//	Find the stream.
// 					//
// 					if (response[i].data != undefined) {
// 						theStream = response[i].data;
// 					} else if (response[i].readable != undefined) {
// 						//	
// 						//	If this is a multipart upload, inject a status.
// 						//
// 						if (response[i].readable) {
// 							response[i].status = 200;
// 						} else {
// 							response[i].status = 500;
// 						}

// 						theStream = response[i];
// 					}


// 					//
// 					//	If stream response is good, upload it to Azure storage. 
// 					//
// 					if ((response[i].status != undefined) && (response[i].status === 200)) {
// 						var path = constructPath(storageContext, relativePath, filesArray[i][nameField]);

// 						fileUrls.push({
// 							fileName: filesArray[i][nameField],
// 							statusCode: 200,
// 							message: "Success.",
// 							url: storageContext.baseUri + '/' + storageContext.baseFolder + '/' + path
// 						});
// 						prom.push(storeFromStream(storageContext, path, theStream));
// 					} else {
// 						fileUrls.push({
// 							fileName: filesArray[i][nameField],
// 							statusCode: response[i].status,
// 							message: response[i].statusText + ".",
// 							url: null
// 						});
// 						prom.push({
// 							fileName: filesArray[i][nameField],
// 							statusCode: response[i].status,
// 							message: response[i].statusText + ".",
// 							url: null
// 						});
// 					}
// 				}
// 				return Promise.all(prom);
// 			})
// 			.then((result) => {
// 				prom = [];
// 				var partial = false;
// 				var atLeastOne = false;

// 				resp.data = {};
// 				resp.data.urls = [];

// 				for (var i = 0; i < filesArray.length; i++) {
// 					if (result[i].statusCode != 201) {
// 						partial = true;
// 						fileUrls[i].statusCode = result[i].statusCode;
// 						fileUrls[i].message = result[i].message;
// 						fileUrls[i].url = null;
// 					} else {
// 						atLeastOne = true;
// 					}
// 					resp.data.imageUrls.push(imageUrls[i]);
// 				}

// 				if (atLeastOne && partial) {
// 					resp.statusCode = 206;
// 					resp.message = "Some uploads successful.";
// 				} else if (!atLeastOne) {
// 					resp.statusCode = 406;
// 					resp.message = "No uploads successful.";
// 				}

// 				return Promise.all(prom);
// 			})
// 			.then((result) => {
// 				resolve(resp);
// 			})
// 			.catch((e) => {
// 				reject(e);
// 			});
// 	});
// }



var uploadStreamToAzureStorage = (storageContext, relativePath, streamProm, fileName) => {
	return new Promise((resolve, reject) => {
		var fileUrl = {};
		var prom = [];


		Promise.all(streamProm)
			.then((response) => {
				var theStream = null;

				//	
				//	Find the stream.
				//
				if (response[0].data != undefined) {
					theStream = response[0].data;
				} else if (response[0].readable != undefined) {
					//	
					//	If this is a multipart upload, inject a status.
					//
					if (response[0].readable) {
						response[0].status = 200;
					} else {
						response[0].status = 500;
					}

					theStream = response[0];
				}


				//
				//	If stream response is good, upload it to Azure storage. 
				//
				if ((response[0].status != undefined) && (response[0].status === 200)) {
					var path = constructPath(storageContext, relativePath, fileName);

					fileUrl = {
						fileName: fileName,
						statusCode: 200,
						message: "Success.",
						url: storageContext.baseUri + '/' + storageContext.baseFolder + '/' + path
					};
					prom.push(storeFromStream(storageContext, path, theStream));
				} else {
					fileUrl = {
						fileName: fileName,
						statusCode: response[0].status,
						message: response[0].statusText + ".",
						url: null
					};
					prom.push({
						fileName: fileName,
						statusCode: response[0].status,
						message: response[0].statusText + ".",
						url: null
					});
				}
				return Promise.all(prom);
			})
			.then((result) => {

				if (result[0].statusCode != 201) {
					partial = true;
					fileUrl.statusCode = result[0].statusCode;
					fileUrl.message = result[0].message;
					fileUrl.url = null;
				}

				resolve(fileUrl);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



var createFile = async (originalName, name, url, context, relativePath, nameCollision, sku, vendorId, vendorSku, type, tag, resp) => {
	if ((vendorId !== undefined) && (vendorId !== null)) {
	  var vendorCheck = await Vendors.getById(vendorId);
	  if (vendorCheck.length === 0) {
		response.formatResp(resp, ["data", "id"], 404, 'Vendor ID not found.');
		return resp;
	  }
	}
  
	if ((type === undefined) || (type === null) || (type.trim().length === 0)) {
	  switch(pathUtil.extname(name)) {
		case '.jpg':
		case '.jpeg':
		case '.png':
		case '.gif':
		case '.tif':
		case '.tiff':
		  type = 'image';
		  break;
  
		case '.pdf':
		  type = 'pdf';
		  break;
	  }
	}
  
	var result = await Files.create(originalName, name, url, context, relativePath, nameCollision, sku, vendorId, vendorSku, type, tag);
	resp.id = result.insertId;
	return resp;
  }
  
  
  
  


module.exports = {
	createFile,
	loadContexts,
	getContext,
	remove,
	storeFromStream,
	// storeMultipart,
	storeMultipartFile
}