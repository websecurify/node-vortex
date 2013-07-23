var path = require('path');
var awsSdk = require('aws-sdk');

// ---

var logger = require(path.join(__dirname, 'logger.js'));

// ---

function Provider(manifest) {
	this.clientOptions = {'accessKeyId':'accessKeyId', 'secretAccessKey':'secretAccessKey', 'region':'region', 'maxRetries':'maxRetries'};
	this.instanceOptions = {'imageId':'ImageId', 'instanceType':'InstanceType', 'keyName':'KeyName', 'securityGroups':'SecurityGroups', 'userData':'UserData'};
	this.shellOptions = {'username':'username', 'password':'password', 'privateKey':'privateKey', 'passphrase':'passphrase'};
	
	awsSdk.config.update(this.extractClientOptions(manifest));
}

// ---

Provider.prototype.extractOptions = function (map, source) {
	var options = {};
	
	if (source.hasOwnProperty('amazon')) {
		var amazon = source.amazon;
		
		Object.keys(map).forEach(function (niceName) {
			var realName = map[niceName];
			
			if (amazon.hasOwnProperty(niceName)) {
				options[realName] = amazon[niceName];
			}
		})
	}
	
	return options;
};

// ---

Provider.prototype.extractClientOptions = function (source) {
	return this.extractOptions(this.clientOptions, source);
};

Provider.prototype.extractInstanceOptions = function (source) {
	return this.extractOptions(this.instanceOptions, source);
};

Provider.prototype.extractShellOptions = function (source) {
	return this.extractOptions(this.shellOptions, source);
};

// ---

Provider.prototype.createError = function (error, name) {
	if (error.code == 'NetworkingError') {
		return error;
	} else {
		var tokens = error.toString().split(':');
		var type = tokens[0];
		var message = tokens[1].trim();
		
		if (name) {
			message = message + ' for node ' + name;
		}
		
		message = message.replace(/required\skey\s'(\w+)'/, function (match, group) {
			return "required key '" + group[0].toLowerCase() + group.substring(1, group.length) + "'";
		});
		
		message = message[0].toLowerCase() + message.substring(1, message.length);
		
		return new Error(message, error);
	}
};

// ---

Provider.prototype.getClient = function (options) {
	return new awsSdk.EC2(this.extractClientOptions(options));
};

// ---

Provider.prototype.status = function (name, node, callback) {
	var client;
	
	try {
		client = this.getClient(node);
	} catch (e) {
		return callback(this.createError(e, name));
	}
	
	var options = {
		Filters: [
			{Name: 'tag:vortex-node-name', Values: [name]}
		]
	};
	
	logger.debug('describe instances with options', options);
	
	var self = this;
	
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
					dnsName: instance.PublicDnsName
				});
			});
		});
		
		if (instances.length == 0) {
			return callback(null, 'stopped');
		}
		
		logger.debug('discovered instances', instances);
		
		if (instances.length >= 2) {
			instances.forEach(function (instance) {
				logger.warn('multiple instances with the same name detected:', name, instance.id, instance.state);
			});
		}
		
		var instance = instances[instances.length - 1];
		
		var state;
		
		switch (instance.state) {
			case 'pending': state = 'booting'; break;
			case 'running': state = 'running'; break;
			case 'shutting-down': state = 'halting'; break;
			case 'terminated': state = 'stopped'; break;
			case 'stopping': state = 'halting'; break;
			case 'stopped': state = 'stopped'; break;
		}
		
		if (!state) {
			return callback(new Error('undefined state for node ' + name));
		}
		
		return callback(null, state, instance.id, instance.dnsName);
	});
};

Provider.prototype.boot = function (name, node, callback) {
	var self = this;
	
	logger.silly('first pass status for node', name);
	
	this.status(name, node, function (err, state, instanceId, dnsName) {
		if (err) {
			return callback(err);
		}
		
		if (state == 'booting') {
			return callback(new Error('node ' + name + ' is already booting'));
		}
		
		if (state == 'running') {
			return callback(new Error('node ' + name + ' is already running'));
		}
		
		if (state == 'halting') {
			return callback(new Error('node ' + name + ' is halting'));
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
			
			var instances = result.Instances;
			
			if (instances.length >= 2) {
				instances.forEach(function (instance) {
					logger.warn('multiple instances with the same configuration detected:', name, instance.InstanceId);
				});
			}
			
			var options = {
				Resources: [instances[0].InstanceId],
				Tags: [{Key: 'vortex-node-name', Value: name}]
			};
			
			logger.debug('tag instances with options', options);
			
			client.createTags(options, function (err, result) {
				if (err) {
					return callback(self.createError(err, name));
				}
				
				logger.silly('second pass status for node', name);
				
				self.status(name, node, callback);
			});
		});
	});
};

Provider.prototype.halt = function (name, node, callback) {
	var self = this;
	
	logger.silly('first pass status for node', name);
	
	this.status(name, node, function (err, state, instanceId, dnsName) {
		if (err) {
			return callback(err);
		}
		
		if (state == 'halting') {
			return callback(new Error('node ' + name + ' is already halting'));
		}
		
		if (state == 'stopped') {
			return callback(new Error('node ' + name + ' is already stopped'));
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
			
			var options = {
				Resources: [instanceId],
				Tags: [{Key: 'vortex-node-name', Value: name}]
			};
			
			logger.debug('untag instances with options', options);
			
			client.deleteTags(options, function (err, result) {
				if (err) {
					return callback(self.createError(err, name));
				}
				
				logger.silly('second pass status for node', name);
				
				return self.status(name, node, callback);
			});
		});
	});
};

// ---

Provider.prototype.shellSpec = function (name, node, callback) {
	var options = this.extractShellOptions(node);
	
	if (!options.hasOwnProperty('username')) {
		options.username = 'vortex';
	}
	
	if (!options.hasOwnProperty('password') && !options.hasOwnProperty('privateKey')) {
		return callback(new Error('no privateKey or password provided for node ' + name));
	}
	
	var self = this;
	
	logger.silly('first pass status for node', name);
	
	this.status(name, node, function (err, state, instanceId, dnsName) {
		if (err) {
			return callback(err);
		}
		
		if (state == 'halting') {
			return callback(new Error('node ' + name + ' is halting'));
		}
		
		if (state == 'stopped') {
			return callback(new Error('node ' + name + ' is stopped'));
		}
		
		if (state == 'booting') {
			logger.debug('state for node', name, 'is booting');
			
			var callee = arguments.callee;
			
			setTimeout(function () {
				self.status(name, node, callee);
			}, 10000);
			
			return;
		}
		
		var codr = encodeURIComponent;
		var auth = codr(options.username) + (options.hasOwnProperty('password') ? ':' + codr(options.password) : '');
		var host = dnsName;
		var keys = (options.hasOwnProperty('privateKey') ? ';privateKey=' + codr(options.privateKey) : '');
		var pass = (options.hasOwnProperty('passphrase') ? ';passphrase=' + codr(options.passphrase) : '');
		
		var spec = 'ssh://' + auth + '@' + host + keys + pass;
		
		callback(null, spec);
	});
};

// ---

exports.Provider = Provider;
