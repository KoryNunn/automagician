var http = require('http');
var fs = require('fs');
var port = process.argv[2] || 8080;

var server = http.createServer(function(request, response){
	fs.createReadStream(__dirname + '/index.browser.js').pipe(response);
});

server.listen(port);