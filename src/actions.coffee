fs = require 'fs'
path = require 'path'
async = require 'async'
roost = require 'roost'
logsmith = require 'logsmith'
shell_quote = require 'shell-quote'
child_process = require 'child_process'

# ---

shell = require './shell'

# ---

exports.actions = (opt, manifest, provider, node_name, callback) ->
	###
	Prints out the available actions.
	###
	
	for action_name, action_fn of exports
		desc = action_fn.toString().split('\n').slice(2, 3)[0]?.trim()
		
		logsmith.info action_name, '-', desc
		
# ---

exports.status = (opt, manifest, provider, node_names, callback) ->
	###
	Obtains state and network address if the selected node is running.
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
	Obtains the shell specification (typically ssh url) for the selected node.
	###
	
	#
	# Call provier's shell_spec for each node.
	#
	process_node = (node_name, callback) ->
		logsmith.verbose "query shell spec for node #{node_name}"
		
		provider.shell_spec node_name, (err, spec) ->
			return callback err if err
			
			logsmith.info node_name, '->', spec
			
			return callback null, spec
			
	async.eachSeries node_names, process_node, callback
	
# ---

exports.boot = (opt, manifest, provider, node_names, callback) ->
	###
	Ensures that the node is running.
	###
	
	#
	# Call provider's boot for each node.
	#
	process_node = (node_name, callback) ->
		logsmith.verbose "boot node #{node_name}"
		
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
	Ensures that the node is stopped.
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

exports.pause = (opt, manifest, provider, node_names, callback) ->
	###
	Ensures that the node is paused.
	###
	
	#
	# Call provider's pause for each node.
	#
	process_node = (node_name, callback) ->
		logsmith.verbose "pause node #{node_name}"
		
		provider.pause node_name, (err, state, address) ->
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

exports.resume = (opt, manifest, provider, node_names, callback) ->
	###
	Ensures that the node is resumed.
	###
	
	#
	# Call provider's resume for each node.
	#
	process_node = (node_name, callback) ->
		logsmith.verbose "resume node #{node_name}"
		
		provider.resume node_name, (err, state, address) ->
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
	Chains actions halt and then boot for every node.
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
	Starts the provisioner on the selected node.
	###
	
	actions = []
	
	#
	# Merges two objects.
	#
	merge_objects = (a, b) ->
		for key, value of b
			if a[key]?
				a[key] = switch
					when Array.isArray a[key] then a[key].concat b[key]
					when typeof a[key] == 'number' or a[key] instanceof Number then b[key]
					when typeof a[key] == 'string' or a[key] instanceof String then b[key]
					when typeof a[key] == 'boolean' or a[key] instanceof Boolean then b[key]
					else arguments.callee a[key], b[key]
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
			.reduce(((previous_value, current_value) ->
				return JSON.parse JSON.stringify(current_value) if not previous_value
				
				if current_value.merge? and current_value.merge
					return merge_objects previous_value, current_value
				else
					return current_value
			), null)
			
	#
	# Call provider's bootstrap method first.
	#
	actions.push (node_name, callback) ->
		provider.bootstrap node_name, (err) ->
			return callback err if err
			return callback null, node_name
			
	#
	# Start configuring roost.
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
				continue if result.node_name == node_name
				
				if not result.address
					logsmith.error "node #{node_name} does not expose address"
					
					continue
					
				address = shell_quote.quote([result.address])
				file = shell_quote.quote(["/etc/vortex/nodes/#{result.node_name}"])
				
				roost_manifest.bootstrap.unshift "echo #{address} | sudo tee #{file}"
				
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
	Will bring up a node by first booting/resuming it and than starting the provisioning process.
	###
	
	#
	# Boot/resume and provision nodes.
	#
	process_node = (node_name, callback) ->
		provider.status node_name, (err, state, address) ->
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
					
			switch state
				when 'stopped'
					provider.boot node_name, (err, state, address) ->
						return callback err if err
						
						perform_provision state, address
				when 'paused'
					provider.resume node_name, (err, state, address) ->
						return callback err if err
						
						perform_provision state, address
				else
					return callback null
					
	async.eachSeries node_names, process_node, callback
	
# ---

exports.down = (opt, manifest, provider, node_names, callback) ->
	###
	Will bring down a node. At the moment this action is a alias for action halt.
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
	Chains actions down and then up for every node.
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

exports.shell = (opt, manifest, provider, node_names, callback) ->
	###
	Starts a shell or executes a command on the selected node.
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
	
# ---

exports.openurl = (opt, manifest, provider, node_names, callback) ->
	###
	Open node url in browser.
	###
	
	command = switch
		when process.platform.match /^win/ then 'start'
		when process.platform.match /^dar/ then 'open'
		else 'firefox'
		
	#
	# Invoke for each node.
	#
	process_node = (node_name, callback) ->
		node_def = manifest.nodes[node_name]
		web_def = node_def.web or {}
		
		path = switch
			when web_def.path then web_def.path
			else '/'
			
		port = switch
			when web_def.port then web_def.port
			else 80
			
		scheme = switch
			when web_def.scheme then web_def.scheme
			when port == 443 then 'https'
			else 'http'
			
		provider.status node_name, (err, state, address) ->
			return callback err if err
			return callback new Error "cannot identify address for node #{node_name}" if not address
			
			url = "#{scheme}://#{address}:#{port}#{path}"
			 
			child_process.exec shell_quote.quote([command, url]), (err) ->
				return callback err if err
				return callback null
				
	async.eachSeries node_names, process_node, callback
	
