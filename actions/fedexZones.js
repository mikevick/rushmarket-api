const _ = require('lodash');
const fs = require('fs');

const pdf = require('pdf-parse');


const FedexZones = require('../models/fedexZones');
const ZipToCity = require('../models/zipToCity');


var processPDF = async (path, originZip, resp) => {
  let dataBuffer = fs.readFileSync(path);

  let data = await pdf(dataBuffer);

  let ranges = findRanges(originZip, data);

  if (ranges.length) {
    await FedexZones.deleteByOriginZip(originZip);
    for (let i=0; i < ranges.length; i++) {
      await FedexZones.addRange(originZip, ranges[i].rangeStart, ranges[i].rangeEnd, ranges[i].zone);

      for (let j=ranges[i].rangeStart; j <= ranges[i].rangeEnd; j++) {
        let zip = await ZipToCity.lookupCity(j)
        if (zip.length) {
          await FedexZones.addZoneMapping(originZip, j, ranges[i].zone);
        }
      }
    }
  }

  resp.rangeCount = ranges.length;
}


var findRanges = (originZip, data) => {
  let ranges = [];

  let count = 0;
  let s = _.split(data.text, '\n');
  for (let i = 0; i < s.length; i++) {
    if ((s[i].trim().length === 12) || (s[i].trim().length === 13)) {
      // console.log(`Range: ${s[i].substring(0,11)} ${s[i].substring(11)}`)
      ranges.push({
        originZip: originZip,
        rangeStart: s[i].substring(0,5),
        rangeEnd: s[i].substring(6,11),
        zone: (s[i].substring(11) === 'NA') ? -1 : parseInt(s[i].substring(11))
      })
      count++;
    }
  }

  return ranges;
}



module.exports = {
  processPDF
}