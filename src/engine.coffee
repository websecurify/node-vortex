actions = require './actions'

# ---

exports.launch = (opt, manifest, plugins, provider, action, callback) ->
	###
	Main method for putting toghether the entire logic of Vortex.
	###
	
	return callback new Error "action #{action} is not recognized" if not actions[action]?
	
	[plugin.vortex opt, manifest, provider, action for plugin in plugins] if plugins
	
	return callback new Error "no nodes defined in the vortex manifest" if not manifest.nodes?
	
	selected_nodes = []
	traversed_nodes = selected_nodes
	
	for node_name in opt.argv.slice 1
		if node_name == '--'
			traversed_nodes = []
		else
			traversed_nodes.push node_name
			
	if selected_nodes.length == 0
		selected_nodes = Object.keys manifest.nodes
		
	return callback new Error "no nodes selected for action #{action}" if selected_nodes.length == 0
	
	for node_name in selected_nodes
		return callback new Error "node #{node_name} does not exist" if not manifest.nodes[node_name]?
		
	actions[action] opt, manifest, provider, selected_nodes, callback
	

