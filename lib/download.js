var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var Progress2 = require('progress2');

// ---

var logger = require(path.join(__dirname, 'logger.js'));
var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

function get(url, file, callback) {
	logger.verbose('download', helpers.q(url), 'to', helpers.q(file));
	
	var get;
	
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
			if (response.statusCode == 401) {
				return callback(helpers.e('not authorised to download', helpers.q(url)));
			} else
			if (response.statusCode == 403) {
				return callback(helpers.e('not allowed to download', helpers.q(url)));
			} else
			if (response.statusCode == 404) {
				return callback(helpers.e('download', helpers.q(url), 'not found'));
			}
			
			if (response.statusCode <= 199 && response.statusCode >= 300) {
				return callback(helpers.e('cannot download', helpers.q(url)));
			}
			
			if (['verbose', 'debug', 'silly'].indexOf(logger.level) >= 0) {
				var contentLength = parseInt(response.headers['content-length'], 10);
				
				if (!isNaN(contentLength)) {
					var progress = new Progress2('downloading [:bar] :percent :etas', {
						complete: '=',
						incomplete: ' ',
						total: contentLength,
						width: 40
					});
					
					response.on('data', function(chunk) {
						progress.tick(chunk.length);
					});
					
					response.on('end', function() {
						console.log('\n');
					});
				}
			}
			
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
