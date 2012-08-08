var vows = require('vows'),
    assert = require('assert');

vows.describe('hello').addBatch({
    'world': {
        topic: 'foo',
        'bar': function (topic) { assert.equal(topic, 'foo'); }
    }
}).export(module);
