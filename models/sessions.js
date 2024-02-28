'use strict';

const mysql = require('promise-mysql');

const globals = require('../globals');



exports.create = async (uuid, authToken, ip, zip) => {
	// console.log(mysql.format("INSERT INTO sessions (id, ip, zip) VALUES (?, ?, ?)", [uuid, ip, zip]));
	await globals.pool.query("INSERT INTO sessions (id, auth_token, ip, zip) VALUES (?, ?, ?, ?)", [uuid, authToken, ip, zip]);
}




exports.update = async (uuid, ip, zip) => {
	var result = null;
	console.log(mysql.format("UPDATE sessions SET date_modified = now(), ip = ?, zip = ? WHERE id = ?", [ip, zip, uuid]));
	result = await globals.pool.query("UPDATE sessions SET date_modified = now(), ip = ?, zip = ? WHERE id = ?", [ip, zip, uuid]);
	return result;
}

