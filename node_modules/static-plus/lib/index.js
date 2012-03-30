// Miscellaneous library
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

require('defaultable')(module,
  { 'credentials': null
  , 'args'       : []
  , 'demand'     : []
  , 'describe'   : {}
  }, function(module, exports, DEFS, require) {


var URL = require('url')
  , util = require('util')
  , assert = require('assert')
  , request = require('request')
  , winston = require('winston')
  , optimist = require('optimist')

var OPTS = optimist.describe('creds', 'user:pass string for basic HTTP auth')
                   .usage('Usage: $0 ' + DEFS.args.map(function(X) { return '<'+X+'>' }).join(' '))
                   .describe(DEFS.describe)
                   .demand(DEFS.demand)

if(OPTS.argv._.length < DEFS.args.length) {
  OPTS.showHelp();
  process.exit(1);
}


function getLogger(name) {
  var opts =
    { levels: { 'all'  : Number.MIN_VALUE
              , 'trace': 5000
              , 'debug': 10000
              , 'info' : 20000
              , 'warn' : 30000
              , 'error': 40000
              , 'fatal': 50000
              , 'off'  : Number.MAX_VALUE
              }
    , colors: { 'all'  : 'white'
              , 'trace': winston.config.npm.colors.silly
              , 'debug': winston.config.npm.colors.verbose
              , 'info' : winston.config.npm.colors.info
              , 'warn' : winston.config.npm.colors.warn
              , 'error': winston.config.npm.colors.error
              , 'fatal': winston.config.npm.colors.error
              , 'off'  : 'white'
              }
    , transports:
      [ new (winston.transports.Console)({ level: 'info'
                                         , colorize: true
                                         })
      ]
    }

  return new (winston.Logger)(opts)
}


function inspect(obj) {
  return util.inspect(obj, false, 10)
}


function couch_url(target) {
  var result = {}
    , url    = URL.parse(target)

  assert.ok(url.protocol, 'Bad CouchDB URL protocol: ' + target)
  assert.ok(url.host, 'Bad CouchDB URL host: ' + target)
  result.couch = URL.format({'protocol':url.protocol, 'host':url.host, 'auth':url.auth})

  var parts   = url.pathname.split(/\/+/)
    , db_name = parts[1]
  assert.ok(db_name && db_name.length > 0, 'Bad database name in CouchDB URL: ' + target)
  result.db = db_name

  if(parts.length <= 2)
    return result // Couch and db only, no doc ID

  var id = parts.slice(2).join('/')
  assert.ok(!id.match(/\//) || id.match(/^_design\/[^\/]+$/), 'Bad CouchDB document ID: ' + target)
  result.id = id

  return result
}


module.exports = { 'I'         : inspect
                 , 'argv'      : OPTS.argv
                 , 'request'   : request
                 , 'getLogger' : getLogger
                 , 'couch_url' : couch_url
                 }

}) // defaultable
