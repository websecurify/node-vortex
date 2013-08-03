var express = require('express');
var app = express();

app.get('/', function(req, res){
	var body = 'Hello World! The time is ' + (new Date()).getTime() + '.';
	
	res.setHeader('Content-Type', 'text/plain');
	res.setHeader('Content-Length', body.length);
	
	res.end(body);
});

app.listen(3000);
