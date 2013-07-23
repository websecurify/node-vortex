var path = require('path');
var roost = require('roost');

// ---

var providers = require(path.join(__dirname, 'providers.js'));
var logger = require(path.join(__dirname, 'logger.js'));

// ---

function shell(opt, manifest, provider, name, node, callback) {
	provider.shellSpec(name, node, function (err, spec) {
		if (err) {
			return callback(err);
		}
		
		logger.debug('shell spec is', spec);
		
		if (!spec.match(/^ssh:/)) {
			return callback(new Error('unsupported shell specification: ' + spec));
		}
		
		var connection = new roost.ssh.Connection({meta:{location:manifest.meta.location}});
		
		logger.silly('entering interactive session');
		
		connection.connect(spec, function (err) {
			if (err) {
				return callback(err);
			}
			
			connection.shell(function (err) {
				if (err) {
					return callback(err);
				}
				
				connection.disconnect({}, function (err) {
					if (err) {
						return callback(err);
					}
					
					return callback();
				});
			});
		});
	});
}

function provision(opt, manifest, provider, name, node, callback) {
	if (!node.hasOwnProperty('roost')) {
		return callback(new Error('no roost configuration defined'));
	}
	
	roost.logger.setGlobalLevel(logger.level);
	roost.logger.setGlobalColorization(logger.colorize);
	
	var roostManifest = node.roost;
	
	if (typeof(roostManifest) == 'string' || roostManifest instanceof String) {
		try {
			roostManifest = roost.manifest.load(path.resolve(path.dirname(manifest.meta.location), roostManifest));
		} catch (e) {
			return callback(e);
		}
	} else {
		roostManifest.meta = {
			location: manifest.meta.location
		};
	}
	
	logger.debug('start provision with roost manifest', roostManifest);
	
	var roostPlugins;
	
	try {
		roostPlugins = roost.plugins.obtain(roostManifest);
	} catch (e) {
		return callback(e);
	}
	
	if (roostPlugins.length > 0) {
		logger.debug('loaded roost plugins', roostPlugins);
	} else {
		logger.debug('no roost plugins loaded');
	}
	
	provider.shellSpec(name, node, function (err, spec) {
		if (err) {
			return callback(err);
		}
		
		logger.debug('shell spec is', spec);
		
		var roostTarget;
		
		try {
			roostTarget = roost.targets.instance(spec, roostManifest);
		} catch (e) {
			return callback(e);
		}
		
		try {
			roost.engine.launch({options:{}, argv:[]}, roostManifest, roostPlugins, roostTarget, callback);
		} catch (e) {
			return callback(e);
		}
	});
}

function status(opt, manifest, provider, name, node, callback) {
	provider.status(name, node, function (err, state) {
		if (err) {
			return callback(err);
		}
		
		console.log(name + ':', state);
		
		callback(null);
	});
}

function boot(opt, manifest, provider, name, node, callback) {
	provider.boot(name, node, function (err, state) {
		if (err) {
			return callback(err);
		}
		
		exports.provision(provider, name, node, manifest, callback);
	});
}

function halt(opt, manifest, provider, name, node, callback) {
	provider.halt(name, node, function (err, state) {
		if (err) {
			return callback(err);
		}
		
		exports.status(provider, name, node, manifest, callback);
	});
}

function reload(opt, manifest, provider, name, node, callback) {
	exports.halt(provider, name, node, manifest, function (err) {
		if (err) {
			return callback(err);
		}
		
		exports.boot(provider, name, node, manifest, callback);
	});
}

// ---

function launch(opt, manifest, plugins, provider, action, callback) {
	(plugins || []).forEach(function (plugin) {
		plugin.vortex(opt, manifest, provider, action);
	});
	
	if (!(action in exports) || action == 'launch') {
		throw new Error('action ' + action + ' not recognized');
	}
	
	if (!manifest.hasOwnProperty('nodes')) {
		return callback(null);
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
	
	var notCompleted = 0;
	
	Object.keys(map).forEach(function (name) {
		notCompleted += 1;
		
		exports[action](opt, manifest, map[name].nodeProvider, name, map[name].node, function (err) {
			if (err) {
				return callback(err);
			}
			
			notCompleted -= 1;
			
			if (notCompleted == 0) {
				return callback(null);
			}
		});
	});
}

// ---

exports.shell = shell;
exports.provision = provision;
exports.status = status;
exports.boot = boot;
exports.halt = halt;
exports.reload = reload;
exports.launch = launch;
