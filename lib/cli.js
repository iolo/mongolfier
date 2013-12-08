'use strict';

var
  path = require('path'),
  _ = require('lodash'),
  program = require('commander'),
  mongolfier = require('./mongolfier');

function main(args) {

  program
    .version(require('../package.json').version)
    .usage('[OPTIONS] [COLLECTION_NAME ...]')
    .option('-c, --config [FILE]', 'path to config file(js or json)')
    .option('-s, --mysql [URL]', 'mysql connection url')
    .option('-o, --mongo [URL]', 'mongodb connection url')
    .option('-e, --empty-collection', 'make empty collection before migration')
    .option('-b, --bulk-copy', 'do bulk copy if no template available')
    .option('-d, --dry-run', 'do not insert into collection')
    .parse(args);

  var config = program.config ? require(path.resolve(process.cwd(), program.config)) : {};
  config = _.merge(config, {
    mysql: program.mysql,
    mongo: program.mongo,
    emptyCollection: program.emptyCollection,
    bulkCopy: program.bulkCopy,
    dryRun: program.dryRun,
    collectionNames: program.args
  });

  return mongolfier(config)
    .then(function (result) {
      console.log('mongolfier migrate ok', result);
      process.exit(0);
    })
    .fail(function (err) {
      console.log('mongolfier migrate error:', err);
      process.exit(1);
    })
    .done();
}

module.exports = main;

