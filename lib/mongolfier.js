/*jslint node:true, nomen:true, white:true*/
'use strict';

var _ = require('underscore'),
    util = require('util'),
    mysql = require('mysql'),
    mongo = require('mongodb'),
    fs = require('fs'),
    path = require('path'),
    winston = require('winston'),
    DEF_CONFIG = {
      logfile: '',
      collection: '',
      emptycollection: false,
      failonerror: true,
      dryrun: false,
      profile: false,
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
      context: {},
      collections: {}
    },
    config, workDir,
    logDebug, logInfo, logWarn, logError;

//
//
//

function processError(err) {
  if (err) {
    //console.trace();
    if (!config.quiet) {
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

function prepareTemplate(templateFilePath) {
  logInfo('prepare template:', templateFilePath);

  try {
    // TODO: more elegant template!! ejs?
    //return ejs.compile(...);

    /*jslint evil:true stupid:true */
    return new Function('$', fs.readFileSync(templateFilePath, 'utf8'));
  } catch (e) {
    processError(e);
    return null;
  }
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

function processRow(templateFunc, mongoCollection, mysqlConn, mongoConn, row, callback) {
  var templateModel, mongoDoc;

  logInfo('process row:', row);

  // this could be accessed via '$' argument in template
  templateModel = _.extend(row, config.context, {
    _: _,
    ObjectID: mongo.ObjectID,
    MYSQL: mysqlConn,
    MONGO: mongoConn
  });

  // turn mysql row into mongo document!
  try {
    // TODO: more elegant template!!
    //mongoDoc = eval(templateFunc(templateModel));
    mongoDoc = templateFunc(templateModel);
  } catch(e) {
    processError(e);
  }

  logInfo('into mongo document:', mongoDoc);

  if (config.dryrun) {
    logInfo('skip to insert mongo document.');
    callback();
  } else {
    mongoCollection.insert(mongoDoc, function (err, result) {
      processError(err);
      logDebug('mongo insert result:', result);
      callback();
    });
  }
}

function processCollection(collectionConf, mysqlConn, mongoConn, callback) {
  prepareCollection(mongoConn, collectionConf.collection, function (mongoCollection) {
    var rowCount = 0,
        collectionName = collectionConf.collection,
        query = collectionConf.query,
        params = collectionConf.params || [];

    if (config.profile) {
      winston.profile(collectionName);
    }

    logInfo('process collection:' + collectionName);
    logDebug('context:', config.context);

    // TODO: multiple queries?
    // multiple lines of a query
    if (_.isArray(query)) {
      query = query.join(' ');
    }

    logDebug('query:', query);
    logDebug('params:', params);

    mysqlConn.query(query, params).on('error', function (err, index) {
      logDebug('mysql query on error:', err);
      processError(err);
    }).on('fields', function(fields, index) {
      logDebug('mysql query on fields:', fields);
    }).on('result', function(row, index) {
      logDebug('mysql query on result:', row);

      //mysqlConn.pause();

      processRow(collectionConf.templateFunc, mongoCollection, mysqlConn, mongoConn, row, function () {
        rowCount += 1;
        logDebug('------------------------------#', rowCount);
      });

      //mysqlConn.resume();
    }).on('end', function(index) {
      logDebug('mysql query on end!');

      //mysqlConn.destroy();
      if (config.profile) {
        winston.profile(collectionName);
      }
      logInfo(rowCount + 'rows are processed for collection ' + collectionName);

      // TODO: wait for async result
      callback();
    });
  });
}

function processCollections(collectionsConf, mysqlConn, mongoConn, callback) {
  logInfo('process ' + collectionsConf.length + ' collections...');
  logDebug('collections:', collectionsConf);

  _.each(collectionsConf, function (collectionConf, index) {
    processCollection(collectionConf, mysqlConn, mongoConn, function () {
      // all collections are processed
      if (index === collectionsConf.length - 1) {
        callback();
      }
    });
  });
}

//
//
//

function prepareMysqlConn(mysqlConf, callback) {
  var mysqlOpts, mysqlConn;

  mysqlOpts = {
    host: mysqlConf.host,
    port: mysqlConf.port,
    user: mysqlConf.user,
    password: mysqlConf.password,
    database: mysqlConf.database
    //multipleStatements: true // node-mysql 2.0.0-alpha3 branch
  };

  mysqlConn = new mysql.createConnection(mysqlOpts);

  logInfo('mysql connection is opened!');
  callback(mysqlConn);
}

//
//
//

function prepareMongoConn(mongoConf, callback) {
  var mongoServer, mongoConn;
  
  mongoServer= new mongo.Server(mongoConf.host, mongoConf.port, mongoConf.options||{});
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
    winston.add(winston.transports.File, { filename: config.logfile });
    winston.remove(winston.transports.Console);
  } else {
    winston.cli();
  }

  logDebug = (!config.quiet && config.debug) ? winston.debug : function () {};
  logInfo = (!config.quiet || config.verbose) ? winston.info : function () {};
  logWarn = (!config.quiet) ? winston.warn : function () {};
  logError = winston.error;

  if (config.debug) {
    logDebug('config:', config);
  }

  logInfo('prepare templates...');
  _.each(config.collections, function (conf) {
    var templateFilePath = path.resolve(workDir, conf.template || (conf.collection + '.json'));
    path.exists(templateFilePath, function(exists) {
      if (exists) {
        conf.templateFunc = prepareTemplate(templateFilePath);
      }
      /*
      if (!!conf.templateFunc) {
        logInfo('use default template for ' + conf.collection);
        conf.templateFunc = function ($) { return $.ROW; }
      }
      */
    });
  });

  logInfo('prepare mysql connection...');

  prepareMysqlConn(config.mysql, function(mysqlConn) {
    logDebug('mysqlConn:', mysqlConn);

    logInfo('prepare mongo connection...');

    prepareMongoConn(config.mongo, function(mongoConn) {
      var collectionsConf;

      if (config.collection) {
        collectionsConf = _.filter(config.collections, function(collectionConf, index) {
          var collectionName = collectionConf.collection;
          return (_.isString(config.collection) && config.collection === collectionName)
            || (_.isArray(config.collection) && config.collection.indexOf(collectionName) >= 0);
        });
      } else {
        collectionsConf = config.collections;
      }

      // let's go!
      processCollections(collectionsConf, mysqlConn, mongoConn, function () {
        logInfo('that\'s all folks!');

        //@@mysqlConn.destroy();
        process.exit(0);
      });
    });
  });
}

module.exports = {
  migrate: migrate
};
