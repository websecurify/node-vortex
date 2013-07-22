function Provider(manifest) {
	// pass
}

// ---

Provider.prototype.status = function (name, node, callback) {
	// TODO: add code here
	callback(new Error('VirtualBox provider not implemented'));
	//
};

Provider.prototype.boot = function (name, node, callback) {
	// TODO: add code here
	callback(new Error('VirtualBox provider not implemented'));
	//
};

Provider.prototype.halt = function (name, node, callback) {
	// TODO: add code here
	callback(new Error('VirtualBox provider not implemented'));
	//
};

// ---

Provider.prototype.shellSpec = function (name, node, callback) {
	// TODO: add code here
	callback(new Error('VirtualBox provider not implemented'));
	//
};

// ---

exports.Provider = Provider;
