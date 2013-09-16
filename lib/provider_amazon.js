(function() {
  var async, aws_sdk, fs, logsmith, path_extra, portchecker;

  fs = require('fs');

  async = require('async');

  aws_sdk = require('aws-sdk');

  logsmith = require('logsmith');

  path_extra = require('path-extra');

  portchecker = require('portchecker');

  exports.Provider = (function() {
    /*
    	This class exposes Amazon as a provider to Vortex.
    */

    function _Class(manifest) {
      this.manifest = manifest;
      /*
      		The provider accepts a manifest as a parameter by specification.
      */

      aws_sdk.config.update(this.extract_client_options());
    }

    _Class.prototype.get_node = function(node_name) {
      /*
      		This method returns a node by looking up its name. It throws an error if the node is not found.
      */

      if ((this.manifest.nodes != null) && (this.manifest.nodes[node_name] != null)) {
        return this.manifest.nodes[node_name];
      }
      throw new Error("node " + node_name + " does not exist");
    };

    _Class.prototype.extract_property = function(property_name, node_name) {
      /*
      		Extracts a property by looking into a node and upper layers of the manifest.
      */

      var e, node, _ref, _ref1;
      try {
        node = this.get_node(node_name);
      } catch (_error) {
        e = _error;
        node = null;
      }
      if ((node != null ? (_ref = node.amazon) != null ? _ref[property_name] : void 0 : void 0) != null) {
        return node.amazon[property_name];
      }
      if (((_ref1 = this.manifest.amazon) != null ? _ref1[property_name] : void 0) != null) {
        return this.manifest.amazon[property_name];
      }
      return null;
    };

    _Class.prototype.extract_access_key_id = function(node_name) {
      return this.extract_property('accessKeyId', node_name);
    };

    _Class.prototype.extract_secret_access_key = function(node_name) {
      return this.extract_property('secretAccessKey', node_name);
    };

    _Class.prototype.extract_region = function(node_name) {
      return this.extract_property('region', node_name);
    };

    _Class.prototype.extract_max_retries = function(node_name) {
      return this.extract_property('maxRetries', node_name);
    };

    _Class.prototype.extract_image_id = function(node_name) {
      return this.extract_property('imageId', node_name);
    };

    _Class.prototype.extract_instance_type = function(node_name) {
      return this.extract_property('instanceType', node_name);
    };

    _Class.prototype.extract_key_name = function(node_name) {
      return this.extract_property('keyName', node_name);
    };

    _Class.prototype.extract_security_groups = function(node_name) {
      return this.extract_property('securityGroups', node_name);
    };

    _Class.prototype.extract_user_data = function(node_name) {
      return this.extract_property('userData', node_name);
    };

    _Class.prototype.extract_disable_api_termination = function(node_name) {
      return this.extract_property('disableApiTermination', node_name);
    };

    _Class.prototype.extract_username = function(node_name) {
      return this.extract_property('username', node_name);
    };

    _Class.prototype.extract_password = function(node_name) {
      return this.extract_property('password', node_name);
    };

    _Class.prototype.extract_private_key = function(node_name) {
      return this.extract_property('privateKey', node_name);
    };

    _Class.prototype.extract_passphrase = function(node_name) {
      return this.extract_property('passphrase', node_name);
    };

    _Class.prototype.extract_ssh_port = function(node_name) {
      return this.extract_property('sshPort', node_name);
    };

    _Class.prototype.extract_namespace = function(node_name) {
      /*
      		Extracts a namespace by looking it up in the node itself and upper layers of the manifest
      */

      var node;
      try {
        node = this.get_node(node_name);
      } catch (_error) {
        node = null;
      }
      if ((node != null ? node.namespace : void 0) != null) {
        return node.namespace;
      }
      if (this.manifest.namespace != null) {
        return this.manifest.namespace;
      }
    };

    _Class.prototype.extract_client_options = function(node_name) {
      /*
      		Extracts options related to the AWS client.
      */

      var access_key_id, max_retries, options, region, secret_access_key;
      access_key_id = this.extract_access_key_id(node_name);
      secret_access_key = this.extract_secret_access_key(node_name);
      region = this.extract_region(node_name);
      max_retries = this.extract_max_retries(node_name);
      options = {};
      if (access_key_id) {
        options.accessKeyId = access_key_id;
      }
      if (secret_access_key) {
        options.secretAccessKey = secret_access_key;
      }
      if (region) {
        options.region = region;
      }
      if (max_retries) {
        options.maxRetries = max_retries;
      }
      return options;
    };

    _Class.prototype.extract_instance_options = function(node_name) {
      /*
      		Extracts options related to AWS instances.
      */

      var disable_api_termination, image_id, instance_type, key_name, options, security_groups, user_data;
      image_id = this.extract_image_id(node_name);
      instance_type = this.extract_instance_type(node_name);
      key_name = this.extract_key_name(node_name);
      security_groups = this.extract_security_groups(node_name);
      user_data = this.extract_user_data(node_name);
      disable_api_termination = this.extract_disable_api_termination(node_name);
      options = {};
      if (image_id) {
        options.ImageId = image_id;
      }
      if (instance_type) {
        options.InstanceType = instance_type;
      }
      if (key_name) {
        options.KeyName = key_name;
      }
      if (security_groups) {
        options.SecurityGroups = security_groups;
      }
      if (user_data) {
        options.UserData = user_data;
      }
      if (disable_api_termination) {
        options.DisableApiTermination = disable_api_termination;
      }
      return options;
    };

    _Class.prototype.get_client = function(node_name) {
      /*
      		Obtain a client for EC2.
      */

      return new aws_sdk.EC2(this.extract_client_options(node_name));
    };

    _Class.prototype.create_error = function(error, node_name) {
      /*
      		Creates a friendlier error message.
      */

      var message, parts, tokens, type;
      if (error.code === 'NetworkingError') {
        return error;
      } else {
        tokens = error.toString().split(':');
        type = tokens[0];
        message = tokens[1].trim();
        parts = message.split('.');
        message = parts.shift().toLowerCase().trim();
        if (node_name) {
          message = "" + message + " for node " + node_name;
        }
        if (parts.length > 0) {
          message = "" + message + " (" + (parts.join('.').trim()) + ")";
        }
        message = message.replace(/\s'(\w+)'\s/, function(match, group) {
          var param;
          param = group.toLowerCase();
          switch (param) {
            case 'accesskeyid':
              param = 'accessKeyId';
              break;
            case 'secretaccesskey':
              param = 'secretAccessKey';
              break;
            case 'region':
              param = 'region';
              break;
            case 'maxretries':
              param = 'maxRetries';
              break;
            case 'imageid':
              param = 'imageId';
              break;
            case 'instancetype':
              param = 'instanceType';
              break;
            case 'keyname':
              param = 'keyName';
              break;
            case 'securitygroups':
              param = 'securityGroups';
              break;
            case 'userdata':
              param = 'userData';
              break;
            case 'disableapitermination':
              param = 'disableApiTermination';
          }
          return ' "' + param + '" ';
        });
        message = message[0] + message.substring(1, message.length);
        return new Error(message);
      }
    };

    _Class.prototype.bootstrap = function(node_name, callback) {
      /*
      		Provider-specific method for bootstrapping a node.
      */

      var obtain_shell_spec, prepare_exposed, verify_status,
        _this = this;
      verify_status = function(callback) {
        return _this.status(node_name, function(err, state, address) {
          if (err) {
            return callback(err);
          }
          if (state !== 'running') {
            return callback(new Error("node " + node_name + " is not ready"));
          }
          return callback(null);
        });
      };
      obtain_shell_spec = function(callback) {
        return _this.shell_spec(node_name, function(err, spec) {
          if (err) {
            return callback(err);
          }
          return callback(null, spec);
        });
      };
      prepare_exposed = function(spec, callback) {
        var dst, e, handle_exposure, node, src;
        try {
          node = _this.get_node(node_name);
        } catch (_error) {
          e = _error;
          node = null;
        }
        if ((node != null ? node.expose : void 0) == null) {
          return callback(null);
        }
        handle_exposure = function(exposure, callback) {
          var source_path;
          source_path = path_extra.resolve(path_extra.dirname(_this.manifest.meta.location), exposure.src);
          return fs.stat(source_path, function(err, stats) {
            if (err) {
              return callback(new Error("cannot expose " + exposure.src + " because it does not exist"));
            }
            return callback(null);
          });
        };
        return async.eachSeries((function() {
          var _ref, _results;
          _ref = node.expose;
          _results = [];
          for (src in _ref) {
            dst = _ref[src];
            _results.push({
              src: src,
              dst: dst
            });
          }
          return _results;
        })(), handle_exposure, callback);
      };
      return async.waterfall([verify_status, obtain_shell_spec, prepare_exposed], function(err, state, address) {
        if (err) {
          return callback(err);
        }
        return callback(null);
      });
    };

    _Class.prototype.status = function(node_name, callback) {
      /*
      		Provider-specific method for checking the status of a node.
      */

      var client, e, options,
        _this = this;
      try {
        client = this.get_client(node_name);
      } catch (_error) {
        e = _error;
        return callback(this.create_error(e, node_name));
      }
      options = {
        Filters: [
          {
            Name: 'tag:vortex-node-name',
            Values: [node_name]
          }, {
            Name: 'tag:vortex-node-namespace',
            Values: [this.extract_namespace(node_name)]
          }
        ]
      };
      logsmith.debug('describe instances with options', options);
      return client.describeInstances(options, function(err, result) {
        var address, instance, instances, reservation, selected_instance, state, _i, _j, _k, _len, _len1, _len2, _ref, _ref1, _ref2;
        if (err) {
          return callback(_this.create_error(err, node_name));
        }
        instances = [];
        _ref = result.Reservations;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          reservation = _ref[_i];
          _ref1 = reservation.Instances;
          for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
            instance = _ref1[_j];
            instances.push({
              id: instance.InstanceId,
              state: instance.State.Name,
              address: instance.PublicDnsName
            });
          }
        }
        if (instances.length === 0) {
          return callback(null, 'stopped');
        }
        logsmith.debug('discovered instances', instances);
        selected_instance = instances[instances.length - 1];
        if (!selected_instance) {
          return callback(new Error("could not obtain instance for node " + node_name));
        }
        logsmith.debug('selected instance', selected_instance);
        for (_k = 0, _len2 = instances.length; _k < _len2; _k++) {
          instance = instances[_k];
          if (((_ref2 = instance.state) !== 'shutting-down' && _ref2 !== 'terminated' && _ref2 !== 'stopping' && _ref2 !== 'stopped') && selected_instance !== instance) {
            logsmith.warn("duplicate node " + node_name + " with instance id " + instance.id + " detected");
          }
        }
        state = (function() {
          switch (selected_instance.state) {
            case 'pending':
              return 'booting';
            case 'running':
              return 'running';
            case 'stopped':
              return 'stopped';
            case 'stopping':
              return 'halting';
            case 'terminated':
              return 'stopped';
            case 'shutting-down':
              return 'halting';
            default:
              return null;
          }
        })();
        if (!state) {
          return callback(new Error("undefined state for node " + node_name));
        }
        logsmith.debug("node " + node_name + " with instance id " + selected_instance.id + " has state " + state);
        address = selected_instance.address;
        if (!address) {
          state = 'booting';
        }
        if (state !== 'running') {
          address = null;
        }
        return callback(null, state, address, selected_instance.id);
      });
    };

    _Class.prototype.boot = function(node_name, callback) {
      /*
      		Provider-specific method for booting a node.
      */

      var client, e, map_tags, run_instance, verify_status,
        _this = this;
      try {
        client = this.get_client(node_name);
      } catch (_error) {
        e = _error;
        return callback(this.create_error(e, node_name));
      }
      verify_status = function(callback) {
        return _this.status(node_name, function(err, state, address) {
          if (err) {
            return callback(err);
          }
          if (state === 'booting') {
            return callback(new Error("node " + node_name + " is already booting"));
          }
          if (state === 'running') {
            return callback(new Error("node " + node_name + " is already running"));
          }
          if (state === 'halting') {
            return callback(new Error("node " + node_name + " is halting"));
          }
          return callback(null);
        });
      };
      run_instance = function(callback) {
        var options;
        options = _this.extract_instance_options(node_name);
        options.MinCount = 1;
        options.MaxCount = 1;
        logsmith.debug('run instances with options', options);
        return client.runInstances(options, function(err, result) {
          var instance, instances, selected_instance, _i, _j, _len, _len1, _ref;
          if (err) {
            return callback(_this.create_error(err, node_name));
          }
          instances = [];
          _ref = result.Instances;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            instance = _ref[_i];
            instances.push({
              id: instance.InstanceId
            });
          }
          if (instances.length === 0) {
            return callback(new Error("no instances run for node " + node_name));
          }
          logsmith.debug('ran instances', instances);
          selected_instance = instances[instances.length - 1];
          if (!selected_instance) {
            return callback(new Error("could not create instance for node " + node_name));
          }
          logsmith.debug('selected instance', selected_instance);
          for (_j = 0, _len1 = instances.length; _j < _len1; _j++) {
            instance = instances[_j];
            if (selected_instance !== instance) {
              logsmith.warn("duplicate node " + node_name + " with instance id " + instance_id + " detected");
            }
          }
          return callback(null, selected_instance.id);
        });
      };
      map_tags = function(instance_id, callback) {
        var options;
        options = {
          Resources: [instance_id],
          Tags: [
            {
              Key: 'vortex-node-name',
              Value: node_name
            }, {
              Key: 'vortex-node-namespace',
              Value: _this.extract_namespace(node_name)
            }
          ]
        };
        logsmith.debug('create tags with options', options);
        return client.createTags(options, function(err, result) {
          if (err) {
            return callback(_this.create_error(err, node_name));
          }
          return callback(null, instance_id);
        });
      };
      return async.waterfall([verify_status, run_instance, map_tags], function(err) {
        if (err) {
          return callback(err);
        }
        return _this.status(node_name, callback);
      });
    };

    _Class.prototype.halt = function(node_name, callback) {
      /*
      		Provider-specific method for halting a node.
      */

      var client, e, terminate_instance, unmap_tags, verify_status,
        _this = this;
      try {
        client = this.get_client(node_name);
      } catch (_error) {
        e = _error;
        return callback(this.create_error(e, node_name));
      }
      verify_status = function(callback) {
        return _this.status(node_name, function(err, state, address, instance_id) {
          if (err) {
            return callback(err);
          }
          if (state === 'halting') {
            return callback(new Error("" + node_name + " is already halting"));
          }
          if (state === 'stopped') {
            return callback(new Error("" + node_name + " is already stopped"));
          }
          return callback(null, instance_id);
        });
      };
      terminate_instance = function(instance_id, callback) {
        var options;
        options = {
          InstanceIds: [instance_id]
        };
        logsmith.debug('terminate instances with options', options);
        return client.terminateInstances(options, function(err, result) {
          if (err) {
            return callback(_this.create_error(err, node_name));
          }
          return callback(null, instance_id);
        });
      };
      unmap_tags = function(instance_id, callback) {
        var options;
        options = {
          Resources: [instance_id],
          Tags: [
            {
              Key: 'vortex-node-name',
              Value: node_name
            }, {
              Key: 'vortex-node-namespace',
              Value: _this.extract_namespace(node_name)
            }
          ]
        };
        logsmith.debug('delete tags with options', options);
        return client.deleteTags(options, function(err, result) {
          if (err) {
            return callback(_this.create_error(err, node_name));
          }
          return callback(null, instance_id);
        });
      };
      return async.waterfall([verify_status, terminate_instance, unmap_tags], function(err) {
        if (err) {
          return callback(err);
        }
        return _this.status(node_name, callback);
      });
    };

    _Class.prototype.shell_spec = function(node_name, callback) {
      /*
      		Provider-specific method for obtaining a shell spec from a node.
      */

      var build_spec, ensure_port, obtain_status, passphrase, password, private_key, ssh_port, username,
        _this = this;
      password = this.extract_password(node_name);
      private_key = this.extract_private_key(node_name);
      if (!password && !private_key) {
        return callback(new Error("no password or privateKey provided for node " + node_name));
      }
      ssh_port = this.extract_ssh_port(node_name);
      if (ssh_port) {
        ssh_port = parseInt(ssh_port, 10);
        if (isNaN(ssh_port || ssh_port < 1)) {
          return callback(new Error("ssh port for node " + node_name + " is incorrect"));
        }
      } else {
        ssh_port = 22;
      }
      username = this.extract_username(node_name);
      if (!username) {
        username = 'vortex';
      }
      passphrase = this.extract_passphrase(node_name);
      obtain_status = function(callback) {
        return _this.status(node_name, function(err, state, address) {
          if (err) {
            return callback(err);
          }
          if (state === 'halting') {
            return callback(new Error("node " + node_name + " is halting"));
          }
          if (state === 'stopped') {
            return callback(new Error("node " + node_name + " is stopped"));
          }
          if (!address) {
            return callback(new Error("cannot find network address for node " + node_name));
          }
          return callback(null, address);
        });
      };
      ensure_port = function(address, callback) {
        return portchecker.isOpen(ssh_port, address, function(is_open) {
          var callee, milliseconds, timeout;
          if (is_open) {
            return callback(null, address);
          }
          callee = arguments.callee;
          milliseconds = 10000;
          timeout = function() {
            return portchecker.isOpen(ssh_port, address, callee);
          };
          logsmith.debug("repeat check for ssh port open for node " + node_name + " in " + milliseconds + " milliseconds");
          return setTimeout(timeout, milliseconds);
        });
      };
      build_spec = function(address, callback) {
        var parts, spec, spec_options;
        parts = [];
        parts.push('ssh://');
        parts.push(encodeURIComponent(username));
        if (password) {
          parts.push(':' + encodeURIComponent(password));
        }
        parts.push('@');
        parts.push(address);
        parts.push(':' + ssh_port);
        if (private_key) {
          parts.push(';privateKey=' + encodeURIComponent(private_key));
        }
        if (passphrase) {
          parts.push(';passphrase=' + encodeURIComponent(passphrase));
        }
        spec = parts.join('');
        spec_options = {
          username: username,
          password: password,
          host: address,
          port: ssh_port,
          privateKey: private_key,
          passphrase: passphrase
        };
        return callback(null, spec, spec_options);
      };
      return async.waterfall([obtain_status, ensure_port, build_spec], callback);
    };

    return _Class;

  })();

}).call(this);
