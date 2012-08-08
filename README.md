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

<pre>
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
</pre>

* <code>context</code> is optional. this could be accessed via <code>$</code> variable across processing all collections.
* <code>before</code> is optional. these scripts are *eval*ulated before processing the first collection.
* <code>after</code> is optional. these scripts are *eval*ulated after processing the last collection.
* <code>template</code> is optional(default: <code>{{collection name}}.json</code>).
* <code>query</code> is string or array. array will be *join*ed to a query.

### collection template(json)

> NOTE: comment allowed here. this file is javascript or something. ;)
 
> NOTE: <code>{{</code> and <code>}}</code> is just a marker. replace it with yours.

<pre>
{
  // use mongodb ObjectID
  "_id": new $.ObjectID(),
  // use mysql column values
  "{{mongo_field_name}}": $.{{mysql_column_name}}, // use dot notation
  "{{mongo_field_name}}": $["{{mysql_column_name}}"], // use association array notation
  // use custom attrbutes in context(see config file)
  "{{mongo_field_name}}": $.{{custom_attr_key}}, // use dot notation
  "{{mongo_field_name}}": $["{{custom_attr_key}}"], // use association array notation
  ...
}
</pre>

* <code>$</code> is shared across processing all collections.
* use <code>$.MYSQL</code> for [mysql connection](https://github.com/felixge/node-mysql/).
* use <code>$.MONGO</code> for [mongo connection](http://mongodb.github.com/node-mongodb-native/api-generated/db.html).
* use <code>_</code> for [underscore.js library](http://underscorejs.org).
* use <code>$.ObjectID</code> for [mongo ObjectID class](http://mongodb.github.com/node-mongodb-native/api-bson-generated/objectid.html).
* use <code>$.ROW</code> for the current mysql row as object.

### advanced collection template with js.

> NOTE: comment allowed here. this file is javascript or something. ;)

> NOTE: <code>{{</code> and <code>}}</code> is just a marker. replace it with yours.

<pre><code>
var id = new $.ObjectID();
...
return {
  "_id": id,
  "foo": ($.bar).toUpperCase(),
  "sum": $.num1 + $.num2,
  "now": new Date(),
  ...
}
</code></pre>

* <code>$</code> is a shared object across collection processing.
* return <code>null</code> or *nothing* to skip to mysql row.

TBD... ;)

----

That's all folks.

May the SOURCE be with you...

