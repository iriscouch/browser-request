var test = require('tape')

var request = require('./')

test('try a CORS GET', function (t) {
  var url = 'https://www.googleapis.com/plus/v1/activities'
  request(url, function(err, resp, body) {
    t.equal(resp.statusCode, 400)
    t.equal(!!resp.body.match(/Required parameter/), true)
    t.end()
  })
})

test('json true', function (t) {
  var url = 'https://www.googleapis.com/plus/v1/activities'
  request({url: url, json: true}, function(err, resp, body) {
    t.equal(body.error.code, 400)
    t.end()
  })
})

test('blob true', function (t) {
  var url = 'http://lorempixel.com/100/100/'
  request({url: url, blob: true}, function(err, resp, blob) {
    t.equal(resp.statusCode, 200)
    t.equal(!!blob.type.match(/^image/), true)
    t.end()
  })
})