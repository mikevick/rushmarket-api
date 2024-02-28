const fs = require('fs')
const Downloader = require('nodejs-file-downloader')
const os = require('os')
const magic = require('stream-mmmagic')

const { currency, date, phoneNumber } = require('../utils/formatters')
const { logException } = require('../utils/logUtils')

const titleFontSize = 20
const headingFontSize = 12
const defaultFontSize = exports.defaultFontSize = 10

const compatibleImageMimeTypes = ['image/jpeg', 'image/png']
const emptyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAABCAQAAACC0sM2AAAADElEQVR42mNkGCYAAAGSAAIVQ4IOAAAAAElFTkSuQmCC'

const closeStream = (stream) => new Promise(resolve => {
  if (stream.destroyed) {
    resolve()
    return
  }
  stream.on('close', resolve)
  stream.destroy()
})

exports.getSingleOrderPdfDocDefinition = async ({ carrier, lineItems, ltlShipping, member, order }) => {
  const tmpdir = os.tmpdir()
  const images = await Promise.allSettled(
    lineItems.map(async (item) => {
      const downloader = new Downloader({
        url: item.image.startsWith('http') ? item.image : `https:${item.image}`,
        directory: tmpdir,
        fileName: `order-pdf-image-line-item-${item.orderLineItemId}`,
        cloneFiles: false
      })
      return downloader.download()
    }))
    .then(results => Promise.all(results.map(async (result, index) => {
      const lineItem = lineItems[index]

      if (result.status === 'rejected') {
        await logException(`Order PDF: error loading image [${lineItem.image}] for order line item [${lineItem.orderLineItemId}]: ${result.reason}`)
        return null
      }

      const imagePath = result.value.filePath
      const imageStream = fs.createReadStream(imagePath)
      const [{ type }, outputStream] = await magic.promise(imageStream)
        .catch(identifyError => closeStream(imageStream).then(() => {
          throw new Error(`Order PDF: error identifying image [${lineItem.image}] for order line item [${lineItem.orderLineItemId}]: ${identifyError.stack}`)
        }))
      await closeStream(outputStream)
      await closeStream(imageStream)

      if (!compatibleImageMimeTypes.includes(type)) {
        fs.unlinkSync(imagePath)
        await logException(`Order PDF: image [${lineItem.image}] for order line item [${lineItem.orderLineItemId}] is incompatible type [${type}]`)
        return null
      }

      return {
        lineItem,
        image: imagePath
      }
    })))
    .then(results => results.filter(result => result))
    .then(results => results.reduce((images, { lineItem, image }) => {
      images[lineItem.orderLineItemId] = image
      return images
    }, {}))

  async function cleanUp() {
    return Promise.allSettled(Object.values(images).map(async (image) => {
      fs.unlinkSync(image)
    })).then(results => {
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason.stack)
      if (errors.length) {
        throw new Error(`Errors cleaning up PDF generation for order [${order.sourceOrderName}]:\n${errors.join('\n')}`)
      }
    })
  }

  return {
    cleanUp,
    info: {
      title: `Order ${order.sourceOrderName}`
    },
    content: [
      { text: `Order ${order.sourceOrderName}`, fontSize: titleFontSize },
      {
        style: 'columns',
        columnGap: 5,
        columns: [
          {
            width: 170,
            stack: [
              {
                style: 'field',
                text: [
                  { text: 'Site Name: ', style: 'fieldName' },
                  order.platformChannel
                ]
              },
              {
                style: 'field',
                text: [
                  { text: 'Date Created: ', style: 'fieldName' },
                  date(order.orderDateCreated, 'YYYY-MM-DD hh:mma')
                ]
              },
              {
                style: 'field',
                text: [
                  { text: 'Total Price: ', style: 'fieldName' },
                  currency(order.totalPrice)
                ]
              },
              order.platformChannel ? {
                style: 'field',
                text: [
                  { text: 'Channel: ', style: 'fieldName' },
                  order.platformChannel
                ]
              } : {},
            ]
          },
          {
            width: 'auto',
            stack: [
              {
                text: `${order.customerFirstName} ${order.customerLastName}`,
                fontSize: headingFontSize,
                bold: true
              },
              order.customerEmail ? {
                style: 'field',
                text: [
                  { text: 'Email: ', style: 'fieldName' },
                  order.customerEmail
                ]
              } : {},
              order.phoneNumber ? {
                style: 'field',
                text: [
                  { text: 'Phone: ', style: 'fieldName' },
                  phoneNumber(order.phoneNumber)
                ]
              } : {},
              member.homeCity ? {
                style: 'field',
                text: [
                  { text: 'Home City: ', style: 'fieldName' },
                  member.homeCity
                ]
              } : {}
            ]
          }
        ]
      },
      {
        margin: [0, 0, 0, 5],
        stack: [
          { text: 'Shipping Address', style: 'field', fontSize: headingFontSize, bold: true },
          order.fullName ? { text: order.fullName, style: 'field' } : {},
          order.company ? { text: order.company, style: 'field' } : {},
          order.address1 ? { text: order.address1, style: 'field' } : {},
          order.address2 ? { text: order.address2, style: 'field' } : {},
          order.city ? { text: `${order.city}, ${order.state} ${order.zip}`, style: 'field' } : {},
        ]
      },
      {
        table: {
          widths: ['auto', 'auto', 'auto'],
          body: [
            [{ text: `Delivery - ${carrier}`, style: 'header', colSpan: 3 }, {}, {}],
            ...lineItems.flatMap(item => [
              [{ text: item.productName || item.name, style: 'itemName', colSpan: 3 }, {}, {}],
              [
                {
                  image: images[item.orderLineItemId] || emptyImage,
                  width: 100
                },
                {
                  stack: [
                    {
                      style: 'field',
                      text: [
                        { text: 'SKU: ', style: 'fieldName' },
                        item.sku
                      ]
                    },
                    item.sourceSku && (!item.sku || item.sku.toString().length !== 7) ? {
                      style: 'field',
                      text: [
                        { text: 'Source SKU: ', style: 'fieldName' },
                        item.sourceSku
                      ]
                    } : {},
                    item.quantity > 1 ? {
                      style: 'field',
                      text: [
                        { text: 'Quantity: ', style: 'fieldName' },
                        item.quantity
                      ]
                    } : {},
                    {
                      style: 'field',
                      text: [
                        { text: 'Vendor SKU: ', style: 'fieldName' },
                        item.sellerProductId
                      ]
                    },
                    {
                      style: 'field',
                      text: [
                        { text: 'Display: ', style: 'fieldName' },
                        item.productDisplay
                      ]
                    },
                    {
                      style: 'field',
                      text: [
                        { text: 'Location: ', style: 'fieldName' },
                        ['STS', 'DS'].includes(item.manifestSource) ?
                          'Drop Ship' :
                          `${item.productStoreName || ''} ${item.locationNumber}${item.palletNumber ? `\n(pallet: ${item.palletNumber})` : ''}`
                      ]
                    },
                    {
                      style: 'field',
                      stack: ['Damaged','Good','Fair'].includes(item.conditionName) ? [
                        { text: 'Condition: ', style: 'fieldName' },
                        'Priced for Condition:',
                        {
                          ul: [
                            item.damageLocation1 ? { text: `${item.damageLocation1} - ${item.damageVisibility1} - ${item.damageSeverity1}` } : {},
                            item.damageLocation2 ? { text: `${item.damageLocation2} - ${item.damageVisibility2} - ${item.damageSeverity2}` } : {},
                            item.damageLocation3 ? { text: `${item.damageLocation3} - ${item.damageVisibility3} - ${item.damageSeverity3}` } : {},
                            !item.damageLocation1 && !item.damageLocation2 && !item.damageLocation3 ? 'No specified' : {}
                          ]
                        }
                      ] : undefined,
                      text: !['Damaged','Good','Fair'].includes(item.conditionName) ? [
                        { text: 'Condition: ', style: 'fieldName' },
                        item.conditionName
                      ] : undefined
                    },
                    item.missingHardware ? {
                      style: 'field',
                      text: [
                        { text: 'Missing Parts: ', style: 'fieldName' },
                        item.missingHardware
                      ]
                    } : {},
                  ]
                },
                {
                  stack: [
                    {
                      style: 'field',
                      text: [
                        { text: 'Ship Type: ', style: 'fieldName' },
                        item.shipType
                      ]
                    },
                    {
                      style: 'field',
                      text: [
                        { text: `${item.adjustedBoxDims ? 'Adjusted' : 'Original'} Box Dims:` , style: 'fieldName' }
                      ]
                    },
                    ...(item.boxes || []).map((box, index) => ({
                      style: 'field',
                      text: [
                        { text: `Box ${index + 1}:` , style: 'fieldName' },
                        `${box.packageLength} x ${box.packageWidth} x ${box.packageHeight}`
                      ]
                    })),
                  ]
                }
              ]
            ])
          ]
        }
      }
    ],
    defaultStyle: {
      font: 'Helvetica',
      fontSize: defaultFontSize,
    },
    styles: {
      header: {
        fillColor: '#eeeeee',
        margin: [0, 2, 0, 0],
      },
      itemName: {
        bold: true,
        margin: [0, 2, 0, 0],
      },
      field: {
        margin: [0, 2],
      },
      fieldName: {
        bold: true,
      },
      columns: {
        margin: [0, 5],
      }
    }
  }
}
