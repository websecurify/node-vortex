function camelCase(input) {
	return input[0] + input.substring(1, input.length);
}

// ---

exports.camelCase = camelCase;
