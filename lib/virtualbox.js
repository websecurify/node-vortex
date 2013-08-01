var fs = require('fs');
var url = require('url');
var path = require('path');
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
	this.executionPath = this.extractProperty('executionPath');
	
	if (!this.executionPath) {
		this.executionPath = exports.locateVBoxManage();
	}
	
	this.activeImports = {};
}

// ---

Provider.prototype.extractProperty = function (name, source) {
	if (source && source.hasOwnProperty('virtualbox') && source.virtualbox.hasOwnProperty(name)) {
		return source.virtualbox[name];
	} else
	if (this.manifest.hasOwnProperty('virtualbox') && this.manifest.virtualbox.hasOwnProperty(name)) {
		return this.manifest.virtualbox[name];
	} else {
		return null;
	}
};

// ---

Provider.prototype.extractVmId = function (source) {
	return this.extractProperty('vmId', source);
};

Provider.prototype.extractVmUrl = function (source) {
	return this.extractProperty('vmUrl', source);
};

// ---

Provider.prototype.extractUsername = function (source) {
	return this.extractProperty('username', source);
};

Provider.prototype.extractPassword = function (source) {
	return this.extractProperty('password', source);
};

Provider.prototype.extractPrivateKey = function (source) {
	return this.extractProperty('privateKey', source);
};

Provider.prototype.extractPassphrase = function (source) {
	return this.extractProperty('passphrase', source);
};

Provider.prototype.extractSshPort = function (source) {
	return this.extractProperty('sshPort', source);
};

// ---

Provider.prototype.spawn = function (command, args, callback) {
	if (!Array.isArray(args)) {
		args = Array.prototype.slice.call(arguments);
		command = args.shift();
		callback = args.splice(args.length - 1, args.length)[0];
	}
	
	logger.debug.apply(logger, ['spawn', this.executionPath, command].concat(args));
	
	var child = childProcess.spawn(this.executionPath, [command].concat(args), {detached: true});
	
	return callback(null, child);
};

Provider.prototype.exec = function (command, args, callback) {
	if (!Array.isArray(args)) {
		args = Array.prototype.slice.call(arguments);
		command = args.shift();
		callback = args.splice(args.length - 1, args.length)[0];
	}
	
	logger.debug.apply(logger, ['exec', this.executionPath, command].concat(args));
	
	var child = childProcess.spawn(this.executionPath, [command].concat(args), {});
	var chunks = [];
	
	child.stdout.on('data', function (data) {
		if (['debug', 'silly'].indexOf(logger.level) >= 0) {
			process.stdout.write(data);
		}
		
		chunks.push(data);
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
		return callback(null, chunks.join(''), code);
	});
};

// ---

Provider.prototype.import = function (vmUrl, vmId, callback) {
	var self = this;
	
	logger.debug('import url', helpers.q(vmUrl), 'into vmId', helpers.q(vmId));
	
	if (self.activeImports.hasOwnProperty(vmUrl)) {
		var milliseconds = 10000;
		
		setTimeout(function () {
			if (self.activeImports.hasOwnProperty(vmUrl) && self.activeImports[vmUrl]) {
				setTimeout(arguments.callee, milliseconds);
				
				return;
			} else {
				callback();
			}
		}, milliseconds);
		
		return;
	} else {
		self.activeImports[vmUrl] = true;
	}
	
	callback = (function (callback) {
		return function () {
			delete self.activeImports[vmUrl];
			
			return callback.apply(callback, arguments);
		};
	})(callback);
	
	var spec;
	
	try {
		spec = url.parse(vmUrl);
	} catch (e) {
		return callback(helpers.e('cannot parse url', helpers.q(vmUrl)));
	}
	
	if (['file:', 'http:', 'https:'].indexOf(spec.protocol) < 0) {
		return callback(helpers.e('unsupported scheme for url', helpers.q(vmUrl)));
	}
	
	if (spec.protocol == 'file:') {
		var vmPath;
		
		if (!spec.host) {
			vmPath = spec.pathname;
		} else {
			vmPath = path.resolve(path.dirname(self.manifest.meta.location), path.join(spec.host, spec.pathname));
		}
		
		self.exec('import', vmPath, '--vsys', '0', '--vmname', vmId, function (err, output, code) {
			if (err) {
				return callback(err);
			}
			
			if (code > 0) {
				return callback(helpers.e('cannot import', helpers.q(vmPath), 'with name', helpers.q(vmId)));
			}
			
			callback();
		});
	} else {
		var vmPath = path.join(pathExtra.tempdir(), (new Date()).getTime() + '-' + path.basename(spec.pathname));
		
		download.get(vmUrl, vmPath, function (err) {
			if (err) {
				fs.unlink(vmPath, function (err) {
					if (err) {
						// NOTE: don't care if this operation will fail
						logger.exception(err);
						//
					}
				});
				
				return callback(helpers.e('cannot download', helpers.q(vmUrl), 'for vmId', helpers.q(vmId)));
			}
			
			self.exec('import', vmPath, '--vsys', '0', '--vmname', vmId, function (err, output, code) {
				fs.unlink(vmPath, function (err) {
					if (err) {
						// NOTE: don't care if this operation will fail
						logger.exception(err);
						//
					}
				});
				
				if (err) {
					return callback(err);
				}
				
				if (code > 0) {
					return callback(helpers.e('cannot import', helpers.q(vmPath), 'with name', helpers.q(vmId)));
				}
				
				callback();
			});
		});
	}
};

