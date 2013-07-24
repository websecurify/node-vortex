var path = require('path');

// ---

var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

var VirtualBox = require(path.join(__dirname, 'virtualbox.js')).Provider;
var Amazon = require(path.join(__dirname, 'amazon.js')).Provider;

// ---

var instances = {};

// ---

function instance(name, manifest) {
	if (!instances.hasOwnProperty(name)) {
		if (exports.hasOwnProperty(name) && name != 'instance') {
			instances[name] = new exports[name](manifest);
			
			instances[name].name = name;
		} else {
			throw helpers.e('provider', helpers.q(name), 'is not found');
		}
	}
	
	return instances[name];
}

// ---

exports.VirtualBox = VirtualBox;
exports.Amazon = Amazon;
exports.instance = instance;
