'use strict';

const excel = require('exceljs');
const fsSync = require('fs');
const fs = require('fs').promises;
const _ = require('lodash');
const moment = require('moment-timezone');

const WeeklyInspectionAccuracy = require('../models/weeklyInspectionAccuracy');

const comms = require('../utils/comms');
const configUtils = require('../utils/configUtils');
const fileUtils = require('../utils/fileUtils');


var generateReport = async () => {
	var sheetInfo = {
		storageContext: fileUtils.getContext('CATALOG', 'UNIQUE'),
		options: {
			filename: 'sheets/weekly-inspection-accuracy.xlsx',
			useStyles: true,
			useSharedStrings: true
		},
		workbook: null,
		quantityTab: {
			sheet: null,
			leftTableFirstWeekCol: 2,
			rightTableFirstWeekCol: 2,
			row: 5
		},
		errorTab: {
			sheet: null,
			leftTableFirstWeekCol: 2,
			rightTableFirstWeekCol: 2,
			row: 5
		},
		missingTab: {
			sheet: null,
			leftTableFirstWeekCol: 2,
			rightTableFirstWeekCol: 2,
			row: 5
		},
		recipients: (configUtils.get("WEEKLY_INSPECTION_ACCURACY_EMAILS") !== null) ? configUtils.get("WEEKLY_INSPECTION_ACCURACY_EMAILS") : 'matt@rushmarket.com',
	}

	let weeks = [];

	populateWeeks(weeks);

	await initWorkbook(sheetInfo, weeks);

	let ordered = await WeeklyInspectionAccuracy.getOrdered(weeks[0].startDate);
	let errors = await WeeklyInspectionAccuracy.getErrors(weeks[0].startDate);
	let missing = await WeeklyInspectionAccuracy.getMissing(weeks[0].startDate);

	let users = await processData(weeks, ordered, errors, missing);

	await populateQuantity(sheetInfo, weeks, users);
	await populateErrors(sheetInfo, weeks, users);
	await populateMissing(sheetInfo, weeks, users);

	await completeWorkbook(sheetInfo);
}


var initWorkbook = async (sheetInfo, weeks) => {
	if (fsSync.existsSync(sheetInfo.options.filename)) {
		await fs.unlink(sheetInfo.options.filename);
	}

	sheetInfo.workbook = new excel.stream.xlsx.WorkbookWriter(sheetInfo.options);
	await initQuantitySheet(sheetInfo, weeks);
	await initErrorSheet(sheetInfo, weeks);
	await initMissingSheet(sheetInfo, weeks);
}


