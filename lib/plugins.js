var path = require('path');

// ---

var helpers = require(path.join(__dirname, 'helpers.js'));

// ---

function obtain(manifest) {
	if (!manifest.hasOwnProperty('plugins')) {
		return [];
	}
	
	var plugins;
	
	if (Array.isArray(manifest.plugins)) {
		plugins = manifest.plugins;
	} else {
		plugins = Object.keys(manifest.plugins).filter(function (name) {
			return [1, '1', true, 'true'].indexOf(manifest.plugins[name]) >= 0;
		});
	}
	
	var root = path.dirname(manifest.meta.location);
	
	return plugins.map(function (name) {
		var plugin;
		
		try {
			plugin = require(path.resolve(root, name));
		} catch (e) {
			if (e.code == 'MODULE_NOT_FOUND') {
				try {
					plugin = require(path.resolve(path.join(root, 'node_modules'), name));
				} catch (e) {
					if (e.code == 'MODULE_NOT_FOUND') {
						try {
							plugin = require(name);
						} catch (e) {
							throw helpers.e('cannot load plugin', helpers.q(name));
						}
					} else {
						throw helpers.e('cannot load plugin', helpers.q(name));
					}
				}
			} else {
				throw helpers.e('cannot load plugin', helpers.q(name));
			}
		}
		
		if (plugin.hasOwnProperty('getVortex')) {
			plugin = plugin.getVortex(manifest);
		}
		
		if (plugin.hasOwnProperty('vortex')) {
			return plugin;
		}
		
		throw helpers.e('plugin', helpers.q(name), 'is not compatible');
	});
}

// ---

exports.obtain = obtain;
