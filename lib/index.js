var path = require('path');

// ---

[
	'actions',
	'amazon',
	'download',
	'engine',
	'helpers',
	'logger',
	'manifest',
	'plugins',
	'providers',
	'virtualbox',
	'utils'
].forEach(function (module) {
	exports[module] = require(path.join(__dirname, module + '.js'));
});
