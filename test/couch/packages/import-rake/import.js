// Run rake and copy the built files into the Kanso app
//

var fs = require('fs')
  , path = require('path')
  , child_process = require('child_process')

exports.run = import_rake

function import_rake(root, location, settings, doc, callback) {
  var home = path.dirname(path.dirname(location))

  child_process.exec('rake', function(er, stdout, stderr) {
    if(er) throw er
    console.log('ok Rake')

    load('browser/request.js')
    load('requirejs/request.js')
    load('requirejs/xmlhttprequest.js')

    return callback(null, doc)
  })

  function load(source) {
    var source_path = path.join(home, 'release', source)

    var content = fs.readFileSync(source_path)

    doc._attachments = doc._attachments || {}
    doc._attachments[source] = { 'content_type':'application/javascript'
                               , 'data':content.toString('base64')
                               }
  }
}
