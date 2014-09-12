DEPRECATION NOTICE
==================

This project is abandoned.

mongolfier
==========

A Simple MySQL to MongoDB Migration Tool

![Montgolfier Balloon](http://goo.gl/hV1pM)

NOTE: not "montgolfier" but "mongolfier". ;)

install and run
---------------

### local install and run

```
$ npm install mongolfier
$ node ./node_modules/.bin/mongolfier --help
```

### global install and run

```
$ npm install -g mongolfier
$ mongolfier --help
```

### simple migration with bulk-copy

To copy all rows from `users` table on `test` mysql database
into `users` collection on `test` mongo db.

```
$ mongolfier -s mysql://root@localhost/test -o mongodb://localhost/test -b users
```

**NOTE** use `-d` flag to test WITHOUT real `insert` operations:

```
$ mongolfier -s mysql://root@localhost/test -o mongodb://localhost/test -b -d users
```

**NOTE** use `-e` flag to remove all existing documents in the collection:

```
$ mongolfier -s mysql://root@localhost/test -o mongodb://localhost/test -b -e users
```

### complex migration with template(EXPERIMENTAL)

For complex migration,
you need to write a config file and template files and use `-c` option:

```
$ mongolfier -c config.json
```

usage
-----

```
$ mongolfier -help
  Usage: mongolfier [OPTIONS] [COLLECTION_NAME ...]

  Options:

    -h, --help              output usage information
    -V, --version           output the version number
    -c, --config [FILE]     path to config file(js or json)
    -s, --mysql [URL]       mysql connection url
    -o, --mongo [URL]       mongodb connection url
    -e, --empty-collection  make empty collection before migration
    -b, --bulk-copy         do bulk copy if no template available
    -d, --dry-run           do not insert into collection
```

configuration
-------------

### config file(json)

* NOTE: no comment allowed here. this file should conforms to *strict* json format.
* NOTE: `{{` and `}}` is just a marker. replace it with yours.

```javascript
{
  "mysql": "mysql://user:password@host:port/database",
  "mongo": "mongodb://user:password@host:port/db",
  "context": {
    "{{custom_attr_key}}": "{{custom_attr_value}}",
    ...
  },
  "before": [
    "{{before_script.js}}",
    ...
  ],
  "after": [
    "{{after_script.js}}",
    ...
  ]
  "collections": [
    "collection{
      "collection": "{{mongo_collection_name}}",
      "template": "{{path_to_collection_template}}",
      "query": "{{mysql_select_query}}"
    },
    {
      "collection": "{{mongo_collection_name}}",
      "template": "{{path_to_collection_template}}",
      "query": [
        "{{mysql_select_query_part1}}",
        "{{mysql_select_query_part2}}",
        ...
      ]
    },
    ...
  ]
}
```

* `context` is optional. this could be accessed via `$` variable across processing all collections.
* `before` is optional. these scripts are *eval*ulated before processing the first collection.
* `after` is optional. these scripts are *eval*ulated after processing the last collection.
* `template` is optional(default: `{{collection name}}.json`).
* `query` is string or array. array will be *join*ed to a query.

### mapping template/script

> NOTE: comment allowed here. this file is javascript or something. ;)
 
> NOTE: `{{` and `}}` is just a marker. replace it with yours.

#### simple mapping template

```javascript
({
  // use mongodb ObjectID
  "_id": new mongo.ObjectID(),
  // use mysql column values
  "{{mongo_field_name}}": ${{mysql_column_name}},
  ...
})
```

#### complex mapping template

```javascript
var id = new mongo.ObjectID();
...
({
  "_id": id,
  "foo": ($bar).toUpperCase(),
  "sum": $num1 + $num2,
  "now": new Date(),
  ...
})
```

* NOTE on the enclosing braces the result. do not use `return` keyword.

#### async mapping template(EXPERIMENTAL)

```javascript
var d = q.defer();
var id = new mongo.ObjectID();
setTimeout(function () {
  ...
  d.resolve({
    "_id": id,
    "foo": ($bar).toUpperCase(),
    "sum": $num1 + $num2,
    "now": new Date(),
    ...
  })
}, 100);
d.promise;
```

* NOTE on the last line `d.promise;`. do not use `return` keyword.

#### predefined objects

* `$ROW` - the current mysql row as object.
* `$COLLECTION` - the current mongo collection as object.
* `$MYSQL` - the active [mysql connection](https://github.com/felixge/node-mysql/).
* `$MONGO` - the active [mongo connection](http://mongodb.github.com/node-mongodb-native/api-generated/db.html).
* `$CONTEXT` - a shared object across all mappings.
* `mongo` - [mongo module](http://mongodb.github.com/node-mongodb-native/)
* `mysql` - [mysql module](https://github.com/felixge/node-mysql/)
* `console` - [console object](http://nodejs.org/api/stdio.html)
* `util` - [util module](http://nodejs.org/api/util.html)
* `fs` - [fs module](http://nodejs.org/api/fs.html)
* `path` - [path module](http://nodejs.org/api/path.html)
* `Q` - [q module](https://github.com/kriskowal/q/)
* `_` - [lodash module](http://lodash.com).
* and so on...

TBD... ;)

----

That's all folks.

May the SOURCE be with you...

