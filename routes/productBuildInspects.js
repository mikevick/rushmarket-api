'use strict';

const express = require('express');
const router = express.Router();
const check = require('check-types');

const ProductBuildInspects = require('../actions/productBuildInspects');
const logUtils = require('../utils/logUtils');
const memberText = require('../utils/memberTextUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');

//  GET /proudctBuildInspects/
router.get(`/`, (req, res, next) => {
  var resp = {
    statusCode: 200,
    message: 'Success.',
    metaData: {
      totalCount: 0
    },
    data: {}
  };

  let whereInfo = {
    clause: 'where 1=1',
    values: []
  };

  let sortBy = "";

  // limit and offset defaults and query overrides
  let limit = 10;
  let offset = 0;

  try {
    if (req.query.hasOrderLines && Number.parseInt(req.query.hasOrderLines) === 1) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'li.sku IS NOT NULL');
      if (req.query.createdDateStart) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'li.line_item_date_created >= ?', req.query.createdDateStart);
      } 
      if (req.query.createdDateEnd) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'li.line_item_date_created <= ?', req.query.createdDateEnd);
      }
    } else {
      if (req.query.createdDateStart) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'bi.created_date >= ?', req.query.createdDateStart);
      } 
      if (req.query.createdDateEnd) {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'bi.created_date <= ?', req.query.createdDateEnd);
      }
    }
    if (req.query.done != undefined) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'bi.done = ?', Number.parseInt(req.query.done));
    }
    if (req.query.sku) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'bi.sku = ?', req.query.sku);
    }
    if (req.query.storeId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'bi.store_id = ?', req.query.storeId);
    }
    if (req.query.buildInspectId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'bi.build_inspect_id = ?', req.query.buildInspectId);
    }
    if (req.query.userId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'bi.user_id = ?', req.query.userId);
    }
    if (req.query.manifestId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'p.manifest_id = ?', req.query.manifestId);
    }
    if (req.query.createdDate) {
      whereInfo = sqlUtils.appendWhere(whereInfo, '( bi.created_date BETWEEN ? AND ? )', [req.query.createdDate, req.query.createdDate]);
    }
    if (req.query.hasIssues) {
      whereInfo = sqlUtils.appendWhere(whereInfo, '( bi.build_inspect_issues != "")');
    }
    if (req.query.issueId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'bi.build_inspect_issues LIKE ?', `%${req.query.issueId}%`);
    }
    if (req.query.categoryParentId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'cm.category_id IN ( SELECT category_id FROM categories WHERE parent_id = ? )', req.query.categoryParentId);
    }
    if (req.query.categoryId) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'cm.category_id = ?', req.query.categoryId);
    }
    if (req.query.locationNumber) {
      if (req.query.locationNumberExactMatch != undefined && req.query.locationNumberExactMatch === 'true') {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'p.location_number = ?', req.query.locationNumber);
      } else {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'p.location_number LIKE ?', `%${req.query.locationNumber}%`);
      }
    }
    
    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }
    
    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, ['storage_area_name']);
      if (sortBy === 'field') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }

    if ((sortBy != 'field') && (sortBy != 'direction')) {
      ProductBuildInspects.getAll(whereInfo, sortBy, offset, limit, resp)
        .then((resp) => {
          response.respond(resp, res, next);
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined);
        })
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

//  GET /proudctBuildInspects/{:id}
router.get(`/:id`, (req, res, next) => {
	try {
		var resp = {
      statusCode: 200,
      message: 'Success.',
			data: {}
    };
    
		ProductBuildInspects.getById(req.params.id, resp)
			.then((result) => {
				if (result.data.productBuildInspects.length === 0) {
					response.respond(resp, res, next, ["productBuildInspects"], 404);
				} else {
					response.respond(resp, res, next);
				}
			})
			.catch((e) => {
				logUtils.routeExceptions(e, req, res, next, resp, ["productBuildInspects"]);
			})
	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, ["productBuildInspects"]);
	}
})

