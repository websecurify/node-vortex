var fs = require('fs');
var url = require('url');
var path = require('path');
var roost = require('roost');
var async = require('async');
var logsmith = require('logsmith');
var pathExtra = require('path-extra');
var vboxmanage = require('vboxmanage');
var portchecker = require('portchecker');
var childProcess = require('child_process');

// ---

var download = require(path.join(__dirname, 'download'));

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

function Provider(manifest) {
	this.manifest = manifest;
	
	var imported = [];
	
	this.importQueue = async.queue(function (task, callback) {
		if (imported.indexOf(task.url) >= 0) {
			return callback();
		}
		
		task.run(function (err) {
			if (err) {
				return callback(err);
			}
			
			imported.push(task.url);
			
			return callback();
		});
	}, 1);
}

// ---

Provider.prototype.getNodeByName = function (nodeName) {
	if (this.manifest.hasOwnProperty('nodes') && this.manifest.nodes.hasOwnProperty(nodeName)) {
		return this.manifest.nodes[nodeName];
	} else {
		throw helpers.e('node', helpers.q(nodeName), 'does not exist');
	}
};

// ---

Provider.prototype.extractPropertyFromNodeByName = function (propertyName, nodeName) {
	var node;
	
	try {
		node = this.getNodeByName(nodeName);
	} catch (e) {
		node = null;
	}
	
	if (node && node.hasOwnProperty('virtualbox') && node.virtualbox.hasOwnProperty(propertyName)) {
		return node.virtualbox[propertyName];
	} else
	if (this.manifest.hasOwnProperty('virtualbox') && this.manifest.virtualbox.hasOwnProperty(propertyName)) {
		return this.manifest.virtualbox[propertyName];
	} else {
		return null;
	}
};

// ---

Provider.prototype.extractVmId = function (nodeName) {
	return this.extractPropertyFromNodeByName('vmId', nodeName);
};

Provider.prototype.extractVmUrl = function (nodeName) {
	return this.extractPropertyFromNodeByName('vmUrl', nodeName);
};

// ---

Provider.prototype.extractUsername = function (nodeName) {
	return this.extractPropertyFromNodeByName('username', nodeName);
};

Provider.prototype.extractPassword = function (nodeName) {
	return this.extractPropertyFromNodeByName('password', nodeName);
};

Provider.prototype.extractPrivateKey = function (nodeName) {
	return this.extractPropertyFromNodeByName('privateKey', nodeName);
};

Provider.prototype.extractPassphrase = function (nodeName) {
	return this.extractPropertyFromNodeByName('passphrase', nodeName);
};

Provider.prototype.extractSshPort = function (nodeName) {
	return this.extractPropertyFromNodeByName('sshPort', nodeName);
};

// ---

Provider.prototype.extractNamespace = function (nodeName) {
	var node = this.getNodeByName(nodeName);
	
	if (node.hasOwnProperty('namespace')) {
		return node.namespace;
	} else
	if (this.manifest.hasOwnProperty('namespace')) {
		return this.manifest.namespace;
	} else {
		return null;
	}
};

// ---

Provider.prototype.share = function (shareName) {
	return shareName.replace(/[^\w]+/, '_').replace(/_+/, '_');
};

// ---

Provider.prototype.import = function (src, dst, callback) {
	var supper = this;
	
	var Task = function (src, dst) {
		this.src = src;
		this.dst = dst;
	};
	
	Task.prototype.run = function (callback) {
		var self = this;
		
		logsmith.debug('import', helpers.q(self.src), 'into', helpers.q(self.dst));
		
		var spec;
		
		try {
			spec = url.parse(self.src);
		} catch (e) {
			return callback(helpers.e('cannot parse url', helpers.q(self.src)));
		}
		
		if (['file:', 'http:', 'https:'].indexOf(spec.protocol) < 0) {
			return callback(helpers.e('unsupported scheme for url', helpers.q(self.src)));
		}
		
		if (spec.protocol == 'file:') {
			var localPath;
			
			if (!spec.host) {
				localPath = spec.pathname;
			} else {
				localPath = path.resolve(path.dirname(self.manifest.meta.location), path.join(spec.host, spec.pathname));
			}
			
			vboxmanage.machine.import(localPath, self.dst, function (err) {
				if (err) {
					return callback(err);
				}
				
				return callback();
			});
		} else {
			var localPath = path.join(pathExtra.tempdir(), (new Date()).getTime() + '-' + path.basename(spec.pathname));
			
			download.get(self.src, localPath, function (err) {
				if (err) {
					fs.unlink(localPath, function (err) {
						if (err) {
							logsmith.exception(err);
						}
					});
					
					return callback(err);
				}
				
				vboxmanage.machine.import(localPath, self.dst, function (err) {
					if (err) {
						return callback(err);
					}
					
					return callback();
				});
			});
		}
	};
	
	var task = new Task(src, dst);
	
	this.importQueue.push(task, callback);
};

