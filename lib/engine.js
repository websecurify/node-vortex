var path = require('path');

// ---

var logger = require(path.join(__dirname, 'logger.js'));
var helpers = require(path.join(__dirname, 'helpers.js'));
var actions = require(path.join(__dirname, 'actions.js'));
var providers = require(path.join(__dirname, 'providers.js'));

// ---

function launch(opt, manifest, plugins, provider, action, callback) {
	if (!manifest.hasOwnProperty('meta') || !manifest.meta.hasOwnProperty('location')) {
		throw helpers.e('vortex manifest is invalid');
	}
	
	manifest.meta.nodes = [];
	
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
		logger.debug('no nodes defined');
		
		return callback(null);
	}
	
	var nodes = manifest.nodes;
	var names = (opt.argv.length > 1 ? opt.argv.slice(1, opt.argv.length) : Object.keys(nodes));
	var map = {};
	
	names.forEach(function (name) {
		if (!nodes.hasOwnProperty(name)) {
			throw helpers.e('node', helpers.q(name), 'does not exist');
		}
		
		manifest.meta.nodes.push(name);
		
		var node = nodes[name];
		var nodeProvider = provider;
		
		if (!nodeProvider) {
			nodeProvider = node.hasOwnProperty('default_provider') ? node.default_provider : null;
			
			if (nodeProvider) {
				nodeProvider = providers.instance(nodeProvider, manifest);
			}
		}
		
		if (!nodeProvider) {
			nodeProvider = manifest.hasOwnProperty('default_provider') ? manifest.default_provider : null;
			
			if (nodeProvider) {
				nodeProvider = providers.instance(nodeProvider, manifest);
			}
		}
		
		if (!nodeProvider) {
			nodeProvider = providers.instance('VirtualBox', manifest);
		}
		
		map[name] = {
			nodeProvider: nodeProvider,
			node: node
		};
	});
	
	var notCompleted = 0;
	
	Object.keys(map).forEach(function (name) {
		notCompleted += 1;
		
		actions[action](opt, manifest, map[name].nodeProvider, name, map[name].node, function (err) {
			if (err) {
				return callback(err);
			}
			
			notCompleted -= 1;
			
			if (notCompleted == 0) {
				return callback();
			}
		});
	});
}

// ---

exports.launch = launch;
