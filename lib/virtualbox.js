var fs = require('fs');
var url = require('url');
var path = require('path');
var roost = require('roost');
var async = require('async');
var pathExtra = require('path-extra');
var portchecker = require('portchecker');
var childProcess = require('child_process');

// ---

var logger = require(path.join(__dirname, 'logger.js'));
var helpers = require(path.join(__dirname, 'helpers.js'));
var download = require(path.join(__dirname, 'download.js'));

// ---

function locateVBoxManage() {
	var vboxmanagePath;
	
	if (process.platform.match(/^win/)) {
		if (process.env.hasOwnProperty('VBOX_INSTALL_PATH')) {
			vboxmanagePath = process.env.VBOX_INSTALL_PATH.split(path.delimiter).reduce(function (previous, current, index, array) {
				if (previous) {
					return previous;
				}
				
				current = path.join(current, 'VBoxManage.exe');
				
				if (fs.existsSync(current)) {
					return current;
				} else {
					return null;
				}
			}, null);
		}
		
		if (!vboxmanagePath) {
			vboxmanagePath = 'VBoxManage.exe';
		}
	} else
	if (process.platform.match(/^dar/)) {
		vboxmanagePath = '/Applications/VirtualBox.app/Contents/MacOS/VBoxManage';
		
		if (!fs.existsSync(vboxmanagePath)) {
			vboxmanagePath = 'VBoxManage';
		}
	}
	
	if (!vboxmanagePath) {
		vboxmanagePath = 'VBoxManage';
	}
	
	return vboxmanagePath;
}

// ---

function Provider(manifest) {
	this.manifest = manifest;
	
	if (this.manifest.hasOwnProperty('virtualbox') && this.manifest.virtualbox.hasOwnProperty('executionPath')) {
		this.executionPath = this.manifest.virtualbox.executionPath;
	} else {
		this.executionPath = exports.locateVBoxManage();
	}
	
	this.commandQueue = async.queue(function (task, callback) {
		task.run(callback);
	}, 1);
	
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

Provider.prototype.command = function (command, args, callback) {
	var Task = function (executionPath, command, args) {
		this.executionPath = executionPath;
		this.command = command;
		this.args = args;
		this.chunks = [];
		this.code = 0;
	};
	
	Task.prototype.run = function (callback) {
		var self = this;
		
		logger.debug.apply(logger, ['exec', self.executionPath, command].concat(args));
		
		var child = childProcess.spawn(self.executionPath, [self.command].concat(self.args), {});
		
		child.stdout.on('data', function (data) {
			if (['debug', 'silly'].indexOf(logger.level) >= 0) {
				process.stdout.write(data);
			}
			
			self.chunks.push(data);
		});
		
		child.stderr.on('data', function (data) {
			if (['debug', 'silly'].indexOf(logger.level) >= 0) {
				process.stdout.write(data);
			}
		});
		
		child.on('error', function (error) {
			return callback(error);
		});
		
		child.on('close', function (code) {
			self.code = code;
			
			return callback();
		});
	};
	
	if (!Array.isArray(args)) {
		args = Array.prototype.slice.call(arguments);
		command = args.shift();
		callback = args.splice(args.length - 1, args.length)[0];
	}
	
	var task = new Task(this.executionPath, command, args);
	
	this.commandQueue.push(task, function (err) {
		if (err) {
			return callback(err);
		}
		
		return callback(null, task.chunks.join(''), task.code);
	});
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
		
		logger.debug('import', helpers.q(self.src), 'into', helpers.q(self.dst));
		
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
			
			supper.command('import', localPath, '--vsys', '0', '--vmname', self.dst, function (err, output, code) {
				if (err) {
					return callback(err);
				}
				
				if (code > 0) {
					return callback(helpers.e('cannot import', helpers.q(localPath), 'with name', helpers.q(self.dst)));
				}
				
				callback();
			});
		} else {
			var localPath = path.join(pathExtra.tempdir(), (new Date()).getTime() + '-' + path.basename(spec.pathname));
			
			download.get(self.src, localPath, function (err) {
				if (err) {
					fs.unlink(localPath, function (err) {
						if (err) {
							logger.exception(err);
						}
					});
					
					return callback(err);
				}
				
				supper.command('import', localPath, '--vsys', '0', '--vmname', self.dst, function (err, output, code) {
					fs.unlink(localPath, function (err) {
						if (err) {
							logger.exception(err);
						}
					});
					
					if (err) {
						return callback(err);
					}
					
					if (code > 0) {
						return callback(helpers.e('cannot import', helpers.q(localPath), 'into', helpers.q(self.dst)));
					}
					
					callback();
				});
			});
		}
	};
	
	var task = new Task(src, dst);
	
	this.importQueue.push(task, callback);
};

