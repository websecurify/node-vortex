var path = require('path');

// ---

var helpers = require(path.join(__dirname, 'helpers.js'));
var actions = require(path.join(__dirname, 'actions.js'));

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
	
	var selectedNodes;
	
	if (opt.argv.length > 1) {
		selectedNodes = opt.argv.slice(1, opt.argv.length);
	} else {
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
	
	actions[action](opt, manifest, provider, selectedNodes, function (err) {
		if (err) {
			return callback(err);
		}
		
		return callback();
	});
}

// ---

exports.launch = launch;
