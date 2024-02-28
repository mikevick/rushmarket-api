function objectToHTMLtable(obj) {
	let table = '<table>';
	for (const [key, value] of Object.entries(obj)) {
		table += '<tr>'
		table += `<td>${key}</td>`
		table += `<td>${value}</td>`
		table += '</tr>'
	}
	table += '</table>';
	return table;
}

function objectToTextTable(obj) {
  return Object.entries(obj).map(([key, value]) => `${key}: ${value}`).join('\n');
}

module.exports = {
	objectToHTMLtable,
	objectToTextTable
}