var initQuantitySheet = async (sheetInfo, weeks) => {
	sheetInfo.quantityTab.sheet = sheetInfo.workbook.addWorksheet('Quantity');
	sheetInfo.quantityTab.sheet.getCell('A1').value = 'Quantity of Items Inspected vs in Error by Week';
	sheetInfo.quantityTab.sheet.getCell('A1').font = {
		bold: true
	};

	sheetInfo.quantityTab.sheet.getCell('F1').value = 'NOTE:';
	sheetInfo.quantityTab.sheet.getCell('F1').font = {
		bold: true
	};

	sheetInfo.quantityTab.sheet.getCell('G1').value = 'This only includes orders with a disposition, about ~15% of the orders have no disposition so error rates are on average low by ~15%';

	sheetInfo.quantityTab.sheet.getCell('G3').value = 'Items Inspected that were shipped in an order by week';

	await sheetInfo.quantityTab.sheet.getRow(1).commit();

	sheetInfo.quantityTab.sheet.getRow(3).font = {
		bold: true
	};
	sheetInfo.quantityTab.sheet.getRow(3).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFBDD7EE'}
	}
	
	sheetInfo.quantityTab.sheet.getCell(3, sheetInfo.quantityTab.leftTableFirstWeekCol + weeks.length + 1).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFFFFFFF'}
	}

	sheetInfo.quantityTab.sheet.getRow(4).font = {
		bold: true
	};
	sheetInfo.quantityTab.sheet.getRow(4).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFD9E1F2'}
	}
	sheetInfo.quantityTab.sheet.getRow(4).border = {
		bottom: {style: 'thin', color: {argb: 'FF0535FF'}}
	}

	sheetInfo.quantityTab.sheet.getCell(4, sheetInfo.quantityTab.leftTableFirstWeekCol + weeks.length + 1).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFFFFFFF'}
	}
	sheetInfo.quantityTab.sheet.getCell(4, sheetInfo.quantityTab.leftTableFirstWeekCol + weeks.length + 1).border = {
		bottom: {style: 'thin', color: {argb: 'FFFFFFFF'}}
	}



	sheetInfo.quantityTab.sheet.getCell('A4').value = 'Name';

	sheetInfo.quantityTab.rightTableFirstWeekCol = sheetInfo.quantityTab.leftTableFirstWeekCol + weeks.length + 3;
	sheetInfo.quantityTab.sheet.getCell(4, sheetInfo.quantityTab.rightTableFirstWeekCol - 1).value = 'Name';

	for (let i = 0; i < weeks.length; i++) {
		sheetInfo.quantityTab.sheet.getCell(4, sheetInfo.quantityTab.leftTableFirstWeekCol + i).value = weeks[i].endDateDisplay;
		sheetInfo.quantityTab.sheet.getCell(4, sheetInfo.quantityTab.rightTableFirstWeekCol + i).value = weeks[i].endDateDisplay;
	}
	sheetInfo.quantityTab.sheet.getCell(4, sheetInfo.quantityTab.leftTableFirstWeekCol + weeks.length).value = 'Grand Total';
	sheetInfo.quantityTab.sheet.getCell(4, sheetInfo.quantityTab.rightTableFirstWeekCol + weeks.length).value = 'Grand Total';

	sheetInfo.quantityTab.sheet.getCell(3, sheetInfo.quantityTab.rightTableFirstWeekCol + 4).value = 'Errors (Dmg b/f & after fulfillment, missing hardware, wrong item)';


	await sheetInfo.quantityTab.sheet.getRow(3).commit();
	await sheetInfo.quantityTab.sheet.getRow(4).commit();
}


var initErrorSheet = async (sheetInfo, weeks) => {
	sheetInfo.errorTab.sheet = sheetInfo.workbook.addWorksheet('Total Error %');
	sheetInfo.errorTab.sheet.getCell('A1').value = 'Error Rates (errors from week 2 divided by volume from week 1)';
	sheetInfo.errorTab.sheet.getCell('A1').font = {
		bold: true
	};

	sheetInfo.errorTab.sheet.getCell('G1').value = 'NOTE:';
	sheetInfo.errorTab.sheet.getCell('G1').font = {
		bold: true
	};
	sheetInfo.errorTab.sheet.getCell('H1').value = 'This only includes orders with a disposition, about ~15% of the orders have no disposition so error rates are on average low by ~15% (i.e., 2.0% error rate is close to 2.5%)	';

	sheetInfo.errorTab.sheet.getCell('G3').value = 'Weekly Error Rate';


	await sheetInfo.errorTab.sheet.getRow(1).commit();

	sheetInfo.errorTab.sheet.getRow(3).font = {
		bold: true
	};
	sheetInfo.errorTab.sheet.getRow(3).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFBDD7EE'}
	}

	sheetInfo.errorTab.sheet.getCell(3, sheetInfo.errorTab.leftTableFirstWeekCol + weeks.length).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFFFFFFF'}
	}

	sheetInfo.errorTab.sheet.getRow(4).font = {
		bold: true
	};
	sheetInfo.errorTab.sheet.getRow(4).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFD9E1F2'}
	}
	sheetInfo.errorTab.sheet.getRow(4).border = {
		bottom: {style: 'thin', color: {argb: 'FF0535FF'}}
	}


	sheetInfo.errorTab.sheet.getCell(4, sheetInfo.errorTab.leftTableFirstWeekCol + weeks.length).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFFFFFFF'}
	}
	sheetInfo.errorTab.sheet.getCell(4, sheetInfo.errorTab.leftTableFirstWeekCol + weeks.length).border = {
		bottom: {style: 'thin', color: {argb: 'FFFFFFFF'}}
	}





	sheetInfo.errorTab.sheet.getCell('A4').value = 'Name';


	sheetInfo.errorTab.rightTableFirstWeekCol = sheetInfo.errorTab.leftTableFirstWeekCol + weeks.length + 2;
	sheetInfo.errorTab.sheet.getCell(4, sheetInfo.errorTab.rightTableFirstWeekCol - 1).value = 'Name';
	// sheetInfo.errorTab.sheet.getCell(4, sheetInfo.errorTab.rightTableFirstWeekCol - 1).fill = {bgColor: {argb: '#BDD7EE' }};

	let leftTableOffset = 0;
	for (let i = 1; i < weeks.length; i++) {
		sheetInfo.errorTab.sheet.getCell(4, sheetInfo.errorTab.leftTableFirstWeekCol + leftTableOffset++).value = weeks[i].endDateDisplay;
	}

	let rightTableOffset = 0;
	for (let i = 4; i < weeks.length; i++) {
		sheetInfo.errorTab.sheet.getCell(4, sheetInfo.errorTab.rightTableFirstWeekCol + rightTableOffset++).value = weeks[i].endDateDisplay;
	}
	sheetInfo.errorTab.sheet.getCell(4, sheetInfo.errorTab.leftTableFirstWeekCol + weeks.length - 1).value = 'Grand Total';

	sheetInfo.errorTab.sheet.getCell(3, sheetInfo.errorTab.rightTableFirstWeekCol + 4).value = '4 Week Rolling Average';

	await sheetInfo.errorTab.sheet.getRow(3).commit();
	await sheetInfo.errorTab.sheet.getRow(4).commit();
}



