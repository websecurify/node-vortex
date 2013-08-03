var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');

// ---

var logger = require(path.join(__dirname, 'logger.js'));
var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

function get(url, file, callback) {
	logger.verbose('download', helpers.q(url), 'to', helpers.q(file));
	
	var getter;
	
	if (url.match(/^http:\/\//i)) {
		getter = http;
	} else
	if (url.match(/^https:\/\//i)) {
		getter = https;
	} else {
		return callback(helpers.e('cannot get url', helpers.q(url)));
	}
	
	try {
		getter.get(url, function (response) {
			var stream = fs.createWriteStream(file);
			
			stream.on('error', function (error) {
				return callback(helpers.e('cannot write to file', helpers.q(file), 'for download from', helpers.q(url)));
			});
			
			response.on('error', function (error) {
				return callback(helpers.e('cannot download', helpers.q(url), 'to file', helpers.q(file)));
			});
			
			response.on('end', function () {
				return callback();
			});
			
			response.pipe(stream);
		}).on('error', function (error) {
			return callback(error);
		});
	} catch (e) {
		return callback(e);
	}
}

// ---

exports.get = get;
