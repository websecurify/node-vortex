var path = require('path');
var async = require('async');
var roost = require('roost');
var logsmith = require('logsmith');

// ---

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
		
		var roostManifest = mergeRoost(manifest, mergeConfigs);
		
		if (!roostManifest) {
			return callback(helpers.q('no roost configuration defined for node', helpers.q(node)));
		}
		
		if (mergeConfigs.length > 0 && !roostManifest.hasOwnProperty('meta')) {
			roostManifest.meta = {
				location: manifest.meta.location
			};
		}
		
		var roostPlugins;
		
		try {
			roostPlugins = roost.plugins.obtain(roostManifest);
		} catch (e) {
			return callback(e);
		}
		
		nodeManifest.roost = roostManifest;
		
		return callback(null, node, roostManifest, roostPlugins);
	};
	
	var bootstrapProvider = function (node, roostManifest, roostPlugins, callback) {
		provider.bootstrap(node, function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, node, roostManifest, roostPlugins);
		});
	};
	
	var obtainShellSpec = function (node, roostManifest, roostPlugins, callback) {
		provider.shellSpec(node, function (err, spec) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, node, roostManifest, roostPlugins, spec);
		});
	};
	
	var exposeNodes = function (node, roostManifest, roostPlugins, spec, callback) {
		if (!roostManifest.hasOwnProperty('bootstrap')) {
			roostManifest.bootstrap = [];
		}
		
		roostManifest.bootstrap.push('sudo mkdir -p /etc/vortex/nodes/');
		
		async.map(
			Object.keys(manifest.nodes),
			
			function (node, callback) {
				provider.status(node, function (err, state, address) {
					if (err) {
						return callback(err);
					}
					
					return callback(null, {node: node, address: address})
				});
			},
			
			function (err, results) {
				if (err) {
					return callback(err);
				}
				
				results
					.filter(function (result) {
						return result.node != node;
					})
					.filter(function (result) {
						if (result.address) {
							return true;
						} else {
							logsmith.error('node', helpers.q(result.node), 'does not expose address');
							
							return false;
						}
					})
					.map(function (result) {
						var n = result.node;
						var a = result.address;
						var q = roost.shell.quote;
						
						roostManifest.bootstrap.push('echo ' + q(a) + ' | sudo tee ' + q('/etc/vortex/nodes/' + n));
					});
					
				return callback(null, node, roostManifest, roostPlugins, spec);
			}
		);
	};
	
	var launchRoost = function (node, roostManifest, roostPlugins, spec, callback) {
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
		logsmith.info('provision node', helpers.q(node));
		
		async.waterfall(
			[
				function (callback) {
					return callback(null, node);
				},
				
				configureRoost,
				bootstrapProvider,
				obtainShellSpec,
				exposeNodes,
				launchRoost
			],
			callback
		);
	};
	
	async.each(nodes, processNode, callback);
}

function status(opt, manifest, provider, nodes, callback) {
	var processNode = function (node, callback) {
		logsmith.verbose('status node', helpers.q(node));
		
		provider.status(node, function (err, state, address) {
			if (err) {
				return callback(err);
			}
			
			var args = ['node', helpers.q(node), 'is', state];
			
			if (address) {
				args.push('at');
				args.push(address);
			}
			
			logsmith.info.apply(logsmith, args);
			
			return callback();
		});
	};
	
	async.each(nodes, processNode, callback);
}

function boot(opt, manifest, provider, nodes, callback) {
	var processNode = function (node, callback) {
		logsmith.verbose('boot node', helpers.q(node));
		
		provider.boot(node, function (err, state, address) {
			if (err) {
				logsmith.error(err.message);
				
				return callback();
			}
			
			var args = ['node', helpers.q(node), 'is', state];
			
			if (address) {
				args.push('at');
				args.push(address);
			}
			
			logsmith.info.apply(logsmith, args);
			
			return callback();
		});
	};
	
	async.each(nodes, processNode, callback);
}

function halt(opt, manifest, provider, nodes, callback) {
	var processNode = function (node, callback) {
		logsmith.verbose('halt node', helpers.q(node));
		
		provider.halt(node, function (err, state, address) {
			if (err) {
				logsmith.error(err.message);
				
				return callback();
			}
			
			var args = ['node', helpers.q(node), 'is', state];
			
			if (address) {
				args.push('at');
				args.push(address);
			}
			
			logsmith.info.apply(logsmith, args);
			
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
		logsmith.verbose('reload node', helpers.q(node));
		
		async.waterfall(
			[
				function (callback) {
					return callback(null, node);
				},
				
				halt,
				boot
			],
			callback
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
			
			if (!spec.match(/^ssh:/i)) {
				return callback(helpers.e('unsupported shell specification', spec));
			}
			
			return callback(null, spec);
		});
	};
	
	var connect = function (spec, callback) {
		var connection = new roost.ssh.Connection({meta: {location: manifest.meta.location}});
		
		connection.connect(spec, function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, connection);
		});
	};
	
	var shell = function (connection, callback) {
		var command = opt.argv.slice(opt.argv.indexOf('--') + 1);
		
		if (command.length == opt.argv.length) {
			command = null;
		} else {
			command = command.join(' ');
		}
		
		if (command) {
			connection.exec(command, function (err, stream) {
				if (err) {
					return callback(err);
				}
				
				stream.on('data', function (data) {
					process.stdout.write(data);
				});
				
				stream.on('error', function (err) {
					callback(error);
				});
				
				stream.on('exit', function (code) {
					callback(null, connection);
				});
			});
		} else {
			connection.shell(function (err) {
				if (err) {
					return callback(err);
				}
				
				return callback(null, connection);
			});
		}
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
		logsmith.info('shell into node', helpers.q(node));
		
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
			callback
		);
	};
	
	async.eachSeries(nodes, processNode, callback);
}

// ---

function up(opt, manifest, provider, nodes, callback) {
	var processNode = function (node, callback) {
		provider.status(node, function (err, state, address) {
			if (err) {
				return callback(err);
			}
			
			if (state == 'stopped') {
				provider.boot(node, function (err, state, address) {
					if (err) {
						return callback(err);
					}
					
					var performProvision = function (state, address) {
						if (state == 'running' && address) {
							exports.provision(opt, manifest, provider, [node], callback);
						} else {
							var callee = arguments.callee;
							
							setTimeout(function () {
								provider.status(node, function (err, state, address) {
									if (err) {
										return callback(err);
									}
									
									callee(state, address);
								});
							}, 1000);
						}
					};
					
					performProvision(state, address);
				});
			} else {
				return callback();
			}
		});
	};
	
	async.each(nodes, processNode, callback);
};

function down(opt, manifest, provider, nodes, callback) {
	var processNode = function (node, callback) {
		provider.status(node, function (err, state, address) {
			if (err) {
				return callback(err);
			}
			
			if (state == 'stopped') {
				return callback();
			} else {
				provider.halt(node, callback);
			}
		});
	};
	
	async.each(nodes, processNode, callback);
};

// ---

function shellspec(opt, manifest, provider, nodes, callback) {
	var processNode = function (node, callback) {
		provider.shellSpec(node, function (err, spec) {
			if (err) {
				return callback(err);
			}
			
			console.log(node, spec);
			
			return callback(null, spec);
		});
	};
	
	async.eachSeries(nodes, processNode, callback);
};

// ---

exports.provision = provision;
exports.status = status;
exports.boot = boot;
exports.halt = halt;
exports.reload = reload;
exports.shell = shell;

// ---

exports.up = up;
exports.down = down;

// ---

exports.shellspec = shellspec;
