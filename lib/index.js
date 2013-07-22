var path = require('path');

// ---

[
	'amazon',
	'engine',
	'logger',
	'manifest',
	'plugins',
	'providers',
	'virtualbox'
].forEach(function (module) {
	exports[module] = require(path.join(__dirname, module + '.js'));
});