var initMissingSheet = async (sheetInfo, weeks) => {
	sheetInfo.missingTab.sheet = sheetInfo.workbook.addWorksheet('Missing Hardware + Wrong Item');
	sheetInfo.missingTab.sheet.getCell('A1').value = 'Error Rate for Missing Hardware + Wrong Item';
	sheetInfo.missingTab.sheet.getCell('A1').font = {
		bold: true
	};

	sheetInfo.missingTab.sheet.getCell('F1').value = 'NOTE:';
	sheetInfo.missingTab.sheet.getCell('F1').font = {
		bold: true
	};
	sheetInfo.missingTab.sheet.getCell('G1').value = 'This only includes orders with a disposition, about ~15% of the orders have no disposition so error rates are on average low by ~15%';

	sheetInfo.missingTab.sheet.getCell('G3').value = 'Items Inspected that were shipped in an order by week';


	await sheetInfo.missingTab.sheet.getRow(1).commit();

	sheetInfo.missingTab.sheet.getRow(3).font = {
		bold: true
	};
	sheetInfo.missingTab.sheet.getRow(3).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFBDD7EE'}
	}

	sheetInfo.missingTab.sheet.getCell(3, sheetInfo.quantityTab.leftTableFirstWeekCol + weeks.length + 1).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFFFFFFF'}
	}


	sheetInfo.missingTab.sheet.getRow(4).font = {
		bold: true
	};
	sheetInfo.missingTab.sheet.getRow(4).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFD9E1F2'}
	}
	sheetInfo.missingTab.sheet.getRow(4).border = {
		bottom: {style: 'thin', color: {argb: 'FF0535FF'}}
	}

	sheetInfo.missingTab.sheet.getCell(4, sheetInfo.quantityTab.leftTableFirstWeekCol + weeks.length + 1).fill = {
		type: 'pattern',
		pattern:'solid',
		fgColor:{argb:'FFFFFFFF'}
	}
	sheetInfo.missingTab.sheet.getCell(4, sheetInfo.quantityTab.leftTableFirstWeekCol + weeks.length + 1).border = {
		bottom: {style: 'thin', color: {argb: 'FFFFFFFF'}}
	}
	
	sheetInfo.missingTab.sheet.getCell('A4').value = 'Name';


	sheetInfo.missingTab.rightTableFirstWeekCol = sheetInfo.missingTab.leftTableFirstWeekCol + weeks.length + 3;
	sheetInfo.missingTab.sheet.getCell(4, sheetInfo.missingTab.rightTableFirstWeekCol - 1).value = 'Name';

	for (let i = 0; i < weeks.length; i++) {
		sheetInfo.missingTab.sheet.getCell(4, sheetInfo.missingTab.leftTableFirstWeekCol + i).value = weeks[i].endDateDisplay;
		sheetInfo.missingTab.sheet.getCell(4, sheetInfo.missingTab.rightTableFirstWeekCol + i).value = weeks[i].endDateDisplay;
	}
	sheetInfo.missingTab.sheet.getCell(4, sheetInfo.missingTab.leftTableFirstWeekCol + weeks.length).value = 'Grand Total';
	sheetInfo.missingTab.sheet.getCell(4, sheetInfo.missingTab.rightTableFirstWeekCol + weeks.length).value = 'Grand Total';
	sheetInfo.missingTab.sheet.getCell(4, sheetInfo.missingTab.rightTableFirstWeekCol + weeks.length + 1).value = 'Error %';

	sheetInfo.missingTab.sheet.getCell(3, sheetInfo.missingTab.rightTableFirstWeekCol + 4).value = 'Errors - Missing Hardware + Wrong Item';

	await sheetInfo.missingTab.sheet.getRow(3).commit();
	await sheetInfo.missingTab.sheet.getRow(4).commit();
}



