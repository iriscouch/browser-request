// Builder
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var defaultable = require('defaultable')

defaultable(module,
  { 'autostart': false
  , 'autostop' : false
  , 'template' : null
  , 'partials' : {}
  , 'helpers'  : {}
  , 'suffix'   : '-baking'
  , 'keep_baking_doc': false
  , 'namespace': 'static-plus'
  , 'page_type': 'text/html;charset=UTF-8'
  , 'cooldown' : 100
  , 'output'   : null
  , 'source'   : null
  }, function(module, exports, DEFS, require) {

module.exports = Builder


var fs = require('fs')
  , URL = require('url')
  , txn = require('txn')
  , path = require('path')
  , util = require('util')
  , fixed = require('fixed-event')
  , follow = require('follow')
  , rimraf = require('rimraf')
  , assert = require('assert')
  , request = require('request')
  , package = require('../package.json')
  , handlebars = require('handlebars')
  , querystring = require('querystring')

var lib = require('../lib')

var builder_id = 0

util.inherits(Builder, fixed.EventEmitter)
function Builder (opts) {
  var self = this;
  fixed.EventEmitter.call(self)

  opts = opts || {}
  if(typeof opts == 'string')
    opts = { 'db':opts }
  opts = defaultable.merge(opts, DEFS)

  builder_id += 1
  self.id = builder_id
  self.log = lib.getLogger(opts.db || 'Builder')

  self.pages = {'total':0, 'manual':0, 'feed':0}
  self.template = opts.template
  self.partials = opts.partials || DEFS.partials
  self.helpers  = opts.helpers || DEFS.helpers
  self.source   = opts.source
  self.target   = opts.target
  self.read_only= opts.read_only
  self.namespace= opts.namespace || DEFS.namespace
  self.keep_baking_doc = !!(opts.keep_baking_doc || DEFS.keep_baking_doc)
  self.autostop = opts.autostop
  self.caught_up = false

  // Keep a queue of pending pages not written out yet.
  self.pending  = []

  // Prep work to do
  self.preparing = { 'source': new fixed.Once
                   , 'target': new fixed.Once
                   , 'template': new fixed.Once
                   }

  self.feed = new follow.Feed
  if(opts.autostart) {
    // Give it one tick for the caller to hook into events.
    self.log.debug('Autostart', {'id':self.id})
    process.nextTick(function() {
      self.fetch()
    })
  }
}


Builder.prototype.prep_target = function(callback) {
  var self = this;

  if(self.preparing.target.task)
    return self.preparing.target.on_done(callback)

  if(typeof self.target == 'object' && !Array.isArray(self.target)) {
    self.log.debug('Using an in-memory object for target')
    self.preparing.target.job(function(callback) {
      callback(null, self.target)
    })
  }

  else if(typeof self.target == 'string' && self.target.match(/^https?:\/\//))
    self.preparing.target.job(function(to_job) {
      self.prep_target_url(to_job)
    })

  else if(typeof self.target == 'string')
    self.preparing.target.job(function(to_job) {
      self.prep_target_dir(to_job)
    })

  else
    throw new Error('Must set .target to a directory name or an object')

  return self.preparing.target.on_done(callback)
}


Builder.prototype.prep_target_url = function(callback) {
  var self = this

  self.log.debug('Preparing target', {'target':self.target})

  try        { var target = lib.couch_url(self.target) }
  catch (er) { return self.die(er)                     }

  var couch_url  = target.couch
    , db_url     = couch_url + '/' + target.db
    , target_url = db_url + '/' + target.id
    , baking_id  = target.id + DEFS.suffix
    , baking_url = db_url + '/' + baking_id

  self.log.debug('Confirming target document', {'url':baking_url})
  lib.request({'uri':baking_url, json:true}, function(er, res) {
    if(er)
      return callback(er)

    else if(res.statusCode == 200 && res.body.couchdb == 'Welcome')
      return callback(new Error('Output must be a document URL, not a CouchDB server URL'))

    else if(res.statusCode == 404 && res.body.error == 'not_found') {
      if(res.body.reason == 'Document is missing attachment')
        return callback(new Error('Output URL is not a document in a CouchDB database'))

      self.log.debug('No target document yet', {'url':baking_url})
      confirm_db()
    }

    else if(res.statusCode == 200 && res.body._id && res.body._rev) {
      self.log.debug('Deleting target document', {'url':baking_url})
      lib.request({'method':'DELETE', 'json':true, 'uri':baking_url+'?rev='+res.body._rev}, function(er, res) {
        if(er)
          return callback(er)

        if(res.statusCode != 200 || !res.body.ok)
          return callback(new Error('Failed to delete target document: ' + baking_url))

        confirm_db()
      })
    }
  })

  function confirm_db() {
    self.log.debug('Confirming target db', {'url':db_url})
    lib.request({'uri':db_url, json:true}, function(er, res) {
      if(er || res.statusCode != 200 || !res.body || !res.body.db_name)
        return callback(new Error('Not a CouchDB database: ' + db_url))

      confirm_couch()
    })
  }

  function confirm_couch() {
    self.log.debug('Confirming target server', {'url':couch_url})
    lib.request({'uri':couch_url, json:true}, function(er, res) {
      if(er || res.statusCode != 200 || !res.body || res.body.couchdb != 'Welcome')
        return callback(new Error('Not a CouchDB server: ' + couch_url))

      self.target = {'couch':couch_url, 'db':target.db, 'baking':baking_id, 'final':target.id}
      self.log.info('Deployment confirmed', self.target)

      // Distinguish this from an in-memory object target.
      self.target._couch = true

      self.emit('target', target_url)
      callback(null, self.target)
    })
  }
}


Builder.prototype.prep_target_dir = function(callback) {
  var self = this

  fs.lstat(self.target, function(er, stat) {
    if(er && er.code != 'ENOENT')
      return callback(er)

    else if(!er && stat.isDirectory()) {
      self.log.info('Cleaning target directory', {'target':self.target, 'id':self.id})
      rimraf(self.target, {gently:self.target}, function(er) {
        if(er)
          return callback(er)
        self.log.debug('Cleaned: ' + self.target)
        fs.mkdir(self.target, 0777, function(er, res) {
          if(er)
            return callback(er)

          self.emit('target', self.target)
          return callback(null, self.target)
        })
      })
    }

    else if(er && er.code == 'ENOENT') {
      var dirs = path.resolve(self.target).split(/\//)
        , dir = '/'
      self.log.debug('Creating target directory', {'dirs':dirs})
      mkdir()
      function mkdir() {
        if(dirs.length == 0) {
          self.emit('target', self.target)
          return callback(null, self.target)
        }

        dir = path.join(dir, dirs.shift())
        path.exists(dir, function(is_dir) {
          if(is_dir)
            return mkdir()

          fs.mkdir(dir, 0777, function(er) {
            if(er)
              return callback(er)
            mkdir()
          })
        })
      }
    }

    else
      callback(new Error('Cannot use target location: ' + self.target))
  })
}


Builder.prototype.prep_source = function(callback) {
  var self = this;

  if(self.preparing.source.task)
    return self.preparing.source.on_done(callback)

  var source_url = self.source
    , source = lib.couch_url(source_url)
  assert.ok(!source.id, 'Need a DB URL, not a document URL')

  self.preparing.source.job(check_source)
  return self.preparing.source.on_done(callback)

  function check_source(to_job) {
    self.log.debug('Checking source DB', {'url':source_url, 'id':self.id})
    lib.request({uri:source_url, json:true}, function(er, res) {
      if(er)
        return to_job(er)
      if(res.statusCode != 200)
        return to_job(new Error('Bad response: ' + source_url))
      if(res.body.couchdb)
        return to_job(new Error('Need a DB URL, not a Couch URL: ' + source_url))

      if(!res.body.db_name || res.body.db_name != source.db)
        return to_job(new Error('Unknown database response: ' + JSON.stringify(res.body)))

      //if(res.body.update_seq == 0)
      //  return to_job(new Error('No documents in source database: ' + source_url))

      self.source = source
      self.emit('source', source_url)
      return to_job(null, self.source)
    })
  }
}


Builder.prototype.prep_template = function(callback) {
  var self = this;

  if(self.preparing.template.task)
    return self.preparing.template.on_done(callback)

  assert.ok(self.template, 'Must set .template to a filename or function')
  assert.ok(typeof self.template == 'function' || typeof self.template == 'string',
            'Unknown template type: ' + typeof self.template)

  self.preparing.template.job(compile_templates)
  return self.preparing.template.on_done(callback)

  function compile_templates(to_job) {
    var to_load = [ self.template ].concat(Object.keys(self.partials))
      , compiled_template = null
      , i = 0

    function apply_handlebars(doc) {
      var helpers = handlebars.helpers
      for (var helper_name in self.helpers)
        helpers[helper_name] = self.helpers[helper_name]
      return compiled_template(doc, {'partials':self.partials, 'helpers':helpers})
    }

    load()
    function load() {
      var template = to_load.shift()

      if(!template) {
        self.log.debug('Done preparing template', {'id':self.id, 'use_builtin':!!compiled_template})
        if(compiled_template)
          self.template = apply_handlebars
        self.emit('template', self.template)
        return to_job(null, self.template)
      }

      i += 1
      if(i == 1)
        compile(template, function(compiled) { compiled_template = compiled })
      else
        compile(self.partials[template], function(compiled) { self.partials[template] = compiled })
    }

    function compile(filename, on_compiled) {
      if(typeof filename == 'function')
        return load() // Nothing to do.

      self.log.debug('Loading template', {'id':self.id, 'filename':filename})
      fs.readFile(filename, 'utf8', function(er, body) {
        if(er)
          return to_job(er)

        var compiled = handlebars.compile(body)
        self.log.debug('Compiled Handlebars template', {'id':self.id, 'filename':filename, 'length':body.length})

        on_compiled(compiled)
        load()
      })
    }
  }
}


Builder.prototype.fetch = function() {
  var self = this;

  var done = {}
  self.prep_source(prepped('source'))
  self.prep_target(prepped('target'))
  self.prep_template(prepped('template'))

  function prepped(type) {
    return function(er) {
      if(er)
        return self.die(er)
      done[type] = true
      if(done.source && done.target && done.template)
        begin_fetch()
    }
  }

  function begin_fetch() {
    self.emit('fetch')
    self.log.debug('Fetching', {'id':self.id, 'source':self.source})

    self.feed.include_docs = true
    self.feed.db = self.source.couch + '/' + self.source.db

    self.feed.filter = not_deployment_doc
    function not_deployment_doc(doc, req) {
      // For dissimilar databases, use every document.
      if(!self.target._couch || self.target.couch != self.source.couch || self.target.db != self.source.db)
        return true

      // Otherwise, omit deployment documents.
      var is_deployment = (doc._id == self.target.baking || doc._id == self.target.final)
      if(is_deployment)
        self.log.debug('Skipping deployment document', {'id':doc._id})

      return !is_deployment
    }

    if(self.since)
      self.feed.since = self.since
    if(self.limit)
      self.feed.limit = self.limit
    if(self.inactivity_ms)
      self.feed.inactivity_ms = self.inactivity_ms

    process.nextTick(function() { self.feed.follow() })
    self.feed.on('error' , function(er) {
      self.feed.stop()
      self.emit('error', er)
    })

    self.feed.on('catchup', function(seq) {
      self.log.debug('Feed caught up', {'id':self.id, 'seq':seq})
      self.caught_up = true
    })

    self.feed.on('stop', function(reason) {
      self.log.warn('Feed stopped', {'id':self.id, 'reason':reason})
      self.deploy()
    })

    self.feed.on('change', function(change) {
      self.log.debug('Update', change)

      if(!change.doc)
        return self.log.error('No doc in change', change)

      self.doc(change.doc, 'feed')
    })
  }
}


Builder.prototype.doc = function(doc, source) {
  var self = this

  self.prep_template(function(er) {
    if(er)
      return self.die(er)

    var content = null
    try        { content = self.template(doc) }
    catch (er) { return self.die(er)          }

    // TODO the template will probably eventually want to return information about the content-type, etc.
    if(typeof content != 'string')
      return self.die(new Error('Bad template output for doc ' + doc._id + ': ' + JSON.stringify(page)))

    self.log.debug('Made page', {'id':doc._id, 'length':content.length, 'source':source})
    self.page(doc._id, content, DEFS.page_type, source)
  })
}


Builder.prototype.load = function(id, filename, type) {
  var self = this

  if(typeof id != 'string')
    throw new Error('Must supply a string id')
  if(typeof filename != 'string')
    throw new Error('Must supply a string filename')

  // Add this "page" to the pending array immediately, to postpone the deploy.
  var page = {'id':id, 'filename':filename, 'type':type, 'is_loading':true}
  self.pending.push(page)

  self.log.debug('Loading', {'id':self.id, 'page_id':id, 'filename':filename})
  fs.readFile(filename, function(er, content) {
    if(er)
      return self.die(er)
    self.log.debug('Loaded', {'id':self.id, 'filename':filename, 'page_id':id})

    // Sanity check to make sure this page is still due for output.
    if(! in_list(page, self.pending))
      return self.die(new Error('Page is no longer in the pending list: ' + id + ' ('+filename+')'))

    page.content = content
    delete page.is_loading
    self.refresh_output()
  })
}


Builder.prototype.page = function(id, content, type, source) {
  var self = this

  if(typeof id != 'string')
    throw new Error('Must supply a string id')

  if(typeof content == 'string')
    content = new Buffer(content)
  if(! (content instanceof Buffer))
    throw new Error('Must supply a string or Buffer content')

  if(!type || typeof type != 'string')
    type = DEFS.page_type

  source = source || 'manual'

  var page = {'id':id, 'content':content, 'type':type, 'source':source}
  self.log.debug('Build page', {'id':self.id, 'page_id':page.id, 'length':page.content.length, 'source':page.source})
  return self.add(page)
}


Builder.prototype.add = function(page) {
  var self = this

  // Clean and normalize stuff.
  page.id = page.id.replace(/\/+$/, '')
  if(typeof page.content == 'string')
    page.content = new Buffer(page.content)

  self.pending.push(page)
  self.log.debug('Pending page', {'id':JSON.stringify(page.id)})
  self.refresh_output()
}


Builder.prototype.refresh_output = function() {
  var self = this

  self.prep_target(function(er) {
    if(er)
      return self.die(er)

    if(typeof self.target == 'object' && !self.target._couch)
      return self.output_object()

    else if(typeof self.target == 'object')
      self.output_couch()

    else if(typeof self.target == 'string')
      self.output_dir()

    else
      self.die(new Error('Not implemented: building output for ' + output_type))
  })
}


Builder.prototype.output_object = function() {
  var self = this

  var pages = self.pending
  self.pending = []

  pages.forEach(function(page) {
    self.target[page.id] = page.content
  })

  self.pages_done(pages)
}


Builder.prototype.output_couch = function() {
  var self = this

  var now = new Date
  self.last_couch_push = self.last_couch_push || now
  var since_last_push = now - self.last_couch_push
    , remaining = DEFS.cooldown - since_last_push

  self.log.debug('Output to couch', {'id':self.id, 'pages':self.pending.length, 'prev':since_last_push})
  if(self.pending.length == 0)
    return self.log.debug('No pages to output to couch', {'id':self.id})

  if(since_last_push > DEFS.cooldown)
    self.last_couch_push = now
  else if(self.couch_push_timer)
    return self.log.debug('Waiting for postpone timer', {'id':self.id, 'elapsed':since_last_push, 'remaining':remaining})
  else {
    self.couch_push_timer = setTimeout(function() {
      delete self.couch_push_timer
      self.log.debug('Time for that push now', {'id':self.id})
      self.output_couch()
    }, remaining)
    return self.log.debug('Postpone output to couch', {'id':self.id, 'elapsed':since_last_push})
  }

  var req = { 'couch' : self.target.couch
            , 'db'    : self.target.db
            , 'id'    : self.target.baking
            , 'doc'   : self.target.baking_doc
            , 'create': ! self.target.baking_doc
            }

  var pages = self.pending.filter(needs_writing)
  pages.forEach(set_writing)
  return txn(req, attach_pages, attach_done)

  function attach_pages(doc, to_txn) {
    self.log.debug('Attach pages', {'id':self.id, 'count':pages.length})
    pages.forEach(function(page) {
      doc._attachments = doc._attachments || {}

      var name     = (self.namespace + '/' + page.id).replace(/\/+$/, '')
        , exists   = (name in doc._attachments)

      self.log.debug('Attach', {'name':name, 'exists':exists, 'length':page.content.length})

      doc._attachments[name] = {}
      doc._attachments[name].data = page.content.toString('base64')
      doc._attachments[name].content_type = page.type
    })

    return to_txn()
  }

  function attach_done(er, doc, result) {
    if(er)
      return self.die(er)

    self.log.debug('Attached pages', {'rev':doc._rev, 'count':pages.length, 'tries':result.tries})
    if(result.tries > 1)
      self.log.warn('Multiple updates (conflicts) storing pages', {'target':self.target, 'tries':result.tries})

    self.pending = self.pending.filter(not_in_list(pages))
    self.baking_doc = doc
    self.pages_done(pages)
  }
}


Builder.prototype.output_dir = function() {
  var self = this
  self.log.debug('Output to directory', {'id':self.id, 'target':self.target})

  var pages = self.pending.filter(needs_writing)
    , pages_written = []

  pages.forEach(set_writing)
  self.log.debug('Writing pages', {'id':self.id, 'count':pages.length, 'total_pending':self.pending.length})

  // Write sequentially for simplicity.
  write_page()
  function write_page() {
    var page = pages.shift()
    if(!page) {
      self.pending = self.pending.filter(not_in_list(pages_written))
      return self.pages_done(pages_written)
    }

    page.path = path.join(self.target, page.id) + '.html'
    self.log.debug('Write page file', {'id':self.id, 'path':page.path})
    fs.writeFile(page.path, page.content, 'utf8', function (er) {
      if(er)
        return self.die(er)

      pages_written.push(page)
      write_page()
    })
  }
}


Builder.prototype.pages_done = function(pages) {
  var self = this

  if(pages.length == 0)
    return self.log.debug('Noop pages done', {'id':self.id})

  self.log.debug('Pages done', {'id':self.id, 'count':pages.length, 'pending':self.pending.length})
  pages.forEach(function(page) {
    self.pages.total += 1
    if(page.source == 'feed')
      self.pages.feed += 1
    else
      self.pages.manual += 1

    self.emit('page', page)
  })

  if(self.caught_up && self.pending.length == 0) {
    self.log.debug('Feed caught up; 0 pending pages; deployment is due', {'id':self.id})
    self.deploy_due = true
  }

  if(self.deploy_due)
    self.deploy()
}


Builder.prototype.deploy = function() {
  var self = this

  if(!self.template)
    return run_deploy()

  // Pages may be waiting preparation of the template, in which case they will get put on the
  // pending queue. Those pages should really postpone this deployment. So depend on the template
  // prep to be sure.
  if(self.template)
    return self.prep_template(run_deploy)
  return run_deploy()

  function run_deploy(er) {
    if(er)
      return self.die(er)

    if(self.pending.length > 0) {
      self.deploy_due = true
      return self.log.debug('Deployment due when pages are done', {'count':self.pending.length})
    }

    self.deploy_due = false
    self.log.debug('Deploying', {'id':self.id, 'pending':self.pending.length})
    assert.equal(self.pending.length, 0, 'Must have no pending documents during deploy')

    if(self.target._couch)
      return self.deploy_url()
    else if(typeof self.target == 'object')
      self.log.debug('Nothing to do deploying to an object')
    else if(typeof self.target == 'string')
      self.log.debug('Nothing to do deploying to files')
    else
      return self.emit('error', new Error('Deploy to ' + (typeof self.target) + ' not implemented'))

    return self.deploy_done()
  }
}


Builder.prototype.deploy_done = function(target) {
  var self = this

  target = target || self.target
  self.log.info('Deployed', {'id':self.id})

  // Give it one tick for the caller to hook into events.
  process.nextTick(function() {
    self.emit('deploy', target)
    if(self.autostop) {
      self.log.debug('Autostop', {'id':self.id})
      self.stop()
    }
  })
}


Builder.prototype.deploy_url = function() {
  var self = this

  self.log.debug('Deploying to URL', {'target':self.target, 'pending':self.pending})
  assert.equal(self.pending.length, 0, 'Must have no pending documents during deploy')

  var source_url = [self.target.couch, self.target.db, self.target.baking].join('/')
    , target_url = [self.target.couch, self.target.db, self.target.final].join('/')

  var result = {'source':null, 'target':null}
  function finish(key, val) {
    result[key] = val
    if(result.source && result.target)
      copy(result.source, result.target)
  }

  self.log.debug('Finding revsion of the deployment target', {'url':target_url})
  lib.request({'method':'HEAD', 'uri':target_url}, function(er, res) {
    if(er)
      return self.die(er)

    if(res.statusCode == 404)
      return finish('target', {'rev':null})

    if(res.statusCode == 200 && res.headers && res.headers.etag)
      return finish('target', {'rev':JSON.parse(res.headers.etag)})

    er = new Error('Bad response for ' + target_url + ': ' + JSON.stringify(res.headers))
    er.statusCode = res.statusCode
    er.headers = res.headers
    return self.die(er)
  })

  // To avoid re-sending inline attachments, force a re-fetch by transacting by id instead of
  // the known doc (self.baking_doc).
  txn({'couch':self.target.couch, 'db':self.target.db, 'id':self.target.baking}, add_metadata, added_metadata)

  function add_metadata(doc, to_txn) {
    var namespace = self.namespace

    doc.static_plus = { 'version'   : package.version
                      , 'created_at': new Date
                      , 'pages'     : self.pages
                      , 'namespace' : namespace
                      }

    if(doc._id.match(/^_design\//)) {
      self.log.debug('Pushing to a design doc, activate "plus" mode')

      doc.rewrites = doc._rewrites || []
      doc.rewrites.push({'from':'_db'     , 'to':'../..'})
      doc.rewrites.push({'from':'_db/*'   , 'to':'../../*'})

      doc.rewrites.push({'from':'_couchdb'  , 'to':'../../..'})
      doc.rewrites.push({'from':'_couchdb/*', 'to':'../../../*'})

      doc.rewrites.push({'from':'', 'to':namespace})
      doc.rewrites.push({'from':'*', 'to':namespace+'/*'})

      if(!! self.read_only)
        doc.validate_doc_update = "" + function(newDoc, oldDoc, userCtx, secObj) {
          throw {'forbidden':'This Static+ database is read-only'}
        }
    }

    return to_txn()
  }

  function added_metadata(er, doc, result) {
    if(er)
      return self.die(er)

    self.log.debug('Added metadata', {'id':doc._id, 'rev':doc._rev, 'tries':result.tries, 'fetches':result.fetches})
    if(result.tries > 1)
      self.log.warn('Multiple updates (conflicts) to store metadata', {'target':self.target, 'tries':result.tries})

    finish('source', {'rev':doc._rev})
  }

  function copy(source, target) {
    var headers = {'destination':self.target.final}
    if(target.rev)
      headers.destination += '?rev=' + target.rev

    self.log.debug('Copying to deployment document', {'source':source_url, 'destination':headers.destination})
    lib.request({'method':'COPY', 'url':source_url, 'json':true, 'headers':headers}, function(er, res) {
      if(er)
        return self.die(er)

      if(res.statusCode != 201 || !res.body.rev)
        return self.die(new Error('Bad couch response ('+res.statusCode+') to copy: ' + JSON.stringify(res.body)))

      self.log.debug('Copied', {'rev':res.body.rev, 'keep_baking_doc':self.keep_baking_doc})
      self.log.info(JSON.stringify({source:source, target:target}))

      if(self.keep_baking_doc)
        return self.deploy_done({'url':target_url, 'rev':res.body.rev})

      // Delete the baking doc.
      lib.request({'method':'DELETE', 'url':source_url+'?rev='+source.rev}, function(er, res) {
        if(er)
          return self.die(er)

        self.log.debug('Deleted baking doc', {'url':source_url, 'rev':source.rev})
        self.deploy_done({'url':target_url, 'rev':res.body.rev})
      })
    })
  }
}


Builder.prototype.stop = function(reason) {
  var self = this

  self.emit('stop', reason)
  self.die()
}

Builder.prototype.die = function(er) {
  var self = this

  self.log.debug('Stopping builder', {'id':self.id})
  self.feed.stop()

  self.dead = true
  self.emit('die', er)
  if(er)
    self.emit('error', er)
}


//
// Utilities
//

function needs_writing(page) {
  return !page.is_loading && !page.is_writing
}

function set_writing(page) {
  page.is_writing = true
}

function in_list(element, list) {
  for(var i = 0; i < list.length; i++)
    if(element === list[i])
      return true
}

function not_in_list(list) {
  return not_filter
  function not_filter(element) {
    return ! in_list(element, list)
  }
}

}) // defaultable
