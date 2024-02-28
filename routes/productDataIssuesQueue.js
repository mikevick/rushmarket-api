'use strict';

const _ = require('lodash');
const check = require('check-types');
const express = require('express');
const router = express.Router();

const productDataIssuesQueue = require('../actions/productDataIssuesQueue');
const memberText = require('../utils/memberTextUtils');
const logUtils = require('../utils/logUtils');
const response = require('../utils/response');
const sqlUtils = require('../utils/sqlUtils');



//  Get Issue Types
router.get(`/issueTypes`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };

  try {
    productDataIssuesQueue.getIssueTypes(resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})



//  Get all Product Data Issues Queue (GET)
router.get(`/`, (req, res, next) => {
  let resp = {
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


  // limit and offset defaults and query overrides
  let limit = 10;
  let offset = 0;
  let sortBy = "pdiq.id ASC";

  try {
    if (req.query.sku) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'pdiq.sku = ?', req.query.sku);
    }

    if (req.query.partnerFacility) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'partner_facility = ?', req.query.partnerFacility);
    }

    if (req.query.createdByType) {
      if (req.query.createdByType.indexOf(',') >= 0) {
        let s = _.split(req.query.createdByType, ',')
        let placeholders = '';
        for (let i = 0; i < s.length; i++) {
          if (placeholders.length > 0) {
            placeholders += ', ';
          }
          placeholders += '?';
        }
        whereInfo = sqlUtils.appendWhere(whereInfo, 'created_by_type IN (' + placeholders + ')', s);
      } else {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'created_by_type = ?', req.query.createdByType);
      }
    }

    if (req.query.status) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'pdiq.status IN (?)');
      whereInfo.values.push(req.query.status.split(','));
    }

    if (req.query.createdBy) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'pdiq.created_by = ?', req.query.createdBy);
    }

    if (req.query.dateCreatedStart) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'DATE(pdiq.date_created) >= ?', req.query.dateCreatedStart);
    }

    if (req.query.dateCreatedEnd) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'DATE(pdiq.date_created) <= ?', req.query.dateCreatedEnd);
    }

    if (req.query.assignedUserId) {
      if (req.query.assignedUserId.toLowerCase() === 'null') {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'ISNULL(pdiq.assigned_user_id)');
      } else {
        whereInfo = sqlUtils.appendWhere(whereInfo, 'pdiq.assigned_user_id = ?', req.query.assignedUserId);
      }
    }

    if (req.query.dateModifiedStart) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'DATE(pdiq.date_modified) >= ?', req.query.dateModifiedStart);
    }

    if (req.query.dateModifiedEnd) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'DATE(pdiq.date_modified) <= ?', req.query.dateModifiedEnd);
    }

    if (req.query.modifiedBy) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'pdiq.modified_by = ?', req.query.modifiedBy);
    }

    if (req.query.issueType) {
      whereInfo = sqlUtils.appendWhere(whereInfo, 'pv.key LIKE ?', '%' + req.query.issueType + '%');
    }

    if ((req.query.limit) && (check.integer(parseInt(req.query.limit)))) {
      limit = parseInt(req.query.limit);
    }

    if ((req.query.offset) && (check.integer(parseInt(req.query.offset)))) {
      offset = parseInt(req.query.offset);
    }

    if (req.query.sortBy) {
      sortBy = sqlUtils.parseSortBy(req.query.sortBy, [
          'pdiq.id', 'pdiq.sku', 'pdiq.status', 'pdiq.created_by', 'pdiq.date_created', 'pdiq.date_modified', 'pdiq.assigned_user_id', 
          'created_by_user_name', 'assigned_user_name', 'seller_product_id', 'manifest_identifier', 'sortable_key_values',
          'store_name', 'category_1', 'category_2', 'product_name',
        ]
      );

      if (sortBy === 'field') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy field.');
      } else if (sortBy === 'direction') {
        response.respond(resp, res, next, undefined, 400, 'Invalid sortBy direction.');
      }
    }
    productDataIssuesQueue.getAll(whereInfo, sortBy, offset, limit, resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

//  Get Product Data Issues Queue by id (GET)
router.get(`/:id`, (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    data: {}
  };

  try {
    productDataIssuesQueue.getById(req.params.id, resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, undefined);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp, undefined);
  }
})