Provider.prototype.rewire = function (callback) {
	var config = {
		network: {
			hostonly: {
				vboxnet5: {
					ip: '10.100.100.1',
					netmask: '255.255.255.0',
					
					dhcp: {
						lower_ip: '10.100.100.101',
						upper_ip: '10.100.100.254'
					}
				}
			},
			
			internal: {
				vortex: {
					ip: '10.200.200.1',
					netmask: '255.255.255.0',
					
					dhcp: {
						lower_ip: '10.200.200.101',
						upper_ip: '10.200.200.254'
					}
				}
			}
		}
	};
	
	vboxmanage.setup.system(config, function (err) {
		if (err) {
			return callback(err);
		}
		
		return callback();
	});
};

// ---

Provider.prototype.handle = function (nodeName) {
	var namespace = this.extractNamespace(nodeName);
	
	return (namespace ? namespace + ':' : '') + nodeName;
};

// ---

Provider.prototype.bootstrap = function (nodeName, callback) {
	var node = this.getNodeByName(nodeName);
	
	if (!node.hasOwnProperty('roost')) {
		node.roost = {
			merge: true
		};
	}
	
	if (!node.roost.hasOwnProperty('bootstrap')) {
		node.roost.bootstrap = [];
	}
	
	if (!node.roost.sync) {
		node.roost.sync = {};
	}
	
	node.roost.bootstrap.push('sudo ifconfig eth1 0.0.0.0 0.0.0.0');
	node.roost.bootstrap.push('sudo ifconfig eth2 0.0.0.0 0.0.0.0');
	node.roost.bootstrap.push('sudo dhclient -r eth1 eth2');
	node.roost.bootstrap.push('sudo dhclient eth1 eth2');
	node.roost.bootstrap.push('sleep 10');
	
	if (node.hasOwnProperty('expose')) {
		var self = this;
		
		Object.keys(node.expose).forEach(function (source) {
			var sourcePath = path.resolve(path.dirname(self.manifest.meta.location), source);
			
			fs.stat(sourcePath, function (err, stats) {
				if (err) {
					return callback(helpers.e('cannot expose', helpers.q(source), 'because it does not exist'));
				}
				
				var destination = node.expose[source];
				
				if (stats.isDirectory()) {
					var share = self.share(destination);
					
					node.roost.bootstrap.push('sudo mkdir -p ' + roost.shell.quote(destination));
					node.roost.bootstrap.push('sudo mount.vboxsf ' + roost.shell.quote(share) + ' ' + roost.shell.quote(destination) + ' -o rw');
				} else {
					node.roost.sync[source] = destination;
				}
			});
		});
	}
	
	return callback();
};

Provider.prototype.status = function (nodeName, callback) {
	var self = this;
	
	var obtainMachineState = function (node, callback) {
		var handle = self.handle(node);
		
		vboxmanage.machine.info(handle, function (err, info) {
			if (err) {
				return callback(null, node, 'stopped');
			}
			
			var state = info.VMState.toLowerCase();
			
			switch (state) {
				case 'saved': state = 'running'; break;
				case 'running': state = 'running'; break;
				case 'starting': state = 'booting'; break;
				case 'powered off': state = 'stopped'; break;
				case 'guru meditation': state = 'running'; break;
			}
			
			return callback(null, node, state);
		});
	};
	
	var obtainMachineAddress = function (node, state, callback) {
		var handle = self.handle(node);
		
		vboxmanage.adaptors.list(handle, function (err, adaptors) {
			if (err) {
				return callback(null, node, 'stopped', address);
			}
			
			var address;
			
			try {
				address = adaptors['Adaptor 1'].V4.IP;
			} catch (e) {
				address = null;
				state = 'booting';
			}
			
			return callback(null, node, state, address);
		});
	};
	
	async.waterfall(
		[
			function (callback) {
				return callback(null, nodeName);
			},
			
			obtainMachineState,
			obtainMachineAddress
		],
		function (err, node, state, address) {
			if (err) {
				return callback(err);
			}
			
			callback(null, state, address);
		}
	);
};

