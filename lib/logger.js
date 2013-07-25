var winston = require('winston');

// ---

var transports = [
	new winston.transports.Console({prettyPrint : true})
];

// ---

var logger = new winston.Logger({
	transports: transports
});

// ---

function exception(exception) {
	logger.debug(exception.message, exception);
}

// ---

function setGlobalLevel(level) {
	if (!(typeof(level) == 'string' || level instanceof String)) {
		level = Object.keys(logger.levels).reduce(function (previousValue, currentValue, index, array) {
			if (logger.levels[previousValue] == level) {
				return previousValue;
			} else {
				return currentValue;
			}
		}, logger.level);
	}
	
	logger.level = level;
	
	Object.keys(logger.transports).forEach(function (name) {
		var transport = logger.transports[name];
		
		transport.level = level;
	});
}

function setGlobalColorization(colorize) {
	logger.colorize = colorize;
	
	Object.keys(logger.transports).forEach(function (name) {
		var transport = logger.transports[name];
		
		transport.colorize = colorize;
	});
}

// ---

module.exports = logger;
module.exports.exception = exception;
module.exports.setGlobalLevel = setGlobalLevel;
module.exports.setGlobalColorization = setGlobalColorization;
