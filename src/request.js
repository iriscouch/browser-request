// Browser Request
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

var XHR = require('./xmlhttprequest')

if(!XHR || typeof XHR !== 'function')
  throw new Error('Could not find ./xmlhttprequest')
if(XHR.name !== 'cXMLHttpRequest')
  throw new Error('This is not portable XMLHttpRequest')

module.exports = request

function request() {
  throw new Error('Not implemented')
}