Provider.prototype.boot = function (nodeName, callback) {
	var self = this;
	
	var verifyStatus = function (node, callback) {
		self.status(node, function (err, state, address) {
			if (err) {
				return callback(err);
			}
			
			if (state == 'booting') {
				return callback(helpers.e('node', helpers.q(node), 'is already booting'));
			}
			
			if (state == 'running') {
				return callback(helpers.e('node', helpers.q(node), 'is already running'));
			}
			
			if (state == 'halting') {
				return callback(helpers.e('node', helpers.q(node), 'is halting'));
			}
			
			return callback(null, node);
		});
	};
	
	var attempToRemoveVm = function (node, callback) {
		var handle = self.handle(node);
		
		vboxmanage.machine.remove(handle, function (err) {
			if (err) {
				logsmith.exception(err);
			}
			
			return callback(null, node);
		});
	};
	
	var ensureVmId = function (node, callback) {
		var vmId = self.extractVmId(node);
		
		if (!vmId) {
			return callback(helpers.e('no virtualbox "vmId" paramter specified for node', helpers.q(node)));
		}
		
		vboxmanage.machine.info(vmId, function (err, info) {
			if (!err) {
				return callback(null, node);
			}
			
			logsmith.exception(err);
			
			var vmUrl = self.extractVmUrl(node);
			
			if (!vmUrl) {
				return next(helpers.e('no virtualbox "vmUrl" paramter specified for node', helpers.q(node)));
			}
			
			self.import(vmUrl, vmId, function (err) {
				if (err) {
					return callback(err);
				}
				
				return callback(null, node);
			});
		});
	};
	
	var cloneVm = function (node, callback) {
		var vmId = self.extractVmId(node);
		var handle = self.handle(node);
		
		vboxmanage.machine.clone(vmId, handle, function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, node);
		});
	};
	
	var ensureNetworking = function (node, callback) {
		self.rewire(function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, node);
		});
	};
	
	var setupVm = function (node, callback) {
		var handle = self.handle(node);
		
		var config = {
			network: {
				adaptors: [
					{type: 'hostonly', network: 'vboxnet5'},
					{type: 'internal', network: 'vortex'},
					{type: 'nat'}
				]
			},
			
			shares: {}
		};
		
		var nodeManifest = self.getNodeByName(node);
		
		if (nodeManifest.hasOwnProperty('expose')) {
			Object.keys(nodeManifest.expose).forEach(function (key) {
				var source = path.resolve(path.dirname(self.manifest.meta.location), key);
				var destination = nodeManifest.expose[key];
				var share = self.share(destination);
				
				config.shares[share] = source;
			});
		}
		
		vboxmanage.setup.machine(handle, config, function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, node);
		});
	};
	
	var startVm = function (node, callback) {
		var handle = self.handle(node);
		
		vboxmanage.instance.start(handle, function (err) {
			if (err) {
				return callback(err);
			}
			
			return callback(null, node);
		});
	};
	
	async.waterfall(
		[
			function (callback) {
				return callback(null, nodeName);
			},
			
			verifyStatus,
			attempToRemoveVm,
			ensureVmId,
			cloneVm,
			ensureNetworking,
			setupVm,
			startVm
		],
		function (err, node) {
			if (err) {
				return callback(err);
			}
			
			return self.status(node, callback);
		}
	);
};

