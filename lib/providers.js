var path = require('path');

// ---

var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

var Amazon = require(path.join(__dirname, 'amazon.js')).Provider;
var VirtualBox = require(path.join(__dirname, 'virtualbox.js')).Provider;

// ---

var instances = {};

// ---

function instance(name, manifest) {
	var niceName = name.toLowerCase();
	
	if (!instances.hasOwnProperty(niceName)) {
		if (exports.hasOwnProperty(niceName) && niceName != 'instance') {
			instances[niceName] = new exports[niceName](manifest);
			
			instances[niceName].name = niceName;
		} else {
			throw helpers.e('provider', helpers.q(name), 'is not found');
		}
	}
	
	return instances[niceName];
}

// ---

exports.amazon = Amazon;
exports.virtualbox = VirtualBox;

// ---

exports.Amazon = Amazon;
exports.VirtualBox = VirtualBox;
exports.instance = instance;
