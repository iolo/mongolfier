#!/usr/bin/env node
/*jslint node:true, nomen:true, white:true*/
'use strict';

var mongolfier = require('../lib/mongolfier'),
    _ = require('underscore'),
    fs = require('fs'),
    optimist = require('optimist'),
    USAGE = 'A Simple MySQL to MongoDB Migration Tool\nUsage: $0 [options]',
    OPTIONS = {
      'configfile': { alias: 'f', default: 'config.json', description: 'path to config file(json)' },
      'logfile': { alias: 'l', description: 'path to log file(winston json)' },
      'collection': { alias: 'c', description: 'collection name to migrate' },
      'emptycollection': { alias: 'E', boolean: true, description: 'make empty collection before migration' },
      'bulkcopy': { alias: 'B', boolean: true, description: 'do bulk copy if no template available' },
      'failonerror': { alias: 'R', boolean: true, description: 'stop at first failure' },
      'dryrun': { alias: 'D', boolean: true, description: 'do not insert into collection' },
      'profile': { alias: 'P', boolean: true, description: 'show profile infmation' },
      'debug': { alias: 'X', boolean: true, description: 'show debug information' },
      'quiet': { alias: 'q', boolean: true, description: 'be extra quiet' },
      'verbose': { alias: 'v', boolean: true, description: 'be extra verbose' },
      'help': { alias: 'h', description: 'show this message' }
    },
    argv = optimist.usage(USAGE,OPTIONS).argv;

if (argv.help) {
  console.log(optimist.help());
  process.exit(0);
}

/*jslint stupid:true*/
var configText = fs.readFileSync(argv.configfile, 'utf8');
/*jslint stupid:false*/
var configJson = JSON.parse(configText);
var config = _.defaults(configJson, argv);
mongolfier.migrate(config);
