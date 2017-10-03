var crel = require('crel');
var righto = require('righto');
var uiDriver = require('automagic-ui');
uiDriver.init({
	runDelay: 50
});
var driver = uiDriver();

var automagicStyles = `
	.automagic{	
		position: fixed;
		top: 0;
		left:0;
		right:0;
		background: black;
		padding: 10px;
		z-index: 1000;
	}

	.automagic.hide{
		right:auto;
		padding: 2px;
	}

	.automagic.hide > *:not(.hideShow){
		display:none;
	}

	.automagic code{
		display: block;
		padding: 5px;
	}
`

var storage = localStorage.getItem('automagic');

var codeArea, runButton, hideShowButton;
var ui = crel('div', { class: 'automagic' },
	crel('style', automagicStyles),
	hideShowButton = crel('button', { class: 'hideShow' }, '_'),
	crel('pre',
		codeArea = crel('code', {'contenteditable': true}, storage),
		runButton = crel('button', 'run')
	)
);

var existing = document.querySelector('.automagic');
var shown = true;

if(existing){
	existing.remove();
}

crel(document.body, ui);

var operations = {
	click: function(selector, args, callback){
		driver.click(selector).go(callback);
	},
	clickSelector: function(selector, args, callback){
		document.querySelector(selector).click();
		callback();
	},
	enter: function(selector, args, callback){
		driver
		.focus(selector)
		.changeValue(args[0])
		.go(callback);
	},
	enterSelector: function(selector, args, callback){
        document.querySelector(selector).focus();
		document.querySelector(selector).value = args[0];
        document.querySelector(selector).blur();
		callback();
	},
	scrollTo: function(selector, args, callback){
		driver.scrollTo(selector).go(callback);
	}
};

codeArea.addEventListener('keyup', function(){
	localStorage.setItem('automagic', codeArea.innerText);
});

function run(){
	var commands = codeArea.innerText.split('\n').filter(x => x.trim());

	var complete = righto.reduce(commands.map(function(command){
		if(command.match(/^\/\//)){
			var result = 'commented command:', command;
			console.log(result);
			return righto.value(result);
		}

		var parts = command.split(' - ');
		console.log(parts);
		var selector = parts[0];
		var operation = parts[1];
		var args = parts.slice(2);

		if(!(operation in operations)){
			return righto.fail(new Error("NO OPERATION: " + operation));
		}

		return righto(operations[operation], selector, args);
	}));

	complete(console.log.bind(null, 'Result:'));
}

runButton.addEventListener('click', run);

function hideShow(){
	shown = !shown;
	var state = shown;
	hideShowButton.textContent = shown ? '_' : '\uD83D\uDDD6';
	ui.classList.remove(shown ? 'hide' : 'show');
	ui.classList.add(shown ? 'show' : 'hide');
}

hideShowButton.addEventListener('click', hideShow);