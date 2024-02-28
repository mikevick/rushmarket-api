'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');


exports.create = (name) => {
	return new Promise((resolve, reject) => {

		var id = globals.mongoid.fetch();

		var values = [id, name];
		globals.pool.query("INSERT INTO tidbit_types (id, name) " +
				"VALUES (?, ?)", values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.createAnswer = (tid, answer) => {
	return new Promise((resolve, reject) => {

		var id = globals.mongoid.fetch();

		var values = [id, tid, answer];
		globals.pool.query("INSERT INTO tidbit_types_answers (id, tidbit_type_id, answer) " +
				"VALUES (?, ?, ?)", values)
			.then((results) => {
				resolve(id);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.delById = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("DELETE FROM tidbit_types WHERE id = ?", [id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.delAnswerById = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("DELETE FROM tidbit_types_answers WHERE id = ?", [id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getById = (id) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM tidbit_types WHERE id = ?", [id])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAnswerById = (aid) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM tidbit_types_answers WHERE id = ?", [aid])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getByName = (name) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM tidbit_types WHERE name = ?", [name])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAll = (whereInfo, offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}
		globals.pool.query("SELECT count(*) as num FROM tidbit_types " + whereInfo.clause, whereInfo.values)
			.then((count) => {
				resp.totalCount = count[0].num;
				whereInfo.values.push(offset);
				whereInfo.values.push(limit);
				return globals.pool.query("SELECT * FROM tidbit_types " + whereInfo.clause + " ORDER BY name LIMIT ?,?", whereInfo.values);
			})
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAllAnswers = (tid, offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}
		globals.pool.query("SELECT count(*) as num FROM tidbit_types_answers WHERE tidbit_type_id = ?", [tid])
			.then((count) => {
				resp.totalCount = count[0].num;
				return globals.pool.query("SELECT * FROM tidbit_types_answers WHERE tidbit_type_id = ? ORDER BY answer LIMIT ?,?", [tid, offset, limit]);
			})
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getAllAnswersByName = (name, offset, limit) => {
	return new Promise((resolve, reject) => {
		var resp = {
			totalCount: 0,
			rows: []
		}
		globals.pool.query("SELECT count(*) as num FROM tidbit_types_answers a LEFT JOIN tidbit_types t ON a.tidbit_type_id = t.id WHERE t.name = ?", [name])
			.then((count) => {
				resp.totalCount = count[0].num;
				return globals.pool.query("SELECT a.* FROM tidbit_types_answers a LEFT JOIN tidbit_types t ON a.tidbit_type_id = t.id WHERE t.name = ? ORDER BY answer LIMIT ?, ?", [name, offset, limit]);
			})
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resp.rows = rows;
				resolve(resp);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.updateById = (id, name) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("UPDATE tidbit_types SET date_modified = now(), name = ? WHERE id = ?", [name, id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.updateAnswerById = (id, answer) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("UPDATE tidbit_types_answers SET date_modified = now(), answer = ?  WHERE id = ?", [answer, id])
			.then((rows) => {
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}

