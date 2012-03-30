// Couch-related tests
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var tap = require('tap')
  , test = tap.test
  , assert = require('assert')
  , request = require('request')

var DB = process.env.db || 'http://localhost:5984/static_plus_test'
  , RTT = null

module.exports = { 'DB': DB
                 , 'rtt' : get_rtt
                 , 'redo': redo_couch
                 , 'setup': setup_test
                 , 'add_doc': add_doc
                 , 'just_value' : just_value
                 , 'simple_tmpl': simple_tmpl
                 }


function get_rtt() {
  if(!RTT)
    throw new Error('RTT was not set. Use setup(test) or redo(callback)')
  return RTT
}


// Basically a redo but testing along the way.
function setup_test(test_func) {
  assert.equal(typeof test_func, 'function', 'Please provide tap.test function')

  test_func('Initialize CouchDB', function(t) {
    init_db(t, function(er, rtt) {
      RTT = rtt
      t.end()
    })
  })
}

function redo_couch(callback) {
  function noop() {}
  var t = { 'ok':noop, 'false':noop, 'equal':noop, 'end':noop }
  init_db(t, function(er, rtt) {
    if(rtt)
      RTT = rtt
    return callback(er)
  })
}

function init_db(t, callback) {
  var create_begin = new Date

  request.del({uri:DB, agent:false, json:true}, function(er, res) {
    t.false(er, 'Clear old test DB: ' + DB)
    t.ok(!res.body.error || res.body.error == 'not_found', 'Couch cleared old test DB: ' + DB)

    request.put({uri:DB, agent:false, json:true}, function(er, res) {
      t.false(er, 'Create new test DB: ' + DB)
      t.false(res.body.error, 'Couch created new test DB: ' + DB)
      t.equal(res.statusCode, 201, 'Couch created the database')

      request.post({uri:DB, agent:false, json:{ _id:'doc_one', value:'one'}}, on_doc)
      request.post({uri:DB, agent:false, json:{ _id:'doc_two', value:'two'}}, on_doc)
      request.post({uri:DB, agent:false, json:{ _id:'doc_three', value:'three'}}, on_doc)

      var hits = 0
      function on_doc(er) {
        hits += 1
        t.false(er, 'No problem posting doc ' + hits)

        if(hits == 3) {
          var rtt = (new Date) - create_begin
          callback(null, rtt)
        }
      }
    })
  })
}


var doc_num = 0
function add_doc(id, value, callback) {
  if(!callback) {
    callback = value
    value = id
    doc_num += 1
    id = 'doc_' + doc_num
  }

  var doc = { '_id':id, 'value':value }
    , req = { method:'POST', uri:DB, json:doc }

  request(req, function(er, res) {
    assert.ok(!er, 'No problem adding doc: ' + doc._id)
    assert.equal(res.statusCode, 201, 'Correct HTTP response creating doc: ' + doc._id)
    callback()
  })
}


function simple_tmpl(doc) { return doc._id + ' says ' + doc.value }
function just_value(doc) { return "" + doc.value }


if(require.main === module)
  setup_test(tap.test)
