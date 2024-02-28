'use strict'

const { formatResp } = require('../utils/response')
const BubbleRanges = require('../models/bubbleRanges')

// Create bubble
var create = async (bubbleId, zipCodeStart, zipCodeEnd, resp) => {
  var validation_err = 0

  // bubble must exist
  var bubble = await Bubbles.getById(bubbleId)

  if (bubble.length === 0) {
    formatResp(resp, undefined, 404, 'This Bubble Id not found in bubbles; Please add ranges to an existing bubble.')
  } else {
    var result = await BubbleRanges.create(bubbleId, zipCodeStart, zipCodeEnd)
    resp.id = result
  }

  return resp
}

var updateById = async (id, setInfo, resp) => {
  var bubbles = await BubbleRanges.getById(id)

  if (bubbles.length === 0) {
    formatResp(resp, undefined, 404, 'No bubble range found.')
  } else {
    var updateBubble = await BubbleRanges.updateById(id, setInfo)

    if (updateBubble.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Bubble range not updated.')
    } else {
      resp.data = updateBubble.rows
    }
  }
  return resp
}

var getAll = async (whereInfo, offset, limit, resp) => {
  var bubbles = await BubbleRanges.getAll(whereInfo, offset, limit)

  resp.metaData.totalCount = bubbles.totalCount
  if (bubbles.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No Bubble Ranges found.')
  } else {
    resp.data.bubbles = bubbles.rows
  }

  return resp
}

var getById = async (id, resp) => {
  var bubbles = await BubbleRanges.getById(id)

  if (bubbles.length === 0) {
    formatResp(resp, undefined, 404, 'No bubble range found.')
  } else {
    resp.data = bubbles[0]
  }

  return resp
}

var remove = async (id, resp) => {
  var bubble = await BubbleRanges.getById(id)

  if (bubble.length === 0) {
    formatResp(resp, undefined, 404, 'Bubble range not found.')
  } else {
    await BubbleRanges.removeById(id)
  }

  return resp
}

module.exports = {
  create,
  updateById,
  getAll,
  getById,
  remove
}
