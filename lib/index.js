var path = require('path');

// ---

[
	'amazon',
	'download',
	'engine',
	'helpers',
	'logger',
	'manifest',
	'plugins',
	'providers',
	'virtualbox'
].forEach(function (module) {
	exports[module] = require(path.join(__dirname, module + '.js'));
});