// ---

Provider.prototype.getNiceName = function (name, node) {
	var namespace;
	
	if (node.hasOwnProperty('namespace')) {
		namespace = node.namespace;
	} else
	if (this.manifest.hasOwnProperty('namespace')) {
		namespace = this.manifest.namespace;
	}
	
	return (namespace ? namespace + ':' : '') + name;
};

// ---

Provider.prototype.renetwork = function (name, node, callback) {
	var self = this;
	
	self.exec('hostonlyif', 'ipconfig', 'vboxnet0', '--ip', '10.100.100.1', '--netmask', '255.255.255.0', function (err, output, code) {
		if (err) {
			logger.exception(err);
		}
		
		if (code > 0) {
			logger.debug('attempted unsuccessfully to configure network interface for', helpers.q('vboxnet0'));
		}
		
		self.exec('dhcpserver', 'modify', '--ifname', 'vboxnet0', '--ip', '10.100.100.100', '--netmask', '255.255.255.0', '--lowerip', '10.100.100.101', '--upperip', '10.100.100.254', '--enable', function (err, output, code) {
			if (err) {
				logger.exception(err);
			}
			
			if (code > 0) {
				logger.debug('attempted unsuccessfully to configure dhcp server for', helpers.q('vboxnet0'));
			}
			
			self.exec('dhcpserver', 'add', '--netname', 'vortex', '--ip', '10.200.200.100', '--netmask', '255.255.255.0', '--lowerip', '10.200.200.101', '--upperip', '10.200.200.254', '--enable', function (err, output, code) {
				if (err) {
					logger.exception(err);
				}
				
				if (code > 0) {
					logger.debug('attempted unsuccessfully to add private network', helpers.q('vortex'));
				}
				
				self.exec('dhcpserver', 'modify', '--netname', 'vortex', '--ip', '10.200.200.100', '--netmask', '255.255.255.0', '--lowerip', '10.200.200.101', '--upperip', '10.200.200.254', '--enable', function (err, output, code) {
					if (err) {
						logger.exception(err);
					}
					
					if (code > 0) {
						logger.debug('attempted unsuccessfully to modify private network', helpers.q('vortex'));
					}
					
					callback();
				});
			});
		});
	});
};

// ---

Provider.prototype.provision = function (name, node, callback) {
	if (!node.hasOwnProperty('roost')) {
		node.roost = {
			merge: true
		};
	}
	
	if (!node.roost.hasOwnProperty('bootstrap')) {
		node.roost.bootstrap = [];
	}
	
	node.roost.bootstrap.push('sudo ifconfig eth1 0.0.0.0 0.0.0.0 && sudo ifconfig eth2 0.0.0.0 0.0.0.0 && sudo dhclient');
	node.roost.bootstrap.push('sleep 10');
	
	return callback();
};

