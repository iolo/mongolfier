/*jslint node:true, nomen:true, white:true*/
'use strict';

var _ = require('underscore'),
    fs = require('fs'),
    path = require('path'),
    util = require('util'),
    vm = require('vm'),
    mysql = require('mysql'),
    mongo = require('mongodb'),
    async = require('async'),
    q = require('q'),
    DEF_CONFIG = {
      logfile: '',
      collection: '',
      emptycollection: false,
      bulkcopy: false,
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
      before: [],
      after: [],
      context: {},
      collections: {}
    },
    config, workDir,
    scriptSandbox,
    mysqlConn, mongoConn,
    logDebug, logInfo, logWarn, logError;

//
//
//

function processError(err) {
  if (err) {
    if (config.debug) {
      console.trace('ERROR');
    }
    console.error(err);
    if (config.failonerror) {
      process.exit(2);
    }
  }
}

//
//
//

function loadScript(filePath) {
  logInfo('load script:', filePath);

  try {
    /*jslint stupid:true*/
    var data = fs.readFileSync(filePath, 'utf8');
    /*jslint stupid:false*/
    return vm.createScript(data, filePath);
  } catch (e) {
    logError('failed to load script:', filePath);
    return null;
  }
}

function loadTemplateScripts(collectionsConf) {
  _.each(collectionsConf, function (conf) {
    var templateFilePath = path.resolve(workDir, conf.template || (conf.collection + '.json'));

    /*jslint stupid:true*/
    if (fs.existsSync(templateFilePath)) {
      conf.templateScript = loadScript(templateFilePath);
    }
    /*jslint stupid:false*/

    if (!conf.templateScript) {
      if(config.bulkcopy) {
        logWarn('no template but bulkcopy enabled. do bulkcopy for collection:', conf.collection);
      } else {
        logWarn('no template and no bulkcopy enabled. no migration for collection:', conf.collection);
      }
    }
  });
}

function processHook(hook) {
  var d = q.defer(),
      hookScript;

  try {
    hookScript = loadScript(path.resolve(workDir, hook));

    q.when(hookScript.runInNewContext(scriptSandbox))
    .then(d.resolve)
    .fail(d.reject);
  } catch (e) {
    logError('failed to execute hook:', hook);
    d.reject(e);
  }
  return d.promise;
}

function processHooks(hooks) {
  var d = q.defer();

  _.each(hooks, function(hook, index) {

    if (config.profile) {
      console.time('PROFILE::HOOK::' + hook);
    }

    q.when(processHook(hook))
    .then(function (result) {
      if (config.profile) {
        console.timeEnd('PROFILE::HOOK::' + hook);
      }

      logInfo('complete hook:', hook);

      if (index === hooks.length - 1) {
        logInfo('all ' + hooks.length + ' hooks processed!');
        d.resolve();
      }
    })
    .fail(function (err) {
      logWarn('failed to process hook:', hook);

      d.reject(err);
    });
  });
  return d.promise;
}

//
// mysql helpers
//

function openMysqlConn(mysqlConf) {
  var d = q.defer(),
      mysqlOpts,
      mysqlConn;

  mysqlOpts = _.defaults({
    host: mysqlConf.host,
    port: mysqlConf.port,
    user: mysqlConf.user,
    password: mysqlConf.password,
    database: mysqlConf.database
    //multipleStatements: true // node-mysql 2.0.0-alpha3 branch
  }, mysqlConf.options);

  mysqlConn = new mysql.createConnection(mysqlOpts);
  if (mysqlConn) {
    logInfo('mysql connection is opened!');
    d.resolve(mysqlConn);
  }

  return d.promise;
}

function executeMysqlQuery(query, params) {
  var d = q.defer();

  mysqlConn.query(query, params, function(err, rows) {
    if (err) { logError('query error'); d.reject(err); return; }

    d.resolve(rows);
  });

  return d.promise;
}


//
// mongo helpers
//

