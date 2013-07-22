var winston = require('winston');

// ---

var transports = [
	new winston.transports.Console({prettyPrint : true})
];

var exceptionHandlers = [
	new winston.transports.Console({prettyPrint : true})
];

// ---

module.exports = new winston.Logger({
	transports: transports,
	exceptionHandlers: exceptionHandlers
});
