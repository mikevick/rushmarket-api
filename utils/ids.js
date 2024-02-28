'use strict';

function adjustIDs(docs) {
    var ds = [];
    for (var i = 0; i < docs.length; i++) {
        d = docs[i].toObject();  

        d.id = d._id;
        delete d._id;

        ds.push(d);
    }

    return ds;
}


module.exports = {
    adjustIDs
}