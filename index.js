var crel = require('crel');
var righto = require('righto');
var uiDriver = require('automagic-ui');
uiDriver.init({
	runDelay: 50
});
var driver = uiDriver();

var automagicStyles = `
	@media print {
		.automagic{
			display: none;
		}
	}

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

	.automagic.hide .input{
		display:none;
	}

	.automagic.running .input{
		display:none;
	}

	.automagic textarea{
		display: block;
		padding: 5px;
		width: 100%;
		height: 200px;
	}

	.automagic .output{
		color: white;
		padding: 1em;
	}

	.automagic .output.error{
		color: red;
	}
`

var storage = localStorage.getItem('automagic');

var codeArea, runButton, hideShowButton;
var ui = crel('div', { class: 'automagic' },
	crel('style', automagicStyles),
	hideShowButton = crel('button', { class: 'hideShow' }, '_'),
	output = crel('span', { class: 'output' }),
	crel('pre', { class: 'input' },
		codeArea = crel('textarea', storage),
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
		.changeValue(selector, null, args[0])
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
	},
    waitFor: function(selector, args, callback){
        var startTime = Date.now();
        var timeout = args[0] || 5000;
        var found = righto(function(done){
            function retry(){
                if(Date.now() - startTime > timeout){
                    return done(new Error('Timeout finding ' + selector));
                }

                driver.findUi(selector).go(function(error){
                    if(error){
                        return retry();
                    }

                    callback();
                });
            }

            retry();
        });

        found(callback);
    }
};

codeArea.addEventListener('keyup', function(){
	localStorage.setItem('automagic', codeArea.value);
});

function run(){
	hideShow(false);
	ui.classList.add('running');
	output.classList.remove('error');
	var commands = codeArea.value.split('\n').filter(x => x.trim());

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

	complete(function(error){
		ui.classList.remove('running');

		if(error){
			output.classList.add('error');
			output.textContent = error;
			return;
		}

		output.textContent = 'Success';
	});
}

runButton.addEventListener('click', run);

function hideShow(show){
	shown = !shown;
	if(typeof show === 'boolean'){
		shown = show;
	}
	hideShowButton.textContent = shown ? '_' : '\uD83D\uDDD6';
	ui.classList.remove(shown ? 'hide' : 'show');
	ui.classList.add(shown ? 'show' : 'hide');
}

hideShowButton.addEventListener('click', hideShow);