fs = require 'fs'
path = require 'path'
async = require 'async'
roost = require 'roost'
logsmith = require 'logsmith'
shell_quote = require 'shell-quote'

# ---

shell = require './shell'

# ---

exports.status = (opt, manifest, provider, node_names, callback) ->
	###
	This action obtains the status of nodes.
	###
	
	#
	# Call provider's status for each node.
	#
	process_node = (node_name, callback) ->
		logsmith.verbose "query status for node #{node_name}"
		
		provider.status node_name, (err, state, address) ->
			return callback err if err
			
			args = ['node', node_name, 'is', state]
			
			if address
				args.push 'at'
				args.push address
				
			logsmith.info args...
			
			return callback null
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.shellspec = (opt, manifest, provider, node_names, callback) ->
	###
	This action obtains the shell spec of nodes.
	###
	
	#
	# Call provier's shell_spec for each node.
	#
	process_node = (node_name, callback) ->
		provider.shell_spec node_name, (err, spec) ->
			return callback err if err
			
			logsmith.info node_name, '->', spec
			
			return callback null, spec
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.boot = (opt, manifest, provider, node_names, callback) ->
	###
	This action boots nodes.
	###
	
	#
	# Call provider's boot for each node.
	#
	process_node = (node_name, callback) ->
		logsmith.verbose "halt node #{node_name}"
		
		provider.boot node_name, (err, state, address) ->
			logsmith.error err.message if err
			
			return callback null if err
			
			args = ['node', node_name, 'is', state]
			
			if address
				args.push 'at'
				args.push address
				
			logsmith.info args...
			
			return callback null
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.halt = (opt, manifest, provider, node_names, callback) ->
	###
	This action halts nodes.
	###
	
	#
	# Call provider's halt for each node.
	#
	process_node = (node_name, callback) ->
		logsmith.verbose "halt node #{node_name}"
		
		provider.halt node_name, (err, state, address) ->
			logsmith.error err.message if err
			
			return callback null if err
			
			args = ['node', node_name, 'is', state]
			
			if address
				args.push 'at'
				args.push address
				
			logsmith.info args...
			
			return callback null
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.restart = (opt, manifest, provider, node_names, callback) ->
	###
	This action chains actions halt and then boot for every node.
	###
	actions = []
	
	#
	# Invoke the halt method.
	#
	actions.push (node_name, callback) ->
		exports.halt opt, manifest, provider, [node_name], (err) ->
			return callback err if err
			return callback null, node_name
			
	#
	# Invoke the boot method.
	#
	actions.push (node_name, callback) ->
		exports.boot opt, manifest, provider, [node_name], (err) ->
			return callback err if err
			return callback null, node_name
			
	#
	# Invoke actions.
	#
	process_node = (node_name, callback) ->
		logsmith.verbose "restart node #{node_name}"
		
		current_actions = [((callback) -> callback null, node_name), actions...]
		
		async.waterfall current_actions, callback
		
	async.eachSeries node_names, process_node, callback
	
# ---

exports.provision = (opt, manifest, provider, node_names, callback) ->
	###
	This action start the provisioner on the selected nodes.
	###
	actions = []
	
	#
	# Merges two objects.
	#
	merge_objects = (a, b) ->
		for key, value of b
			if a[key]?
				switch
					when typeof(a[key]) == 'boolean' || a[key] instanceof Boolean then a[key] = b[key]
					when typeof(a[key]) == 'number' || a[key] instanceof Number then a[key] = b[key]
					when typeof(a[key]) == 'string' || a[key] instanceof String then a[key] = b[key]
					when Array.isArray(a[key]) then a[key] = a[key].concat b[key]
					else a[key] = arguments.callee a[key], b[key]
			else
				a[key] = b[key]
				
		return a
		
	#
	# Merges roost configs.
	#
	merge_roost = (manifest, configs) ->
		return null if configs.length == 0
		
		return configs
			.map(((config) ->
				if typeof(config) == 'string' || config instanceof String
					return roost.manifest.load path.resolve(path.dirname(manifest.meta.location), config)
				else
					return config
			))
			.reduce(((previousValue, currentValue, index, array) ->
				return JSON.parse JSON.stringify(currentValue) if not previousValue
				
				if currentValue.merge? and currentValue.merge
					return merge_objects previousValue, currentValue
				else
					return currentValue
			), null)
			
	#
	# Call provider's bootstrap method first.
	#
	actions.push (node_name, callback) ->
		provider.bootstrap node_name, (err) ->
			return callback err if err
			return callback null, node_name
			
	#
	# Setup some defaults. 
	#
	actions.push (node_name, callback) ->
		node_manifest = manifest.nodes[node_name]
		merge_configs = []
		
		merge_configs.push manifest.roost if manifestroost?
		merge_configs.push node_manifest.roost if node_manifest.roost?
		merge_configs.push node_manifest[provider.name].roost if node_manifest[provider.name]?.roost?
		
		roost_manifest = merge_roost manifest, merge_configs
		
		return callback new Error "no roost configuration defined for node #{node_name}" if not roost_manifest
		
		if merge_configs.length > 0 and not roost_manifest.meta?
			roost_manifest.meta =
				location: manifest.meta.location
				
		try
			roost_plugins = roost.plugins.obtain roost_manifest
		catch e
			return callback e
			
		node_manifest.roost = roost_manifest
		
		return callback null, node_name, roost_manifest, roost_plugins
		
	#
	# Obtain shell spec.
	#
	actions.push (node_name, roost_manifest, roost_plugins, callback) ->
		provider.shell_spec node_name, (err, spec) ->
			return callback err if err
			return callback null, node_name, roost_manifest, roost_plugins, spec
			
	#
	# Expose nodes to each other by using roost as a provisioner.
	#
	actions.push (node_name, roost_manifest, roost_plugins, spec, callback) ->
		roost_manifest.bootstrap ?= []
		roost_manifest.bootstrap.push 'sudo mkdir -p /etc/vortex/nodes/'
		
		obtain_status = (node_name, callback) ->
			provider.status node_name, (err, state, address) ->
				return callback err if err
				return callback null, {node_name: node_name, address: address}
				
		async.map Object.keys(manifest.nodes), obtain_status, (err, results) ->
			return callback err if err
			
			for result in results
				if result.node_name == node_name
					continue
					
				if not result.address
					logsmith.error "node #{node_name} does not expose address"
					
					continue
					
				a = shell_quote.quote([result.address])
				f = shell_quote.quote(["/etc/vortex/nodes/#{result.node_name}"])
				
				roost_manifest.bootstrap.unshift "echo #{a} | sudo tee #{f}"
				
			return callback null, node_name, roost_manifest, roost_plugins, spec
			
	#
	# Setup the roost target and invoke roost.
	#
	actions.push (node_name, roost_manifest, roost_plugins, spec, callback) ->
		try
			roost_target = roost.targets.create spec, roost_manifest
		catch e
			return callback e
			
		roost_opt = options: {}, argv: []
		roost_opt.options.dry = opt.options.dry if opt.options.dry?
		
		roost.engine.launch roost_opt, roost_manifest, roost_plugins, roost_target, callback
		
	#
	# Invoke actions for each node.
	#
	process_node = (node_name, callback) ->
		logsmith.info "provision node #{node_name}"
		
		current_actions = [((callback) -> callback null, node_name), actions...]
		
		async.waterfall current_actions, callback
		
	async.eachSeries node_names, process_node, callback
	
