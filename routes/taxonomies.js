'use strict';

const express = require('express');
const router = express.Router();

const {
	getActive,
	getTaxonomyProductsByCategory,
	getAllCategories
} = require('../actions/taxonomies');

const logUtils = require('../utils/logUtils');
const {
	respond
} = require('../utils/response');

//
//  GET /taxonomies
//
router.get(`/`, async (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		resp = await getActive(req, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})

//
//  GET /taxonomies/products
//
// router.get(`/products`, jwtUtils.verifyToken, async (req, res, next) => {
// 	try {
// 		var limit = 50;
// 		var offset = 0;
// 		var resp = {
// 			statusCode: 200,
// 			message: 'Success.',
// 			data: {}
// 		}

// 		resp = await getTaxonomyProducts(req, resp);
// 		respond(resp, res, next);
// 	} catch (e) {
// 		logUtils.routeExceptions(e, req, res, next, resp);
// 	}
// })


//
//  GET /taxonomies/products/:slug
//
router.get(`/products/:slug`, async (req, res, next) => {
	try {
		var limit = 50;
		var offset = 0;
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {}
		}

		resp = await getTaxonomyProductsByCategory(req.params.slug, req, resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})


//
//  GET /taxonomies/categories
//
router.get(`/categories`,  async (req, res, next) => {
	try {
		var resp = {
			statusCode: 200,
			message: 'Success.',
			data: {
				categories: []
			}
		}
		
		resp = await getAllCategories(resp);
		respond(resp, res, next);
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp);
	}
})

module.exports = router