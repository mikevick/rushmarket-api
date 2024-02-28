'use strict'

const express = require('express')
const router = express.Router()

const jwtUtils = require('../actions/jwtUtils')
const { conditionSku } = require('../actions/productsProcessCondition')

const logUtils = require('../utils/logUtils')
const memberText = require('../utils/memberTextUtils')
const { formatResp, respond } = require('../utils/response')
const { getUserIdAndType } = require('../utils/userUtils')

const validConditionNames = ['New', 'Like New', 'Damaged', 'Trash']
const validMissingHardwares = ['No', 'Some/Few', 'Most/All']
const validBooleanValues = ['Y', 'N']

const damageLocations = ['Top, front, corner, sides', 'Bottom or back', 'Interior']
const damageVisibilities = ['Clearly Visible', 'Hidden']
const damageSeverities = ['Minor', 'Moderate', 'Considerable']

//
//  PUT /products/process/condition/:rushSku
//
router.put('/:rushSku', jwtUtils.verifyToken, async (req, res, next) => {
  try {
    const resp = {
      statusCode: 200,
      message: 'Success',
    }

    const { userId, userType } = getUserIdAndType(req)
    const facilityId = req.decoded.identity?.facilityId || req.body.facilityId
    const partnerId = req.decoded.identity?.partnerId || req.body.partnerId

    const { rushSku } = req.params
    const { storeId, damage: damages, missingHardware, assemblyInstructions } = req.body
    let { conditionName } = req.body
    const notes = req.body.notes ? req.body.notes.trim() : req.body.notes

    if (!conditionName || !damages || !Array.isArray(damages) || !missingHardware || !assemblyInstructions) {
      const missingResp = formatResp(
        resp,
        undefined,
        400,
        memberText
          .get('MISSING_REQUIRED')
          .replace('%required%', 'conditionName, damage, missingHardware, assemblyInstructions')
      )
      respond(missingResp, res, next)
      return
    }

    // validate enums
    if (!validConditionNames.includes(conditionName)) {
      respond({}, res, next, [], 400, `invalid value for conditionName`)
      return
    }

    if (!validMissingHardwares.includes(missingHardware)) {
      respond({}, res, next, [], 400, `invalid value for missingHardware`)
      return
    }

    if (!validBooleanValues.includes(assemblyInstructions)) {
      respond({}, res, next, [], 400, `invalid value for assemblyInstructions`)
      return
    }

    // ensure all damages are valid
    const damagesRequiredAndMissing = conditionName === 'Damaged' && missingHardware === 'No' && damages.length === 0
    if (damagesRequiredAndMissing) {
      respond({}, res, next, [], 400, `damage must contain one or more entries`)
      return
    }

    const damagesValid = damages.reduce(
      (results, damage) =>
        results &&
        typeof damage.location !== 'undefined' &&
        damageLocations.includes(damage.location) &&
        typeof damage.visibility !== 'undefined' &&
        damageVisibilities.includes(damage.visibility) &&
        typeof damage.severity !== 'undefined' &&
        damageSeverities.includes(damage.severity),
      true
    )

    if (!damagesValid) {
      respond({}, res, next, [], 400, `damages with invalid data submitted`)
      return
    }

    // Automatically mark product as trash if it is Damaged and missing most or
    // all hardware.
    if (conditionName === 'Damaged' && missingHardware === 'Most/All') {
      if (!notes) {
        respond({}, res, next, [], 400, 'Damaged and missing most/all hardware will automatically be marked as trash. Please provide notes...');
        return;
      }

      conditionName = 'Trash';
      resp.data = { trashed: true };
    }

    await conditionSku(
      rushSku,
      conditionName,
      damages,
      missingHardware,
      assemblyInstructions,
      notes,
      partnerId,
      facilityId,
      userId,
      userType,
      storeId
    )
    respond({ ...resp, success: true }, res, next)
  } catch (e) {
    logUtils.routeExceptions(e, req, res, next, {})
  }
})

module.exports = router
