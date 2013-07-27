var path = require('path');
var awsSdk = require('aws-sdk');
var portchecker = require('portchecker');

// ---

var logger = require(path.join(__dirname, 'logger.js'));
var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

function Provider(manifest) {
	this.manifest = manifest;
	
	awsSdk.config.update(this.extractClientOptions(manifest));
}

// ---

Provider.prototype.extractProperty = function (name, source) {
	if (source && source.hasOwnProperty('amazon') && source.amazon.hasOwnProperty(name)) {
		return source.amazon[name];
	} else
	if (this.manifest.hasOwnProperty('amazon') && this.manifest.amazon.hasOwnProperty(name)) {
		return this.manifest.amazon[name];
	} else {
		return null;
	}
};

// ---

Provider.prototype.extractAccessKeyId = function (source) {
	return this.extractProperty('accessKeyId', source);
};

Provider.prototype.extractSecretAccessKey = function (source) {
	return this.extractProperty('secretAccessKey', source);
};

Provider.prototype.extractRegion = function (source) {
	return this.extractProperty('region', source);
};

Provider.prototype.extractMaxRetries = function (source) {
	return this.extractProperty('maxRetries', source);
};

// ---

Provider.prototype.extractImageId = function (source) {
	return this.extractProperty('imageId', source);
};

Provider.prototype.extractInstanceType = function (source) {
	return this.extractProperty('instanceType', source);
};

Provider.prototype.extractKeyName = function (source) {
	return this.extractProperty('keyName', source);
};

Provider.prototype.extractSecurityGroups = function (source) {
	return this.extractProperty('securityGroups', source);
};

Provider.prototype.extractUserData = function (source) {
	return this.extractProperty('userData', source);
};

