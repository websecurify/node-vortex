var path = require('path');

// ---

var providers = require(path.join(__dirname, 'providers.js'));
var logger = require(path.join(__dirname, 'logger.js'));

// ---

function provision(provider, name, node, manifest, next) {
	if (!node.hasOwnProperty('roost')) {
		return next(new Error('no roost configuration defined'));
	}
	
	provider.shellSpec(name, node, function (err, spec) {
		if (err) {
			return next(err);
		}
		
		// TODO: execute roost here
	});
}

function status(provider, name, node, manifest, next) {
	provider.status(name, node, function (err, state) {
		if (err) {
			return next(err);
		}
		
		console.log(name + ':', state);
		
		next(null);
	});
}

function boot(provider, name, node, manifest, next) {
	provider.boot(name, node, function (err, state) {
		if (err) {
			return next(err);
		}
		
		exports.provision(provider, name, node, manifest, next);
	});
}

function halt(provider, name, node, manifest, next) {
	provider.halt(name, node, function (err, state) {
		if (err) {
			return next(err);
		}
		
		exports.status(provider, name, node, manifest, next);
	});
}

function reload(provider, name, node, manifest, next) {
	exports.halt(provider, name, node, manifest, function (err) {
		if (err) {
			return next(err);
		}
		
		exports.boot(provider, name, node, manifest, next);
	});
}

// ---

function launch(manifest, plugins, provider, action) {
	(plugins || []).forEach(function (plugin) {
		plugin.vortex(manifest, provider, action);
	});
	
	if (!(action in exports) || action == 'launch') {
		throw new Error('action ' + action + ' not recognized');
	}
	
	if (!manifest.hasOwnProperty('nodes')) {
		return;
	}
	
	var map = {};
	
	Object.keys(manifest.nodes).forEach(function (name) {
		var node = manifest.nodes[name];
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
	
	Object.keys(map).forEach(function (name) {
		exports[action](map[name].nodeProvider, name, map[name].node, manifest, function (err) {
			if (err) {
				logger.debug(err);
				
				console.error(err.message);
			}
		});
	});
}

// ---

exports.provision = provision;
exports.status = status;
exports.boot = boot;
exports.halt = halt;
exports.reload = reload;
exports.launch = launch;
