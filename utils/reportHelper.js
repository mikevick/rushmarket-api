const excelJs = require('exceljs')

const generateReport = (data, title) => {
    const workbook = new excelJs.Workbook();
  
    const AUTHOR = "RUSH Tech Team";
    workbook.creator = AUTHOR;
    workbook.lastModifiedBy = AUTHOR;
  
    const worksheet = workbook.addWorksheet(title);
  
    const columns = _getColumns(data);
    worksheet.columns = columns;
  
    worksheet.addRows(data);
    return workbook
  };
  
  const _getColumns = (data) => {
    const headers = Object.keys(data[0]);
    const columns = headers.map((header) => {
      return {
        header: _humanifyStrings(header),
        key: header,
        width: 30,
      };
    });
    return columns;
  };
  
  const _humanifyStrings = (dirtyString) => {
    const words = dirtyString.match(/[A-Za-z][a-z]*|[0-9]+/g) || [];
    const cleanString = words
      .map((word) => word.charAt(0).toUpperCase() + word.substring(1))
      .join(" ");
    return cleanString;
  };

const reportHelper = {
    generateReport
}

module.exports = reportHelper