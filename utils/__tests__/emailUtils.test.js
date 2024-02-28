const { test, describe, expect } = require("@jest/globals");
const emailUtils = require("../emailUtils");


describe("objectToHTMLtable", () => {

	test('converts an object to an html table of key value pairs', () => {
		const obj = {
			foo: "foo value",
			bar: 123.45,
			baz: true
		};
		expect(emailUtils.objectToHTMLtable(obj)).toBe(
			"<table><tr><td>foo</td><td>foo value</td></tr><tr><td>bar</td><td>123.45</td></tr><tr><td>baz</td><td>true</td></tr></table>"
		);
	});

	test('object keys contain spaces', () => {
		const obj = {
			'foo key': "foo value",
			'bar key': 123.45,
			'baz key': true
		};
		expect(emailUtils.objectToHTMLtable(obj)).toBe(
			"<table><tr><td>foo key</td><td>foo value</td></tr><tr><td>bar key</td><td>123.45</td></tr><tr><td>baz key</td><td>true</td></tr></table>"
		);
	});

});


describe("objectToTextTable", () => {

	test('converts an object to plain text table of key value pairs', () => {
		const obj = {
			foo: "foo value",
			bar: 123.45,
			baz: true
		};
		expect(emailUtils.objectToTextTable(obj)).toBe(`\
foo: foo value
bar: 123.45
baz: true`
		);
	});

	test('object keys contain spaces', () => {
		const obj = {
			'foo key': "foo value",
			'bar key': 123.45,
			'baz key': true
		};
		expect(emailUtils.objectToTextTable(obj)).toBe(`\
foo key: foo value
bar key: 123.45
baz key: true`
		);
	});

});