// Create conditions (POST)
router.post(`/`, (req, res, next) => {
  let resp = {
    statusCode: 201,
    message: 'Success.',
    id: 0
  };
  try {
    if (req.body.sku === undefined || req.body.status === undefined || req.body.createdBy === undefined) {
      response.respond(resp, res, next, ['id'], 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'sku, status, createdBy'));
    } else {
      productDataIssuesQueue.create(req.body.sku, req.body.status, req.body.createdBy, req.body.createdByType || 'INTERNAL', req.body.assignedUserId, resp)
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

// Update conditions (PUT)
router.put('/:id', (req, res, next) => {
  let resp = {
    statusCode: 200,
    message: 'Success.',
    id: 0
  };
  let setInfo = {
    clause: '',
    values: []
  };

  try {
    // create setInfo
    if (req.body.sku) {
      setInfo = sqlUtils.appendSet(setInfo, 'sku = ?', req.body.sku);
    }
    if (req.body.status) {
      setInfo = sqlUtils.appendSet(setInfo, 'status = ?', req.body.status);
    }
    if (req.body.assignedUserId) {
      setInfo = sqlUtils.appendSet(setInfo, 'assigned_user_id = ?', req.body.assignedUserId);
    }
    if (req.body.modifiedBy) {
      setInfo = sqlUtils.appendSet(setInfo, 'modified_by = ?', req.body.modifiedBy);
      setInfo = sqlUtils.appendSet(setInfo, 'modified_by_type = ?', req.body.modifiedByType || 'INTERNAL')
    }
    setInfo = sqlUtils.appendSet(setInfo, 'date_modified = NOW()');

    productDataIssuesQueue.updateById(req.params.id, setInfo, resp)
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

// delete conditions by id (DELETE)
router.delete(`/:id`, (req, res, next) => {
  try {
    let resp = {
      statusCode: 200,
      message: 'Success.'
    };
    productDataIssuesQueue.remove(req.params.id, resp)
      .then((resp) => {
        response.respond(resp, res, next);
      })
      .catch((e) => {
        logUtils.routeExceptions(e, req, res, next, resp, ['id']);
      })
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, resp);
  }
})


router.put('/:sku/done', (req, res, next) => {
	let resp = {
		statusCode: 200,
		message: 'Success.',
	};

	let setInfo = {
		clause: '',
		values: []
	};

	try {
    if (req.body.key === undefined || req.body.userId === undefined) {
      response.respond(resp, res, next, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'key, userId'));
    }

		setInfo = sqlUtils.appendSet(setInfo, 'done = ?', 'Y');
		setInfo = sqlUtils.appendSet(setInfo, 'done_by = ?', req.body.userId);
		setInfo = sqlUtils.appendSet(setInfo, 'date_done = NOW()');

		productDataIssuesQueue.updateProductVerification(req.params.sku, req.body.key, setInfo, resp)
			.then((resp) => response.respond(resp, res, next))
			.catch((e) => logUtils.routeExceptions(e, req, res, next, resp, undefined));

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});


router.put('/:sku/incomplete', (req, res, next) => {
	let resp = {
		statusCode: 200,
		message: 'Success.',
	};
	let setInfo = {
		clause: '',
		values: []
	};

	try {
    if (req.body.key === undefined) {
      response.respond(resp, res, next, undefined, 400, memberText.get('MISSING_REQUIRED').replace('%required%', 'key'));
    }

		setInfo = sqlUtils.appendSet(setInfo, 'done = ?', 'N');
		setInfo = sqlUtils.appendSet(setInfo, 'done_by = NULL');
		setInfo = sqlUtils.appendSet(setInfo, 'date_done = NULL');

		productDataIssuesQueue.updateProductVerification(req.params.sku, req.body.key, setInfo, resp)
			.then((resp) => response.respond(resp, res, next))
			.catch((e) => logUtils.routeExceptions(e, req, res, next, resp, undefined));

	} catch (e) {
		logUtils.routeExceptions(e, req, res, next, resp, undefined);
	}
});


module.exports = router;
