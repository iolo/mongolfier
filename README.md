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

NOTE: no comment allowed here. this file should conforms to strict json format.

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

### collection template(json)

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

### advanced collection template with js.

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

TBD... ;)

----

That's all folks.

May the SOURCE be with you...

