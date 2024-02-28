'use strict';

const Telemetries = require('../models/telemetries');


var pruneTelemetries = (req) => {
  return new Promise((resolve, reject) => {
    try {
      var resp = {
        statusCode: 200,
        pruned: 0
      };

      Telemetries.prune(15)
        .then((result) => {
          if (r.ok === 1)
            resp.pruned = r.n;
          resolve(resp);
        }).catch((e) => {
          reject(e);
          exceptions.handleExceptions(e, resp, ["pruned"], resolve, reject, req);
        });

    } catch (e) {
      exceptions.handleExceptions(e, resp, ["pruned"], resolve, reject, req);
    }
  });
}


module.exports = { pruneTelemetries };