function openMongoConn(mongoConf) {
  var d = q.defer(),
      mongoServer,
      mongoConn;
  
  mongoServer= new mongo.Server(mongoConf.host, mongoConf.port, mongoConf.options||{});
  mongoConn = new mongo.Db(mongoConf.database, mongoServer);

  mongoConn.open(function (err) {
    if (err) { logError('failed to open collection'); d.reject(err); return; }

    if (!!mongoConf.user && !!mongoConf.password) {
      mongoConn.authenticate(mongoConf.user, mongoConf.password, function(err) {
        if (err) { logError(err); d.reject(err); return; }

        logInfo('mongo connection is opened with authentication!');
        d.resolve(mongoConn);
      });
    } else {
      logInfo('mongo connection is opened without authentication!');
      d.resolve(mongoConn);
    }
  });

  return d.promise;
}

function openMongoCollection(collectionName) {
  var d = q.defer();
  logInfo('prepare collection:', collectionName);

  mongoConn.collection(collectionName, function(err, mongoCollection) {
    if (err) { logError('failed to open collection'); d.reject(err); return; }

    if (config.emptycollection) {
      logInfo('empty collection:', collectionName);

      mongoCollection.remove({}, function (err, removed) {
        if (err) { logError('failed to empty collection'); d.reject(err); return; }

        d.resolve(mongoCollection);
      });
    } else {
      d.resolve(mongoCollection);
    }
  });
  return d.promise;
}

function insertMongoDoc(mongoDoc, mongoCollection) {
  var d = q.defer();

  logInfo('----->into mongo document:', mongoDoc);

  if (config.dryrun) {
    logInfo('***dryrun***');
    d.resolve(false);
  } else {
    mongoCollection.insert(mongoDoc, function (err, result) {
      if (err) { logError('failed to insert mongo document'); d.reject(err); return; }

      logDebug('mongo insert result:', result);
      d.resolve(true);
    });
  }

  return d.promise;
}

//
//
//

function processRow(templateScript, mongoCollection, row) {
  var d = q.defer(),
      sandbox;

  logInfo('process mysql row:', row);

  try {
    if (templateScript) {
      logDebug('***template***');

      sandbox = _.clone(scriptSandbox);
      // inject row data into sandbox
      _.each(row, function(columnValue, columnName) {
        sandbox['$' + columnName] = columnValue;
      });
      sandbox.$ROW = row;
      sandbox.$COLLECTION = mongoCollection;

      // with template script
      // turn mysql row into mongo document!
      q.when(templateScript.runInNewContext(sandbox))
      .then(function (mongoDoc) {
        insertMongoDoc(mongoDoc, mongoCollection)
        .then(d.resolve)
        .fail(d.reject);
      })
      .fail(d.reject);
    } else if (config.bulkcopy) {
      logDebug('***bulkcopy***');

      insertMongoDoc(row, mongoCollection)
      .then(d.resolve)
      .fail(d.reject);
    } else {
      logWarn('----->no mongo document to insert');
      d.resolve(false);
    }
  } catch (e) {
    logError('failed to process row', e);
    d.reject(e);
  }

  return d.promise;
}

function processCollection(collectionConf, mongoCollection) {
  var d = q.defer(),
      collectionName = collectionConf.collection,
      query = collectionConf.query,
      params = collectionConf.params || [],
      queue, rowCount;

  logInfo('process collection:' + collectionName);
  //logDebug('collection context keys:', _.keys(scriptSandbox));

  // TODO: multiple queries?
  // multiple lines of a query
  if (_.isArray(query)) {
    query = query.join(' ');
  }

  logDebug('mysql query:', query);
  logDebug('mysql query params:', params);

  if (config.profile) {
    console.time('PROFILE::COLLECTION:' + collectionName);
  }

  /*
  // fetch all rows at once
  executeMysqlQuery(query, params)
  .then(function (rows) {
    _.each(rows, function(row, index) {
      processRow(collectionConf.templateScript, mongoCollection, row).then(function () {
        logInfo('------------------------------#', index);
        if (index == rows.length - 1) {
          if (config.profile) {
            console.timeEnd('COLLECTION:' + collectionName);
          }
          d.resolve(rows.length);
        }
      }).fail(function (err) {
        logError('process row error', err);
        d.reject(err);
      });
    });
  }).fail(function (err) {
    d.reject(err);
  });
  */

  queue = async.queue(function(row, callback) {
    processRow(collectionConf.templateScript, mongoCollection, row).then(callback);
  }, 1);

  queue.drain = function() {
    if (config.profile) {
      console.timeEnd('PROFILE::COLLECTION:' + collectionName);
    }
    d.resolve(rowCount);
  };

  // fetch row by row as stream
  mysqlConn.query(query, params).on('error', function (err) {
    logError('mysql query on error:', err);
    d.reject(err);
  }).on('fields', function(fields) {
    //logDebug('mysql query on fields:', fields);
  }).on('result', function(row) {
    //logDebug('mysql query on result:', row);

    console.log('queue.length=', queue.length());
    queue.push(row, function (err) {
      if (err) { logError('failed to process row'); d.reject(err); return; }

      rowCount += 1;
      logInfo('------------------------------#', rowCount);
    });
  }).on('end', function() {
    logDebug('mysql query on end!');
  });

  return d.promise;
}

