var util = require('util')
  , assert = require('assert')
  , obj_diff = require('../api')
  , JS = JSON.stringify
  , JP = JSON.parse
  , JDUP = function(x) { return JSON.parse(JSON.stringify(x)) }
  ;

var known = [
  [{}, {}, {}]
, [{a:1}, {a:1}, {}]
, [{}, {foo:'bar'}, {foo: {from:undefined, to:'bar'}}]
, [{foo:'bar'}, {}, {foo: {from:'bar', to:undefined}}],
, [{a:1}, {a:"1"}, {a: {from:1, to:"1"}}]
, [{a:1}, {b:1}, {a: {from:1, to:undefined}, b: {from:undefined, to:1}}]
, [{}, {obj:{hi:true}}, {obj: {from:undefined, to:{hi:true}}}]
, [{first:{second:{value:false}}}, {first:{second:{value:true}}}, {first:{second:{value:{from:false, to:true}}}}]
]

function main() {
  var tests = 0;
  known.forEach(function(row) {
    var from = row[0]
      , to   = row[1]
      , expected = row[2];

    var diff = obj_diff.diff(from, to);
    assert.deepEqual(diff, expected, "\n" + [ JS(from)
                                            , "vs"
                                            , JS(to)
                                            , "= " + JS(diff)
                                            , "expected: " + JS(expected)
                                            ].join('\n'));
    tests += 1;
  })

  console.log('diff tests passed: ' + tests);
}

exports.main = main;
if(require.main === module)
  main();
