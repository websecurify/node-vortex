var path = require('path');

// ---

var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

function mergeRoost(manifest, configs) {
	if (configs.length == 0) {
		return null;
	}
	
	return configs
		.map(function (config) {
			if (typeof(config) == 'string' || config instanceof String) {
				return roost.manifest.load(path.resolve(path.dirname(manifest.meta.location), config));
			} else {
				return config;
			}
		})
		.reduce(function (previousValue, currentValue, index, array) {
			if (!previousValue) {
				return JSON.parse(JSON.stringify(currentValue));
			}
			
			if (currentValue.hasOwnProperty('merge') && currentValue.merge) {
				return helpers.merge(previousValue, currentValue);
			} else {
				return currentValue;
			}
		}, null);
}

// ---

exports.mergeRoost = mergeRoost;
