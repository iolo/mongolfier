"use strict";

var _ = require('underscore'),
    mysql = require('mysql'),
    mongo = require('mongodb'),
    fs = require('fs'),
    path = require('path'),
    ejs = require('ejs'),
    optimist = require('optimist'),
    nconf = require('nconf');

//
//
//

var argv = optimist.options({
  'config-file': {
    short: 'c',
    default: 'config.json'
  },
  'halt-on-error': {
    short: 'x',
    boolean: true,
    default: true
  },
  'template-encoding': {
    short: 'e',
    default: 'UTF-8',
  },
  'empty-collection': {
    short: 'p',
    boolean: true,
    default: false
  },
  'mapping-collection': {
    short: 'm',
    default: '',
  }
}).argv;

//console.log(argv);

var configFile = argv['config-file'],
    workDir = path.dirname(configFile);

console.log('load config from:', configFile);

nconf.env().argv().file(configFile).defaults({
  //'halt-on-error': true,
  //'no-query': true,
  //'no-insert': true,
  //'template-encoding': 'UTF-8',
  //'mapping-collection': ''
});

var haltOnError = argv['halt-on-error'],
    noQuery = (argv['no-query'] === 'true'),
    noInsert = (argv['no-insert'] === 'true'),
    templateEncoding = argv['template-encoding'],
    emptyCollection = (argv['empty-collection'] === 'true'),
    mappingCollection = argv['mapping-collection'];

console.log('halt-on-error:', haltOnError, typeof haltOnError);
console.log('no-query:', noQuery, typeof noQuery);
console.log('no-insert:', noInsert, typeof noInsert);
console.log('template-encoding:', templateEncoding, typeof templateEncoding);
console.log('empty-collection:', emptyCollection, typeof emptyCollection);
console.log('mapping-collection:', mappingCollection, typeof mappingCollection);

// shared data between mappings
var shared = {};

//
//
//

function processError(err) {
  if (err) {
    if (haltOnError) { throw err; }

    console.log('ERROR! ', err);
  }
}

function prepareTemplate(templatePath, callback) {
  var templateFilePath = path.resolve(workDir, templatePath);

  console.log('prepare template:', templateFilePath);

  fs.readFile(templateFilePath, templateEncoding, function(err, templateData) {
    processError(err);

    callback(new Function('$', templateData));
    //callback(ejs.compile(templateData));
  });
}

function prepareCollection(mongoConn, collectionName, callback) {
  mongoConn.collection(collectionName, function(err, mongoCollection) {
    processError(err);

    console.log('prepare collection:', collectionName);

    if (emptyCollection) {
      console.log('empty collection:', collectionName);

      mongoCollection.remove({}, function (err, removed) {
        processError(err);

        callback(mongoCollection);
      });
    } else {
      callback(mongoCollection);
    }
  });
}

function prepareQuery(mysqlConn, queryStatement, callback) {
  var query = mysqlConn.query(queryStatement);

  console.log('prepare query:', queryStatement);

  query.on('error', function (err, index) {
    console.log('query[' + index + '] error!', err);
    processError(err);
  }).on('fields', function(fields, index) {
    //console.log('fields=', fields, 'index=', index);
  }).on('result', function(row, index) {
    //console.log('row=', row, 'index=', index);

    callback(row);
  }).on('end', function(index) {
    console.log('query[' + index + '] end!');

    /*mysqlConn.end(function (err) {
      processError(err);

      console.log('mysql connection is closed!');
    });*/
  });
}

function processRow(templateFunc, mongoCollection, mysqlConn, mongoConn, row) {
  //console.log("row", row);

  var templateModel = _.extend({
    ObjectID: mongo.ObjectID,
    SHARED: shared,
    MYSQL: mysqlConn,
    MONGO: mongoConn,
    ROW: row,
    _: _
  }, row);

  var mongoDoc = templateFunc(templateModel);

  console.log('mongo document=>', mongoDoc);

  if (noInsert) {
    console.log('skip to insert mongo document...');
  } else {
    mongoCollection.insert(mongoDoc, function (err, result) {
      processError(err);
      //console.log('insert result=>', result);
    });
  }
}


function processMapping(mappingConf, mysqlConn, mongoConn) {
  //console.log('mappingConf:', mappingConf);

  var collectionName = mappingConf.collection;

  if (mappingCollection && mappingCollection !== collectionName)  {
    console.log('skip mapping for collection:' + collectionName);
    return;
  }

  //prepareTemplate(mappingConf.template, function (templateFunc) {
    if (noQuery) {
      console.log('skip query for collection:' + collectionName, typeof noQuery);
      return;
    }
    var queryStatement = mappingConf.query;
    prepareCollection(mongoConn, collectionName, function (mongoCollection) {
      prepareQuery(mysqlConn, queryStatement, function (row) {
        processRow(mappingConf.templateFunc, mongoCollection, mysqlConn, mongoConn, row);
      });
    });
  //});
}

function processMappings(mappingsConf, mysqlConn, mongoConn) {
  mappingsConf.forEach(function (mappingConf) {
    if (!_.isObject(mappingConf)) {
      console.log('ERROR! invalid mapping config!');
      return;
    }
    processMapping(mappingConf, mysqlConn, mongoConn);
  });
}

//
//
//

function openMysql(callback) {
  if (noQuery) {
    console.log('skip to connect mysql!');
    callback(null);
    return
  }

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
  /*
  if (noInsert) {
    console.log('skip to connect mongodb!');
    callback(null);
    return
  }
  */

  var mongoConf = nconf.get('mongo'),
      mongoServer = new mongo.Server(mongoConf.host, mongoConf.port, {}),
      mongoConn = new mongo.Db(mongoConf.database, mongoServer);

  mongoConn.open(function (err) {
    if (err) { console.trace(); processError(err); }

    if (!!mongoConf.user && !!mongoConf.password) {
      mongoConn.authenticate(mongoConf.user, mongoConf.password, function(err) {
        processError(err);

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

var mappingsConf = nconf.get('mappings');
if (!_.isArray(mappingsConf)) {
  console.log('ERROR! invalid mappings config!');
  return;
}

// precompile all templates
mappingsConf.forEach(function (mappingConf) {
  prepareTemplate(mappingConf.template, function(templateFunc) {
    mappingConf.templateFunc = templateFunc;
  });
});

openMysql(function(mysqlConn) {
  //console.log('mysqlConn:', mysqlConn);
  openMongo(function(mongoConn) {
    //console.log('mongoConn:', mongoConn);
    processMappings(mappingsConf, mysqlConn, mongoConn);
  });
});
