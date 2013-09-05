require('coffee-script');

// ---

var fs = require('fs');
var path = require('path');

// ---

fs.readdirSync(__dirname).forEach(function(file) {
	var ext = path.extname(file);
	
	if (['.js', '.coffee'].indexOf(ext) < 0) {
		return;
	}
	
	var base = path.basename(file, ext);
	
	if (['index'].indexOf(base) >= 0) {
		return;
	}
	
	exports[base] = require(path.join(__dirname, file));
});
