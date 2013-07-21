function VirtualBox() {
	// pass
}

VirtualBox.prototype.status = function () {
	// TODO: add code here
};

VirtualBox.prototype.up = function () {
	// TODO: add code here
};

VirtualBox.prototype.halt = function () {
	// TODO: add code here
};

VirtualBox.prototype.destroy = function () {
	// TODO: add code here
};

// ---

function AmazonEC2() {
	// pass
}

AmazonEC2.prototype.status = function () {
	// TODO: add code here
};

AmazonEC2.prototype.up = function () {
	// TODO: add code here
};

AmazonEC2.prototype.halt = function () {
	// TODO: add code here
};

AmazonEC2.prototype.destroy = function () {
	// TODO: add code here
};

// ---

var instances = {};

// ---

function instance(provider) {
	if (!instances.hasOwnProperty(provider)) {
		if (exports.hasOwnProperty(provider)) {
			instances[provider] = new exports[provider]();
			
			instances[provider].name = provider;
		} else {
			throw new Error('provider ' + provider + ' not found');
		}
	}
	
	return instances[provider];
}

// ---

exports.VirtualBox = VirtualBox;
exports.AmazonEC2 = AmazonEC2;
exports.instance = instance;
