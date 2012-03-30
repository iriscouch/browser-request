var util = require('util')
  ;

module.exports = { 'doc_diff'        : doc_diff
                 , 'doc_diff_atmost' : doc_diff_atmost
                 , 'doc_diff_atleast': doc_diff_atleast
                 };

// Return an object representing fields that have changed from an old object to a new one.
// The returned object has keys such as "foo"  The values are an object of {from: Oldval, to: Newval}.
function doc_diff(from, to) {
  var all_keys = Object.keys(from);
  for (var key in to)
    if(to.hasOwnProperty(key) && all_keys.indexOf(key) == -1)
      all_keys.push(key);

  //console.log('doc_diff: from=%j to=%j', from, to);
  var diff = {};
  all_keys.forEach(function(key) {
    var from_val = from[key];
    var to_val   = to[key];
    if(typeOf(from_val) == 'object' && typeOf(to_val) == 'object') {
      var obj_diff = doc_diff(from_val, to_val);
      if(!is_equal(obj_diff, {}))
        diff[key] = obj_diff;
    } else if(!is_equal(from_val, to_val)) {
      diff[key] = {from:from_val, to:to_val};
    }
  })

  return diff;
}

function change_matches(allowed_change, from_value, to_value) {
  if(typeOf(allowed_change) != 'object')
    throw new Error("allowed_change must be an object");

  //var I = require('sys').inspect;
  //console.log('change_matches:\n%s', I({allowed_change:allowed_change, from_value:from_value, to_value:to_value}));
  //for (var a in allowed_change)
  //  console.log("  I see: " + a);

  if(allowed_change.hasOwnProperty('from') && allowed_change.hasOwnProperty('to') && is_equal(allowed_change.from, allowed_change.to))
    throw new Error("This indicates no change at all: " + JSON.stringify(allowed_change));

  var checker_for = function(change_type) {
    if(!allowed_change.hasOwnProperty(change_type))
      return function(x) { return true; };

    // TODO: This code is unable to handle changes from a scalar into a deep object. For example,
    // {} vs. {"something": {"foo":"bar"}}
    // from_value: undefined
    // to_value: {"foo": "bar"}
    // It would be nice to say allowed_change = {to: {foo: {}}}. That would require calling doc_diff
    // again, and may warrant the full change to the flat namespace with dotted keys format.
    // {"something.foo": {"to":{}, exact:false}}
    var val = allowed_change[change_type];
    if(typeOf(val) == 'undefined')
      return function(x) { return x === undefined; };
    if(typeOf(val) == 'regexp')
      return function(x) { return typeOf(x) == 'string' && val.test(x); };
    if(val === Array)
      return function(x) { return typeOf(x) == 'array'; }
    if(typeOf(val) == 'function')
      return val;
    return function(x) { return is_equal(val, x); };
  }

  return checker_for('from')(from_value) && checker_for('to')(to_value);
}

function is_change_rule(rule) {
  if(typeOf(rule) !== 'object')
    return false;

  var keys = Object.keys(rule);
  if(keys.length == 0)
    return true;
  if(keys.length == 1 && (rule.hasOwnProperty('from') || rule.hasOwnProperty('to')))
    return true;
  if(keys.length == 2 && rule.hasOwnProperty('from') && rule.hasOwnProperty('to'))
    return true;

  return false;
  //console.log('Rule "%s" is a rule? %s!', require('sys').inspect(rule), is_change_rule(rule));
}

// Return whether the differences between two documents contains a subset of those specified.
function doc_diff_atmost(from, to, allowed, strict) {
  //console.log('diff_atmost\n%s', require('sys').inspect({from:from, to:to, allowed:allowed}));
  var diff = doc_diff(from, to);
  //console.log('diff = ' + require('sys').inspect(diff));

  if(!strict && !allowed.hasOwnProperty('_revisions'))
    allowed._revisions = {ids: {from:Array, to:function(x) { return typeOf(x) == 'array' && x.length > 0; }}};

  for (var key in diff) {
    if(key != 'nest' && !allowed.hasOwnProperty(key))
      return false; // This change was not specified at all.

    var rule = allowed[key];
    if(is_change_rule(rule)) {
      // Normal comparison check.
      if(!change_matches(rule, diff[key].from, diff[key].to))
        return false; // This change was specified but it did not match the approved type of change.
    } else {
      // Nested comparison.
      if(!doc_diff_atmost(from[key], to[key], rule))
        return false;
    }
  }
  return true;
}

// Return whether the differences between two documents contains a subset of those specified.
function doc_diff_atleast(from, to, required) {
  var diff = doc_diff(from, to);

  for (var key in required) {
    if(key !== 'nest' && !diff.hasOwnProperty(key))
      return false;

    var rule = required[key];
    if(is_change_rule(rule)) {
      // Normal change check.
      if(!change_matches(rule, diff[key].from, diff[key].to))
        return false;
    } else if(key !== 'nest') {
      // Nested comparison
      if(!doc_diff_atleast(from[key], to[key], rule))
        return false;
    }
  }
  return true;
}

//
// Utilities
//

function typeOf(value) {
  var s = typeof value;

  if (s === 'object') {
    if(!value)
      s = 'null';
    else {
      //if (value instanceof Array)
      if(Object.prototype.toString.apply(value) === '[object Array]') {
        s = 'array';
      }
    }
  } else if(s === 'function' && value instanceof RegExp)
    return 'regexp';

  return s;
}


// Equality that works for objects.
function is_equal(a, b) {
  var a_type = typeOf(a)
    , b_type = typeOf(b)
    , i
    ;

  if(a_type !== b_type)
    return false;

  else if(a_type === 'array') {
    if(a.length !== b.length)
      return false;

    for(i = 0; i < a.length; i++)
      if(!is_equal(a[i], b[i]))
        return false;

    return true;
  }

  else if(a_type == 'object') {
    if(Object.keys(a).length !== Object.keys(b).length)
      return false;

    for(i in a)
      if(!is_equal(a[i], b[i]))
        return false;

    return true;
  }

  else
    return a === b;
}
