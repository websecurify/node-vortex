var path = require('path');

// ---

[
	'actions',
	'amazon',
	'download',
	'engine',
	'helpers',
	'manifest',
	'plugins',
	'providers',
	'virtualbox'
].forEach(function (module) {
	exports[module] = require(path.join(__dirname, module + '.js'));
});
