(function() {
  var fs, path;

  fs = require('fs');

  path = require('path');

  exports.locate = function(location) {
    /*
    	Locates a manifest. There are different strategies where to find the manifest file.
    */

    var file, stat;
    file = location != null ? location : path.join(process.cwd(), 'vortex.json');
    if (!fs.existsSync(file)) {
      throw new Error('vortex manifest not found');
    }
    stat = fs.statSync(file);
    if (stat.isDirectory()) {
      file = path.resolve(file, 'vortex.json');
      stat = fs.statSync(file);
    }
    if (!stat.isFile()) {
      throw new Error('vortex manifest does not exist');
    }
    return file;
  };

  exports.load = function(location) {
    /*
    	Loads a manifest. The manifest is initialized with a meta object containing its location.
    */

    var manifest;
    manifest = require(location);
    manifest.meta = {
      location: location
    };
    return manifest;
  };

}).call(this);
