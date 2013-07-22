var path = require('path');

// ---

var providers = require(path.join(__dirname, 'providers.js'));

// ---

function actionStatus(provider, name, node, manifest) {
	provider.status(name, node, function (err, state) {
		if (err) {
			return console.error(err.message);
		}
		
		console.log(name, ':', state);
	});
}

function actionBoot(provider, name, node, manifest) {
	provider.boot(name, node, function (err) {
		if (err) {
			return console.error(err.message);
		}
		
		exports.actionStatus(provider, name, node, manifest);
	});
}

function actionHalt(provier, name, node, manifest) {
	provier.halt(name, node, function (err) {
		if (err) {
			return console.error(err.message);
		}
		
		exports.actionStatus(provider, name, node, manifest);
	});
}

// ---

function launch(manifest, provider, action, plugins) {
	(plugins || []).forEach(function (plugin) {
		plugin.vortex(manifest, provider, action);
	});
	
	var actionName = 'action' + action[0].toUpperCase() + action.substring(1, action.length);
	
	if (!(actionName in exports)) {
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
		exports[actionName](map[name].nodeProvider, name, map[name].node, manifest);
	});
}

// ---

exports.actionStatus = actionStatus;
exports.actionBoot = actionBoot;
exports.actionHalt = actionHalt;
exports.launch = launch;
