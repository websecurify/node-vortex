(function() {
  var path,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  path = require('path');

  exports.obtain = function(manifest) {
    /*
    	Obtains a list of plugins specified in the manifest.
    */

    var failure, name, plugins, root, true_values, value;
    if (manifest.plugins == null) {
      return;
    }
    true_values = [1, '1', true, 'true'];
    if (Array.isArray(manifest.plugins)) {
      plugins = manifest.plugins;
    } else {
      plugins = [
        (function() {
          var _ref, _results;
          if (__indexOf.call(true_values, value) >= 0) {
            _ref = manifest.plugins;
            _results = [];
            for (name in _ref) {
              value = _ref[name];
              _results.push(name);
            }
            return _results;
          }
        })()
      ];
    }
    root = path.dirname(manifest.meta.location);
    failure = function(err) {
      if (err.code !== 'MODULE_NOT_FOUND') {
        throw new Error("cannot load plugin " + name);
      }
    };
    return plugins.map(function(name) {
      var e, plugin;
      try {
        plugin = require(path.resolve(root, name));
      } catch (_error) {
        e = _error;
        failure(e);
        try {
          plugin = require(path.resolve(path.join(root, 'node_modules'), name));
        } catch (_error) {
          e = _error;
          failure(e);
          try {
            plugin = require(name);
          } catch (_error) {
            e = _error;
            failure(e);
            throw e;
          }
        }
      }
      if (plugin.getVortex != null) {
        plugin = plugin.getVortex(manifest);
      }
      if (plugin.vortex == null) {
        throw new Error("plugins " + name + " is not comptabile");
      }
      return plugin;
    });
  };

}).call(this);
