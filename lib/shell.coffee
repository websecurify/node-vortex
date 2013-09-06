roost = require 'roost'

# ---

exports.Ssh = class extends roost.target_ssh.Target
	###
	This is a helper class for launching shells.
	###
	
	shell: () ->
		###
		Setup a shell.
		###
		
		@step (callback) =>
			@ssh2.shell {term: process.env['TERM'], rows: process.stdout.rows, cols: process.stdout.columns}, (err, stream) =>
				return callback err if err;
				
				on_resize = () ->
					stream.setWindow process.stdout.rows, process.stdout.columns
					
				init = () ->
					process.stdin.setRawMode true
					process.stdout.on 'resize', on_resize
					process.stdin.pipe stream
					stream.pipe process.stdout, {end: false}
					
				deinit = () ->
					process.stdin.unpipe stream
					process.stdout.removeListener 'resize', on_resize
					process.stdin.setRawMode false
					
				process.stdin.on 'error', (error) ->
					do deinit
					return callback error
					
				process.stdin.on 'end', () ->
					do deinit
					return callback null
					
				stream.on 'error', (error) ->
					do deinit
					return callback error
					
				stream.on 'end', () ->
					do deinit
					return callback null
					
				do init
				
