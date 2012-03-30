/* node-compress-buffer (C) 2011 Egor Egorov <me@egorfine.com>  */

util = require('util');
fs = require('fs');
crypto=require('crypto');
compress = require('../index').compress;
uncompress = require('../index').uncompress;

function md5(data) {
	var md5=crypto.createHash('md5');
	md5.update(data);
	return md5.digest('hex');
}

var loremIpsum="Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

exports['basic compress']= function(test) {
	test.expect(2);
	var uncompressed = new Buffer(loremIpsum);
	var compressed = compress(uncompressed);
	test.equal(compressed.length,282);
	test.equal(md5(compressed), "6e31946d851b7cab51e058653a16b666");
	test.done();
}

exports['basic uncompress']= function(test) {
	test.expect(2);
	var uncompressed = new Buffer(loremIpsum);
	var compressed = compress(uncompressed);
	uncompressed = uncompress(compressed);
	test.equal(uncompressed.length,loremIpsum.length);
	test.equal(md5(uncompressed), "fa5c89f3c88b81bfd5e821b0316569af");
	test.done();
}

exports['compress with compression levels']= function(test) {
	test.expect(1);
	var uncompressedBuffer = fs.readFileSync(__dirname+"/node-compress-buffer-test.js");
	
	var compressed1 = compress(uncompressedBuffer, 1);
	var compressed9 = compress(uncompressedBuffer, 9);
	test.ok(compressed1.length>compressed9.length);

	test.done();
}

exports['string exceptions']= function(test) {
	test.expect(2);

	test.throws(function() {
		compress(loremIpsum);
	});

	test.throws(function() {
		uncompress(loremIpsum);
	});

	test.done();
}

exports['compress short']= function(test) {
	test.expect(2);
	var buffer, compressed;

	buffer = new Buffer("too short");
	compressed = compress(buffer);
	test.notEqual(compressed,buffer);
	test.notEqual(compressed.length,buffer.length);

	test.done();
}

exports['errors']= function(test) {
	test.expect(2);
	var compressed = compress(new Buffer(""));
	test.ok(compressed.length>=0);
	
	var uncompressed = uncompress(new Buffer(" sfsdcfgdfgsdgfdsgdgdsgdfgsdfgsdfgdfgfsfd "));
	test.ok(!uncompressed);
	
	test.done();
}