var processData = async (weeks, ordered, errors, missing) => {
	let users = [];

	//	Initialize a structure to store all tab data.
	for (let i = 0; i < ordered.length; i++) {
		let u = {
			name: ordered[i].createdBy,
			weeks: [],
			orderedGrandTotal: 0,
			errorsGrandTotal: 0,
			errorRateErrors: 0,
			errorRateOrdered: 0,
			errorRateTotal: 0,
			missingGrandTotal: 0,
			missingErrorPct: 0
		}

		if (_.findIndex(users, function (user) {
				return user.name === ordered[i].createdBy;
			}) === -1) {
			for (let j = 0; j < weeks.length; j++) {
				u.weeks.push({
					week: weeks[j].week,
					ordered: '',
					errors: 0,
					errorRate: 0,
					errorsFWRA: 0,
					missing: 0,
					orderedFWRA: 0,
					fwraRate: 0
				})
			}

			users.push(u);
		}
	}


	//	Now populate ordered data.  
	for (let i = 0; i < ordered.length; i++) {
		let userIndex = _.findIndex(users, function (user) {
			return user.name === ordered[i].createdBy;
		});

		if (userIndex > -1) {
			let weekIndex = _.findIndex(users[userIndex].weeks, function (w) {
				return w.week === ordered[i].weekOfYear;
			})

			if (weekIndex > -1) {
				users[userIndex].weeks[weekIndex].ordered = ordered[i].sales;
				users[userIndex].orderedGrandTotal += ordered[i].sales;
			}
		}

	}


	//	Now populate returned/error data.  
	for (let i = 0; i < errors.length; i++) {
		let userIndex = _.findIndex(users, function (user) {
			return user.name === errors[i].createdBy;
		});

		if (userIndex > -1) {
			let weekIndex = _.findIndex(users[userIndex].weeks, function (w) {
				return w.week === errors[i].weekOfYear;
			})

			if (weekIndex > -1) {
				users[userIndex].weeks[weekIndex].errors = errors[i].errors;
				users[userIndex].errorsGrandTotal += errors[i].errors;

				if (weekIndex > 0) {
					if (users[userIndex].weeks[weekIndex - 1].ordered !== '' && users[userIndex].weeks[weekIndex - 1].ordered) {
						users[userIndex].weeks[weekIndex].errorRate = Math.round((users[userIndex].weeks[weekIndex].errors / users[userIndex].weeks[weekIndex - 1].ordered) * 100) / 100;
					}
					users[userIndex].errorRateErrors += users[userIndex].weeks[weekIndex].errors;
					users[userIndex].errorRateOrdered += (users[userIndex].weeks[weekIndex - 1].ordered === '') ? 0 : users[userIndex].weeks[weekIndex - 1].ordered;
					if (users[userIndex].errorRateOrdered && users[userIndex].errorRateErrors) {
						users[userIndex].errorRateTotal = Math.round((users[userIndex].errorRateErrors / users[userIndex].errorRateOrdered) * 1000) / 1000;
					}
				}

			}
		}
	}


	//	Process rolling average
	for (let i = 0; i < users.length; i++) {
		for (let j = 0; j < users[i].weeks.length; j++) {
			if (j > 3) {
				users[i].weeks[j].errorsFWRA = users[i].weeks[j].errors + users[i].weeks[j - 1].errors + users[i].weeks[j - 2].errors + users[i].weeks[j - 3].errors;
				users[i].weeks[j].orderedFWRA = users[i].weeks[j - 1].ordered + users[i].weeks[j - 2].ordered + users[i].weeks[j - 3].ordered + users[i].weeks[j - 4].ordered;
				if (users[i].weeks[j].errorsFWRA && users[i].weeks[j].orderedFWRA) {
					users[i].weeks[j].fwraRate = Math.round((users[i].weeks[j].errorsFWRA / users[i].weeks[j].orderedFWRA) * 1000) / 1000;
				}
			}
		}
	}


	//	Now populate missing hardware / wrong item.  
	for (let i = 0; i < missing.length; i++) {
		let userIndex = _.findIndex(users, function (user) {
			return user.name === missing[i].createdBy;
		});

		if (userIndex > -1) {
			let weekIndex = _.findIndex(users[userIndex].weeks, function (w) {
				return w.week === missing[i].weekOfYear;
			})

			if (weekIndex > -1) {
				users[userIndex].weeks[weekIndex].missing = missing[i].missing;
				users[userIndex].missingGrandTotal += missing[i].missing;
			}
		}
	}





	//	Sort users 
	users = _.orderBy(users, ['orderedGrandTotal'], ['desc']);
	return users;
}



