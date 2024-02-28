'use strict';

const crypto = require('crypto');


var encrypt = (text) => {
	var cipher = crypto.createCipher('aes-256-cbc', process.env.ENC_KEY);
	var crypted = cipher.update(text, 'utf-8', 'hex');
	crypted += cipher.final('hex');

	return crypted;
}


var decrypt = (text) => {
	var decipher = crypto.createDecipher('aes-256-cbc', process.env.ENC_KEY);
	var decrypted = decipher.update(text, 'hex', 'utf-8');
	decrypted += decipher.final('utf-8');

	return decrypted;
}


module.exports = { encrypt, decrypt };