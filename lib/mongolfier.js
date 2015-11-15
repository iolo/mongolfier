'use strict';

var _ = require('lodash'),
  Q = require('q'),
  fs = require('fs'),
  path = require('path'),
  util = require('util'),
  vm = require('vm'),
  mysql = require('mysql'),
  mongo = require('mongodb'),
  DEF_CONFIG = {
    //includes: [],
    //mysql: 'mysql://root@localhost:3306/test',
    //mongo: 'mongodb://localhost:27017/test',
    emptyCollection: false,
    bulkCopy: false,
    dryRun: false,
    collectionNames: [],
    // config only
    collections: {},
    before: [],
    after: [],
    context: {}
  },
  debug = require('debug')('mongolfier:main'),
  DEBUG = debug.enabled;

//
//
//

function loadScript(filePath) {
  DEBUG && debug('load script:', filePath);

  try {
    /*jslint stupid:true*/
    if (fs.existsSync(filePath)) {
      var data = fs.readFileSync(filePath, 'utf8');
      /*jslint stupid:false*/
      return Q.resolve(vm.createScript(data, filePath));
    }
    return Q.reject('script not found:' + filePath);
  } catch (e) {
    DEBUG && debug('failed to load script:' + filePath, e);
    return Q.reject(e);
  }
}

function processHook(hook, context) {
  return loadScript(hook)
    .then(function (script) {
      return script.runInNewContext(context);
    });
}

function processHooks(hooks, context) {
  if (_.isEmpty(hooks)) {
    DEBUG && debug('no hooks...');
    return Q.resolve(true);
  }

  return Q.all(hooks.map(function (hook) {
    return processHook(hook, context);
  }));
}

//
// mysql helpers
//

function openMysqlConn(url) {
  DEBUG && debug('open mysql connection...', url);
  return Q.resolve(mysql.createConnection(url));
}

function executeMysqlQuery(conn, query, params) {
  DEBUG && debug('execute mysql query...', query, params);
  return Q.ninvoke(conn, 'query', params);
}

//
// mongo helpers
//

function openMongoConn(url) {
  DEBUG && debug('open mongo connection...', url);
  return Q.nfcall(mongo.MongoClient.connect, url, {w: 0});
}

function openMongoCollection(conn, name, empty) {
  DEBUG && debug('open mongo collection:', name);
//  var d = Q.defer();
//  conn.collection(name, function (err, collection) {
//    if (err) {
//      DEBUG && debug('open mongo collection err:', err);
//      return d.reject(err);
//    }
//    if (empty) {
//      DEBUG && debug('empty mongo collection:', name);
//      collection.remove({}, function (err, result) {
//        if (err) {
//          DEBUG && debug('empty mongo collection err:', err);
//          return d.reject(err);
//        }
//        return d.resolve(collection);
//      });
//    } else {
//      return d.resolve(collection);
//    }
//  });
//  return d.promise;
  return Q.ninvoke(conn, 'collection', name)
    .then(function (collection) {
      if (empty) {
        return Q.ninvoke(collection, 'remove', {})
          .thenResolve(collection);
      }
      return collection;
    });
}

function insertMongoDocument(collection, doc, dryRun) {
  DEBUG && debug('----->into mongo document:', doc);
  if (dryRun) {
    DEBUG && debug('dryRun');
    return Q.resolve(true);
  }
  var d = Q.defer();
  collection.insert(doc, function (err, result) {
    if (err) {
      DEBUG && debug('insert mongo document err:', err);
      return d.reject(err);
    }
    return d.resolve(result);
  });
  return d.promise;
//  return Q.ninvoke(collection, 'insert', doc);
}

function loadTemplate(collectionConf, bulkCopy) {
  var templateFilePath = collectionConf.template || (collectionConf.collection + '.json');
  DEBUG && debug('load template...', templateFilePath);
  return loadScript(templateFilePath)
    .fail(function (err) {
      DEBUG && debug('load template err', err);
      if (bulkCopy) {
        DEBUG && debug('no template! do bulkcopy for collection:', collectionConf.collection);
        return null;
      }
      DEBUG && debug('no template! skip collection:', collectionConf.collection);
      throw err;
    });
}

