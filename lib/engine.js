var path = require('path');
var roost = require('roost');

// ---

var logger = require(path.join(__dirname, 'logger.js'));
var helpers = require(path.join(__dirname, 'helpers.js'));
var providers = require(path.join(__dirname, 'providers.js'));

// ---

function shell(opt, manifest, provider, name, node, callback) {
	logger.verbose('call provider.shellSpec for node', helpers.q(name));
	
	provider.shellSpec(name, node, function (err, spec) {
		if (err) {
			return callback(err);
		}
		
		logger.debug('shell spec is', spec);
		
		if (!spec.match(/^ssh:/)) {
			return callback(helpers.e('unsupported shell specification', spec));
		}
		
		var connection = new roost.ssh.Connection({meta:{location:manifest.meta.location}});
		
		logger.verbose('connect to node', helpers.q(name));
		
		connection.connect(spec, function (err) {
			if (err) {
				return callback(err);
			}
			
			logger.verbose('shell to node', helpers.q(name));
			
			connection.shell(function (err) {
				if (err) {
					return callback(err);
				}
				
				logger.verbose('disconnect from node', helpers.q(name));
				
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
		return callback(helpers.e('no roost configuration defined'));
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
	
	logger.debug('provision with roost manifest', roostManifest);
	
	var roostPlugins;
	
	try {
		roostPlugins = roost.plugins.obtain(roostManifest);
	} catch (e) {
		return callback(e);
	}
	
	if (roostPlugins.length > 0) {
		logger.debug('roost plugins', roostPlugins);
	}
	
	logger.verbose('call provider.shellSpec for node', helpers.q(name));
	
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
		
		logger.verbose('launch roost for node', helpers.q(name));
		
		try {
			roost.engine.launch({options:{}, argv:[]}, roostManifest, roostPlugins, roostTarget, callback);
		} catch (e) {
			return callback(e);
		}
	});
}

function status(opt, manifest, provider, name, node, callback) {
	logger.verbose('invoke provider.status for node', helpers.q(name));
	
	provider.status(name, node, function (err, state) {
		if (err) {
			return callback(err);
		}
		
		logger.info('node', helpers.q(name), state);
		
		callback(null);
	});
}

function boot(opt, manifest, provider, name, node, callback) {
	logger.verbose('invoke provider.boot for node', helpers.q(name));
	
	provider.boot(name, node, function (err, state) {
		if (err) {
			return callback(err);
		}
		
		logger.verbose('call action provision for node', helpers.q(name));
		
		exports.provision(opt, manifest, provider, name, node, callback);
	});
}

function halt(opt, manifest, provider, name, node, callback) {
	logger.verbose('invoke provider.halt for node', helpers.q(name));
	
	provider.halt(name, node, function (err, state) {
		if (err) {
			return callback(err);
		}
		
		logger.verbose('call action status for node', helpers.q(name));
		
		exports.status(opt, manifest, provider, name, node, callback);
	});
}

function reload(opt, manifest, provider, name, node, callback) {
	logger.verbose('call action halt for node', helpers.q(name));
	
	exports.halt(opt, manifest, provider, name, node, function (err) {
		if (err) {
			return callback(err);
		}
		
		logger.verbose('call action boot for node', helpers.q(name));
		
		exports.boot(opt, manifest, provider, name, node, callback);
	});
}

// ---

function launch(opt, manifest, plugins, provider, action, callback) {
	if (!(action in exports) || action == 'launch') {
		throw helpers.e('action', helpers.q(action), 'is not recognized');
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
		
		exports[action](opt, manifest, map[name].nodeProvider, name, map[name].node, function (err) {
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

exports.shell = shell;
exports.provision = provision;
exports.status = status;
exports.boot = boot;
exports.halt = halt;
exports.reload = reload;

// ---

exports.launch = launch;
