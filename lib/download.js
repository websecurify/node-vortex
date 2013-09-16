(function() {
  var Progress2, fs, http, https, logsmith;

  fs = require('fs');

  http = require('http');

  https = require('https');

  logsmith = require('logsmith');

  Progress2 = require('progress2');

  exports.get = function(url, file, callback) {
    /*
    	Downloads a url into a file. A progresbar will appear If the right logging level is set.
    */

    var e, getter, socket;
    logsmith.verbose("download " + url + " to " + file);
    switch (false) {
      case !url.match(/^http:\/\//i):
        getter = http;
        break;
      case !url.match(/^https:\/\//i):
        getter = https;
        break;
      default:
        if (callback) {
          return callback(new Error("unrecognized scheme for url " + url));
        }
    }
    try {
      socket = getter.get(url, function(response) {
        var content_length, progress, stream, _ref, _ref1;
        switch (false) {
          case response.statusCode !== 401:
            if (callback) {
              return callback(new Error("not authorized to download " + url));
            }
            break;
          case response.statusCode !== 403:
            if (callback) {
              return callback(new Error("not allowed to download " + url));
            }
            break;
          case response.statusCode !== 404:
            if (callback) {
              return callback(new Error("download " + url + " not found"));
            }
            break;
          case !((200 < (_ref = response.statusCode) && _ref > 299)):
            if (callback) {
              return callback(new Error("cannot download " + url));
            }
        }
        if ((_ref1 = logsmith.level) === 'verbose' || _ref1 === 'debug' || _ref1 === 'silly') {
          content_length = parseInt(response.headers['content-length'], 10);
          if (!isNaN(content_length)) {
            progress = new Progress2('downloading [:bar] :percent :etas', {
              complete: '=',
              incomplete: ' ',
              total: content_length,
              width: 40
            });
            response.on('data', function(chunk) {
              return progress.tick(chunk.length);
            });
            response.on('end', function() {
              return process.stdout.write('\n');
            });
          }
        }
        stream = fs.createWriteStream(file);
        stream.on('error', function(error) {
          return callback(new Error("cannot write to file " + file + " for download " + url));
        });
        response.on('error', function(error) {
          return callback(new Error("cannot download from url " + url + " to file " + file));
        });
        response.on('end', function() {
          return callback(null);
        });
        return response.pipe(stream);
      });
      return socket.on('error', function(error) {
        if (callback) {
          return callback(error);
        }
      });
    } catch (_error) {
      e = _error;
      if (callback) {
        return callback(e);
      }
    }
  };

}).call(this);
