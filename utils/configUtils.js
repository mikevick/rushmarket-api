'use strict';

const _ = require('lodash');

const Config = require('../models/config');


var config = [];


var get = (name) => {
	var c = _.find(config, function (o) {
		return o.name === name;
	});

	if (c != undefined) {
		return c.value;
	} else {
		return null;
	}
}


var load = async (id) => {
	config = [];
	var rows = await Config.getAll();
	for (var i = 0; i < rows.length; i++) {
		config.push({
			"name": rows[i].name,
			"value": rows[i].value
		});
	}

	// console.log(JSON.stringify(config, undefined, 2));

	console.log(rows.length + " configs loaded.");

	return config;
}


module.exports = {
	load,
	get
}