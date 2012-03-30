// Static Plus API tests
//
// WARNING: This comment will be searched for by one of the tests below. Waldo!
//

var fs = require('fs')
  , tap = require('tap')
  , test = tap.test
  , util = require('util')
  , request = require('request')

var api = require('../api')
  , couch = require('./couch')
  , auto = api.defaults({ autostart:true, autostop:true, source:couch.DB })

couch.setup(test)

test('Builder includes the Handlebars API', function(t) {
  t.type(api.handlebars, 'object', 'The builder API includes handlebars')
  t.end()
})

test('Builder API', function(t) {
  var builder;
  t.doesNotThrow(function() { builder = new api.Builder }, 'Create a new builder')
  t.ok(builder, 'Got a builder object')

  t.end()
})

test('Attaching to events', function(t) {
  var builder = new api.Builder
  builder.target = {}

  builder.deploy()

  var deploys = 0
  builder.on('deploy', function() { deploys += 1 })
  setTimeout(check_deploys, 50)
  function check_deploys() {
    t.equal(deploys, 1, 'Got a deploy event even when attaching after calling deploy')
    t.end()
  }
})

test('Builder bad values', function(t) {
  function tmpl() { return 'A template!' }

  var bad_vals = [ {}
                 , { 'template':null }
                 , { 'template':1    }
                 , { 'template':tmpl }
                 , { 'template':tmpl, 'source':'not_a_url' }
                 , { 'template':tmpl, 'source':couch.DB }
                 , { 'template':tmpl, 'source':couch.DB }
                 , { 'template':tmpl, 'source':couch.DB, 'target':1 }
                 , { 'template':tmpl, 'source':couch.DB, 'target':[] }
                 ]

  do_vals()
  function do_vals() {
    var vals = bad_vals.shift()
    if(!vals)
      return t.end()

    var vals_repr = {}
    Object.keys(vals).forEach(function(key) {
      vals_repr[key] = vals[key]
      if(typeof vals_repr[key] == 'function')
        vals_repr[key] = '<func>'
    })
    vals_repr = JSON.stringify(vals_repr)

    var builder = new api.Builder
    Object.keys(vals).forEach(function(key) {
      builder[key] = vals[key]
    })

    var fetched = false
    builder.on('fetch', function() { fetched = true })
    //builder.on('error', function(er) { console.error('=-=-=-=-=\n'+er.stack+'\n=-=-=-='); throw er })

    t.throws(function() { builder.fetch() }, 'Throw for bad values: ' + vals_repr)

    setTimeout(check_events, couch.rtt() / 2)
    function check_events() {
      t.false(fetched, 'No fetch event for bad values: ' + vals_repr)
      do_vals()
    }
  }
})

test('Builder basic run', function(t) {
  t.ok(couch.rtt(), 'The request duration should be known')

  var builder = new api.Builder

  var events = {}
  builder.on('template', function(template) { events.template = template })
  builder.on('target'  , function(target)   { events.target   = target   })
  builder.on('source'  , function(source)   { events.source   = source    })
  builder.on('fetch'   , function()         { events.fetch    = true     })
  //builder.on('error'   , function(er) { throw er })

  builder.template = function(doc) { return 'Doc!' }
  builder.source = couch.DB
  builder.target = __dirname + '/../build_test/target'

  t.doesNotThrow(function() { builder.fetch() }, 'No throw for all good starting data')

  setTimeout(check_events, couch.rtt() * 2)
  function check_events() {
    t.ok(events.target, 'The target event finally fired')
    t.ok(events.template, 'The template event finally fired')
    t.ok(events.source, 'The source event finally fired')
    t.ok(events.fetch, 'The builder started fetching')

    t.ok(builder.feed, 'The builder should have a feed by now')

    builder.stop()
    t.end()
  }
})

test('Manually add a page', function(t) {
  var builder = new api.Builder({ 'source':couch.DB, target:{} })

  var pages = {}
  builder.on('page', function(page) { pages[page.id] = page })

  builder.page('', 'Blank page')
  builder.page('stuff', 'A page with stuff', 'text/plain')
  builder.load('this', __filename, 'application/javascript')

  builder.deploy()
  builder.on('deploy', function() {
    t.equal(Object.keys(pages).length, 3, 'Three pages emitted')

    t.equal(pages[''].id, '', 'Got the blank page by id')
    t.equal("" + pages[''].content, 'Blank page', 'Got the blank page content')

    t.equal(pages.stuff.id, 'stuff', 'Got the stuff page by id')
    t.equal("" + pages.stuff.content, 'A page with stuff', 'Got the stuff page content')

    t.equal(pages.this.id, 'this', 'Got this file by id')
    var content = "" + pages.this.content
      , found = content.split(/\n/).some(function(line) { return line.match(/Waldo!/) })

    t.ok(found, 'Added this file to the pages')

    t.end()
  })
})

