(function() {
  var actions;

  actions = require('./actions');

  exports.launch = function(opt, manifest, plugins, provider, action, callback) {
    /*
    	Main method for putting toghether the entire logic of Vortex.
    */

    var node_name, plugin, selected_nodes, traversed_nodes, _i, _j, _len, _len1, _ref;
    if (actions[action] == null) {
      return callback(new Error("action " + action + " is not recognized"));
    }
    if (plugins) {
      [
        (function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = plugins.length; _i < _len; _i++) {
            plugin = plugins[_i];
            _results.push(plugin.vortex(opt, manifest, provider, action));
          }
          return _results;
        })()
      ];
    }
    if (manifest.nodes == null) {
      return callback(new Error("no nodes defined in the vortex manifest"));
    }
    selected_nodes = [];
    traversed_nodes = selected_nodes;
    _ref = opt.argv.slice(1);
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      node_name = _ref[_i];
      if (node_name === '--') {
        traversed_nodes = [];
      } else {
        traversed_nodes.push(node_name);
      }
    }
    if (selected_nodes.length === 0) {
      selected_nodes = Object.keys(manifest.nodes);
    }
    if (selected_nodes.length === 0) {
      return callback(new Error("no nodes selected for action " + action));
    }
    for (_j = 0, _len1 = selected_nodes.length; _j < _len1; _j++) {
      node_name = selected_nodes[_j];
      if (manifest.nodes[node_name] == null) {
        return callback(new Error("node " + node_name + " does not exist"));
      }
    }
    return actions[action](opt, manifest, provider, selected_nodes, callback);
  };

}).call(this);
