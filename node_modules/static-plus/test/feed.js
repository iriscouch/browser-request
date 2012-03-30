var fs = require('fs')
  , tap = require('tap')
  , test = tap.test
  , util = require('util')
  , request = require('request')

var couch = require('./couch')
  , api = require('../api')
  , auto = api.defaults({autostart:true, autostop:true, source:couch.DB, 'template':couch.simple_tmpl })

couch.setup(test)

test('Build to object', function(t) {
  t.ok(couch.rtt(), 'The request duration should be known')

  couch.add_doc('foo', 'tball', function() {
    var builder = new auto.Builder({ 'target':{} })

    var pages = 0;
    builder.on('page', function(page) {
      pages += 1
      //console.error(util.inspect(builder.target))
      t.equals(Object.keys(builder.target).length, pages, 'Should have '+pages+' pages built now')
    })

    var deploy = null
    builder.on('deploy', function(output) { deploy = output })

    setTimeout(check_deploys, couch.rtt() * 2)
    function check_deploys() {
      t.ok(deploy, 'One deploy should have happened since the DB had one document')
      t.ok(deploy.foo, 'The document was deployed')
      t.equal("" + deploy.foo, 'foo says tball', 'Deployed "page" matches the template')

      t.end()
    }
  })
})

test('Build to files', function(t) {
  couch.add_doc('bar', 'camp', function() {
    var build_dir = __dirname + '/../build_test/files'

    var builder = new auto.Builder({ 'target':build_dir })
    builder.on('deploy', function(path) {
      t.equal(path, build_dir, 'Deploy to the same path as instructed')

      var found = fs.readdirSync(build_dir)
      t.ok(~found.indexOf('foo.html'), 'Document "foo" was built as a file')
      t.ok(~found.indexOf('bar.html'), 'Document "bar" was built as a file')

      t.equal(fs.readFileSync(build_dir+'/foo.html', 'utf8'), 'foo says tball', 'File for document "foo" looks good')
      t.equal(fs.readFileSync(build_dir+'/bar.html', 'utf8'), 'bar says camp', 'File for document "bar" looks good')

      t.end()
    })
  })
})
