'use strict';

var apiBase = (process.env.apiBase || 'http://localhost:3000');
var apiTimeout = 300000;
var apiVers = 'v1';

var appIds = [];

var botBase = (process.env.botBase || 'http://localhost:3978');


var mongoid = null;

var logPool = null;

var pool = null;
var poolRO = null;

var productPool = null;
var productROPool = null;

module.exports = {
	apiBase,
  apiTimeout,
	apiVers,
	appIds,
	botBase,
	pool,
	productPool
};