var populateQuantity = async (sheetInfo, weeks, users) => {
	//	Populate the sheet
	for (let i = 0; i < users.length; i++) {
		let orderedWeeksStart = 2;
		let orderedWeeksEnd = orderedWeeksStart + weeks.length;
		let errorsWeeksStart = orderedWeeksStart + weeks.length + 3;
		let errorsWeeksEnd = errorsWeeksStart + weeks.length;

		sheetInfo.quantityTab.sheet.getCell(sheetInfo.quantityTab.row, 1).value = users[i].name;
		sheetInfo.quantityTab.sheet.getCell(sheetInfo.quantityTab.row, errorsWeeksStart - 1).value = users[i].name;

		for (let j = 0; j < users[i].weeks.length; j++) {
			sheetInfo.quantityTab.sheet.getCell(sheetInfo.quantityTab.row, orderedWeeksStart + j).value = users[i].weeks[j].ordered;
			sheetInfo.quantityTab.sheet.getCell(sheetInfo.quantityTab.row, errorsWeeksStart + j).value = users[i].weeks[j].errors;
		}

		sheetInfo.quantityTab.sheet.getCell(sheetInfo.quantityTab.row, orderedWeeksEnd).value = users[i].orderedGrandTotal;
		sheetInfo.quantityTab.sheet.getCell(sheetInfo.quantityTab.row, errorsWeeksEnd).value = users[i].errorsGrandTotal;

		await sheetInfo.quantityTab.sheet.getRow(sheetInfo.quantityTab.row).commit();

		sheetInfo.quantityTab.row++;
	}
}


var populateErrors = async (sheetInfo, weeks, users) => {
	//	Populate the sheet
	for (let i = 0; i < users.length; i++) {
		let errorsWeeksStart = 2;
		let errorsWeeksEnd = errorsWeeksStart + weeks.length - 1;
		let fwraWeeksStart = errorsWeeksEnd + 3;
		let fwraWeeksEnd = fwraWeeksStart + weeks.length;


		sheetInfo.errorTab.sheet.getCell(sheetInfo.errorTab.row, 1).value = users[i].name;
		sheetInfo.errorTab.sheet.getCell(sheetInfo.errorTab.row, fwraWeeksStart - 1).value = users[i].name;

		let leftTableOffset = 0;
		for (let j = 1; j < users[i].weeks.length; j++) {
			sheetInfo.errorTab.sheet.getCell(sheetInfo.errorTab.row, errorsWeeksStart + leftTableOffset).value = users[i].weeks[j].errorRate;
			sheetInfo.errorTab.sheet.getCell(sheetInfo.errorTab.row, errorsWeeksStart + leftTableOffset++).numFmt = '0%';
		}
		sheetInfo.errorTab.sheet.getCell(sheetInfo.errorTab.row, errorsWeeksEnd).value = users[i].errorRateTotal;
		sheetInfo.errorTab.sheet.getCell(sheetInfo.errorTab.row, errorsWeeksEnd).numFmt = '0.0%';


		let rightTableOffset = 0;
		for (let j = 4; j < users[i].weeks.length; j++) {
			sheetInfo.errorTab.sheet.getCell(sheetInfo.errorTab.row, fwraWeeksStart + rightTableOffset).value = users[i].weeks[j].fwraRate;
			sheetInfo.errorTab.sheet.getCell(sheetInfo.errorTab.row, fwraWeeksStart + rightTableOffset++).numFmt = '0.0%'
		}

		await sheetInfo.errorTab.sheet.getRow(sheetInfo.errorTab.row).commit();

		sheetInfo.errorTab.row++;
	}
}



