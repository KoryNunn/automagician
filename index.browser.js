(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
},{"automagic-ui":3,"crel":4,"righto":6}],2:[function(require,module,exports){
function checkIfPromise(promise){
    if(!promise || typeof promise !== 'object' || typeof promise.then !== 'function'){
        throw "Abbott requires a promise to break. It is the only thing Abbott is good at.";
    }
}

module.exports = function abbott(promiseOrFn){
    if(typeof promiseOrFn !== 'function'){
        checkIfPromise(promiseOrFn);
    }

    return function(){
        var promise;
        if(typeof promiseOrFn === 'function'){
           promise = promiseOrFn.apply(null, Array.prototype.slice.call(arguments, 0, -1));
        }else{
            promise = promiseOrFn;
        }

        checkIfPromise(promise);

        var callback = arguments[arguments.length-1];
        promise.then(callback.bind(null, null), callback);
    };
};
},{}],3:[function(require,module,exports){
var predator = require('predator');
var scrollIntoView = require('scroll-into-view');

// List of tagNames ordered by their likeliness to be the target of a click event
var textWeighting = ['h1', 'h2', 'h3', 'h4', 'label', 'p', 'a', 'button'];
var clickWeighting = ['button', 'input', 'a', 'h1', 'h2', 'h3', 'h4', 'i', 'label'];
var valueWeighting = ['input', 'textarea', 'select', 'label'];

var types = {
        'button': ['button', 'a'],
        'label': ['label', 'span', 'div'],
        'heading': ['h1', 'h2', 'h3', 'h4'],
        'image': ['img', 'svg'],
        'field': ['input', 'textarea', 'select', 'label'],
        'all': ['*'],
        'text': ['*']
    },
    noElementOfType = 'no elements of type ',
    documentScope,
    windowScope,
    runDelay,
    initialised;

function _pressKey(key, done) {
    var element = this.currentContext.activeElement;

    element.value += key;

    var keydownEvent = new windowScope.KeyboardEvent('keydown'),
        keyupEvent = new windowScope.KeyboardEvent('keyup'),
        pressKeyEvent = new windowScope.KeyboardEvent('pressKey');

    var method = 'initKeyboardEvent' in keydownEvent ? 'initKeyboardEvent' : 'initKeyEvent';

    keydownEvent[method]('keydown', true, true, windowScope, key, 3, true, false, true, false, false);
    keyupEvent[method]('keyup', true, true, windowScope, key, 3, true, false, true, false, false);
    pressKeyEvent[method]('pressKey', true, true, windowScope, key, 3, true, false, true, false, false);

    element.dispatchEvent(keydownEvent);
    element.dispatchEvent(keyupEvent);
    element.dispatchEvent(pressKeyEvent);

    done(null, element);
}

function _pressKeys(keys, done) {
    var state = this,
        nextKey = String(keys).charAt(0);

    if(nextKey === ''){
        return done(null, this.currentContext.activeElement);
    }

    _pressKey.call(state, nextKey, function() {
        setTimeout(function(){
            _pressKeys.call(state, String(keys).slice(1), done);
        }, 50);
    });
}

function findUi(currentContex, selectors) {
    return Array.prototype.slice.call(currentContex.querySelectorAll(selectors))
        .sort(function(a, b){
            return !a.contains(b) ? -1 : 0;
        }); // deeper elements take precedence.
}

function _navigate(location, previousElement, done) {
    var callbackTimer;

    function handlewindowScopeError(error) {
        clearTimeout(callbackTimer);

        done(error);
        windowScope.removeEventListener('error', handlewindowScopeError);
    }

    windowScope.addEventListener('error', handlewindowScopeError);
    windowScope.location = location;

    callbackTimer = setTimeout(done, 150);
}

function _getLocation(done) {
    setTimeout(function() {
        done(null, windowScope.location);
    }, 500);
}

function matchElementValue(element, value) {
    return (
            element.textContent.toLowerCase() === value.toLowerCase() ||
            (element.title && element.title.toLowerCase() === value.toLowerCase())
        );
}

function findMatchingElements(value, type, elementsList) {
    return Array.prototype.slice.call(elementsList)
        .filter(function(element) {
            return matchElementValue(element, value);
        });
}

function getElementTextWeight(element) {
    var index = textWeighting.indexOf(element.tagName.toLowerCase());
    return textWeighting.length - (index < 0 ? Infinity : index);
}

function getElementClickWeight(element) {
    var index = clickWeighting.indexOf(element.tagName.toLowerCase());
    return clickWeighting.length - (index < 0 ? Infinity : index);
}

function getElementValueWeight(element) {
    var index = valueWeighting.indexOf(element.tagName.toLowerCase());
    return valueWeighting.length - (index < 0 ? Infinity : index);
}

function _findAllUi(value, type, done){
    if(!type){
        type = 'all';
    }

    var elementTypes = types[type];


    if(!elementTypes) {
        return done(new Error(type + ' is not a valid ui type'));
    }

    var elements = findUi(this.currentContext, elementTypes);

    if(!elements.length) {
        return done(new Error(noElementOfType + type));
    }

    var results = findMatchingElements(value, type, elements)
        .sort(function(a, b) {
            return getElementTextWeight(a) < getElementTextWeight(b);
        });

    done(null, results);
}

function _findUi(value, type, returnArray, done) {
    if(!done) {
        done = returnArray;
        returnArray = false;
    }

    _findAllUi.call(this, value, type, function(error, elements){
        if(error){
            return done(error);
        }

        var results = Array.prototype.slice.call(elements)
            .filter(function(element){
                return !predator(element).hidden;
            });

        if(!results.length){
            return done(new Error('"' + value + '" was found but not visible on screen'));
        }

        done(null, returnArray ? results : results.shift());
    });
}

function _setValue(value, type, text, done) {
    _focus.call(this, value, type, function(error, element) {
        if(error){
            return done(error);
        }

        element.value = text;

        done(null, element);
    });
}

function _wait(time, done) {
    setTimeout(done, time || 0);
}

function findClickable(currentContext, elements){
    for(var i = 0; i < elements.length; i++){
        var element = elements[i];
            rect = element.getBoundingClientRect(),
            clickElement = currentContext.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2),
            clickElementInElement = element.contains(clickElement),
            elementInClickElement = clickElement.contains(element);

        if(clickElementInElement || elementInClickElement || clickElement === element){
            return clickElement;
        }
    }
}

function executeClick(value, type, done) {
    var state = this;
    _findUi.call(state, value, 'all', true, function(error, elements) {
        if(error) {
            return done(error);
        }

        var clickableElements = elements
            .sort(function(a, b) {
                return getElementClickWeight(a) < getElementClickWeight(b);
            });

        var element = findClickable(state.currentContext, elements);

        if(!element) {
            return done(new Error('could not find clickable element matching "' + value + '"'));
        }

        // SVG paths
        while(!element.click){
            element = element.parentNode;
        }

        element.click();

        setTimeout(function(){
            done(null, element);
        }, clickDelay)

    });
}

function _focus(value, type, done) {
   _findUi.call(this, value, type, true, function(error, elements){
        if(error){
            return done(error);
        }

        var result = elements
            .sort(function(a, b) {
                return getElementValueWeight(a) < getElementValueWeight(b);
            })
            .shift();

        result.focus();

        done(null, result);
   });
}

function _changeValue(value, type, text, done) {
    var state = this;

    _focus.call(state, value, type, function(error, element) {
        if(error){
            return done(error);
        }

        _pressKeys.call(state, text, function(error){
            if(error){
                return done(error);
            }

            element.blur();

            var event = document.createEvent('HTMLEvents');

            event.initEvent('change', false, true);
            element.dispatchEvent(event);

            done(null, element);
        });
    });
}

function _getValue(value, type, done) {
    _focus.call(this, value, type, function(error, element) {
        if(error){
            return done(error);
        }

        done(null, 'value' in element ? element.value : element.textContent);
    });
}

function _blur(done) {
    var element = this.currentContext.activeElement;
    element.blur();

    done(null, element);
}

function _scrollTo(value, type, done){
    _findAllUi.call(this, value, type, function(error, elements) {
        if(error) {
            return done(error);
        }

        var targetElement = elements.shift();

        scrollIntoView(targetElement, { time: 50 }, function(){
            done(null, targetElement);
        });
    });
}

function runTasks(state, tasks, callback) {
    if(tasks.length) {
        tasks.shift()(function(error, result) {
            if(error) {
                return callback(error);
            } else {
                state.lastResult = result;

                if(tasks.length === 0) {
                    callback(null, result);
                } else {
                    runTasks(state, tasks, callback);
                }
            }
        });
    }
}

function driveUi(currentContext){
    var tasks = [],
        driverFunctions = {},
        state = {
            currentContext: currentContext || documentScope
        };

    function addTask(task){
        tasks.push(task);

        return driverFunctions;
    }

    driverFunctions = {
        navigate: function(location){
            return addTask(_navigate.bind(state, location));
        },
        findUi: function(value, type){
            return addTask(_findUi.bind(state, value, type));
        },
        getLocation: function() {
            return addTask(_getLocation.bind(state));
        },
        focus: function(value, type) {
            return addTask(_focus.bind(state, value, type));
        },
        blur: function() {
            return addTask(_blur.bind(state));
        },
        click: function(value, type){
            return addTask(executeClick.bind(state, value, type));
        },
        pressKey: function(value) {
            return addTask(_pressKey.bind(state, value));
        },
        pressKeys: function(value) {
            return addTask(_pressKeys.bind(state, value));
        },
        changeValue: function(value, type, text) {
            return addTask(_changeValue.bind(state, value, type, text));
        },
        setValue: function(value, type, text) {
            return addTask(_setValue.bind(state, value, type, text));
        },
        getValue: function(value, type) {
            return addTask(_getValue.bind(state, value, type));
        },
        wait: function(time) {
            if(!arguments.length) {
                time = runDelay;
            }

            return addTask(_wait.bind(state, time));
        },
        do: function(driver){
            return addTask(driver.go);
        },
        in: function(value, type, addSubTasks){
            return addTask(function(done){
                _findUi.call(state, value, type, function(error, element){
                    if(error){
                        return done(error);
                    }

                    var newDriver = driveUi(element);

                    addSubTasks(newDriver);

                    newDriver.go(done);
                });
            });
        },
        check: function(task){
            return addTask(function(callback){
                task(state.lastResult, callback);
            });
        },
        scrollTo: function(value, type){
            return addTask(_scrollTo.bind(state, value, type));
        },
        go: function(callback) {
            if(!initialised) {
                throw(new Error('init must becalled before calling go'));
            }

            if(tasks.length) {
                tasks.unshift(_wait.bind(state, runDelay));
                runTasks(state, tasks, callback);
            } else {
                callback(new Error('No tasks defined'));
            }
        }
    };

    return driverFunctions;
}

driveUi.init = function(settings) {
    documentScope = settings.document || document;
    windowScope = settings.window || window;
    runDelay = settings.runDelay || 0;
    clickDelay = settings.clickDelay || 100;

    initialised = true;
};

module.exports = driveUi;

},{"predator":5,"scroll-into-view":7}],4:[function(require,module,exports){
//Copyright (C) 2012 Kory Nunn

//Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

//The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/*

    This code is not formatted for readability, but rather run-speed and to assist compilers.

    However, the code's intention should be transparent.

    *** IE SUPPORT ***

    If you require this library to work in IE7, add the following after declaring crel.

    var testDiv = document.createElement('div'),
        testLabel = document.createElement('label');

    testDiv.setAttribute('class', 'a');
    testDiv['className'] !== 'a' ? crel.attrMap['class'] = 'className':undefined;
    testDiv.setAttribute('name','a');
    testDiv['name'] !== 'a' ? crel.attrMap['name'] = function(element, value){
        element.id = value;
    }:undefined;


    testLabel.setAttribute('for', 'a');
    testLabel['htmlFor'] !== 'a' ? crel.attrMap['for'] = 'htmlFor':undefined;



*/

(function (root, factory) {
    if (typeof exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        root.crel = factory();
    }
}(this, function () {
    var fn = 'function',
        obj = 'object',
        nodeType = 'nodeType',
        textContent = 'textContent',
        setAttribute = 'setAttribute',
        attrMapString = 'attrMap',
        isNodeString = 'isNode',
        isElementString = 'isElement',
        d = typeof document === obj ? document : {},
        isType = function(a, type){
            return typeof a === type;
        },
        isNode = typeof Node === fn ? function (object) {
            return object instanceof Node;
        } :
        // in IE <= 8 Node is an object, obviously..
        function(object){
            return object &&
                isType(object, obj) &&
                (nodeType in object) &&
                isType(object.ownerDocument,obj);
        },
        isElement = function (object) {
            return crel[isNodeString](object) && object[nodeType] === 1;
        },
        isArray = function(a){
            return a instanceof Array;
        },
        appendChild = function(element, child) {
            if (isArray(child)) {
                child.map(function(subChild){
                    appendChild(element, subChild);
                });
                return;
            }
            if(!crel[isNodeString](child)){
                child = d.createTextNode(child);
            }
            element.appendChild(child);
        };


    function crel(){
        var args = arguments, //Note: assigned to a variable to assist compilers. Saves about 40 bytes in closure compiler. Has negligable effect on performance.
            element = args[0],
            child,
            settings = args[1],
            childIndex = 2,
            argumentsLength = args.length,
            attributeMap = crel[attrMapString];

        element = crel[isElementString](element) ? element : d.createElement(element);
        // shortcut
        if(argumentsLength === 1){
            return element;
        }

        if(!isType(settings,obj) || crel[isNodeString](settings) || isArray(settings)) {
            --childIndex;
            settings = null;
        }

        // shortcut if there is only one child that is a string
        if((argumentsLength - childIndex) === 1 && isType(args[childIndex], 'string') && element[textContent] !== undefined){
            element[textContent] = args[childIndex];
        }else{
            for(; childIndex < argumentsLength; ++childIndex){
                child = args[childIndex];

                if(child == null){
                    continue;
                }

                if (isArray(child)) {
                  for (var i=0; i < child.length; ++i) {
                    appendChild(element, child[i]);
                  }
                } else {
                  appendChild(element, child);
                }
            }
        }

        for(var key in settings){
            if(!attributeMap[key]){
                if(isType(settings[key],fn)){
                    element[key] = settings[key];
                }else{
                    element[setAttribute](key, settings[key]);
                }
            }else{
                var attr = attributeMap[key];
                if(typeof attr === fn){
                    attr(element, settings[key]);
                }else{
                    element[setAttribute](attr, settings[key]);
                }
            }
        }

        return element;
    }

    // Used for mapping one kind of attribute to the supported version of that in bad browsers.
    crel[attrMapString] = {};

    crel[isElementString] = isElement;

    crel[isNodeString] = isNode;

    if(typeof Proxy !== 'undefined'){
        crel.proxy = new Proxy(crel, {
            get: function(target, key){
                !(key in crel) && (crel[key] = crel.bind(null, key));
                return crel[key];
            }
        });
    }

    return crel;
}));

},{}],5:[function(require,module,exports){
function findChildsExposedBox(child){
    var originalBounds = child.getBoundingClientRect(),
        parent = child.parentNode,
        parentOverflow,
        parentBounds,
        bounds;

    // Convert bounds object to pojo.
    bounds = {
        original: originalBounds,
        height: originalBounds.height,
        width: originalBounds.width,
        left: originalBounds.left,
        top: originalBounds.top,
        right: originalBounds.right,
        bottom: originalBounds.bottom
    };

    while(parent){
        if(parent === document){
            parentBounds = {
                top: 0,
                left: 0,
                bottom: window.innerHeight,
                right: window.innerWidth,
                height: window.innerHeight,
                width: window.innerWidth
            };
        }else{
            var parentOverflow = window.getComputedStyle(parent).overflow;
            if(parentOverflow === '' || parentOverflow === 'visible'){
                parent = parent.parentNode;
                continue;
            }
            parentBounds = parent.getBoundingClientRect();
        }

        if(parentBounds.top > bounds.top){
            bounds.height = bounds.height - (parentBounds.top - bounds.top);
            bounds.top = parentBounds.top;
        }
        if(parentBounds.left > bounds.left){
            bounds.width = bounds.width - (parentBounds.left - bounds.left);
            bounds.left = parentBounds.left;
        }
        if(parentBounds.right < bounds.right){
            bounds.width = bounds.width - (bounds.right - parentBounds.right);
            bounds.right = parentBounds.right;
        }
        if(parentBounds.bottom < bounds.bottom){
            bounds.height = bounds.height - (bounds.bottom - parentBounds.bottom);
            bounds.bottom = parentBounds.bottom;
        }

        if(bounds.width <= 0 || bounds.height <= 0){
            bounds.hidden = true;
            bounds.width = Math.max(bounds.width, 0);
            bounds.height = Math.max(bounds.height, 0);
            return bounds;
        }

        parent = parent.parentNode;
    }

    return bounds;
}

module.exports = findChildsExposedBox;
},{}],6:[function(require,module,exports){
(function (global){
var abbott = require('abbott');

var defer = global.process && global.process.nextTick || global.setImmediate || global.setTimeout;

function isRighto(x){
    return typeof x === 'function' && (x.__resolve__ === x || x.resolve === x);
}

function isThenable(x){
    return x && typeof x.then === 'function' && !isRighto(x);
}

function isResolvable(x){
    return isRighto(x) || isThenable(x);
}

function isTake(x){
    return x && typeof x === 'object' && '__take__' in x;
}

var slice = Array.prototype.slice.call.bind(Array.prototype.slice);

function getCallLine(stack){
    var index = 0,
        lines = stack.split('\n');

    while(lines[++index] && lines[index].match(/righto\/index\.js/)){}

    var match = lines[index] && lines[index].match(/at (.*)/);

    return match ? match[1] : ' - No trace - ';
}

function resolveDependency(task, done){
    if(isThenable(task)){
        task = righto(abbott(task));
    }

    if(isRighto(task)){
        return task(function(error){
            var results = slice(arguments, 1, 2);

            if(!results.length){
                results.push(undefined);
            }

            done(error, results);
        });
    }

    function take(targetTask){
        var keys = slice(arguments, 1);
        return targetTask(function(error){
            var args = slice(arguments, 1);
            done(error, keys.map(function(key){
                return args[key];
            }));
        });
    }

    if(
        righto._debug &&
        righto._warnOnUnsupported &&
        Array.isArray(task) &&
        isRighto(task[0]) &&
        !isRighto(task[1])
    ){

        console.warn('\u001b[33mPossible unsupported take/ignore syntax detected:\u001b[39m\n' + getCallLine(this._stack));
    }

    if(isTake(task)){
        return take.apply(null, task.__take__);
    }

    return done(null, [task]);
}

function traceGet(instance, result){
    if(righto._debug && !(typeof result === 'object' || typeof result === 'function')){
        var line = getCallLine(instance._stack);
        throw new Error('Result of righto was not an instance at: \n' + line);
    }
}

function get(fn){
    var instance = this;
    return righto(function(result, fn, done){
        if(typeof fn === 'string' || typeof fn === 'number'){
            traceGet(instance, result);
            return done(null, result[fn]);
        }

        righto.from(fn(result))(done);
    }, this, fn);
}

var noOp = function(){};

function proxy(instance){
    instance._ = new Proxy(instance, {
        get: function(target, key){
            if(key === '__resolve__'){
                return instance._;
            }

            if(instance[key] || key in instance || key === 'inspect' || typeof key === 'symbol'){
                return instance[key];
            }

            if(righto._debug && key.charAt(0) === '_'){
                return instance[key];
            }

            return proxy(righto.sync(function(result){
                traceGet(instance, result);
                return result[key];
            }, instance));
        }
    });
    instance.__resolve__ = instance._;
    return instance._;
}

function resolveIterator(fn){
    return function(){
        var args = slice(arguments),
            callback = args.pop(),
            errored,
            lastValue;

        function reject(error){
            if(errored){
                return;
            }
            errored = true;
            callback(error);
        }

        var generator = fn.apply(null, args.concat(reject));

        function run(){
            if(errored){
                return;
            }
            var next = generator.next(lastValue);
            if(next.done){
                if(errored){
                    return;
                }
                return callback(null, next.value);
            }
            if(isResolvable(next.value)){
                righto.sync(function(value){
                    lastValue = value;
                    run();
                }, next.value)(function(error){
                    if(error){
                        reject(error);
                    }
                });
                return;
            }
            lastValue = next.value;
            run();
        }

        run();
    };
}

function addTracing(resolve, fn, args){

    var argMatch = fn.toString().match(/^[\w\s]*?\(((?:\w+[,\s]*?)*)\)/),
        argNames = argMatch ? argMatch[1].split(/[,\s]+/g) : [];

    resolve._stack = new Error().stack;
    resolve._trace = function(tabs){
        var firstLine = getCallLine(resolve._stack);

        if(resolve._error){
            firstLine = '\u001b[31m' + firstLine + ' <- ERROR SOURCE' +  '\u001b[39m';
        }

        tabs = tabs || 0;
        var spacing = '    ';
        for(var i = 0; i < tabs; i ++){
            spacing = spacing + '    ';
        }
        return args.map(function(arg, index){
            return [arg, argNames[index] || index];
        }).reduce(function(results, argInfo){
            var arg = argInfo[0],
                argName = argInfo[1];

            if(isTake(arg)){
                arg = arg.__take__[0];
            }

            if(isRighto(arg)){
                var line = spacing + '- argument "' + argName + '" from ';


                if(!arg._trace){
                    line = line + 'Tracing was not enabled for this righto instance.';
                }else{
                    line = line + arg._trace(tabs + 1);
                }
                results.push(line);
            }

            return results;
        }, [firstLine])
        .join('\n');
    };
}

function taskComplete(error){
    var done = this[0],
        context = this[1],
        callbacks = context.callbacks;

    if(error && righto._debug){
        context.resolve._error = error;
    }

    var results = arguments;

    done(results);

    for(var i = 0; i < callbacks.length; i++){
        defer(callbacks[i].apply.bind(callbacks[i], null, results));
    }
}

function errorOut(error, callback){
    if(error && righto._debug){
        if(righto._autotraceOnError || this.resolve._traceOnError){
            console.log('Dependency error executing ' + this.fn.name + ' ' + this.resolve._trace());
        }
    }

    callback(error);
}

function debugResolve(context, args, complete){
    try{
        args.push(complete);
        context.fn.apply(null, args);
    }catch(error){
        console.log('Task exception executing ' + context.fn.name + ' from ' + context.resolve._trace());
        throw error;
    }
}

function resolveWithDependencies(done, error, argResults){
    var context = this;

    if(error){
        var boundErrorOut = errorOut.bind(context, error);

        for(var i = 0; i < context.callbacks.length; i++){
            boundErrorOut(context.callbacks[i]);
        }

        return;
    }

    var args = [].concat.apply([], argResults),
        complete = taskComplete.bind([done, context]);

    if(righto._debug){
        return debugResolve(context, args, complete);
    }

    // Slight perf bump by avoiding apply for simple cases.
    switch(args.length){
        case 0: context.fn(complete); break;
        case 1: context.fn(args[0], complete); break;
        case 2: context.fn(args[0], args[1], complete); break;
        case 3: context.fn(args[0], args[1], args[2], complete); break;
        default:
            args.push(complete);
            context.fn.apply(null, args);
    }
}

function resolveDependencies(args, complete, resolveDependency){
    var results = [],
        done = 0,
        hasErrored;

    if(!args.length){
        complete(null, []);
    }

    function dependencyResolved(index, error, result){
        if(hasErrored){
            return;
        }

        if(error){
            hasErrored = true;
            return complete(error);
        }

        results[index] = result;

        if(++done === args.length){
            complete(null, results);
        }
    }

    for(var i = 0; i < args.length; i++){
        resolveDependency(args[i], dependencyResolved.bind(null, i));
    }
}

function resolver(complete){
    var context = this;

    // No callback? Just run the task.
    if(!arguments.length){
        complete = noOp;
    }

    if(isRighto(complete)){
        throw new Error('righto instance passed into a righto instance instead of a callback');
    }

    if(typeof complete !== 'function'){
        throw new Error('Callback must be a function');
    }

    if(context.results){
        return complete.apply(null, context.results);
    }

    context.callbacks.push(complete);

    if(context.started++){
        return;
    }

    var resolved = resolveWithDependencies.bind(context, function(resolvedResults){
            if(righto._debug){
                if(righto._autotrace || context.resolve._traceOnExecute){
                    console.log('Executing ' + context.fn.name + ' ' + context.resolve._trace());
                }
            }

            context.results = resolvedResults;
        });

    defer(resolveDependencies.bind(null, context.args, resolved, resolveDependency.bind(context.resolve)));

    return context.resolve;
};

function righto(){
    var args = slice(arguments),
        fn = args.shift();

    if(typeof fn !== 'function'){
        throw new Error('No task function passed to righto');
    }

    if(isRighto(fn) && args.length > 0){
        throw new Error('Righto task passed as target task to righto()');
    }

    var resolverContext = {
            fn: fn,
            callbacks: [],
            args: args,
            started: 0
        },
        resolve = resolver.bind(resolverContext);
    resolve.get = get.bind(resolve);
    resolverContext.resolve = resolve;
    resolve.resolve = resolve;

    if(righto._debug){
        addTracing(resolve, fn, args);
    }

    return resolve;
}

righto.sync = function(fn){
    return righto.apply(null, [function(){
        var args = slice(arguments),
            done = args.pop(),
            result = fn.apply(null, args);

        if(isResolvable(result)){
            return righto.from(result)(done);
        }

        done(null, result);
    }].concat(slice(arguments, 1)));
};

righto.all = function(value){
    var task = value;
    if(arguments.length > 1){
        task = slice(arguments);
    }

    function resolve(tasks){
        return righto.apply(null, [function(){
            arguments[arguments.length - 1](null, slice(arguments, 0, -1));
        }].concat(tasks));
    }

    if(isRighto(task)){
        return righto(function(tasks, done){
            resolve(tasks)(done);
        }, task);
    }

    return resolve(task);
};

righto.reduce = function(values, reducer, seed){
    var hasSeed = arguments.length >= 3;

    if(!reducer){
        reducer = function(previous, next){
            return righto(next);
        };
    }

    return righto.from(values).get(function(values){
        if(!values || !values.reduce){
            throw new Error('values was not a reduceable object (like an array)');
        }

        if(!values.length){
            return righto.from(undefined);
        }

        values = values.slice();

        if(!hasSeed){
            seed = righto(values.shift());
        }

        return values.reduce(function(previous, next){
            return righto.sync(reducer, previous, righto.value(next));
        }, seed);
    });
};

righto.from = function(value){
    if(isRighto(value)){
        return value;
    }

    if(!isResolvable(value) && typeof value === 'function'){
        return righto.all(slice(arguments, 1)).get(function(args){
            return righto.from(value.apply(null, args));
        });
    }

    return righto.sync(function(resolved){
        return resolved;
    }, value);
};

righto.mate = function(){
    return righto.apply(null, [function(){
        arguments[arguments.length -1].apply(null, [null].concat(slice(arguments, 0, -1)));
    }].concat(slice(arguments)));
};

righto.take = function(task){
    if(!isResolvable(task)){
        throw new Error('task was not a resolvable value');
    }

    return {__take__: slice(arguments)};
};

righto.after = function(task){
    if(!isResolvable(task)){
        throw new Error('task was not a resolvable value');
    }

    if(arguments.length === 1){
        return {__take__: [task]};
    }

    return {__take__: [righto.mate.apply(null, arguments)]};
};

righto.resolve = function(object, deep){
    if(isRighto(object)){
        return righto.sync(function(object){
            return righto.resolve(object, deep);
        }, object);
    }

    if(!object || !(typeof object === 'object' || typeof object === 'function')){
        return righto.from(object);
    }

    var pairs = righto.all(Object.keys(object).map(function(key){
        return righto(function(value, done){
            if(deep){
                righto.sync(function(value){
                    return [key, value];
                }, righto.resolve(value, true))(done);
                return;
            }
            done(null, [key, value]);
        }, object[key]);
    }));

    return righto.sync(function(pairs){
        return pairs.reduce(function(result, pair){
            result[pair[0]] = pair[1];
            return result;
        }, Array.isArray(object) ? [] : {});
    }, pairs);
};

righto.iterate = function(){
    var args = slice(arguments),
        fn = args.shift();

    return righto.apply(null, [resolveIterator(fn)].concat(args));
};

righto.value = function(){
    var args = arguments;
    return righto(function(done){
        done.apply(null, [null].concat(slice(args)));
    });
};

righto.surely = function(task){
    if(!isResolvable(task)){
        task = righto.apply(null, arguments);
    }

    return righto(function(done){
        task(function(){
            done(null, slice(arguments));
        });
    });
};

righto.handle = function(task, handler){
    return righto(function(handler, done){
        task(function(error){
            if(!error){
                return task(done);
            }

            handler(error, done);
        });
    }, handler);
};

righto.fail = function(error){
    return righto(function(error, done){
        done(error);
    }, error);
};

righto.isRighto = isRighto;
righto.isThenable = isThenable;
righto.isResolvable = isResolvable;

righto.proxy = function(){
    if(typeof Proxy === 'undefined'){
        throw new Error('This environment does not support Proxy\'s');
    }

    return proxy(righto.apply(this, arguments));
};

for(var key in righto){
    righto.proxy[key] = righto[key];
}

module.exports = righto;
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"abbott":2}],7:[function(require,module,exports){
var COMPLETE = 'complete',
    CANCELED = 'canceled';

function raf(task){
    if('requestAnimationFrame' in window){
        return window.requestAnimationFrame(task);
    }

    setTimeout(task, 16);
}

function setElementScroll(element, x, y){
    if(element.self === element){
        element.scrollTo(x, y);
    }else{
        element.scrollLeft = x;
        element.scrollTop = y;
    }
}

function getTargetScrollLocation(target, parent, align){
    var targetPosition = target.getBoundingClientRect(),
        parentPosition,
        x,
        y,
        differenceX,
        differenceY,
        targetWidth,
        targetHeight,
        leftAlign = align && align.left != null ? align.left : 0.5,
        topAlign = align && align.top != null ? align.top : 0.5,
        leftOffset = align && align.leftOffset != null ? align.leftOffset : 0,
        topOffset = align && align.topOffset != null ? align.topOffset : 0,
        leftScalar = leftAlign,
        topScalar = topAlign;

    if(parent.self === parent){
        targetWidth = Math.min(targetPosition.width, parent.innerWidth);
        targetHeight = Math.min(targetPosition.height, parent.innerHeight);
        x = targetPosition.left + parent.pageXOffset - parent.innerWidth * leftScalar + targetWidth * leftScalar;
        y = targetPosition.top + parent.pageYOffset - parent.innerHeight * topScalar + targetHeight * topScalar;
        x -= leftOffset;
        y -= topOffset;
        differenceX = x - parent.pageXOffset;
        differenceY = y - parent.pageYOffset;
    }else{
        targetWidth = targetPosition.width;
        targetHeight = targetPosition.height;
        parentPosition = parent.getBoundingClientRect();
        var offsetLeft = targetPosition.left - (parentPosition.left - parent.scrollLeft);
        var offsetTop = targetPosition.top - (parentPosition.top - parent.scrollTop);
        x = offsetLeft + (targetWidth * leftScalar) - parent.clientWidth * leftScalar;
        y = offsetTop + (targetHeight * topScalar) - parent.clientHeight * topScalar;
        x = Math.max(Math.min(x, parent.scrollWidth - parent.clientWidth), 0);
        y = Math.max(Math.min(y, parent.scrollHeight - parent.clientHeight), 0);
        x -= leftOffset;
        y -= topOffset;
        differenceX = x - parent.scrollLeft;
        differenceY = y - parent.scrollTop;
    }

    return {
        x: x,
        y: y,
        differenceX: differenceX,
        differenceY: differenceY
    };
}

function animate(parent){
    raf(function(){
        var scrollSettings = parent._scrollSettings;
        if(!scrollSettings){
            return;
        }

        var location = getTargetScrollLocation(scrollSettings.target, parent, scrollSettings.align),
            time = Date.now() - scrollSettings.startTime,
            timeValue = Math.min(1 / scrollSettings.time * time, 1);

        if(
            time > scrollSettings.time + 20
        ){
            setElementScroll(parent, location.x, location.y);
            parent._scrollSettings = null;
            return scrollSettings.end(COMPLETE);
        }

        var easeValue = 1 - scrollSettings.ease(timeValue);

        setElementScroll(parent,
            location.x - location.differenceX * easeValue,
            location.y - location.differenceY * easeValue
        );

        animate(parent);
    });
}
function transitionScrollTo(target, parent, settings, callback){
    var idle = !parent._scrollSettings,
        lastSettings = parent._scrollSettings,
        now = Date.now(),
        endHandler;

    if(lastSettings){
        lastSettings.end(CANCELED);
    }

    function end(endType){
        parent._scrollSettings = null;
        if(parent.parentElement && parent.parentElement._scrollSettings){
            parent.parentElement._scrollSettings.end(endType);
        }
        callback(endType);
        parent.removeEventListener('touchstart', endHandler);
    }

    parent._scrollSettings = {
        startTime: lastSettings ? lastSettings.startTime : Date.now(),
        target: target,
        time: settings.time + (lastSettings ? now - lastSettings.startTime : 0),
        ease: settings.ease,
        align: settings.align,
        end: end
    };

    endHandler = end.bind(null, CANCELED);
    parent.addEventListener('touchstart', endHandler);

    if(idle){
        animate(parent);
    }
}

function defaultIsScrollable(element){
    return (
        'pageXOffset' in element ||
        (
            element.scrollHeight !== element.clientHeight ||
            element.scrollWidth !== element.clientWidth
        ) &&
        getComputedStyle(element).overflow !== 'hidden'
    );
}

function defaultValidTarget(){
    return true;
}

module.exports = function(target, settings, callback){
    if(!target){
        return;
    }

    if(typeof settings === 'function'){
        callback = settings;
        settings = null;
    }

    if(!settings){
        settings = {};
    }

    settings.time = isNaN(settings.time) ? 1000 : settings.time;
    settings.ease = settings.ease || function(v){return 1 - Math.pow(1 - v, v / 2);};

    var parent = target.parentElement,
        parents = 0;

    function done(endType){
        parents--;
        if(!parents){
            callback && callback(endType);
        }
    }

    var validTarget = settings.validTarget || defaultValidTarget;
    var isScrollable = settings.isScrollable;

    while(parent){
        if(validTarget(parent, parents) && (isScrollable ? isScrollable(parent, defaultIsScrollable) : defaultIsScrollable(parent))){
            parents++;
            transitionScrollTo(target, parent, settings, done);
        }

        parent = parent.parentElement;

        if(!parent){
            return;
        }

        if(parent.tagName === 'BODY'){
            parent = parent.ownerDocument;
            parent = parent.defaultView || parent.ownerWindow;
        }
    }
};

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJpbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9hYmJvdHQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYXV0b21hZ2ljLXVpL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2NyZWwvY3JlbC5qcyIsIm5vZGVfbW9kdWxlcy9wcmVkYXRvci9wcmVkYXRvci5qcyIsIm5vZGVfbW9kdWxlcy9yaWdodG8vaW5kZXguanMiLCJub2RlX21vZHVsZXMvc2Nyb2xsLWludG8tdmlldy9zY3JvbGxJbnRvVmlldy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN2FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMza0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgY3JlbCA9IHJlcXVpcmUoJ2NyZWwnKTtcbnZhciByaWdodG8gPSByZXF1aXJlKCdyaWdodG8nKTtcbnZhciB1aURyaXZlciA9IHJlcXVpcmUoJ2F1dG9tYWdpYy11aScpO1xudWlEcml2ZXIuaW5pdCh7XG5cdHJ1bkRlbGF5OiA1MFxufSk7XG52YXIgZHJpdmVyID0gdWlEcml2ZXIoKTtcblxudmFyIGF1dG9tYWdpY1N0eWxlcyA9IGBcblx0QG1lZGlhIHByaW50IHtcblx0XHQuYXV0b21hZ2lje1xuXHRcdFx0ZGlzcGxheTogbm9uZTtcblx0XHR9XG5cdH1cblxuXHQuYXV0b21hZ2lje1x0XG5cdFx0cG9zaXRpb246IGZpeGVkO1xuXHRcdHRvcDogMDtcblx0XHRsZWZ0OjA7XG5cdFx0cmlnaHQ6MDtcblx0XHRiYWNrZ3JvdW5kOiBibGFjaztcblx0XHRwYWRkaW5nOiAxMHB4O1xuXHRcdHotaW5kZXg6IDEwMDA7XG5cdH1cblxuXHQuYXV0b21hZ2ljLmhpZGV7XG5cdFx0cmlnaHQ6YXV0bztcblx0XHRwYWRkaW5nOiAycHg7XG5cdH1cblxuXHQuYXV0b21hZ2ljLmhpZGUgLmlucHV0e1xuXHRcdGRpc3BsYXk6bm9uZTtcblx0fVxuXG5cdC5hdXRvbWFnaWMucnVubmluZyAuaW5wdXR7XG5cdFx0ZGlzcGxheTpub25lO1xuXHR9XG5cblx0LmF1dG9tYWdpYyB0ZXh0YXJlYXtcblx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRwYWRkaW5nOiA1cHg7XG5cdFx0d2lkdGg6IDEwMCU7XG5cdFx0aGVpZ2h0OiAyMDBweDtcblx0fVxuXG5cdC5hdXRvbWFnaWMgLm91dHB1dHtcblx0XHRjb2xvcjogd2hpdGU7XG5cdFx0cGFkZGluZzogMWVtO1xuXHR9XG5cblx0LmF1dG9tYWdpYyAub3V0cHV0LmVycm9ye1xuXHRcdGNvbG9yOiByZWQ7XG5cdH1cbmBcblxudmFyIHN0b3JhZ2UgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnYXV0b21hZ2ljJyk7XG5cbnZhciBjb2RlQXJlYSwgcnVuQnV0dG9uLCBoaWRlU2hvd0J1dHRvbjtcbnZhciB1aSA9IGNyZWwoJ2RpdicsIHsgY2xhc3M6ICdhdXRvbWFnaWMnIH0sXG5cdGNyZWwoJ3N0eWxlJywgYXV0b21hZ2ljU3R5bGVzKSxcblx0aGlkZVNob3dCdXR0b24gPSBjcmVsKCdidXR0b24nLCB7IGNsYXNzOiAnaGlkZVNob3cnIH0sICdfJyksXG5cdG91dHB1dCA9IGNyZWwoJ3NwYW4nLCB7IGNsYXNzOiAnb3V0cHV0JyB9KSxcblx0Y3JlbCgncHJlJywgeyBjbGFzczogJ2lucHV0JyB9LFxuXHRcdGNvZGVBcmVhID0gY3JlbCgndGV4dGFyZWEnLCBzdG9yYWdlKSxcblx0XHRydW5CdXR0b24gPSBjcmVsKCdidXR0b24nLCAncnVuJylcblx0KVxuKTtcblxudmFyIGV4aXN0aW5nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYWdpYycpO1xudmFyIHNob3duID0gdHJ1ZTtcblxuaWYoZXhpc3Rpbmcpe1xuXHRleGlzdGluZy5yZW1vdmUoKTtcbn1cblxuY3JlbChkb2N1bWVudC5ib2R5LCB1aSk7XG5cbnZhciBvcGVyYXRpb25zID0ge1xuXHRjbGljazogZnVuY3Rpb24oc2VsZWN0b3IsIGFyZ3MsIGNhbGxiYWNrKXtcblx0XHRkcml2ZXIuY2xpY2soc2VsZWN0b3IpLmdvKGNhbGxiYWNrKTtcblx0fSxcblx0Y2xpY2tTZWxlY3RvcjogZnVuY3Rpb24oc2VsZWN0b3IsIGFyZ3MsIGNhbGxiYWNrKXtcblx0XHRkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKS5jbGljaygpO1xuXHRcdGNhbGxiYWNrKCk7XG5cdH0sXG5cdGVudGVyOiBmdW5jdGlvbihzZWxlY3RvciwgYXJncywgY2FsbGJhY2spe1xuXHRcdGRyaXZlclxuXHRcdC5mb2N1cyhzZWxlY3Rvcilcblx0XHQuY2hhbmdlVmFsdWUoYXJnc1swXSlcblx0XHQuZ28oY2FsbGJhY2spO1xuXHR9LFxuXHRlbnRlclNlbGVjdG9yOiBmdW5jdGlvbihzZWxlY3RvciwgYXJncywgY2FsbGJhY2spe1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKS5mb2N1cygpO1xuXHRcdGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpLnZhbHVlID0gYXJnc1swXTtcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3RvcikuYmx1cigpO1xuXHRcdGNhbGxiYWNrKCk7XG5cdH0sXG5cdHNjcm9sbFRvOiBmdW5jdGlvbihzZWxlY3RvciwgYXJncywgY2FsbGJhY2spe1xuXHRcdGRyaXZlci5zY3JvbGxUbyhzZWxlY3RvcikuZ28oY2FsbGJhY2spO1xuXHR9LFxuICAgIHdhaXRGb3I6IGZ1bmN0aW9uKHNlbGVjdG9yLCBhcmdzLCBjYWxsYmFjayl7XG4gICAgICAgIHZhciBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICB2YXIgdGltZW91dCA9IGFyZ3NbMF0gfHwgNTAwMDtcbiAgICAgICAgdmFyIGZvdW5kID0gcmlnaHRvKGZ1bmN0aW9uKGRvbmUpe1xuICAgICAgICAgICAgZnVuY3Rpb24gcmV0cnkoKXtcbiAgICAgICAgICAgICAgICBpZihEYXRlLm5vdygpIC0gc3RhcnRUaW1lID4gdGltZW91dCl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkb25lKG5ldyBFcnJvcignVGltZW91dCBmaW5kaW5nICcgKyBzZWxlY3RvcikpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGRyaXZlci5maW5kVWkoc2VsZWN0b3IpLmdvKGZ1bmN0aW9uKGVycm9yKXtcbiAgICAgICAgICAgICAgICAgICAgaWYoZXJyb3Ipe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJldHJ5KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXRyeSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICBmb3VuZChjYWxsYmFjayk7XG4gICAgfVxufTtcblxuY29kZUFyZWEuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBmdW5jdGlvbigpe1xuXHRsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnYXV0b21hZ2ljJywgY29kZUFyZWEudmFsdWUpO1xufSk7XG5cbmZ1bmN0aW9uIHJ1bigpe1xuXHRoaWRlU2hvdyhmYWxzZSk7XG5cdHVpLmNsYXNzTGlzdC5hZGQoJ3J1bm5pbmcnKTtcblx0b3V0cHV0LmNsYXNzTGlzdC5yZW1vdmUoJ2Vycm9yJyk7XG5cdHZhciBjb21tYW5kcyA9IGNvZGVBcmVhLnZhbHVlLnNwbGl0KCdcXG4nKS5maWx0ZXIoeCA9PiB4LnRyaW0oKSk7XG5cblx0dmFyIGNvbXBsZXRlID0gcmlnaHRvLnJlZHVjZShjb21tYW5kcy5tYXAoZnVuY3Rpb24oY29tbWFuZCl7XG5cdFx0aWYoY29tbWFuZC5tYXRjaCgvXlxcL1xcLy8pKXtcblx0XHRcdHZhciByZXN1bHQgPSAnY29tbWVudGVkIGNvbW1hbmQ6JywgY29tbWFuZDtcblx0XHRcdGNvbnNvbGUubG9nKHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmlnaHRvLnZhbHVlKHJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0dmFyIHBhcnRzID0gY29tbWFuZC5zcGxpdCgnIC0gJyk7XG5cdFx0Y29uc29sZS5sb2cocGFydHMpO1xuXHRcdHZhciBzZWxlY3RvciA9IHBhcnRzWzBdO1xuXHRcdHZhciBvcGVyYXRpb24gPSBwYXJ0c1sxXTtcblx0XHR2YXIgYXJncyA9IHBhcnRzLnNsaWNlKDIpO1xuXG5cdFx0aWYoIShvcGVyYXRpb24gaW4gb3BlcmF0aW9ucykpe1xuXHRcdFx0cmV0dXJuIHJpZ2h0by5mYWlsKG5ldyBFcnJvcihcIk5PIE9QRVJBVElPTjogXCIgKyBvcGVyYXRpb24pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmlnaHRvKG9wZXJhdGlvbnNbb3BlcmF0aW9uXSwgc2VsZWN0b3IsIGFyZ3MpO1xuXHR9KSk7XG5cblx0Y29tcGxldGUoZnVuY3Rpb24oZXJyb3Ipe1xuXHRcdHVpLmNsYXNzTGlzdC5yZW1vdmUoJ3J1bm5pbmcnKTtcblxuXHRcdGlmKGVycm9yKXtcblx0XHRcdG91dHB1dC5jbGFzc0xpc3QuYWRkKCdlcnJvcicpO1xuXHRcdFx0b3V0cHV0LnRleHRDb250ZW50ID0gZXJyb3I7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0b3V0cHV0LnRleHRDb250ZW50ID0gJ1N1Y2Nlc3MnO1xuXHR9KTtcbn1cblxucnVuQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcnVuKTtcblxuZnVuY3Rpb24gaGlkZVNob3coc2hvdyl7XG5cdHNob3duID0gIXNob3duO1xuXHRpZih0eXBlb2Ygc2hvdyA9PT0gJ2Jvb2xlYW4nKXtcblx0XHRzaG93biA9IHNob3c7XG5cdH1cblx0aGlkZVNob3dCdXR0b24udGV4dENvbnRlbnQgPSBzaG93biA/ICdfJyA6ICdcXHVEODNEXFx1RERENic7XG5cdHVpLmNsYXNzTGlzdC5yZW1vdmUoc2hvd24gPyAnaGlkZScgOiAnc2hvdycpO1xuXHR1aS5jbGFzc0xpc3QuYWRkKHNob3duID8gJ3Nob3cnIDogJ2hpZGUnKTtcbn1cblxuaGlkZVNob3dCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoaWRlU2hvdyk7IiwiZnVuY3Rpb24gY2hlY2tJZlByb21pc2UocHJvbWlzZSl7XG4gICAgaWYoIXByb21pc2UgfHwgdHlwZW9mIHByb21pc2UgIT09ICdvYmplY3QnIHx8IHR5cGVvZiBwcm9taXNlLnRoZW4gIT09ICdmdW5jdGlvbicpe1xuICAgICAgICB0aHJvdyBcIkFiYm90dCByZXF1aXJlcyBhIHByb21pc2UgdG8gYnJlYWsuIEl0IGlzIHRoZSBvbmx5IHRoaW5nIEFiYm90dCBpcyBnb29kIGF0LlwiO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhYmJvdHQocHJvbWlzZU9yRm4pe1xuICAgIGlmKHR5cGVvZiBwcm9taXNlT3JGbiAhPT0gJ2Z1bmN0aW9uJyl7XG4gICAgICAgIGNoZWNrSWZQcm9taXNlKHByb21pc2VPckZuKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oKXtcbiAgICAgICAgdmFyIHByb21pc2U7XG4gICAgICAgIGlmKHR5cGVvZiBwcm9taXNlT3JGbiA9PT0gJ2Z1bmN0aW9uJyl7XG4gICAgICAgICAgIHByb21pc2UgPSBwcm9taXNlT3JGbi5hcHBseShudWxsLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDAsIC0xKSk7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcHJvbWlzZSA9IHByb21pc2VPckZuO1xuICAgICAgICB9XG5cbiAgICAgICAgY2hlY2tJZlByb21pc2UocHJvbWlzZSk7XG5cbiAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJndW1lbnRzW2FyZ3VtZW50cy5sZW5ndGgtMV07XG4gICAgICAgIHByb21pc2UudGhlbihjYWxsYmFjay5iaW5kKG51bGwsIG51bGwpLCBjYWxsYmFjayk7XG4gICAgfTtcbn07IiwidmFyIHByZWRhdG9yID0gcmVxdWlyZSgncHJlZGF0b3InKTtcbnZhciBzY3JvbGxJbnRvVmlldyA9IHJlcXVpcmUoJ3Njcm9sbC1pbnRvLXZpZXcnKTtcblxuLy8gTGlzdCBvZiB0YWdOYW1lcyBvcmRlcmVkIGJ5IHRoZWlyIGxpa2VsaW5lc3MgdG8gYmUgdGhlIHRhcmdldCBvZiBhIGNsaWNrIGV2ZW50XG52YXIgdGV4dFdlaWdodGluZyA9IFsnaDEnLCAnaDInLCAnaDMnLCAnaDQnLCAnbGFiZWwnLCAncCcsICdhJywgJ2J1dHRvbiddO1xudmFyIGNsaWNrV2VpZ2h0aW5nID0gWydidXR0b24nLCAnaW5wdXQnLCAnYScsICdoMScsICdoMicsICdoMycsICdoNCcsICdpJywgJ2xhYmVsJ107XG52YXIgdmFsdWVXZWlnaHRpbmcgPSBbJ2lucHV0JywgJ3RleHRhcmVhJywgJ3NlbGVjdCcsICdsYWJlbCddO1xuXG52YXIgdHlwZXMgPSB7XG4gICAgICAgICdidXR0b24nOiBbJ2J1dHRvbicsICdhJ10sXG4gICAgICAgICdsYWJlbCc6IFsnbGFiZWwnLCAnc3BhbicsICdkaXYnXSxcbiAgICAgICAgJ2hlYWRpbmcnOiBbJ2gxJywgJ2gyJywgJ2gzJywgJ2g0J10sXG4gICAgICAgICdpbWFnZSc6IFsnaW1nJywgJ3N2ZyddLFxuICAgICAgICAnZmllbGQnOiBbJ2lucHV0JywgJ3RleHRhcmVhJywgJ3NlbGVjdCcsICdsYWJlbCddLFxuICAgICAgICAnYWxsJzogWycqJ10sXG4gICAgICAgICd0ZXh0JzogWycqJ11cbiAgICB9LFxuICAgIG5vRWxlbWVudE9mVHlwZSA9ICdubyBlbGVtZW50cyBvZiB0eXBlICcsXG4gICAgZG9jdW1lbnRTY29wZSxcbiAgICB3aW5kb3dTY29wZSxcbiAgICBydW5EZWxheSxcbiAgICBpbml0aWFsaXNlZDtcblxuZnVuY3Rpb24gX3ByZXNzS2V5KGtleSwgZG9uZSkge1xuICAgIHZhciBlbGVtZW50ID0gdGhpcy5jdXJyZW50Q29udGV4dC5hY3RpdmVFbGVtZW50O1xuXG4gICAgZWxlbWVudC52YWx1ZSArPSBrZXk7XG5cbiAgICB2YXIga2V5ZG93bkV2ZW50ID0gbmV3IHdpbmRvd1Njb3BlLktleWJvYXJkRXZlbnQoJ2tleWRvd24nKSxcbiAgICAgICAga2V5dXBFdmVudCA9IG5ldyB3aW5kb3dTY29wZS5LZXlib2FyZEV2ZW50KCdrZXl1cCcpLFxuICAgICAgICBwcmVzc0tleUV2ZW50ID0gbmV3IHdpbmRvd1Njb3BlLktleWJvYXJkRXZlbnQoJ3ByZXNzS2V5Jyk7XG5cbiAgICB2YXIgbWV0aG9kID0gJ2luaXRLZXlib2FyZEV2ZW50JyBpbiBrZXlkb3duRXZlbnQgPyAnaW5pdEtleWJvYXJkRXZlbnQnIDogJ2luaXRLZXlFdmVudCc7XG5cbiAgICBrZXlkb3duRXZlbnRbbWV0aG9kXSgna2V5ZG93bicsIHRydWUsIHRydWUsIHdpbmRvd1Njb3BlLCBrZXksIDMsIHRydWUsIGZhbHNlLCB0cnVlLCBmYWxzZSwgZmFsc2UpO1xuICAgIGtleXVwRXZlbnRbbWV0aG9kXSgna2V5dXAnLCB0cnVlLCB0cnVlLCB3aW5kb3dTY29wZSwga2V5LCAzLCB0cnVlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UsIGZhbHNlKTtcbiAgICBwcmVzc0tleUV2ZW50W21ldGhvZF0oJ3ByZXNzS2V5JywgdHJ1ZSwgdHJ1ZSwgd2luZG93U2NvcGUsIGtleSwgMywgdHJ1ZSwgZmFsc2UsIHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cbiAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQoa2V5ZG93bkV2ZW50KTtcbiAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQoa2V5dXBFdmVudCk7XG4gICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KHByZXNzS2V5RXZlbnQpO1xuXG4gICAgZG9uZShudWxsLCBlbGVtZW50KTtcbn1cblxuZnVuY3Rpb24gX3ByZXNzS2V5cyhrZXlzLCBkb25lKSB7XG4gICAgdmFyIHN0YXRlID0gdGhpcyxcbiAgICAgICAgbmV4dEtleSA9IFN0cmluZyhrZXlzKS5jaGFyQXQoMCk7XG5cbiAgICBpZihuZXh0S2V5ID09PSAnJyl7XG4gICAgICAgIHJldHVybiBkb25lKG51bGwsIHRoaXMuY3VycmVudENvbnRleHQuYWN0aXZlRWxlbWVudCk7XG4gICAgfVxuXG4gICAgX3ByZXNzS2V5LmNhbGwoc3RhdGUsIG5leHRLZXksIGZ1bmN0aW9uKCkge1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBfcHJlc3NLZXlzLmNhbGwoc3RhdGUsIFN0cmluZyhrZXlzKS5zbGljZSgxKSwgZG9uZSk7XG4gICAgICAgIH0sIDUwKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZmluZFVpKGN1cnJlbnRDb250ZXgsIHNlbGVjdG9ycykge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChjdXJyZW50Q29udGV4LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3JzKSlcbiAgICAgICAgLnNvcnQoZnVuY3Rpb24oYSwgYil7XG4gICAgICAgICAgICByZXR1cm4gIWEuY29udGFpbnMoYikgPyAtMSA6IDA7XG4gICAgICAgIH0pOyAvLyBkZWVwZXIgZWxlbWVudHMgdGFrZSBwcmVjZWRlbmNlLlxufVxuXG5mdW5jdGlvbiBfbmF2aWdhdGUobG9jYXRpb24sIHByZXZpb3VzRWxlbWVudCwgZG9uZSkge1xuICAgIHZhciBjYWxsYmFja1RpbWVyO1xuXG4gICAgZnVuY3Rpb24gaGFuZGxld2luZG93U2NvcGVFcnJvcihlcnJvcikge1xuICAgICAgICBjbGVhclRpbWVvdXQoY2FsbGJhY2tUaW1lcik7XG5cbiAgICAgICAgZG9uZShlcnJvcik7XG4gICAgICAgIHdpbmRvd1Njb3BlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgaGFuZGxld2luZG93U2NvcGVFcnJvcik7XG4gICAgfVxuXG4gICAgd2luZG93U2NvcGUuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBoYW5kbGV3aW5kb3dTY29wZUVycm9yKTtcbiAgICB3aW5kb3dTY29wZS5sb2NhdGlvbiA9IGxvY2F0aW9uO1xuXG4gICAgY2FsbGJhY2tUaW1lciA9IHNldFRpbWVvdXQoZG9uZSwgMTUwKTtcbn1cblxuZnVuY3Rpb24gX2dldExvY2F0aW9uKGRvbmUpIHtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICBkb25lKG51bGwsIHdpbmRvd1Njb3BlLmxvY2F0aW9uKTtcbiAgICB9LCA1MDApO1xufVxuXG5mdW5jdGlvbiBtYXRjaEVsZW1lbnRWYWx1ZShlbGVtZW50LCB2YWx1ZSkge1xuICAgIHJldHVybiAoXG4gICAgICAgICAgICBlbGVtZW50LnRleHRDb250ZW50LnRvTG93ZXJDYXNlKCkgPT09IHZhbHVlLnRvTG93ZXJDYXNlKCkgfHxcbiAgICAgICAgICAgIChlbGVtZW50LnRpdGxlICYmIGVsZW1lbnQudGl0bGUudG9Mb3dlckNhc2UoKSA9PT0gdmFsdWUudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgKTtcbn1cblxuZnVuY3Rpb24gZmluZE1hdGNoaW5nRWxlbWVudHModmFsdWUsIHR5cGUsIGVsZW1lbnRzTGlzdCkge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChlbGVtZW50c0xpc3QpXG4gICAgICAgIC5maWx0ZXIoZnVuY3Rpb24oZWxlbWVudCkge1xuICAgICAgICAgICAgcmV0dXJuIG1hdGNoRWxlbWVudFZhbHVlKGVsZW1lbnQsIHZhbHVlKTtcbiAgICAgICAgfSk7XG59XG5cbmZ1bmN0aW9uIGdldEVsZW1lbnRUZXh0V2VpZ2h0KGVsZW1lbnQpIHtcbiAgICB2YXIgaW5kZXggPSB0ZXh0V2VpZ2h0aW5nLmluZGV4T2YoZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCkpO1xuICAgIHJldHVybiB0ZXh0V2VpZ2h0aW5nLmxlbmd0aCAtIChpbmRleCA8IDAgPyBJbmZpbml0eSA6IGluZGV4KTtcbn1cblxuZnVuY3Rpb24gZ2V0RWxlbWVudENsaWNrV2VpZ2h0KGVsZW1lbnQpIHtcbiAgICB2YXIgaW5kZXggPSBjbGlja1dlaWdodGluZy5pbmRleE9mKGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpKTtcbiAgICByZXR1cm4gY2xpY2tXZWlnaHRpbmcubGVuZ3RoIC0gKGluZGV4IDwgMCA/IEluZmluaXR5IDogaW5kZXgpO1xufVxuXG5mdW5jdGlvbiBnZXRFbGVtZW50VmFsdWVXZWlnaHQoZWxlbWVudCkge1xuICAgIHZhciBpbmRleCA9IHZhbHVlV2VpZ2h0aW5nLmluZGV4T2YoZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCkpO1xuICAgIHJldHVybiB2YWx1ZVdlaWdodGluZy5sZW5ndGggLSAoaW5kZXggPCAwID8gSW5maW5pdHkgOiBpbmRleCk7XG59XG5cbmZ1bmN0aW9uIF9maW5kQWxsVWkodmFsdWUsIHR5cGUsIGRvbmUpe1xuICAgIGlmKCF0eXBlKXtcbiAgICAgICAgdHlwZSA9ICdhbGwnO1xuICAgIH1cblxuICAgIHZhciBlbGVtZW50VHlwZXMgPSB0eXBlc1t0eXBlXTtcblxuXG4gICAgaWYoIWVsZW1lbnRUeXBlcykge1xuICAgICAgICByZXR1cm4gZG9uZShuZXcgRXJyb3IodHlwZSArICcgaXMgbm90IGEgdmFsaWQgdWkgdHlwZScpKTtcbiAgICB9XG5cbiAgICB2YXIgZWxlbWVudHMgPSBmaW5kVWkodGhpcy5jdXJyZW50Q29udGV4dCwgZWxlbWVudFR5cGVzKTtcblxuICAgIGlmKCFlbGVtZW50cy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGRvbmUobmV3IEVycm9yKG5vRWxlbWVudE9mVHlwZSArIHR5cGUpKTtcbiAgICB9XG5cbiAgICB2YXIgcmVzdWx0cyA9IGZpbmRNYXRjaGluZ0VsZW1lbnRzKHZhbHVlLCB0eXBlLCBlbGVtZW50cylcbiAgICAgICAgLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGdldEVsZW1lbnRUZXh0V2VpZ2h0KGEpIDwgZ2V0RWxlbWVudFRleHRXZWlnaHQoYik7XG4gICAgICAgIH0pO1xuXG4gICAgZG9uZShudWxsLCByZXN1bHRzKTtcbn1cblxuZnVuY3Rpb24gX2ZpbmRVaSh2YWx1ZSwgdHlwZSwgcmV0dXJuQXJyYXksIGRvbmUpIHtcbiAgICBpZighZG9uZSkge1xuICAgICAgICBkb25lID0gcmV0dXJuQXJyYXk7XG4gICAgICAgIHJldHVybkFycmF5ID0gZmFsc2U7XG4gICAgfVxuXG4gICAgX2ZpbmRBbGxVaS5jYWxsKHRoaXMsIHZhbHVlLCB0eXBlLCBmdW5jdGlvbihlcnJvciwgZWxlbWVudHMpe1xuICAgICAgICBpZihlcnJvcil7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShlcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmVzdWx0cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGVsZW1lbnRzKVxuICAgICAgICAgICAgLmZpbHRlcihmdW5jdGlvbihlbGVtZW50KXtcbiAgICAgICAgICAgICAgICByZXR1cm4gIXByZWRhdG9yKGVsZW1lbnQpLmhpZGRlbjtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIGlmKCFyZXN1bHRzLmxlbmd0aCl7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShuZXcgRXJyb3IoJ1wiJyArIHZhbHVlICsgJ1wiIHdhcyBmb3VuZCBidXQgbm90IHZpc2libGUgb24gc2NyZWVuJykpO1xuICAgICAgICB9XG5cbiAgICAgICAgZG9uZShudWxsLCByZXR1cm5BcnJheSA/IHJlc3VsdHMgOiByZXN1bHRzLnNoaWZ0KCkpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBfc2V0VmFsdWUodmFsdWUsIHR5cGUsIHRleHQsIGRvbmUpIHtcbiAgICBfZm9jdXMuY2FsbCh0aGlzLCB2YWx1ZSwgdHlwZSwgZnVuY3Rpb24oZXJyb3IsIGVsZW1lbnQpIHtcbiAgICAgICAgaWYoZXJyb3Ipe1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUoZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgZWxlbWVudC52YWx1ZSA9IHRleHQ7XG5cbiAgICAgICAgZG9uZShudWxsLCBlbGVtZW50KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gX3dhaXQodGltZSwgZG9uZSkge1xuICAgIHNldFRpbWVvdXQoZG9uZSwgdGltZSB8fCAwKTtcbn1cblxuZnVuY3Rpb24gZmluZENsaWNrYWJsZShjdXJyZW50Q29udGV4dCwgZWxlbWVudHMpe1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBlbGVtZW50cy5sZW5ndGg7IGkrKyl7XG4gICAgICAgIHZhciBlbGVtZW50ID0gZWxlbWVudHNbaV07XG4gICAgICAgICAgICByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcbiAgICAgICAgICAgIGNsaWNrRWxlbWVudCA9IGN1cnJlbnRDb250ZXh0LmVsZW1lbnRGcm9tUG9pbnQocmVjdC5sZWZ0ICsgcmVjdC53aWR0aCAvIDIsIHJlY3QudG9wICsgcmVjdC5oZWlnaHQgLyAyKSxcbiAgICAgICAgICAgIGNsaWNrRWxlbWVudEluRWxlbWVudCA9IGVsZW1lbnQuY29udGFpbnMoY2xpY2tFbGVtZW50KSxcbiAgICAgICAgICAgIGVsZW1lbnRJbkNsaWNrRWxlbWVudCA9IGNsaWNrRWxlbWVudC5jb250YWlucyhlbGVtZW50KTtcblxuICAgICAgICBpZihjbGlja0VsZW1lbnRJbkVsZW1lbnQgfHwgZWxlbWVudEluQ2xpY2tFbGVtZW50IHx8IGNsaWNrRWxlbWVudCA9PT0gZWxlbWVudCl7XG4gICAgICAgICAgICByZXR1cm4gY2xpY2tFbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBleGVjdXRlQ2xpY2sodmFsdWUsIHR5cGUsIGRvbmUpIHtcbiAgICB2YXIgc3RhdGUgPSB0aGlzO1xuICAgIF9maW5kVWkuY2FsbChzdGF0ZSwgdmFsdWUsICdhbGwnLCB0cnVlLCBmdW5jdGlvbihlcnJvciwgZWxlbWVudHMpIHtcbiAgICAgICAgaWYoZXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBkb25lKGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjbGlja2FibGVFbGVtZW50cyA9IGVsZW1lbnRzXG4gICAgICAgICAgICAuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGdldEVsZW1lbnRDbGlja1dlaWdodChhKSA8IGdldEVsZW1lbnRDbGlja1dlaWdodChiKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBlbGVtZW50ID0gZmluZENsaWNrYWJsZShzdGF0ZS5jdXJyZW50Q29udGV4dCwgZWxlbWVudHMpO1xuXG4gICAgICAgIGlmKCFlbGVtZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShuZXcgRXJyb3IoJ2NvdWxkIG5vdCBmaW5kIGNsaWNrYWJsZSBlbGVtZW50IG1hdGNoaW5nIFwiJyArIHZhbHVlICsgJ1wiJykpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU1ZHIHBhdGhzXG4gICAgICAgIHdoaWxlKCFlbGVtZW50LmNsaWNrKXtcbiAgICAgICAgICAgIGVsZW1lbnQgPSBlbGVtZW50LnBhcmVudE5vZGU7XG4gICAgICAgIH1cblxuICAgICAgICBlbGVtZW50LmNsaWNrKCk7XG5cbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICAgICAgZG9uZShudWxsLCBlbGVtZW50KTtcbiAgICAgICAgfSwgY2xpY2tEZWxheSlcblxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBfZm9jdXModmFsdWUsIHR5cGUsIGRvbmUpIHtcbiAgIF9maW5kVWkuY2FsbCh0aGlzLCB2YWx1ZSwgdHlwZSwgdHJ1ZSwgZnVuY3Rpb24oZXJyb3IsIGVsZW1lbnRzKXtcbiAgICAgICAgaWYoZXJyb3Ipe1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUoZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdCA9IGVsZW1lbnRzXG4gICAgICAgICAgICAuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGdldEVsZW1lbnRWYWx1ZVdlaWdodChhKSA8IGdldEVsZW1lbnRWYWx1ZVdlaWdodChiKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuc2hpZnQoKTtcblxuICAgICAgICByZXN1bHQuZm9jdXMoKTtcblxuICAgICAgICBkb25lKG51bGwsIHJlc3VsdCk7XG4gICB9KTtcbn1cblxuZnVuY3Rpb24gX2NoYW5nZVZhbHVlKHZhbHVlLCB0eXBlLCB0ZXh0LCBkb25lKSB7XG4gICAgdmFyIHN0YXRlID0gdGhpcztcblxuICAgIF9mb2N1cy5jYWxsKHN0YXRlLCB2YWx1ZSwgdHlwZSwgZnVuY3Rpb24oZXJyb3IsIGVsZW1lbnQpIHtcbiAgICAgICAgaWYoZXJyb3Ipe1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUoZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgX3ByZXNzS2V5cy5jYWxsKHN0YXRlLCB0ZXh0LCBmdW5jdGlvbihlcnJvcil7XG4gICAgICAgICAgICBpZihlcnJvcil7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRvbmUoZXJyb3IpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbGVtZW50LmJsdXIoKTtcblxuICAgICAgICAgICAgdmFyIGV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0hUTUxFdmVudHMnKTtcblxuICAgICAgICAgICAgZXZlbnQuaW5pdEV2ZW50KCdjaGFuZ2UnLCBmYWxzZSwgdHJ1ZSk7XG4gICAgICAgICAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXG4gICAgICAgICAgICBkb25lKG51bGwsIGVsZW1lbnQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gX2dldFZhbHVlKHZhbHVlLCB0eXBlLCBkb25lKSB7XG4gICAgX2ZvY3VzLmNhbGwodGhpcywgdmFsdWUsIHR5cGUsIGZ1bmN0aW9uKGVycm9yLCBlbGVtZW50KSB7XG4gICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgIHJldHVybiBkb25lKGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRvbmUobnVsbCwgJ3ZhbHVlJyBpbiBlbGVtZW50ID8gZWxlbWVudC52YWx1ZSA6IGVsZW1lbnQudGV4dENvbnRlbnQpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBfYmx1cihkb25lKSB7XG4gICAgdmFyIGVsZW1lbnQgPSB0aGlzLmN1cnJlbnRDb250ZXh0LmFjdGl2ZUVsZW1lbnQ7XG4gICAgZWxlbWVudC5ibHVyKCk7XG5cbiAgICBkb25lKG51bGwsIGVsZW1lbnQpO1xufVxuXG5mdW5jdGlvbiBfc2Nyb2xsVG8odmFsdWUsIHR5cGUsIGRvbmUpe1xuICAgIF9maW5kQWxsVWkuY2FsbCh0aGlzLCB2YWx1ZSwgdHlwZSwgZnVuY3Rpb24oZXJyb3IsIGVsZW1lbnRzKSB7XG4gICAgICAgIGlmKGVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShlcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdGFyZ2V0RWxlbWVudCA9IGVsZW1lbnRzLnNoaWZ0KCk7XG5cbiAgICAgICAgc2Nyb2xsSW50b1ZpZXcodGFyZ2V0RWxlbWVudCwgeyB0aW1lOiA1MCB9LCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgZG9uZShudWxsLCB0YXJnZXRFbGVtZW50KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHJ1blRhc2tzKHN0YXRlLCB0YXNrcywgY2FsbGJhY2spIHtcbiAgICBpZih0YXNrcy5sZW5ndGgpIHtcbiAgICAgICAgdGFza3Muc2hpZnQoKShmdW5jdGlvbihlcnJvciwgcmVzdWx0KSB7XG4gICAgICAgICAgICBpZihlcnJvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnJvcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHN0YXRlLmxhc3RSZXN1bHQgPSByZXN1bHQ7XG5cbiAgICAgICAgICAgICAgICBpZih0YXNrcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBydW5UYXNrcyhzdGF0ZSwgdGFza3MsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJpdmVVaShjdXJyZW50Q29udGV4dCl7XG4gICAgdmFyIHRhc2tzID0gW10sXG4gICAgICAgIGRyaXZlckZ1bmN0aW9ucyA9IHt9LFxuICAgICAgICBzdGF0ZSA9IHtcbiAgICAgICAgICAgIGN1cnJlbnRDb250ZXh0OiBjdXJyZW50Q29udGV4dCB8fCBkb2N1bWVudFNjb3BlXG4gICAgICAgIH07XG5cbiAgICBmdW5jdGlvbiBhZGRUYXNrKHRhc2spe1xuICAgICAgICB0YXNrcy5wdXNoKHRhc2spO1xuXG4gICAgICAgIHJldHVybiBkcml2ZXJGdW5jdGlvbnM7XG4gICAgfVxuXG4gICAgZHJpdmVyRnVuY3Rpb25zID0ge1xuICAgICAgICBuYXZpZ2F0ZTogZnVuY3Rpb24obG9jYXRpb24pe1xuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soX25hdmlnYXRlLmJpbmQoc3RhdGUsIGxvY2F0aW9uKSk7XG4gICAgICAgIH0sXG4gICAgICAgIGZpbmRVaTogZnVuY3Rpb24odmFsdWUsIHR5cGUpe1xuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soX2ZpbmRVaS5iaW5kKHN0YXRlLCB2YWx1ZSwgdHlwZSkpO1xuICAgICAgICB9LFxuICAgICAgICBnZXRMb2NhdGlvbjogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gYWRkVGFzayhfZ2V0TG9jYXRpb24uYmluZChzdGF0ZSkpO1xuICAgICAgICB9LFxuICAgICAgICBmb2N1czogZnVuY3Rpb24odmFsdWUsIHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKF9mb2N1cy5iaW5kKHN0YXRlLCB2YWx1ZSwgdHlwZSkpO1xuICAgICAgICB9LFxuICAgICAgICBibHVyOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKF9ibHVyLmJpbmQoc3RhdGUpKTtcbiAgICAgICAgfSxcbiAgICAgICAgY2xpY2s6IGZ1bmN0aW9uKHZhbHVlLCB0eXBlKXtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKGV4ZWN1dGVDbGljay5iaW5kKHN0YXRlLCB2YWx1ZSwgdHlwZSkpO1xuICAgICAgICB9LFxuICAgICAgICBwcmVzc0tleTogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKF9wcmVzc0tleS5iaW5kKHN0YXRlLCB2YWx1ZSkpO1xuICAgICAgICB9LFxuICAgICAgICBwcmVzc0tleXM6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gYWRkVGFzayhfcHJlc3NLZXlzLmJpbmQoc3RhdGUsIHZhbHVlKSk7XG4gICAgICAgIH0sXG4gICAgICAgIGNoYW5nZVZhbHVlOiBmdW5jdGlvbih2YWx1ZSwgdHlwZSwgdGV4dCkge1xuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soX2NoYW5nZVZhbHVlLmJpbmQoc3RhdGUsIHZhbHVlLCB0eXBlLCB0ZXh0KSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNldFZhbHVlOiBmdW5jdGlvbih2YWx1ZSwgdHlwZSwgdGV4dCkge1xuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soX3NldFZhbHVlLmJpbmQoc3RhdGUsIHZhbHVlLCB0eXBlLCB0ZXh0KSk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldFZhbHVlOiBmdW5jdGlvbih2YWx1ZSwgdHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soX2dldFZhbHVlLmJpbmQoc3RhdGUsIHZhbHVlLCB0eXBlKSk7XG4gICAgICAgIH0sXG4gICAgICAgIHdhaXQ6IGZ1bmN0aW9uKHRpbWUpIHtcbiAgICAgICAgICAgIGlmKCFhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGltZSA9IHJ1bkRlbGF5O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gYWRkVGFzayhfd2FpdC5iaW5kKHN0YXRlLCB0aW1lKSk7XG4gICAgICAgIH0sXG4gICAgICAgIGRvOiBmdW5jdGlvbihkcml2ZXIpe1xuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soZHJpdmVyLmdvKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW46IGZ1bmN0aW9uKHZhbHVlLCB0eXBlLCBhZGRTdWJUYXNrcyl7XG4gICAgICAgICAgICByZXR1cm4gYWRkVGFzayhmdW5jdGlvbihkb25lKXtcbiAgICAgICAgICAgICAgICBfZmluZFVpLmNhbGwoc3RhdGUsIHZhbHVlLCB0eXBlLCBmdW5jdGlvbihlcnJvciwgZWxlbWVudCl7XG4gICAgICAgICAgICAgICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBkb25lKGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHZhciBuZXdEcml2ZXIgPSBkcml2ZVVpKGVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGFkZFN1YlRhc2tzKG5ld0RyaXZlcik7XG5cbiAgICAgICAgICAgICAgICAgICAgbmV3RHJpdmVyLmdvKGRvbmUpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIGNoZWNrOiBmdW5jdGlvbih0YXNrKXtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKGZ1bmN0aW9uKGNhbGxiYWNrKXtcbiAgICAgICAgICAgICAgICB0YXNrKHN0YXRlLmxhc3RSZXN1bHQsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBzY3JvbGxUbzogZnVuY3Rpb24odmFsdWUsIHR5cGUpe1xuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soX3Njcm9sbFRvLmJpbmQoc3RhdGUsIHZhbHVlLCB0eXBlKSk7XG4gICAgICAgIH0sXG4gICAgICAgIGdvOiBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICAgICAgaWYoIWluaXRpYWxpc2VkKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cobmV3IEVycm9yKCdpbml0IG11c3QgYmVjYWxsZWQgYmVmb3JlIGNhbGxpbmcgZ28nKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKHRhc2tzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRhc2tzLnVuc2hpZnQoX3dhaXQuYmluZChzdGF0ZSwgcnVuRGVsYXkpKTtcbiAgICAgICAgICAgICAgICBydW5UYXNrcyhzdGF0ZSwgdGFza3MsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobmV3IEVycm9yKCdObyB0YXNrcyBkZWZpbmVkJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBkcml2ZXJGdW5jdGlvbnM7XG59XG5cbmRyaXZlVWkuaW5pdCA9IGZ1bmN0aW9uKHNldHRpbmdzKSB7XG4gICAgZG9jdW1lbnRTY29wZSA9IHNldHRpbmdzLmRvY3VtZW50IHx8IGRvY3VtZW50O1xuICAgIHdpbmRvd1Njb3BlID0gc2V0dGluZ3Mud2luZG93IHx8IHdpbmRvdztcbiAgICBydW5EZWxheSA9IHNldHRpbmdzLnJ1bkRlbGF5IHx8IDA7XG4gICAgY2xpY2tEZWxheSA9IHNldHRpbmdzLmNsaWNrRGVsYXkgfHwgMTAwO1xuXG4gICAgaW5pdGlhbGlzZWQgPSB0cnVlO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBkcml2ZVVpO1xuIiwiLy9Db3B5cmlnaHQgKEMpIDIwMTIgS29yeSBOdW5uXHJcblxyXG4vL1Blcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XHJcblxyXG4vL1RoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxyXG5cclxuLy9USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cclxuXHJcbi8qXHJcblxyXG4gICAgVGhpcyBjb2RlIGlzIG5vdCBmb3JtYXR0ZWQgZm9yIHJlYWRhYmlsaXR5LCBidXQgcmF0aGVyIHJ1bi1zcGVlZCBhbmQgdG8gYXNzaXN0IGNvbXBpbGVycy5cclxuXHJcbiAgICBIb3dldmVyLCB0aGUgY29kZSdzIGludGVudGlvbiBzaG91bGQgYmUgdHJhbnNwYXJlbnQuXHJcblxyXG4gICAgKioqIElFIFNVUFBPUlQgKioqXHJcblxyXG4gICAgSWYgeW91IHJlcXVpcmUgdGhpcyBsaWJyYXJ5IHRvIHdvcmsgaW4gSUU3LCBhZGQgdGhlIGZvbGxvd2luZyBhZnRlciBkZWNsYXJpbmcgY3JlbC5cclxuXHJcbiAgICB2YXIgdGVzdERpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxyXG4gICAgICAgIHRlc3RMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xhYmVsJyk7XHJcblxyXG4gICAgdGVzdERpdi5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgJ2EnKTtcclxuICAgIHRlc3REaXZbJ2NsYXNzTmFtZSddICE9PSAnYScgPyBjcmVsLmF0dHJNYXBbJ2NsYXNzJ10gPSAnY2xhc3NOYW1lJzp1bmRlZmluZWQ7XHJcbiAgICB0ZXN0RGl2LnNldEF0dHJpYnV0ZSgnbmFtZScsJ2EnKTtcclxuICAgIHRlc3REaXZbJ25hbWUnXSAhPT0gJ2EnID8gY3JlbC5hdHRyTWFwWyduYW1lJ10gPSBmdW5jdGlvbihlbGVtZW50LCB2YWx1ZSl7XHJcbiAgICAgICAgZWxlbWVudC5pZCA9IHZhbHVlO1xyXG4gICAgfTp1bmRlZmluZWQ7XHJcblxyXG5cclxuICAgIHRlc3RMYWJlbC5zZXRBdHRyaWJ1dGUoJ2ZvcicsICdhJyk7XHJcbiAgICB0ZXN0TGFiZWxbJ2h0bWxGb3InXSAhPT0gJ2EnID8gY3JlbC5hdHRyTWFwWydmb3InXSA9ICdodG1sRm9yJzp1bmRlZmluZWQ7XHJcblxyXG5cclxuXHJcbiovXHJcblxyXG4oZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcclxuICAgIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICAgICAgZGVmaW5lKGZhY3RvcnkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICByb290LmNyZWwgPSBmYWN0b3J5KCk7XHJcbiAgICB9XHJcbn0odGhpcywgZnVuY3Rpb24gKCkge1xyXG4gICAgdmFyIGZuID0gJ2Z1bmN0aW9uJyxcclxuICAgICAgICBvYmogPSAnb2JqZWN0JyxcclxuICAgICAgICBub2RlVHlwZSA9ICdub2RlVHlwZScsXHJcbiAgICAgICAgdGV4dENvbnRlbnQgPSAndGV4dENvbnRlbnQnLFxyXG4gICAgICAgIHNldEF0dHJpYnV0ZSA9ICdzZXRBdHRyaWJ1dGUnLFxyXG4gICAgICAgIGF0dHJNYXBTdHJpbmcgPSAnYXR0ck1hcCcsXHJcbiAgICAgICAgaXNOb2RlU3RyaW5nID0gJ2lzTm9kZScsXHJcbiAgICAgICAgaXNFbGVtZW50U3RyaW5nID0gJ2lzRWxlbWVudCcsXHJcbiAgICAgICAgZCA9IHR5cGVvZiBkb2N1bWVudCA9PT0gb2JqID8gZG9jdW1lbnQgOiB7fSxcclxuICAgICAgICBpc1R5cGUgPSBmdW5jdGlvbihhLCB0eXBlKXtcclxuICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiBhID09PSB0eXBlO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaXNOb2RlID0gdHlwZW9mIE5vZGUgPT09IGZuID8gZnVuY3Rpb24gKG9iamVjdCkge1xyXG4gICAgICAgICAgICByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgTm9kZTtcclxuICAgICAgICB9IDpcclxuICAgICAgICAvLyBpbiBJRSA8PSA4IE5vZGUgaXMgYW4gb2JqZWN0LCBvYnZpb3VzbHkuLlxyXG4gICAgICAgIGZ1bmN0aW9uKG9iamVjdCl7XHJcbiAgICAgICAgICAgIHJldHVybiBvYmplY3QgJiZcclxuICAgICAgICAgICAgICAgIGlzVHlwZShvYmplY3QsIG9iaikgJiZcclxuICAgICAgICAgICAgICAgIChub2RlVHlwZSBpbiBvYmplY3QpICYmXHJcbiAgICAgICAgICAgICAgICBpc1R5cGUob2JqZWN0Lm93bmVyRG9jdW1lbnQsb2JqKTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGlzRWxlbWVudCA9IGZ1bmN0aW9uIChvYmplY3QpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNyZWxbaXNOb2RlU3RyaW5nXShvYmplY3QpICYmIG9iamVjdFtub2RlVHlwZV0gPT09IDE7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBpc0FycmF5ID0gZnVuY3Rpb24oYSl7XHJcbiAgICAgICAgICAgIHJldHVybiBhIGluc3RhbmNlb2YgQXJyYXk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBhcHBlbmRDaGlsZCA9IGZ1bmN0aW9uKGVsZW1lbnQsIGNoaWxkKSB7XHJcbiAgICAgICAgICAgIGlmIChpc0FycmF5KGNoaWxkKSkge1xyXG4gICAgICAgICAgICAgICAgY2hpbGQubWFwKGZ1bmN0aW9uKHN1YkNoaWxkKXtcclxuICAgICAgICAgICAgICAgICAgICBhcHBlbmRDaGlsZChlbGVtZW50LCBzdWJDaGlsZCk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZighY3JlbFtpc05vZGVTdHJpbmddKGNoaWxkKSl7XHJcbiAgICAgICAgICAgICAgICBjaGlsZCA9IGQuY3JlYXRlVGV4dE5vZGUoY2hpbGQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY2hpbGQpO1xyXG4gICAgICAgIH07XHJcblxyXG5cclxuICAgIGZ1bmN0aW9uIGNyZWwoKXtcclxuICAgICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cywgLy9Ob3RlOiBhc3NpZ25lZCB0byBhIHZhcmlhYmxlIHRvIGFzc2lzdCBjb21waWxlcnMuIFNhdmVzIGFib3V0IDQwIGJ5dGVzIGluIGNsb3N1cmUgY29tcGlsZXIuIEhhcyBuZWdsaWdhYmxlIGVmZmVjdCBvbiBwZXJmb3JtYW5jZS5cclxuICAgICAgICAgICAgZWxlbWVudCA9IGFyZ3NbMF0sXHJcbiAgICAgICAgICAgIGNoaWxkLFxyXG4gICAgICAgICAgICBzZXR0aW5ncyA9IGFyZ3NbMV0sXHJcbiAgICAgICAgICAgIGNoaWxkSW5kZXggPSAyLFxyXG4gICAgICAgICAgICBhcmd1bWVudHNMZW5ndGggPSBhcmdzLmxlbmd0aCxcclxuICAgICAgICAgICAgYXR0cmlidXRlTWFwID0gY3JlbFthdHRyTWFwU3RyaW5nXTtcclxuXHJcbiAgICAgICAgZWxlbWVudCA9IGNyZWxbaXNFbGVtZW50U3RyaW5nXShlbGVtZW50KSA/IGVsZW1lbnQgOiBkLmNyZWF0ZUVsZW1lbnQoZWxlbWVudCk7XHJcbiAgICAgICAgLy8gc2hvcnRjdXRcclxuICAgICAgICBpZihhcmd1bWVudHNMZW5ndGggPT09IDEpe1xyXG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmKCFpc1R5cGUoc2V0dGluZ3Msb2JqKSB8fCBjcmVsW2lzTm9kZVN0cmluZ10oc2V0dGluZ3MpIHx8IGlzQXJyYXkoc2V0dGluZ3MpKSB7XHJcbiAgICAgICAgICAgIC0tY2hpbGRJbmRleDtcclxuICAgICAgICAgICAgc2V0dGluZ3MgPSBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gc2hvcnRjdXQgaWYgdGhlcmUgaXMgb25seSBvbmUgY2hpbGQgdGhhdCBpcyBhIHN0cmluZ1xyXG4gICAgICAgIGlmKChhcmd1bWVudHNMZW5ndGggLSBjaGlsZEluZGV4KSA9PT0gMSAmJiBpc1R5cGUoYXJnc1tjaGlsZEluZGV4XSwgJ3N0cmluZycpICYmIGVsZW1lbnRbdGV4dENvbnRlbnRdICE9PSB1bmRlZmluZWQpe1xyXG4gICAgICAgICAgICBlbGVtZW50W3RleHRDb250ZW50XSA9IGFyZ3NbY2hpbGRJbmRleF07XHJcbiAgICAgICAgfWVsc2V7XHJcbiAgICAgICAgICAgIGZvcig7IGNoaWxkSW5kZXggPCBhcmd1bWVudHNMZW5ndGg7ICsrY2hpbGRJbmRleCl7XHJcbiAgICAgICAgICAgICAgICBjaGlsZCA9IGFyZ3NbY2hpbGRJbmRleF07XHJcblxyXG4gICAgICAgICAgICAgICAgaWYoY2hpbGQgPT0gbnVsbCl7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGlzQXJyYXkoY2hpbGQpKSB7XHJcbiAgICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaSA8IGNoaWxkLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYXBwZW5kQ2hpbGQoZWxlbWVudCwgY2hpbGRbaV0pO1xyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICBhcHBlbmRDaGlsZChlbGVtZW50LCBjaGlsZCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvcih2YXIga2V5IGluIHNldHRpbmdzKXtcclxuICAgICAgICAgICAgaWYoIWF0dHJpYnV0ZU1hcFtrZXldKXtcclxuICAgICAgICAgICAgICAgIGlmKGlzVHlwZShzZXR0aW5nc1trZXldLGZuKSl7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFtrZXldID0gc2V0dGluZ3Nba2V5XTtcclxuICAgICAgICAgICAgICAgIH1lbHNle1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRbc2V0QXR0cmlidXRlXShrZXksIHNldHRpbmdzW2tleV0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9ZWxzZXtcclxuICAgICAgICAgICAgICAgIHZhciBhdHRyID0gYXR0cmlidXRlTWFwW2tleV07XHJcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YgYXR0ciA9PT0gZm4pe1xyXG4gICAgICAgICAgICAgICAgICAgIGF0dHIoZWxlbWVudCwgc2V0dGluZ3Nba2V5XSk7XHJcbiAgICAgICAgICAgICAgICB9ZWxzZXtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50W3NldEF0dHJpYnV0ZV0oYXR0ciwgc2V0dGluZ3Nba2V5XSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFVzZWQgZm9yIG1hcHBpbmcgb25lIGtpbmQgb2YgYXR0cmlidXRlIHRvIHRoZSBzdXBwb3J0ZWQgdmVyc2lvbiBvZiB0aGF0IGluIGJhZCBicm93c2Vycy5cclxuICAgIGNyZWxbYXR0ck1hcFN0cmluZ10gPSB7fTtcclxuXHJcbiAgICBjcmVsW2lzRWxlbWVudFN0cmluZ10gPSBpc0VsZW1lbnQ7XHJcblxyXG4gICAgY3JlbFtpc05vZGVTdHJpbmddID0gaXNOb2RlO1xyXG5cclxuICAgIGlmKHR5cGVvZiBQcm94eSAhPT0gJ3VuZGVmaW5lZCcpe1xyXG4gICAgICAgIGNyZWwucHJveHkgPSBuZXcgUHJveHkoY3JlbCwge1xyXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uKHRhcmdldCwga2V5KXtcclxuICAgICAgICAgICAgICAgICEoa2V5IGluIGNyZWwpICYmIChjcmVsW2tleV0gPSBjcmVsLmJpbmQobnVsbCwga2V5KSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY3JlbFtrZXldO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGNyZWw7XHJcbn0pKTtcclxuIiwiZnVuY3Rpb24gZmluZENoaWxkc0V4cG9zZWRCb3goY2hpbGQpe1xuICAgIHZhciBvcmlnaW5hbEJvdW5kcyA9IGNoaWxkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLFxuICAgICAgICBwYXJlbnQgPSBjaGlsZC5wYXJlbnROb2RlLFxuICAgICAgICBwYXJlbnRPdmVyZmxvdyxcbiAgICAgICAgcGFyZW50Qm91bmRzLFxuICAgICAgICBib3VuZHM7XG5cbiAgICAvLyBDb252ZXJ0IGJvdW5kcyBvYmplY3QgdG8gcG9qby5cbiAgICBib3VuZHMgPSB7XG4gICAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbEJvdW5kcyxcbiAgICAgICAgaGVpZ2h0OiBvcmlnaW5hbEJvdW5kcy5oZWlnaHQsXG4gICAgICAgIHdpZHRoOiBvcmlnaW5hbEJvdW5kcy53aWR0aCxcbiAgICAgICAgbGVmdDogb3JpZ2luYWxCb3VuZHMubGVmdCxcbiAgICAgICAgdG9wOiBvcmlnaW5hbEJvdW5kcy50b3AsXG4gICAgICAgIHJpZ2h0OiBvcmlnaW5hbEJvdW5kcy5yaWdodCxcbiAgICAgICAgYm90dG9tOiBvcmlnaW5hbEJvdW5kcy5ib3R0b21cbiAgICB9O1xuXG4gICAgd2hpbGUocGFyZW50KXtcbiAgICAgICAgaWYocGFyZW50ID09PSBkb2N1bWVudCl7XG4gICAgICAgICAgICBwYXJlbnRCb3VuZHMgPSB7XG4gICAgICAgICAgICAgICAgdG9wOiAwLFxuICAgICAgICAgICAgICAgIGxlZnQ6IDAsXG4gICAgICAgICAgICAgICAgYm90dG9tOiB3aW5kb3cuaW5uZXJIZWlnaHQsXG4gICAgICAgICAgICAgICAgcmlnaHQ6IHdpbmRvdy5pbm5lcldpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogd2luZG93LmlubmVySGVpZ2h0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aW5kb3cuaW5uZXJXaWR0aFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICB2YXIgcGFyZW50T3ZlcmZsb3cgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShwYXJlbnQpLm92ZXJmbG93O1xuICAgICAgICAgICAgaWYocGFyZW50T3ZlcmZsb3cgPT09ICcnIHx8IHBhcmVudE92ZXJmbG93ID09PSAndmlzaWJsZScpe1xuICAgICAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnROb2RlO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcGFyZW50Qm91bmRzID0gcGFyZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYocGFyZW50Qm91bmRzLnRvcCA+IGJvdW5kcy50b3Ape1xuICAgICAgICAgICAgYm91bmRzLmhlaWdodCA9IGJvdW5kcy5oZWlnaHQgLSAocGFyZW50Qm91bmRzLnRvcCAtIGJvdW5kcy50b3ApO1xuICAgICAgICAgICAgYm91bmRzLnRvcCA9IHBhcmVudEJvdW5kcy50b3A7XG4gICAgICAgIH1cbiAgICAgICAgaWYocGFyZW50Qm91bmRzLmxlZnQgPiBib3VuZHMubGVmdCl7XG4gICAgICAgICAgICBib3VuZHMud2lkdGggPSBib3VuZHMud2lkdGggLSAocGFyZW50Qm91bmRzLmxlZnQgLSBib3VuZHMubGVmdCk7XG4gICAgICAgICAgICBib3VuZHMubGVmdCA9IHBhcmVudEJvdW5kcy5sZWZ0O1xuICAgICAgICB9XG4gICAgICAgIGlmKHBhcmVudEJvdW5kcy5yaWdodCA8IGJvdW5kcy5yaWdodCl7XG4gICAgICAgICAgICBib3VuZHMud2lkdGggPSBib3VuZHMud2lkdGggLSAoYm91bmRzLnJpZ2h0IC0gcGFyZW50Qm91bmRzLnJpZ2h0KTtcbiAgICAgICAgICAgIGJvdW5kcy5yaWdodCA9IHBhcmVudEJvdW5kcy5yaWdodDtcbiAgICAgICAgfVxuICAgICAgICBpZihwYXJlbnRCb3VuZHMuYm90dG9tIDwgYm91bmRzLmJvdHRvbSl7XG4gICAgICAgICAgICBib3VuZHMuaGVpZ2h0ID0gYm91bmRzLmhlaWdodCAtIChib3VuZHMuYm90dG9tIC0gcGFyZW50Qm91bmRzLmJvdHRvbSk7XG4gICAgICAgICAgICBib3VuZHMuYm90dG9tID0gcGFyZW50Qm91bmRzLmJvdHRvbTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGJvdW5kcy53aWR0aCA8PSAwIHx8IGJvdW5kcy5oZWlnaHQgPD0gMCl7XG4gICAgICAgICAgICBib3VuZHMuaGlkZGVuID0gdHJ1ZTtcbiAgICAgICAgICAgIGJvdW5kcy53aWR0aCA9IE1hdGgubWF4KGJvdW5kcy53aWR0aCwgMCk7XG4gICAgICAgICAgICBib3VuZHMuaGVpZ2h0ID0gTWF0aC5tYXgoYm91bmRzLmhlaWdodCwgMCk7XG4gICAgICAgICAgICByZXR1cm4gYm91bmRzO1xuICAgICAgICB9XG5cbiAgICAgICAgcGFyZW50ID0gcGFyZW50LnBhcmVudE5vZGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJvdW5kcztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmaW5kQ2hpbGRzRXhwb3NlZEJveDsiLCJ2YXIgYWJib3R0ID0gcmVxdWlyZSgnYWJib3R0Jyk7XG5cbnZhciBkZWZlciA9IGdsb2JhbC5wcm9jZXNzICYmIGdsb2JhbC5wcm9jZXNzLm5leHRUaWNrIHx8IGdsb2JhbC5zZXRJbW1lZGlhdGUgfHwgZ2xvYmFsLnNldFRpbWVvdXQ7XG5cbmZ1bmN0aW9uIGlzUmlnaHRvKHgpe1xuICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJiAoeC5fX3Jlc29sdmVfXyA9PT0geCB8fCB4LnJlc29sdmUgPT09IHgpO1xufVxuXG5mdW5jdGlvbiBpc1RoZW5hYmxlKHgpe1xuICAgIHJldHVybiB4ICYmIHR5cGVvZiB4LnRoZW4gPT09ICdmdW5jdGlvbicgJiYgIWlzUmlnaHRvKHgpO1xufVxuXG5mdW5jdGlvbiBpc1Jlc29sdmFibGUoeCl7XG4gICAgcmV0dXJuIGlzUmlnaHRvKHgpIHx8IGlzVGhlbmFibGUoeCk7XG59XG5cbmZ1bmN0aW9uIGlzVGFrZSh4KXtcbiAgICByZXR1cm4geCAmJiB0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgJ19fdGFrZV9fJyBpbiB4O1xufVxuXG52YXIgc2xpY2UgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbC5iaW5kKEFycmF5LnByb3RvdHlwZS5zbGljZSk7XG5cbmZ1bmN0aW9uIGdldENhbGxMaW5lKHN0YWNrKXtcbiAgICB2YXIgaW5kZXggPSAwLFxuICAgICAgICBsaW5lcyA9IHN0YWNrLnNwbGl0KCdcXG4nKTtcblxuICAgIHdoaWxlKGxpbmVzWysraW5kZXhdICYmIGxpbmVzW2luZGV4XS5tYXRjaCgvcmlnaHRvXFwvaW5kZXhcXC5qcy8pKXt9XG5cbiAgICB2YXIgbWF0Y2ggPSBsaW5lc1tpbmRleF0gJiYgbGluZXNbaW5kZXhdLm1hdGNoKC9hdCAoLiopLyk7XG5cbiAgICByZXR1cm4gbWF0Y2ggPyBtYXRjaFsxXSA6ICcgLSBObyB0cmFjZSAtICc7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVEZXBlbmRlbmN5KHRhc2ssIGRvbmUpe1xuICAgIGlmKGlzVGhlbmFibGUodGFzaykpe1xuICAgICAgICB0YXNrID0gcmlnaHRvKGFiYm90dCh0YXNrKSk7XG4gICAgfVxuXG4gICAgaWYoaXNSaWdodG8odGFzaykpe1xuICAgICAgICByZXR1cm4gdGFzayhmdW5jdGlvbihlcnJvcil7XG4gICAgICAgICAgICB2YXIgcmVzdWx0cyA9IHNsaWNlKGFyZ3VtZW50cywgMSwgMik7XG5cbiAgICAgICAgICAgIGlmKCFyZXN1bHRzLmxlbmd0aCl7XG4gICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHVuZGVmaW5lZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRvbmUoZXJyb3IsIHJlc3VsdHMpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0YWtlKHRhcmdldFRhc2spe1xuICAgICAgICB2YXIga2V5cyA9IHNsaWNlKGFyZ3VtZW50cywgMSk7XG4gICAgICAgIHJldHVybiB0YXJnZXRUYXNrKGZ1bmN0aW9uKGVycm9yKXtcbiAgICAgICAgICAgIHZhciBhcmdzID0gc2xpY2UoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgIGRvbmUoZXJyb3IsIGtleXMubWFwKGZ1bmN0aW9uKGtleSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFyZ3Nba2V5XTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYoXG4gICAgICAgIHJpZ2h0by5fZGVidWcgJiZcbiAgICAgICAgcmlnaHRvLl93YXJuT25VbnN1cHBvcnRlZCAmJlxuICAgICAgICBBcnJheS5pc0FycmF5KHRhc2spICYmXG4gICAgICAgIGlzUmlnaHRvKHRhc2tbMF0pICYmXG4gICAgICAgICFpc1JpZ2h0byh0YXNrWzFdKVxuICAgICl7XG5cbiAgICAgICAgY29uc29sZS53YXJuKCdcXHUwMDFiWzMzbVBvc3NpYmxlIHVuc3VwcG9ydGVkIHRha2UvaWdub3JlIHN5bnRheCBkZXRlY3RlZDpcXHUwMDFiWzM5bVxcbicgKyBnZXRDYWxsTGluZSh0aGlzLl9zdGFjaykpO1xuICAgIH1cblxuICAgIGlmKGlzVGFrZSh0YXNrKSl7XG4gICAgICAgIHJldHVybiB0YWtlLmFwcGx5KG51bGwsIHRhc2suX190YWtlX18pO1xuICAgIH1cblxuICAgIHJldHVybiBkb25lKG51bGwsIFt0YXNrXSk7XG59XG5cbmZ1bmN0aW9uIHRyYWNlR2V0KGluc3RhbmNlLCByZXN1bHQpe1xuICAgIGlmKHJpZ2h0by5fZGVidWcgJiYgISh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyB8fCB0eXBlb2YgcmVzdWx0ID09PSAnZnVuY3Rpb24nKSl7XG4gICAgICAgIHZhciBsaW5lID0gZ2V0Q2FsbExpbmUoaW5zdGFuY2UuX3N0YWNrKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdSZXN1bHQgb2YgcmlnaHRvIHdhcyBub3QgYW4gaW5zdGFuY2UgYXQ6IFxcbicgKyBsaW5lKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldChmbil7XG4gICAgdmFyIGluc3RhbmNlID0gdGhpcztcbiAgICByZXR1cm4gcmlnaHRvKGZ1bmN0aW9uKHJlc3VsdCwgZm4sIGRvbmUpe1xuICAgICAgICBpZih0eXBlb2YgZm4gPT09ICdzdHJpbmcnIHx8IHR5cGVvZiBmbiA9PT0gJ251bWJlcicpe1xuICAgICAgICAgICAgdHJhY2VHZXQoaW5zdGFuY2UsIHJlc3VsdCk7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShudWxsLCByZXN1bHRbZm5dKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJpZ2h0by5mcm9tKGZuKHJlc3VsdCkpKGRvbmUpO1xuICAgIH0sIHRoaXMsIGZuKTtcbn1cblxudmFyIG5vT3AgPSBmdW5jdGlvbigpe307XG5cbmZ1bmN0aW9uIHByb3h5KGluc3RhbmNlKXtcbiAgICBpbnN0YW5jZS5fID0gbmV3IFByb3h5KGluc3RhbmNlLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24odGFyZ2V0LCBrZXkpe1xuICAgICAgICAgICAgaWYoa2V5ID09PSAnX19yZXNvbHZlX18nKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gaW5zdGFuY2UuXztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYoaW5zdGFuY2Vba2V5XSB8fCBrZXkgaW4gaW5zdGFuY2UgfHwga2V5ID09PSAnaW5zcGVjdCcgfHwgdHlwZW9mIGtleSA9PT0gJ3N5bWJvbCcpe1xuICAgICAgICAgICAgICAgIHJldHVybiBpbnN0YW5jZVtrZXldO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihyaWdodG8uX2RlYnVnICYmIGtleS5jaGFyQXQoMCkgPT09ICdfJyl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGluc3RhbmNlW2tleV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBwcm94eShyaWdodG8uc3luYyhmdW5jdGlvbihyZXN1bHQpe1xuICAgICAgICAgICAgICAgIHRyYWNlR2V0KGluc3RhbmNlLCByZXN1bHQpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRba2V5XTtcbiAgICAgICAgICAgIH0sIGluc3RhbmNlKSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBpbnN0YW5jZS5fX3Jlc29sdmVfXyA9IGluc3RhbmNlLl87XG4gICAgcmV0dXJuIGluc3RhbmNlLl87XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVJdGVyYXRvcihmbil7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciBhcmdzID0gc2xpY2UoYXJndW1lbnRzKSxcbiAgICAgICAgICAgIGNhbGxiYWNrID0gYXJncy5wb3AoKSxcbiAgICAgICAgICAgIGVycm9yZWQsXG4gICAgICAgICAgICBsYXN0VmFsdWU7XG5cbiAgICAgICAgZnVuY3Rpb24gcmVqZWN0KGVycm9yKXtcbiAgICAgICAgICAgIGlmKGVycm9yZWQpe1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVycm9yZWQgPSB0cnVlO1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGdlbmVyYXRvciA9IGZuLmFwcGx5KG51bGwsIGFyZ3MuY29uY2F0KHJlamVjdCkpO1xuXG4gICAgICAgIGZ1bmN0aW9uIHJ1bigpe1xuICAgICAgICAgICAgaWYoZXJyb3JlZCl7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIG5leHQgPSBnZW5lcmF0b3IubmV4dChsYXN0VmFsdWUpO1xuICAgICAgICAgICAgaWYobmV4dC5kb25lKXtcbiAgICAgICAgICAgICAgICBpZihlcnJvcmVkKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCwgbmV4dC52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZihpc1Jlc29sdmFibGUobmV4dC52YWx1ZSkpe1xuICAgICAgICAgICAgICAgIHJpZ2h0by5zeW5jKGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAgICAgICAgICAgICAgICAgbGFzdFZhbHVlID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIHJ1bigpO1xuICAgICAgICAgICAgICAgIH0sIG5leHQudmFsdWUpKGZ1bmN0aW9uKGVycm9yKXtcbiAgICAgICAgICAgICAgICAgICAgaWYoZXJyb3Ipe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxhc3RWYWx1ZSA9IG5leHQudmFsdWU7XG4gICAgICAgICAgICBydW4oKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJ1bigpO1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIGFkZFRyYWNpbmcocmVzb2x2ZSwgZm4sIGFyZ3Mpe1xuXG4gICAgdmFyIGFyZ01hdGNoID0gZm4udG9TdHJpbmcoKS5tYXRjaCgvXltcXHdcXHNdKj9cXCgoKD86XFx3K1ssXFxzXSo/KSopXFwpLyksXG4gICAgICAgIGFyZ05hbWVzID0gYXJnTWF0Y2ggPyBhcmdNYXRjaFsxXS5zcGxpdCgvWyxcXHNdKy9nKSA6IFtdO1xuXG4gICAgcmVzb2x2ZS5fc3RhY2sgPSBuZXcgRXJyb3IoKS5zdGFjaztcbiAgICByZXNvbHZlLl90cmFjZSA9IGZ1bmN0aW9uKHRhYnMpe1xuICAgICAgICB2YXIgZmlyc3RMaW5lID0gZ2V0Q2FsbExpbmUocmVzb2x2ZS5fc3RhY2spO1xuXG4gICAgICAgIGlmKHJlc29sdmUuX2Vycm9yKXtcbiAgICAgICAgICAgIGZpcnN0TGluZSA9ICdcXHUwMDFiWzMxbScgKyBmaXJzdExpbmUgKyAnIDwtIEVSUk9SIFNPVVJDRScgKyAgJ1xcdTAwMWJbMzltJztcbiAgICAgICAgfVxuXG4gICAgICAgIHRhYnMgPSB0YWJzIHx8IDA7XG4gICAgICAgIHZhciBzcGFjaW5nID0gJyAgICAnO1xuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgdGFiczsgaSArKyl7XG4gICAgICAgICAgICBzcGFjaW5nID0gc3BhY2luZyArICcgICAgJztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXJncy5tYXAoZnVuY3Rpb24oYXJnLCBpbmRleCl7XG4gICAgICAgICAgICByZXR1cm4gW2FyZywgYXJnTmFtZXNbaW5kZXhdIHx8IGluZGV4XTtcbiAgICAgICAgfSkucmVkdWNlKGZ1bmN0aW9uKHJlc3VsdHMsIGFyZ0luZm8pe1xuICAgICAgICAgICAgdmFyIGFyZyA9IGFyZ0luZm9bMF0sXG4gICAgICAgICAgICAgICAgYXJnTmFtZSA9IGFyZ0luZm9bMV07XG5cbiAgICAgICAgICAgIGlmKGlzVGFrZShhcmcpKXtcbiAgICAgICAgICAgICAgICBhcmcgPSBhcmcuX190YWtlX19bMF07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKGlzUmlnaHRvKGFyZykpe1xuICAgICAgICAgICAgICAgIHZhciBsaW5lID0gc3BhY2luZyArICctIGFyZ3VtZW50IFwiJyArIGFyZ05hbWUgKyAnXCIgZnJvbSAnO1xuXG5cbiAgICAgICAgICAgICAgICBpZighYXJnLl90cmFjZSl7XG4gICAgICAgICAgICAgICAgICAgIGxpbmUgPSBsaW5lICsgJ1RyYWNpbmcgd2FzIG5vdCBlbmFibGVkIGZvciB0aGlzIHJpZ2h0byBpbnN0YW5jZS4nO1xuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICBsaW5lID0gbGluZSArIGFyZy5fdHJhY2UodGFicyArIDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2gobGluZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICB9LCBbZmlyc3RMaW5lXSlcbiAgICAgICAgLmpvaW4oJ1xcbicpO1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIHRhc2tDb21wbGV0ZShlcnJvcil7XG4gICAgdmFyIGRvbmUgPSB0aGlzWzBdLFxuICAgICAgICBjb250ZXh0ID0gdGhpc1sxXSxcbiAgICAgICAgY2FsbGJhY2tzID0gY29udGV4dC5jYWxsYmFja3M7XG5cbiAgICBpZihlcnJvciAmJiByaWdodG8uX2RlYnVnKXtcbiAgICAgICAgY29udGV4dC5yZXNvbHZlLl9lcnJvciA9IGVycm9yO1xuICAgIH1cblxuICAgIHZhciByZXN1bHRzID0gYXJndW1lbnRzO1xuXG4gICAgZG9uZShyZXN1bHRzKTtcblxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyBpKyspe1xuICAgICAgICBkZWZlcihjYWxsYmFja3NbaV0uYXBwbHkuYmluZChjYWxsYmFja3NbaV0sIG51bGwsIHJlc3VsdHMpKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGVycm9yT3V0KGVycm9yLCBjYWxsYmFjayl7XG4gICAgaWYoZXJyb3IgJiYgcmlnaHRvLl9kZWJ1Zyl7XG4gICAgICAgIGlmKHJpZ2h0by5fYXV0b3RyYWNlT25FcnJvciB8fCB0aGlzLnJlc29sdmUuX3RyYWNlT25FcnJvcil7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRGVwZW5kZW5jeSBlcnJvciBleGVjdXRpbmcgJyArIHRoaXMuZm4ubmFtZSArICcgJyArIHRoaXMucmVzb2x2ZS5fdHJhY2UoKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjYWxsYmFjayhlcnJvcik7XG59XG5cbmZ1bmN0aW9uIGRlYnVnUmVzb2x2ZShjb250ZXh0LCBhcmdzLCBjb21wbGV0ZSl7XG4gICAgdHJ5e1xuICAgICAgICBhcmdzLnB1c2goY29tcGxldGUpO1xuICAgICAgICBjb250ZXh0LmZuLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgIH1jYXRjaChlcnJvcil7XG4gICAgICAgIGNvbnNvbGUubG9nKCdUYXNrIGV4Y2VwdGlvbiBleGVjdXRpbmcgJyArIGNvbnRleHQuZm4ubmFtZSArICcgZnJvbSAnICsgY29udGV4dC5yZXNvbHZlLl90cmFjZSgpKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZXNvbHZlV2l0aERlcGVuZGVuY2llcyhkb25lLCBlcnJvciwgYXJnUmVzdWx0cyl7XG4gICAgdmFyIGNvbnRleHQgPSB0aGlzO1xuXG4gICAgaWYoZXJyb3Ipe1xuICAgICAgICB2YXIgYm91bmRFcnJvck91dCA9IGVycm9yT3V0LmJpbmQoY29udGV4dCwgZXJyb3IpO1xuXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjb250ZXh0LmNhbGxiYWNrcy5sZW5ndGg7IGkrKyl7XG4gICAgICAgICAgICBib3VuZEVycm9yT3V0KGNvbnRleHQuY2FsbGJhY2tzW2ldKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgYXJncyA9IFtdLmNvbmNhdC5hcHBseShbXSwgYXJnUmVzdWx0cyksXG4gICAgICAgIGNvbXBsZXRlID0gdGFza0NvbXBsZXRlLmJpbmQoW2RvbmUsIGNvbnRleHRdKTtcblxuICAgIGlmKHJpZ2h0by5fZGVidWcpe1xuICAgICAgICByZXR1cm4gZGVidWdSZXNvbHZlKGNvbnRleHQsIGFyZ3MsIGNvbXBsZXRlKTtcbiAgICB9XG5cbiAgICAvLyBTbGlnaHQgcGVyZiBidW1wIGJ5IGF2b2lkaW5nIGFwcGx5IGZvciBzaW1wbGUgY2FzZXMuXG4gICAgc3dpdGNoKGFyZ3MubGVuZ3RoKXtcbiAgICAgICAgY2FzZSAwOiBjb250ZXh0LmZuKGNvbXBsZXRlKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgMTogY29udGV4dC5mbihhcmdzWzBdLCBjb21wbGV0ZSk7IGJyZWFrO1xuICAgICAgICBjYXNlIDI6IGNvbnRleHQuZm4oYXJnc1swXSwgYXJnc1sxXSwgY29tcGxldGUpOyBicmVhaztcbiAgICAgICAgY2FzZSAzOiBjb250ZXh0LmZuKGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGNvbXBsZXRlKTsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBhcmdzLnB1c2goY29tcGxldGUpO1xuICAgICAgICAgICAgY29udGV4dC5mbi5hcHBseShudWxsLCBhcmdzKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVEZXBlbmRlbmNpZXMoYXJncywgY29tcGxldGUsIHJlc29sdmVEZXBlbmRlbmN5KXtcbiAgICB2YXIgcmVzdWx0cyA9IFtdLFxuICAgICAgICBkb25lID0gMCxcbiAgICAgICAgaGFzRXJyb3JlZDtcblxuICAgIGlmKCFhcmdzLmxlbmd0aCl7XG4gICAgICAgIGNvbXBsZXRlKG51bGwsIFtdKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZXBlbmRlbmN5UmVzb2x2ZWQoaW5kZXgsIGVycm9yLCByZXN1bHQpe1xuICAgICAgICBpZihoYXNFcnJvcmVkKXtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgIGhhc0Vycm9yZWQgPSB0cnVlO1xuICAgICAgICAgICAgcmV0dXJuIGNvbXBsZXRlKGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdHNbaW5kZXhdID0gcmVzdWx0O1xuXG4gICAgICAgIGlmKCsrZG9uZSA9PT0gYXJncy5sZW5ndGgpe1xuICAgICAgICAgICAgY29tcGxldGUobnVsbCwgcmVzdWx0cyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKyl7XG4gICAgICAgIHJlc29sdmVEZXBlbmRlbmN5KGFyZ3NbaV0sIGRlcGVuZGVuY3lSZXNvbHZlZC5iaW5kKG51bGwsIGkpKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVyKGNvbXBsZXRlKXtcbiAgICB2YXIgY29udGV4dCA9IHRoaXM7XG5cbiAgICAvLyBObyBjYWxsYmFjaz8gSnVzdCBydW4gdGhlIHRhc2suXG4gICAgaWYoIWFyZ3VtZW50cy5sZW5ndGgpe1xuICAgICAgICBjb21wbGV0ZSA9IG5vT3A7XG4gICAgfVxuXG4gICAgaWYoaXNSaWdodG8oY29tcGxldGUpKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdyaWdodG8gaW5zdGFuY2UgcGFzc2VkIGludG8gYSByaWdodG8gaW5zdGFuY2UgaW5zdGVhZCBvZiBhIGNhbGxiYWNrJyk7XG4gICAgfVxuXG4gICAgaWYodHlwZW9mIGNvbXBsZXRlICE9PSAnZnVuY3Rpb24nKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICB9XG5cbiAgICBpZihjb250ZXh0LnJlc3VsdHMpe1xuICAgICAgICByZXR1cm4gY29tcGxldGUuYXBwbHkobnVsbCwgY29udGV4dC5yZXN1bHRzKTtcbiAgICB9XG5cbiAgICBjb250ZXh0LmNhbGxiYWNrcy5wdXNoKGNvbXBsZXRlKTtcblxuICAgIGlmKGNvbnRleHQuc3RhcnRlZCsrKXtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciByZXNvbHZlZCA9IHJlc29sdmVXaXRoRGVwZW5kZW5jaWVzLmJpbmQoY29udGV4dCwgZnVuY3Rpb24ocmVzb2x2ZWRSZXN1bHRzKXtcbiAgICAgICAgICAgIGlmKHJpZ2h0by5fZGVidWcpe1xuICAgICAgICAgICAgICAgIGlmKHJpZ2h0by5fYXV0b3RyYWNlIHx8IGNvbnRleHQucmVzb2x2ZS5fdHJhY2VPbkV4ZWN1dGUpe1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRXhlY3V0aW5nICcgKyBjb250ZXh0LmZuLm5hbWUgKyAnICcgKyBjb250ZXh0LnJlc29sdmUuX3RyYWNlKCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29udGV4dC5yZXN1bHRzID0gcmVzb2x2ZWRSZXN1bHRzO1xuICAgICAgICB9KTtcblxuICAgIGRlZmVyKHJlc29sdmVEZXBlbmRlbmNpZXMuYmluZChudWxsLCBjb250ZXh0LmFyZ3MsIHJlc29sdmVkLCByZXNvbHZlRGVwZW5kZW5jeS5iaW5kKGNvbnRleHQucmVzb2x2ZSkpKTtcblxuICAgIHJldHVybiBjb250ZXh0LnJlc29sdmU7XG59O1xuXG5mdW5jdGlvbiByaWdodG8oKXtcbiAgICB2YXIgYXJncyA9IHNsaWNlKGFyZ3VtZW50cyksXG4gICAgICAgIGZuID0gYXJncy5zaGlmdCgpO1xuXG4gICAgaWYodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyB0YXNrIGZ1bmN0aW9uIHBhc3NlZCB0byByaWdodG8nKTtcbiAgICB9XG5cbiAgICBpZihpc1JpZ2h0byhmbikgJiYgYXJncy5sZW5ndGggPiAwKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdSaWdodG8gdGFzayBwYXNzZWQgYXMgdGFyZ2V0IHRhc2sgdG8gcmlnaHRvKCknKTtcbiAgICB9XG5cbiAgICB2YXIgcmVzb2x2ZXJDb250ZXh0ID0ge1xuICAgICAgICAgICAgZm46IGZuLFxuICAgICAgICAgICAgY2FsbGJhY2tzOiBbXSxcbiAgICAgICAgICAgIGFyZ3M6IGFyZ3MsXG4gICAgICAgICAgICBzdGFydGVkOiAwXG4gICAgICAgIH0sXG4gICAgICAgIHJlc29sdmUgPSByZXNvbHZlci5iaW5kKHJlc29sdmVyQ29udGV4dCk7XG4gICAgcmVzb2x2ZS5nZXQgPSBnZXQuYmluZChyZXNvbHZlKTtcbiAgICByZXNvbHZlckNvbnRleHQucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgcmVzb2x2ZS5yZXNvbHZlID0gcmVzb2x2ZTtcblxuICAgIGlmKHJpZ2h0by5fZGVidWcpe1xuICAgICAgICBhZGRUcmFjaW5nKHJlc29sdmUsIGZuLCBhcmdzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzb2x2ZTtcbn1cblxucmlnaHRvLnN5bmMgPSBmdW5jdGlvbihmbil7XG4gICAgcmV0dXJuIHJpZ2h0by5hcHBseShudWxsLCBbZnVuY3Rpb24oKXtcbiAgICAgICAgdmFyIGFyZ3MgPSBzbGljZShhcmd1bWVudHMpLFxuICAgICAgICAgICAgZG9uZSA9IGFyZ3MucG9wKCksXG4gICAgICAgICAgICByZXN1bHQgPSBmbi5hcHBseShudWxsLCBhcmdzKTtcblxuICAgICAgICBpZihpc1Jlc29sdmFibGUocmVzdWx0KSl7XG4gICAgICAgICAgICByZXR1cm4gcmlnaHRvLmZyb20ocmVzdWx0KShkb25lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRvbmUobnVsbCwgcmVzdWx0KTtcbiAgICB9XS5jb25jYXQoc2xpY2UoYXJndW1lbnRzLCAxKSkpO1xufTtcblxucmlnaHRvLmFsbCA9IGZ1bmN0aW9uKHZhbHVlKXtcbiAgICB2YXIgdGFzayA9IHZhbHVlO1xuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPiAxKXtcbiAgICAgICAgdGFzayA9IHNsaWNlKGFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzb2x2ZSh0YXNrcyl7XG4gICAgICAgIHJldHVybiByaWdodG8uYXBwbHkobnVsbCwgW2Z1bmN0aW9uKCl7XG4gICAgICAgICAgICBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtIDFdKG51bGwsIHNsaWNlKGFyZ3VtZW50cywgMCwgLTEpKTtcbiAgICAgICAgfV0uY29uY2F0KHRhc2tzKSk7XG4gICAgfVxuXG4gICAgaWYoaXNSaWdodG8odGFzaykpe1xuICAgICAgICByZXR1cm4gcmlnaHRvKGZ1bmN0aW9uKHRhc2tzLCBkb25lKXtcbiAgICAgICAgICAgIHJlc29sdmUodGFza3MpKGRvbmUpO1xuICAgICAgICB9LCB0YXNrKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzb2x2ZSh0YXNrKTtcbn07XG5cbnJpZ2h0by5yZWR1Y2UgPSBmdW5jdGlvbih2YWx1ZXMsIHJlZHVjZXIsIHNlZWQpe1xuICAgIHZhciBoYXNTZWVkID0gYXJndW1lbnRzLmxlbmd0aCA+PSAzO1xuXG4gICAgaWYoIXJlZHVjZXIpe1xuICAgICAgICByZWR1Y2VyID0gZnVuY3Rpb24ocHJldmlvdXMsIG5leHQpe1xuICAgICAgICAgICAgcmV0dXJuIHJpZ2h0byhuZXh0KTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmlnaHRvLmZyb20odmFsdWVzKS5nZXQoZnVuY3Rpb24odmFsdWVzKXtcbiAgICAgICAgaWYoIXZhbHVlcyB8fCAhdmFsdWVzLnJlZHVjZSl7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3ZhbHVlcyB3YXMgbm90IGEgcmVkdWNlYWJsZSBvYmplY3QgKGxpa2UgYW4gYXJyYXkpJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZighdmFsdWVzLmxlbmd0aCl7XG4gICAgICAgICAgICByZXR1cm4gcmlnaHRvLmZyb20odW5kZWZpbmVkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhbHVlcyA9IHZhbHVlcy5zbGljZSgpO1xuXG4gICAgICAgIGlmKCFoYXNTZWVkKXtcbiAgICAgICAgICAgIHNlZWQgPSByaWdodG8odmFsdWVzLnNoaWZ0KCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHZhbHVlcy5yZWR1Y2UoZnVuY3Rpb24ocHJldmlvdXMsIG5leHQpe1xuICAgICAgICAgICAgcmV0dXJuIHJpZ2h0by5zeW5jKHJlZHVjZXIsIHByZXZpb3VzLCByaWdodG8udmFsdWUobmV4dCkpO1xuICAgICAgICB9LCBzZWVkKTtcbiAgICB9KTtcbn07XG5cbnJpZ2h0by5mcm9tID0gZnVuY3Rpb24odmFsdWUpe1xuICAgIGlmKGlzUmlnaHRvKHZhbHVlKSl7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICBpZighaXNSZXNvbHZhYmxlKHZhbHVlKSAmJiB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpe1xuICAgICAgICByZXR1cm4gcmlnaHRvLmFsbChzbGljZShhcmd1bWVudHMsIDEpKS5nZXQoZnVuY3Rpb24oYXJncyl7XG4gICAgICAgICAgICByZXR1cm4gcmlnaHRvLmZyb20odmFsdWUuYXBwbHkobnVsbCwgYXJncykpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmlnaHRvLnN5bmMoZnVuY3Rpb24ocmVzb2x2ZWQpe1xuICAgICAgICByZXR1cm4gcmVzb2x2ZWQ7XG4gICAgfSwgdmFsdWUpO1xufTtcblxucmlnaHRvLm1hdGUgPSBmdW5jdGlvbigpe1xuICAgIHJldHVybiByaWdodG8uYXBwbHkobnVsbCwgW2Z1bmN0aW9uKCl7XG4gICAgICAgIGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0xXS5hcHBseShudWxsLCBbbnVsbF0uY29uY2F0KHNsaWNlKGFyZ3VtZW50cywgMCwgLTEpKSk7XG4gICAgfV0uY29uY2F0KHNsaWNlKGFyZ3VtZW50cykpKTtcbn07XG5cbnJpZ2h0by50YWtlID0gZnVuY3Rpb24odGFzayl7XG4gICAgaWYoIWlzUmVzb2x2YWJsZSh0YXNrKSl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigndGFzayB3YXMgbm90IGEgcmVzb2x2YWJsZSB2YWx1ZScpO1xuICAgIH1cblxuICAgIHJldHVybiB7X190YWtlX186IHNsaWNlKGFyZ3VtZW50cyl9O1xufTtcblxucmlnaHRvLmFmdGVyID0gZnVuY3Rpb24odGFzayl7XG4gICAgaWYoIWlzUmVzb2x2YWJsZSh0YXNrKSl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigndGFzayB3YXMgbm90IGEgcmVzb2x2YWJsZSB2YWx1ZScpO1xuICAgIH1cblxuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpe1xuICAgICAgICByZXR1cm4ge19fdGFrZV9fOiBbdGFza119O1xuICAgIH1cblxuICAgIHJldHVybiB7X190YWtlX186IFtyaWdodG8ubWF0ZS5hcHBseShudWxsLCBhcmd1bWVudHMpXX07XG59O1xuXG5yaWdodG8ucmVzb2x2ZSA9IGZ1bmN0aW9uKG9iamVjdCwgZGVlcCl7XG4gICAgaWYoaXNSaWdodG8ob2JqZWN0KSl7XG4gICAgICAgIHJldHVybiByaWdodG8uc3luYyhmdW5jdGlvbihvYmplY3Qpe1xuICAgICAgICAgICAgcmV0dXJuIHJpZ2h0by5yZXNvbHZlKG9iamVjdCwgZGVlcCk7XG4gICAgICAgIH0sIG9iamVjdCk7XG4gICAgfVxuXG4gICAgaWYoIW9iamVjdCB8fCAhKHR5cGVvZiBvYmplY3QgPT09ICdvYmplY3QnIHx8IHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicpKXtcbiAgICAgICAgcmV0dXJuIHJpZ2h0by5mcm9tKG9iamVjdCk7XG4gICAgfVxuXG4gICAgdmFyIHBhaXJzID0gcmlnaHRvLmFsbChPYmplY3Qua2V5cyhvYmplY3QpLm1hcChmdW5jdGlvbihrZXkpe1xuICAgICAgICByZXR1cm4gcmlnaHRvKGZ1bmN0aW9uKHZhbHVlLCBkb25lKXtcbiAgICAgICAgICAgIGlmKGRlZXApe1xuICAgICAgICAgICAgICAgIHJpZ2h0by5zeW5jKGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtrZXksIHZhbHVlXTtcbiAgICAgICAgICAgICAgICB9LCByaWdodG8ucmVzb2x2ZSh2YWx1ZSwgdHJ1ZSkpKGRvbmUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRvbmUobnVsbCwgW2tleSwgdmFsdWVdKTtcbiAgICAgICAgfSwgb2JqZWN0W2tleV0pO1xuICAgIH0pKTtcblxuICAgIHJldHVybiByaWdodG8uc3luYyhmdW5jdGlvbihwYWlycyl7XG4gICAgICAgIHJldHVybiBwYWlycy5yZWR1Y2UoZnVuY3Rpb24ocmVzdWx0LCBwYWlyKXtcbiAgICAgICAgICAgIHJlc3VsdFtwYWlyWzBdXSA9IHBhaXJbMV07XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9LCBBcnJheS5pc0FycmF5KG9iamVjdCkgPyBbXSA6IHt9KTtcbiAgICB9LCBwYWlycyk7XG59O1xuXG5yaWdodG8uaXRlcmF0ZSA9IGZ1bmN0aW9uKCl7XG4gICAgdmFyIGFyZ3MgPSBzbGljZShhcmd1bWVudHMpLFxuICAgICAgICBmbiA9IGFyZ3Muc2hpZnQoKTtcblxuICAgIHJldHVybiByaWdodG8uYXBwbHkobnVsbCwgW3Jlc29sdmVJdGVyYXRvcihmbildLmNvbmNhdChhcmdzKSk7XG59O1xuXG5yaWdodG8udmFsdWUgPSBmdW5jdGlvbigpe1xuICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgIHJldHVybiByaWdodG8oZnVuY3Rpb24oZG9uZSl7XG4gICAgICAgIGRvbmUuYXBwbHkobnVsbCwgW251bGxdLmNvbmNhdChzbGljZShhcmdzKSkpO1xuICAgIH0pO1xufTtcblxucmlnaHRvLnN1cmVseSA9IGZ1bmN0aW9uKHRhc2spe1xuICAgIGlmKCFpc1Jlc29sdmFibGUodGFzaykpe1xuICAgICAgICB0YXNrID0gcmlnaHRvLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbihkb25lKXtcbiAgICAgICAgdGFzayhmdW5jdGlvbigpe1xuICAgICAgICAgICAgZG9uZShudWxsLCBzbGljZShhcmd1bWVudHMpKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59O1xuXG5yaWdodG8uaGFuZGxlID0gZnVuY3Rpb24odGFzaywgaGFuZGxlcil7XG4gICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbihoYW5kbGVyLCBkb25lKXtcbiAgICAgICAgdGFzayhmdW5jdGlvbihlcnJvcil7XG4gICAgICAgICAgICBpZighZXJyb3Ipe1xuICAgICAgICAgICAgICAgIHJldHVybiB0YXNrKGRvbmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBoYW5kbGVyKGVycm9yLCBkb25lKTtcbiAgICAgICAgfSk7XG4gICAgfSwgaGFuZGxlcik7XG59O1xuXG5yaWdodG8uZmFpbCA9IGZ1bmN0aW9uKGVycm9yKXtcbiAgICByZXR1cm4gcmlnaHRvKGZ1bmN0aW9uKGVycm9yLCBkb25lKXtcbiAgICAgICAgZG9uZShlcnJvcik7XG4gICAgfSwgZXJyb3IpO1xufTtcblxucmlnaHRvLmlzUmlnaHRvID0gaXNSaWdodG87XG5yaWdodG8uaXNUaGVuYWJsZSA9IGlzVGhlbmFibGU7XG5yaWdodG8uaXNSZXNvbHZhYmxlID0gaXNSZXNvbHZhYmxlO1xuXG5yaWdodG8ucHJveHkgPSBmdW5jdGlvbigpe1xuICAgIGlmKHR5cGVvZiBQcm94eSA9PT0gJ3VuZGVmaW5lZCcpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoaXMgZW52aXJvbm1lbnQgZG9lcyBub3Qgc3VwcG9ydCBQcm94eVxcJ3MnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcHJveHkocmlnaHRvLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykpO1xufTtcblxuZm9yKHZhciBrZXkgaW4gcmlnaHRvKXtcbiAgICByaWdodG8ucHJveHlba2V5XSA9IHJpZ2h0b1trZXldO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJpZ2h0bzsiLCJ2YXIgQ09NUExFVEUgPSAnY29tcGxldGUnLFxuICAgIENBTkNFTEVEID0gJ2NhbmNlbGVkJztcblxuZnVuY3Rpb24gcmFmKHRhc2spe1xuICAgIGlmKCdyZXF1ZXN0QW5pbWF0aW9uRnJhbWUnIGluIHdpbmRvdyl7XG4gICAgICAgIHJldHVybiB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRhc2spO1xuICAgIH1cblxuICAgIHNldFRpbWVvdXQodGFzaywgMTYpO1xufVxuXG5mdW5jdGlvbiBzZXRFbGVtZW50U2Nyb2xsKGVsZW1lbnQsIHgsIHkpe1xuICAgIGlmKGVsZW1lbnQuc2VsZiA9PT0gZWxlbWVudCl7XG4gICAgICAgIGVsZW1lbnQuc2Nyb2xsVG8oeCwgeSk7XG4gICAgfWVsc2V7XG4gICAgICAgIGVsZW1lbnQuc2Nyb2xsTGVmdCA9IHg7XG4gICAgICAgIGVsZW1lbnQuc2Nyb2xsVG9wID0geTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldFRhcmdldFNjcm9sbExvY2F0aW9uKHRhcmdldCwgcGFyZW50LCBhbGlnbil7XG4gICAgdmFyIHRhcmdldFBvc2l0aW9uID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLFxuICAgICAgICBwYXJlbnRQb3NpdGlvbixcbiAgICAgICAgeCxcbiAgICAgICAgeSxcbiAgICAgICAgZGlmZmVyZW5jZVgsXG4gICAgICAgIGRpZmZlcmVuY2VZLFxuICAgICAgICB0YXJnZXRXaWR0aCxcbiAgICAgICAgdGFyZ2V0SGVpZ2h0LFxuICAgICAgICBsZWZ0QWxpZ24gPSBhbGlnbiAmJiBhbGlnbi5sZWZ0ICE9IG51bGwgPyBhbGlnbi5sZWZ0IDogMC41LFxuICAgICAgICB0b3BBbGlnbiA9IGFsaWduICYmIGFsaWduLnRvcCAhPSBudWxsID8gYWxpZ24udG9wIDogMC41LFxuICAgICAgICBsZWZ0T2Zmc2V0ID0gYWxpZ24gJiYgYWxpZ24ubGVmdE9mZnNldCAhPSBudWxsID8gYWxpZ24ubGVmdE9mZnNldCA6IDAsXG4gICAgICAgIHRvcE9mZnNldCA9IGFsaWduICYmIGFsaWduLnRvcE9mZnNldCAhPSBudWxsID8gYWxpZ24udG9wT2Zmc2V0IDogMCxcbiAgICAgICAgbGVmdFNjYWxhciA9IGxlZnRBbGlnbixcbiAgICAgICAgdG9wU2NhbGFyID0gdG9wQWxpZ247XG5cbiAgICBpZihwYXJlbnQuc2VsZiA9PT0gcGFyZW50KXtcbiAgICAgICAgdGFyZ2V0V2lkdGggPSBNYXRoLm1pbih0YXJnZXRQb3NpdGlvbi53aWR0aCwgcGFyZW50LmlubmVyV2lkdGgpO1xuICAgICAgICB0YXJnZXRIZWlnaHQgPSBNYXRoLm1pbih0YXJnZXRQb3NpdGlvbi5oZWlnaHQsIHBhcmVudC5pbm5lckhlaWdodCk7XG4gICAgICAgIHggPSB0YXJnZXRQb3NpdGlvbi5sZWZ0ICsgcGFyZW50LnBhZ2VYT2Zmc2V0IC0gcGFyZW50LmlubmVyV2lkdGggKiBsZWZ0U2NhbGFyICsgdGFyZ2V0V2lkdGggKiBsZWZ0U2NhbGFyO1xuICAgICAgICB5ID0gdGFyZ2V0UG9zaXRpb24udG9wICsgcGFyZW50LnBhZ2VZT2Zmc2V0IC0gcGFyZW50LmlubmVySGVpZ2h0ICogdG9wU2NhbGFyICsgdGFyZ2V0SGVpZ2h0ICogdG9wU2NhbGFyO1xuICAgICAgICB4IC09IGxlZnRPZmZzZXQ7XG4gICAgICAgIHkgLT0gdG9wT2Zmc2V0O1xuICAgICAgICBkaWZmZXJlbmNlWCA9IHggLSBwYXJlbnQucGFnZVhPZmZzZXQ7XG4gICAgICAgIGRpZmZlcmVuY2VZID0geSAtIHBhcmVudC5wYWdlWU9mZnNldDtcbiAgICB9ZWxzZXtcbiAgICAgICAgdGFyZ2V0V2lkdGggPSB0YXJnZXRQb3NpdGlvbi53aWR0aDtcbiAgICAgICAgdGFyZ2V0SGVpZ2h0ID0gdGFyZ2V0UG9zaXRpb24uaGVpZ2h0O1xuICAgICAgICBwYXJlbnRQb3NpdGlvbiA9IHBhcmVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgdmFyIG9mZnNldExlZnQgPSB0YXJnZXRQb3NpdGlvbi5sZWZ0IC0gKHBhcmVudFBvc2l0aW9uLmxlZnQgLSBwYXJlbnQuc2Nyb2xsTGVmdCk7XG4gICAgICAgIHZhciBvZmZzZXRUb3AgPSB0YXJnZXRQb3NpdGlvbi50b3AgLSAocGFyZW50UG9zaXRpb24udG9wIC0gcGFyZW50LnNjcm9sbFRvcCk7XG4gICAgICAgIHggPSBvZmZzZXRMZWZ0ICsgKHRhcmdldFdpZHRoICogbGVmdFNjYWxhcikgLSBwYXJlbnQuY2xpZW50V2lkdGggKiBsZWZ0U2NhbGFyO1xuICAgICAgICB5ID0gb2Zmc2V0VG9wICsgKHRhcmdldEhlaWdodCAqIHRvcFNjYWxhcikgLSBwYXJlbnQuY2xpZW50SGVpZ2h0ICogdG9wU2NhbGFyO1xuICAgICAgICB4ID0gTWF0aC5tYXgoTWF0aC5taW4oeCwgcGFyZW50LnNjcm9sbFdpZHRoIC0gcGFyZW50LmNsaWVudFdpZHRoKSwgMCk7XG4gICAgICAgIHkgPSBNYXRoLm1heChNYXRoLm1pbih5LCBwYXJlbnQuc2Nyb2xsSGVpZ2h0IC0gcGFyZW50LmNsaWVudEhlaWdodCksIDApO1xuICAgICAgICB4IC09IGxlZnRPZmZzZXQ7XG4gICAgICAgIHkgLT0gdG9wT2Zmc2V0O1xuICAgICAgICBkaWZmZXJlbmNlWCA9IHggLSBwYXJlbnQuc2Nyb2xsTGVmdDtcbiAgICAgICAgZGlmZmVyZW5jZVkgPSB5IC0gcGFyZW50LnNjcm9sbFRvcDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICB4OiB4LFxuICAgICAgICB5OiB5LFxuICAgICAgICBkaWZmZXJlbmNlWDogZGlmZmVyZW5jZVgsXG4gICAgICAgIGRpZmZlcmVuY2VZOiBkaWZmZXJlbmNlWVxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGFuaW1hdGUocGFyZW50KXtcbiAgICByYWYoZnVuY3Rpb24oKXtcbiAgICAgICAgdmFyIHNjcm9sbFNldHRpbmdzID0gcGFyZW50Ll9zY3JvbGxTZXR0aW5ncztcbiAgICAgICAgaWYoIXNjcm9sbFNldHRpbmdzKXtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsb2NhdGlvbiA9IGdldFRhcmdldFNjcm9sbExvY2F0aW9uKHNjcm9sbFNldHRpbmdzLnRhcmdldCwgcGFyZW50LCBzY3JvbGxTZXR0aW5ncy5hbGlnbiksXG4gICAgICAgICAgICB0aW1lID0gRGF0ZS5ub3coKSAtIHNjcm9sbFNldHRpbmdzLnN0YXJ0VGltZSxcbiAgICAgICAgICAgIHRpbWVWYWx1ZSA9IE1hdGgubWluKDEgLyBzY3JvbGxTZXR0aW5ncy50aW1lICogdGltZSwgMSk7XG5cbiAgICAgICAgaWYoXG4gICAgICAgICAgICB0aW1lID4gc2Nyb2xsU2V0dGluZ3MudGltZSArIDIwXG4gICAgICAgICl7XG4gICAgICAgICAgICBzZXRFbGVtZW50U2Nyb2xsKHBhcmVudCwgbG9jYXRpb24ueCwgbG9jYXRpb24ueSk7XG4gICAgICAgICAgICBwYXJlbnQuX3Njcm9sbFNldHRpbmdzID0gbnVsbDtcbiAgICAgICAgICAgIHJldHVybiBzY3JvbGxTZXR0aW5ncy5lbmQoQ09NUExFVEUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGVhc2VWYWx1ZSA9IDEgLSBzY3JvbGxTZXR0aW5ncy5lYXNlKHRpbWVWYWx1ZSk7XG5cbiAgICAgICAgc2V0RWxlbWVudFNjcm9sbChwYXJlbnQsXG4gICAgICAgICAgICBsb2NhdGlvbi54IC0gbG9jYXRpb24uZGlmZmVyZW5jZVggKiBlYXNlVmFsdWUsXG4gICAgICAgICAgICBsb2NhdGlvbi55IC0gbG9jYXRpb24uZGlmZmVyZW5jZVkgKiBlYXNlVmFsdWVcbiAgICAgICAgKTtcblxuICAgICAgICBhbmltYXRlKHBhcmVudCk7XG4gICAgfSk7XG59XG5mdW5jdGlvbiB0cmFuc2l0aW9uU2Nyb2xsVG8odGFyZ2V0LCBwYXJlbnQsIHNldHRpbmdzLCBjYWxsYmFjayl7XG4gICAgdmFyIGlkbGUgPSAhcGFyZW50Ll9zY3JvbGxTZXR0aW5ncyxcbiAgICAgICAgbGFzdFNldHRpbmdzID0gcGFyZW50Ll9zY3JvbGxTZXR0aW5ncyxcbiAgICAgICAgbm93ID0gRGF0ZS5ub3coKSxcbiAgICAgICAgZW5kSGFuZGxlcjtcblxuICAgIGlmKGxhc3RTZXR0aW5ncyl7XG4gICAgICAgIGxhc3RTZXR0aW5ncy5lbmQoQ0FOQ0VMRUQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVuZChlbmRUeXBlKXtcbiAgICAgICAgcGFyZW50Ll9zY3JvbGxTZXR0aW5ncyA9IG51bGw7XG4gICAgICAgIGlmKHBhcmVudC5wYXJlbnRFbGVtZW50ICYmIHBhcmVudC5wYXJlbnRFbGVtZW50Ll9zY3JvbGxTZXR0aW5ncyl7XG4gICAgICAgICAgICBwYXJlbnQucGFyZW50RWxlbWVudC5fc2Nyb2xsU2V0dGluZ3MuZW5kKGVuZFR5cGUpO1xuICAgICAgICB9XG4gICAgICAgIGNhbGxiYWNrKGVuZFR5cGUpO1xuICAgICAgICBwYXJlbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIGVuZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHBhcmVudC5fc2Nyb2xsU2V0dGluZ3MgPSB7XG4gICAgICAgIHN0YXJ0VGltZTogbGFzdFNldHRpbmdzID8gbGFzdFNldHRpbmdzLnN0YXJ0VGltZSA6IERhdGUubm93KCksXG4gICAgICAgIHRhcmdldDogdGFyZ2V0LFxuICAgICAgICB0aW1lOiBzZXR0aW5ncy50aW1lICsgKGxhc3RTZXR0aW5ncyA/IG5vdyAtIGxhc3RTZXR0aW5ncy5zdGFydFRpbWUgOiAwKSxcbiAgICAgICAgZWFzZTogc2V0dGluZ3MuZWFzZSxcbiAgICAgICAgYWxpZ246IHNldHRpbmdzLmFsaWduLFxuICAgICAgICBlbmQ6IGVuZFxuICAgIH07XG5cbiAgICBlbmRIYW5kbGVyID0gZW5kLmJpbmQobnVsbCwgQ0FOQ0VMRUQpO1xuICAgIHBhcmVudC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0JywgZW5kSGFuZGxlcik7XG5cbiAgICBpZihpZGxlKXtcbiAgICAgICAgYW5pbWF0ZShwYXJlbnQpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZGVmYXVsdElzU2Nyb2xsYWJsZShlbGVtZW50KXtcbiAgICByZXR1cm4gKFxuICAgICAgICAncGFnZVhPZmZzZXQnIGluIGVsZW1lbnQgfHxcbiAgICAgICAgKFxuICAgICAgICAgICAgZWxlbWVudC5zY3JvbGxIZWlnaHQgIT09IGVsZW1lbnQuY2xpZW50SGVpZ2h0IHx8XG4gICAgICAgICAgICBlbGVtZW50LnNjcm9sbFdpZHRoICE9PSBlbGVtZW50LmNsaWVudFdpZHRoXG4gICAgICAgICkgJiZcbiAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5vdmVyZmxvdyAhPT0gJ2hpZGRlbidcbiAgICApO1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0VmFsaWRUYXJnZXQoKXtcbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih0YXJnZXQsIHNldHRpbmdzLCBjYWxsYmFjayl7XG4gICAgaWYoIXRhcmdldCl7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZih0eXBlb2Ygc2V0dGluZ3MgPT09ICdmdW5jdGlvbicpe1xuICAgICAgICBjYWxsYmFjayA9IHNldHRpbmdzO1xuICAgICAgICBzZXR0aW5ncyA9IG51bGw7XG4gICAgfVxuXG4gICAgaWYoIXNldHRpbmdzKXtcbiAgICAgICAgc2V0dGluZ3MgPSB7fTtcbiAgICB9XG5cbiAgICBzZXR0aW5ncy50aW1lID0gaXNOYU4oc2V0dGluZ3MudGltZSkgPyAxMDAwIDogc2V0dGluZ3MudGltZTtcbiAgICBzZXR0aW5ncy5lYXNlID0gc2V0dGluZ3MuZWFzZSB8fCBmdW5jdGlvbih2KXtyZXR1cm4gMSAtIE1hdGgucG93KDEgLSB2LCB2IC8gMik7fTtcblxuICAgIHZhciBwYXJlbnQgPSB0YXJnZXQucGFyZW50RWxlbWVudCxcbiAgICAgICAgcGFyZW50cyA9IDA7XG5cbiAgICBmdW5jdGlvbiBkb25lKGVuZFR5cGUpe1xuICAgICAgICBwYXJlbnRzLS07XG4gICAgICAgIGlmKCFwYXJlbnRzKXtcbiAgICAgICAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKGVuZFR5cGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHZhbGlkVGFyZ2V0ID0gc2V0dGluZ3MudmFsaWRUYXJnZXQgfHwgZGVmYXVsdFZhbGlkVGFyZ2V0O1xuICAgIHZhciBpc1Njcm9sbGFibGUgPSBzZXR0aW5ncy5pc1Njcm9sbGFibGU7XG5cbiAgICB3aGlsZShwYXJlbnQpe1xuICAgICAgICBpZih2YWxpZFRhcmdldChwYXJlbnQsIHBhcmVudHMpICYmIChpc1Njcm9sbGFibGUgPyBpc1Njcm9sbGFibGUocGFyZW50LCBkZWZhdWx0SXNTY3JvbGxhYmxlKSA6IGRlZmF1bHRJc1Njcm9sbGFibGUocGFyZW50KSkpe1xuICAgICAgICAgICAgcGFyZW50cysrO1xuICAgICAgICAgICAgdHJhbnNpdGlvblNjcm9sbFRvKHRhcmdldCwgcGFyZW50LCBzZXR0aW5ncywgZG9uZSk7XG4gICAgICAgIH1cblxuICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50RWxlbWVudDtcblxuICAgICAgICBpZighcGFyZW50KXtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKHBhcmVudC50YWdOYW1lID09PSAnQk9EWScpe1xuICAgICAgICAgICAgcGFyZW50ID0gcGFyZW50Lm93bmVyRG9jdW1lbnQ7XG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQuZGVmYXVsdFZpZXcgfHwgcGFyZW50Lm93bmVyV2luZG93O1xuICAgICAgICB9XG4gICAgfVxufTtcbiJdfQ==
