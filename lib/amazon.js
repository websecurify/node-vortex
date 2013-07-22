var path = require('path');
var awsSdk = require('aws-sdk');

// ---

var logger = require(path.join(__dirname, 'logger.js'));

// ---

function Provider(manifest) {
	this.clientOptions = ['accessKeyId', 'secretAccessKey', 'region', 'maxRetries'];
	this.instanceOptions = ['ImageId', 'InstanceType', 'KeyName', 'SecurityGroups', 'UserData'];
	this.shellOptions = ['username', 'password', 'privateKey'];
	
	awsSdk.config.update(this.extractClientOptions(manifest));
}

// ---

Provider.prototype.extractOptions = function (list, source) {
	var options = {};
	
	if (source.hasOwnProperty('aws')) {
		var aws = source.aws;
		
		list.forEach(function (option) {
			if (aws.hasOwnProperty(option)) {
				options[option] = aws[option];
			}
		});
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
	var tokens = error.toString().split(':');
	var type = tokens[0];
	var message = tokens[1].trim();
	
	if (name) {
		message = message + ' for node ' + name;
	}
	
	message = message[0].toLowerCase() + message.substring(1, message.length);
	
	return new Error(message, error);
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
				instances.push([instance.InstanceId, instance.State.Name, instance.PublicDnsName]);
			});
		});
		
		if (instances.length == 0) {
			return callback(null, 'stopped');
		}
		
		if (instances.length >= 2) {
			instances.forEach(function (instance) {
				logger.warn('multiple instances with the same name detected:', name, instance[0], instance[1]);
			});
		}
		
		var state;
		
		switch (instances[0][1]) {
			case 'pending': state = 'botting'; break;
			case 'running': state = 'running'; break;
			case 'shutting-down': state = 'halting'; break;
			case 'terminated': state = 'stopped'; break;
			case 'stopping': state = 'halting'; break;
			case 'stopped': state = 'stopped'; break;
		}
		
		if (!state) {
			return callback(new Error('undefined state for node ' + name));
		}
		
		return callback(null, state, instances[0][0], instances[0][2]);
	});
};

Provider.prototype.boot = function (name, node, callback) {
	var self = this;
	
	logger.debug('first pass status for node', name);
	
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
					logger.warn('multiple instances with the same configuration detected:', name, instance[0].InstanceId);
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
				
				logger.debug('second pass status for node', name);
				
				self.status(name, node, callback);
			});
		});
	});
};

Provider.prototype.halt = function (name, node, callback) {
	var self = this;
	
	logger.debug('first pass status for node', name);
	
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
				
				logger.debug('second pass status for node', name);
				
				return self.status(name, node, callback);
			});
		});
	});
};

// ---

Provider.prototype.shellSpec = function (name, node, callback) {
	var options = this.extractShellOptions(node);
	
	if (!options.hasOwnProperty('username')) {
		options.username = 'vortext';
	}
	
	if (!options.hasOwnProperty('password') || !options.hasOwnProperty('privateKey')) {
		return callback(new Error('no privateKey or password provided for node ' + name));
	}
	
	var self = this;
	
	logger.debug('first pass status for node', name);
	
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
		
		var spec = 'ssh://' + options.username + (options.hasOwnProperty('password') ? ':' + options.password : '') + '@' + dnsName + (options.hasOwnProperty('privateKey') ? ';privateKey=' + options.privateKey : '');
		
		callback(null, spec);
	});
};

// ---

exports.Provider = Provider;
