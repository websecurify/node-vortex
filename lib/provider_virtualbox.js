(function() {
  var async, download, fs, logsmith, path_extra, portchecker, shell_quote, url, vboxmanage;

  fs = require('fs');

  url = require('url');

  async = require('async');

  logsmith = require('logsmith');

  path_extra = require('path-extra');

  vboxmanage = require('vboxmanage');

  portchecker = require('portchecker');

  shell_quote = require('shell-quote');

  download = require('./download');

  exports.Provider = (function() {
    /*
    	This class exposes VirtualBox as a provider to Vortex.
    */

    function _Class(manifest) {
      this.manifest = manifest;
      /*
      		The provider accepts a manifest as a parameter by specification.
      */

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
      if ((node != null ? (_ref = node.virtualbox) != null ? _ref[property_name] : void 0 : void 0) != null) {
        return node.virtualbox[property_name];
      }
      if (((_ref1 = this.manifest.virtualbox) != null ? _ref1[property_name] : void 0) != null) {
        return this.manifest.virtualbox[property_name];
      }
      return null;
    };

    _Class.prototype.extract_vm_id = function(node_name) {
      return this.extract_property('vmId', node_name);
    };

    _Class.prototype.extract_vm_url = function(node_name) {
      return this.extract_property('vmUrl', node_name);
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

    _Class.prototype.get_node_handle = function(node_name) {
      /*
      		Creates a VirtualBox friendlier name out of a node name. The method take into account the namespace.
      */

      var namespace;
      namespace = this.extract_namespace(node_name);
      return (namespace ? namespace + ':' : '') + node_name;
    };

    _Class.prototype.get_share_handle = function(share_name) {
      /*
      		Creates a VirtualBox friendlier name out of a share name.
      */

      return share_name.replace(/[^\w]+/, '_').replace(/_+/, '_');
    };

    _Class.prototype.schedule_import = function(vm_url, vm_id, callback) {
      /*
      		Schedules import operation. The function will check if the vm_id exists before execution.
      */

      var task,
        _this = this;
      if (this.import_queue == null) {
        this.import_queue = async.queue(function(task, callback) {
          return vboxmanage.machine.info(task.vm_id, function(err, info) {
            if (!err) {
              return callback(null);
            }
            return _this.perform_import(task.vm_url, task.vm_id, callback);
          });
        });
      }
      task = {
        vm_url: vm_url,
        vm_id: vm_id
      };
      return this.import_queue.push(task, callback);
    };

    _Class.prototype.perform_import = function(vm_url, vm_id, callback) {
      /*
      		Performs import operation.
      */

      var local_name, local_path, spec, _ref;
      logsmith.debug("import " + vm_url + " into " + vm_id);
      try {
        spec = url.parse(vm_url);
      } catch (_error) {
        return callback(new Error("cannot parse url " + vm_url));
      }
      if ((_ref = spec.protocol) !== 'file:' && _ref !== 'http:' && _ref !== 'https:') {
        return callback(new Error("unsupported scheme for url " + vm_url));
      }
      if (spec.protocol === 'file') {
        if (!spec.host) {
          local_path = spec.pathname;
        } else {
          local_path = path_extra.resolve(path_extra.dirname(this.manifest.meta.location), path_extra.join(spec.host, spec.pathname));
        }
        return vboxmanage.machine["import"](local_path, vm_id, callback);
      } else {
        local_name = (new Date()).getTime() + '-' + path_extra.basename(spec.pathname);
        local_path = path_extra.join(path_extra.tempdir(), local_name);
        return download.get(vm_url, local_path, function(err) {
          if (err) {
            fs.unlink(local_path, function(err) {
              if (err) {
                return logsmith.exception(err);
              }
            });
            return callback(err);
          }
          return vboxmanage.machine["import"](local_path, vm_id, function(err) {
            fs.unlink(local_path, function(err) {
              if (err) {
                return logmisth.exception(err);
              }
            });
            if (err) {
              return callback(err);
            }
            return callback(null);
          });
        });
      }
    };

    _Class.prototype.bootstrap = function(node_name, callback) {
      /*
      		Provider-specific method for bootstrapping a node.
      */

      var commands, node_handle, prepare_exposed, run_commands, verify_status,
        _this = this;
      commands = ['sudo mkdir -p /etc/vortex/flags/', 'sudo chmod a+rx /etc/vortex/flags/', '[ ! -f /etc/vortex/flags/network_ready ] && sudo ifconfig eth1 0.0.0.0 0.0.0.0', '[ ! -f /etc/vortex/flags/network_ready ] && sudo ifconfig eth2 0.0.0.0 0.0.0.0', '[ ! -f /etc/vortex/flags/network_ready ] && sudo dhclient -r eth1 eth2', '[ ! -f /etc/vortex/flags/network_ready ] && sudo dhclient eth1 eth2', '[ ! -f /etc/vortex/flags/network_ready ] && sudo touch /etc/vortex/flags/network_ready'];
      node_handle = this.get_node_handle(node_name);
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
      prepare_exposed = function(callback) {
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
            var share_handle;
            if (err) {
              return callback(new Error("cannot expose " + exposure.src + " because it does not exist"));
            }
            if (stats.isDirectory()) {
              share_handle = _this.get_share_handle(exposure.dst);
              commands.push(shell_quote.quote(['sudo', 'mkdir', '-p', exposure.dst]));
              commands.push(shell_quote.quote(['sudo', 'mount.vboxsf', share_handle, exposure.dst, '-o', 'rw']));
              return callback(null);
            } else {
              return vboxmanage.instance.copy_from(source_path, exposure.dst, callback);
            }
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
      run_commands = function(callback) {
        var run_command;
        run_command = function(command, callback) {
          return vboxmanage.instance.exec(node_handle, 'vortex', 'vortex', '/bin/sh', '-c', command, function(err, output) {
            var _ref;
            if (err) {
              return callback(err);
            }
            if ((_ref = logsmith.level) === 'verbose' || _ref === 'debug' || _ref === 'silly') {
              process.stdout.write(output);
            }
            return callback(null);
          });
        };
        return async.eachSeries(commands, run_command, callback);
      };
      return async.waterfall([verify_status, prepare_exposed, run_commands], function(err, state, address) {
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

      var node_handle, obtain_machine_address, obtain_machine_state;
      node_handle = this.get_node_handle(node_name);
      obtain_machine_state = function(callback) {
        return vboxmanage.machine.info(node_handle, function(err, info) {
          var state;
          if (err) {
            return callback(null, 'stopped');
          }
          state = info.VMState.toLowerCase();
          switch (state) {
            case 'saved':
              state = 'paused';
              break;
            case 'paused':
              state = 'paused';
              break;
            case 'running':
              state = 'running';
              break;
            case 'starting':
              state = 'booting';
              break;
            case 'powered off':
              state = 'stopped';
              break;
            case 'guru meditation':
              state = 'paused';
          }
          return callback(null, state);
        });
      };
      obtain_machine_address = function(state, callback) {
        return vboxmanage.adaptors.list(node_handle, function(err, adaptors) {
          var address, e;
          if (err) {
            return callback(null, 'stopped', address);
          }
          try {
            address = adaptors['Adaptor 1'].V4.IP;
          } catch (_error) {
            e = _error;
            address = null;
            state = 'booting';
          }
          return callback(null, state, address);
        });
      };
      return async.waterfall([obtain_machine_state, obtain_machine_address], function(err, state, address) {
        if (err) {
          return callback(err);
        }
        return callback(null, state, address);
      });
    };

    _Class.prototype.boot = function(node_name, callback) {
      /*
      		Provider-specific method for booting a node.
      */

      var attemp_to_remove_vm, clone_vm, ensure_networking, ensure_vm_id, node_handle, setup_vm, start_vm, verify_status, vm_id,
        _this = this;
      vm_id = this.extract_vm_id(node_name);
      if (!vm_id) {
        return callback(new Error('no virtualbox "vmId" paramter specified for node'));
      }
      node_handle = this.get_node_handle(node_name);
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
          if (state === 'paused') {
            return callback(new Error("node " + node_name + " is paused"));
          }
          return callback(null);
        });
      };
      attemp_to_remove_vm = function(callback) {
        return vboxmanage.machine.remove(node_handle, function(err) {
          if (err) {
            logsmith.exception(err);
          }
          return callback(null);
        });
      };
      ensure_vm_id = function(callback) {
        return vboxmanage.machine.info(vm_id, function(err, info) {
          var vm_url;
          if (!err) {
            return callback(null);
          }
          vm_url = _this.extract_vm_url(node_name);
          if (vm_url == null) {
            return callback(new Error('no virtualbox "vmUrl" paramter specified for node'));
          }
          return _this.schedule_import(vm_url, vm_id, callback);
        });
      };
      clone_vm = function(callback) {
        return vboxmanage.machine.clone(vm_id, node_handle, callback);
      };
      ensure_networking = function(callback) {
        var config;
        config = {
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
        return vboxmanage.setup.system(config, callback);
      };
      setup_vm = function(callback) {
        var config, dst, e, node, share_handle, src, _ref;
        config = {
          network: {
            adaptors: [
              {
                type: 'hostonly',
                network: 'vboxnet5'
              }, {
                type: 'internal',
                network: 'vortex'
              }, {
                type: 'nat'
              }
            ]
          },
          shares: {}
        };
        try {
          node = _this.get_node(node_name);
        } catch (_error) {
          e = _error;
          return callback(e);
        }
        if (node.expose != null) {
          _ref = node.expose;
          for (src in _ref) {
            dst = _ref[src];
            src = path_extra.resolve(path_extra.dirname(_this.manifest.meta.location), src);
            share_handle = _this.get_share_handle(dst);
            config.shares[share_handle] = src;
          }
        }
        return vboxmanage.setup.machine(node_handle, config, callback);
      };
      start_vm = function(callback) {
        return vboxmanage.instance.start(node_handle, callback);
      };
      return async.waterfall([verify_status, attemp_to_remove_vm, ensure_vm_id, clone_vm, ensure_networking, setup_vm, start_vm], function(err) {
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

      var attempt_to_remove_vm, attempt_to_stop_vm, node_handle, verify_status,
        _this = this;
      node_handle = this.get_node_handle(node_name);
      verify_status = function(callback) {
        return _this.status(node_name, function(err, state, address) {
          if (err) {
            return callback(err);
          }
          if (state === 'halting') {
            return callback(new Error("" + node_name + " is already halting"));
          }
          if (state === 'stopped') {
            return callback(new Error("" + node_name + " is already stopped"));
          }
          return callback(null);
        });
      };
      attempt_to_stop_vm = function(callback) {
        return vboxmanage.instance.stop(node_handle, function(err) {
          if (err) {
            logsmith.exception(err);
          }
          return callback(null);
        });
      };
      attempt_to_remove_vm = function(callback) {
        return vboxmanage.machine.remove(node_handle, function(err) {
          if (err) {
            logsmith.exception(err);
          }
          return callback(null);
        });
      };
      return async.waterfall([verify_status, attempt_to_stop_vm, attempt_to_remove_vm], function(err) {
        if (err) {
          return callback(err);
        }
        return _this.status(node_name, callback);
      });
    };

    _Class.prototype.pause = function(node_name, callback) {
      /*
      		Provider-specific method for pausing a machine.
      */

      var node_handle, pause_vm, verify_status,
        _this = this;
      node_handle = this.get_node_handle(node_name);
      verify_status = function(callback) {
        return _this.status(node_name, function(err, state, address) {
          if (err) {
            return callback(err);
          }
          if (state === 'paused') {
            return callback(new Error("" + node_name + " is already paused"));
          }
          if (state === 'halting') {
            return callback(new Error("" + node_name + " is halting"));
          }
          if (state === 'stopped') {
            return callback(new Error("" + node_name + " is stopped"));
          }
          return callback(null);
        });
      };
      pause_vm = function(callback) {
        return vboxmanage.instance.save(node_handle, callback);
      };
      return async.waterfall([verify_status, pause_vm], function(err) {
        if (err) {
          return callback(err);
        }
        return _this.status(node_name, callback);
      });
    };

    _Class.prototype.resume = function(node_name, callback) {
      /*
      		Provider-specific method for resuming a machine.
      */

      var attempt_resume_vm, attempt_start_vm, node_handle, verify_status,
        _this = this;
      node_handle = this.get_node_handle(node_name);
      verify_status = function(callback) {
        return _this.status(node_name, function(err, state, address) {
          if (err) {
            return callback(err);
          }
          if (state === 'booting') {
            return callback(new Error("" + node_name + " is already booting"));
          }
          if (state === 'running') {
            return callback(new Error("" + node_name + " is already running"));
          }
          if (state === 'halting') {
            return callback(new Error("" + node_name + " is halting"));
          }
          if (state === 'stopped') {
            return callback(new Error("" + node_name + " is stopped"));
          }
          return callback(null);
        });
      };
      attempt_start_vm = function(callback) {
        return vboxmanage.instance.start(node_handle, function(err) {
          if (err) {
            logsmith.exception(err);
          }
          return callback(null);
        });
      };
      attempt_resume_vm = function(callback) {
        return vboxmanage.instance.resume(node_handle, function(err) {
          if (err) {
            logsmith.exception(err);
          }
          return callback(null);
        });
      };
      return async.waterfall([verify_status, attempt_start_vm, attempt_resume_vm], function(err) {
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
