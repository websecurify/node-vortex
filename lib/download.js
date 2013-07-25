var fs = require('fs');
var path = require('path');
var http = require('http');

// ---

var logger = require(path.join(__dirname, 'logger.js'));
var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

function get(url, file, callback) {
	logger.verbose('download', helpers.q(url), 'to', helpers.q(file));
	
	http.get(url, function (response) {
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
}

// ---

exports.get = get;
