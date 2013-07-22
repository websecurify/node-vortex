var path = require('path');

// ---

var providers = require(path.join(__dirname, 'providers.js'));

// ---

function status(provider, name, node, manifest) {
	provider.status(name, node, function (err, state) {
		if (err) {
			return console.error(err.message);
		}
		
		console.log(name + ':', state);
	});
}

function boot(provider, name, node, manifest) {
	provider.boot(name, node, function (err, state) {
		if (err) {
			return console.error(err.message);
		}
		
		exports.status(provider, name, node, manifest);
	});
}

function halt(provider, name, node, manifest) {
	provider.halt(name, node, function (err, state) {
		if (err) {
			return console.error(err.message);
		}
		
		exports.status(provider, name, node, manifest);
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
		exports[action](map[name].nodeProvider, name, map[name].node, manifest);
	});
}

// ---

exports.status = status;
exports.boot = boot;
exports.halt = halt;
exports.launch = launch;
