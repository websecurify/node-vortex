fs = require 'fs'
path = require 'path'

# ---

exports.locate = (location) ->
	file = location ? path.join process.cwd(), 'vortex.json'
	
	throw new Error 'vortex manifest not found' if not fs.existsSync file
	
	stat = fs.statSync file
	
	if stat.isDirectory()
		file = path.resolve file, 'vortex.json'
		stat = fs.statSync file
		
	throw new Error 'vortex manifest does not exist' if not stat.isFile()
	
	return file
	
exports.load = (location) ->
	manifest = require location
	manifest.meta = location: location
	
	return manifest
	
