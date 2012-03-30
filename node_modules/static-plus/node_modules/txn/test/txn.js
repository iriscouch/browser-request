// The txn unit tests
//
// Copyright 2011 Iris Couch
//
//    Licensed under the Apache License, Version 2.0 (the "License");
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
//
//        http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.

var COUCH = process.env.couch || 'http://localhost:5984';
var DB    = process.env.db    || 'txn_test';

if(process.env.charles)
  COUCH = 'http://localhost:15984';

var TXN = require('../api');
var TXN_lib = require('../lib/lib')

/*
if(require.isBrowser) {
  COUCH = window.location.protocol + '//' + window.location.host;
  DB    = 'txn_browser_test';
}
*/

var time_C = parseFloat("" + (process.env.timeout_coefficient || process.env.C || 1.0));
var txn = TXN.defaults({ 'couch' : COUCH
                       , 'db'    : DB
                       //, 'time_C': time_C
                       //, browser_attachments: !(process.env.skip_browser)
                       })
  , util = require('util'), I = util.inspect
  , assert = require('assert')
  , request = require('request')
  ;

//
// Some helper operators
//

function plus(X) {
  return adder;
  function adder(doc, to_txn) {
    if(!doc.val)
      return to_txn(new Error('No value'));
    doc.val += X;
    return to_txn();
  }
}

function setter(K, V) {
  return set;
  function set(doc, to_txn) {
    doc[K] = V;
    return to_txn();
  }
}

function waitfor(X) {
  return finisher;
  function finisher(doc, to_txn) {
    setTimeout(finish, X);
    function finish() {
      return to_txn();
    }
  }
}

function thrower(er) {
  return thrower;
  function thrower() {
    if(er) throw er;
  }
}

//
//
//

