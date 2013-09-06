async = require 'async'
aws_sdk = require 'aws-sdk'
logsmith = require 'logsmith'
portchecker = require 'portchecker'

# ---

exports.Provider = class
	###
	This class exposes Amazon as a provider to Vortex.
	###
	
	constructor: (@manifest) ->
		###
		The provider accepts a manifest as a parameter by specification.
		###
		
		aws_sdk.config.update @extract_client_options()
		
	get_node: (node_name) ->
		###
		This method returns a node by looking up its name. It throws an error if the node is not found.
		###
		
		return @manifest.nodes[node_name] if @manifest.nodes? and @manifest.nodes[node_name]?
		throw new Error "node #{node_name} does not exist"
		
	extract_property: (property_name, node_name) ->
		###
		Extracts a property by looking into a node and upper layers of the manifest.
		###
		
		try
			node = @get_node node_name
		catch e
			node = null
			
		return node.amazon[property_name] if node?.amazon?[property_name]?
		return @manifest.amazon[property_name] if @manifest.amazon?[property_name]?
		return null
		
	#
	# Helper functions for extracting various properties.
	#
	extract_access_key_id: (node_name) -> @extract_property 'accessKeyId', node_name
	extract_secret_access_key: (node_name) -> @extract_property 'secretAccessKey', node_name
	extract_region: (node_name) -> @extract_property 'region', node_name
	extract_max_retries: (node_name) -> @extract_property 'maxRetries', node_name
	extract_image_id: (node_name) -> @extract_property 'imageId', node_name
	extract_instance_type: (node_name) -> @extract_property 'instanceType', node_name
	extract_key_name: (node_name) -> @extract_property 'keyName', node_name
	extract_security_groups: (node_name) -> @extract_property 'securityGroups', node_name
	extract_user_data: (node_name) -> @extract_property 'userData', node_name
	extract_disable_api_termination: (node_name) -> @extract_property 'disableApiTermination', node_name
	extract_username: (node_name) -> @extract_property 'username', node_name
	extract_password: (node_name) -> @extract_property 'password', node_name
	extract_private_key: (node_name) -> @extract_property 'privateKey', node_name
	extract_passphrase: (node_name) -> @extract_property 'passphrase', node_name
	extract_ssh_port: (node_name) -> @extract_property 'sshPort', node_name
	#
	#
	#
	
	extract_namespace: (node_name) ->
		###
		Extracts a namespace by looking it up in the node itself and upper layers of the manifest
		###
		
		try
			node = @get_node node_name
		catch
			node = null
			
		return node.namespace if node?.namespace?
		return @manifest.namespace if @manifest.namespace?
		
	extract_client_options: (node_name) ->
		###
		Extracts options related to the AWS client.
		###
		
		access_key_id = @extract_access_key_id node_name
		secret_access_key = @extract_secret_access_key node_name
		region = @extract_region node_name
		max_retries = @extract_max_retries node_name
		options = {}
		
		options.accessKeyId = access_key_id if access_key_id
		options.secretAccessKey = secret_access_key if secret_access_key
		options.region = region if region
		options.maxRetries = max_retries if max_retries
		
		return options
		
	extract_instance_options: (node_name) ->
		###
		Extracts options related to AWS instances.
		###
		
		image_id = this.extract_image_id node_name
		instance_type = this.extract_instance_type node_name
		key_name = this.extract_key_name node_name
		security_groups = this.extract_security_groups node_name
		user_data = this.extract_user_data node_name
		disable_api_termination = this.extract_disable_api_termination node_name
		options = {}
		
		options.ImageId = image_id if image_id
		options.InstanceType = instance_type if instance_type
		options.KeyName = key_name if key_name
		options.SecurityGroups = security_groups if security_groups
		options.UserData = user_data if user_data
		options.DisableApiTermination = disable_api_termination if disable_api_termination
		
		return options
		
	get_client: (node_name) ->
		###
		Obtain a client for EC2.
		###
		
		return new aws_sdk.EC2 @extract_client_options node_name
		
	create_error: (error, node_name) ->
		###
		Creates a friendlier error message.
		###
		
		if error.code == 'NetworkingError'
			return error
		else
			tokens = error.toString().split(':')
			type = tokens[0]
			message = tokens[1].trim()
			parts = message.split('.')
			message = parts.shift().toLowerCase().trim()
		
			if node_name
				message = "#{message} for node #{node_name}"
				
			if parts.length > 0
				message = "#{message} (#{parts.join('.').trim()})"
				
			message = message.replace /\s'(\w+)'\s/, (match, group) ->
				param = group.toLowerCase()
				
				switch param
					when 'accesskeyid' then param = 'accessKeyId'
					when 'secretaccesskey' then param = 'secretAccessKey'
					when 'region' then param = 'region'
					when 'maxretries' then param = 'maxRetries'
					when 'imageid' then param = 'imageId'
					when 'instancetype' then param = 'instanceType'
					when 'keyname' then param = 'keyName'
					when 'securitygroups' then param = 'securityGroups'
					when 'userdata' then param = 'userData'
					when 'disableapitermination' then param = 'disableApiTermination'
					
				return ' "' + param + '" '
				
			message = message[0] + message.substring 1, message.length
			
			return new Error message
			
	bootstrap: (node_name, callback) ->
		###
		Provider-specific method for bootstrapping a node.
		###
		
		#
		# Doesn't do anything at this stage.
		#
		@status node_name, (err, state, address) ->
			return callback err if err
			return callback new Error "node #{node_name} is not ready" if state != 'running'
			return callback null
			
	status: (node_name, callback) ->
		###
		Provider-specific method for checking the status of a node.
		###
		
		try
			client = @get_client node_name
		catch e
			return callback @create_error e, node_name
			
		options =
			Filters: [
				{Name: 'tag:vortex-node-name', Values: [node_name]}
				{Name: 'tag:vortex-node-namespace', Values: [this.extract_namespace(node_name)]}
			]
			
		logsmith.debug 'describe instances with options', options
		
		client.describeInstances options, (err, result) =>
			return callback @create_error err, node_name if err
			
			instances = []
			
			for reservation in result.Reservations
				for instance in reservation.Instances
					instances.push {
						id: instance.InstanceId
						state: instance.State.Name
						address: instance.PublicDnsName
					}
					
			return callback null, 'stopped' if instances.length == 0
			
			logsmith.debug 'discovered instances', instances
			
			selected_instance = instances[instances.length - 1]
			
			return callback new Error "could not obtain instance for node #{node_name}" if not selected_instance
			
			logsmith.debug 'selected instance', selected_instance
			
			for instance in instances
				if instance.state not in ['shutting-down', 'terminated', 'stopping', 'stopped'] and selected_instance != instance
					logsmith.warn "duplicate node #{node_name} with instance id #{instance.id} detected"
					
			state = switch selected_instance.state
				when 'pending' then 'booting'
				when 'running' then 'running'
				when 'stopped' then 'stopped'
				when 'stopping' then 'halting'
				when 'terminated' then 'stopped'
				when 'shutting-down' then 'halting'
				else null
				
			return callback new Error "undefined state for node #{node_name}" if not state
			
			logsmith.debug "node #{node_name} with instance id #{selected_instance.id} has state #{state}"
			
			address = selected_instance.address
			
			if not address
				state = 'booting'
				
			if state != 'running'
				address = null
				
			return callback null, state, address, selected_instance.id
			
	boot: (node_name, callback) ->
		###
		Provider-specific method for booting a node.
		###
		
		try
			client = @get_client node_name
		catch e
			return callback @create_error e, node_name
			
		#
		# First we verify the status of the node to check if the state is correct.
		#
		verify_status = (callback) =>
			@status node_name, (err, state, address) ->
				return callback err if err
				return callback new Error "node #{node_name} is already booting" if state == 'booting'
				return callback new Error "node #{node_name} is already running" if state == 'running'
				return callback new Error "node #{node_name} is halting" if state == 'halting'
				return callback null
				
		#
		# Next we run the instance.
		#
		run_instance = (callback) =>
			options = @extract_instance_options node_name
			
			options.MinCount = 1
			options.MaxCount = 1
			
			logsmith.debug 'run instances with options', options
			
			client.runInstances options, (err, result) =>
				return callback @create_error err, node_name if err
				
				instances = []
				
				for instance in result.Instances
					instances.push {
						id: instance.InstanceId
					}
					
				return callback new Error "no instances run for node #{node_name}" if instances.length == 0
				
				logsmith.debug 'ran instances', instances
				
				selected_instance = instances[instances.length - 1]
				
				return callback new Error "could not create instance for node #{node_name}" if not selected_instance
				
				logsmith.debug 'selected instance', selected_instance
				
				for instance in instances
					if selected_instance != instance
						logsmith.warn "duplicate node #{node_name} with instance id #{instance_id} detected"
						
				return callback null, selected_instance.id
				
		#
		# Finally we unmap any tags on the instance.
		#
		map_tags = (instance_id, callback) =>
			options =
				Resources: [instance_id]
				Tags: [
					{Key: 'vortex-node-name', Value: node_name}
					{Key: 'vortex-node-namespace', Value: @extract_namespace node_name}
				]
				
			logsmith.debug 'create tags with options', options
			
			client.createTags options, (err, result) =>
				return callback @create_error err, node_name if err
				return callback null, instance_id
				
		#
		# Action on the tasks.
		#
		async.waterfall [verify_status, run_instance, map_tags], (err) =>
			return callback err if err
			return @status node_name, callback
			
	halt: (node_name, callback) ->
		###
		Provider-specific method for halting a node.
		###
		
		try
			client = @get_client node_name
		catch e
			return callback @create_error e, node_name
			
		#
		# First we verify the status of the node to check if the state is correct.
		#
		verify_status = (callback) =>
			@status node_name, (err, state, address, instance_id) ->
				return callback err if err
				return callback new Error "#{node_name} is already halting" if state == 'halting'
				return callback new Error "#{node_name} is already stopped" if state == 'stopped'
				return callback null, instance_id
				
		#
		# Next we terminate the instance.
		#
		terminate_instance = (instance_id, callback) =>
			options =
				InstanceIds: [instance_id]
				
			logsmith.debug 'terminate instances with options', options
			
			client.terminateInstances options, (err, result) =>
				return callback @create_error err, node_name if err
				return callback null, instance_id
				
		#
		# Finally we unmap any tags on the instance.
		#
		unmap_tags = (instance_id, callback) =>
			options =
				Resources: [instance_id]
				Tags: [
					{Key: 'vortex-node-name', Value: node_name}
					{Key: 'vortex-node-namespace', Value: @extract_namespace node_name}
				]
				
			logsmith.debug 'delete tags with options', options
			
			client.deleteTags options, (err, result) =>
				return callback @create_error err, node_name if err
				return callback null, instance_id
				
		#
		# Action on the tasks.
		#
		async.waterfall [verify_status, terminate_instance, unmap_tags], (err) =>
			return callback err if err
			return @status node_name, callback
			
	shell_spec: (node_name, callback) ->
		###
		Provider-specific method for obtaining a shell spec from a node.
		###
		
		password = @extract_password node_name
		private_key = @extract_private_key node_name
		
		return callback new Error "no password or privateKey provided for node #{node_name}" if not password and not private_key
		
		ssh_port = @extract_ssh_port node_name
		
		if ssh_port
			ssh_port = parseInt ssh_port, 10
			
			return callback new Error "ssh port for node #{node_name} is incorrect" if isNaN ssh_port or ssh_port < 1
		else
			ssh_port = 22
			
		username = @extract_username node_name
		
		if not username
			username = 'vortex'
			
		passphrase = @extract_passphrase node_name
		
		#
		# First we obtain the node status by looking for the address and to check if the state is correct.
		#
		obtain_status = (callback) =>
			@status node_name, (err, state, address) ->
				return callback err if err
				return callback new Error "node #{node_name} is halting" if state == 'halting'
				return callback new Error "node #{node_name} is stopped" if state == 'stopped'
				return callback new Error "cannot find network address for node #{node_name}" if not address
				return callback null, address
				
		#
		# Next we continiusly check if the ssh port is open.
		#
		ensure_port = (address, callback) ->
			portchecker.isOpen ssh_port, address, (is_open) ->
				return callback null, address if is_open
				
				callee = arguments.callee
				milliseconds = 10000
				timeout = () -> portchecker.isOpen ssh_port, address, callee
				
				logsmith.debug "repeat check for ssh port open for node #{node_name} in #{milliseconds} milliseconds"
				
				setTimeout timeout, milliseconds
				
		#
		# Finally we build the spec and send it off.
		#
		build_spec = (address, callback) ->
			parts = []
			parts.push 'ssh://'
			parts.push encodeURIComponent username
			parts.push ':' + encodeURIComponent password if password
			parts.push '@'
			parts.push address
			parts.push ';privateKey=' + encodeURIComponent private_key if private_key
			parts.push ';passphrase=' + encodeURIComponent passphrase if passphrase
			
			return callback null, parts.join ''
			
		#
		# Action on the tasks.
		#
		async.waterfall [obtain_status, ensure_port, build_spec], callback
		
