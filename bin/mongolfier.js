#!/usr/bin/env node
'use strict';

var mongolfier = require('../lib/mongolfier'),
    _ = require('underscore'),
    fs = require('fs'),
    OPTIMIST_OPTIONS = {
      'configfile': { alias: 'f', default: 'config.json' },
      'logfile': { alias: 'l' },
      'collection': { alias: 'c' },
      'emptycollection': { alias: 'E', boolean: true },
      'failonerror': { alias: 'R', boolean: true },
      'dryrun': { alias: 'D', boolean: true },
      'debug': { alias: 'X', boolean: true },
      'quiet': { alias: 'q', boolean: true },
      'verbose': { alias: 'v', boolean: true }
    },
    argv = require('optimist').options(OPTIMIST_OPTIONS).argv,
    configFile = argv.configfile;

if (argv.debug) {
  console.log('argv:', argv);
}

console.log('mongolfier');
console.log('load config file:', configFile);

fs.readFile(configFile, 'utf8', function (err, configData) {
  if (err) {
    console.log('bad or missing config file:', configFile);
    process.exit(1);
  }

  if (argv.debug) {
    console.log('configData:', configData);
  }

  var config = _.defaults(JSON.parse(configData), argv);

  if (argv.debug) {
    console.log('config:', config);
  }

  mongolfier.migrate(config);
});
