var path = require('path');

// ---

var actions = require(path.join(__dirname, 'actions.js'));

// ---

var helpers = {};

// ---

(function (exports) {
	function error(args) {
		if (Array.isArray(args)) {
			return new Error(args.join(' '));
		} else {
			return new Error(Array.prototype.slice.call(arguments).join(' '));
		}
	}
	
	// ---
	
	function quote(input) {
		return JSON.stringify(input);
	}
	
	// ---
	
	function camel(input) {
		return input[0] + input.substring(1, input.length);
	}
	
	// ---
	
	function merge(a, b) {
		Object.keys(b).forEach(function (key) {
			if (a.hasOwnProperty(key)) {
				if (typeof(a[key]) == 'boolean' || a[key] instanceof Boolean) {
					a[key] = b[key];
				} else
				if (typeof(a[key]) == 'number' || a[key] instanceof Number) {
					a[key] = b[key];
				} else
				if (typeof(a[key]) == 'string' || a[key] instanceof String) {
					a[key] = b[key];
				} else
				if (Array.isArray(a[key])) {
					a[key] = a[key].concat(b[key]);
				} else {
					a[key] = arguments.callee(a[key], b[key]);
				}
			} else {
				a[key] = b[key];
			}
		});
		
		return a;
	}
	
	// ---
	
	exports.error = error;
	exports.quote = quote;
	exports.camel = camel;
	exports.merge = merge;
	
	// ---
	
	exports.e = error;
	exports.q = quote;
	exports.c = camel;
	exports.m = merge;
})(helpers);

// ---

function launch(opt, manifest, plugins, provider, action, callback) {
	if (!manifest.hasOwnProperty('meta') || !manifest.meta.hasOwnProperty('location')) {
		throw helpers.e('vortex manifest does not contain meta location property');
	}
	
	if (!(action in actions)) {
		throw helpers.e('action', helpers.q(action), 'is not recognized');
	}
	
	if (!opt) {
		opt = {};
	}
	
	if (!opt.hasOwnProperty('options')) {
		opt.options = {};
	}
	
	if (!opt.hasOwnProperty('argv')) {
		opt.argv = [];
	}
	
	if (!plugins) {
		plugins = [];
	}
	
	plugins.forEach(function (plugin) {
		plugin.vortex(opt, manifest, provider, action);
	});
	
	if (!manifest.hasOwnProperty('nodes')) {
		throw helpers.e('no nodes defined in the vortex manifest');
	}
	
	var shouldIgnore = false;
	
	var selectedNodes = opt.argv.slice(1, opt.argv.length).filter(function (nodeName) {
		if (shouldIgnore) {
			return false;
		} else {
			if (nodeName == '--') {
				shouldIgnore = true;
				
				return false;
			} else {
				return true;
			}
		}
	});
	
	if (selectedNodes.length == 0) {
		selectedNodes = Object.keys(manifest.nodes);
	}
	
	if (selectedNodes.length == 0) {
		throw helpers.e('no nodes selected for action', helpers.q(action));
	}
	
	selectedNodes.forEach(function (nodeName) {
		if (!manifest.nodes.hasOwnProperty(nodeName)) {
			throw helpers.e('node', helpers.q(nodeName), 'does not exist');
		}
	});
	
	var nodeMap = {};
	
	selectedNodes = selectedNodes.filter(function (nodeName) {
		if (nodeMap.hasOwnProperty(nodeName)) {
			return false;
		} else {
			nodeMap[nodeName] = true;
			
			return true;
		}
	});
	
	actions[action](opt, manifest, provider, selectedNodes, callback);
}

// ---

exports.launch = launch;
