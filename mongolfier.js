"use strict";

var _ = require('underscore'),
    mysql = require('mysql'),
    nconf = require('nconf'),
    mongo = require('mongodb'),
    ObjectId = require('mongodb').ObjectId,
    fs = require('fs'),
    path = require('path'),
    ejs = require('ejs'),
    argv = require('optimist')
      .alias('c', 'config').default('c', 'config.json')
      .alias('nq', 'no-query').default('nq', false).boolean('nq')
      .alias('ni', 'no-insert').default('ni', true).boolean('ni')
      .alias('e', 'encoding').default('e', "UTF-8")
      .alias('m', 'mapping')
      .argv,
    configFile = argv.c,
    noQuery = argv.nq,
    noInsert = argv.ni,
    encoding = argv.e,
    mappingCollection = argv.m,
    shared = {}; // shared data between mappings

console.log('load config:', configFile);
console.log('no-query:', noQuery);
console.log('no-insert:', noInsert);
console.log('encoding:', encoding);
console.log('mapping-collection:', mappingCollection);

//
//
//

function prepareTemplate(templatePath, callback) {
  var templateFilePath = path.resolve(path.dirname(configFile), templatePath);

  fs.readFile(templateFilePath, encoding, function(err, templateData) {
    if (err) { throw err; }

    console.log('prepare template:', templateFilePath);

    callback(ejs.compile(templateData));
  });
}

function prepareCollection(mongoConn, collectionName, callback) {
  mongoConn.collection(collectionName, function(err, mongoCollection) {
    if (err) { throw err; }

    console.log('prepare collection:', collectionName);

    callback(mongoCollection);
  });
}

function prepareQuery(mysqlConn, queryStatement, callback) {
  var query = mysqlConn.query(queryStatement);

  console.log('prepare query:', queryStatement);

  query.on('error', function (err, index) {
    console.log('query[' + index + '] error!', err);
    throw err;
  }).on('fields', function(fields, index) {
    console.log('fields=', fields, 'index=', index);
  }).on('result', function(row, index) {
    console.log('row=', row, 'index=', index);
    callback(row);
  }).on('end', function(index) {
    console.log('query[' + index + '] end!');

    mysqlConn.end(function (err) {
      if (err) { throw err; }
      console.log('mysql connection is closed!');
    });
  });
}

function processRow(templateFunc, mongoCollection, mysqlConn, mongoConn, row) {
  //console.log("row", row);

  var templateModel = {
    _: _,
    shared: shared,
    mysql: mysqlConn,
    mongo: mongoConn,
    ObjectId: mongo.ObjectId,
    model: row
  };

  var mongoDoc = templateFunc(templateModel);

  console.log(mongoDoc);

  if (!noInsert) {
    mongoCollection.insert(mongoDoc, function (err, result) {
      if (err) { throw err; }
      console.log(result);
    });
  }
}


function processMapping(mapping, mysqlConn, mongoConn) {
  //console.log('mysqlConn:', mysqlConn);
  //console.log('mongoConn:', mongoConn);
  //console.log('mapping:', mapping);

  prepareTemplate(mapping.template, function (templateFunc) {
    if (noQuery) {
      return;
    }
    prepareCollection(mongoConn, mapping.collection, function (mongoCollection) {
      prepareQuery(mysqlConn, mapping.query, function (row) {
        processRow(templateFunc, mongoCollection, mysqlConn, mongoConn, row);
      });
    });
  });
}

function processMappings(mappingsConf, mysqlConn, mongoConn) {
  mappingsConf.forEach(function (mappingConf) {
    if (mappingCollection || mappingCollection == mappingConf.collection) {
      processMapping(mappingConf, mysqlConn, mongoConn);
    }
  });
}

//
//
//

function openMysql(callback) {
  var mysqlConf = nconf.get('mysql'),
      mysqlConn = new mysql.createConnection({
    host: mysqlConf.host,
    port: mysqlConf.port,
    user: mysqlConf.user,
    password: mysqlConf.password,
    database: mysqlConf.database,
    multipleStatements: true // node-mysql 2.0.0-alpha3 branch
  });

  console.log('mysql connection is opened!');
  callback(mysqlConn);
}

//
//
//

function openMongo(callback) {
  var mongoConf = nconf.get('mongo'),
      mongoServer = new mongo.Server(mongoConf.host, mongoConf.port, {}),
      mongoConn = new mongo.Db(mongoConf.database, mongoServer);

  mongoConn.open(function (err) {
    if (err) { throw err; }

    if (!!mongoConf.user && !!mongoConf.password) {
      mongoConn.authenticate(mongoConf.user, mongoConf.password, function(err) {
        if (err) { throw err; }
        console.log('mysql connection is opened with authentication!');
        callback(mongoConn);
      });
    } else {
      console.log('mysql connection is opened without authentication!');
      callback(mongoConn);
    }
  });
}

//
//
//

nconf.argv().env().file({file: configFile});

openMysql(function(mysqlClient) {
  openMongo(function(mongoConn) {
    var mappingsConf = nconf.get('mappings');
    processMappings(mappingsConf, mysqlClient, mongoConn);
  });
});

