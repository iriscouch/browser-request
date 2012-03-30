#!/usr/bin/env node

// The Static Plus command-line tool
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

var fs = require('fs')
  , util = require('util')

var sp = require('./api').defaults({ 'autostart': true })
  , lib = require('./lib').defaults({ 'args': ['couch db']
                                    , 'describe': { 'template': 'Path to template file'
                                                  }
                                    })

if(require.main === module)
  main.apply(null, lib.argv._);

function main(url) {
  var site = new sp.Builder;

  site.template = lib.argv.template || json_page
  site.target = 'site';
}

function json_page(doc) {
  return [ '<!DOCTYPE html>'
         , '<html>'
         , '<head><title>' + doc._id + '</title></head>'
         , '<body>'
         , '<pre><code>' + util.inspect(doc, false, 50) + '</code></pre>'
         , '</body>'
         , '</html>'
         ].join('')
}
