exports.main = (argv=process.argv.slice(2)) ->
	###
	Main into Vortex. Command options can be passed as an array into args.
	###
	
	logsmith = require 'logsmith'
	node_getopt = require 'node-getopt'
	
	engine = require './engine'
	plugins = require './plugins'
	manifest = require './manifest'
	providers = require './providers'
	
	opt = node_getopt.create [
		['f', 'file=ARG', 'Specify the root of a vortex project or a vortex manifest.']
		['p', 'provider=ARG', 'Specify a default provider.']
		['d', 'dry', 'Dry run the roost manifest.']
		['v', 'verbose+', 'Make it verbose.']
		['c', 'colorize', 'Make it pretty.']
		['h', 'help', 'Display this help.']
	]
	
	opt = opt.bindHelp()
	opt = opt.parse(argv)
	
	logsmith.setGlobalLevel(3 - (if opt.options.verbose.length < 3 then opt.options.verbose.length else 3)) if opt.options.verbose?
	logsmith.setGlobalColorization(opt.options.colorize) if opt.options.colorize?
	
	exit_code = 0
	
	failure = (err) ->
		logsmith.exception err
		logsmith.error err.message
		
		process.exit ++exit_code
		
	try vortex_location = manifest.locate opt.options.file
	catch e then failure e
	
	try vortex_manifest = manifest.load vortex_location
	catch e then failure e
	
	try vortex_plugins = plugins.obtain vortex_manifest
	catch e then failure e
	
	try
		if opt.options.provider
			vortex_provider = providers.instance opt.options.provider, vortex_manifest
		else
			vortex_provider = providers.instance 'VirtualBox', vortex_manifest
	catch e then failure e
	
	provider_action = opt.argv[0] ? 'status'
	
	engine.launch opt, vortex_manifest, vortex_plugins, vortex_provider, provider_action, (err) ->
		return failure err if err
		
if require.main == module
	do exports.main
	
