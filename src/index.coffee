fs = require 'fs'
path = require 'path'

# ---

for file in fs.readdirSync __dirname
	ext = path.extname file
	base = path.basename file, ext
	exports[base] = require path.join __dirname, file
	
