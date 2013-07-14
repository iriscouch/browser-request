var test = require('tape')

var request = require('../')

test('try a CORS GET', function (t) {
  t.plan(2)
  var url = 'https://www.googleapis.com/plus/v1/activities'
  request(url, function(err, resp, body) {
    t.equal(resp.statusCode, 400)
    t.equal(!!resp.body.match(/Required parameter/), true)
  })
})