var state = {};
module.exports = [ // TESTS

function setup(done) {
  var url = COUCH + '/' + DB;
  request({method:'DELETE', uri:url}, function(er, resp, body) {
    if(er) throw er;
    var json = JSON.parse(body);

    var already_gone = (resp.statusCode === 404 && json.error === 'not_found');
    var deleted      = (resp.statusCode === 200 && json.ok    === true);

    if(! (already_gone || deleted))
      throw new Error('Unknown DELETE response: ' + resp.statusCode + ' ' + body);

    request({method:'PUT', uri:url}, function(er, resp, body) {
      if(er) throw er;
      var json = JSON.parse(body);

      if(resp.statusCode !== 201 || json.ok !== true)
        throw new Error('Unknown PUT response: ' + resp.statusCode + ' ' + body);

      var doc = {_id:"doc_a", val:23};
      request({method:'POST', uri:url, json:doc}, function(er, resp, body) {
        if(er) throw er;

        if(resp.statusCode !== 201 || body.ok !== true)
          throw new Error("Cannot store doc: " + resp.statusCode + ' ' + JSON.stringify(body));

        doc._rev = body.rev;
        state.doc_a = doc;
        done();
      })
    })
  })
},

// =-=-=-=-=-=-=-=-=

function required_params(done) {
  var ID = state.doc_a._id;
  var orig = state.doc_a.val;

  var noop_ran = false;
  var noop = function() { noop_ran = true; };

  assert.thrown(function() { TXN({}, noop, noop) }, "Mandatory uri");

  assert.thrown(function() { TXN({couch:COUCH}, noop, noop) }, "Mandatory uri");
  assert.thrown(function() { TXN({db   :DB   }, noop, noop) }, "Mandatory uri");
  assert.thrown(function() { TXN({id   :ID   }, noop, noop) }, "Mandatory uri");

  assert.thrown(function() { TXN({couch:COUCH, db:DB}, noop, noop) }, "Mandatory uri");
  assert.thrown(function() { TXN({couch:COUCH, id:ID}, noop, noop) }, "Mandatory uri");
  assert.thrown(function() { TXN({db:DB      , id:ID}, noop, noop) }, "Mandatory uri");

  assert.equal(false, noop_ran, "Should never have called noop");
  assert.equal(orig, state.doc_a.val, "Val should not have been updated");

  done();
},

function clashing_params(done) {
  var url = 'http://127.0.0.1:4321/db/doc';
  var noop_ran = false;
  var noop = function() { noop_ran = true; };

  var msg = /Clashing/;
  assert.thrown(msg, function() { TXN({uri:url, couch:COUCH}, noop, noop) }, "Clashing params");
  assert.thrown(msg, function() { TXN({url:url, couch:COUCH}, noop, noop) }, "Clashing params");
  assert.thrown(msg, function() { TXN({uri:url, db   :DB   }, noop, noop) }, "Clashing params");
  assert.thrown(msg, function() { TXN({url:url, id   :'foo'}, noop, noop) }, "Clashing params");

  assert.thrown(msg, function() { TXN({uri:url, couch:COUCH, db:DB, id:'doc_a'}, noop, noop) }, "Clashing params");

  assert.equal(false, noop_ran, "Noop should never run");
  done();
},

function update_with_uri(done) {
  var loc = COUCH + '/' + DB + '/doc_a';
  TXN({uri:loc}, plus(3), function(er, doc) {
    if(er) throw er;
    assert.equal(26, doc.val, "Update value in doc_a");

    TXN({url:loc}, plus(6), function(er, doc) {
      if(er) throw er;
      assert.equal(32, doc.val, "Second update value in doc_a");

      state.doc_a = doc;
      done();
    })
  })
},

function update_with_db(done) {
  TXN({couch:COUCH, db:DB, id:state.doc_a._id}, plus(-7), function(er, doc) {
    if(er) throw er;

    assert.equal(25, doc.val, "Update via couch args");
    done();
  })
},

function defaulted_update(done) {
  txn({id:'doc_a'}, plus(11), function(er, doc) {
    if(er) throw er;

    assert.equal(36, doc.val, "Defaulted parameters: couch and db");

    state.doc_a = doc;
    done();
  })
},

//{'timeout_coefficient': 5},
function operation_timeout(done) {
  var val = state.doc_a.val;
  txn({id:'doc_a', timeout:200}, waitfor(100), function(er, doc) {
    if(er) throw er;

    txn({id:'doc_a', timeout:200}, waitfor(300), function(er, doc) {
      assert.thrown(/timeout/, thrower(er), "Expect a timeout for long operation");
      done();
    })
  })
},

function create_doc(done) {
  txn({id:'no_create'}, setter('foo', 'nope'), function(er, doc) {
    assert.thrown(/not_found/, thrower(er), "Error on unknown doc ID");
    assert.equal(null, doc, "Should not have a doc to work with");

    txn({id:'create_me', create:true}, setter('foo', 'yep'), function(er, doc) {
      if(er) throw er;

      assert.equal('yep', doc.foo, "Should create doc");
      assert.equal(3, Object.keys(doc).length, "No unexpected fields in doc create");
      done();
    })
  })
},

function timestamps(done) {
  txn({id:'doc_a'}, plus(-6), function(er, doc) {
    if(er) throw er;

    assert.equal(30, doc.val, "Normal update works");
    assert.equal('undefined', typeof doc.created_at, "Normal update has no timestamps");
    assert.equal('undefined', typeof doc.updated_at, "Normal update has no timestamps");

    txn({id:'doc_a', timestamps:true}, plus(2), function(er, doc) {
      if(er) throw er;

      assert.equal(32, doc.val, "Timestamps update works");
      assert.equal('undefined', typeof doc.created_at, "Updating existing docs does not add created_at");
      assert.equal('string'   , typeof doc.updated_at, "Update with timestamps");

      state.doc_a = doc;

      txn({id:'stamps', create:true, timestamps:true}, setter('val', 10), function(er, doc) {
        if(er) throw er;

        assert.equal(10, doc.val, "Timestamps create works");
        assert.equal('string', typeof doc.created_at, "Create with created_at");
        assert.equal('string', typeof doc.updated_at, "Create with updated_at");
        assert.equal(doc.updated_at, doc.created_at, "Creation and update stamps are equal");

        done();
      })
    })
  })
},

function preloaded_doc_no_conflicts(done) {
  txn({id:'doc_b', create:true}, setter('type','first'), function(er, doc_b, txr) {
    if(er) throw er;
    assert.equal('first', doc_b.type, 'Create doc for preload');
    assert.equal(1, txr.tries  , 'Takes 1 try for doc update');
    assert.equal(1, txr.fetches, 'Takes 1 fetch for doc update');

    var ops = 0;
    function update_b(doc, to_txn) {
      ops += 1;
      doc.type = 'preloaded';
      return to_txn();
    }

    txn({doc:doc_b}, update_b, function(er, doc, txr) {
      if(er) throw er;

      assert.equal('preloaded', doc.type, 'Preloaded operation runs normally');
      assert.equal(1, ops, 'Only one op for preloaded doc without conflicts');
      assert.equal(1, txr.tries, 'One try for preloaded doc without conflicts');
      assert.equal(0, txr.fetches, 'No fetches for preloaded doc without conflicts');

      state.doc_b = doc;
      done();
    })
  })
},

function preloaded_doc_with_funny_name(done) {
  var bulk = {docs: [ {'_id':'this_doc', 'is':'nothing'}, {'_id':'this_doc/has:slashes!youknow?'} ]}

  var req = { method: 'POST'
            , uri   : COUCH+'/'+DB+'/_bulk_docs'
            , headers: {'content-type':'application/json'}
            , body:JSON.stringify(bulk)
            }

  request(req, function(er, resp, body) {
    if(er) throw er;
    request(COUCH + '/' + DB + '/this_doc%2fhas:slashes!youknow%3f', function(er, resp, body) {
      if(er) throw er;
      var doc = JSON.parse(body);

      var ops = 0;
      function update_b(doc, to_txn) {
        ops += 1;
        doc.type = 'preloaded slashy';
        return to_txn();
      }

      txn({'couch':COUCH, 'db':DB, 'doc':doc}, update_b, function(er, this_doc, txr) {
        if(er) throw er;

        assert.equal('preloaded slashy', this_doc.type, 'Create doc for preload');
        assert.equal(1, ops, 'One op for preloaded doc with funny name')
        assert.equal(1, txr.tries  , 'One try for doc update')
        assert.equal(0, txr.fetches, 'No fetches for preloaded doc with funny name')

        done()
      })
    })
  })
},

function preloaded_doc_conflicts(done) {
  var old_rev = state.doc_b._rev;
  var old_type = state.doc_b.type;

  var old_b = JSON.parse(JSON.stringify(state.doc_b));
  var new_b = {_id:'doc_b', _rev:old_rev, 'type':'manual update'};
  var url = COUCH + '/' + DB + '/doc_b';
  request({method:'PUT', uri:url, json:new_b}, function(er, resp, body) {
    if(er) throw er;

    // At this point, the new revision is committed but tell Txn to assume otherwise.
    var new_rev = body.rev;
    var new_type = 'manual update';

    var ops = 0;
    function update_b(doc, to_txn) {
      ops += 1;
      assert.ok(ops == 1 || ops == 2, "Should take 2 ops to commit a preload conflict");

      if(ops == 1) {
        assert.equal(old_rev , doc._rev, "First op should still have old revision");
        assert.equal(old_type, doc.type, "First op should still have old value");
      } else {
        assert.equal(new_rev , doc._rev, "Second op should have new revision");
        assert.equal(new_type, doc.type, "Second op should have new type");
      }

      doc.type = 'preload txn';
      return to_txn();
    }

    txn({id:'doc_b', doc:old_b}, update_b, function(er, final_b, txr) {
      if(er) throw er;

      assert.equal(2, ops        , 'Two ops for preloaded txn with conflicts');
      assert.equal(2, txr.tries  , 'Two tries for preloaded doc with conflicts');
      assert.equal(1, txr.fetches, 'One fetch for preloaded doc with conflicts');

      assert.equal('preload txn', final_b.type, 'Preloaded operation runs normally');

      state.doc_b = final_b;
      done();
    })
  })
},

function preloaded_doc_creation(done) {
  var doc = {_id: "preload_create", worked: false};

  txn({doc:doc, create:true}, setter('worked', true), function(er, doc, txr) {
    if(er) throw er;

    assert.equal(1, txr.tries, "One try to create a doc with preload");
    assert.equal(0, txr.fetches, "No fetches to create a doc with preload");
    assert.equal(true, doc.worked, "Operation runs normally for preload create");

    done();
  })
},


function concurrent_transactions(done) {
  var doc = { _id:'conc' }
    , bad_rev = '1-abc'

  request({method:'PUT', uri:COUCH+'/'+DB+'/conc', body:JSON.stringify(doc)}, function(er, res) {
    if(er) throw er;
    assert.equal(201, res.statusCode, 'Good conc creation');

    var result = JSON.parse(res.body);
    assert.notEqual(bad_rev, result.rev, "Make sure "+bad_rev+" isn't the real revision");

    // Looks like this isn't necessary just yet.
    var _txn = txn.defaults({ 'delay':8, 'request':track_request })
    _txn({id:'conc'}, setter('done', true), function(er, doc, txr) {
      if(er) throw er;

      assert.equal(true, doc.done, 'Setter should have worked')
      assert.equal(txr.tries, 5, 'The faux request wrapper forced this to require many tries')

      done()
    })

    // Return the same response for the document over and over.
    var gets = 0;
    function track_request(req, callback) {
      if(req.method != 'GET' || ! req.uri.match(/\/conc$/))
        return request.apply(this, arguments);

      gets += 1;
      if(gets > 3)
        return request.apply(this, arguments);

      // Return the same thing over and over to produce many conflicts in a row.
      return callback(null, {statusCode:200}, JSON.stringify({_id:'conc', _rev:bad_rev}));
    }
  })
},

function after_delay(done) {
  var set = setter('x', 1);
  var start, end, duration;

  var num = 0;
  function doc() {
    num += 1;
    return {"_id":"after_"+num};
  }

  start = new Date;
  txn({doc:doc(), create:true, after:null}, set, function(er) {
    if(er) throw er;

    end = new Date;
    var base_duration = end - start;

    start = new Date;
    txn({doc:doc(), create:true, after:0}, set, function(er) {
      if(er) throw er;

      end = new Date;
      duration = end - start;

      if(base_duration < 10)
        assert.ok(duration < 10, 'after=0 should run immediately')
      else
        assert.almost(0.25, base_duration, duration, 'after=0 should run immediately (about ' + base_duration + ')');

      start = new Date;
      txn({doc:doc(), create:true, after:250}, set, function(er) {
        if(er) throw er;

        end = new Date;
        duration = end - start;
        var delay_duration = duration - base_duration;
        assert.almost(250, delay_duration, "after parameter delays the transaction");

        done();
      })
    })
  })
},

function problematic_doc_ids(done) {
  var tests = [ {'_id':'doc with space'}
              , 'has space'
              , 'has!bang'
              , {'_id':'doc with ! bang'}
              , 'The "quick" (?) brown หมาจิ้งจอก jumps over the lazy dog!'
              ]
  check_id()
  function check_id() {
    var check = tests.shift()
    if(!check)
      return done()

    if(typeof check == 'string')
      var opts = {'create':true, 'id':check}
    else
      var opts = {'create':true, 'doc':check}

    var id = check._id || check
    var value = Math.random()
    txn(opts, make_doc, result)

    function make_doc(doc, to_txn) {
      assert.equal(doc._id, id, 'Incoming doc ID should be right')
      doc.key = value
      return to_txn()
    }

    function result(er, doc, txr) {
      if(er) throw er
      var id_re = encodeURIComponent(id)
      id_re = id_re.replace(/\(/g, '\\(').replace(/\)/g, '\\)')
      id_re = new RegExp('/' + id_re + '$')
      assert.equal(doc._id, id, 'Created doc ID is right')
      assert.ok(txr.uri.match(id_re), 'Transaction URL uses the right ID')

      var doc_url = COUCH + '/' + DB + '/' + encodeURIComponent(id)
      request({'url':doc_url, 'json':true}, function(er, res) {
        if(er) throw er
        assert.equal(res.statusCode, 200, 'Got the doc with problematic ID: '+JSON.stringify(id))
        assert.equal(res.body._id, id, 'Doc has the expected id: '+JSON.stringify(id))
        assert.equal(res.body.key, value, 'Doc has the planted value: '+JSON.stringify(id))
        check_id()
      })
    }
  }
},

function couch_errors(done) {
  var _txn = txn.defaults({'request':req_fail})
  _txn({'couch':COUCH, 'db':DB, 'id':'error_doc'}, setter('foo', 'bar'), result)

  function req_fail(req, callback) {
    TXN_lib.req_couch({'method':'PUT', 'uri':COUCH+'/_illegal'}, function(er, res, result) {
      assert.ok(er, 'Got a req_couch error')
      assert.equal(er.statusCode, 400, 'HTTP error status embedded in req_couch error')
      assert.equal(er.error, 'illegal_database_name', 'CouchDB error object embedded in req_couch error')

      return callback(er, res, result)
    })
  }

  function result(er, doc, txr) {
    assert.ok(er, 'Got a txn error')
    assert.equal(er.statusCode, 400, 'HTTP error status embedded in txn error')
    assert.equal(er.error, 'illegal_database_name', 'CouchDB error object embedded in txn error')

    done()
  }
},

] // TESTS