function processCollections(collectionsConf) {
  var d = q.defer();

  logInfo('process ' + collectionsConf.length + ' collections...');
  logDebug('collections:', collectionsConf);

  _.each(collectionsConf, function (collectionConf, index) {
    q.when(openMongoCollection(collectionConf.collection))
    .then(function (mongoCollection) {
      return processCollection(collectionConf, mongoCollection);
    })
    .then(function (rowCount) {
      logInfo(rowCount + ' rows are processed for collection:', collectionConf.collection);

      // all collections are processed
      if (index === collectionsConf.length - 1) {
        logInfo(collectionsConf.length + ' collections are processed...');
        d.resolve();
      }
    }).fail(d.reject);
  });

  return d.promise;
}

//
//
//

function migrate(customConfig) {
  config = _.defaults(customConfig, DEF_CONFIG);
  workDir = path.dirname(config.configfile);

  /*
  winston = require('winston');
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
  */

  if (config.logfile) {
    var logstream = fs.createWriteStream(config.logfile, { flags: 'a+', encoding: 'utf8' });
    process.stdout.write = function(data, encoding, fd) {
      logstream.write(data.replace('\n', '\nOUT>'), encoding, fd);
    };
    process.stderr.write = function(data, encoding, fd) {
      logstream.write(data.replace('\n', '\nERR>'), encoding, fd);
    };
    process.on('exit', function() {
      logstream.end();
    });
  }

  logDebug = (!config.quiet && config.debug) ? console.log : function () {};
  logInfo = (!config.quiet || config.verbose) ? console.info : function () {};
  logWarn = (!config.quiet) ? console.warn : function () {};
  logError = console.error;

  logDebug('merged config:', config);

  // inject utilities into sandbox
  scriptSandbox = {
    require: require,
    util: util,
    fs: fs,
    path: path,
    async: async,
    q: q,
    _: _,
    mysql: mysql,
    mongo: mongo,
    console: console,
    $CONTEXT: config.context,
  };

  //logDebug('scriptSandbox', scriptSandbox);

  q.fcall(function () {
    logInfo('load templates...');
    loadTemplateScripts(config.collections);

    logInfo('open mysql connection...');
    return openMysqlConn(config.mysql);
  })
  .then(function(newMysqlConn) {
    //logDebug('mysqlConn:', newMysqlConn);
    mysqlConn = newMysqlConn;

    // inject mysql connection into sandbox
    scriptSandbox.$MYSQL = mysqlConn;

    logInfo('open mongo connection...');
    return openMongoConn(config.mongo);
  })
  .then(function(newMongoConn) {
    //logDebug('mongoConn:', newMongoConn);
    mongoConn = newMongoConn;

    // inject mongo connection into sandbox
    scriptSandbox.$MONGO = mongoConn;

    logInfo('process before hooks...');
    if (_.isEmpty(config.before)) {
      logInfo('no before hooks...');
      return q.resolve();
    }

    return processHooks(config.before);
  })
  .then(function () {
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

    logInfo('process collections...');
    if (_.isEmpty(collectionsConf)) {
      logInfo('no collections to process!');
      return q.resolve();
    }

    // let's go!
    return processCollections(collectionsConf);
  })
  .then(function () {
    logInfo('process after hooks...');
    if (_.isEmpty(config.after)) {
      logInfo('no after hooks...');
      return q.resolve();
    }

    return processHooks(config.after);
  })
  .then(function () {
    logInfo('that\'s all folks!');

    process.exit(0);
  })
  .fail(function (err) {
    logError('failed to mirate!', err);

    process.exit(1);
  });
}

module.exports = {
  migrate: migrate
};