Provider.prototype.rewire = function (callback) {
	var self = this;
	
	var hostonlyif_ipconfig = function (callback) {
		self.command('hostonlyif', 'ipconfig', 'vboxnet0', '--ip', '10.100.100.1', '--netmask', '255.255.255.0', function (err, output, code) {
			if (err) {
				logger.exception(err);
			}
			
			if (code > 0) {
				logger.debug('attempted unsuccessfully to configure network interface for', helpers.q('vboxnet0'));
			}
			
			callback();
		});
	};
	
	var dhcpserver_modify = function (callback) {
		self.command('dhcpserver', 'modify', '--ifname', 'vboxnet0', '--ip', '10.100.100.100', '--netmask', '255.255.255.0', '--lowerip', '10.100.100.101', '--upperip', '10.100.100.254', '--enable', function (err, output, code) {
			if (err) {
				logger.exception(err);
			}
			
			if (code > 0) {
				logger.debug('attempted unsuccessfully to configure dhcp server for', helpers.q('vboxnet0'));
			}
			
			callback();
		});
	};
	
	var dhcpserver_add = function (callback) {
		self.command('dhcpserver', 'add', '--netname', 'vortex', '--ip', '10.200.200.100', '--netmask', '255.255.255.0', '--lowerip', '10.200.200.101', '--upperip', '10.200.200.254', '--enable', function (err, output, code) {
			if (err) {
				logger.exception(err);
			}
			
			if (code > 0) {
				logger.debug('attempted unsuccessfully to add private network', helpers.q('vortex'));
			}
			
			callback();
		});
	};
	
	var dhcpserver_modify = function (callback) {
		self.command('dhcpserver', 'modify', '--netname', 'vortex', '--ip', '10.200.200.100', '--netmask', '255.255.255.0', '--lowerip', '10.200.200.101', '--upperip', '10.200.200.254', '--enable', function (err, output, code) {
			if (err) {
				logger.exception(err);
			}
			
			if (code > 0) {
				logger.debug('attempted unsuccessfully to modify private network', helpers.q('vortex'));
			}
			
			callback();
		});
	};
	
	async.series(
		[
			hostonlyif_ipconfig,
			dhcpserver_modify,
			dhcpserver_add,
			dhcpserver_modify
		],
		function (err, results) {
			if (err) {
				return callback(err);
			}
			
			return callback();
		}
	);
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
	
	node.roost.bootstrap.push('sudo ifconfig eth1 0.0.0.0 0.0.0.0');
	node.roost.bootstrap.push('sudo ifconfig eth2 0.0.0.0 0.0.0.0');
	node.roost.bootstrap.push('sudo dhclient -r eth1 eth2');
	node.roost.bootstrap.push('sudo dhclient eth1 eth2');
	node.roost.bootstrap.push('sleep 10');
	
	if (node.hasOwnProperty('expose')) {
		var self = this;
		
		Object.keys(node.expose).forEach(function (source) {
			var destination = node.expose[source];
			var share = self.share(destination);
			
			node.roost.bootstrap.push('sudo mkdir -p ' + roost.shell.quote(destination));
			node.roost.bootstrap.push('sudo mount.vboxsf ' + roost.shell.quote(share) + ' ' + roost.shell.quote(destination) + ' -o rw');
		});
	}
	
	return callback();
};

