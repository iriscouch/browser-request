# node-compress-buffer 

A single-step Buffer compression library for Node.js.

## Synopsis

```javascript
	compress = require('compress-buffer').compress;
	uncompress = require('compress-buffer').uncompress;
	
	var rawData = fs.readFileSync("/etc/passwd");

	var compressed   = compress(rawData);
	var uncompressed = uncompress(compressed);

	uncompressed == rawData // true!
```

## Why? 

For the sake of the KISS principle. Most of the time you don't need a streaming compression, you need to compress an existing and already complete data. 

## Options 

<code>compress()</code> takes two arguments: the data (must be a <code>Buffer()</code>) and optional compression level which must be within 1..9. It returns compressed <code>Buffer()</code> or <code>undefined</code> on error.

<code>uncompress()</code> takes a single argument: the data (must be a <code>Buffer()</code>) and returns uncompressed <code>Buffer()</code> or <code>undefined</code> on error.

## Installation

	npm install compress-buffer

or

	npm install .

## Upgrade notice

In version 0.4.1 I removed support for strings compression. It is not possible to correctly determine the encoding of an input string and different encoding yields different results. So for the sake of consistency and reliability this was removed. 

Use the following instead: 

```javascript
	var compressedBuffer = compress(new Buffer("my string"));
```

## License

See LICENSE file. Basically, it's a kind of "do-whatever-you-want-for-free" license.


## Thanks to 

* A lot of thanks for important suggestions goes to Konstantin Käfer who implemented a nice similar module node-zlib (https://github.com/kkaefer/node-zlib) earlier than me.
* Oleg Kertanov.


## Author

Egor Egorov <me@egorfine.com>

