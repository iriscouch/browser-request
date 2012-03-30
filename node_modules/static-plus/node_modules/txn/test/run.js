#!/usr/bin/env node
//
// Run the tests

var log4js = require('log4js')
  , util = require('util'), I = util.inspect
  , assert = require('assert')
  ;

var XX_MEANS_EXCLUDE = process.env.xx ? false : true; // Set to false to run *only* the xx tests.
var DEFAULT_TEST_TIMEOUT = 500; // ms
var TIMEOUT_COEFFICIENT = 1.0;

var TESTS = require('./txn');

// No idea what's going on but in IE, there is an undefined element at the end of the list.
while(! TESTS[TESTS.length - 1])
  TESTS.length = TESTS.length - 1;

var LOG = log4js.getLogger('tests');
LOG.setLevel(process.env.log_level || 'info');

//
// Runner
//

var errors = [];
var count = { pass: 0
            , timeout: 0
            , fail: 0
            , skip: 0
            }

count.inc = function(type) {
  this[type] += 1
  var symbol = type[0].toUpperCase().replace(/P/, '.');
  process.stdout.write(symbol);

  if(type === 'fail' || type === 'timeout' && process.env.exit)
    TESTS = [];
  return run();
}

var decoration = {};
TESTS = TESTS.reduce(function(so_far, obj) {
  if(typeof obj === 'function') {
    so_far.push(obj);
    pred_copy(decoration, obj);
    decoration = {};
  } else {
    pred_copy(obj, decoration);
  }
  return so_far;
}, []);

function run() {
  var test = TESTS.shift();
  if(!test)
    return complete();

  var starts_with_xx = /^xx/.test(test.name);
  if(test.name !== 'setup') {
    if( XX_MEANS_EXCLUDE ? starts_with_xx : !starts_with_xx )
      return count.inc('skip');
  }

  var timeout = test.timeout || DEFAULT_TEST_TIMEOUT;
  timeout *= (test.timeout_coefficient || test.time_C || 1);
  timeout *= TIMEOUT_COEFFICIENT;

  var start_at = new Date;
  function done(er) {
    var end_at = new Date;
    var duration = end_at - start_at;

    if(er === 'timeout') {
      errors.push({test:test, er:new Error('Timeout (' + (duration / 1000) + 's) : ' + test.name)});
      return count.inc('timeout');
    }

    clearTimeout(test.timer);
    if(er) {
      errors.push({test:test, er:er});
      return count.inc('fail');
    }

    if(duration > (timeout * 0.80))
      LOG.warn('Long processing time: ' + test.name + ' took ' + duration + 'ms');

    return count.inc('pass');
  }

  test.timer = setTimeout(function() { done('timeout') }, timeout);

  // This is pretty convenient. Simply throw an error and we'll assume it pertains to this unit test.
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', function(er) { return done(er); })
  if(process.exceptions) {
    process.exceptions.removeAllListeners('exception');
    process.exceptions.on('exception', function(er) { return done(er); })
  }

  LOG.debug('Test: ' + test.name);
  try       { test(done) }
  catch(er) { done(er)   }
}

function complete() {
  process.stdout.write('\n\n');
  errors.forEach(function(result) {
    var test = result.test, er = result.er;
    var stack = er.stack;
    if(er.expected || er.actual)
      stack = "expected=" + util.inspect(er.expected) + ' actual=' + util.inspect(er.actual) + '\n' + stack;

    LOG.error("Test: " + test.name);
    LOG.error(stack);
    LOG.error("");
  })

  LOG.info('Pass   : ' + count.pass);
  LOG.info('Fail   : ' + count.fail);
  LOG.info('Timeout: ' + count.timeout);
  LOG.info('Skip   : ' + count.skip);
}

exports.run = function() {
  if(process.env.timeout_coefficient || process.env.C)
    TIMEOUT_COEFFICIENT = parseFloat("" + (process.env.timeout_coefficient || process.env.C));

  if(require.isBrowser && process.env.synthetic_throw) {
    var events = require('events');
    process.exceptions = new events.EventEmitter;
  }

  run();
}

if(require.main === module)
  exports.run();

//
// Utilities
//

function pred_copy(src, dst, pred) {
  pred = pred || function() { return true };
  if(pred === 'uppercase')
    pred = function(key) { return /^[A-Z]/.test(key) };

  Object.keys(src).forEach(function(key) {
    var val = src[key];
    if(pred(key, val))
      dst[key] = val;
  })
}

if(! assert.thrown)
  assert.thrown = function(expected, code, message) {
    if(typeof expected == 'function' && typeof code == 'string' && typeof message == 'undefined') {
      message  = code;
      code     = expected;
      expected = /./;
    }

    var exception = null;
    try       { code()        }
    catch (e) { exception = e }

    if(!exception)
      throw new Error("Exception not thrown: " + (message || "assert.thrown"));

    if(!exception.message.match(expected))
      throw new Error("Exception did not match "+expected+": " + exception.message + "\n > " + message);
  }

if(! assert.member)
  assert.member = function(elem, list, message) {
    var is_member = false;
    list.forEach(function(list_elem) {
      if(list_elem === elem)
        is_member = true;
    })

    if(!is_member)
      throw new Error(message || "");
  }

if(! assert.any)
  assert.any = function(pred, list, message) {
    for(var a = 0; a < list.length; a++)
      if(pred.call(null, list[a]))
        return true;
    throw new Error(message || "assert.any");
  }

if(! assert.none)
  assert.none = function(pred, list, message) {
    for(var a = 0; a < list.length; a++)
      if(pred.call(null, list[a]))
        throw new Error(message || "assert.none");
    return true;
  }

if(! assert.func)
  assert.func = function(obj, message) {
    if(typeof obj !== 'function')
      throw new Error(message || "assert.func");
  }

if(! assert.almost)
  assert.almost = function(margin, expected, actual, message) {
    if(!message) {
      message = actual;
      actual = expected;
      expected = margin;
      margin = 0.10;
    }

    var delta = Math.abs(actual - expected);
    var real_margin = delta / expected;

    if(real_margin > margin)
      throw new Error([ (message || "assert.almost")
                      , "\n"
                      , "expected "
                      , JSON.stringify(expected)
                      , " (+/- "+(100 * margin)+"%) "
                      , " got "
                      , JSON.stringify(actual)
                      ].join(''));
  }
