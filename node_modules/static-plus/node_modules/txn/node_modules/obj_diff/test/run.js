#!/usr/bin/env node

var util = require('util')
  , diffs = require('./diffs')
  , policy = require('./policy')
  ;

function main() {
  diffs.main();
  policy.main();
}

if(require.main === module)
  main();