# ---

exports.up = (opt, manifest, provider, node_names, callback) ->
	###
	This action will bring up a node by first booting it and than starting the provisioning process.
	###
	
	#
	# Boot and provision nodes.
	#
	process_node = (node_name, callback) ->
		provider.status node_name, (err, state, address) ->
			return callback err if err
			
			if state == 'stopped'
				provider.boot node_name, (err, state, address) ->
					return callback err if err
					
					perform_provision = (state, address) ->
						if  state == 'running' and address
							exports.provision opt, manifest, provider, [node_name], callback
						else
							callee = arguments.callee
							
							timeout_handler = () ->
								provider.status node_name, (err, state, address) ->
									return callback err if err
									return callee state, address
									
							setTimeout timeout_handler, 1000
							
					perform_provision state, address
			else
				return callback null
				
	async.eachSeries node_names, process_node, callback
	
# ---

exports.down = (opt, manifest, provider, node_names, callback) ->
	###
	This action will bring down a node. This is esentially a wrapper around the halt action.
	###
	
	#
	# Halt nodes.
	#
	process_node = (node_name, callback) ->
		provider.status node_name, (err, state, address) ->
			return callback err if err
			return callback null if state == 'stopped'
			
			provider.halt node_name, callback
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.reload = (opt, manifest, provider, node_names, callback) ->
	###
	This action chains actions down and then up for every node.
	###
	actions = []
	
	#
	# Invoke action down.
	#
	actions.push (node_name, callback) ->
		exports.down opt, manifest, provider, [node_name], (err) ->
			return callback err if err
			return callback null, node_name
			
	#
	# Invoke action up.
	#
	actions.push (node_name, callback) ->
		exports.up opt, manifest, provider, [node_name], (err) ->
			return callback err if err
			return callback null, node_name
			
	#
	# Invoke actions for each node.
	#
	process_node = (node_name, callback) ->
		logsmith.verbose "reload node #{node_name}"
		
		current_actions = [((callback) -> callback null, node_name), actions...]
		
		async.waterfall current_actions, callback
		
	async.eachSeries node_names, process_node, callback
	
# ---

exports.shell =  (opt, manifest, provider, node_names, callback) ->
	###
	This action start a shell or executes a command on nodes.
	###
	actions = []
	
	#
	# Obtain shell spec.
	#
	actions.push (node_name, callback) ->
		provider.shell_spec node_name, (err, spec) ->
			return callback err if err
			return callback new Error "unsupported shell spec #{spec}" if not spec.match /^ssh:/i
			return callback null, spec
			
	#
	# Start shell or execute a command.
	#
	actions.push (spec, callback) ->
		ssh = new shell.Ssh spec, manifest
		command = opt.argv.slice opt.argv.indexOf('--') + 1
		
		if command.length == opt.argv.length
			command = null
		else
			command = command.join(' ')
			
		if command
			ssh.exec command
		else
			do ssh.shell
			
		ssh.ignite false, (err) ->
			return callback err if err
			return callback null
			
	#
	# Invoke actions for each node.
	#
	process_node = (node_name, callback) ->
		logsmith.info "shell into node #{node_name}"
		
		current_actions = [((callback) -> callback null, node_name), actions...]
		
		async.waterfall current_actions, callback
		
	async.eachSeries node_names, process_node, callback
	
