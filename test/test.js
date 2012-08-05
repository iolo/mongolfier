var _ = require('underscore'), ejs = require('ejs'), fs = require('fs');

var row = {
  idx: 123,
  category1: '11',
  category2: '22',
  category3: '333',
  name: 'test',
  regDate: new Date(),
  updDate: new Date(),
  depth: 3
};

var template = 'categories.json';
fs.readFile(template, "UTF-8", function(err, templateData) {
  if (err) { throw err; }
  console.log(templateData);
  var doc = ejs.render(templateData, { model: row, _: _ });
  console.log(doc);
});

