var util = require('util')
  , diff = require('./diff')
  ;

var API = { 'diff'   : diff.doc_diff
          , 'atmost' : diff.doc_diff_atmost
          , 'atleast': diff.doc_diff_atleast
          };

module.exports = API;