Provider.prototype.extractDisableApiTermination = function (source) {
	return this.extractProperty('disableApiTermination', source);
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

Provider.prototype.extractClientOptions = function (source) {
	var accessKeyId = this.extractAccessKeyId(source);
	var secretAccessKey = this.extractSecretAccessKey(source);
	var region = this.extractRegion(source);
	var maxRetries = this.extractMaxRetries(source);
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

Provider.prototype.extractInstanceOptions = function (source) {
	var imageId = this.extractImageId(source);
	var instanceType = this.extractInstanceType(source);
	var keyName = this.extractKeyName(source);
	var securityGroups = this.extractSecurityGroups(source);
	var userData = this.extractUserData(source);
	var disableApiTermination = this.extractDisableApiTermination(source);
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

Provider.prototype.createError = function (error, name) {
	if (error.code == 'NetworkingError') {
		return error;
	} else {
		var tokens = error.toString().split(':');
		var type = tokens[0];
		var message = tokens[1].trim();
		var parts = message.split('.');
		
		message = parts.shift().toLowerCase().trim();
		
		if (name) {
			message = message + ' for node ' + helpers.q(name);
		}
		
		if (parts.length > 0) {
			message = message + ' (' + parts.join('.').trim() + ')'
		}
		
		message = message.replace(/\s'(\w+)'\s/, function (match, group) {
			return " '" + helpers.c(group) + "' ";
		});
		
		message = helpers.camel(message);
		
		return new Error(message);
	}
};

// ---

Provider.prototype.getClient = function (options) {
	return new awsSdk.EC2(this.extractClientOptions(options));
};

// ---

Provider.prototype.status = function (name, node, callback) {
	var self = this;
	
	logger.debug('get status for node', helpers.q(name), node);
	
	var client;
	
	try {
		client = self.getClient(node);
	} catch (e) {
		return callback(self.createError(e, name));
	}
	
	var namespace;
	
	if (node.hasOwnProperty('namespace')) {
		namespace = node.namespace;
	} else
	if (self.manifest.hasOwnProperty('namespace')) {
		namespace = self.manifest.namespace;
	}
	
	var options = {
		Filters: [
			{Name: 'tag:vortex-node-name', Values: [name]}
		]
	};
	
	if (namespace) {
		options.Filters.push({Name: 'tag:vortex-node-namespace', Values: [namespace]});
	}
	
	logger.debug('describe instances with options', options);
	
	client.describeInstances(options, function (err, result) {
		if (err) {
			return callback(self.createError(err, name));
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
		
		logger.debug('discovered instances', instances);
		
		var selectedInstance = instances[instances.length - 1];
		
		logger.debug('selected instance', selectedInstance);
		
		if (instances.length >= 2) {
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
					logger.warn('duplicate node', helpers.q(name), 'with instance id', helpers.q(instance.id), 'with state', helpers.q(instance.state), 'detected');
				});
		}
		
		var state;
		
		switch (selectedInstance.state) {
			case 'pending': state = 'booting'; break;
			case 'running': state = 'running'; break;
			case 'shutting-down': state = 'halting'; break;
			case 'terminated': state = 'stopped'; break;
			case 'stopping': state = 'halting'; break;
			case 'stopped': state = 'stopped'; break;
		}
		
		if (!state) {
			return callback(helpers.e('undefined state for node', helpers.q(name)));
		}
		
		logger.debug('node', helpers.q(name), 'with instance id', helpers.q(selectedInstance.id), 'has state', helpers.q(state));
		
		return callback(null, state, selectedInstance.id, selectedInstance.address);
	});
};

Provider.prototype.boot = function (name, node, callback) {
	var self = this;
	
	logger.debug('boot node', helpers.q(name), node);
	
	self.status(name, node, function (err, state, instanceId, address) {
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
		
		var client;
		
		try {
			client = self.getClient(node);
		} catch (e) {
			return callback(self.createError(e, name));
		}
		
		var options = self.extractInstanceOptions(node);
		
		options.MinCount = 1;
		options.MaxCount = 1;
		
		logger.debug('run instances with options', options);
		
		client.runInstances(options, function (err, result) {
			if (err) {
				return callback(self.createError(err, name));
			}
			
			var instances = [];
			
			result.Instances.forEach(function (instance) {
				instances.push({
					id: instance.InstanceId,
				});
			});
			
			if (instances.length == 0) {
				return callback(helpers.e('no instances run for node', helpers.q(name)));
			}
			
			logger.debug('run instances', instances);
			
			var selectedInstance = instances[instances.length - 1];
			
			logger.debug('selected instance', selectedInstance);
			
			if (instances.length >= 2) {
				instances
					.filter(function (instance) {
						return selectedInstance != instance;
					})
					.forEach(function (instance) {
						logger.warn('duplicate node', helpers.q(name), 'with instance id', helpers.q(instance.id), 'detected');
					});
			}
			
			var namespace;
	
			if (node.hasOwnProperty('namespace')) {
				namespace = node.namespace;
			} else
			if (self.manifest.hasOwnProperty('namespace')) {
				namespace = self.manifest.namespace;
			}
			
			var options = {
				Resources: [selectedInstance.id],
				Tags: [
					{Key: 'vortex-node-name', Value: name}
				]
			};
			
			if (namespace) {
				options.Tags.push({Key: 'vortex-node-namespace', Value: namespace});
			}
			
			logger.debug('tag instances with options', options);
			
			client.createTags(options, function (err, result) {
				if (err) {
					return callback(self.createError(err, name));
				}
				
				self.status(name, node, callback);
			});
		});
	});
};

Provider.prototype.halt = function (name, node, callback) {
	var self = this;
	
	logger.debug('halt node', helpers.q(name), node);
	
	self.status(name, node, function (err, state, instanceId, address) {
		if (err) {
			return callback(err);
		}
		
		if (state == 'halting') {
			return callback(helpers.e('node', helpers.q(name), 'is already halting'));
		}
		
		if (state == 'stopped') {
			return callback(helpers.e('node', helpers.q(name), 'is already stopped'));
		}
		
		var client;
		
		try {
			client = self.getClient(node);
		} catch (e) {
			return callback(self.createError(e, name));
		}
		
		if (!instanceId) {
			return self.status(name, node, callback);
		}
		
		var options = {
			InstanceIds: [instanceId]
		};
		
		logger.debug('terminate instances with options', options);
		
		client.terminateInstances(options, function (err, result) {
			if (err) {
				return callback(self.createError(err, name));
			}
			
			var namespace;
			
			if (node.hasOwnProperty('namespace')) {
				namespace = node.namespace;
			} else
			if (self.manifest.hasOwnProperty('namespace')) {
				namespace = self.manifest.namespace;
			}
			
			var options = {
				Resources: [instanceId],
				Tags: [
					{Key: 'vortex-node-name', Value: name}
				]
			};
			
			if (namespace) {
				options.Tags.push({Key: 'vortex-node-namespace', Value: namespace});
			}
			
			logger.debug('untag instances with options', options);
			
			client.deleteTags(options, function (err, result) {
				if (err) {
					return callback(self.createError(err, name));
				}
				
				return self.status(name, node, callback);
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
	
	self.status(name, node, function (err, state, instanceId, address) {
		if (err) {
			return callback(err);
		}
		
		if (state == 'halting') {
			return callback(helpers.e('node', helpers.q(name), 'is halting'));
		}
		
		if (state == 'stopped') {
			return callback(helpers.e('node', helpers.q(name), 'is stopped'));
		}
		
		if (state == 'booting') {
			logger.debug('state for node', helpers.q(name), 'is booting');
			
			var callee = arguments.callee;
			var milliseconds = 10000;
			
			logger.debug('repeat status for node', helpers.q(name), 'in', milliseconds, 'milliseconds');
			
			setTimeout(function () {
				self.status(name, node, callee);
			}, milliseconds);
			
			return;
		}
		
		logger.debug('check for ssh port open for node', helpers.q(name));
		
		portchecker.isOpen(sshPort, address, function (isOpen) {
			if (isOpen) {
				var codr = encodeURIComponent;
				var auth = codr(username) + (password ? ':' + codr(password) : '');
				var host = address;
				var keys = (privateKey ? ';privateKey=' + codr(privateKey) : '');
				var pass = (passphrase ? ';passphrase=' + codr(passphrase) : '');
				var spec = 'ssh://' + auth + '@' + host + keys + pass;
				
				logger.debug('final spec for node', helpers.q(name), 'is', helpers.q(spec));
				
				return callback(null, spec);
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

exports.Provider = Provider;
