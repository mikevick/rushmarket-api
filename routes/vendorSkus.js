'use strict';

const check = require('check-types');
const express = require('express');
const router = express.Router();

const {
  getAll
} = require('../actions/vendorSkus');

const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const {
  respond
} = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

//
//  GET /vendorSkus
//
router.get(`/`, async (req, res, next) => {
  try {
    var limit = 50;
    var offset = 0;
    var resp = {
      statusCode: 200,
      message: 'Success.',
      metaData: {
        totalCount: 0
      },
      data: {}
    };
    var whereInfo = {
      join: '',
      clause: '',
      values: []
    };

		var sortBy = 'vendor_sku ASC';

    if (req.get('x-app-type') != 'INT') {
			resp = response.formatResp(resp, undefined, 403, 'Access denied.');
			respond(resp, res, next);
		}
		else if (req.query.attributes === undefined) {
			resp = response.formatResp(resp, undefined, 400, 'Attributes required.');
			respond(resp, res, next);
		} else {
      if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
        limit = parseInt(req.query.limit);
      }

      if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
        offset = parseInt(req.query.offset);
      }

      if (req.query.attributes) {
				try {
					var json = JSON.parse(req.query.attributes);

					for (var i=0; i < json.length; i++) {
						whereInfo = sqlUtils.appendWhere(whereInfo, "((p.attribute_name1 = ? AND p.attribute_value1 = ?) OR " +
																												"(p.attribute_name2 = ? AND p.attribute_value2 = ?) OR " +
																												"(p.attribute_name3 = ? AND p.attribute_value3 = ?) OR " +
																												"(p.attribute_name4 = ? AND p.attribute_value4 = ?) OR " +
																												"(p.attribute_name5 = ? AND p.attribute_value5 = ?) OR " +
																												"(p.attribute_name6 = ? AND p.attribute_value6 = ?) OR " +
																												"(\'Primary Material\' = ? AND p.primary_material = ?) OR " +		
																												"(\'Secondary Material\' = ? AND p.secondary_material = ?) OR " +
																												"(\'Material Specific\' = ? AND p.material_specific = ?) OR " +	
																												"(\'Primary Color\' = ? AND p.primary_color = ?) OR " +
																												"(\'Color Specific\' = ? AND p.color_specific = ?) OR " +	
																												"(\'Product Size\' = ? AND p.product_size = ?) OR " +
																												"(\'Style\' = ? AND p.style_tag1 = ?) OR " +	
																												"(\'Style\' = ? AND p.style_tag2 = ?)) ", 
																												 [json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value, 
																													json[i].name, json[i].value]);
					}

					resp = await getAll(whereInfo, offset, limit, resp);

					respond(resp, res, next);
				}
				catch(e) {
					resp = response.formatResp(resp, undefined, 400, 'Attributes must be JSON.');
					respond(resp, res, next);
				}

			}
		}
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp);
  }
})

module.exports = router
