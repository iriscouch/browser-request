# Build utilities for Browser Request
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

require 'erb'

HERE = File.expand_path(File.dirname __FILE__)

BUILD        = "#{HERE}/build"
COMMONJS     = "#{HERE}/build/commonjs"
BROWSER      = "#{HERE}/build/browser"

XHR_SRC      = "#{HERE}/xmlhttprequest/XMLHttpRequest.js"
REQ_SRC      = "#{HERE}/src/request.js"

COMMONJS_TEMPLATE = "#{HERE}/template/browser_to_commonjs.js.erb" # Browser code to CommonJS code
BROWSER_TEMPLATE  = "#{HERE}/template/commonjs_to_browser.js.erb"

task :default => :build

desc "Clean everything"
task :clean do
  rm "-rf", BUILD #, XHR_MAIN
end

desc "Build all package types"
task :build => [:commonjs, :browser] #, :requirejs]

file XHR_SRC do
  puts "ERROR: Cannot find XMLHttpRequest project (git submodule). Try running this:"
  puts
  puts "git submodule update --init --recursive"
  puts
  raise "Cannot find XMLHttpRequest"
end

#
# CommonJS build
#

directory COMMONJS

desc "Build CommonJS modules of Browser Request"
task :commonjs => [ "#{COMMONJS}/xmlhttprequest.js", "#{COMMONJS}/request.js" ] do
  puts "CommonJS build: #{COMMONJS}"
end

file "#{COMMONJS}/request.js" => [ COMMONJS, REQ_SRC ] do |task|
  # The source code is already in CommonJS format.
  cp REQ_SRC, task.name
end

file "#{COMMONJS}/xmlhttprequest.js" => [ COMMONJS, COMMONJS_TEMPLATE, XHR_SRC ] do |task|
  # Convert the "browser" format to CommonJS.
  wrapper = File.new(COMMONJS_TEMPLATE).read
  wrapper = ERB.new wrapper

  content = File.new(XHR_SRC).read

  target = File.new task.name, 'w'
  target.write(wrapper.result binding)
  target.close

  puts "Generated CommonJS-wrapped #{COMMONJS}/xmlhttprequest.js"
end

#
# Browser build
#

directory BROWSER
directory "#{BROWSER}/parts"

desc "Build a traditional, monolothic file for browser applications"
task :browser => [ "#{BROWSER}/request.js" ] do
  puts "Browser build : #{BROWSER}/request.js"
end

file "#{BROWSER}/request.js" => [ BROWSER, "#{BROWSER}/parts/request-only.js", "#{BROWSER}/parts/XMLHttpRequest.js" ] do
  xhr_content = File.new("#{BROWSER}/parts/XMLHttpRequest.js").read
  req_content = File.new("#{BROWSER}/parts/request-only.js").read

  combined = File.new("#{BROWSER}/request.js", 'w')
  combined.write xhr_content
  combined.write "\n"
  combined.write req_content
  combined.close

  puts "Generated monolithic #{BROWSER}/request.js"
end

file "#{BROWSER}/parts/XMLHttpRequest.js" => [ "#{BROWSER}/parts", XHR_SRC ] do |task|
  cp XHR_SRC, task.name
end

file "#{BROWSER}/parts/request-only.js" => [ "#{BROWSER}/parts", BROWSER_TEMPLATE, REQ_SRC ] do |task|
  # Convert the CommonJS file to "browser" format.
  wrapper = File.new(BROWSER_TEMPLATE).read
  wrapper = ERB.new wrapper

  module_name = "request"
  content = File.new(REQ_SRC).read

  target = File.new "#{BROWSER}/parts/request-only.js", 'w'
  target.write(wrapper.result binding)
  target.close

  puts "Generated browser-format #{task.name}"
end

#
# Tagging
#

desc 'Show how to tag a revision'
task :tag do
  puts <<EOT
How to Tag a Release
====================

I do not like generated code being managed by Git. However that is useful
when people download tarballs from GitHub, etc. So the idea is to commit
generated code into a tag, then clean up in a subsequent commit.

 1. Confirm the repo is clean
 2. rake clean && rake
 3. git add -f #{BUILD} && git commit -m "Code release"
 4. ver="vX.Y.Z" # Set this to something.
 5. git tag -a -m "Tag release" "$ver"
 6. git push origin "$ver:/refs/tags/$ver"
 7. npm publish
 8. Edit package.json and bump the version
 9. git rm #{BUILD}
 10. git commit -m 'Working on <new version>'
EOT
end

#
# Helpers
#

def rm(*opts)
  opts.unshift "-v" # Potentially remove this for platforms without rm -v
  sh "rm", *opts
end

def cp(*opts)
  opts.unshift "-v" # Potentially remove this for platforms without cp -v
  sh "cp", *opts
end
