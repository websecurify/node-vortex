fs = require 'fs'
path = require 'path'
async = require 'async'
roost = require 'roost'
logsmith = require 'logsmith'

# ---

shell = require './shell'

# ---

`
// ---

var helpers = {};

// ---

(function (exports) {
	function error(args) {
		if (Array.isArray(args)) {
			return new Error(args.join(' '));
		} else {
			return new Error(Array.prototype.slice.call(arguments).join(' '));
		}
	}
	
	// ---
	
	function quote(input) {
		return JSON.stringify(input);
	}
	
	// ---
	
	function camel(input) {
		return input[0] + input.substring(1, input.length);
	}
	
	// ---
	
	function merge(a, b) {
		Object.keys(b).forEach(function (key) {
			if (a.hasOwnProperty(key)) {
				if (typeof(a[key]) == 'boolean' || a[key] instanceof Boolean) {
					a[key] = b[key];
				} else
				if (typeof(a[key]) == 'number' || a[key] instanceof Number) {
					a[key] = b[key];
				} else
				if (typeof(a[key]) == 'string' || a[key] instanceof String) {
					a[key] = b[key];
				} else
				if (Array.isArray(a[key])) {
					a[key] = a[key].concat(b[key]);
				} else {
					a[key] = arguments.callee(a[key], b[key]);
				}
			} else {
				a[key] = b[key];
			}
		});
		
		return a;
	}
	
	// ---
	
	exports.error = error;
	exports.quote = quote;
	exports.camel = camel;
	exports.merge = merge;
	
	// ---
	
	exports.e = error;
	exports.q = quote;
	exports.c = camel;
	exports.m = merge;
})(helpers);

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
		provider.shell_spec(node, function (err, spec) {
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


function shell(opt, manifest, provider, nodes, callback) {
	var obtainShellSpec = function (node, callback) {
		provider.shell_spec(node, function (err, spec) {
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

exports.provision = provision;
exports.shell = shell;
`

# ---

exports.status = (opt, manifest, provider, node_names, callback) ->
	###
	This action obtains the status of nodes.
	###
	process_node = (node_name, callback) ->
		logsmith.verbose "query status for node #{node_name}"
		
		provider.status node_name, (err, state, address) ->
			return callback err if err
			
			args = ['node', node_name, 'is', state]
			
			if address
				args.push 'at'
				args.push address
				
			logsmith.info args...
			
			return callback null
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.boot = (opt, manifest, provider, node_names, callback) ->
	###
	This action boots nodes.
	###
	process_node = (node_name, callback) ->
		logsmith.verbose "halt node #{node_name}"
		
		provider.boot node_name, (err, state, address) ->
			logsmith.error err.message if err
			
			return callback null if err
			
			args = ['node', node_name, 'is', state]
			
			if address
				args.push 'at'
				args.push address
				
			logsmith.info args...
			
			return callback null
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.halt = (opt, manifest, provider, node_names, callback) ->
	###
	This action halts nodes.
	###
	process_node = (node_name, callback) ->
		logsmith.verbose "halt node #{node_name}"
		
		provider.halt node_name, (err, state, address) ->
			logsmith.error err.message if err
			
			return callback null if err
			
			args = ['node', node_name, 'is', state]
			
			if address
				args.push 'at'
				args.push address
				
			logsmith.info args...
			
			return callback null
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.restart = (opt, manifest, provider, node_names, callback) ->
	###
	This action chains actions halt and then boot for every node.
	###
	actions = []
	
	actions.push (node_name, callback) ->
		exports.halt opt, manifest, provider, [node_name], (err) ->
			return callback err if err
			return callback null, node_name
			
	actions.push (node_name, callback) ->
		exports.boot opt, manifest, provider, [node_name], (err) ->
			return callback err if err
			return callback null, node_name
			
	process_node = (node_name, callback) ->
		logsmith.verbose "restart node #{node_name}"
		
		current_actions = [((callback) -> callback null, node_name), actions...]
		
		async.waterfall current_actions, callback
		
	async.eachSeries node_names, process_node, callback
	
# ---

exports.up = (opt, manifest, provider, node_names, callback) ->
	###
	This action will bring up a node by first booting it and than starting the provisioning process.
	###
	process_node = (node_name, callback) ->
		provider.status node_name, (err, state, address) ->
			return callback err if err
			
			if state == 'stopped'
				provider.boot node_name, (err, state, address) ->
					return callback err if err
					
					perform_provision = (state, address) ->
						if  state == 'running' and address
							exports.provision opt, manifest, provider, [node_name], callback
						else
							callee = arguments.callee
							
							timeout_handler = () ->
								provider.status node_name, (err, state, address) ->
									return callback err if err
									return callee state, address
									
							setTimeout timeout_handler, 1000
							
					perform_provision state, address
			else
				return callback null
				
	async.eachSeries node_names, process_node, callback
	
# ---

exports.down = (opt, manifest, provider, node_names, callback) ->
	###
	This action will bring down a node. This is esentially a wrapper around the halt action.
	###
	process_node = (node_name, callback) ->
		provider.status node_name, (err, state, address) ->
			return callback err if err
			return callback null if state == 'stopped'
			
			provider.halt node_name, callback
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.reload = (opt, manifest, provider, node_names, callback) ->
	###
	This action chains actions down and then up for every node.
	###
	actions = []
	
	actions.push (node_name, callback) ->
		exports.down opt, manifest, provider, [node_name], (err) ->
			return callback err if err
			return callback null, node_name
			
	actions.push (node_name, callback) ->
		exports.up opt, manifest, provider, [node_name], (err) ->
			return callback err if err
			return callback null, node_name
			
	process_node = (node_name, callback) ->
		logsmith.verbose "reload node #{node_name}"
		
		current_actions = [((callback) -> callback null, node_name), actions...]
		
		async.waterfall current_actions, callback
		
	async.eachSeries node_names, process_node, callback
	
# ---

exports.shellspec = (opt, manifest, provider, node_names, callback) ->
	###
	This action output the shell spec of a node using the selected provider.
	###
	process_node = (node_name, callback) ->
		provider.shell_spec node_name, (err, spec) ->
			return callback err if err
			
			logsmith.info node_name, '->', spec
			
			return callback null, spec
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.shell =  (opt, manifest, provider, node_names, callback) ->
	###
	This action start a shell or executes a command on nodes.
	###
	actions = []
	
	actions.push (node_name, callback) ->
		provider.shell_spec node_name, (err, spec) ->
			return callback err if err
			return callback new Error "unsupported shell spec #{spec}" if not spec.match /^ssh:/i
			return callback null, spec
			
	actions.push (spec, callback) ->
		ssh = new shell.Ssh spec, manifest
		command = opt.argv.slice opt.argv.indexOf('--') + 1
		
		if command.length == opt.argv.length
			command = null
		else
			command = command.join(' ')
			
		if command
			ssh.exec command
		else
			do ssh.shell
			
		ssh.ignite false, (err) ->
			return callback err if err
			return callback null
			
	process_node = (node_name, callback) ->
		logsmith.info "shell into node #{node_name}"
		
		current_actions = [((callback) -> callback null, node_name), actions...]
		
		async.waterfall current_actions, callback
		
	async.eachSeries node_names, process_node, callback
	
