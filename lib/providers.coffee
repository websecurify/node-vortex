exports.amazon = require('./provider_amazon').Provider
exports.virtualbox = require('./provider_virtualbox').Provider

# ---

instances = {}

# ---

exports.instance = (name, manifest) ->
	nice_name = name.toLowerCase()
	
	if not instances[nice_name]?
		if exports[nice_name]? and nice_name != 'instance'
			instances[nice_name] = new exports[nice_name] manifest
			instances[nice_name].name = nice_name
		else
			throw new Error "provider #{name} is not found"
			
	return instances[nice_name]
	
