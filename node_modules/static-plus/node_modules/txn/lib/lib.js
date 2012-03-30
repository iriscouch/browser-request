// Miscellaneous library code
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

var assert = require('assert')
  , log4js = require('log4js')
  , request_mod = require('request')
  ;


require('defaultable')(module,
  { 'request': request_mod
  }, function(module, exports, DEFS, require) {


module.exports = { "JP"       : JP
                 , "JS"       : JS
                 , "JDUP"     : JDUP
                 //, "join"     : join_and_fix_slashes
                 , "enc_id"   : encode_doc_id
                 , "req_json" : req_json
                 , "req_couch": req_couch
                 };


var REQUEST_TIMEOUT_MS     = 60000;


function JP() { return JSON.parse.apply(this, arguments) }
function JS() { return JSON.stringify.apply(this, arguments) }
function JDUP(obj) { return JSON.parse(JSON.stringify(obj)) }

function encode_doc_id(id) {
  return encodeURIComponent(id).replace(/^_design%2[fF]/, '_design/');
}

function req_couch(opts, callback) {
  assert.ok(callback);

  if(process.env.couch_proxy)
    opts.proxy = process.env.couch_proxy;

  return req_json(opts, function(er, resp, result) {
    if((resp.statusCode < 200 || resp.statusCode > 299) && result.error)
      // HTTP worked, but Couch returned an error.
      er = er || new Error('CouchDB error: ' + JS(result))

    if(er) {
      er.statusCode = resp && resp.statusCode
      Object.keys(result).forEach(function(key) {
        er[key] = result[key]
      })
    }

    return callback(er, resp, result)
  })
}


function req_json(opts, callback) {
  assert.ok(callback);

  opts = JDUP(opts);
  opts.followRedirect = false;
  opts.headers = opts.headers || {};
  opts.headers['accept'] = opts.headers['accept'] || 'application/json';

  if(opts.method && opts.method !== 'GET')
    opts.headers['content-type'] = 'application/json';

  var LOG = opts.log || log4js.getLogger('txn');
  LOG.setLevel(process.env.txn_log_level || 'info');

  if(opts.json)
    opts.body = JS(opts.json);
  delete opts.json;

  var in_flight = null;
  var timed_out = false;
  var timer = setTimeout(on_timeout, REQUEST_TIMEOUT_MS);
  function on_timeout() {
    timed_out = true;
    var msg = 'Timeout: ' + JS(opts);
    LOG.warn(msg);

    if(in_flight && in_flight.end)
      in_flight.end();

    if(in_flight && in_flight.response && in_flight.response.destroy)
      in_flight.response.destroy();

    return callback(new Error(msg));
  }

  var method = opts.method || 'GET';
  LOG.debug(method + ' ' + opts.uri);
  in_flight = DEFS.request(opts, function(er, resp, body) {
    clearTimeout(timer);
    if(timed_out) {
      LOG.debug('Ignoring timed-out response: ' + opts.uri);
      return;
    }

    if(!er) {
      try         { body = JSON.parse(body) }
      catch(j_er) { // Query worked but JSON was invalid (e.g. not a couch URL).
                    var err = new Error("Response was not JSON (or not valid)");
                    return callback(err, resp, body) }
    }

    return callback(er, resp, body);
  })

  return in_flight;
}

}) // defaultable
