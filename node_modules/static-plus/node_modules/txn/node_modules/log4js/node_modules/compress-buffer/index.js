try {
	module.exports = require(__dirname+'/build/default/compress-buffer-bindings');
} catch(e) {
	module.exports = require(__dirname+'/build/Release/compress-buffer-bindings');
}