Provider.prototype.halt = function (nodeName, callback) {
	var self = this;
	
	var verifyStatus = function (node, callback) {
		self.status(node, function (err, state, address) {
			if (err) {
				return callback(err);
			}
			
			if (state == 'halting') {
				return callback(helpers.e('node', helpers.q(node), 'is already halting'));
			}
			
			if (state == 'stopped') {
				return callback(helpers.e('node', helpers.q(node), 'is already stopped'));
			}
			
			return callback(null, node);
		});
	};
	
	var attemptToStopVm = function (node, callback) {
		var handle = self.handle(node);
		
		vboxmanage.instance.stop(handle, function (err) {
			if (err) {
				logsmith.exception(err);
			}
			
			return callback(null, node);
		});
	};
	
	var attemptToRemoveVm = function (node, callback) {
		var handle = self.handle(node);
		
		vboxmanage.machine.remove(handle, function (err) {
			if (err) {
				logsmith.exception(err);
			}
			
			return callback(null, node);
		});
	};
	
	async.waterfall(
		[
			function (callback) {
				return callback(null, nodeName);
			},
			
			verifyStatus,
			attemptToStopVm,
			attemptToRemoveVm
		],
		function (err, node) {
			if (err) {
				return callback(err);
			}
			
			return self.status(node, callback);
		}
	);
};

Provider.prototype.shellSpec = function (nodeName, callback) {
	var self = this;
	
	var configureSpec = function (node, callback) {
		var username = self.extractUsername(node);
		
		if (!username) {
			username = 'vortex';
		}
		
		var password = self.extractPassword(node);
		var privateKey = self.extractPrivateKey(node);
		
		if (!password && !privateKey) {
			return callback(helpers.e('no password or privateKey provided for node', helpers.q(node)));
		}
		
		var passphrase = self.extractPassphrase(node);
		var sshPort = self.extractSshPort(node);
		
		if (sshPort) {
			sshPort = parseInt(sshPort);
			
			if (isNaN(sshPort) || sshPort < 1) {
				return callback(helpers.e('ssh port for node', helpers.q(node), 'is incorrect'));
			}
		} else {
			sshPort = 22;
		}
		
		var spec = {
			username: username,
			password: password,
			privateKey: privateKey,
			passphrase: passphrase,
			sshPort: sshPort
		};
		
		return callback(null, node, spec);
	};
	
	var obtainStatus = function (node, spec, callback) {
		self.status(node, function (err, state, address) {
			if (err) {
				return callback(err);
			}
			
			if (state == 'halting') {
				return callback(helpers.e('node', helpers.q(node), 'is halting'));
			}
			
			if (state == 'stopped') {
				return callback(helpers.e('node', helpers.q(node), 'is stopped'));
			}
			
			if (!address) {
				return callback(helpers.e('cannot find network address for node', helpers.q(node)));
			}
			
			var status = {
				state: state,
				address: address
			}
			
			return callback(null, node, spec, status);
		});
	};
	
	var checkPort = function (node, spec, status, callback) {
		portchecker.isOpen(spec.sshPort, status.address, function (isOpen) {
			if (isOpen) {
				return callback(null, spec, status);
			} else {
				var callee = arguments.callee;
				var milliseconds = 10000;
				
				logsmith.debug('repeat check for ssh port open for node', helpers.q(node), 'in', milliseconds, 'milliseconds');
				
				setTimeout(function () {
					portchecker.isOpen(spec.sshPort, status.address, callee);
				}, milliseconds);
			}
		});
	};
	
	var buildSpec = function (spec, status, callback) {
		var codr = encodeURIComponent;
		var auth = codr(spec.username) + (spec.password ? ':' + codr(spec.password) : '');
		var host = status.address;
		var keys = (spec.privateKey ? ';privateKey=' + codr(spec.privateKey) : '');
		var pass = (spec.passphrase ? ';passphrase=' + codr(spec.passphrase) : '');
		
		spec = 'ssh://' + auth + '@' + host + keys + pass;
		
		return callback(null, spec);
	};
	
	async.waterfall(
		[
			function (callback) {
				return callback(null, nodeName);
			},
			
			configureSpec,
			obtainStatus,
			checkPort,
			buildSpec
		],
		callback
	);
};

// ---

exports.Provider = Provider;
