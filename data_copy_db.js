const mariadb = require('mysql');
const fs = require('fs');

let config = JSON.parse(fs.readFileSync("data_copy.json"));


module.exports = function() {
    let sConn = mariadb.createConnection(config.database.source);
    let tConn = mariadb.createConnection(config.database.target);

    return {
        "config": config,

        "sourceConn": function() {
            sConn.connect();
            return sConn;
        },
        "targetConn": function() {
            tConn.connect();
            return tConn;
        }
    }
}();