'use strict';

const _ = require('lodash');

const MemberText = require('../models/memberText');


var text = [];

var get = (label) => {
	var mt = _.find(text, function (o) {
		return o.label === label;
	});

	if (mt != undefined) {
		return mt.text;
	} else {
		return null;
	}
}


var load = (id) => {
	return new Promise((resolve, reject) => {
		try {
			text = [];
			MemberText.getAll()
				.then((rows) => {
					for (var i = 0; i < rows.length; i++) {
						text.push({
							"id": rows[i].id,
							"label": rows[i].label,
							"text": rows[i].text
						});
					}

					console.log(rows.length + " texts loaded.");
					resolve(text);
				})
				.catch((e) => {
					reject(e);
				});
		} catch (e) {
			reject(e);
		}
	});
}


module.exports = {
	load,
	get
}