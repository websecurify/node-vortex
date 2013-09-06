`
var path = require('path');
var async = require('async');
var awsSdk = require('aws-sdk');
var logsmith = require('logsmith');
var portchecker = require('portchecker');

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
	
	awsSdk.config.update(this.extractClientOptions());
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
	
	if (node && node.hasOwnProperty('amazon') && node.amazon.hasOwnProperty(propertyName)) {
		return node.amazon[propertyName];
	} else
	if (this.manifest.hasOwnProperty('amazon') && this.manifest.amazon.hasOwnProperty(propertyName)) {
		return this.manifest.amazon[propertyName];
	} else {
		return null;
	}
};

// ---

Provider.prototype.extractAccessKeyId = function (nodeName) {
	return this.extractPropertyFromNodeByName('accessKeyId', nodeName);
};

Provider.prototype.extractSecretAccessKey = function (nodeName) {
	return this.extractPropertyFromNodeByName('secretAccessKey', nodeName);
};

Provider.prototype.extractRegion = function (nodeName) {
	return this.extractPropertyFromNodeByName('region', nodeName);
};

Provider.prototype.extractMaxRetries = function (nodeName) {
	return this.extractPropertyFromNodeByName('maxRetries', nodeName);
};

// ---

Provider.prototype.extractImageId = function (nodeName) {
	return this.extractPropertyFromNodeByName('imageId', nodeName);
};

Provider.prototype.extractInstanceType = function (nodeName) {
	return this.extractPropertyFromNodeByName('instanceType', nodeName);
};

Provider.prototype.extractKeyName = function (nodeName) {
	return this.extractPropertyFromNodeByName('keyName', nodeName);
};

Provider.prototype.extractSecurityGroups = function (nodeName) {
	return this.extractPropertyFromNodeByName('securityGroups', nodeName);
};

Provider.prototype.extractUserData = function (nodeName) {
	return this.extractPropertyFromNodeByName('userData', nodeName);
};

Provider.prototype.extractDisableApiTermination = function (nodeName) {
	return this.extractPropertyFromNodeByName('disableApiTermination', nodeName);
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

Provider.prototype.extractClientOptions = function (nodeName) {
	var accessKeyId = this.extractAccessKeyId(nodeName);
	var secretAccessKey = this.extractSecretAccessKey(nodeName);
	var region = this.extractRegion(nodeName);
	var maxRetries = this.extractMaxRetries(nodeName);
	var options = {};
	
	if (accessKeyId) {
		options.accessKeyId = accessKeyId;
	}
	
	if (secretAccessKey) {
		options.secretAccessKey = secretAccessKey;
	}
	
	if (region) {
		options.region = region;
	}
	
	if (maxRetries) {
		options.maxRetries = maxRetries;
	}
	
	return options;
};

Provider.prototype.extractInstanceOptions = function (nodeName) {
	var imageId = this.extractImageId(nodeName);
	var instanceType = this.extractInstanceType(nodeName);
	var keyName = this.extractKeyName(nodeName);
	var securityGroups = this.extractSecurityGroups(nodeName);
	var userData = this.extractUserData(nodeName);
	var disableApiTermination = this.extractDisableApiTermination(nodeName);
	var options = {};
	
	if (imageId) {
		options.ImageId = imageId;
	}
	
	if (instanceType) {
		options.InstanceType = instanceType;
	}
	
	if (keyName) {
		options.KeyName = keyName;
	}
	
	if (securityGroups) {
		options.SecurityGroups = securityGroups;
	}
	
	if (userData) {
		options.UserData = userData;
	}
	
	if (disableApiTermination) {
		options.DisableApiTermination = disableApiTermination;
	}
	
	return options;
};

// ---

Provider.prototype.createError = function (error, nodeName) {
	if (error.code == 'NetworkingError') {
		return error;
	} else {
		var tokens = error.toString().split(':');
		var type = tokens[0];
		var message = tokens[1].trim();
		var parts = message.split('.');
		
		message = parts.shift().toLowerCase().trim();
		
		if (nodeName) {
			message = message + ' for node ' + helpers.q(nodeName);
		}
		
		if (parts.length > 0) {
			message = message + ' (' + parts.join('.').trim() + ')'
		}
		
		message = message.replace(/\s'(\w+)'\s/, function (match, group) {
			var param = group.toLowerCase();
			
			switch (param) {
				case 'accesskeyid': param = 'accessKeyId'; break;
				case 'secretaccesskey': param = 'secretAccessKey'; break;
				case 'region': param = 'region'; break;
				case 'maxretries': param = 'maxRetries'; break;
				case 'imageid': param = 'imageId'; break;
				case 'instancetype': param = 'instanceType'; break;
				case 'keyname': param = 'keyName'; break;
				case 'securitygroups': param = 'securityGroups'; break;
				case 'userdata': param = 'userData'; break;
				case 'disableapitermination': param = 'disableApiTermination'; break;
			}
			
			return ' "' + param + '" ';
		});
		
		message = helpers.camel(message);
		
		return new Error(message);
	}
};

// ---

Provider.prototype.getClient = function (nodeName) {
	return new awsSdk.EC2(this.extractClientOptions(nodeName));
};

// ---

Provider.prototype.bootstrap = function (nodeName, callback) {
	// TODO: handle expose declarations
	return callback();
	//
};

Provider.prototype.status = function (nodeName, callback) {
	var client;
	
	try {
		client = this.getClient(nodeName);
	} catch (e) {
		return callback(this.createError(e, nodeName));
	}
	
	var options = {
		Filters: [
			{Name: 'tag:vortex-node-name', Values: [nodeName]},
			{Name: 'tag:vortex-node-namespace', Values: [this.extractNamespace(nodeName)]}
		]
	};
	
	logsmith.debug('describe instances with options', options);
	
	var self = this;
	
	client.describeInstances(options, function (err, result) {
		if (err) {
			return callback(self.createError(err, nodeName));
		}
		
		var instances = [];
		
		result.Reservations.forEach(function (reservation) {
			reservation.Instances.forEach(function (instance) {
				instances.push({
					id: instance.InstanceId,
					state: instance.State.Name,
					address: instance.PublicDnsName
				});
			});
		});
		
		if (instances.length == 0) {
			return callback(null, 'stopped');
		}
		
		logsmith.debug('discovered instances', instances);
		
		var selectedInstance = instances[instances.length - 1];
		
		if (!selectedInstance) {
			return callback(helpers.e('could not obtain instance for node', helpers.q(node)));
		}
		
		logsmith.debug('selected instance', selectedInstance);
		
		instances
			.filter(function (instance) {
				return [
					'shutting-down',
					'terminated',
					'stopping',
					'stopped'
				].indexOf(instance.state) < 0 && selectedInstance != instance;
			})
			.forEach(function (instance) {
				logsmith.warn('duplicate node', helpers.q(nodeName), 'with instance id', helpers.q(instance.id), 'detected');
			});
			
		var state;
		
		switch (selectedInstance.state) {
			case 'pending': state = 'booting'; break;
			case 'running': state = 'running'; break;
			case 'stopped': state = 'stopped'; break;
			case 'stopping': state = 'halting'; break;
			case 'terminated': state = 'stopped'; break;
			case 'shutting-down': state = 'halting'; break;
		}
		
		if (!state) {
			return callback(helpers.e('undefined state for node', helpers.q(nodeName)));
		}
		
		logsmith.debug('node', helpers.q(nodeName), 'with instance id', helpers.q(selectedInstance.id), 'has state', helpers.q(state));
		
		var address = selectedInstance.address;
		
		if (!address) {
			state = 'booting';
		}
		
		if (state != 'running') {
			address = null;
		}
		
		return callback(null, state, address, selectedInstance.id);
	});
};

Provider.prototype.boot = function (nodeName, callback) {
	var self = this;
	
	var verifyStatus = function (node, callback) {
		self.status(nodeName, function (err, state, address, instanceId) {
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
	
	var runInstance = function (node, callback) {
		var client;
		
		try {
			client = self.getClient(node);
		} catch (e) {
			return callback(self.createError(e, node));
		}
		
		var options = self.extractInstanceOptions(node);
		
		options.MinCount = 1;
		options.MaxCount = 1;
		
		logsmith.debug('run instances with options', options);
		
		client.runInstances(options, function (err, result) {
			if (err) {
				return callback(self.createError(err, node));
			}
			
			var instances = [];
			
			result.Instances.forEach(function (instance) {
				instances.push({
					id: instance.InstanceId,
				});
			});
			
			if (instances.length == 0) {
				return callback(helpers.e('no instances run for node', helpers.q(node)));
			}
			
			logsmith.debug('ran instances', instances);
			
			var selectedInstance = instances[instances.length - 1];
			
			if (!selectedInstance) {
				return callback(helpers.e('could not create instance for node', helpers.q(node)));
			}
			
			logsmith.debug('selected instance', selectedInstance);
			
			instances
				.filter(function (instance) {
					return selectedInstance != instance;
				})
				.forEach(function (instance) {
					logsmith.warn('duplicate node', helpers.q(node), 'with instance id', helpers.q(instance.id), 'detected');
				});
				
			return callback(null, node, selectedInstance.id);
		});
	};
	
	var mapTags = function (node, instanceId, callback) {
		var client;
		
		try {
			client = self.getClient(node);
		} catch (e) {
			return callback(self.createError(e, node));
		}
		
		var options = {
			Resources: [instanceId],
			Tags: [
				{Key: 'vortex-node-name', Value: node},
				{Key: 'vortex-node-namespace', Value: self.extractNamespace(node)}
			]
		};
		
		logsmith.debug('create tags with options', options);
		
		client.createTags(options, function (err, result) {
			if (err) {
				return callback(self.createError(err, node));
			}
			
			return callback();
		});
	};
	
	async.waterfall(
		[
			function (callback) {
				return callback(null, nodeName);
			},
			
			verifyStatus,
			runInstance,
			mapTags
		],
		function (err) {
			if (err) {
				return callback(err);
			}
			
			self.status(nodeName, callback);
		}
	);
};

Provider.prototype.halt = function (nodeName, callback) {
	var self = this;
	
	var verifyStatus = function (node, callback) {
		self.status(node, function (err, state, address, instanceId) {
			if (err) {
				return callback(err);
			}
			
			if (state == 'halting') {
				return callback(helpers.e('node', helpers.q(node), 'is already halting'));
			}
			
			if (state == 'stopped') {
				return callback(helpers.e('node', helpers.q(node), 'is already stopped'));
			}
			
			return callback(null, node, instanceId);
		});
	};
	
	var terminateInstance = function (node, instanceId, callback) {
		var client;
		
		try {
			client = self.getClient(node);
		} catch (e) {
			return callback(self.createError(e, node));
		}
		
		var options = {
			InstanceIds: [instanceId]
		};
		
		logsmith.debug('terminate instances with options', options);
		
		client.terminateInstances(options, function (err, result) {
			if (err) {
				return callback(self.createError(err, node));
			}
			
			return callback(null, node, instanceId);
		});
	};
	
	var unmapTags = function (node, instanceId, callback) {
		var client;
		
		try {
			client = self.getClient(node);
		} catch (e) {
			return callback(self.createError(e, node));
		}
		
		var options = {
			Resources: [instanceId],
			Tags: [
				{Key: 'vortex-node-name', Value: node},
				{Key: 'vortex-node-namespace', Value: self.extractNamespace(node)}
			]
		};
		
		logsmith.debug('delete tags with options', options);
		
		client.deleteTags(options, function (err, result) {
			if (err) {
				return callback(self.createError(err, node));
			}
			
			return callback();
		});
	};
	
	async.waterfall(
		[
			function (callback) {
				return callback(null, nodeName);
			},
			
			verifyStatus,
			terminateInstance,
			unmapTags
		],
		function (err) {
			if (err) {
				return callback(err);
			}
			
			self.status(nodeName, callback);
		}
	);
};

Provider.prototype.shell_spec = function (nodeName, callback) {
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
`