test('Autostart', function(t) {
  var builder = new api.Builder({ name:'Autostart', autostart:true })
  builder.source = couch.DB
  builder.target = {}
  builder.template = function() { return 'I autostarted!' }

  var events = { 'fetch':false, 'deploy':false }
  builder.on('fetch', function() { events.fetch = true })
  builder.on('deploy', function() { events.deploy = true })

  setTimeout(check_for_deploy, couch.rtt() * 2)
  function check_for_deploy() {
    t.ok(events.fetch, 'The builder should have started automatically')
    t.ok(events.deploy, 'The builder should have deployed by now')

    builder.stop()
    t.end()
  }
})

test('Autostop', function(t) {
  var builder = new api.Builder({ autostart:true, autostop:true })
  builder.source = couch.DB
  builder.target = {}
  builder.template = function() { return 'I autostop' }

  var stopped = false
  builder.on('stop', function() { stopped = true })

  setTimeout(check_for_stop, couch.rtt() * 2)
  function check_for_stop() {
    t.ok(stopped, 'The builder should have stopped by now')
    t.ok(builder.dead, 'The builder should be dead')
    t.ok(builder.feed.dead, "The builder's feed should be dead")
    t.end()
  }
})

test('Bad couch output', function(t) {
  var bad_urls = [ [ /ECONNREFUSED/    , 'http://localhost:10/db/id' ]
                 , [ /Bad database/    , require('path').dirname(couch.DB) ]
                 , [ /document ID/     , couch.DB + '/doc_one/attachment'  ]     // These two errors are
                 , [ /Bad CouchDB doc/ , couch.DB + '/doc/attachment/too_deep' ] // actually the same one.
                 ]

  test_url()
  function test_url() {
    var url = bad_urls.shift()
    if(!url)
      return t.end()

    var message = url[0]
    url = url[1]

    var error = null
    try {
      var builder = new auto.Builder({ 'template':couch.simple_tmpl, 'target':url })
    } catch (er) { error = er }
    builder.on('error', function(er) { error = er })

    setTimeout(check_error, couch.rtt())
    function check_error() {
      t.ok(error, 'Bad URL should have caused an error: ' + url)
      t.ok(error && error.message.match(message), 'Bad url '+url+' caused error: ' + message)

      test_url() // Next one
    }
  }
})

test('Good couch output', function(t) {
  request.post({'uri':couch.DB, 'json':{'_id':'output'}}, function(er, res) {
    if(er) throw er
    t.equal(res.statusCode, 201, 'Create output document')

    var ids = ['output', 'no-exist-1234']
    test_id()
    function test_id() {
      var id = ids.shift()
      if(!id)
        return t.end()

      var doc_url = couch.DB + '/' + id
      var builder = new auto.Builder({ 'template':couch.simple_tmpl, 'target':doc_url })

      var error = null
        , target = null
        , done = false

      builder.on('error', function(er) { error = er })
      builder.on('target', function(t) { target = t })
      builder.on('stop', function() { done = true })

      setTimeout(check_result, couch.rtt() * 3)
      function check_result() {
        t.equal(error, null, 'No errors for good doc url: ' + doc_url)
        t.equal(target, doc_url, 'Builder emitted its target')
        t.equal(done, true, 'Builder finished with good doc_url')

        test_id()
      }
    }
  })
})

test('Template files', function(t) {
  // This is a little crazy but I'll do it for now. Hopefully this file and build.js don't have double-braces anywhere.
  var builder = new api.Builder
  builder.target = {}
  builder.template = __filename
  builder.partials.build_js = __dirname + '/builder.js'

  var template = null
  builder.on('template', function(tm) { template = tm })

  builder.doc({_id:'hey'})
  builder.deploy()

  builder.on('deploy', function() {
    t.ok(template, 'Template event was fired')
    t.type(template, 'function', 'Template was compiled from this file')
    t.type(builder.partials.build_js, 'function', 'Partial template built from the other test file')
    t.ok(builder.target.hey instanceof Buffer, 'Builder made hey and it was a Buffer')

    t.end()
  })
})
