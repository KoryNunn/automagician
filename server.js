var config = require('config');
var http = require('http');
var fs = require('fs');

var server = http.createServer(function(request, response){
	fs.createReadStream(__dirname + '/index.browser.js').pipe(response);
});

server.listen(config.get('port'));