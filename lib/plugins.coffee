path = require 'path'

# ---

exports.obtain = (manifest) ->
	###
	Obtains a list of plugins specified in the manifest.
	###
	
	return if not manifest.plugins?
	
	true_values = [1, '1', true, 'true']
	
	if Array.isArray manifest.plugins
		plugins = manifest.plugins
	else
		plugins = [name for name, value of manifest.plugins if value in true_values]
		
	root = path.dirname manifest.meta.location
	failure = (err) -> throw new Error "cannot load plugin #{name}" if err.code != 'MODULE_NOT_FOUND'
	
	return plugins.map (name) ->
		try
			plugin = require path.resolve root, name
		catch e
			failure e
			
			try
				plugin = require path.resolve path.join(root, 'node_modules'), name
			catch e
				failure e
				
				try
					plugin = require name
				catch e
					failure e
					throw e
					
		if plugin.getVortex?
			plugin = plugin.getVortex manifest
			
		throw new Error "plugins #{name} is not comptabile" if not plugin.vortex?
		
		return plugin
		