Provider.prototype.status = function (name, node, callback) {
	var self = this;
	
	logger.debug('get status for node', helpers.q(name), node);
	
	self.exec('showvminfo', self.getNiceName(name, node), function (err, output, code) {
		if (err) {
			return callback(err);
		}
		
		if (code > 0) {
			return callback(null, 'stopped');
		}
		
		var vmName;
		var vmUuid;
		var vmState;
		
		var vmNicks = {};
		
		output.split('\n').forEach(function (line) {
			var match;
			
			match = line.match(/^Name:\s+(.+?)$/);
			
			if (match) {
				if (!vmName) {
					vmName = match[1];
				}
				
				return;
			}
			
			match = line.match(/UUID:\s+(.+?)$/);
			
			if (match) {
				if (!vmUuid) {
					vmUuid = match[1];
				}
				
				return;
			}
			
			match = line.match(/State:\s+([\w\s]+).*?$/);
			
			if (match) {
				if (!vmState) {
					vmState = match[1];
				}
				
				return;
			}
			
			match = line.match(/^NIC\s+(\d+):\s+MAC:\s+.*?,\s+Attachment:\s+(.*?),/);
			
			if (match) {
				var id = parseInt(match[1]);
				
				if (isNaN(id)) {
					return;
				}
				
				vmNicks[(id - 1).toString()] = match[2];
			}
		});
		
		if (!vmName) {
			return callback(helpers.e('cannot get machine name for node', helpers.q(name)));
		}
		
		if (!vmUuid) {
			return callback(helpers.e('cannot get machine uuid for node', helpers.q(name)));
		}
		
		if (!vmState) {
			return callback(helpers.e('cannot get machine state for node', helpers.q(name)));
		}
		
		var state;
		
		switch (vmState.trim().toLowerCase()) {
			case 'saved': state = 'running'; break;
			case 'running': state = 'running'; break;
			case 'powered off': state = 'stopped'; break;
		}
		
		if (!state) {
			return callback(helpers.e('undefined state for node', helpers.q(name)));
		}
		
		logger.debug('node', helpers.q(name), 'with uuid', helpers.q(vmUuid), 'has state', helpers.q(state));
		
		self.exec('guestproperty', 'enumerate', self.getNiceName(name, node), function (err, output, code) {
			if (err) {
				return callback(err);
			}
			
			if (code > 0) {
				return callback(helpers.e('cannot enumerate', helpers.q(vmId), 'with name', helpers.q(niceName)));
			}
			
			var ifaces = {};
			
			output.split('\n').forEach(function (line) {
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
				
				if (!ifaces.hasOwnProperty(index)) {
					ifaces[index] = {};
				}
				
				var iface = ifaces[index];
				
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
			
			var selectedIface;
			
			Object.keys(ifaces).forEach(function (id) {
				var iface = ifaces[id];
				
				if (!iface.hasOwnProperty('status') || iface.status != 'up') {
					return;
				}
				
				var nick = vmNicks[id];
				
				if (!nick) {
					return;
				}
				
				if (nick.match(/^Host-only/)) {
					selectedIface = iface;
					
					return;
				}
			});
			
			var address;
			
			if (selectedIface) {
				if (selectedIface.hasOwnProperty('v4') && selectedIface.v4.hasOwnProperty('ip')) {
					address = selectedIface.v4.ip;
				} else
				if (selectedIface.hasOwnProperty('v6') && selectedIface.v6.hasOwnProperty('ip')) {
					address = selectedIface.v6.ip;
				} else {
					address = null;
				}
			} else {
				address = null;
			}
			
			if (state != 'running') {
				address = null;
			}
			
			if (!node.hasOwnProperty('meta')) {
				node.meta = {};
			}
			
			node.meta.address = address;
			
			return callback(null, state, vmUuid, address);
		});
	});
};

Provider.prototype.boot = function (name, node, callback) {
	var self = this;
	
	logger.debug('boot node', helpers.q(name), node);
	
	self.status(name, node, function (err, state, id, address) {
		if (err) {
			return callback(err);
		}
		
		if (state == 'booting') {
			return callback(helpers.e('node', helpers.q(name), 'is already booting'));
		}
		
		if (state == 'running') {
			return callback(helpers.e('node', helpers.q(name), 'is already running'));
		}
		
		if (state == 'halting') {
			return callback(helpers.e('node', helpers.q(name), 'is halting'));
		}
		
		var niceName = self.getNiceName(name, node);
		
		self.exec('unregistervm', niceName, '--delete', function (err, output, code) {
			if (err) {
				// NOTE: don't handle since we only try to start from a clean state
				logger.exception(err);
				//
			}
			
			if (code > 0) {
				// NOTE: don't handle since we only tro to start from a clean state
				logger.debug('cannot unregister', helpers.q(vmId), 'with name', helpers.q(niceName));
				//
			}
			
			var vmId = self.extractVmId(node);
		
			if (!vmId) {
				return callback(helpers.e('no virtualbox "vmId" paramter specified for node', helpers.q(name)));
			}
			
			self.exec('showvminfo', vmId, function (err, output, code) {
				if (err) {
					return callback(err);
				} 
				
				var wrapper;
				
				if (code > 0) {
					logger.info('vmId', helpers.q(vmId), 'does not exist for node', helpers.q(name));
					
					wrapper = function (next) {
						var vmUrl = self.extractVmUrl(node);
						
						if (!vmUrl) {
							return next(helpers.e('no virtualbox "vmUrl" paramter specified for node', helpers.q(name)));
						}
						
						self.import(vmUrl, vmId, next);
					};
				} else {
					wrapper = function (next) {
						next();
					};
				}
				
				wrapper(function (err) {
					if (err) {
						return callback(err);
					}
					
					self.exec('clonevm', vmId, '--name', niceName, '--register', function (err, output, code) {
						if (err) {
							return callback(err);
						}
						
						if (code > 0) {
							return callback(helpers.e('cannot clone', helpers.q(vmId), 'into', helpers.q(niceName)));
						}
						
						self.renetwork(name, node, function (err) {
							if (err) {
								return callback(helpers.e('cannot renetwork'));
							}
							
							self.exec('modifyvm', niceName, '--nic1', 'hostonly', '--hostonlyadapter1', 'vboxnet0', '--nic2', 'intnet', '--intnet2', 'vortex', '--nic3', 'nat', function (err, output, code) {
								if (err) {
									return callback(err);
								}
								
								if (code > 0) {
									return callback(helpers.e('cannot modifyvm', helpers.q(vmId), 'with name', helpers.q(niceName)));
								}
								
								self.spawn('startvm', niceName, '--type', 'headless', function (err, child) {
									if (err) {
										return callback(err);
									}
									
									setTimeout(function () {
										self.status(name, node, callback);
									}, 10000);
								});
							});
						});
					});
				});
			});
		});
	});
};

Provider.prototype.halt = function (name, node, callback) {
	var self = this;
	
	logger.debug('halt node', helpers.q(name), node);
	
	self.status(name, node, function (err, state, id, address) {
		if (err) {
			return callback(err);
		}
		
		if (state == 'halting') {
			return callback(helpers.e('node', helpers.q(name), 'is already halting'));
		}
		
		if (state == 'stopped') {
			return callback(helpers.e('node', helpers.q(name), 'is already stopped'));
		}
		
		var niceName = self.getNiceName(name, node);
		
		self.exec('controlvm', niceName, 'poweroff', function (err, output, code) {
			if (err) {
				// NOTE: don't handle this since we will try to unregister the machine anyway
				logger.exception(err);
				//
			}
			
			if (code > 0) {
				// NOTE: don't handle this since we will try to unregister the machine anyway
				logger.debug('cannot poweroff', helpers.q(id), 'with name', helpers.q(niceName));
				//
			}
			
			self.exec('unregistervm', niceName, '--delete', function (err, output, code) {
				if (err) {
					return callback(err);
				}
				
				if (code > 0) {
					return callback(helpers.e('cannot unregister', helpers.q(id), 'with name', helpers.q(niceName)));
				}
				
				self.status(name, node, callback);
			});
		});
	});
};

// ---

Provider.prototype.shellSpec = function (name, node, callback) {
	var self = this;
	
	logger.debug('shell spec node', helpers.q(name), node);
	
	var username = self.extractUsername(node);
	
	if (!username) {
		username = 'vortex';
	}
	
	var password = self.extractPassword(node);
	var privateKey = self.extractPrivateKey(node);
		
	if (!password && !privateKey) {
		return callback(helpers.e('no password or privateKey provided for node', helpers.q(name)));
	}
	
	var passphrase = self.extractPassphrase(node);
	var sshPort = self.extractSshPort(node);
	
	if (sshPort) {
		sshPort = parseInt(sshPort);
		
		if (isNaN(sshPort) || sshPort < 1) {
			return callback(helpers.e('ssh port for node', helpers.q(name), 'is incorrect'));
		}
	} else {
		sshPort = 22;
	}
	
	self.status(name, node, function (err, state, id, address) {
		if (err) {
			return callback(err);
		}
		
		if (state == 'halting') {
			return callback(helpers.e('node', helpers.q(name), 'is halting'));
		}
		
		if (state == 'stopped') {
			return callback(helpers.e('node', helpers.q(name), 'is stopped'));
		}
		
		if (!address) {
			return callback(helpers.e('cannot find network address for node', helpers.q(name)));
		}
		
		logger.debug('check for ssh port open for node', helpers.q(name));
		
		portchecker.isOpen(sshPort, address, function (isOpen) {
			if (isOpen) {
				var milliseconds = 10000;
				
				logger.debug('ensure check for ssh port open for node', helpers.q(name), 'in', milliseconds, 'milliseconds');
				
				setTimeout(function () {
					var codr = encodeURIComponent;
					var auth = codr(username) + (password ? ':' + codr(password) : '');
					var host = address;
					var keys = (privateKey ? ';privateKey=' + codr(privateKey) : '');
					var pass = (passphrase ? ';passphrase=' + codr(passphrase) : '');
					var spec = 'ssh://' + auth + '@' + host + keys + pass;
					
					logger.debug('final spec for node', helpers.q(name), 'is', helpers.q(spec));
					
					return callback(null, spec);
				}, milliseconds);
			} else {
				var callee = arguments.callee;
				var milliseconds = 10000;
				
				logger.debug('repeat check for ssh port open for node', helpers.q(name), 'in', milliseconds, 'milliseconds');
				
				setTimeout(function () {
					portchecker.isOpen(sshPort, address, callee);
				}, milliseconds);
			}
		});
	});
};

// ---

exports.locateVBoxManage = locateVBoxManage;
exports.Provider = Provider;
