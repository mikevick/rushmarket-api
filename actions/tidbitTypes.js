'use strict';

const TidbitTypes = require('../models/tidbitTypes');

const {
	formatResp
} = require('../utils/response');




//
//	Tidbit create.
//
var create = (req, resp) => {
	return new Promise((resolve, reject) => {

		// 
		//	Validate tidbitType
		//
		TidbitTypes.getByName(req.body.name)
			.then((rows) => {
				if (rows.length > 0) {
					resp = formatResp(resp, undefined, 409, "Tidbit with this name already exists.");
					resolve(resp);
				} else {
					TidbitTypes.create(req.body.name)
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


//
//	Tidbit answer create.
//
var createAnswer = (req, resp) => {
	return new Promise((resolve, reject) => {

		// 
		//	Validate tidbitType
		//
		TidbitTypes.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, undefined, 404, "Tidbit type not found.");
					resolve(resp);
				} else {
					TidbitTypes.createAnswer(req.params.id, req.body.answer)
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


//
//	GET all tidbitTypes
//
var getAll = (where, offset, limit, resp) => {
	return new Promise((resolve, reject) => {

		TidbitTypes.getAll(where, offset, limit)
			.then((result) => {
				resp.metaData.totalCount = result.totalCount;
				if (result.rows.length === 0) {
					formatResp(resp, undefined, 404, "No tidbit types found.")
				} else {
					resp.data.tidbitTypes = result.rows;
				}

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	GET all answers
//
var getAllAnswers = (tid, offset, limit, resp) => {
	return new Promise((resolve, reject) => {

		TidbitTypes.getById(tid)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, undefined, 404, "Tidbit type not found.");
					resolve(resp);
				} else {
					TidbitTypes.getAllAnswers(tid, offset, limit)
						.then((result) => {
							resp.metaData.totalCount = result.totalCount;
							if (result.rows.length === 0) {
								formatResp(resp, undefined, 404, "No tidbit type answers found.")
							} else {
								resp.data.tidbitTypeAnswers = result.rows;
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



//
//	GET specific answer
//
var getAnswerById = (req, resp) => {
	return new Promise((resolve, reject) => {

		TidbitTypes.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, undefined, 404, "Tidbit type not found.");
					resolve(resp);
				} else {
					TidbitTypes.getAnswerById(req.params.aid)
						.then((rows) => {
							if (rows.length === 0) {
								formatResp(resp, undefined, 404, "No tidbit type answer found.")
							} else {
								resp.data.tidbitTypeAnswers = rows;
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



//
//	GET specific tidbitType
//
var getById = (req, resp) => {
	return new Promise((resolve, reject) => {

		TidbitTypes.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					formatResp(resp, undefined, 404, "No tidbit types found.")
				} else {
					resp.data.tidbitTypes = rows;
				}

				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}



//
//	Type delete
//
var remove = (req, resp) => {
	return new Promise((resolve, reject) => {

		TidbitTypes.delById(req.params.id)
			.then((rows) => {
				if ((rows === undefined) || (rows.affectedRows === 0)) {
					resp = formatResp(resp, undefined, 404, "Tidbit type not found.");
				}
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			});
	});
}


//
//	Answer delete
//
var removeAnswer = (req, resp) => {
	return new Promise((resolve, reject) => {

		TidbitTypes.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, undefined, 404, "Tidbit type not found.");
					resolve(resp);
				} else {
					TidbitTypes.delAnswerById(req.params.aid)
						.then((rows) => {
							if ((rows === undefined) || (rows.affectedRows === 0)) {
								resp = formatResp(resp, undefined, 404, "Tidbit type answer not found.");
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


//
//	Update tidbit type
//
var update = (req, resp) => {
	return new Promise((resolve, reject) => {

		TidbitTypes.getByName(req.body.name)
			.then((rows) => {
				if (rows.length > 0) {
					resp = formatResp(resp, undefined, 409, "Tidbit with this name already exists.");
					resolve(resp);
				} else {
					TidbitTypes.updateById(req.params.id, req.body.name)
						.then((rows) => {
							if ((rows === undefined) || (rows.affectedRows === 0)) {
								resp = formatResp(resp, undefined, 404, "Tidbit type not found.");
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


//
//	Update tidbit type answer
//
var updateAnswer = (req, resp) => {
	return new Promise((resolve, reject) => {

		TidbitTypes.getById(req.params.id)
			.then((rows) => {
				if (rows.length === 0) {
					resp = formatResp(resp, undefined, 404, "Tidbit type not found.");
					resolve(resp);
				} else {
					TidbitTypes.updateAnswerById(req.params.aid, req.body.answer)
						.then((rows) => {
							if ((rows === undefined) || (rows.affectedRows === 0)) {
								resp = formatResp(resp, undefined, 404, "Tidbit type answer not found.");
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
	createAnswer,
	getAll,
	getAllAnswers,
	getAnswerById,
	getById,
	remove,
	removeAnswer,
	update,
	updateAnswer
}