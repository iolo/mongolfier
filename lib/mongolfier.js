'use strict';

var _ = require('underscore'),
    mysql = require('mysql'),
    mongo = require('mongodb'),
    fs = require('fs'),
    path = require('path'),
    winston = require('winston'),
    DEF_CONFIG = {
      logfile: '',
      collection: '',
      emptycollection: false,
      dryrun: false,
      failonerror: true,
      debug: false,
      quiet: false,
      verbose: false,
      mysql: {
        host: 'localhost',
        port: 3306,
        options: {}
      },
      mongo: {
        host: 'localhost',
        port: 27017,
        options: {}
      },
      context: { },
      collections: { }
    },
    config,
    workDir;

//
//
//

function logDebug() {
  if(!config.quiet && config.debug) {
    winston.debug.apply(winston, arguments);
  }
}

function logInfo() {
  if (!config.quiet && config.verbose) {
    winston.info.apply(winston, arguments);
  }
}

function logWarn() {
  if (!config.quiet) {
    winston.warn.apply(winston, arguments);
  }
}

function logError() {
  winston.error.apply(winston, arguments);
}

function processError(err) {
  if (err) {
    if (!config.quiet) {
      console.trace();
      winston.error(err);
    }
    if (config.failonerror) {
      process.exit(2);
    }
  }
}

//
//
//

function prepareTemplate(templateFilePath, callback) {
  logInfo('prepare template:', templateFilePath);

  fs.readFile(templateFilePath, 'utf8', function(err, templateData) {
    processError(err);

    // TODO: more elegant template!! ejs?
    //var templateFunc = ejs.compile(templateData);
    var templateFunc = new Function('$', templateData);
    callback(templateFunc);
  });
}

function prepareCollection(mongoConn, collectionName, callback) {
  logInfo('prepare collection:', collectionName);

  mongoConn.collection(collectionName, function(err, mongoCollection) {
    processError(err);

    if (config.emptycollection) {
      logInfo('empty collection:', collectionName);

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
  logInfo('prepare query:', queryStatement);

  mysqlConn.query(queryStatement).on('error', function (err, index) {
    logDebug('mysql query on error: index=', index, err);
    processError(err);
  }).on('fields', function(fields, index) {
    logDebug('mysql query on fields: fields=', fields, 'index=', index);
  }).on('result', function(row, index) {
    logDebug('mysql query on result: row=', row, 'index=', index);

    //@@mysqlConn.pause();
    callback(row);
  }).on('end', function(index) {
    logDebug('mysql query on end: index=', index);
    //mysqlConn.destroy();
  });
}

function processRow(templateFunc, mongoCollection, mysqlConn, mongoConn, row) {
  logDebug('process row:', row);

  var templateModel = _.extend({
    _: _,
    ObjectID: mongo.ObjectID,
    SHARED: config.context,
    MYSQL: mysqlConn,
    MONGO: mongoConn,
    ROW: row
  }, row);

  // TODO: more elegant template!!
  //var mongoDoc = eval(templateFunc(templateModel));
  var mongoDoc = templateFunc(templateModel);

  logDebug('mongo document:', mongoDoc);

  if (config.dryrun) {
    logInfo('skip to insert mongo document...');
    //@@mysqlConn.resume();
  } else {
    mongoCollection.insert(mongoDoc, function (err, result) {
      processError(err);
      logDebug('mongo insert result:', result);
      //@@mysqlConn.resume();
    });
  }
}

function processCollections(collectionsConf, mysqlConn, mongoConn) {
  logInfo('process collections...');
  logDebug(collectionsConf);

  _.each(collectionsConf, function (collectionConf, collectionName) {
    prepareCollection(mongoConn, collectionName, function (mongoCollection) {
      logInfo('process collection:', collectionName);
      logDebug('shared context:', config.context);

      // TODO: multiple queries?
      var queryStatement = collectionConf.query;
      prepareQuery(mysqlConn, queryStatement, function (row) {
        processRow(collectionConf.templateFunc, mongoCollection, mysqlConn, mongoConn, row);
        logInfo('----------');
      });
    });
  });
}

//
//
//

function prepareMysqlConn(mysqlConf, callback) {
  var mysqlOpts = {//_.defaults(mysqlConf.options||{}, {
        host: mysqlConf.host,
        port: mysqlConf.port,
        user: mysqlConf.user,
        password: mysqlConf.password,
        database: mysqlConf.database
        //multipleStatements: true // node-mysql 2.0.0-alpha3 branch
      },//),
      mysqlConn = new mysql.createConnection(mysqlOpts);

  logInfo('mysql connection is opened!');
  callback(mysqlConn);
}

//
//
//

function prepareMongoConn(mongoConf, callback) {
  var mongoServer = new mongo.Server(mongoConf.host, mongoConf.port, mongoConf.options||{}),
      mongoConn = new mongo.Db(mongoConf.database, mongoServer);

  mongoConn.open(function (err) {
    processError(err);

    if (!!mongoConf.user && !!mongoConf.password) {
      mongoConn.authenticate(mongoConf.user, mongoConf.password, function(err) {
        processError(err);

        logInfo('mongo connection is opened with authentication!');
        callback(mongoConn);
      });
    } else {
      logInfo('mongo connection is opened without authentication!');
      callback(mongoConn);
    }
  });
}

//
//
//

function migrate(customConfig) {
  config = _.defaults(customConfig, DEF_CONFIG);
  workDir = path.dirname(config.configfile);

  if (config.logfile) {
    var logFilePath = path.resolve(workDir, config.logfile);
    winston.add(winston.transports.File, { filename: logFilePath });
    winston.remove(winston.transports.Console);
  } else {
    winston.cli();
  }

  logInfo('prepare templates...');
  _.each(config.collections, function (collectionConf, key) {
    var templateFilePath = path.resolve(workDir, collectionConf.template || (collectionName + '.json'));
    prepareTemplate(templateFilePath, function(templateFunc) {
      collectionConf.templateFunc = templateFunc;
    });
  });

  logInfo('prepare mysql connection...');

  prepareMysqlConn(config.mysql, function(mysqlConn) {
    logDebug('mysqlConn:', mysqlConn);

    logInfo('prepare mongo connection...');

    prepareMongoConn(config.mongo, function(mongoConn) {
      var collectionsConf;

      if (config.collection) {
        collectionsConf = _.filter(config.collections, function(conf, name) {
          return (_.isString(config.collection) && config.collection === name)
            || (_.isArray(config.collection) && config.collection.indexOf(name) >= 0);
        });
      } else {
        collectionsConf = config.collections;
      }

      processCollections(collectionsConf, mysqlConn, mongoConn);

      logInfo('that\'s all folks!');
      //process.exit(0);
    });

    //@@mysqlConn.destroy();
  });
}

module.exports = {
  migrate: migrate
};
