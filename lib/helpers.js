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

exports.error = error;
exports.quote = quote;
exports.camel = camel;

// ---

exports.e = error;
exports.q = quote;
exports.c = camel;
