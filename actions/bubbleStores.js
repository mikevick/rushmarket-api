'use strict'

const { formatResp } = require('../utils/response')

const BubbleStores = require('../models/bubbleStores')

// Create bubble
var create = async (bubbleId, shopifyStoreId, resp) => {
  // bubble must exist
  var bubble = await Bubbles.getById(bubbleId)

  if (bubble.length === 0) {
    formatResp(resp, undefined, 404, 'This Bubble Id not found in bubbles; Please add stores to an existing bubble.')
  } else {
    var result = await BubbleStores.create(bubbleId, shopifyStoreId)
    resp.id = result
  }

  return resp
}

var updateById = async (id, setInfo, resp) => {
  var bubbles = await BubbleStores.getById(id)

  if (bubbles.length === 0) {
    formatResp(resp, undefined, 404, 'No bubble store found.')
  } else {
    var updateBubble = await BubbleStores.updateById(id, setInfo)

    if (updateBubble.rows.length === 0) {
      formatResp(resp, undefined, 404, 'Bubble store not updated.')
    } else {
      resp.data = updateBubble.rows
    }
  }
  return resp
}

var getAll = async (whereInfo, offset, limit, resp) => {
  var bubbles = await BubbleStores.getAll(whereInfo, offset, limit)

  resp.metaData.totalCount = bubbles.totalCount
  if (bubbles.rows.length === 0) {
    formatResp(resp, undefined, 404, 'No Bubble Stores found.')
  } else {
    resp.data.bubblestores = bubbles.rows
  }

  return resp
}

var getById = async (id, resp) => {
  var bubbles = await BubbleStores.getById(id)

  if (bubbles.length === 0) {
    formatResp(resp, undefined, 404, 'No bubble stores found.')
  } else {
    resp.data = bubbles[0]
  }

  return resp
}

var remove = async (id, resp) => {
  var bubble = await BubbleStores.getById(id)

  if (bubble.length === 0) {
    formatResp(resp, undefined, 404, 'Bubble stores not found.')
  } else {
    await BubbleStores.removeById(id)
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
