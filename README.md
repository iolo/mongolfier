mongolfier
==========

A Simple MySQL to MongoDB Migration Tool

![Montgolfier Balloon](http://goo.gl/hV1pM)

NOTE: not "montgolfier" but "mongolfier". ;)

install and run
---------------

### local install and run
<pre>
npm install mongolfier
node ./node_modules/.bin/mongolfier -h
</pre>

### global install and run
<pre>
npm install -g mongolfier
mongolfier -h
</pre>

usage
-----

<pre>
$ mongolfier -h
A Simple MySQL to MongoDB Migration Tool
Usage: node ./bin/mongolfier.js [options]

Options:
--configfile, -f       path to config file                     [default: "config.json"]
--logfile, -l          path to log file                      
--collection, -c       collection name to migrate            
--emptycollection, -E  make empty collection before migration  [boolean]
--bulkcopy, -B         do bulk copy if no template available   [boolean]
--failonerror, -R      stop at first failure                   [boolean]
--dryrun, -D           do not insert into collection           [boolean]
--debug, -X            show debug information                  [boolean]
--quiet, -q            be extra quiet                          [boolean]
--verbose, -v          be extra verbose                        [boolean]
--help, -h             show this message                     
</pre>

configuration
-------------

### config file(json)

* NOTE: no comment allowed here. this file should conforms to *strict* json format.
* NOTE: <code>{{</code> and <code>}}</code> is just a marker. replace it with yours.

<pre><code>
{
  "mysql": {
    "host": "{{mysql_host}}",
    "port": {{mysql_port}},
    "user": "{{mysql_user}}",
    "password": "{{mysql_password}}",
    "database": "{{mysql_database}}",
    ...
  },
  "mongo": {
    "host": "{{mongo_host}}",
    "port": {{mongo_port}},
    "user": "{{mongo_user}}",
    "password": "{{mongo_password}}",
    "database": "{{mongo_database}}",
    ...
  },
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
    {
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
</code></pre>

* <code>context</code> is optional. this could be accessed via <code>$</code> variable across processing all collections.
* <code>before</code> is optional. these scripts are *eval*ulated before processing the first collection.
* <code>after</code> is optional. these scripts are *eval*ulated after processing the last collection.
* <code>template</code> is optional(default: <code>{{collection name}}.json</code>).
* <code>query</code> is string or array. array will be *join*ed to a query.

### mapping template/script

> NOTE: comment allowed here. this file is javascript or something. ;)
 
> NOTE: <code>{{</code> and <code>}}</code> is just a marker. replace it with yours.

#### simple mapping template

<pre><code>
({
  // use mongodb ObjectID
  "_id": new mongo.ObjectID(),
  // use mysql column values
  "{{mongo_field_name}}": ${{mysql_column_name}},
  ...
})
</code></pre>

#### complex mapping template

<pre><code>
var id = new mono.ObjectID();
...
({
  "_id": id,
  "foo": ($bar).toUpperCase(),
  "sum": $num1 + $num2,
  "now": new Date(),
  ...
})
</code></pre>

* NOTE on the enclosing braces the result. do not use <code>return</code> keyword.

#### async mapping template

<pre><code>
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
</code></pre>

* NOTE on the last line <code>d.promise;</code>. do not use <code>return</code> keyword.

#### predefined objects

* <code>$ROW</code> - the current mysql row as object.
* <code>$MYSQL</code> - the active [mysql connection](https://github.com/felixge/node-mysql/).
* <code>$MONGO</code> - the active [mongo connection](http://mongodb.github.com/node-mongodb-native/api-generated/db.html).
* <code>$CONTEXT</code> - a shared object across all mappings.
* <code>console</code> - [console object](http://nodejs.org/api/stdio.html)
* <code>util</code> - [util module](http://nodejs.org/api/util.html)
* <code>fs</code> - [fs module](http://nodejs.org/api/fs.html)
* <code>path</code> - [path module](http://nodejs.org/api/path.html)
* <code>async</code> - [async module](https://github.com/caolan/async/)
* <code>q</code> - [q module](https://github.com/kriskowal/q/)
* <code>mongo</code> - [mongo module](http://mongodb.github.com/node-mongodb-native/)
* <code>mysql</code> - [mysql module](https://github.com/felixge/node-mysql/) (NOTE: 2.x branch!)
* <code>_</code> - [underscore.js module](http://underscorejs.org).
* and so on...

TBD... ;)

----

That's all folks.

May the SOURCE be with you...

