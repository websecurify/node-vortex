var path = require('path');

// ---

var providers = require(path.join(__dirname, 'providers.js'));

// ---

function launch(manifest, provider, action, plugins) {
	plugins.forEach(function (plugin) {
		plugin.vortex(manifest, provider, action);
	});
	
	if (!manifest.hasOwnProperty('nodes')) {
		return;
	}
	
	Object.keys(manifest.nodes).forEach(function (name) {
		var node = manifest.nodes[name];
		var nodeProvider = provider;
		
		if (!nodeProvider) {
			nodeProvider = node.hasOwnProperty('default_provider') ? node.default_provider : null;
			
			if (nodeProvider) {
				nodeProvider = providers.instance(nodeProvider);
			}
		}
		
		if (!nodeProvider) {
			nodeProvider = manifest.hasOwnProperty('default_provider') ? manifest.default_provider : null;
			
			if (nodeProvider) {
				nodeProvider = providers.instance(nodeProvider);
			}
		}
		
		if (!nodeProvider) {
			nodeProvider = providers.instance('VirtualBox');
		}
		
		if (action in nodeProvider && typeof(nodeProvider[action]) == 'function') {
			nodeProvider[action](name, node, manifest);
		} else {
			throw new Error('action ' + action + ' not found for provider ' + nodeProvider.name);
		}
	});
}

// ---

exports.launch = launch;
