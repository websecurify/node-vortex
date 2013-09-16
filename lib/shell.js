(function() {
  var roost, _ref,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  roost = require('roost');

  exports.Ssh = (function(_super) {
    __extends(_Class, _super);

    function _Class() {
      _ref = _Class.__super__.constructor.apply(this, arguments);
      return _ref;
    }

    /*
    	This is a helper class for launching shells.
    */


    _Class.prototype.shell = function() {
      /*
      		Setup a shell.
      */

      var _this = this;
      return this.step(function(callback) {
        return _this.ssh2.shell({
          term: process.env['TERM'],
          rows: process.stdout.rows,
          cols: process.stdout.columns
        }, function(err, stream) {
          var deinit, init, on_resize;
          if (err) {
            return callback(err);
          }
          on_resize = function() {
            return stream.setWindow(process.stdout.rows, process.stdout.columns);
          };
          init = function() {
            process.stdin.setRawMode(true);
            process.stdout.on('resize', on_resize);
            process.stdin.pipe(stream);
            return stream.pipe(process.stdout, {
              end: false
            });
          };
          deinit = function() {
            process.stdin.unpipe(stream);
            process.stdout.removeListener('resize', on_resize);
            return process.stdin.setRawMode(false);
          };
          process.stdin.on('error', function(error) {
            deinit();
            return callback(error);
          });
          process.stdin.on('end', function() {
            deinit();
            return callback(null);
          });
          stream.on('error', function(error) {
            deinit();
            return callback(error);
          });
          stream.on('end', function() {
            deinit();
            return callback(null);
          });
          return init();
        });
      });
    };

    return _Class;

  })(roost.target_ssh.Target);

}).call(this);
