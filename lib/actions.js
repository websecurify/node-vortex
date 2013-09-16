(function() {
  var async, fs, logsmith, path, roost, shell, shell_quote,
    __slice = [].slice;

  fs = require('fs');

  path = require('path');

  async = require('async');

  roost = require('roost');

  logsmith = require('logsmith');

  shell_quote = require('shell-quote');

  shell = require('./shell');

  exports.actions = function(opt, manifest, provider, node_name, callback) {
    /*
    	Prints out the available actions.
    */

    var action_fn, action_name, desc, _ref, _results;
    _results = [];
    for (action_name in exports) {
      action_fn = exports[action_name];
      desc = (_ref = action_fn.toString().split('\n').slice(2, 3)[0]) != null ? _ref.trim() : void 0;
      _results.push(logsmith.info(action_name, '-', desc));
    }
    return _results;
  };

  exports.status = function(opt, manifest, provider, node_names, callback) {
    /*
    	Obtains state and network address if the selected node is running.
    */

    var process_node;
    process_node = function(node_name, callback) {
      logsmith.verbose("query status for node " + node_name);
      return provider.status(node_name, function(err, state, address) {
        var args;
        if (err) {
          return callback(err);
        }
        args = ['node', node_name, 'is', state];
        if (address) {
          args.push('at');
          args.push(address);
        }
        logsmith.info.apply(logsmith, args);
        return callback(null);
      });
    };
    return async.eachSeries(node_names, process_node, callback);
  };

  exports.shellspec = function(opt, manifest, provider, node_names, callback) {
    /*
    	Obtains the shell specification (typically ssh url) for the selected node.
    */

    var process_node;
    process_node = function(node_name, callback) {
      logsmith.verbose("query shell spec for node " + node_name);
      return provider.shell_spec(node_name, function(err, spec) {
        if (err) {
          return callback(err);
        }
        logsmith.info(node_name, '->', spec);
        return callback(null, spec);
      });
    };
    return async.eachSeries(node_names, process_node, callback);
  };

  exports.boot = function(opt, manifest, provider, node_names, callback) {
    /*
    	Ensures that the node is running.
    */

    var process_node;
    process_node = function(node_name, callback) {
      logsmith.verbose("halt node " + node_name);
      return provider.boot(node_name, function(err, state, address) {
        var args;
        if (err) {
          logsmith.error(err.message);
        }
        if (err) {
          return callback(null);
        }
        args = ['node', node_name, 'is', state];
        if (address) {
          args.push('at');
          args.push(address);
        }
        logsmith.info.apply(logsmith, args);
        return callback(null);
      });
    };
    return async.eachSeries(node_names, process_node, callback);
  };

  exports.halt = function(opt, manifest, provider, node_names, callback) {
    /*
    	Ensures that the node is stopped.
    */

    var process_node;
    process_node = function(node_name, callback) {
      logsmith.verbose("halt node " + node_name);
      return provider.halt(node_name, function(err, state, address) {
        var args;
        if (err) {
          logsmith.error(err.message);
        }
        if (err) {
          return callback(null);
        }
        args = ['node', node_name, 'is', state];
        if (address) {
          args.push('at');
          args.push(address);
        }
        logsmith.info.apply(logsmith, args);
        return callback(null);
      });
    };
    return async.eachSeries(node_names, process_node, callback);
  };

  exports.restart = function(opt, manifest, provider, node_names, callback) {
    /*
    	Chains actions halt and then boot for every node.
    */

    var actions, process_node;
    actions = [];
    actions.push(function(node_name, callback) {
      return exports.halt(opt, manifest, provider, [node_name], function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null, node_name);
      });
    });
    actions.push(function(node_name, callback) {
      return exports.boot(opt, manifest, provider, [node_name], function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null, node_name);
      });
    });
    process_node = function(node_name, callback) {
      var current_actions;
      logsmith.verbose("restart node " + node_name);
      current_actions = [(function(callback) {
          return callback(null, node_name);
        })].concat(__slice.call(actions));
      return async.waterfall(current_actions, callback);
    };
    return async.eachSeries(node_names, process_node, callback);
  };

  exports.provision = function(opt, manifest, provider, node_names, callback) {
    /*
    	Starts the provisioner on the selected node.
    */

    var actions, merge_objects, merge_roost, process_node;
    actions = [];
    merge_objects = function(a, b) {
      var key, value;
      for (key in b) {
        value = b[key];
        if (a[key] != null) {
          a[key] = (function() {
            switch (false) {
              case !Array.isArray(a[key]):
                return a[key].concat(b[key]);
              case !(typeof a[key] === 'number' || a[key] instanceof Number):
                return b[key];
              case !(typeof a[key] === 'string' || a[key] instanceof String):
                return b[key];
              case !(typeof a[key] === 'boolean' || a[key] instanceof Boolean):
                return b[key];
              default:
                return arguments.callee(a[key], b[key]);
            }
          }).apply(this, arguments);
        } else {
          a[key] = b[key];
        }
      }
      return a;
    };
    merge_roost = function(manifest, configs) {
      if (configs.length === 0) {
        return null;
      }
      return configs.map((function(config) {
        if (typeof config === 'string' || config instanceof String) {
          return roost.manifest.load(path.resolve(path.dirname(manifest.meta.location), config));
        } else {
          return config;
        }
      })).reduce((function(previous_value, current_value) {
        if (!previous_value) {
          return JSON.parse(JSON.stringify(current_value));
        }
        if ((current_value.merge != null) && current_value.merge) {
          return merge_objects(previous_value, current_value);
        } else {
          return current_value;
        }
      }), null);
    };
    actions.push(function(node_name, callback) {
      return provider.bootstrap(node_name, function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null, node_name);
      });
    });
    actions.push(function(node_name, callback) {
      var e, merge_configs, node_manifest, roost_manifest, roost_plugins, _ref;
      node_manifest = manifest.nodes[node_name];
      merge_configs = [];
      if (typeof manifestroost !== "undefined" && manifestroost !== null) {
        merge_configs.push(manifest.roost);
      }
      if (node_manifest.roost != null) {
        merge_configs.push(node_manifest.roost);
      }
      if (((_ref = node_manifest[provider.name]) != null ? _ref.roost : void 0) != null) {
        merge_configs.push(node_manifest[provider.name].roost);
      }
      roost_manifest = merge_roost(manifest, merge_configs);
      if (!roost_manifest) {
        return callback(new Error("no roost configuration defined for node " + node_name));
      }
      if (merge_configs.length > 0 && (roost_manifest.meta == null)) {
        roost_manifest.meta = {
          location: manifest.meta.location
        };
      }
      try {
        roost_plugins = roost.plugins.obtain(roost_manifest);
      } catch (_error) {
        e = _error;
        return callback(e);
      }
      node_manifest.roost = roost_manifest;
      return callback(null, node_name, roost_manifest, roost_plugins);
    });
    actions.push(function(node_name, roost_manifest, roost_plugins, callback) {
      return provider.shell_spec(node_name, function(err, spec) {
        if (err) {
          return callback(err);
        }
        return callback(null, node_name, roost_manifest, roost_plugins, spec);
      });
    });
    actions.push(function(node_name, roost_manifest, roost_plugins, spec, callback) {
      var obtain_status;
      if (roost_manifest.bootstrap == null) {
        roost_manifest.bootstrap = [];
      }
      roost_manifest.bootstrap.push('sudo mkdir -p /etc/vortex/nodes/');
      obtain_status = function(node_name, callback) {
        return provider.status(node_name, function(err, state, address) {
          if (err) {
            return callback(err);
          }
          return callback(null, {
            node_name: node_name,
            address: address
          });
        });
      };
      return async.map(Object.keys(manifest.nodes), obtain_status, function(err, results) {
        var address, file, result, _i, _len;
        if (err) {
          return callback(err);
        }
        for (_i = 0, _len = results.length; _i < _len; _i++) {
          result = results[_i];
          if (result.node_name === node_name) {
            continue;
          }
          if (!result.address) {
            logsmith.error("node " + node_name + " does not expose address");
            continue;
          }
          address = shell_quote.quote([result.address]);
          file = shell_quote.quote(["/etc/vortex/nodes/" + result.node_name]);
          roost_manifest.bootstrap.unshift("echo " + address + " | sudo tee " + file);
        }
        return callback(null, node_name, roost_manifest, roost_plugins, spec);
      });
    });
    actions.push(function(node_name, roost_manifest, roost_plugins, spec, callback) {
      var e, roost_opt, roost_target;
      try {
        roost_target = roost.targets.create(spec, roost_manifest);
      } catch (_error) {
        e = _error;
        return callback(e);
      }
      roost_opt = {
        options: {},
        argv: []
      };
      if (opt.options.dry != null) {
        roost_opt.options.dry = opt.options.dry;
      }
      return roost.engine.launch(roost_opt, roost_manifest, roost_plugins, roost_target, callback);
    });
    process_node = function(node_name, callback) {
      var current_actions;
      logsmith.info("provision node " + node_name);
      current_actions = [(function(callback) {
          return callback(null, node_name);
        })].concat(__slice.call(actions));
      return async.waterfall(current_actions, callback);
    };
    return async.eachSeries(node_names, process_node, callback);
  };

  exports.up = function(opt, manifest, provider, node_names, callback) {
    /*
    	Will bring up a node by first booting it and than starting the provisioning process.
    */

    var process_node;
    process_node = function(node_name, callback) {
      return provider.status(node_name, function(err, state, address) {
        if (err) {
          return callback(err);
        }
        if (state === 'stopped') {
          return provider.boot(node_name, function(err, state, address) {
            var perform_provision;
            if (err) {
              return callback(err);
            }
            perform_provision = function(state, address) {
              var callee, timeout_handler;
              if (state === 'running' && address) {
                return exports.provision(opt, manifest, provider, [node_name], callback);
              } else {
                callee = arguments.callee;
                timeout_handler = function() {
                  return provider.status(node_name, function(err, state, address) {
                    if (err) {
                      return callback(err);
                    }
                    return callee(state, address);
                  });
                };
                return setTimeout(timeout_handler, 1000);
              }
            };
            return perform_provision(state, address);
          });
        } else {
          return callback(null);
        }
      });
    };
    return async.eachSeries(node_names, process_node, callback);
  };

  exports.down = function(opt, manifest, provider, node_names, callback) {
    /*
    	Will bring down a node. At the moment this action is a alias for action halt.
    */

    var process_node;
    process_node = function(node_name, callback) {
      return provider.status(node_name, function(err, state, address) {
        if (err) {
          return callback(err);
        }
        if (state === 'stopped') {
          return callback(null);
        }
        return provider.halt(node_name, callback);
      });
    };
    return async.eachSeries(node_names, process_node, callback);
  };

  exports.reload = function(opt, manifest, provider, node_names, callback) {
    /*
    	Chains actions down and then up for every node.
    */

    var actions, process_node;
    actions = [];
    actions.push(function(node_name, callback) {
      return exports.down(opt, manifest, provider, [node_name], function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null, node_name);
      });
    });
    actions.push(function(node_name, callback) {
      return exports.up(opt, manifest, provider, [node_name], function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null, node_name);
      });
    });
    process_node = function(node_name, callback) {
      var current_actions;
      logsmith.verbose("reload node " + node_name);
      current_actions = [(function(callback) {
          return callback(null, node_name);
        })].concat(__slice.call(actions));
      return async.waterfall(current_actions, callback);
    };
    return async.eachSeries(node_names, process_node, callback);
  };

  exports.shell = function(opt, manifest, provider, node_names, callback) {
    /*
    	Starts a shell or executes a command on the selected node.
    */

    var actions, process_node;
    actions = [];
    actions.push(function(node_name, callback) {
      return provider.shell_spec(node_name, function(err, spec) {
        if (err) {
          return callback(err);
        }
        if (!spec.match(/^ssh:/i)) {
          return callback(new Error("unsupported shell spec " + spec));
        }
        return callback(null, spec);
      });
    });
    actions.push(function(spec, callback) {
      var command, ssh;
      ssh = new shell.Ssh(spec, manifest);
      command = opt.argv.slice(opt.argv.indexOf('--') + 1);
      if (command.length === opt.argv.length) {
        command = null;
      } else {
        command = command.join(' ');
      }
      if (command) {
        ssh.exec(command);
      } else {
        ssh.shell();
      }
      return ssh.ignite(false, function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null);
      });
    });
    process_node = function(node_name, callback) {
      var current_actions;
      logsmith.info("shell into node " + node_name);
      current_actions = [(function(callback) {
          return callback(null, node_name);
        })].concat(__slice.call(actions));
      return async.waterfall(current_actions, callback);
    };
    return async.eachSeries(node_names, process_node, callback);
  };

}).call(this);
