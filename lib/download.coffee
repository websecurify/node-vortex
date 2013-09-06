fs = require 'fs'
http = require 'http'
https = require 'https'
logsmith = require 'logsmith'
Progress2 = require 'progress2'

# ---

exports.get = (url, file, callback) ->
	###
	Downloads a url into a file. A progresbar will appear If the right logging level is set.
	###
	
	logsmith.verbose "download #{url} to #{file}"
	
	switch
		when url.match /^http:\/\//i then getter = http
		when url.match /^https:\/\//i then getter = https
		else return callback new Error "unrecognized scheme for url #{url}" if callback
		
	try
		socket = getter.get url, (response) ->
			switch
				when response.statusCode == 401 then return callback new Error "not authorised to download #{url}" if callback
				when response.statusCode == 403 then return callback new Error "not allowed to download #{url}" if callback
				when response.statusCode == 404 then return callback new Error "download #{url} not found" if callback
				when 200 < response.statusCode > 299 then return callback new Error "cannot download #{url}" if callback
				
			if logsmith.level in ['verbose', 'debug', 'silly']
				content_length = parseInt response.headers['content-length'], 10
				
				if not isNaN content_length
					progress = new Progress2 'downloading [:bar] :percent :etas', {
						complete: '='
						incomplete: ' '
						total: content_length
						width: 40
					}
					
					response.on 'data', (chunk) -> progress.tick chunk.length
					response.on 'end', () -> process.stdout.write '\n'
					
			stream = fs.createWriteStream file
			
			stream.on 'error', (error) -> callback new Error "cannot write to file #{file} for download #{url}" if callback
			response.on 'error', (error) -> callback new Error "cannot download from url #{url} to file #{file}" if callback
			response.on 'end', () -> callback null if callback
			response.pipe stream
			
		socket.on 'error', (error) -> callback error if callback
	catch e
		return callback e if callback
		
