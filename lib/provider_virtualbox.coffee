fs = require 'fs'
url = require 'url'
roost = require 'roost'
async = require 'async'
logsmith = require 'logsmith'
path_extra = require 'path-extra'
vboxmanage = require 'vboxmanage'
portchecker = require 'portchecker'

# ---

download = require './download'

# ---

exports.Provider = class
	constructor: (@manifest) ->
		# pass
		
	###
		* Get node definition by name. The method will throw an exception if the node is not found.
		*
		* @param {string} node_name
	###
	get_node: (node_name) ->
		return @manifest.nodes[node_name] if @manifest.nodes? and @manifest.nodes[node_name]?
		
		throw new Error "node #{node_name} does not exist"
		
	###
		* Extract node's namespace by looking at the node itself and upper layers of the manifest.
		*
		* @param {string} node_name
	###
	extract_namespace: (node_name) ->
		try
			node = @get_node node_name
		catch
			node = null
			
		return node.namespace if node?.namespace?
		return @manifest.namespace if @manifest.namespace?
		
	###
		* Creates a handle from node name. This method is used for creating VirtualBox friendlier names.
		*
		* @param {string} node_name
	###
	get_node_handle: (node_name) ->
		namespace = @extract_namespace node_name
		
		return (if namespace then namespace + ':' else '') + node_name
		
	###
		* Creates a share handle from share name. This method is used for creating VirtualBox friendlier share names.
		*
		* @param {string} node_name
	###
	get_share_handle: (share_name) ->
		return share_name.replace(/[^\w]+/, '_').replace(/_+/, '_')
		
	###
		* Extracts a property by looking into a node and upper layers of the manifest.
		*
		* @param {string} property_name
		* @param {string} node_name
	###
	extract_property: (property_name, node_name) ->
		try
			node = @get_node node_name
		catch e
			node = null
			
		return node.virtualbox[property_name] if node?.virtualbox?[property_name]?
		return @manifest.virtualbox[property_name] if @manifest.virtualbox?[property_name]?
		return null
		
	###
		* Helper functions for extracting properties by looking into a node and upper layers of the manifest.
	###
	extract_vm_id: (node_name) -> @extract_property 'vmId', node_name
	extract_vm_url: (node_name) -> @extract_property 'vmUrl', node_name
	extract_username: (node_name) -> @extract_property 'username', node_name
	extract_password: (node_name) -> @extract_property 'password', node_name
	extract_private_key: (node_name) -> @extract_property 'privateKey', node_name
	extract_passphrase: (node_name) -> @extract_property 'passphrase', node_name
	extract_ssh_port: (node_name) -> @extract_property 'sshPort', node_name
	
	###
		* Schedules import operation. The function will check if the vm_id exists before execution.
		*
		* @param {string} vm_url
		* @param {string} vm_id
		* @param {function(?err)} callback
	###
	schedule_import: (vm_url, vm_id, callback) ->
		if not @import_queue?
			@import_queue = async.queue (task, callback) =>
				vboxmanage.machine.info task.vm_id, (err, info) =>
					return callback null if not err
					return @perform_import task.vm_url, task.vm_id, callback
					
		task =
			vm_url: vm_url
			vm_id: vm_id
			
		@import_queue.push task, callback
		
	###
		* Performs import operation.
		*
		* @param {string} vm_url
		* @param {string} vm_id
		* @param {function(?err)} callback
	###
	perform_import: (vm_url, vm_id, callback) ->
		logsmith.debug "import #{vm_url} into #{vm_id}"
		
		try
			spec = url.parse vm_url
		catch
			return callback new Error "cannot parse url #{vm_url}"
			
		return callback new Error "unsupported scheme for url #{vm_url}" if spec.protocol not in ['file:', 'http:', 'https:']
		
		if spec.protocol == 'file'
			if not spec.host
				local_path = spec.pathname
			else
				local_path = path_extra.resolve path_extra.dirname(@manifest.meta.location), path_extra.join(spec.host, spec.pathname)
				
			vboxmanage.machine.import local_path, vm_id, callback
		else
			local_name = (new Date()).getTime() + '-' + path_extra.basename(spec.pathname)
			local_path = path_extra.join path_extra.tempdir(), local_name
			
			download.get vm_url, local_path, (err) ->
				if err
					fs.unlink local_path, (err) ->
						logsmith.exception err if err
						
					return callback err
					
				vboxmanage.machine.import local_path, vm_id, (err) ->
					fs.unlink local_path, (err) ->
						logmisth.exception err if err
						
					return callback err if err
					return callback null
					
	###
		* Provider method for bootstrapping a node.
		*
		* @param {string} node_name
		* @param {function(?err)} callback
	###
	bootstrap: (node_name, callback) ->
		`
		var node = this.getNodeByName(nodeName);
		
		if (!node.hasOwnProperty('roost')) {
			node.roost = {
				merge: true
			};
		}
		
		if (!node.roost.hasOwnProperty('bootstrap')) {
			node.roost.bootstrap = [];
		}
		
		if (!node.roost.sync) {
			node.roost.sync = {};
		}
		
		node.roost.bootstrap.push('sudo ifconfig eth1 0.0.0.0 0.0.0.0');
		node.roost.bootstrap.push('sudo ifconfig eth2 0.0.0.0 0.0.0.0');
		node.roost.bootstrap.push('sudo dhclient -r eth1 eth2');
		node.roost.bootstrap.push('sudo dhclient eth1 eth2');
		node.roost.bootstrap.push('sleep 10');
		
		if (node.hasOwnProperty('expose')) {
			var self = this;
			
			Object.keys(node.expose).forEach(function (source) {
				var sourcePath = path_extra.resolve(path_extra.dirname(self.manifest.meta.location), source);
				
				fs.stat(sourcePath, function (err, stats) {
					if (err) {
						return callback(helpers.e('cannot expose', helpers.q(source), 'because it does not exist'));
					}
					
					var destination = node.expose[source];
					
					if (stats.isDirectory()) {
						var share = self.get_share_handle(destination);
						
						node.roost.bootstrap.push('sudo mkdir -p ' + roost.shell.quote(destination));
						node.roost.bootstrap.push('sudo mount.vboxsf ' + roost.shell.quote(share) + ' ' + roost.shell.quote(destination) + ' -o rw');
					} else {
						node.roost.sync[source] = destination;
					}
				});
			});
		}
		
		return callback();
		`
		
	###
		* Provider method for quering the status of a node.
		*
		* @param {string} node_name
		* @param {function(?err)} callback
	###
	status: (node_name, callback) ->
		node_handle = @get_node_handle node_name
		
		#
		# First we obtain the state of the node.
		#
		obtain_machine_state = (callback) ->
			vboxmanage.machine.info node_handle, (err, info) ->
				return callback null, 'stopped' if err
				
				state = info.VMState.toLowerCase()
				
				switch state
					when 'saved' then state = 'running'
					when 'running' then state = 'running'
					when 'starting' then state = 'booting'
					when 'powered off' then state = 'stopped'
					when 'guru meditation'then state = 'running'
					
				return callback null, state
				
		#
		# Next we obtain the machine network address.
		#
		obtain_machine_address = (state, callback) ->
			vboxmanage.adaptors.list node_handle, (err, adaptors) ->
				return callback null, 'stopped', address if err
				
				try
					address = adaptors['Adaptor 1'].V4.IP
				catch e
					address = null
					state = 'booting'
					
				return callback null, state, address
				
		#
		# Action on the task.
		#
		async.waterfall [obtain_machine_state, obtain_machine_address], (err, state, address) ->
			return callback err if err
			return callback null, state, address
			
	###
		* Provider method for booting a node.
		*
		* @param {string} node_name
		* @param {function(?err)} callback
	###
	boot: (node_name, callback) ->
		vm_id = @extract_vm_id node_name
		
		return callback new Error 'no virtualbox "vmId" paramter specified for node' if not vm_id
		
		node_handle = @get_node_handle node_name
		
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
		# Next we attemp to remove the vm. Proceed if there is a failure.
		#
		attemp_to_remove_vm = (callback) ->
			vboxmanage.machine.remove node_handle, (err) ->
				logsmith.exception err if err
				
				return callback null
				
		#
		# Next we ensure that the vm exists by checking its id. If it doesn't exist download it from the net or fail misserably.
		#
		ensure_vm_id = (callback) =>
			vboxmanage.machine.info vm_id, (err, info) =>
				return callback null if not err
				
				vm_url = @extract_vm_url node_name
				
				return callback new Error 'no virtualbox "vmUrl" paramter specified for node' if not vm_url?
				
				@schedule_import vm_url, vm_id, callback
				
		#
		# Next we clone the vm into a new one that will be used for the purpose.
		#
		clone_vm = (callback) ->
			vboxmanage.machine.clone vm_id, node_handle, callback
			
		#
		# Next we ensure that there is basic networking going on inside VirtualBox.
		#
		ensure_networking = (callback) =>
			config =
				network:
					hostonly:
						vboxnet5:
							ip: '10.100.100.1'
							netmask: '255.255.255.0'
						
							dhcp:
								lower_ip: '10.100.100.101'
								upper_ip: '10.100.100.254'
							
					internal:
						vortex:
							ip: '10.200.200.1'
							netmask: '255.255.255.0'
						
							dhcp:
								lower_ip: '10.200.200.101'
								upper_ip: '10.200.200.254'
							
			vboxmanage.setup.system config, callback
			
		#
		# Next we setup the vm using the provided configuration.
		#
		setup_vm = (callback) =>
			config =
				network:
					adaptors: [
						{type: 'hostonly', network: 'vboxnet5'}
						{type: 'internal', network: 'vortex'}
						{type: 'nat'}
					]
				shares: {}
				
			try
				node = @get_node node_name
			catch e
				return callback e
				
			if node.expose?
				for src, dst of node.expose
					src = path_extra.resolve path_extra.dirname(@manifest.meta.location), src
					share_handle = @get_share_handle dst
					
					config.shares[share_handle] = src
					
			vboxmanage.setup.machine node_handle, config, callback
			
		#
		# Finally we start the vm.
		#
		start_vm = (callback) ->
			vboxmanage.instance.start node_handle, callback
			
		#
		# Action on the task.
		#
		async.waterfall [verify_status, attemp_to_remove_vm, ensure_vm_id, clone_vm, ensure_networking, setup_vm, start_vm], (err) =>
			return callback err if err
			return @status node_name, callback
			
	###
		* Provider method for halting a node.
		*
		* @param {string} node_name
		* @param {function(?err)} callback
	###
	halt: (node_name, callback) ->
		node_handle = @get_node_handle node_name
		
		#
		# First we verify the status of the node to check if the state is correct.
		#
		verify_status = (callback) =>
			@status node_name, (err, state, address) ->
				return callback err if err
				return callback new Error "#{node_name} is already halting" if state == 'halting'
				return callback new Error "#{node_name} is already stopped" if state == 'stopped'
				return callback null
				
		#
		# Next we attempt to shutdown the node. Proceed if there is a failure.
		#
		attempt_to_stop_vm = (callback) ->
			vboxmanage.instance.stop node_handle, (err) ->
				logsmith.exception err if err
				
				return callback null
				
		#
		# Finally we attempt to remove the node. Proceed if there is a failure.
		#
		attempt_to_remove_vm = (callback) ->
			vboxmanage.machine.remove node_handle, (err) ->
				logsmith.exception err if err
				
				return callback null
				
		#
		# Action on the task.
		#
		async.waterfall [verify_status, attempt_to_stop_vm, attempt_to_remove_vm], (err) =>
			return callback err if err
			return @status node_name, callback
			
	###
		* Provider method for obtaining the shell spec of a node.
		*
		* @param {string} node_name
		* @param {function(?err)} callback
	###
	shell_spec: (node_name, callback) ->
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
		# First we obtain the node status looking for the address and to check if the state is correct.
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
		# Action on the task.
		#
		async.waterfall [obtain_status, ensure_port, build_spec], callback
		
