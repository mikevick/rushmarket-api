'use strict';


function colToKey(col) {
		var a = '';
		var b = '';
		var key = col.trim();
		var i = 0
		var start = 0;

		while ((i = key.indexOf('_', start)) > 0) {
			a = key.substring(0, i);
			b = key.substring(i + 1);
			b = b.charAt(0).toUpperCase() + b.slice(1);
			key = a + b;


			start = i + 1;
		}

		// console.log("key: " + key);

    return key;
}


function keyToCol(key) {

	var col = key.replace(/([A-Z])/g, "_$1");

	var a = '';
	var b = '';
	var i = 0
	var start = 0;

	//	Exceptions that don't strictly follow convention.
	if (key === 'prop65') {
		return 'prop_65';
	}
	if (key === 'prop65Chemicals') {
		return 'prop_65_chemicals';
	}
	if (key === 'prop65WarningLabel') {
		return 'prop_65_warning_label';
	}


	while ((i = col.indexOf('_', start)) > 0) {
		a = col.substring(0, i + 1);
		b = col.substring(i + 1);
		b = b.charAt(0).toLowerCase() + b.slice(1);
		col = a + b;


		start = i + 1;
	}

	i = col.indexOf(' ');
	if (i > 0) {
		col = col.substring(0, i);
	}

	// console.log("col: " + col);

	return col;
}



var outboundNaming = (rows) => {
	var cols = null;

	rows.forEach((row) => {
		cols = Object.keys(row);
		cols.forEach((col) => {
			if (col.indexOf('_') > 0) {
				row[colToKey(col)] = row[col];
				delete row[col];
			}
		});
	});

	return rows;
}



var columnUpdate = (sql, values, colVal, colName, nullableFlag) => {
	if (!nullableFlag) {
		if ((colVal !== undefined) && (colVal !== null)) {
			values.push(colVal);
			sql = sql + ', ' + colName + ' = ?';
		}
	}
	else {
		if (colVal !== undefined) {
			if (colVal === null) {
				sql += ', ' + colName + ' = null';
			}
			else {
				values.push(colVal);
				sql += ', ' + colName + ' = ?';
			}
		}
	}

	return sql;
}



module.exports = {
		colToKey,
		columnUpdate,
		keyToCol,
		outboundNaming
}