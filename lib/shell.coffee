exports.escape = (input) ->
	return input.replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/(["`$\\])/g, '\\$1')
	
# ---

exports.quote = (input) ->
	return '"' + exports.escape(input) + '"'
	
