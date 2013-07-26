function error(args) {
	if (Array.isArray(args)) {
		return new Error(args.join(' '));
	} else {
		return new Error(Array.prototype.slice.call(arguments).join(' '));
	}
}

// ---

function quote(input) {
	return JSON.stringify(input);
}

// ---

function camel(input) {
	return input[0] + input.substring(1, input.length);
}

// ---

function merge(a, b) {
	Object.keys(b).forEach(function (key) {
		if (a.hasOwnProperty(key)) {
			if (typeof(a[key]) == 'boolean' || a[key] instanceof Boolean) {
				a[key] = b[key];
			} else
			if (typeof(a[key]) == 'number' || a[key] instanceof Number) {
				a[key] = b[key];
			} else
			if (typeof(a[key]) == 'string' || a[key] instanceof String) {
				a[key] = b[key];
			} else
			if (Array.isArray(a[key])) {
				a[key] = a[key].concat(b[key]);
			} else {
				a[key] = arguments.callee(a[key], b[key]);
			}
		} else {
			a[key] = b[key];
		}
	});
	
	return a;
}

// ---

exports.error = error;
exports.quote = quote;
exports.camel = camel;
exports.merge = merge;

// ---

exports.e = error;
exports.q = quote;
exports.c = camel;
exports.m = merge;