Provider.prototype.status = function (nodeName, callback) {
	var self = this;
	
	var extractVmInfo = function (data) {
		var name = null;
		var uuid = null;
		var state = null;
		var nics = {};
		
		data.split('\n').forEach(function (line) {
			var match;
			
			match = line.match(/^Name:\s+(.+?)$/);
			
			if (match) {
				if (!name) {
					name = match[1];
				}
				
				return;
			}
			
			match = line.match(/UUID:\s+(.+?)$/);
			
			if (match) {
				if (!uuid) {
					uuid = match[1];
				}
				
				return;
			}
			
			match = line.match(/State:\s+([\w\s]+).*?$/);
			
			if (match) {
				if (!state) {
					state = match[1];
				}
				
				return;
			}
			
			match = line.match(/^NIC\s+(\d+):\s+MAC:\s+.*?,\s+Attachment:\s+(.*?),/);
			
			if (match) {
				var id = parseInt(match[1]);
				
				if (isNaN(id)) {
					return;
				}
				
				nics[(id - 1).toString()] = match[2];
			}
		});
		
		return {
			name: name,
			uuid: uuid,
			state: state,
			nics: nics
		};
	};
	
	var extractNetworkInfo = function (data) {
		var info = {};
		
		data.split('\n').forEach(function (line) {
			var match = line.match(/^Name:\s+\/VirtualBox\/GuestInfo\/Net\/(\d+)\/(.*?),\s+value:\s*(.*?),/);
			
			if (!match) {
				return;
			}
			
			var index = match[1];
			var path = match[2];
			var value = match[3];
			var tokens = path.split('/');
			var key1 = tokens[0];
			var key2 = tokens[1];
			
			if (!info.hasOwnProperty(index)) {
				info[index] = {};
			}
			
			var iface = info[index];
			
			if (key1) {
				key1 = key1.toLowerCase();
				
				if (!iface.hasOwnProperty(key1)) {
					iface[key1] = {};
				}
				
				if (key2) {
					key2 = key2.toLowerCase();
					
					if (!iface[key1].hasOwnProperty(key2)) {
						iface[key1][key2] = {};
					}
					
					iface[key1][key2] = value.toLowerCase();
				} else {
					iface[key1] = value.toLowerCase();
				}
			}
		});
		
		return info;
	};
	
	var obtainInfo = function (node, callback) {
		var handle = self.handle(node);
		
		self.command('showvminfo', handle, function (err, output, code) {
			if (err) {
				return callback(err);
			}
			
			var info = {};
			
			if (code > 0) {
				info.state = 'stopped';
				
				return callback(null, info);
			}
			
			info = extractVmInfo(output);
			
			if (!info.name) {
				return callback(helpers.e('cannot get machine name for node', helpers.q(node)));
			}
			
			if (!info.uuid) {
				return callback(helpers.e('cannot get machine uuid for node', helpers.q(node)));
			}
			
			if (!info.state) {
				return callback(helpers.e('cannot get machine state for node', helpers.q(node)));
			}
			
			var state;
			
			switch (info.state.trim().toLowerCase()) {
				case 'saved': state = 'running'; break;
				case 'running': state = 'running'; break;
				case 'starting': state = 'booting'; break;
				case 'powered off': state = 'stopped'; break;
				case 'guru meditation': state = 'running'; break;
			}
			
			if (!state) {
				return callback(helpers.e('undefined state for node', helpers.q(node)));
			}
			
			info.state = state;
			
			return callback(null, info);
		});
	};
	
	var completeInfo = function (info, callback) {
		if (!info.name) {
			return callback(null, info);
		}
		
		self.command('guestproperty', 'enumerate', info.name, function (err, output, code) {
			if (err) {
				return callback(err);
			}
			
			if (code > 0) {
				return callback(helpers.e('cannot enumerate vm', info.name));
			}
			
			var networkInfo = extractNetworkInfo(output);
			
			Object.keys(networkInfo).forEach(function (id) {
				var iface = networkInfo[id];
				
				if (!iface.hasOwnProperty('status') || iface.status != 'up') {
					return;
				}
				
				var nic = info.nics[id];
				
				if (!nic) {
					return;
				}
				
				if (nic.match(/^Host-only/)) {
					info.iface = iface;
					
					return;
				}
			});
			
			var address;
			
			if (info.iface) {
				if (info.iface.hasOwnProperty('v4') && info.iface.v4.hasOwnProperty('ip')) {
					address = info.iface.v4.ip;
				} else
				if (info.iface.hasOwnProperty('v6') && info.iface.v6.hasOwnProperty('ip')) {
					address = info.iface.v6.ip;
				} else {
					address = null;
				}
			} else {
				address = null;
			}
			
			if (!address) {
				info.state = 'booting';
			}
			
			if (info.state != 'running') {
				address = null;
			}
			
			info.address = address;
			
			callback(null, info);
		});
	};
	
	async.waterfall(
		[
			function (callback) {
				return callback(null, nodeName);
			},
			
			obtainInfo,
			completeInfo
		],
		function (err, info) {
			if (err) {
				return callback(err);
			}
			
			callback(null, info.state, info.address);
		}
	);
};

