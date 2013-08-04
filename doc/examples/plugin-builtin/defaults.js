exports.vortex = function (opt, manifest, provider, action) {
	if (!manifest.hasOwnProperty('virtualbox')) {
		manifest.virtualbox = {};
	}
	
	var virtualbox = manifest.virtualbox;
	
	if (!virtualbox.hasOwnProperty('vmId')) {
		virtualbox.vmId = 'precise64';
	}
	
	if (!virtualbox.hasOwnProperty('vmUrl')) {
		virtualbox.vmUrl = 'https://s3.amazonaws.com/node-vortex/precise64.ova';
	}
	
	if (!virtualbox.hasOwnProperty('username')) {
		virtualbox.username = 'vortex';
	}
	
	if (!virtualbox.hasOwnProperty('password')) {
		virtualbox.password = 'vortex';
	}
};