//
//
//

function processCollection(mysqlConn, mongoConn, config, collectionConf, context) {
  var
    collectionName = collectionConf.collection,
    query = collectionConf.query || ('SELECT * FROM ' + collectionName),
    params = collectionConf.params || [];

  DEBUG && debug('process collection:' + collectionName);
  //DEBUG && debug('collection context keys:', _.keys(scriptSandbox));

  return Q.all([
      openMongoCollection(mongoConn, collectionName, config.emptyCollection && !config.dryRun),
      loadTemplate(collectionConf, config.bulkCopy)
    ])
    .spread(function (collection, template) {
      DEBUG && debug('open collection ok');
      DEBUG && debug('load template ok');

      // TODO: multiple queries?
      // multiple lines of a query
      if (_.isArray(query)) {
        query = query.join(' ');
      }

      DEBUG && debug('mysql query:', query);
      DEBUG && debug('mysql query params:', params);

      var d = Q.defer();
      var result = Q.resolve(0);

      // fetch row by row as stream
      mysqlConn.query(query, params)
        .on('end', function () {
          DEBUG && debug('mysql query on end!');
          return d.resolve(result);
        })
        .on('error', function (err) {
          DEBUG && debug('mysql query on error:', err);
          return d.reject(err);
        })
        .on('fields', function (fields) {
          DEBUG && debug('mysql query on fields:', fields);
        })
        .on('result', function (row) {
          DEBUG && debug('mysql query on result:', row);

          mysqlConn.pause();

          result = result
            .then(function (rowCount) {
              DEBUG && debug('------>rowCount=', ++rowCount);
              DEBUG && debug('process mysql row:', row);

              if (!template) {
                return row;
              }

              // with template script
              // turn mysql row into mongo document!
              var context = _.clone(context);

              // inject row data into context
              _.each(row, function (columnValue, columnName) {
                context['$' + columnName] = columnValue;
              });
              context.$ROW = row;
              context.$COLLECTION = collection;

              // with template script
              // turn mysql row into mongo document!
              return Q.resolve(template.runInNewContext(context));
            })
            .then(function (doc) {
              return insertMongoDocument(collection, doc, config.dryRun);
            })
            .fin(function () {
              mysqlConn.resume();
            });
        });
      return d.promise;
    });
}

function processCollections(mysqlConn, mongoConn, config, context) {
  return Q.all(
    getCollectionConfigs(config)
      .map(function (collectionConf) {
        return processCollection(mysqlConn, mongoConn, config, collectionConf, context);
      }));
}

//
//
//

function getCollectionConfigs(config) {
  if (_.isEmpty(config.collectionNames)) {
    config.collectionNames = Object.keys(config.collections);
  }
  return config.collectionNames
    .map(function (collectionName) {
      return _.merge({collection: collectionName}, config.collections[collectionName]);
    });
}

function migrate(config) {
  config = _.merge({}, DEF_CONFIG, config);

  DEBUG && debug('migrate...', config);


  return Q.all([
      openMysqlConn(config.mysql),
      openMongoConn(config.mongo)
    ])
    .spread(function (mysqlConn, mongoConn) {
      DEBUG && debug('connect ok');

      var context = {
        require: require,
        util: util,
        fs: fs,
        path: path,
        Q: Q,
        _: _,
        mysql: mysql,
        mongo: mongo,
        $MYSQL: mysqlConn,
        $MONGO: mongoConn,
        console: console,
        $CONTEXT: config.context
      };

      DEBUG && debug('process before hooks...');
      return processHooks(config.before, context)
        .then(function () {
          DEBUG && debug('process collections...');
          return processCollections(mysqlConn, mongoConn, config, context);
        })
        .then(function () {
          DEBUG && debug('process after hooks...');
          return processHooks(config.after, context);
        });
    });
}

module.exports = migrate;
