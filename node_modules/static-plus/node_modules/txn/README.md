# Transaction: Javascript ACID objects

Transaction (or *Txn*) is a library to load, modify, and commit Javascript objects in atomic, all-or-nothing operations. It comes from internal Iris Couch tooling, inspired by Google [App Engine transactions][app_engine_txn].

Transaction is great for using CouchDB documents as state machines, moving through a workflow in discrete steps.

## Objective

Txn **guarantees** that data modifications either *commit* completely, or *roll back* completely ([MVCC][mvcc]). For roll-backs, Txn automatically and transparently retries the operation a few times until it commits. I like me some transaction and you should too:

1. Write a simple, clear *operation* function to process a chunk of data (Javascript object)
1. Other parts of the program trigger the operation for various objects with various IDs.
1. Operations might accidently run *multiple times*, even *concurrently*, perhaps behaving *unpredictably*, probably *timing out* when web sites go down. In other words, it is working within the real world.
1. No matter. Transaction ensures that, for a given object ID, changes are atomic, consistent, isolated, and durable (ACID guarantees).

## Easy transactions

Install Transaction with NPM

    $ npm install txn

Here's how it works:

```javascript
var txn = require("txn")
  , url = "https://example.iriscouch.com/my_db/my_doc";
  , request = require('request');

txn({uri:url}, change_the_doc, function(error, newDoc) {
  if(error)
    return console.error("Sorry, the change didn't stick: " + error);
  else
    console.log("Yay! The new doc is: " + JSON.stringify(newDoc));
})

function change_the_doc(doc, to_txn) {
  doc.awesome = (doc.type == "teacher") ? true : 'maybe';
  request("http://twitter.com/" + doc.twitter, function(er, resp, body) {
    if(er)
      return to_txn(er);
    doc.twitter_feed = body;
    return to_txn();
  })
}
```

<a name="api"></a>
## API

### Setting default options

Transaction uses [Defaultable][def]. You can set defaults which will always apply. You can also set defaults based on previous defaults.

```javascript
// Global defaults for everything.
var txn = require('txn').defaults({"timestamps":false, "couch":"http://localhost:5984"});

// Specific defaults for different databases. (timestamps and couch from above still apply.)
var user_txn = txn.defaults({"db":"users", "delay":1000, "timeout":45000});
var jobs_txn = txn.defaults({"db":"jobs" , "delay":100 , "create": true});

// Now things look much better.
user_txn({id:"bob"}, do_user, on_user_txn);
jobs_txn({id:"cleanup"}, do_job, on_job_txn);
```

### Basic idea

Transaction helps you *fetch, modify, then store* some JSON. It has a simple call signature, and you can set temporary or permanent defaults (see below).

txn(**request_obj**, **operation_func**, **txn_callback_func**)

### request_obj

The **request_obj** is for Mikeal Rogers's [request][req] module. (Txn uses *request* internally.) Txn supports some additional optional fields in this object.

* Mandatory: Some location of the data. Everything else is optional.
  * *either* **uri** | Location to GET the data and PUT it back. Example: `"https://me:secret@example.iriscouch.com/my_db/my_doc"`
  * *or* broken into parts:
     * **couch** | URI of the CouchDB server. Example: `"https://me:secret@example.iriscouch.com"`
     * **db** | Name of the Couch database. Example: `"my_db"`
     * **id** | ID of the Couch document. Example: `"my_doc"`
* **create** | If `true`, missing documents are considered empty objects, `{}`, passed to the operation. If `false`, missing documents are considered errors, passed to the callback. Newly-created objects will not have a `_rev` field.
* **doc** | Skip the first fetch, assume *doc* is initial data value. Notes:
  * This is useful with `_changes?include_docs=true`
  * The `._id` can substitute for *id* above. Thus, given a `_changes` event, just use `txn({doc:change.doc}, ...)`
  * If there is a conflict, Txn will re-fetch the document as usual! To avoid this, set `max_tries=1`.
  * Not supported by `.defaults()`
* **timestamps** | Automatically add an `updated_at` field when updating and `created_at` when creating. Default: `false`
* **max_tries** | How many times to run the fetch/operation/store cycle before giving up. An MVCC conflict triggers a retry. Default: `5`
* **after** | Milliseconds to postpone the *first* operation. (A random value is a good way to load-balance job consumers). Default: `null` i.e. run immediately
* **delay** | Milliseconds to wait before *retrying* after a conflict. Each retry doubles the wait time. Default: `100`
* **timeout** | Milliseconds to wait for the **operation** to finish. Default: `15000` (15 seconds)
* **log** | Logger object to use. Default is a log4js logger named `txn`.
* **log_level** | Log level cutoff. Default: `info`

For example:

```javascript
{ uri       : "https://me:secret@example.iriscouch.com/_users/org.couchdb.user:bob"
, create    : true          // Use missing doc IDs to create new docs
, timestamps: true          // Automatic created_at and updated_at fields
, timeout   : 5 * 60 * 1000 // Five minutes before assuming the operation failed.
, log_level : "debug"       // Detailed output of what's going on
}
```

### operation_func

