var path = require('path');
var roost = require('roost');
var nodeExtend = require('node.extend');

// ---

var logger = require(path.join(__dirname, 'logger.js'));
var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

function mergeRoost(args) {
	if (!Array.isArray(args)) {
		args = Array.prototype.slice.call(arguments);
	}
	
	if (args.length == 0) {
		return null;
	}
	/*
	
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
	
	*/
	return args.reduce(function (previousValue, currentValue, index, array) {
		if (!previousValue) {
			return JSON.parse(JSON.stringify(currentValue));
		}
		
		return nodeExtend.extend(previousValue, currentValue);
	}, null);
}

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
	var mergeArgs = [];
	
	if (node.hasOwnProperty(provider.name) && node[provider.name].hasOwnProperty('roost')) {
		mergeArgs.push(node[provider.name].roost);
	}
	
	if (node.hasOwnProperty('roost')) {
		mergeArgs.push(node.roost);
	}
	
	if (manifest.hasOwnProperty('roost')) {
		margeArgs.push(manifest.roost);
	}
	
	roost.logger.setGlobalLevel(logger.level);
	roost.logger.setGlobalColorization(logger.colorize);
	
	var roostManifest = mergeRoost.apply(mergeRoost, mergeArgs);
	
	if (!roostManifest) {
		return callback(helpers.e('no roost configuration defined'));
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
		
		logger.info('node', helpers.q(name), 'is', state);
		
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
			// NOTE: don't handle since we only try to start from a clean state
			logger.exception(err);
			//
		}
		
		logger.verbose('call action boot for node', helpers.q(name));
		
		exports.boot(opt, manifest, provider, name, node, callback);
	});
}

// ---

exports.shell = shell;
exports.provision = provision;
exports.status = status;
exports.boot = boot;
exports.halt = halt;
exports.reload = reload;
