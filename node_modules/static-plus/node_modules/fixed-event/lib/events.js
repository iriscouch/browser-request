// The Once EventEmitter
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
  { 'events': null
  }, function(module, exports, DEFS, require) {

var util = require('util')
  , Once = require('./once').Once
  , assert = require('assert')
  , events = require('events')
  , EventEmitter = events.EventEmitter2 || events.EventEmitter


exports.EventEmitter = FixedEventEmitter

util.inherits(FixedEventEmitter, EventEmitter)
function FixedEventEmitter () {
  var self = this

  self._fixed_events = {}

  if(typeof DEFS.events === 'string')
    self.fix(DEFS.events)
  else if(Array.isArray(DEFS.events))
    DEFS.events.forEach(function(event) {
      self.fix(event)
    })
  else if(DEFS.events && typeof DEFS.events === 'object')
    Object.keys(DEFS.events).forEach(function(event) {
      self.fixed(event, DEFS.events[event])
    })
}


FixedEventEmitter.prototype.addListener =
FixedEventEmitter.prototype.on = function(event, listener) {
  var self = this

  var once = self._fixed_events[event]
  if(!once)
    return EventEmitter.prototype.on.apply(self, arguments)

  once.on_done(function() { listener.apply(this, arguments) })
}


FixedEventEmitter.prototype.fixed = function(event) {
  var self = this

  self.fix(event)
  self.emit.apply(self, arguments)
}


FixedEventEmitter.prototype.fix = function(event) {
  var self = this

  self._fixed_events[event] = self._fixed_events[event] || new Once

  var old_listeners = self.listeners(event)
  self.removeAllListeners(event)
  old_listeners.forEach(function(listener) {
    self.on(event, listener)
  })
}


FixedEventEmitter.prototype.emit = function(event) {
  var self = this

  var once = self._fixed_events[event]
  if(!once)
    return EventEmitter.prototype.emit.apply(self, arguments)

  if(once.task)
    throw new Error('Cannot re-emit fixed event "'+event+'"')

  var args = Array.prototype.slice.call(arguments, 1)
  once.job(function(callback) {
    callback.apply(self, args)
  })
}


}) // defaultable

