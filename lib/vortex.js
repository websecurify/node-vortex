(function() {
  exports.main = function(argv) {
    var e, engine, exit_code, failure, logsmith, manifest, node_getopt, opt, plugins, provider_action, providers, vortex_location, vortex_manifest, vortex_plugins, vortex_provider, _ref;
    if (argv == null) {
      argv = process.argv.slice(2);
    }
    /*
    	Launches Vortex command line tool. It can be used for embedding.
    */

    logsmith = require('logsmith');
    node_getopt = require('node-getopt');
    engine = require('./engine');
    plugins = require('./plugins');
    manifest = require('./manifest');
    providers = require('./providers');
    opt = node_getopt.create([['f', 'file=ARG', 'Specify the root of a vortex project or a vortex manifest.'], ['p', 'provider=ARG', 'Specify a default provider.'], ['d', 'dry', 'Dry run the roost manifest.'], ['v', 'verbose+', 'Make it verbose.'], ['c', 'colorize', 'Make it pretty.'], ['V', 'version', 'Shows version.'], ['h', 'help', 'Display this help.']]);
    opt = opt.bindHelp();
    opt = opt.parse(argv);
    if (opt.options.verbose != null) {
      logsmith.setGlobalLevel(3 - (opt.options.verbose.length < 3 ? opt.options.verbose.length : 3));
    }
    if (opt.options.colorize != null) {
      logsmith.setGlobalColorization(opt.options.colorize);
    }
    if (opt.options.version) {
      logsmith.info(require('../package.json').version);
      return;
    }
    exit_code = 0;
    failure = function(err) {
      logsmith.exception(err);
      logsmith.error(err.message);
      return process.exit(++exit_code);
    };
    try {
      vortex_location = manifest.locate(opt.options.file);
    } catch (_error) {
      e = _error;
      failure(e);
    }
    try {
      vortex_manifest = manifest.load(vortex_location);
    } catch (_error) {
      e = _error;
      failure(e);
    }
    try {
      vortex_plugins = plugins.obtain(vortex_manifest);
    } catch (_error) {
      e = _error;
      failure(e);
    }
    try {
      if (opt.options.provider) {
        vortex_provider = providers.instance(opt.options.provider, vortex_manifest);
      } else {
        vortex_provider = providers.instance('VirtualBox', vortex_manifest);
      }
    } catch (_error) {
      e = _error;
      failure(e);
    }
    provider_action = (_ref = opt.argv[0]) != null ? _ref : 'status';
    return engine.launch(opt, vortex_manifest, vortex_plugins, vortex_provider, provider_action, function(err) {
      if (err) {
        return failure(err);
      }
    });
  };

  if (require.main === module) {
    exports.main();
  }

}).call(this);