//  POST /proudctBuildInspects/
router.post(`/`, (req, res, next) => {
  let resp = {
    statusCode: 201,
    message: 'Success.'
  };
  try {
    if (req.body.userId === undefined || req.body.userType === undefined || req.body.storeId === undefined || req.body.sku === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'sku, userId, userType, storeId'));
    } else {
      ProductBuildInspects.create(req.body, resp)
        .then((resp) => {
          response.respond(resp, res, next);
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined);
        })    
    }
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id']);
  }
})

//  PUT /proudctBuildInspects/{:id}
router.put('/:id', (req,res,next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };
  let setInfo = {
    clause: '',
    values: []
  };
  try {
    if (req.body.issueId) {
      setInfo = sqlUtils.appendSet(setInfo, 'build_inspect_issues = ?', req.body.issueId);
    }
    if (req.body.buildInspectStatusId) {
      setIinfo = sqlUtils.appendSet(setInfo, 'build_inspect_status_id = ?', req.body.buildInspectStatusId);
      setIinfo = sqlUtils.appendSet(setInfo, 'done = ?', 1);
    }
    if (req.body.buildInspectNotes) {
      setInfo = sqlUtils.appendSet(setInfo, 'build_inspect_notes = ?', req.body.buildInspectNotes);
    }
    if (req.body.numberOfUsers) {
      setInfo = sqlUtils.appendSet(setInfo, 'number_of_users = ?', Number.parseInt(req.body.numberOfUsers));
    }
    if (req.body.includeBuildTime) {
      setInfo = sqlUtils.appendSet(setInfo, 'include_build_time = ?', Number.parseInt(req.body.includeBuildTime));
    }
    if (req.body.isInspected) {
      setInfo = sqlUtils.appendSet(setInfo, 'is_inspected = ?', Number.parseInt(req.body.isInspected));
    }
    if (req.body.preAssembled) {
      setInfo = sqlUtils.appendSet(setInfo, 'pre_assembled = ?', Number.parseInt(req.body.preAssembled));
    }
    if (req.body.inBox) {
      setInfo = sqlUtils.appendSet(setInfo, 'in_box = ?', Number.parseInt(req.body.inBox));
    }
    if (req.body.userId) {
      setInfo = sqlUtils.appendSet(setInfo, 'user_id = ?', req.body.userId);
      setInfo = sqlUtils.appendSet(setInfo, 'done_date = NOW()');
      setInfo = sqlUtils.appendSet(setInfo, 'done = 1');
    }
    if (req.body.userType) {
      setInfo = sqlUtils.appendSet(setInfo, 'user_type = ?', req.body.userType);
    }
    ProductBuildInspects.updateById(req.params.id, setInfo, resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })    
   
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id']);
  }

})

//  PUT /proudctBuildInspects/{:id}/start
router.put('/:id/start', (req,res,next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };
  let setInfo = {
    clause: '',
    values: []
  };
  try {
    setInfo = sqlUtils.appendSet(setInfo, 'start_datetime = NOW()');
    setInfo = sqlUtils.appendSet(setInfo, 'end_datetime = NOW()');

    ProductBuildInspects.updateById(req.params.id, setInfo, resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })    
   
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id']);
  }
})

//  PUT /proudctBuildInspects/{:id}/pause
router.put('/:id/pause', (req,res,next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };
  let setInfo = {
    clause: '',
    values: []
  };
  try {
    setInfo = sqlUtils.appendSet(setInfo, 'end_datetime = NOW()');

    ProductBuildInspects.updateById(req.params.id, setInfo, resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })    
   
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id']);
  }

})

//  PUT /proudctBuildInspects/{:id}/addSeconds
router.put('/:id/addSeconds', (req,res,next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };
  let setInfo = {
    clause: '',
    values: []
  };
  try {
    if (req.body.seconds === undefined || req.body.seconds === null) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'seconds'));
    } else {
      setInfo = sqlUtils.appendSet(setInfo, 'total_seconds = total_seconds + ?', req.body.seconds);
      ProductBuildInspects.updateStartById(req.params.id, setInfo, resp)
        .then((resp) => {
          response.respond(resp, res, next);
        })
        .catch((e) => {
          logUtils.routeExceptions(e, req, res, next, resp, undefined);
        })    
    }   
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, ['id']);
  }

})

module.exports = router;