"use strict";

var _ = require('underscore'),
    mysql = require('mysql'),
    nconf = require('nconf'),
    mongo = require('mongodb'),
    fs = require('fs'),
    ejs = require('ejs'),
    argv = require('optimist').argv
    dryrun = nconf.get('dryrun');

//
//
//

nconf.argv().env().file({file: (argv.config||'config.json')});

exit(1)
//
//
//

function processMapping(mapping, mysqlClient, mongoDb) {
  //console.log('mysql:', mysqlClient);
  //console.log('mongo:', mongoDb);
  //console.log('mapping:', mapping);

  mysqlClient.query(mapping.select, function (err, rows, columns) {
    if (err) { throw err; }

    //console.log("rows", rows);
    //console.log("columns", columns);

    rows.forEach(function (row) {
      //console.log('row=',row);

      mongoDb.collection(mapping.collection, function(err, mongoCollection) {
        if (err) { throw err; }

        fs.readFile(mapping.template, "utf-8", function(err, templateData) {
          if (err) { throw err; }

          //console.log("template", template);

          var templateFunc = ejs.compile(templateData)
          var doc = templateFunc({
            mysql: mysqlClient,
            mongo: mongoDb,
            model: row,
            _: _,
          });
        });
        console.log(doc);
        if (!dryrun) {
          //mongoCollection.insert(doc);
        }
      });
    });
    mysqlClient.end();
  });
}

function processMappings(mappings, mysqlClient, mongoDb) {
  mappings.forEach(function (mapping) {
    processMapping(mapping, mysqlClient, mongoDb);
  });
}

//
//
//

function prepareMysql(callback) {
  var mysqlConf = nconf.get('mysql'),
      mysqlClient = new mysql.createClient({
    host: mysqlConf.host,
    port: mysqlConf.port,
    user: mysqlConf.user,
    password: mysqlConf.password,
    database: mysqlConf.database
  });

  console.log('mysql prepared!');
  callback(mysqlClient);
}

//
//
//

function prepareMongo(callback) {
  var mongoConf = nconf.get('mongo'),
      mongoServer = new mongo.Server(mongoConf.host, mongoConf.port, {}),
      mongoDb = new mongo.Db(mongoConf.database, mongoServer);

  mongoDb.open(function (err) {
    if (err) { throw err; }

    if (!!mongoConf.user && !!mongoConf.password) {
      mongoDb.authenticate(mongoConf.user, mongoConf.password, function(err) {
        if (err) { throw err; }
        callback(mongoDb);
      });
    } else {
      callback(mongoDb);
    }
  });
}

//
//
//

prepareMysql(function(mysqlClient) {
  prepareMongo(function(mongoDb) {
    var mappingsConf = nconf.get('mappings');
    processMappings(mappingsConf, mysqlClient, mongoDb);
  });
});

