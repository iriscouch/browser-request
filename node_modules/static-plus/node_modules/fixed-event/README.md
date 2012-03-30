# Fixed Event: Once and forever event emitter

Fixed Event is a Javascript and Node.js package for a common `EventEmitter` problem:

1. Run a start-up or initialization function, e.g. connect to the DB, load the configuration, etc.
1. Fire an event when it is done
1. Later, you have code that depends on the start-up routing finishing. Should you subscribe to the event? What you want is this:
  * If it has not finished yet, just subscribe to it normally
  * If it has finished, execute your callback immediately with the original result

Fixed Event is available as an NPM module.

    $ npm install fixed-event

## Example

```javascript
var fixed = require('fixed-event')
var status = new fixed.EventEmitter

// Listening before the event fires
status.on('ready', function(result) {
  console.log('Ready first listener: ' + result)
})

// Like .emit() but fixes the result in place
status.fixed('ready', "Awesome!")

// Listening after the event fires
setTimeout(late_listener, 1000)

function late_listener() {
  status.on('ready', function(result) {
    console.log('Ready second listener: ' + result)
  })
}
```

Output

    Ready first listener: Awesome!
    Ready second listener: Awesome!

## Details

A Fixed EventEmitter is a normal EventEmitter, with a few extra methods:

* **fix("event_name")** | Fix *event_name*. The next emit for "event_name" works normally; but all subsequently-added listeners will fire immediately
* **fixed("event_name", [val1], [val2])** | Fix *event_name* and also emit the event, with *val1*, *val2*, etc. as parameters

## Defaults

Fixed Event is [defaultable][def]. The default option `fixed` allows pre-setting event names.

```javascript
var fixed = require('fixed-event')
  , done_is_fixed    = fixed.defaults({ events:"done" })
  , ducks_are_fixed  = fixed.defaults({ events:["Huey", "Dewey", "Louie"] })
  , values_are_fixed = fixed.defaults({ events:{ enter: "You entered!"
                                               , exit : ["You", "exited"]
                                               }})
```

The `events` default supports different data types

* **string** | Automatically runs `.fix()` for that name (no events fired yet)
* **array** | Automatically run `.fix()` for all those names (no events fired yet)
* **object** | Every key is both fixed, and emitted with the value indicated

Thus, the above code could be used like so

```javascript
var state = new done_is_fixed.EventEmitter
state.emit('done', 'Hi, listener below me!')
state.on('done', function(hi) { console.log('Loud and clear.') }) // Fires

var bros = new ducks_are_fixed.EventEmitter
bros.emit('Dewey', 'Duck')
bros.on('Dewey', function() { 'Dewey event fired' }) // Fires
bros.on('Dewey', function() { 'Dewey fired again' }) // Also fires

// This will fire immediately
var room = new values_are_fixed.EventEmitter
room.on('enter', function(msg) { console.log(msg) }) // output: "You entered!"
```

## Tests

Follow uses [node-tap][tap]. If you clone this Git repository, tap is included.

    $ ./node_modules/.bin/tap test
    ok test/event.js ...................................... 19/19
    ok test/once.js ................................... 5011/5011
    total ............................................. 5032/5032

    ok

## License

Apache 2.0

[tap]: https://github.com/isaacs/node-tap
[def]: https://github.com/iriscouch/defaultable
