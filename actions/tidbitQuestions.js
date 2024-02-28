'use strict';

const TidbitQuestions = require('../models/tidbitQuestions');
const TidbitTypes = require('../models/tidbitTypes');

const {
	formatResp
} = require('../utils/response');




//
//	Question create.
//
var create = (req, resp) => {
	return new Promise((resolve, reject) => {

		// 
		//	Validate tidbitType
		//
		TidbitTypes.getByName(req.body.tidbitType)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, undefined, 404, "Tidbit type not found.");
					resolve(resp);
				} else {
					TidbitQuestions.create(req.body.question, rows[0].id, req.body.askOnce, req.body.sortOrder)
						.then((id) => {
							resp.id = id;
							resolve(resp);
						})
						.catch((e) => {
							reject(e);
						});
				}
			})
			.catch((e) => {
				reject(e);
			});

	});
}


var retrieveAnswers = (resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		for (var i = 0; i < resp.data.tidbitQuestions.length; i++) {
			prom.push(TidbitTypes.getAllAnswersByName(resp.data.tidbitQuestions[i].answerTidbitType, 0, 100000));
		}

		Promise.all(prom)
			.then((result) => {

				for (var i = 0; i < resp.data.tidbitQuestions.length; i++) {
					resp.data.tidbitQuestions[i].answers = result[i].rows;
				}

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//	GET all questions
//
var getAll = (where, offset, limit, resp, includeAnswers) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		TidbitQuestions.getAll(where, offset, limit)
			.then((result) => {
				resp.metaData.totalCount = result.totalCount;
				if (result.rows.length === 0) {
					formatResp(resp, undefined, 404, "No tidbit questions found.")
				} else {
					resp.data.tidbitQuestions = result.rows;

					if (includeAnswers) {
						prom.push(retrieveAnswers(resp));
					}
				}

				return Promise.all(prom);
			})
			.then((result) => {

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	GET specific question
//
var getById = (req, resp, includeAnswers) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		TidbitQuestions.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					formatResp(resp, undefined, 404, "No tidbit question found.")
				} else {
					resp.data.tidbitQuestions = rows;

					if (includeAnswers) {
						prom.push(retrieveAnswers(resp));
					}

				}

				return Promise.all(prom);
			})
			.then((result) => {

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	Question delete
//
var remove = (req, resp) => {
	return new Promise((resolve, reject) => {

		TidbitQuestions.delById(req.params.id)
			.then((rows) => {
				if ((rows === undefined) || (rows.affectedRows === 0)) {
					resp = formatResp(resp, undefined, 404, "Tidbit question not found.");
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	Question update
//
var update = (req, resp) => {
	return new Promise((resolve, reject) => {
		var prom = [];

		if (req.body.answerTidbitType != undefined) {
			prom.push(TidbitTypes.getByName(req.body.answerTidbitType));
		}

		Promise.all(prom)
			.then((rows) => {
				if ((rows[0] != undefined) && (rows[0].length === 0)) {
					resp = formatResp(resp, undefined, 404, "Tidbit type not found.");
					resolve(resp);
				} else {
					if ((rows[0] != undefined) && (rows[0].length > 0)) {
						req.body.answerTidbitType = rows[0][0].id;
					}
					TidbitQuestions.updateById(req.params.id, req.body)
						.then((rows) => {
							if ((rows === undefined) || (rows.affectedRows === 0)) {
								resp = formatResp(resp, undefined, 404, "Tidbit question not found.");
							}
							resolve(resp);
						})
						.catch((e) => {
							reject(e);
						});
				}
			})
			.catch((e) => {
				reject(e);
			});
	});
}



module.exports = {
	create,
	getAll,
	getById,
	remove,
	update
}