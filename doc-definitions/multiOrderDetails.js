const { defaultFontSize, getSingleOrderPdfDocDefinition } = require("./singleOrderDetails");

exports.getMultiOrderPdfDocDefinition = async (orders) => {
  const singleOrderDocDefinitions = await Promise.all(orders.map(order => getSingleOrderPdfDocDefinition(order)));

  async function cleanUp() {
    return Promise.allSettled(singleOrderDocDefinitions.map(({ cleanUp }) => cleanUp()))
      .then(results => {
        const errors = results.filter(result => result.status === 'rejected').map(result => result.reason.message)
        if (errors.length) {
          throw new Error(errors.join('\n'))
        }
      });
  }

  return {
    cleanUp,
    info: {
      title: 'Orders'
    },
    content: [
      {
        layout: {
          hLineColor: () => '#cccccc',
          vLineColor: () => '#cccccc',
        },
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto'],
          body: orders.reduce((body, order) => [
            ...body,
            ...order.lineItems.map(item => [
              item.sku,
              ['STS', 'DS'].includes(item.manifestSource)
                ? 'Drop Ship'
                :`${item.productStoreName || ''} ${item.locationNumber}${item.palletNumber ? `\n(pallet: ${item.palletNumber})` : ''}`,
              order.order.sourceOrderName
            ])
          ], [[
            { text: 'RUSH SKU', style: 'multiHeader' },
            { text: 'LOCATION', style: 'multiHeader' },
            { text: 'ORDER', style: 'multiHeader' }
          ]])
        }
      },
      ...singleOrderDocDefinitions.flatMap(orderDocDefinition => {
        const firstContent = orderDocDefinition.content[0];
        const otherContent = orderDocDefinition.content.slice(1);
        return [
          { ...firstContent, pageBreak: 'before' },
          ...otherContent
        ];
      })
    ],
    defaultStyle: {
      font: 'Helvetica',
      fontSize: defaultFontSize,
    },
    styles: singleOrderDocDefinitions.reduce((styles, docDefinition) => ({
      ...styles,
      ...docDefinition.styles
    }),
      // STYLES FOR MULTI-ORDER PDF GO HERE
      {
        multiHeader: {
          bold: true,
          fillColor: '#eeeeee',
        },
      }
    )
  };
}
