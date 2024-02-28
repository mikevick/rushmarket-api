const moment = require('moment');

/**
 * Formats a value like currency (ie $10.00)
 * @param {number} value
 * @param {integer} decimals
 * @returns
 */
exports.currency = (value, decimals = 2, defaultValue = 0) => {
  const number = typeof value === 'number' ? value : defaultValue;
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals
  });
  return formatter.format(number);
}

/**
 * Formats a date value with moment
 * @param {date} date
 * @param {string} format
 * @param {any} notDateValue
 * @returns
 */
exports.date = (date, format = 'MM-DD-YYYY', notDateValue = '') => {
  return date ? moment(date).format(format) : notDateValue;
}

const parseDigits = /\d/g

/**
 * Formats a phone number as (xxx) xxx-xxxx
 * @param {any} value
 * @returns {string}
 */
exports.phoneNumber = (value) => {
  if (typeof value !== 'string') {
    return value
  }
  const digits = Array.from(value.matchAll(parseDigits), m => m[0])
  if (digits.length === 10) {
    const areaCode = digits.slice(0, 3)
    const exchangeCode = digits.slice(3, 6)
    const subscriberNumber = digits.slice(6, 11)
    return `(${areaCode.join('')}) ${exchangeCode.join('')}-${subscriberNumber.join('')}`
  }
  return value
}
