// The Once object
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
  {
  }, function(module, exports, DEFS, require) {

var events = require('events')
  , EventEmitter = events.EventEmitter2 || events.EventEmitter


exports.Once = Once;
function Once () {
  var self = this;

  self.task    = null;
  self.is_done = false;
  self.pending = null;
  self.result  = undefined;
  self.listener_count = 0;
}

Once.prototype.on_done = function(callback) {
  var self = this;

  if(self.is_done)
    return callback.apply(null, self.result);

  self.pending = self.pending || new EventEmitter;

  self.listener_count += 1;
  self.pending.setMaxListeners(10 + self.listener_count);

  self.pending.on('done', callback);
}

Once.prototype.job = function(task) {
  var self = this;

  // Only the first .job() call does anything.
  if(self.task)
    return;

  self.task = task;
  self.pending = self.pending || new EventEmitter;

  task(on_done);
  function on_done() {
    self.is_done = true;
    self.result = Array.prototype.slice.call(arguments);
    self.pending.emit.apply(self.pending, ['done'].concat(self.result));
  }
}

}) // defaultable