Provider.prototype.boot = function (nodeName, callback) {
	var self = this;
	
	var obtainStatus = function (node, callback) {
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
	
	var attempToUnregisterVm = function (node, callback) {
		var handle = self.handle(node);
		
		self.command('unregistervm', handle, '--delete', function (err, output, code) {
			if (err) {
				logger.exception(err);
			}
			
			if (code > 0) {
				logger.debug('cannot unregister vm', helpers.q(handle));
			}
			
			return callback(null, node);
		});
	};
	
	var ensureVmId = function (node, callback) {
		var vmId = self.extractVmId(node);
		
		if (!vmId) {
			return callback(helpers.e('no virtualbox "vmId" paramter specified for node', helpers.q(node)));
		}
		
		self.command('guestproperty', 'enumerate', vmId, function (err, output, code) {
			if (err) {
				return callback(err);
			}
			
			if (code > 0) {
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
			} else {
				return callback(null, node);
			}
		});
	};
	
	var cloneVm = function (node, callback) {
		var vmId = self.extractVmId(node);
		var handle = self.handle(node);
		
		self.command('clonevm', vmId, '--name', handle, '--register', function (err, output, code) {
			if (err) {
				return callback(err);
			}
			
			if (code > 0) {
				return callback(helpers.e('cannot clone', helpers.q(vmId), 'into', helpers.q(handle)));
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
	
	var configureNetworking = function (node, callback) {
		var handle = self.handle(node);
		
		var interfaces = [
			'--nic1', 'hostonly',
			'--hostonlyadapter1', 'vboxnet0',
			'--nic2', 'intnet',
			'--intnet2', 'vortex',
			'--nic3', 'nat'
		];
		
		self.command('modifyvm', [handle].concat(interfaces), function (err, output, code) {
			if (err) {
				return callback(err);
			}
			
			if (code > 0) {
				return callback(helpers.e('cannot modify vm', helpers.q(handle)));
			}
			
			return callback(null, node);
		});
	};
	
	var exposeResources = function (node, callback) {
		var nodeManifest = self.getNodeByName(node);
		
		if (!nodeManifest.hasOwnProperty('expose')) {
			return callback(null, node);
		}
		
		async.eachSeries(
			Object.keys(nodeManifest.expose),
			
			function (source, callback) {
				var sourcePath = path.resolve(path.dirname(self.manifest.meta.location), source);
				
				fs.stat(sourcePath, function (err, stats) {
					if (err) {
						return callback(helpers.e('cannot expose', helpers.q(source), 'because it does not exist'));
					}
					
					if (!stats.isDirectory()) {
						return callback(helpers.e('cannot expose', helpers.q(source), 'because it is not a directory'));
					}
					
					var destination = nodeManifest.expose[source];
					var handle = self.handle(node);
					var share = self.share(destination);
					
					self.command('sharedfolder', 'add', handle, '--hostpath', sourcePath, '--name', share, function (err, output, code) {
						if (err) {
							return callback(err);
						}
						
						if (code > 0) {
							return callback(helpers.e('cannot expose', helpers.q(source), 'to', helpers.q(destination), 'for node', helpers.q(node)));
						}
						
						return callback();
					});
				});
			},
			
			function (err) {
				if (err) {
					return callback(err);
				}
				
				return callback(null, node);
			}
		);
	};
	
	var startVm = function (node, callback) {
		var handle = self.handle(node);
		
		self.command('startvm', handle, '--type', 'headless', function (err, child) {
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
			
			obtainStatus,
			attempToUnregisterVm,
			ensureVmId,
			cloneVm,
			ensureNetworking,
			configureNetworking,
			exposeResources,
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
	
	var obtainStatus = function (node, callback) {
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
	
	var attemptToPoweroffVm = function (node, callback) {
		var handle = self.handle(node);
		
		self.command('controlvm', handle, 'poweroff', function (err, output, code) {
			if (err) {
				logger.exception(err);
			}
			
			if (code > 0) {
				logger.debug('cannot poweroff vm', helpers.q(handle));
			}
			
			return callback(null, node);
		});
	};
	
	var unregisterVm = function (node, callback) {
		var handle = self.handle(node);
		
		self.command('unregistervm', handle, '--delete', function (err, output, code) {
			if (err) {
				return callback(err);
			}
			
			if (code > 0) {
				return callback(helpers.e('cannot unregister vm', helpers.q(handle)));
			}
			
			return callback(null, node);
		});
	};
	
	async.waterfall(
		[
			function (callback) {
				return callback(null, nodeName);
			},
			
			obtainStatus,
			attemptToPoweroffVm,
			unregisterVm
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
				
				logger.debug('repeat check for ssh port open for node', helpers.q(node), 'in', milliseconds, 'milliseconds');
				
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

exports.locateVBoxManage = locateVBoxManage;
exports.Provider = Provider;