var populateMissing = async (sheetInfo, weeks, users) => {
	//	Populate the sheet
	for (let i = 0; i < users.length; i++) {
		let orderedWeeksStart = 2;
		let orderedWeeksEnd = orderedWeeksStart + weeks.length;
		let missingWeeksStart = orderedWeeksStart + weeks.length + 3;
		let missingWeeksEnd = missingWeeksStart + weeks.length;

		sheetInfo.missingTab.sheet.getCell(sheetInfo.missingTab.row, 1).value = users[i].name;
		sheetInfo.missingTab.sheet.getCell(sheetInfo.missingTab.row, missingWeeksStart - 1).value = users[i].name;

		for (let j = 0; j < users[i].weeks.length; j++) {
			sheetInfo.missingTab.sheet.getCell(sheetInfo.missingTab.row, orderedWeeksStart + j).value = users[i].weeks[j].ordered;
			sheetInfo.missingTab.sheet.getCell(sheetInfo.missingTab.row, missingWeeksStart + j).value = users[i].weeks[j].missing;
		}

		sheetInfo.missingTab.sheet.getCell(sheetInfo.missingTab.row, orderedWeeksEnd).value = users[i].orderedGrandTotal;
		sheetInfo.missingTab.sheet.getCell(sheetInfo.missingTab.row, missingWeeksEnd).value = users[i].missingGrandTotal;
		let pct = (users[i].orderedGrandTotal && users[i].missingGrandTotal) ? Math.round ((users[i].missingGrandTotal / users[i].orderedGrandTotal) * 1000.00) / 1000.00 : 0; 
		sheetInfo.missingTab.sheet.getCell(sheetInfo.missingTab.row, missingWeeksEnd + 1).value = pct;
		sheetInfo.missingTab.sheet.getCell(sheetInfo.missingTab.row, missingWeeksEnd + 1).numFmt = '0.0%';

		await sheetInfo.missingTab.sheet.getRow(sheetInfo.missingTab.row).commit();

		sheetInfo.missingTab.row++;
	}
}





var completeWorkbook = async (sheetInfo) => {

	await sheetInfo.workbook.commit();
	// await exportWorkbook.xlsx.writeFile('sheets/' + jobInfo.exportFile);

	var results = await fileUtils.storeMultipartFile(sheetInfo.storageContext, 'weekly-inspection-accuracy', sheetInfo.options.filename, 'weekly-inspection-accuracy.xlsx', false);

	if (results != undefined) {
		comms.sendEmail(sheetInfo.recipients, 'Inspection Accuracy Report', '', `<br><br><b><a href="${results.url}">Inspection Accuracy Report</a>`, 'noreply@rushmarket.com', undefined, undefined);
		console.log("URL: " + results.url);
	}

	// Remove the local exported products file.
	await fs.unlink(sheetInfo.options.filename);
}






var populateWeeks = (weeks) => {
	let dataStartDate = moment('2022-01-01 00:00:00');
	let dateStart = moment().subtract(12, 'months');
	let today = moment();

	//	If before 1/1/22, align
	if (dateStart.isBefore(dataStartDate)) {
		dateStart = dataStartDate;
	}
	while (1) {
		let week = {
			week: dateStart.week(),
			startDate: dateStart.startOf('week').format("YYYY-MM-DD"),
			endDateDisplay: dateStart.endOf('week').format("MM/DD")
		}

		if (dateStart.endOf('week').isSameOrBefore(today)) {
			weeks.push(week);
			dateStart = dateStart.add(1, 'week');
		} else {
			break;
		}
	}
}


module.exports = {
	generateReport
}