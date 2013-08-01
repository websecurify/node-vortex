var path = require('path');
var roost = require('roost');

// ---

var utils = require(path.join(__dirname, 'utils.js'));
var logger = require(path.join(__dirname, 'logger.js'));
var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

function provision(opt, manifest, provider, name, node, callback) {
	logger.verbose('provision node', helpers.q(name));
	
	provider.provision(name, node, function (err) {
		if (err) {
			return callback(err);
		}
		
		var mergeConfigs = [];
		
		if (manifest.hasOwnProperty('roost')) {
			mergeConfigs.push(manifest.roost);
		}
		
		if (node.hasOwnProperty('roost')) {
			mergeConfigs.push(node.roost);
		}
		
		if (node.hasOwnProperty(provider.name) && node[provider.name].hasOwnProperty('roost')) {
			mergeConfigs.push(node[provider.name].roost);
		}
		
		roost.logger.setGlobalLevel(logger.level);
		roost.logger.setGlobalColorization(logger.colorize);
		
		var roostManifest = utils.mergeRoost(manifest, mergeConfigs);
		
		if (!roostManifest) {
			return callback(helpers.e('no roost configuration defined for node', helpers.q(name)));
		}
		
		if (mergeConfigs.length > 0 && !roostManifest.hasOwnProperty('meta')) {
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
		
		provider.shellSpec(name, node, function (err, spec) {
			if (err) {
				return callback(err);
			}
			
			logger.debug('shell spec is', spec);
			
			if (manifest.hasOwnProperty('nodes')) {
				if (!roostManifest.hasOwnProperty('bootstrap')) {
					roostManifest.bootstrap = [];
				}
				
				roostManifest.bootstrap = roostManifest.bootstrap.concat(
					Object.keys(manifest.nodes)
						.filter(function (key) {
							return key != name;
						})
						.map(function (key) {
							return {name: key, manifest: manifest.nodes[key]};
						})
						.filter(function (entry) {
							if (entry.manifest.hasOwnProperty('meta') && entry.manifest.meta.hasOwnProperty('address')) {
								return true;
							} else {
								logger.error('node', helpers.q(entry.name), 'does not expose address');
								
								return false;
							}
						})
						.map(function (entry) {
							var n = entry.name;
							var a = entry.manifest.meta.address;
							var q = roost.shell.quote;
							
							return 'sudo mkdir -p /etc/vortex/hosts/; echo ' + q(a) + ' | sudo tee ' + q('/etc/vortex/hosts/' + n);
						})
				);
			} else {
				logger.error('manifest did not contain any nodes when provisioning node', helpers.q(name));
			}
			
			var roostTarget;
			
			try {
				roostTarget = roost.targets.instance(spec, roostManifest);
			} catch (e) {
				return callback(e);
			}
			
			var roostOpt = {
				options: {},
				argv: []
			};
			
			if (opt.options.hasOwnProperty('dry')) {
				roostOpt.options.dry = opt.options.dry;
			}
			
			try {
				roost.engine.launch(roostOpt, roostManifest, roostPlugins, roostTarget, callback);
			} catch (e) {
				return callback(e);
			}
		});
	});
}

function status(opt, manifest, provider, name, node, callback) {
	logger.verbose('status node', helpers.q(name));
	
	provider.status(name, node, function (err, state, id, address) {
		if (err) {
			return callback(err);
		}
		
		var args = ['node', helpers.q(name), 'is', state];
		
		if (address) {
			args.push('at');
			args.push(address);
		}
		
		logger.info.apply(logger, args);
		
		callback();
	});
}

function boot(opt, manifest, provider, name, node, callback) {
	logger.verbose('boot node', helpers.q(name));
	
	provider.boot(name, node, function (err, state, id, address) {
		if (err) {
			return callback(err);
		}
		
		exports.status(opt, manifest, provider, name, node, callback);
	});
}

function halt(opt, manifest, provider, name, node, callback) {
	logger.verbose('halt node', helpers.q(name));
	
	provider.halt(name, node, function (err, state, id, address) {
		if (err) {
			return callback(err);
		}
		
		exports.status(opt, manifest, provider, name, node, callback);
	});
}

function reload(opt, manifest, provider, name, node, callback) {
	logger.verbose('reload node', helpers.q(name));
	
	exports.halt(opt, manifest, provider, name, node, function (err) {
		if (err) {
			return callback(err);
		}
		
		exports.boot(opt, manifest, provider, name, node, callback);
	});
}

function shell(opt, manifest, provider, name, node, callback) {
	logger.verbose('shell into node', helpers.q(name));
	
	provider.shellSpec(name, node, function (err, spec) {
		if (err) {
			return callback(err);
		}
		
		logger.debug('shell spec is', spec);
		
		if (!spec.match(/^ssh:/i)) {
			return callback(helpers.e('unsupported shell specification', spec));
		}
		
		var connection = new roost.ssh.Connection({meta:{location:manifest.meta.location}});
		
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

// ---

exports.provision = provision;
exports.status = status;
exports.boot = boot;
exports.halt = halt;
exports.reload = reload;
exports.shell = shell;
