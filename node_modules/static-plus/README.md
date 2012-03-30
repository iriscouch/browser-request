# Static web site and web application builder

Static+ builds web sites from a data stream and some HTML templates.

It can deploy the site as files in your filesystem, an S3 or CloudFront site, or from CouchDB.

## Is it any good?

Yes.

## Usage

Install it from NPM

    npm install -g static-plus

Point it at a CouchDB database

    static+ http://me:secret@example.iriscouch.com/my_db

## Roadmap

Static+ is an evented API and a command-line tool. It does three things:

1. Let you drop in some templates, point it at a changes feed, and it spits out web pages.
2. Deploy those web pages to places. Goals, in order:
   1. A directory in a filesystem
   2. S3. Just CNAME your domain there and you're done
   3. CouchDB attachments, **plus** access to the Couch API
3. Watch the changes feed and re-deploy when appropriate

The directory and S3 deployment are straightforward.

The Couch deployment is the "plus" part.

* Fast. No shows, no lists, no views. No rewrites. Every request is a static download from an attachment.
* Push to a staging URL for QA, promote into production with an atomic transaction
* Two paths are an exception: `/db` and `/couch` which hit the DB api and the couch API respectively.
* [request.jquery.js][rj] is there for you, of course.

## License

Apache 2.0

[rj]: https://github.com/iriscouch/request_jquery
