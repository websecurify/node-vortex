(function() {
  var instances;

  exports.amazon = require('./provider_amazon').Provider;

  exports.virtualbox = require('./provider_virtualbox').Provider;

  instances = {};

  exports.instance = function(name, manifest) {
    /*
    	Gets a single instance of a Provider. The methods esentially provides a way of getting singleton instances.
    */

    var nice_name;
    nice_name = name.toLowerCase();
    if (instances[nice_name] == null) {
      if ((exports[nice_name] != null) && nice_name !== 'instance') {
        instances[nice_name] = new exports[nice_name](manifest);
        instances[nice_name].name = nice_name;
      } else {
        throw new Error("provider " + name + " is not found");
      }
    }
    return instances[nice_name];
  };

}).call(this);
