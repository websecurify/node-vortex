var path = require('path');
var async = require('async');
var roost = require('roost');

// ---

var logger = require(path.join(__dirname, 'logger.js'));
var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

function provision(opt, manifest, provider, nodes, callback) {
	var mergeRoost = function (manifest, configs) {
		if (configs.length == 0) {
			return null;
		}
		
		return configs
			.map(function (config) {
				if (typeof(config) == 'string' || config instanceof String) {
					return roost.manifest.load(path.resolve(path.dirname(manifest.meta.location), config));
				} else {
					return config;
				}
			})
			.reduce(function (previousValue, currentValue, index, array) {
				if (!previousValue) {
					return JSON.parse(JSON.stringify(currentValue));
				}
				
				if (currentValue.hasOwnProperty('merge') && currentValue.merge) {
					return helpers.merge(previousValue, currentValue);
				} else {
					return currentValue;
				}
			}, null);
	};
	
	var bootstrap = function (node, callback) {
		provider.bootstrap(node, function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, node);
		});
	};
	
	var configureRoost = function (node, callback) {
		var nodeManifest = manifest.nodes[node];
		var mergeConfigs = [];
		
		if (manifest.hasOwnProperty('roost')) {
			mergeConfigs.push(manifest.roost);
		}
		
		if (nodeManifest.hasOwnProperty('roost')) {
			mergeConfigs.push(nodeManifest.roost);
		}
		
		if (nodeManifest.hasOwnProperty(provider.name) && nodeManifest[provider.name].hasOwnProperty('roost')) {
			mergeConfigs.push(nodeManifest[provider.name].roost);
		}
		
		roost.logger.setGlobalLevel(logger.level);
		roost.logger.setGlobalColorization(logger.colorize);
		
		var roostManifest = mergeRoost(manifest, mergeConfigs);
		
		if (!roostManifest) {
			return callback(helpers.q('no roost configuration defined for node', helpers.q(node)));
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
		
		return callback(null, node, roostManifest, roostPlugins);
	};
	
	var obtainShellSpec = function (node, roostManifest, roostPlugins, callback) {
		provider.shellSpec(node, function (err, spec) {
			if (err) {
				return callback(err);
			}
			
			logger.debug('shell spec is', spec);
			
			return callback(null, node, roostManifest, roostPlugins, spec);
		});
	};
	
	var launchRoost = function (node, roostManifest, roostPlugins, spec, callback) {
		if (!roostManifest.hasOwnProperty('bootstrap')) {
			roostManifest.bootstrap = [];
		}
		
		roostManifest.bootstrap = roostManifest.bootstrap.concat(Object.keys(manifest.nodes)
			.filter(function (key) {
				return key != node;
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
			}));
			
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
			roost.engine.launch(roostOpt, roostManifest, roostPlugins, roostTarget, function (err) {
				if (err) {
					return callback(err);
				}
				
				return callback();
			});
		} catch (e) {
			return callback(e);
		}
	};
	
	var processNode = function (node, callback) {
		logger.info('provision node', helpers.q(node));
		
		async.waterfall(
			[
				function (callback) {
					return callback(null, node);
				},
				
				bootstrap,
				configureRoost,
				obtainShellSpec,
				launchRoost
			],
			function (err, results) {
				if (err) {
					return callback(err);
				}
				
				return callback();
			}
		);
	};
	
	async.each(nodes, processNode, callback);
}

function status(opt, manifest, provider, nodes, callback) {
	var processNode = function (node, callback) {
		logger.verbose('status node', helpers.q(node));
		
		provider.status(node, function (err, state, id, address) {
			if (err) {
				return callback(err);
			}
			
			var args = ['node', helpers.q(node), 'is', state];
			
			if (address) {
				args.push('at');
				args.push(address);
			}
			
			logger.info.apply(logger, args);
			
			return callback();
		});
	};
	
	async.each(nodes, processNode, callback);
}

function boot(opt, manifest, provider, nodes, callback) {
	var processNode = function (node, callback) {
		logger.verbose('boot node', helpers.q(node));
		
		provider.boot(node, function (err, state, id, address) {
			if (err) {
				return callback(err);
			}
			
			var args = ['node', helpers.q(node), 'is', state];
			
			if (address) {
				args.push('at');
				args.push(address);
			}
			
			logger.info.apply(logger, args);
			
			return callback();
		});
	};
	
	async.each(nodes, processNode, callback);
}

function halt(opt, manifest, provider, nodes, callback) {
	var processNode = function (node, callback) {
		logger.verbose('halt node', helpers.q(node));
		
		provider.halt(node, function (err, state, id, address) {
			if (err) {
				return callback();
			}
			
			var args = ['node', helpers.q(node), 'is', state];
			
			if (address) {
				args.push('at');
				args.push(address);
			}
			
			logger.info.apply(logger, args);
			
			return callback();
		});
	};
	
	async.each(nodes, processNode, callback);
}

function reload(opt, manifest, provider, nodes, callback) {
	var halt = function (node, callback) {
		exports.halt(opt, manifest, provider, [node], function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, node);
		});
	};
	
	var boot = function (node, callback) {
		exports.boot(opt, manifest, provider, [node], function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, node);
		});
	};
	
	var processNode = function (node, callback) {
		logger.verbose('reload node', helpers.q(node));
		
		async.waterfall(
			[
				function (callback) {
					return callback(null, node);
				},
				
				halt,
				boot
			],
			function (err, results) {
				if (err) {
					return callback(err);
				}
				
				return callback();
			}
		);
	};
	
	async.each(nodes, processNode, callback);
}

function shell(opt, manifest, provider, nodes, callback) {
	var obtainShellSpec = function (node, callback) {
		provider.shellSpec(node, function (err, spec) {
			if (err) {
				return callback(err);
			}
			
			logger.debug('shell spec is', spec);
			
			if (!spec.match(/^ssh:/i)) {
				return callback(helpers.e('unsupported shell specification', spec));
			}
			
			return callback(null, spec);
		});
	};
	
	var connect = function (spec, callback) {
		var connection = new roost.ssh.Connection({meta:{location:manifest.meta.location}});
		
		connection.connect(spec, function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, connection);
		});
	};
	
	var shell = function (connection, callback) {
		connection.shell(function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, connection);
		});
	};
	
	var disconnect = function (connection, callback) {
		connection.disconnect({}, function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback();
		});
	};
	
	var processNode = function (node, callback) {
		logger.info('shell into node', helpers.q(node));
		
		async.waterfall(
			[
				function (callback) {
					return callback(null, node);
				},
				
				obtainShellSpec,
				connect,
				shell,
				disconnect
			],
			function (err, results) {
				if (err) {
					return callback(err);
				}
				
				return callback();
			}
		);
	};
	
	async.each(nodes, processNode, callback);
}

// ---

exports.provision = provision;
exports.status = status;
exports.boot = boot;
exports.halt = halt;
exports.reload = reload;
exports.shell = shell;
