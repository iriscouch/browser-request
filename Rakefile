# Build utilities for Request for Bro
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
TRADITIONAL  = "#{HERE}/build/browser"

XHR_PLAIN    = "#{HERE}/xmlhttprequest/xmlhttprequest.js"
XHR_MAIN     = "#{COMMONJS}/xmlhttprequest.js"
REQUEST_PLAIN= "#{HERE}/src/request.js"
REQUEST_MAIN = "#{COMMONJS}/request.js"

COMMONJS_TEMPLATE = "#{HERE}/template/commonjs_wrapper.js.erb"

task :default => :build

desc "Clean everything"
task :clean do
  rm "-rf", BUILD #, XHR_MAIN
end

desc "Build all package types"
task :build => [:commonjs, :traditional] #, :requirejs]

#
# CommonJS build
#

directory COMMONJS

desc "Build CommonJS modules of Browser Request"
task :commonjs => [ REQUEST_MAIN, XHR_MAIN ]

file REQUEST_MAIN => [ COMMONJS, REQUEST_PLAIN ] do |task|
  cp REQUEST_PLAIN, task.name
end

file XHR_MAIN => [ COMMONJS, XHR_PLAIN, COMMONJS_TEMPLATE ] do |task|
  wrapper = File.new(COMMONJS_TEMPLATE).read
  js = ERB.new wrapper

  content = File.new(XHR_PLAIN).read

  File.new(task.name, 'w').write(js.result binding)
  puts "Generated wrapped #{File.basename task.name}"
end

#
# Traditional build
#

directory TRADITIONAL

desc "Build a traditional, monolothic file for traditional web applications"
task :traditional => [ "#{TRADITIONAL}/request.js" ]

file "#{TRADITIONAL}/request.js" => [ TRADITIONAL, COMMONJS_TEMPLATE, XHR_PLAIN, REQUEST_PLAIN ] do |task|
  wrapper = File.new(COMMONJS_TEMPLATE).read
  js = ERB.new wrapper

  xhr_content = File.new(XHR_PLAIN).read
  req_content = File.new(REQUEST_PLAIN).read
  content = xhr_content + "\n" + req_content

  File.new(task.name, 'w').write(js.result binding)
  puts "Generated traditional #{File.basename task.name}"
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