This is your primary *worker function* to receive, react-to, and modify the data object. **Txn will wrap this function in fetch/store requests.** If there is an MVCC conflict, **Txn will fetch again, re-run this function, and store again**. If you give this function a name, it will be reflected in Txn's logs. So make it count!

The function receives two parameters.

1. The fetched JSON object, often called **doc**
2. A callback to return processing to Txn, oten called **to_txn**. The callback takes two parameters:
  1. An error object
  2. An optional *replacement object*. If provided, modifications to **doc** are ignored and this object is used instead.

```javascript
function make_a_contestant(user, to_txn) {
  if(! user._rev) {
    // Creating a user.
    user.type = "user";
    user.name = "bob";
    user.roles = [];
  }

  // Demonstrate sending an Error to the transaction callback function.
  if(require("os").hostname() == "staging")
    return to_txn(new Error("Making contestants may not run on the staging server"));

  // People named Joe may not play. Demonstrates sending a replacement object.
  if(user.name == "joe")
    return to_txn(null, {"_deleted": true});

  user.roles.push("contestant");
  if(Math.random() < 0.5)
    user.roles.push("red_team");
  else
    user.roles.push("blue_team");

  return to_txn();
}
```

Note, Txn automatically sets the `_id` and `_rev` fields. The operation function needn't bother.

### txn_callback_func

When Txn is all done, it will run your final callback function with the results.

The callback function receives two parameters:

1. An error object, either from Txn (e.g. too many conflicts, operation timeout, HTTP error) or the one sent by *operation_func*. Txn will set various fields depending on the type of error.
  * `timeout` if the operation function timed out.
  * `conflict` and `tries` if there was an MVCC conflict and the number of retries was exhausted
2. The final committed object.
3. A transaction object with information about the process. Useful fields:
  * `tries`: The number of tries the entire run took (`1` means the operation worked on the first try)
  * `name`: The name of this transaction (your operation function name)

```javascript
function after_txn(error, doc, txr) {
  if(error) {
    console.error("Failed to run transaction after " + txr.tries + " attempts");
    throw error;
  }

  console.log("Transaction success: " + doc._id);

  // Application code continues.
}
```

## Example: account signup

Consider account signup as a stateful workflow:

* **requested** (performed by user): User submits their username and email address
* **emailed** (performed by server): Approved the request and emailed the user
* **confirmed**: (performed by user): User clicked the email link and confirmed signup
* **done**: (performed by server): Initial account is set up and ready to use.

The code:

```javascript
// Usage: signup.js <username>
var txn = require("txn");
var username = process.env.username;
var user_uri = "http://example.iriscouch.com/users/" + username;

// Execute the signup processor and react to what happens.
txn({"uri":user_uri}, process_signup, function(error, newData) {
  if(!error)
    return console.log("Processed " + username + " to state: " + newData.state);

  // These errors can be sent by Txn.
  if(error.timeout)
    return console.log("Gave up after " + error.tries + " conflicts");
  if(error.conflict)
    return console.log("process_signup never completed. Troubleshoot and try again");

  // App-specific errors, made by process_signup below.
  if(error.email)
    return console.log('Failed to email: ' + username);
  if(error.account)
    return console.log('Failed to create account: ' + username);

  throw error; // Unknown error
})

function process_signup(doc, to_txn) {
  if(doc.state == 'requested') {
    if(! valid_request(doc))
      return to_txn(null, {"_deleted":true}); // Return a whole new doc.

    doc.emailed_by = require('os').hostname();
    doc.signup_key = Math.random();
    send_email(doc.email, doc.signup_key, function(error) {
      if(error) {
        error.email = true;
        return to_txn(error); // Roll back
      }
      doc.state = 'emailed';
      return to_txn();
    })
  }

  // If the data is unchanged, Txn will not write to the back-end. This operation is thus read-only.
  else if(doc.state == 'emailed') {
    console.log('Still waiting on user to click email link.');
    return to_txn();
  }

  else if(doc.state == 'confirmed') {
    doc.confirmed_at = new Date;
    create_account(doc.username, function(error) {
      if(error) {
        error.account = true;
        return to_txn(error);
      }
      doc.confirmed_by = require('os').hostname();
      doc.state = 'done';
      return to_txn();
    })
  }
}
```

## Considerations

Transaction is great for job processing, from a CouchDB `_changes` feed for example. Unfortunately, jobs are for *doing stuf* (create an account, save a file, send a tweet) and the useful "stuff" are all side-effects. But Txn only provides atomic *data*. It cannot roll-back side-effects your own code made.

Thus the best Txn functions are [reentrant][reent]: At any time, for any reason, a txn function might begin executing anew, concurrent to the original execution, perhaps with the same input parameters or perhaps with different ones. Either execution path could finish first. (The race loser will be rolled back and re-executed, this time against the winner's updated data.)

[app_engine_txn]: http://code.google.com/appengine/docs/python/datastore/transactions.html
[mvcc]: http://en.wikipedia.org/wiki/Multiversion_concurrency_control
[reent]: http://en.wikipedia.org/wiki/Reentrancy_(computing)
[follow]: https://github.com/iriscouch/follow
[req]: https://github.com/mikeal/request
[def]: https://github.com/iriscouch/defaultable
