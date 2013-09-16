(function() {
  var base, ext, file, fs, path, _i, _len, _ref;

  fs = require('fs');

  path = require('path');

  _ref = fs.readdirSync(__dirname);
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    file = _ref[_i];
    ext = path.extname(file);
    base = path.basename(file, ext);
    exports[base] = require(path.join(__dirname, file));
  }

}).call(this);
