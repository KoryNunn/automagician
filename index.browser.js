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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJpbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9hYmJvdHQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYXV0b21hZ2ljLXVpL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2NyZWwvY3JlbC5qcyIsIm5vZGVfbW9kdWxlcy9wcmVkYXRvci9wcmVkYXRvci5qcyIsIm5vZGVfbW9kdWxlcy9yaWdodG8vaW5kZXguanMiLCJub2RlX21vZHVsZXMvc2Nyb2xsLWludG8tdmlldy9zY3JvbGxJbnRvVmlldy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdhQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDM2tCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIGNyZWwgPSByZXF1aXJlKCdjcmVsJyk7XG52YXIgcmlnaHRvID0gcmVxdWlyZSgncmlnaHRvJyk7XG52YXIgdWlEcml2ZXIgPSByZXF1aXJlKCdhdXRvbWFnaWMtdWknKTtcbnVpRHJpdmVyLmluaXQoe1xuXHRydW5EZWxheTogNTBcbn0pO1xudmFyIGRyaXZlciA9IHVpRHJpdmVyKCk7XG5cbnZhciBhdXRvbWFnaWNTdHlsZXMgPSBgXG5cdEBtZWRpYSBwcmludCB7XG5cdFx0LmF1dG9tYWdpY3tcblx0XHRcdGRpc3BsYXk6IG5vbmU7XG5cdFx0fVxuXHR9XG5cblx0LmF1dG9tYWdpY3tcdFxuXHRcdHBvc2l0aW9uOiBmaXhlZDtcblx0XHR0b3A6IDA7XG5cdFx0bGVmdDowO1xuXHRcdHJpZ2h0OjA7XG5cdFx0YmFja2dyb3VuZDogYmxhY2s7XG5cdFx0cGFkZGluZzogMTBweDtcblx0XHR6LWluZGV4OiAxMDAwO1xuXHR9XG5cblx0LmF1dG9tYWdpYy5oaWRle1xuXHRcdHJpZ2h0OmF1dG87XG5cdFx0cGFkZGluZzogMnB4O1xuXHR9XG5cblx0LmF1dG9tYWdpYy5oaWRlIC5pbnB1dHtcblx0XHRkaXNwbGF5Om5vbmU7XG5cdH1cblxuXHQuYXV0b21hZ2ljLnJ1bm5pbmcgLmlucHV0e1xuXHRcdGRpc3BsYXk6bm9uZTtcblx0fVxuXG5cdC5hdXRvbWFnaWMgdGV4dGFyZWF7XG5cdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0cGFkZGluZzogNXB4O1xuXHRcdHdpZHRoOiAxMDAlO1xuXHRcdGhlaWdodDogMjAwcHg7XG5cdH1cblxuXHQuYXV0b21hZ2ljIC5vdXRwdXR7XG5cdFx0Y29sb3I6IHdoaXRlO1xuXHRcdHBhZGRpbmc6IDFlbTtcblx0fVxuXG5cdC5hdXRvbWFnaWMgLm91dHB1dC5lcnJvcntcblx0XHRjb2xvcjogcmVkO1xuXHR9XG5gXG5cbnZhciBzdG9yYWdlID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2F1dG9tYWdpYycpO1xuXG52YXIgY29kZUFyZWEsIHJ1bkJ1dHRvbiwgaGlkZVNob3dCdXR0b247XG52YXIgdWkgPSBjcmVsKCdkaXYnLCB7IGNsYXNzOiAnYXV0b21hZ2ljJyB9LFxuXHRjcmVsKCdzdHlsZScsIGF1dG9tYWdpY1N0eWxlcyksXG5cdGhpZGVTaG93QnV0dG9uID0gY3JlbCgnYnV0dG9uJywgeyBjbGFzczogJ2hpZGVTaG93JyB9LCAnXycpLFxuXHRvdXRwdXQgPSBjcmVsKCdzcGFuJywgeyBjbGFzczogJ291dHB1dCcgfSksXG5cdGNyZWwoJ3ByZScsIHsgY2xhc3M6ICdpbnB1dCcgfSxcblx0XHRjb2RlQXJlYSA9IGNyZWwoJ3RleHRhcmVhJywgc3RvcmFnZSksXG5cdFx0cnVuQnV0dG9uID0gY3JlbCgnYnV0dG9uJywgJ3J1bicpXG5cdClcbik7XG5cbnZhciBleGlzdGluZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWFnaWMnKTtcbnZhciBzaG93biA9IHRydWU7XG5cbmlmKGV4aXN0aW5nKXtcblx0ZXhpc3RpbmcucmVtb3ZlKCk7XG59XG5cbmNyZWwoZG9jdW1lbnQuYm9keSwgdWkpO1xuXG52YXIgb3BlcmF0aW9ucyA9IHtcblx0Y2xpY2s6IGZ1bmN0aW9uKHNlbGVjdG9yLCBhcmdzLCBjYWxsYmFjayl7XG5cdFx0ZHJpdmVyLmNsaWNrKHNlbGVjdG9yKS5nbyhjYWxsYmFjayk7XG5cdH0sXG5cdGNsaWNrU2VsZWN0b3I6IGZ1bmN0aW9uKHNlbGVjdG9yLCBhcmdzLCBjYWxsYmFjayl7XG5cdFx0ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3RvcikuY2xpY2soKTtcblx0XHRjYWxsYmFjaygpO1xuXHR9LFxuXHRlbnRlcjogZnVuY3Rpb24oc2VsZWN0b3IsIGFyZ3MsIGNhbGxiYWNrKXtcblx0XHRkcml2ZXJcblx0XHQuY2hhbmdlVmFsdWUoc2VsZWN0b3IsIG51bGwsIGFyZ3NbMF0pXG5cdFx0LmdvKGNhbGxiYWNrKTtcblx0fSxcblx0ZW50ZXJTZWxlY3RvcjogZnVuY3Rpb24oc2VsZWN0b3IsIGFyZ3MsIGNhbGxiYWNrKXtcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3RvcikuZm9jdXMoKTtcblx0XHRkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKS52YWx1ZSA9IGFyZ3NbMF07XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpLmJsdXIoKTtcblx0XHRjYWxsYmFjaygpO1xuXHR9LFxuXHRzY3JvbGxUbzogZnVuY3Rpb24oc2VsZWN0b3IsIGFyZ3MsIGNhbGxiYWNrKXtcblx0XHRkcml2ZXIuc2Nyb2xsVG8oc2VsZWN0b3IpLmdvKGNhbGxiYWNrKTtcblx0fSxcbiAgICB3YWl0Rm9yOiBmdW5jdGlvbihzZWxlY3RvciwgYXJncywgY2FsbGJhY2spe1xuICAgICAgICB2YXIgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdmFyIHRpbWVvdXQgPSBhcmdzWzBdIHx8IDUwMDA7XG4gICAgICAgIHZhciBmb3VuZCA9IHJpZ2h0byhmdW5jdGlvbihkb25lKXtcbiAgICAgICAgICAgIGZ1bmN0aW9uIHJldHJ5KCl7XG4gICAgICAgICAgICAgICAgaWYoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA+IHRpbWVvdXQpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZG9uZShuZXcgRXJyb3IoJ1RpbWVvdXQgZmluZGluZyAnICsgc2VsZWN0b3IpKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBkcml2ZXIuZmluZFVpKHNlbGVjdG9yKS5nbyhmdW5jdGlvbihlcnJvcil7XG4gICAgICAgICAgICAgICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXRyeSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0cnkoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZm91bmQoY2FsbGJhY2spO1xuICAgIH1cbn07XG5cbmNvZGVBcmVhLmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgZnVuY3Rpb24oKXtcblx0bG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2F1dG9tYWdpYycsIGNvZGVBcmVhLnZhbHVlKTtcbn0pO1xuXG5mdW5jdGlvbiBydW4oKXtcblx0aGlkZVNob3coZmFsc2UpO1xuXHR1aS5jbGFzc0xpc3QuYWRkKCdydW5uaW5nJyk7XG5cdG91dHB1dC5jbGFzc0xpc3QucmVtb3ZlKCdlcnJvcicpO1xuXHR2YXIgY29tbWFuZHMgPSBjb2RlQXJlYS52YWx1ZS5zcGxpdCgnXFxuJykuZmlsdGVyKHggPT4geC50cmltKCkpO1xuXG5cdHZhciBjb21wbGV0ZSA9IHJpZ2h0by5yZWR1Y2UoY29tbWFuZHMubWFwKGZ1bmN0aW9uKGNvbW1hbmQpe1xuXHRcdGlmKGNvbW1hbmQubWF0Y2goL15cXC9cXC8vKSl7XG5cdFx0XHR2YXIgcmVzdWx0ID0gJ2NvbW1lbnRlZCBjb21tYW5kOicsIGNvbW1hbmQ7XG5cdFx0XHRjb25zb2xlLmxvZyhyZXN1bHQpO1xuXHRcdFx0cmV0dXJuIHJpZ2h0by52YWx1ZShyZXN1bHQpO1xuXHRcdH1cblxuXHRcdHZhciBwYXJ0cyA9IGNvbW1hbmQuc3BsaXQoJyAtICcpO1xuXHRcdGNvbnNvbGUubG9nKHBhcnRzKTtcblx0XHR2YXIgc2VsZWN0b3IgPSBwYXJ0c1swXTtcblx0XHR2YXIgb3BlcmF0aW9uID0gcGFydHNbMV07XG5cdFx0dmFyIGFyZ3MgPSBwYXJ0cy5zbGljZSgyKTtcblxuXHRcdGlmKCEob3BlcmF0aW9uIGluIG9wZXJhdGlvbnMpKXtcblx0XHRcdHJldHVybiByaWdodG8uZmFpbChuZXcgRXJyb3IoXCJOTyBPUEVSQVRJT046IFwiICsgb3BlcmF0aW9uKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJpZ2h0byhvcGVyYXRpb25zW29wZXJhdGlvbl0sIHNlbGVjdG9yLCBhcmdzKTtcblx0fSkpO1xuXG5cdGNvbXBsZXRlKGZ1bmN0aW9uKGVycm9yKXtcblx0XHR1aS5jbGFzc0xpc3QucmVtb3ZlKCdydW5uaW5nJyk7XG5cblx0XHRpZihlcnJvcil7XG5cdFx0XHRvdXRwdXQuY2xhc3NMaXN0LmFkZCgnZXJyb3InKTtcblx0XHRcdG91dHB1dC50ZXh0Q29udGVudCA9IGVycm9yO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdG91dHB1dC50ZXh0Q29udGVudCA9ICdTdWNjZXNzJztcblx0fSk7XG59XG5cbnJ1bkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bik7XG5cbmZ1bmN0aW9uIGhpZGVTaG93KHNob3cpe1xuXHRzaG93biA9ICFzaG93bjtcblx0aWYodHlwZW9mIHNob3cgPT09ICdib29sZWFuJyl7XG5cdFx0c2hvd24gPSBzaG93O1xuXHR9XG5cdGhpZGVTaG93QnV0dG9uLnRleHRDb250ZW50ID0gc2hvd24gPyAnXycgOiAnXFx1RDgzRFxcdURERDYnO1xuXHR1aS5jbGFzc0xpc3QucmVtb3ZlKHNob3duID8gJ2hpZGUnIDogJ3Nob3cnKTtcblx0dWkuY2xhc3NMaXN0LmFkZChzaG93biA/ICdzaG93JyA6ICdoaWRlJyk7XG59XG5cbmhpZGVTaG93QnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGlkZVNob3cpOyIsImZ1bmN0aW9uIGNoZWNrSWZQcm9taXNlKHByb21pc2Upe1xuICAgIGlmKCFwcm9taXNlIHx8IHR5cGVvZiBwcm9taXNlICE9PSAnb2JqZWN0JyB8fCB0eXBlb2YgcHJvbWlzZS50aGVuICE9PSAnZnVuY3Rpb24nKXtcbiAgICAgICAgdGhyb3cgXCJBYmJvdHQgcmVxdWlyZXMgYSBwcm9taXNlIHRvIGJyZWFrLiBJdCBpcyB0aGUgb25seSB0aGluZyBBYmJvdHQgaXMgZ29vZCBhdC5cIjtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYWJib3R0KHByb21pc2VPckZuKXtcbiAgICBpZih0eXBlb2YgcHJvbWlzZU9yRm4gIT09ICdmdW5jdGlvbicpe1xuICAgICAgICBjaGVja0lmUHJvbWlzZShwcm9taXNlT3JGbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciBwcm9taXNlO1xuICAgICAgICBpZih0eXBlb2YgcHJvbWlzZU9yRm4gPT09ICdmdW5jdGlvbicpe1xuICAgICAgICAgICBwcm9taXNlID0gcHJvbWlzZU9yRm4uYXBwbHkobnVsbCwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwLCAtMSkpO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHByb21pc2UgPSBwcm9taXNlT3JGbjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNoZWNrSWZQcm9taXNlKHByb21pc2UpO1xuXG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoLTFdO1xuICAgICAgICBwcm9taXNlLnRoZW4oY2FsbGJhY2suYmluZChudWxsLCBudWxsKSwgY2FsbGJhY2spO1xuICAgIH07XG59OyIsInZhciBwcmVkYXRvciA9IHJlcXVpcmUoJ3ByZWRhdG9yJyk7XG52YXIgc2Nyb2xsSW50b1ZpZXcgPSByZXF1aXJlKCdzY3JvbGwtaW50by12aWV3Jyk7XG5cbi8vIExpc3Qgb2YgdGFnTmFtZXMgb3JkZXJlZCBieSB0aGVpciBsaWtlbGluZXNzIHRvIGJlIHRoZSB0YXJnZXQgb2YgYSBjbGljayBldmVudFxudmFyIHRleHRXZWlnaHRpbmcgPSBbJ2gxJywgJ2gyJywgJ2gzJywgJ2g0JywgJ2xhYmVsJywgJ3AnLCAnYScsICdidXR0b24nXTtcbnZhciBjbGlja1dlaWdodGluZyA9IFsnYnV0dG9uJywgJ2lucHV0JywgJ2EnLCAnaDEnLCAnaDInLCAnaDMnLCAnaDQnLCAnaScsICdsYWJlbCddO1xudmFyIHZhbHVlV2VpZ2h0aW5nID0gWydpbnB1dCcsICd0ZXh0YXJlYScsICdzZWxlY3QnLCAnbGFiZWwnXTtcblxudmFyIHR5cGVzID0ge1xuICAgICAgICAnYnV0dG9uJzogWydidXR0b24nLCAnYSddLFxuICAgICAgICAnbGFiZWwnOiBbJ2xhYmVsJywgJ3NwYW4nLCAnZGl2J10sXG4gICAgICAgICdoZWFkaW5nJzogWydoMScsICdoMicsICdoMycsICdoNCddLFxuICAgICAgICAnaW1hZ2UnOiBbJ2ltZycsICdzdmcnXSxcbiAgICAgICAgJ2ZpZWxkJzogWydpbnB1dCcsICd0ZXh0YXJlYScsICdzZWxlY3QnLCAnbGFiZWwnXSxcbiAgICAgICAgJ2FsbCc6IFsnKiddLFxuICAgICAgICAndGV4dCc6IFsnKiddXG4gICAgfSxcbiAgICBub0VsZW1lbnRPZlR5cGUgPSAnbm8gZWxlbWVudHMgb2YgdHlwZSAnLFxuICAgIGRvY3VtZW50U2NvcGUsXG4gICAgd2luZG93U2NvcGUsXG4gICAgcnVuRGVsYXksXG4gICAgaW5pdGlhbGlzZWQ7XG5cbmZ1bmN0aW9uIF9wcmVzc0tleShrZXksIGRvbmUpIHtcbiAgICB2YXIgZWxlbWVudCA9IHRoaXMuY3VycmVudENvbnRleHQuYWN0aXZlRWxlbWVudDtcblxuICAgIGVsZW1lbnQudmFsdWUgKz0ga2V5O1xuXG4gICAgdmFyIGtleWRvd25FdmVudCA9IG5ldyB3aW5kb3dTY29wZS5LZXlib2FyZEV2ZW50KCdrZXlkb3duJyksXG4gICAgICAgIGtleXVwRXZlbnQgPSBuZXcgd2luZG93U2NvcGUuS2V5Ym9hcmRFdmVudCgna2V5dXAnKSxcbiAgICAgICAgcHJlc3NLZXlFdmVudCA9IG5ldyB3aW5kb3dTY29wZS5LZXlib2FyZEV2ZW50KCdwcmVzc0tleScpO1xuXG4gICAgdmFyIG1ldGhvZCA9ICdpbml0S2V5Ym9hcmRFdmVudCcgaW4ga2V5ZG93bkV2ZW50ID8gJ2luaXRLZXlib2FyZEV2ZW50JyA6ICdpbml0S2V5RXZlbnQnO1xuXG4gICAga2V5ZG93bkV2ZW50W21ldGhvZF0oJ2tleWRvd24nLCB0cnVlLCB0cnVlLCB3aW5kb3dTY29wZSwga2V5LCAzLCB0cnVlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UsIGZhbHNlKTtcbiAgICBrZXl1cEV2ZW50W21ldGhvZF0oJ2tleXVwJywgdHJ1ZSwgdHJ1ZSwgd2luZG93U2NvcGUsIGtleSwgMywgdHJ1ZSwgZmFsc2UsIHRydWUsIGZhbHNlLCBmYWxzZSk7XG4gICAgcHJlc3NLZXlFdmVudFttZXRob2RdKCdwcmVzc0tleScsIHRydWUsIHRydWUsIHdpbmRvd1Njb3BlLCBrZXksIDMsIHRydWUsIGZhbHNlLCB0cnVlLCBmYWxzZSwgZmFsc2UpO1xuXG4gICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KGtleWRvd25FdmVudCk7XG4gICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KGtleXVwRXZlbnQpO1xuICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChwcmVzc0tleUV2ZW50KTtcblxuICAgIGRvbmUobnVsbCwgZWxlbWVudCk7XG59XG5cbmZ1bmN0aW9uIF9wcmVzc0tleXMoa2V5cywgZG9uZSkge1xuICAgIHZhciBzdGF0ZSA9IHRoaXMsXG4gICAgICAgIG5leHRLZXkgPSBTdHJpbmcoa2V5cykuY2hhckF0KDApO1xuXG4gICAgaWYobmV4dEtleSA9PT0gJycpe1xuICAgICAgICByZXR1cm4gZG9uZShudWxsLCB0aGlzLmN1cnJlbnRDb250ZXh0LmFjdGl2ZUVsZW1lbnQpO1xuICAgIH1cblxuICAgIF9wcmVzc0tleS5jYWxsKHN0YXRlLCBuZXh0S2V5LCBmdW5jdGlvbigpIHtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICAgICAgX3ByZXNzS2V5cy5jYWxsKHN0YXRlLCBTdHJpbmcoa2V5cykuc2xpY2UoMSksIGRvbmUpO1xuICAgICAgICB9LCA1MCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGZpbmRVaShjdXJyZW50Q29udGV4LCBzZWxlY3RvcnMpIHtcbiAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoY3VycmVudENvbnRleC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9ycykpXG4gICAgICAgIC5zb3J0KGZ1bmN0aW9uKGEsIGIpe1xuICAgICAgICAgICAgcmV0dXJuICFhLmNvbnRhaW5zKGIpID8gLTEgOiAwO1xuICAgICAgICB9KTsgLy8gZGVlcGVyIGVsZW1lbnRzIHRha2UgcHJlY2VkZW5jZS5cbn1cblxuZnVuY3Rpb24gX25hdmlnYXRlKGxvY2F0aW9uLCBwcmV2aW91c0VsZW1lbnQsIGRvbmUpIHtcbiAgICB2YXIgY2FsbGJhY2tUaW1lcjtcblxuICAgIGZ1bmN0aW9uIGhhbmRsZXdpbmRvd1Njb3BlRXJyb3IoZXJyb3IpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGNhbGxiYWNrVGltZXIpO1xuXG4gICAgICAgIGRvbmUoZXJyb3IpO1xuICAgICAgICB3aW5kb3dTY29wZS5yZW1vdmVFdmVudExpc3RlbmVyKCdlcnJvcicsIGhhbmRsZXdpbmRvd1Njb3BlRXJyb3IpO1xuICAgIH1cblxuICAgIHdpbmRvd1Njb3BlLmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgaGFuZGxld2luZG93U2NvcGVFcnJvcik7XG4gICAgd2luZG93U2NvcGUubG9jYXRpb24gPSBsb2NhdGlvbjtcblxuICAgIGNhbGxiYWNrVGltZXIgPSBzZXRUaW1lb3V0KGRvbmUsIDE1MCk7XG59XG5cbmZ1bmN0aW9uIF9nZXRMb2NhdGlvbihkb25lKSB7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgZG9uZShudWxsLCB3aW5kb3dTY29wZS5sb2NhdGlvbik7XG4gICAgfSwgNTAwKTtcbn1cblxuZnVuY3Rpb24gbWF0Y2hFbGVtZW50VmFsdWUoZWxlbWVudCwgdmFsdWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgICAgICAgZWxlbWVudC50ZXh0Q29udGVudC50b0xvd2VyQ2FzZSgpID09PSB2YWx1ZS50b0xvd2VyQ2FzZSgpIHx8XG4gICAgICAgICAgICAoZWxlbWVudC50aXRsZSAmJiBlbGVtZW50LnRpdGxlLnRvTG93ZXJDYXNlKCkgPT09IHZhbHVlLnRvTG93ZXJDYXNlKCkpXG4gICAgICAgICk7XG59XG5cbmZ1bmN0aW9uIGZpbmRNYXRjaGluZ0VsZW1lbnRzKHZhbHVlLCB0eXBlLCBlbGVtZW50c0xpc3QpIHtcbiAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZWxlbWVudHNMaXN0KVxuICAgICAgICAuZmlsdGVyKGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBtYXRjaEVsZW1lbnRWYWx1ZShlbGVtZW50LCB2YWx1ZSk7XG4gICAgICAgIH0pO1xufVxuXG5mdW5jdGlvbiBnZXRFbGVtZW50VGV4dFdlaWdodChlbGVtZW50KSB7XG4gICAgdmFyIGluZGV4ID0gdGV4dFdlaWdodGluZy5pbmRleE9mKGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpKTtcbiAgICByZXR1cm4gdGV4dFdlaWdodGluZy5sZW5ndGggLSAoaW5kZXggPCAwID8gSW5maW5pdHkgOiBpbmRleCk7XG59XG5cbmZ1bmN0aW9uIGdldEVsZW1lbnRDbGlja1dlaWdodChlbGVtZW50KSB7XG4gICAgdmFyIGluZGV4ID0gY2xpY2tXZWlnaHRpbmcuaW5kZXhPZihlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKSk7XG4gICAgcmV0dXJuIGNsaWNrV2VpZ2h0aW5nLmxlbmd0aCAtIChpbmRleCA8IDAgPyBJbmZpbml0eSA6IGluZGV4KTtcbn1cblxuZnVuY3Rpb24gZ2V0RWxlbWVudFZhbHVlV2VpZ2h0KGVsZW1lbnQpIHtcbiAgICB2YXIgaW5kZXggPSB2YWx1ZVdlaWdodGluZy5pbmRleE9mKGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpKTtcbiAgICByZXR1cm4gdmFsdWVXZWlnaHRpbmcubGVuZ3RoIC0gKGluZGV4IDwgMCA/IEluZmluaXR5IDogaW5kZXgpO1xufVxuXG5mdW5jdGlvbiBfZmluZEFsbFVpKHZhbHVlLCB0eXBlLCBkb25lKXtcbiAgICBpZighdHlwZSl7XG4gICAgICAgIHR5cGUgPSAnYWxsJztcbiAgICB9XG5cbiAgICB2YXIgZWxlbWVudFR5cGVzID0gdHlwZXNbdHlwZV07XG5cblxuICAgIGlmKCFlbGVtZW50VHlwZXMpIHtcbiAgICAgICAgcmV0dXJuIGRvbmUobmV3IEVycm9yKHR5cGUgKyAnIGlzIG5vdCBhIHZhbGlkIHVpIHR5cGUnKSk7XG4gICAgfVxuXG4gICAgdmFyIGVsZW1lbnRzID0gZmluZFVpKHRoaXMuY3VycmVudENvbnRleHQsIGVsZW1lbnRUeXBlcyk7XG5cbiAgICBpZighZWxlbWVudHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBkb25lKG5ldyBFcnJvcihub0VsZW1lbnRPZlR5cGUgKyB0eXBlKSk7XG4gICAgfVxuXG4gICAgdmFyIHJlc3VsdHMgPSBmaW5kTWF0Y2hpbmdFbGVtZW50cyh2YWx1ZSwgdHlwZSwgZWxlbWVudHMpXG4gICAgICAgIC5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBnZXRFbGVtZW50VGV4dFdlaWdodChhKSA8IGdldEVsZW1lbnRUZXh0V2VpZ2h0KGIpO1xuICAgICAgICB9KTtcblxuICAgIGRvbmUobnVsbCwgcmVzdWx0cyk7XG59XG5cbmZ1bmN0aW9uIF9maW5kVWkodmFsdWUsIHR5cGUsIHJldHVybkFycmF5LCBkb25lKSB7XG4gICAgaWYoIWRvbmUpIHtcbiAgICAgICAgZG9uZSA9IHJldHVybkFycmF5O1xuICAgICAgICByZXR1cm5BcnJheSA9IGZhbHNlO1xuICAgIH1cblxuICAgIF9maW5kQWxsVWkuY2FsbCh0aGlzLCB2YWx1ZSwgdHlwZSwgZnVuY3Rpb24oZXJyb3IsIGVsZW1lbnRzKXtcbiAgICAgICAgaWYoZXJyb3Ipe1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUoZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChlbGVtZW50cylcbiAgICAgICAgICAgIC5maWx0ZXIoZnVuY3Rpb24oZWxlbWVudCl7XG4gICAgICAgICAgICAgICAgcmV0dXJuICFwcmVkYXRvcihlbGVtZW50KS5oaWRkZW47XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICBpZighcmVzdWx0cy5sZW5ndGgpe1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUobmV3IEVycm9yKCdcIicgKyB2YWx1ZSArICdcIiB3YXMgZm91bmQgYnV0IG5vdCB2aXNpYmxlIG9uIHNjcmVlbicpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRvbmUobnVsbCwgcmV0dXJuQXJyYXkgPyByZXN1bHRzIDogcmVzdWx0cy5zaGlmdCgpKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gX3NldFZhbHVlKHZhbHVlLCB0eXBlLCB0ZXh0LCBkb25lKSB7XG4gICAgX2ZvY3VzLmNhbGwodGhpcywgdmFsdWUsIHR5cGUsIGZ1bmN0aW9uKGVycm9yLCBlbGVtZW50KSB7XG4gICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgIHJldHVybiBkb25lKGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGVsZW1lbnQudmFsdWUgPSB0ZXh0O1xuXG4gICAgICAgIGRvbmUobnVsbCwgZWxlbWVudCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIF93YWl0KHRpbWUsIGRvbmUpIHtcbiAgICBzZXRUaW1lb3V0KGRvbmUsIHRpbWUgfHwgMCk7XG59XG5cbmZ1bmN0aW9uIGZpbmRDbGlja2FibGUoY3VycmVudENvbnRleHQsIGVsZW1lbnRzKXtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgZWxlbWVudHMubGVuZ3RoOyBpKyspe1xuICAgICAgICB2YXIgZWxlbWVudCA9IGVsZW1lbnRzW2ldO1xuICAgICAgICAgICAgcmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCksXG4gICAgICAgICAgICBjbGlja0VsZW1lbnQgPSBjdXJyZW50Q29udGV4dC5lbGVtZW50RnJvbVBvaW50KHJlY3QubGVmdCArIHJlY3Qud2lkdGggLyAyLCByZWN0LnRvcCArIHJlY3QuaGVpZ2h0IC8gMiksXG4gICAgICAgICAgICBjbGlja0VsZW1lbnRJbkVsZW1lbnQgPSBlbGVtZW50LmNvbnRhaW5zKGNsaWNrRWxlbWVudCksXG4gICAgICAgICAgICBlbGVtZW50SW5DbGlja0VsZW1lbnQgPSBjbGlja0VsZW1lbnQuY29udGFpbnMoZWxlbWVudCk7XG5cbiAgICAgICAgaWYoY2xpY2tFbGVtZW50SW5FbGVtZW50IHx8IGVsZW1lbnRJbkNsaWNrRWxlbWVudCB8fCBjbGlja0VsZW1lbnQgPT09IGVsZW1lbnQpe1xuICAgICAgICAgICAgcmV0dXJuIGNsaWNrRWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZXhlY3V0ZUNsaWNrKHZhbHVlLCB0eXBlLCBkb25lKSB7XG4gICAgdmFyIHN0YXRlID0gdGhpcztcbiAgICBfZmluZFVpLmNhbGwoc3RhdGUsIHZhbHVlLCAnYWxsJywgdHJ1ZSwgZnVuY3Rpb24oZXJyb3IsIGVsZW1lbnRzKSB7XG4gICAgICAgIGlmKGVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShlcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY2xpY2thYmxlRWxlbWVudHMgPSBlbGVtZW50c1xuICAgICAgICAgICAgLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBnZXRFbGVtZW50Q2xpY2tXZWlnaHQoYSkgPCBnZXRFbGVtZW50Q2xpY2tXZWlnaHQoYik7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZWxlbWVudCA9IGZpbmRDbGlja2FibGUoc3RhdGUuY3VycmVudENvbnRleHQsIGVsZW1lbnRzKTtcblxuICAgICAgICBpZighZWxlbWVudCkge1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUobmV3IEVycm9yKCdjb3VsZCBub3QgZmluZCBjbGlja2FibGUgZWxlbWVudCBtYXRjaGluZyBcIicgKyB2YWx1ZSArICdcIicpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNWRyBwYXRoc1xuICAgICAgICB3aGlsZSghZWxlbWVudC5jbGljayl7XG4gICAgICAgICAgICBlbGVtZW50ID0gZWxlbWVudC5wYXJlbnROb2RlO1xuICAgICAgICB9XG5cbiAgICAgICAgZWxlbWVudC5jbGljaygpO1xuXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGRvbmUobnVsbCwgZWxlbWVudCk7XG4gICAgICAgIH0sIGNsaWNrRGVsYXkpXG5cbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gX2ZvY3VzKHZhbHVlLCB0eXBlLCBkb25lKSB7XG4gICBfZmluZFVpLmNhbGwodGhpcywgdmFsdWUsIHR5cGUsIHRydWUsIGZ1bmN0aW9uKGVycm9yLCBlbGVtZW50cyl7XG4gICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgIHJldHVybiBkb25lKGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZXN1bHQgPSBlbGVtZW50c1xuICAgICAgICAgICAgLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBnZXRFbGVtZW50VmFsdWVXZWlnaHQoYSkgPCBnZXRFbGVtZW50VmFsdWVXZWlnaHQoYik7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnNoaWZ0KCk7XG5cbiAgICAgICAgcmVzdWx0LmZvY3VzKCk7XG5cbiAgICAgICAgZG9uZShudWxsLCByZXN1bHQpO1xuICAgfSk7XG59XG5cbmZ1bmN0aW9uIF9jaGFuZ2VWYWx1ZSh2YWx1ZSwgdHlwZSwgdGV4dCwgZG9uZSkge1xuICAgIHZhciBzdGF0ZSA9IHRoaXM7XG5cbiAgICBfZm9jdXMuY2FsbChzdGF0ZSwgdmFsdWUsIHR5cGUsIGZ1bmN0aW9uKGVycm9yLCBlbGVtZW50KSB7XG4gICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgIHJldHVybiBkb25lKGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIF9wcmVzc0tleXMuY2FsbChzdGF0ZSwgdGV4dCwgZnVuY3Rpb24oZXJyb3Ipe1xuICAgICAgICAgICAgaWYoZXJyb3Ipe1xuICAgICAgICAgICAgICAgIHJldHVybiBkb25lKGVycm9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxlbWVudC5ibHVyKCk7XG5cbiAgICAgICAgICAgIHZhciBldmVudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdIVE1MRXZlbnRzJyk7XG5cbiAgICAgICAgICAgIGV2ZW50LmluaXRFdmVudCgnY2hhbmdlJywgZmFsc2UsIHRydWUpO1xuICAgICAgICAgICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcblxuICAgICAgICAgICAgZG9uZShudWxsLCBlbGVtZW50KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIF9nZXRWYWx1ZSh2YWx1ZSwgdHlwZSwgZG9uZSkge1xuICAgIF9mb2N1cy5jYWxsKHRoaXMsIHZhbHVlLCB0eXBlLCBmdW5jdGlvbihlcnJvciwgZWxlbWVudCkge1xuICAgICAgICBpZihlcnJvcil7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShlcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICBkb25lKG51bGwsICd2YWx1ZScgaW4gZWxlbWVudCA/IGVsZW1lbnQudmFsdWUgOiBlbGVtZW50LnRleHRDb250ZW50KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gX2JsdXIoZG9uZSkge1xuICAgIHZhciBlbGVtZW50ID0gdGhpcy5jdXJyZW50Q29udGV4dC5hY3RpdmVFbGVtZW50O1xuICAgIGVsZW1lbnQuYmx1cigpO1xuXG4gICAgZG9uZShudWxsLCBlbGVtZW50KTtcbn1cblxuZnVuY3Rpb24gX3Njcm9sbFRvKHZhbHVlLCB0eXBlLCBkb25lKXtcbiAgICBfZmluZEFsbFVpLmNhbGwodGhpcywgdmFsdWUsIHR5cGUsIGZ1bmN0aW9uKGVycm9yLCBlbGVtZW50cykge1xuICAgICAgICBpZihlcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUoZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHRhcmdldEVsZW1lbnQgPSBlbGVtZW50cy5zaGlmdCgpO1xuXG4gICAgICAgIHNjcm9sbEludG9WaWV3KHRhcmdldEVsZW1lbnQsIHsgdGltZTogNTAgfSwgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGRvbmUobnVsbCwgdGFyZ2V0RWxlbWVudCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBydW5UYXNrcyhzdGF0ZSwgdGFza3MsIGNhbGxiYWNrKSB7XG4gICAgaWYodGFza3MubGVuZ3RoKSB7XG4gICAgICAgIHRhc2tzLnNoaWZ0KCkoZnVuY3Rpb24oZXJyb3IsIHJlc3VsdCkge1xuICAgICAgICAgICAgaWYoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyb3IpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5sYXN0UmVzdWx0ID0gcmVzdWx0O1xuXG4gICAgICAgICAgICAgICAgaWYodGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcnVuVGFza3Moc3RhdGUsIHRhc2tzLCBjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyaXZlVWkoY3VycmVudENvbnRleHQpe1xuICAgIHZhciB0YXNrcyA9IFtdLFxuICAgICAgICBkcml2ZXJGdW5jdGlvbnMgPSB7fSxcbiAgICAgICAgc3RhdGUgPSB7XG4gICAgICAgICAgICBjdXJyZW50Q29udGV4dDogY3VycmVudENvbnRleHQgfHwgZG9jdW1lbnRTY29wZVxuICAgICAgICB9O1xuXG4gICAgZnVuY3Rpb24gYWRkVGFzayh0YXNrKXtcbiAgICAgICAgdGFza3MucHVzaCh0YXNrKTtcblxuICAgICAgICByZXR1cm4gZHJpdmVyRnVuY3Rpb25zO1xuICAgIH1cblxuICAgIGRyaXZlckZ1bmN0aW9ucyA9IHtcbiAgICAgICAgbmF2aWdhdGU6IGZ1bmN0aW9uKGxvY2F0aW9uKXtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKF9uYXZpZ2F0ZS5iaW5kKHN0YXRlLCBsb2NhdGlvbikpO1xuICAgICAgICB9LFxuICAgICAgICBmaW5kVWk6IGZ1bmN0aW9uKHZhbHVlLCB0eXBlKXtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKF9maW5kVWkuYmluZChzdGF0ZSwgdmFsdWUsIHR5cGUpKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0TG9jYXRpb246IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soX2dldExvY2F0aW9uLmJpbmQoc3RhdGUpKTtcbiAgICAgICAgfSxcbiAgICAgICAgZm9jdXM6IGZ1bmN0aW9uKHZhbHVlLCB0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4gYWRkVGFzayhfZm9jdXMuYmluZChzdGF0ZSwgdmFsdWUsIHR5cGUpKTtcbiAgICAgICAgfSxcbiAgICAgICAgYmx1cjogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gYWRkVGFzayhfYmx1ci5iaW5kKHN0YXRlKSk7XG4gICAgICAgIH0sXG4gICAgICAgIGNsaWNrOiBmdW5jdGlvbih2YWx1ZSwgdHlwZSl7XG4gICAgICAgICAgICByZXR1cm4gYWRkVGFzayhleGVjdXRlQ2xpY2suYmluZChzdGF0ZSwgdmFsdWUsIHR5cGUpKTtcbiAgICAgICAgfSxcbiAgICAgICAgcHJlc3NLZXk6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gYWRkVGFzayhfcHJlc3NLZXkuYmluZChzdGF0ZSwgdmFsdWUpKTtcbiAgICAgICAgfSxcbiAgICAgICAgcHJlc3NLZXlzOiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soX3ByZXNzS2V5cy5iaW5kKHN0YXRlLCB2YWx1ZSkpO1xuICAgICAgICB9LFxuICAgICAgICBjaGFuZ2VWYWx1ZTogZnVuY3Rpb24odmFsdWUsIHR5cGUsIHRleHQpIHtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKF9jaGFuZ2VWYWx1ZS5iaW5kKHN0YXRlLCB2YWx1ZSwgdHlwZSwgdGV4dCkpO1xuICAgICAgICB9LFxuICAgICAgICBzZXRWYWx1ZTogZnVuY3Rpb24odmFsdWUsIHR5cGUsIHRleHQpIHtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKF9zZXRWYWx1ZS5iaW5kKHN0YXRlLCB2YWx1ZSwgdHlwZSwgdGV4dCkpO1xuICAgICAgICB9LFxuICAgICAgICBnZXRWYWx1ZTogZnVuY3Rpb24odmFsdWUsIHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKF9nZXRWYWx1ZS5iaW5kKHN0YXRlLCB2YWx1ZSwgdHlwZSkpO1xuICAgICAgICB9LFxuICAgICAgICB3YWl0OiBmdW5jdGlvbih0aW1lKSB7XG4gICAgICAgICAgICBpZighYXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRpbWUgPSBydW5EZWxheTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soX3dhaXQuYmluZChzdGF0ZSwgdGltZSkpO1xuICAgICAgICB9LFxuICAgICAgICBkbzogZnVuY3Rpb24oZHJpdmVyKXtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKGRyaXZlci5nbyk7XG4gICAgICAgIH0sXG4gICAgICAgIGluOiBmdW5jdGlvbih2YWx1ZSwgdHlwZSwgYWRkU3ViVGFza3Mpe1xuICAgICAgICAgICAgcmV0dXJuIGFkZFRhc2soZnVuY3Rpb24oZG9uZSl7XG4gICAgICAgICAgICAgICAgX2ZpbmRVaS5jYWxsKHN0YXRlLCB2YWx1ZSwgdHlwZSwgZnVuY3Rpb24oZXJyb3IsIGVsZW1lbnQpe1xuICAgICAgICAgICAgICAgICAgICBpZihlcnJvcil7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZG9uZShlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB2YXIgbmV3RHJpdmVyID0gZHJpdmVVaShlbGVtZW50KTtcblxuICAgICAgICAgICAgICAgICAgICBhZGRTdWJUYXNrcyhuZXdEcml2ZXIpO1xuXG4gICAgICAgICAgICAgICAgICAgIG5ld0RyaXZlci5nbyhkb25lKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBjaGVjazogZnVuY3Rpb24odGFzayl7XG4gICAgICAgICAgICByZXR1cm4gYWRkVGFzayhmdW5jdGlvbihjYWxsYmFjayl7XG4gICAgICAgICAgICAgICAgdGFzayhzdGF0ZS5sYXN0UmVzdWx0LCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsVG86IGZ1bmN0aW9uKHZhbHVlLCB0eXBlKXtcbiAgICAgICAgICAgIHJldHVybiBhZGRUYXNrKF9zY3JvbGxUby5iaW5kKHN0YXRlLCB2YWx1ZSwgdHlwZSkpO1xuICAgICAgICB9LFxuICAgICAgICBnbzogZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmKCFpbml0aWFsaXNlZCkge1xuICAgICAgICAgICAgICAgIHRocm93KG5ldyBFcnJvcignaW5pdCBtdXN0IGJlY2FsbGVkIGJlZm9yZSBjYWxsaW5nIGdvJykpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZih0YXNrcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0YXNrcy51bnNoaWZ0KF93YWl0LmJpbmQoc3RhdGUsIHJ1bkRlbGF5KSk7XG4gICAgICAgICAgICAgICAgcnVuVGFza3Moc3RhdGUsIHRhc2tzLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBFcnJvcignTm8gdGFza3MgZGVmaW5lZCcpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gZHJpdmVyRnVuY3Rpb25zO1xufVxuXG5kcml2ZVVpLmluaXQgPSBmdW5jdGlvbihzZXR0aW5ncykge1xuICAgIGRvY3VtZW50U2NvcGUgPSBzZXR0aW5ncy5kb2N1bWVudCB8fCBkb2N1bWVudDtcbiAgICB3aW5kb3dTY29wZSA9IHNldHRpbmdzLndpbmRvdyB8fCB3aW5kb3c7XG4gICAgcnVuRGVsYXkgPSBzZXR0aW5ncy5ydW5EZWxheSB8fCAwO1xuICAgIGNsaWNrRGVsYXkgPSBzZXR0aW5ncy5jbGlja0RlbGF5IHx8IDEwMDtcblxuICAgIGluaXRpYWxpc2VkID0gdHJ1ZTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZHJpdmVVaTtcbiIsIi8vQ29weXJpZ2h0IChDKSAyMDEyIEtvcnkgTnVublxyXG5cclxuLy9QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxyXG5cclxuLy9UaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cclxuXHJcbi8vVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXHJcblxyXG4vKlxyXG5cclxuICAgIFRoaXMgY29kZSBpcyBub3QgZm9ybWF0dGVkIGZvciByZWFkYWJpbGl0eSwgYnV0IHJhdGhlciBydW4tc3BlZWQgYW5kIHRvIGFzc2lzdCBjb21waWxlcnMuXHJcblxyXG4gICAgSG93ZXZlciwgdGhlIGNvZGUncyBpbnRlbnRpb24gc2hvdWxkIGJlIHRyYW5zcGFyZW50LlxyXG5cclxuICAgICoqKiBJRSBTVVBQT1JUICoqKlxyXG5cclxuICAgIElmIHlvdSByZXF1aXJlIHRoaXMgbGlicmFyeSB0byB3b3JrIGluIElFNywgYWRkIHRoZSBmb2xsb3dpbmcgYWZ0ZXIgZGVjbGFyaW5nIGNyZWwuXHJcblxyXG4gICAgdmFyIHRlc3REaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcclxuICAgICAgICB0ZXN0TGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsYWJlbCcpO1xyXG5cclxuICAgIHRlc3REaXYuc2V0QXR0cmlidXRlKCdjbGFzcycsICdhJyk7XHJcbiAgICB0ZXN0RGl2WydjbGFzc05hbWUnXSAhPT0gJ2EnID8gY3JlbC5hdHRyTWFwWydjbGFzcyddID0gJ2NsYXNzTmFtZSc6dW5kZWZpbmVkO1xyXG4gICAgdGVzdERpdi5zZXRBdHRyaWJ1dGUoJ25hbWUnLCdhJyk7XHJcbiAgICB0ZXN0RGl2WyduYW1lJ10gIT09ICdhJyA/IGNyZWwuYXR0ck1hcFsnbmFtZSddID0gZnVuY3Rpb24oZWxlbWVudCwgdmFsdWUpe1xyXG4gICAgICAgIGVsZW1lbnQuaWQgPSB2YWx1ZTtcclxuICAgIH06dW5kZWZpbmVkO1xyXG5cclxuXHJcbiAgICB0ZXN0TGFiZWwuc2V0QXR0cmlidXRlKCdmb3InLCAnYScpO1xyXG4gICAgdGVzdExhYmVsWydodG1sRm9yJ10gIT09ICdhJyA/IGNyZWwuYXR0ck1hcFsnZm9yJ10gPSAnaHRtbEZvcic6dW5kZWZpbmVkO1xyXG5cclxuXHJcblxyXG4qL1xyXG5cclxuKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XHJcbiAgICBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XHJcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xyXG4gICAgICAgIGRlZmluZShmYWN0b3J5KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcm9vdC5jcmVsID0gZmFjdG9yeSgpO1xyXG4gICAgfVxyXG59KHRoaXMsIGZ1bmN0aW9uICgpIHtcclxuICAgIHZhciBmbiA9ICdmdW5jdGlvbicsXHJcbiAgICAgICAgb2JqID0gJ29iamVjdCcsXHJcbiAgICAgICAgbm9kZVR5cGUgPSAnbm9kZVR5cGUnLFxyXG4gICAgICAgIHRleHRDb250ZW50ID0gJ3RleHRDb250ZW50JyxcclxuICAgICAgICBzZXRBdHRyaWJ1dGUgPSAnc2V0QXR0cmlidXRlJyxcclxuICAgICAgICBhdHRyTWFwU3RyaW5nID0gJ2F0dHJNYXAnLFxyXG4gICAgICAgIGlzTm9kZVN0cmluZyA9ICdpc05vZGUnLFxyXG4gICAgICAgIGlzRWxlbWVudFN0cmluZyA9ICdpc0VsZW1lbnQnLFxyXG4gICAgICAgIGQgPSB0eXBlb2YgZG9jdW1lbnQgPT09IG9iaiA/IGRvY3VtZW50IDoge30sXHJcbiAgICAgICAgaXNUeXBlID0gZnVuY3Rpb24oYSwgdHlwZSl7XHJcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgYSA9PT0gdHlwZTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGlzTm9kZSA9IHR5cGVvZiBOb2RlID09PSBmbiA/IGZ1bmN0aW9uIChvYmplY3QpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIE5vZGU7XHJcbiAgICAgICAgfSA6XHJcbiAgICAgICAgLy8gaW4gSUUgPD0gOCBOb2RlIGlzIGFuIG9iamVjdCwgb2J2aW91c2x5Li5cclxuICAgICAgICBmdW5jdGlvbihvYmplY3Qpe1xyXG4gICAgICAgICAgICByZXR1cm4gb2JqZWN0ICYmXHJcbiAgICAgICAgICAgICAgICBpc1R5cGUob2JqZWN0LCBvYmopICYmXHJcbiAgICAgICAgICAgICAgICAobm9kZVR5cGUgaW4gb2JqZWN0KSAmJlxyXG4gICAgICAgICAgICAgICAgaXNUeXBlKG9iamVjdC5vd25lckRvY3VtZW50LG9iaik7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBpc0VsZW1lbnQgPSBmdW5jdGlvbiAob2JqZWN0KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBjcmVsW2lzTm9kZVN0cmluZ10ob2JqZWN0KSAmJiBvYmplY3Rbbm9kZVR5cGVdID09PSAxO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaXNBcnJheSA9IGZ1bmN0aW9uKGEpe1xyXG4gICAgICAgICAgICByZXR1cm4gYSBpbnN0YW5jZW9mIEFycmF5O1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYXBwZW5kQ2hpbGQgPSBmdW5jdGlvbihlbGVtZW50LCBjaGlsZCkge1xyXG4gICAgICAgICAgICBpZiAoaXNBcnJheShjaGlsZCkpIHtcclxuICAgICAgICAgICAgICAgIGNoaWxkLm1hcChmdW5jdGlvbihzdWJDaGlsZCl7XHJcbiAgICAgICAgICAgICAgICAgICAgYXBwZW5kQ2hpbGQoZWxlbWVudCwgc3ViQ2hpbGQpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYoIWNyZWxbaXNOb2RlU3RyaW5nXShjaGlsZCkpe1xyXG4gICAgICAgICAgICAgICAgY2hpbGQgPSBkLmNyZWF0ZVRleHROb2RlKGNoaWxkKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbGVtZW50LmFwcGVuZENoaWxkKGNoaWxkKTtcclxuICAgICAgICB9O1xyXG5cclxuXHJcbiAgICBmdW5jdGlvbiBjcmVsKCl7XHJcbiAgICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHMsIC8vTm90ZTogYXNzaWduZWQgdG8gYSB2YXJpYWJsZSB0byBhc3Npc3QgY29tcGlsZXJzLiBTYXZlcyBhYm91dCA0MCBieXRlcyBpbiBjbG9zdXJlIGNvbXBpbGVyLiBIYXMgbmVnbGlnYWJsZSBlZmZlY3Qgb24gcGVyZm9ybWFuY2UuXHJcbiAgICAgICAgICAgIGVsZW1lbnQgPSBhcmdzWzBdLFxyXG4gICAgICAgICAgICBjaGlsZCxcclxuICAgICAgICAgICAgc2V0dGluZ3MgPSBhcmdzWzFdLFxyXG4gICAgICAgICAgICBjaGlsZEluZGV4ID0gMixcclxuICAgICAgICAgICAgYXJndW1lbnRzTGVuZ3RoID0gYXJncy5sZW5ndGgsXHJcbiAgICAgICAgICAgIGF0dHJpYnV0ZU1hcCA9IGNyZWxbYXR0ck1hcFN0cmluZ107XHJcblxyXG4gICAgICAgIGVsZW1lbnQgPSBjcmVsW2lzRWxlbWVudFN0cmluZ10oZWxlbWVudCkgPyBlbGVtZW50IDogZC5jcmVhdGVFbGVtZW50KGVsZW1lbnQpO1xyXG4gICAgICAgIC8vIHNob3J0Y3V0XHJcbiAgICAgICAgaWYoYXJndW1lbnRzTGVuZ3RoID09PSAxKXtcclxuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZighaXNUeXBlKHNldHRpbmdzLG9iaikgfHwgY3JlbFtpc05vZGVTdHJpbmddKHNldHRpbmdzKSB8fCBpc0FycmF5KHNldHRpbmdzKSkge1xyXG4gICAgICAgICAgICAtLWNoaWxkSW5kZXg7XHJcbiAgICAgICAgICAgIHNldHRpbmdzID0gbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIHNob3J0Y3V0IGlmIHRoZXJlIGlzIG9ubHkgb25lIGNoaWxkIHRoYXQgaXMgYSBzdHJpbmdcclxuICAgICAgICBpZigoYXJndW1lbnRzTGVuZ3RoIC0gY2hpbGRJbmRleCkgPT09IDEgJiYgaXNUeXBlKGFyZ3NbY2hpbGRJbmRleF0sICdzdHJpbmcnKSAmJiBlbGVtZW50W3RleHRDb250ZW50XSAhPT0gdW5kZWZpbmVkKXtcclxuICAgICAgICAgICAgZWxlbWVudFt0ZXh0Q29udGVudF0gPSBhcmdzW2NoaWxkSW5kZXhdO1xyXG4gICAgICAgIH1lbHNle1xyXG4gICAgICAgICAgICBmb3IoOyBjaGlsZEluZGV4IDwgYXJndW1lbnRzTGVuZ3RoOyArK2NoaWxkSW5kZXgpe1xyXG4gICAgICAgICAgICAgICAgY2hpbGQgPSBhcmdzW2NoaWxkSW5kZXhdO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmKGNoaWxkID09IG51bGwpe1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGlmIChpc0FycmF5KGNoaWxkKSkge1xyXG4gICAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGkgPCBjaGlsZC5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFwcGVuZENoaWxkKGVsZW1lbnQsIGNoaWxkW2ldKTtcclxuICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgYXBwZW5kQ2hpbGQoZWxlbWVudCwgY2hpbGQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IodmFyIGtleSBpbiBzZXR0aW5ncyl7XHJcbiAgICAgICAgICAgIGlmKCFhdHRyaWJ1dGVNYXBba2V5XSl7XHJcbiAgICAgICAgICAgICAgICBpZihpc1R5cGUoc2V0dGluZ3Nba2V5XSxmbikpe1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRba2V5XSA9IHNldHRpbmdzW2tleV07XHJcbiAgICAgICAgICAgICAgICB9ZWxzZXtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50W3NldEF0dHJpYnV0ZV0oa2V5LCBzZXR0aW5nc1trZXldKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfWVsc2V7XHJcbiAgICAgICAgICAgICAgICB2YXIgYXR0ciA9IGF0dHJpYnV0ZU1hcFtrZXldO1xyXG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIGF0dHIgPT09IGZuKXtcclxuICAgICAgICAgICAgICAgICAgICBhdHRyKGVsZW1lbnQsIHNldHRpbmdzW2tleV0pO1xyXG4gICAgICAgICAgICAgICAgfWVsc2V7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFtzZXRBdHRyaWJ1dGVdKGF0dHIsIHNldHRpbmdzW2tleV0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gZWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBVc2VkIGZvciBtYXBwaW5nIG9uZSBraW5kIG9mIGF0dHJpYnV0ZSB0byB0aGUgc3VwcG9ydGVkIHZlcnNpb24gb2YgdGhhdCBpbiBiYWQgYnJvd3NlcnMuXHJcbiAgICBjcmVsW2F0dHJNYXBTdHJpbmddID0ge307XHJcblxyXG4gICAgY3JlbFtpc0VsZW1lbnRTdHJpbmddID0gaXNFbGVtZW50O1xyXG5cclxuICAgIGNyZWxbaXNOb2RlU3RyaW5nXSA9IGlzTm9kZTtcclxuXHJcbiAgICBpZih0eXBlb2YgUHJveHkgIT09ICd1bmRlZmluZWQnKXtcclxuICAgICAgICBjcmVsLnByb3h5ID0gbmV3IFByb3h5KGNyZWwsIHtcclxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbih0YXJnZXQsIGtleSl7XHJcbiAgICAgICAgICAgICAgICAhKGtleSBpbiBjcmVsKSAmJiAoY3JlbFtrZXldID0gY3JlbC5iaW5kKG51bGwsIGtleSkpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNyZWxba2V5XTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjcmVsO1xyXG59KSk7XHJcbiIsImZ1bmN0aW9uIGZpbmRDaGlsZHNFeHBvc2VkQm94KGNoaWxkKXtcbiAgICB2YXIgb3JpZ2luYWxCb3VuZHMgPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcbiAgICAgICAgcGFyZW50ID0gY2hpbGQucGFyZW50Tm9kZSxcbiAgICAgICAgcGFyZW50T3ZlcmZsb3csXG4gICAgICAgIHBhcmVudEJvdW5kcyxcbiAgICAgICAgYm91bmRzO1xuXG4gICAgLy8gQ29udmVydCBib3VuZHMgb2JqZWN0IHRvIHBvam8uXG4gICAgYm91bmRzID0ge1xuICAgICAgICBvcmlnaW5hbDogb3JpZ2luYWxCb3VuZHMsXG4gICAgICAgIGhlaWdodDogb3JpZ2luYWxCb3VuZHMuaGVpZ2h0LFxuICAgICAgICB3aWR0aDogb3JpZ2luYWxCb3VuZHMud2lkdGgsXG4gICAgICAgIGxlZnQ6IG9yaWdpbmFsQm91bmRzLmxlZnQsXG4gICAgICAgIHRvcDogb3JpZ2luYWxCb3VuZHMudG9wLFxuICAgICAgICByaWdodDogb3JpZ2luYWxCb3VuZHMucmlnaHQsXG4gICAgICAgIGJvdHRvbTogb3JpZ2luYWxCb3VuZHMuYm90dG9tXG4gICAgfTtcblxuICAgIHdoaWxlKHBhcmVudCl7XG4gICAgICAgIGlmKHBhcmVudCA9PT0gZG9jdW1lbnQpe1xuICAgICAgICAgICAgcGFyZW50Qm91bmRzID0ge1xuICAgICAgICAgICAgICAgIHRvcDogMCxcbiAgICAgICAgICAgICAgICBsZWZ0OiAwLFxuICAgICAgICAgICAgICAgIGJvdHRvbTogd2luZG93LmlubmVySGVpZ2h0LFxuICAgICAgICAgICAgICAgIHJpZ2h0OiB3aW5kb3cuaW5uZXJXaWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHdpbmRvdy5pbm5lckhlaWdodCxcbiAgICAgICAgICAgICAgICB3aWR0aDogd2luZG93LmlubmVyV2lkdGhcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgdmFyIHBhcmVudE92ZXJmbG93ID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUocGFyZW50KS5vdmVyZmxvdztcbiAgICAgICAgICAgIGlmKHBhcmVudE92ZXJmbG93ID09PSAnJyB8fCBwYXJlbnRPdmVyZmxvdyA9PT0gJ3Zpc2libGUnKXtcbiAgICAgICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50Tm9kZTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBhcmVudEJvdW5kcyA9IHBhcmVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKHBhcmVudEJvdW5kcy50b3AgPiBib3VuZHMudG9wKXtcbiAgICAgICAgICAgIGJvdW5kcy5oZWlnaHQgPSBib3VuZHMuaGVpZ2h0IC0gKHBhcmVudEJvdW5kcy50b3AgLSBib3VuZHMudG9wKTtcbiAgICAgICAgICAgIGJvdW5kcy50b3AgPSBwYXJlbnRCb3VuZHMudG9wO1xuICAgICAgICB9XG4gICAgICAgIGlmKHBhcmVudEJvdW5kcy5sZWZ0ID4gYm91bmRzLmxlZnQpe1xuICAgICAgICAgICAgYm91bmRzLndpZHRoID0gYm91bmRzLndpZHRoIC0gKHBhcmVudEJvdW5kcy5sZWZ0IC0gYm91bmRzLmxlZnQpO1xuICAgICAgICAgICAgYm91bmRzLmxlZnQgPSBwYXJlbnRCb3VuZHMubGVmdDtcbiAgICAgICAgfVxuICAgICAgICBpZihwYXJlbnRCb3VuZHMucmlnaHQgPCBib3VuZHMucmlnaHQpe1xuICAgICAgICAgICAgYm91bmRzLndpZHRoID0gYm91bmRzLndpZHRoIC0gKGJvdW5kcy5yaWdodCAtIHBhcmVudEJvdW5kcy5yaWdodCk7XG4gICAgICAgICAgICBib3VuZHMucmlnaHQgPSBwYXJlbnRCb3VuZHMucmlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYocGFyZW50Qm91bmRzLmJvdHRvbSA8IGJvdW5kcy5ib3R0b20pe1xuICAgICAgICAgICAgYm91bmRzLmhlaWdodCA9IGJvdW5kcy5oZWlnaHQgLSAoYm91bmRzLmJvdHRvbSAtIHBhcmVudEJvdW5kcy5ib3R0b20pO1xuICAgICAgICAgICAgYm91bmRzLmJvdHRvbSA9IHBhcmVudEJvdW5kcy5ib3R0b207XG4gICAgICAgIH1cblxuICAgICAgICBpZihib3VuZHMud2lkdGggPD0gMCB8fCBib3VuZHMuaGVpZ2h0IDw9IDApe1xuICAgICAgICAgICAgYm91bmRzLmhpZGRlbiA9IHRydWU7XG4gICAgICAgICAgICBib3VuZHMud2lkdGggPSBNYXRoLm1heChib3VuZHMud2lkdGgsIDApO1xuICAgICAgICAgICAgYm91bmRzLmhlaWdodCA9IE1hdGgubWF4KGJvdW5kcy5oZWlnaHQsIDApO1xuICAgICAgICAgICAgcmV0dXJuIGJvdW5kcztcbiAgICAgICAgfVxuXG4gICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnROb2RlO1xuICAgIH1cblxuICAgIHJldHVybiBib3VuZHM7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZmluZENoaWxkc0V4cG9zZWRCb3g7IiwidmFyIGFiYm90dCA9IHJlcXVpcmUoJ2FiYm90dCcpO1xuXG52YXIgZGVmZXIgPSBnbG9iYWwucHJvY2VzcyAmJiBnbG9iYWwucHJvY2Vzcy5uZXh0VGljayB8fCBnbG9iYWwuc2V0SW1tZWRpYXRlIHx8IGdsb2JhbC5zZXRUaW1lb3V0O1xuXG5mdW5jdGlvbiBpc1JpZ2h0byh4KXtcbiAgICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgKHguX19yZXNvbHZlX18gPT09IHggfHwgeC5yZXNvbHZlID09PSB4KTtcbn1cblxuZnVuY3Rpb24gaXNUaGVuYWJsZSh4KXtcbiAgICByZXR1cm4geCAmJiB0eXBlb2YgeC50aGVuID09PSAnZnVuY3Rpb24nICYmICFpc1JpZ2h0byh4KTtcbn1cblxuZnVuY3Rpb24gaXNSZXNvbHZhYmxlKHgpe1xuICAgIHJldHVybiBpc1JpZ2h0byh4KSB8fCBpc1RoZW5hYmxlKHgpO1xufVxuXG5mdW5jdGlvbiBpc1Rha2UoeCl7XG4gICAgcmV0dXJuIHggJiYgdHlwZW9mIHggPT09ICdvYmplY3QnICYmICdfX3Rha2VfXycgaW4geDtcbn1cblxudmFyIHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwuYmluZChBcnJheS5wcm90b3R5cGUuc2xpY2UpO1xuXG5mdW5jdGlvbiBnZXRDYWxsTGluZShzdGFjayl7XG4gICAgdmFyIGluZGV4ID0gMCxcbiAgICAgICAgbGluZXMgPSBzdGFjay5zcGxpdCgnXFxuJyk7XG5cbiAgICB3aGlsZShsaW5lc1srK2luZGV4XSAmJiBsaW5lc1tpbmRleF0ubWF0Y2goL3JpZ2h0b1xcL2luZGV4XFwuanMvKSl7fVxuXG4gICAgdmFyIG1hdGNoID0gbGluZXNbaW5kZXhdICYmIGxpbmVzW2luZGV4XS5tYXRjaCgvYXQgKC4qKS8pO1xuXG4gICAgcmV0dXJuIG1hdGNoID8gbWF0Y2hbMV0gOiAnIC0gTm8gdHJhY2UgLSAnO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlRGVwZW5kZW5jeSh0YXNrLCBkb25lKXtcbiAgICBpZihpc1RoZW5hYmxlKHRhc2spKXtcbiAgICAgICAgdGFzayA9IHJpZ2h0byhhYmJvdHQodGFzaykpO1xuICAgIH1cblxuICAgIGlmKGlzUmlnaHRvKHRhc2spKXtcbiAgICAgICAgcmV0dXJuIHRhc2soZnVuY3Rpb24oZXJyb3Ipe1xuICAgICAgICAgICAgdmFyIHJlc3VsdHMgPSBzbGljZShhcmd1bWVudHMsIDEsIDIpO1xuXG4gICAgICAgICAgICBpZighcmVzdWx0cy5sZW5ndGgpe1xuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCh1bmRlZmluZWQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkb25lKGVycm9yLCByZXN1bHRzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGFrZSh0YXJnZXRUYXNrKXtcbiAgICAgICAgdmFyIGtleXMgPSBzbGljZShhcmd1bWVudHMsIDEpO1xuICAgICAgICByZXR1cm4gdGFyZ2V0VGFzayhmdW5jdGlvbihlcnJvcil7XG4gICAgICAgICAgICB2YXIgYXJncyA9IHNsaWNlKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICBkb25lKGVycm9yLCBrZXlzLm1hcChmdW5jdGlvbihrZXkpe1xuICAgICAgICAgICAgICAgIHJldHVybiBhcmdzW2tleV07XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmKFxuICAgICAgICByaWdodG8uX2RlYnVnICYmXG4gICAgICAgIHJpZ2h0by5fd2Fybk9uVW5zdXBwb3J0ZWQgJiZcbiAgICAgICAgQXJyYXkuaXNBcnJheSh0YXNrKSAmJlxuICAgICAgICBpc1JpZ2h0byh0YXNrWzBdKSAmJlxuICAgICAgICAhaXNSaWdodG8odGFza1sxXSlcbiAgICApe1xuXG4gICAgICAgIGNvbnNvbGUud2FybignXFx1MDAxYlszM21Qb3NzaWJsZSB1bnN1cHBvcnRlZCB0YWtlL2lnbm9yZSBzeW50YXggZGV0ZWN0ZWQ6XFx1MDAxYlszOW1cXG4nICsgZ2V0Q2FsbExpbmUodGhpcy5fc3RhY2spKTtcbiAgICB9XG5cbiAgICBpZihpc1Rha2UodGFzaykpe1xuICAgICAgICByZXR1cm4gdGFrZS5hcHBseShudWxsLCB0YXNrLl9fdGFrZV9fKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZG9uZShudWxsLCBbdGFza10pO1xufVxuXG5mdW5jdGlvbiB0cmFjZUdldChpbnN0YW5jZSwgcmVzdWx0KXtcbiAgICBpZihyaWdodG8uX2RlYnVnICYmICEodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcgfHwgdHlwZW9mIHJlc3VsdCA9PT0gJ2Z1bmN0aW9uJykpe1xuICAgICAgICB2YXIgbGluZSA9IGdldENhbGxMaW5lKGluc3RhbmNlLl9zdGFjayk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUmVzdWx0IG9mIHJpZ2h0byB3YXMgbm90IGFuIGluc3RhbmNlIGF0OiBcXG4nICsgbGluZSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXQoZm4pe1xuICAgIHZhciBpbnN0YW5jZSA9IHRoaXM7XG4gICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbihyZXN1bHQsIGZuLCBkb25lKXtcbiAgICAgICAgaWYodHlwZW9mIGZuID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgZm4gPT09ICdudW1iZXInKXtcbiAgICAgICAgICAgIHRyYWNlR2V0KGluc3RhbmNlLCByZXN1bHQpO1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUobnVsbCwgcmVzdWx0W2ZuXSk7XG4gICAgICAgIH1cblxuICAgICAgICByaWdodG8uZnJvbShmbihyZXN1bHQpKShkb25lKTtcbiAgICB9LCB0aGlzLCBmbik7XG59XG5cbnZhciBub09wID0gZnVuY3Rpb24oKXt9O1xuXG5mdW5jdGlvbiBwcm94eShpbnN0YW5jZSl7XG4gICAgaW5zdGFuY2UuXyA9IG5ldyBQcm94eShpbnN0YW5jZSwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uKHRhcmdldCwga2V5KXtcbiAgICAgICAgICAgIGlmKGtleSA9PT0gJ19fcmVzb2x2ZV9fJyl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGluc3RhbmNlLl87XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKGluc3RhbmNlW2tleV0gfHwga2V5IGluIGluc3RhbmNlIHx8IGtleSA9PT0gJ2luc3BlY3QnIHx8IHR5cGVvZiBrZXkgPT09ICdzeW1ib2wnKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gaW5zdGFuY2Vba2V5XTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYocmlnaHRvLl9kZWJ1ZyAmJiBrZXkuY2hhckF0KDApID09PSAnXycpe1xuICAgICAgICAgICAgICAgIHJldHVybiBpbnN0YW5jZVtrZXldO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcHJveHkocmlnaHRvLnN5bmMoZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAgICAgICAgICAgICB0cmFjZUdldChpbnN0YW5jZSwgcmVzdWx0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0W2tleV07XG4gICAgICAgICAgICB9LCBpbnN0YW5jZSkpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgaW5zdGFuY2UuX19yZXNvbHZlX18gPSBpbnN0YW5jZS5fO1xuICAgIHJldHVybiBpbnN0YW5jZS5fO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlSXRlcmF0b3IoZm4pe1xuICAgIHJldHVybiBmdW5jdGlvbigpe1xuICAgICAgICB2YXIgYXJncyA9IHNsaWNlKGFyZ3VtZW50cyksXG4gICAgICAgICAgICBjYWxsYmFjayA9IGFyZ3MucG9wKCksXG4gICAgICAgICAgICBlcnJvcmVkLFxuICAgICAgICAgICAgbGFzdFZhbHVlO1xuXG4gICAgICAgIGZ1bmN0aW9uIHJlamVjdChlcnJvcil7XG4gICAgICAgICAgICBpZihlcnJvcmVkKXtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlcnJvcmVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBnZW5lcmF0b3IgPSBmbi5hcHBseShudWxsLCBhcmdzLmNvbmNhdChyZWplY3QpKTtcblxuICAgICAgICBmdW5jdGlvbiBydW4oKXtcbiAgICAgICAgICAgIGlmKGVycm9yZWQpe1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBuZXh0ID0gZ2VuZXJhdG9yLm5leHQobGFzdFZhbHVlKTtcbiAgICAgICAgICAgIGlmKG5leHQuZG9uZSl7XG4gICAgICAgICAgICAgICAgaWYoZXJyb3JlZCl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwsIG5leHQudmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYoaXNSZXNvbHZhYmxlKG5leHQudmFsdWUpKXtcbiAgICAgICAgICAgICAgICByaWdodG8uc3luYyhmdW5jdGlvbih2YWx1ZSl7XG4gICAgICAgICAgICAgICAgICAgIGxhc3RWYWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBydW4oKTtcbiAgICAgICAgICAgICAgICB9LCBuZXh0LnZhbHVlKShmdW5jdGlvbihlcnJvcil7XG4gICAgICAgICAgICAgICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsYXN0VmFsdWUgPSBuZXh0LnZhbHVlO1xuICAgICAgICAgICAgcnVuKCk7XG4gICAgICAgIH1cblxuICAgICAgICBydW4oKTtcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBhZGRUcmFjaW5nKHJlc29sdmUsIGZuLCBhcmdzKXtcblxuICAgIHZhciBhcmdNYXRjaCA9IGZuLnRvU3RyaW5nKCkubWF0Y2goL15bXFx3XFxzXSo/XFwoKCg/OlxcdytbLFxcc10qPykqKVxcKS8pLFxuICAgICAgICBhcmdOYW1lcyA9IGFyZ01hdGNoID8gYXJnTWF0Y2hbMV0uc3BsaXQoL1ssXFxzXSsvZykgOiBbXTtcblxuICAgIHJlc29sdmUuX3N0YWNrID0gbmV3IEVycm9yKCkuc3RhY2s7XG4gICAgcmVzb2x2ZS5fdHJhY2UgPSBmdW5jdGlvbih0YWJzKXtcbiAgICAgICAgdmFyIGZpcnN0TGluZSA9IGdldENhbGxMaW5lKHJlc29sdmUuX3N0YWNrKTtcblxuICAgICAgICBpZihyZXNvbHZlLl9lcnJvcil7XG4gICAgICAgICAgICBmaXJzdExpbmUgPSAnXFx1MDAxYlszMW0nICsgZmlyc3RMaW5lICsgJyA8LSBFUlJPUiBTT1VSQ0UnICsgICdcXHUwMDFiWzM5bSc7XG4gICAgICAgIH1cblxuICAgICAgICB0YWJzID0gdGFicyB8fCAwO1xuICAgICAgICB2YXIgc3BhY2luZyA9ICcgICAgJztcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IHRhYnM7IGkgKyspe1xuICAgICAgICAgICAgc3BhY2luZyA9IHNwYWNpbmcgKyAnICAgICc7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFyZ3MubWFwKGZ1bmN0aW9uKGFyZywgaW5kZXgpe1xuICAgICAgICAgICAgcmV0dXJuIFthcmcsIGFyZ05hbWVzW2luZGV4XSB8fCBpbmRleF07XG4gICAgICAgIH0pLnJlZHVjZShmdW5jdGlvbihyZXN1bHRzLCBhcmdJbmZvKXtcbiAgICAgICAgICAgIHZhciBhcmcgPSBhcmdJbmZvWzBdLFxuICAgICAgICAgICAgICAgIGFyZ05hbWUgPSBhcmdJbmZvWzFdO1xuXG4gICAgICAgICAgICBpZihpc1Rha2UoYXJnKSl7XG4gICAgICAgICAgICAgICAgYXJnID0gYXJnLl9fdGFrZV9fWzBdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihpc1JpZ2h0byhhcmcpKXtcbiAgICAgICAgICAgICAgICB2YXIgbGluZSA9IHNwYWNpbmcgKyAnLSBhcmd1bWVudCBcIicgKyBhcmdOYW1lICsgJ1wiIGZyb20gJztcblxuXG4gICAgICAgICAgICAgICAgaWYoIWFyZy5fdHJhY2Upe1xuICAgICAgICAgICAgICAgICAgICBsaW5lID0gbGluZSArICdUcmFjaW5nIHdhcyBub3QgZW5hYmxlZCBmb3IgdGhpcyByaWdodG8gaW5zdGFuY2UuJztcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgbGluZSA9IGxpbmUgKyBhcmcuX3RyYWNlKHRhYnMgKyAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKGxpbmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgfSwgW2ZpcnN0TGluZV0pXG4gICAgICAgIC5qb2luKCdcXG4nKTtcbiAgICB9O1xufVxuXG5mdW5jdGlvbiB0YXNrQ29tcGxldGUoZXJyb3Ipe1xuICAgIHZhciBkb25lID0gdGhpc1swXSxcbiAgICAgICAgY29udGV4dCA9IHRoaXNbMV0sXG4gICAgICAgIGNhbGxiYWNrcyA9IGNvbnRleHQuY2FsbGJhY2tzO1xuXG4gICAgaWYoZXJyb3IgJiYgcmlnaHRvLl9kZWJ1Zyl7XG4gICAgICAgIGNvbnRleHQucmVzb2x2ZS5fZXJyb3IgPSBlcnJvcjtcbiAgICB9XG5cbiAgICB2YXIgcmVzdWx0cyA9IGFyZ3VtZW50cztcblxuICAgIGRvbmUocmVzdWx0cyk7XG5cbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgZGVmZXIoY2FsbGJhY2tzW2ldLmFwcGx5LmJpbmQoY2FsbGJhY2tzW2ldLCBudWxsLCByZXN1bHRzKSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBlcnJvck91dChlcnJvciwgY2FsbGJhY2spe1xuICAgIGlmKGVycm9yICYmIHJpZ2h0by5fZGVidWcpe1xuICAgICAgICBpZihyaWdodG8uX2F1dG90cmFjZU9uRXJyb3IgfHwgdGhpcy5yZXNvbHZlLl90cmFjZU9uRXJyb3Ipe1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0RlcGVuZGVuY3kgZXJyb3IgZXhlY3V0aW5nICcgKyB0aGlzLmZuLm5hbWUgKyAnICcgKyB0aGlzLnJlc29sdmUuX3RyYWNlKCkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY2FsbGJhY2soZXJyb3IpO1xufVxuXG5mdW5jdGlvbiBkZWJ1Z1Jlc29sdmUoY29udGV4dCwgYXJncywgY29tcGxldGUpe1xuICAgIHRyeXtcbiAgICAgICAgYXJncy5wdXNoKGNvbXBsZXRlKTtcbiAgICAgICAgY29udGV4dC5mbi5hcHBseShudWxsLCBhcmdzKTtcbiAgICB9Y2F0Y2goZXJyb3Ipe1xuICAgICAgICBjb25zb2xlLmxvZygnVGFzayBleGNlcHRpb24gZXhlY3V0aW5nICcgKyBjb250ZXh0LmZuLm5hbWUgKyAnIGZyb20gJyArIGNvbnRleHQucmVzb2x2ZS5fdHJhY2UoKSk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVdpdGhEZXBlbmRlbmNpZXMoZG9uZSwgZXJyb3IsIGFyZ1Jlc3VsdHMpe1xuICAgIHZhciBjb250ZXh0ID0gdGhpcztcblxuICAgIGlmKGVycm9yKXtcbiAgICAgICAgdmFyIGJvdW5kRXJyb3JPdXQgPSBlcnJvck91dC5iaW5kKGNvbnRleHQsIGVycm9yKTtcblxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY29udGV4dC5jYWxsYmFja3MubGVuZ3RoOyBpKyspe1xuICAgICAgICAgICAgYm91bmRFcnJvck91dChjb250ZXh0LmNhbGxiYWNrc1tpXSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGFyZ3MgPSBbXS5jb25jYXQuYXBwbHkoW10sIGFyZ1Jlc3VsdHMpLFxuICAgICAgICBjb21wbGV0ZSA9IHRhc2tDb21wbGV0ZS5iaW5kKFtkb25lLCBjb250ZXh0XSk7XG5cbiAgICBpZihyaWdodG8uX2RlYnVnKXtcbiAgICAgICAgcmV0dXJuIGRlYnVnUmVzb2x2ZShjb250ZXh0LCBhcmdzLCBjb21wbGV0ZSk7XG4gICAgfVxuXG4gICAgLy8gU2xpZ2h0IHBlcmYgYnVtcCBieSBhdm9pZGluZyBhcHBseSBmb3Igc2ltcGxlIGNhc2VzLlxuICAgIHN3aXRjaChhcmdzLmxlbmd0aCl7XG4gICAgICAgIGNhc2UgMDogY29udGV4dC5mbihjb21wbGV0ZSk7IGJyZWFrO1xuICAgICAgICBjYXNlIDE6IGNvbnRleHQuZm4oYXJnc1swXSwgY29tcGxldGUpOyBicmVhaztcbiAgICAgICAgY2FzZSAyOiBjb250ZXh0LmZuKGFyZ3NbMF0sIGFyZ3NbMV0sIGNvbXBsZXRlKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgMzogY29udGV4dC5mbihhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBjb21wbGV0ZSk7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgYXJncy5wdXNoKGNvbXBsZXRlKTtcbiAgICAgICAgICAgIGNvbnRleHQuZm4uYXBwbHkobnVsbCwgYXJncyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZXNvbHZlRGVwZW5kZW5jaWVzKGFyZ3MsIGNvbXBsZXRlLCByZXNvbHZlRGVwZW5kZW5jeSl7XG4gICAgdmFyIHJlc3VsdHMgPSBbXSxcbiAgICAgICAgZG9uZSA9IDAsXG4gICAgICAgIGhhc0Vycm9yZWQ7XG5cbiAgICBpZighYXJncy5sZW5ndGgpe1xuICAgICAgICBjb21wbGV0ZShudWxsLCBbXSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVwZW5kZW5jeVJlc29sdmVkKGluZGV4LCBlcnJvciwgcmVzdWx0KXtcbiAgICAgICAgaWYoaGFzRXJyb3JlZCl7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZihlcnJvcil7XG4gICAgICAgICAgICBoYXNFcnJvcmVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiBjb21wbGV0ZShlcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHRzW2luZGV4XSA9IHJlc3VsdDtcblxuICAgICAgICBpZigrK2RvbmUgPT09IGFyZ3MubGVuZ3RoKXtcbiAgICAgICAgICAgIGNvbXBsZXRlKG51bGwsIHJlc3VsdHMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspe1xuICAgICAgICByZXNvbHZlRGVwZW5kZW5jeShhcmdzW2ldLCBkZXBlbmRlbmN5UmVzb2x2ZWQuYmluZChudWxsLCBpKSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZXNvbHZlcihjb21wbGV0ZSl7XG4gICAgdmFyIGNvbnRleHQgPSB0aGlzO1xuXG4gICAgLy8gTm8gY2FsbGJhY2s/IEp1c3QgcnVuIHRoZSB0YXNrLlxuICAgIGlmKCFhcmd1bWVudHMubGVuZ3RoKXtcbiAgICAgICAgY29tcGxldGUgPSBub09wO1xuICAgIH1cblxuICAgIGlmKGlzUmlnaHRvKGNvbXBsZXRlKSl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigncmlnaHRvIGluc3RhbmNlIHBhc3NlZCBpbnRvIGEgcmlnaHRvIGluc3RhbmNlIGluc3RlYWQgb2YgYSBjYWxsYmFjaycpO1xuICAgIH1cblxuICAgIGlmKHR5cGVvZiBjb21wbGV0ZSAhPT0gJ2Z1bmN0aW9uJyl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gICAgfVxuXG4gICAgaWYoY29udGV4dC5yZXN1bHRzKXtcbiAgICAgICAgcmV0dXJuIGNvbXBsZXRlLmFwcGx5KG51bGwsIGNvbnRleHQucmVzdWx0cyk7XG4gICAgfVxuXG4gICAgY29udGV4dC5jYWxsYmFja3MucHVzaChjb21wbGV0ZSk7XG5cbiAgICBpZihjb250ZXh0LnN0YXJ0ZWQrKyl7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgcmVzb2x2ZWQgPSByZXNvbHZlV2l0aERlcGVuZGVuY2llcy5iaW5kKGNvbnRleHQsIGZ1bmN0aW9uKHJlc29sdmVkUmVzdWx0cyl7XG4gICAgICAgICAgICBpZihyaWdodG8uX2RlYnVnKXtcbiAgICAgICAgICAgICAgICBpZihyaWdodG8uX2F1dG90cmFjZSB8fCBjb250ZXh0LnJlc29sdmUuX3RyYWNlT25FeGVjdXRlKXtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0V4ZWN1dGluZyAnICsgY29udGV4dC5mbi5uYW1lICsgJyAnICsgY29udGV4dC5yZXNvbHZlLl90cmFjZSgpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnRleHQucmVzdWx0cyA9IHJlc29sdmVkUmVzdWx0cztcbiAgICAgICAgfSk7XG5cbiAgICBkZWZlcihyZXNvbHZlRGVwZW5kZW5jaWVzLmJpbmQobnVsbCwgY29udGV4dC5hcmdzLCByZXNvbHZlZCwgcmVzb2x2ZURlcGVuZGVuY3kuYmluZChjb250ZXh0LnJlc29sdmUpKSk7XG5cbiAgICByZXR1cm4gY29udGV4dC5yZXNvbHZlO1xufTtcblxuZnVuY3Rpb24gcmlnaHRvKCl7XG4gICAgdmFyIGFyZ3MgPSBzbGljZShhcmd1bWVudHMpLFxuICAgICAgICBmbiA9IGFyZ3Muc2hpZnQoKTtcblxuICAgIGlmKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJyl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gdGFzayBmdW5jdGlvbiBwYXNzZWQgdG8gcmlnaHRvJyk7XG4gICAgfVxuXG4gICAgaWYoaXNSaWdodG8oZm4pICYmIGFyZ3MubGVuZ3RoID4gMCl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUmlnaHRvIHRhc2sgcGFzc2VkIGFzIHRhcmdldCB0YXNrIHRvIHJpZ2h0bygpJyk7XG4gICAgfVxuXG4gICAgdmFyIHJlc29sdmVyQ29udGV4dCA9IHtcbiAgICAgICAgICAgIGZuOiBmbixcbiAgICAgICAgICAgIGNhbGxiYWNrczogW10sXG4gICAgICAgICAgICBhcmdzOiBhcmdzLFxuICAgICAgICAgICAgc3RhcnRlZDogMFxuICAgICAgICB9LFxuICAgICAgICByZXNvbHZlID0gcmVzb2x2ZXIuYmluZChyZXNvbHZlckNvbnRleHQpO1xuICAgIHJlc29sdmUuZ2V0ID0gZ2V0LmJpbmQocmVzb2x2ZSk7XG4gICAgcmVzb2x2ZXJDb250ZXh0LnJlc29sdmUgPSByZXNvbHZlO1xuICAgIHJlc29sdmUucmVzb2x2ZSA9IHJlc29sdmU7XG5cbiAgICBpZihyaWdodG8uX2RlYnVnKXtcbiAgICAgICAgYWRkVHJhY2luZyhyZXNvbHZlLCBmbiwgYXJncyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc29sdmU7XG59XG5cbnJpZ2h0by5zeW5jID0gZnVuY3Rpb24oZm4pe1xuICAgIHJldHVybiByaWdodG8uYXBwbHkobnVsbCwgW2Z1bmN0aW9uKCl7XG4gICAgICAgIHZhciBhcmdzID0gc2xpY2UoYXJndW1lbnRzKSxcbiAgICAgICAgICAgIGRvbmUgPSBhcmdzLnBvcCgpLFxuICAgICAgICAgICAgcmVzdWx0ID0gZm4uYXBwbHkobnVsbCwgYXJncyk7XG5cbiAgICAgICAgaWYoaXNSZXNvbHZhYmxlKHJlc3VsdCkpe1xuICAgICAgICAgICAgcmV0dXJuIHJpZ2h0by5mcm9tKHJlc3VsdCkoZG9uZSk7XG4gICAgICAgIH1cblxuICAgICAgICBkb25lKG51bGwsIHJlc3VsdCk7XG4gICAgfV0uY29uY2F0KHNsaWNlKGFyZ3VtZW50cywgMSkpKTtcbn07XG5cbnJpZ2h0by5hbGwgPSBmdW5jdGlvbih2YWx1ZSl7XG4gICAgdmFyIHRhc2sgPSB2YWx1ZTtcbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID4gMSl7XG4gICAgICAgIHRhc2sgPSBzbGljZShhcmd1bWVudHMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc29sdmUodGFza3Mpe1xuICAgICAgICByZXR1cm4gcmlnaHRvLmFwcGx5KG51bGwsIFtmdW5jdGlvbigpe1xuICAgICAgICAgICAgYXJndW1lbnRzW2FyZ3VtZW50cy5sZW5ndGggLSAxXShudWxsLCBzbGljZShhcmd1bWVudHMsIDAsIC0xKSk7XG4gICAgICAgIH1dLmNvbmNhdCh0YXNrcykpO1xuICAgIH1cblxuICAgIGlmKGlzUmlnaHRvKHRhc2spKXtcbiAgICAgICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbih0YXNrcywgZG9uZSl7XG4gICAgICAgICAgICByZXNvbHZlKHRhc2tzKShkb25lKTtcbiAgICAgICAgfSwgdGFzayk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc29sdmUodGFzayk7XG59O1xuXG5yaWdodG8ucmVkdWNlID0gZnVuY3Rpb24odmFsdWVzLCByZWR1Y2VyLCBzZWVkKXtcbiAgICB2YXIgaGFzU2VlZCA9IGFyZ3VtZW50cy5sZW5ndGggPj0gMztcblxuICAgIGlmKCFyZWR1Y2VyKXtcbiAgICAgICAgcmVkdWNlciA9IGZ1bmN0aW9uKHByZXZpb3VzLCBuZXh0KXtcbiAgICAgICAgICAgIHJldHVybiByaWdodG8obmV4dCk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHJpZ2h0by5mcm9tKHZhbHVlcykuZ2V0KGZ1bmN0aW9uKHZhbHVlcyl7XG4gICAgICAgIGlmKCF2YWx1ZXMgfHwgIXZhbHVlcy5yZWR1Y2Upe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd2YWx1ZXMgd2FzIG5vdCBhIHJlZHVjZWFibGUgb2JqZWN0IChsaWtlIGFuIGFycmF5KScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIXZhbHVlcy5sZW5ndGgpe1xuICAgICAgICAgICAgcmV0dXJuIHJpZ2h0by5mcm9tKHVuZGVmaW5lZCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YWx1ZXMgPSB2YWx1ZXMuc2xpY2UoKTtcblxuICAgICAgICBpZighaGFzU2VlZCl7XG4gICAgICAgICAgICBzZWVkID0gcmlnaHRvKHZhbHVlcy5zaGlmdCgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB2YWx1ZXMucmVkdWNlKGZ1bmN0aW9uKHByZXZpb3VzLCBuZXh0KXtcbiAgICAgICAgICAgIHJldHVybiByaWdodG8uc3luYyhyZWR1Y2VyLCBwcmV2aW91cywgcmlnaHRvLnZhbHVlKG5leHQpKTtcbiAgICAgICAgfSwgc2VlZCk7XG4gICAgfSk7XG59O1xuXG5yaWdodG8uZnJvbSA9IGZ1bmN0aW9uKHZhbHVlKXtcbiAgICBpZihpc1JpZ2h0byh2YWx1ZSkpe1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgaWYoIWlzUmVzb2x2YWJsZSh2YWx1ZSkgJiYgdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKXtcbiAgICAgICAgcmV0dXJuIHJpZ2h0by5hbGwoc2xpY2UoYXJndW1lbnRzLCAxKSkuZ2V0KGZ1bmN0aW9uKGFyZ3Mpe1xuICAgICAgICAgICAgcmV0dXJuIHJpZ2h0by5mcm9tKHZhbHVlLmFwcGx5KG51bGwsIGFyZ3MpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJpZ2h0by5zeW5jKGZ1bmN0aW9uKHJlc29sdmVkKXtcbiAgICAgICAgcmV0dXJuIHJlc29sdmVkO1xuICAgIH0sIHZhbHVlKTtcbn07XG5cbnJpZ2h0by5tYXRlID0gZnVuY3Rpb24oKXtcbiAgICByZXR1cm4gcmlnaHRvLmFwcGx5KG51bGwsIFtmdW5jdGlvbigpe1xuICAgICAgICBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtMV0uYXBwbHkobnVsbCwgW251bGxdLmNvbmNhdChzbGljZShhcmd1bWVudHMsIDAsIC0xKSkpO1xuICAgIH1dLmNvbmNhdChzbGljZShhcmd1bWVudHMpKSk7XG59O1xuXG5yaWdodG8udGFrZSA9IGZ1bmN0aW9uKHRhc2spe1xuICAgIGlmKCFpc1Jlc29sdmFibGUodGFzaykpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Rhc2sgd2FzIG5vdCBhIHJlc29sdmFibGUgdmFsdWUnKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge19fdGFrZV9fOiBzbGljZShhcmd1bWVudHMpfTtcbn07XG5cbnJpZ2h0by5hZnRlciA9IGZ1bmN0aW9uKHRhc2spe1xuICAgIGlmKCFpc1Jlc29sdmFibGUodGFzaykpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Rhc2sgd2FzIG5vdCBhIHJlc29sdmFibGUgdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcbiAgICAgICAgcmV0dXJuIHtfX3Rha2VfXzogW3Rhc2tdfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge19fdGFrZV9fOiBbcmlnaHRvLm1hdGUuYXBwbHkobnVsbCwgYXJndW1lbnRzKV19O1xufTtcblxucmlnaHRvLnJlc29sdmUgPSBmdW5jdGlvbihvYmplY3QsIGRlZXApe1xuICAgIGlmKGlzUmlnaHRvKG9iamVjdCkpe1xuICAgICAgICByZXR1cm4gcmlnaHRvLnN5bmMoZnVuY3Rpb24ob2JqZWN0KXtcbiAgICAgICAgICAgIHJldHVybiByaWdodG8ucmVzb2x2ZShvYmplY3QsIGRlZXApO1xuICAgICAgICB9LCBvYmplY3QpO1xuICAgIH1cblxuICAgIGlmKCFvYmplY3QgfHwgISh0eXBlb2Ygb2JqZWN0ID09PSAnb2JqZWN0JyB8fCB0eXBlb2Ygb2JqZWN0ID09PSAnZnVuY3Rpb24nKSl7XG4gICAgICAgIHJldHVybiByaWdodG8uZnJvbShvYmplY3QpO1xuICAgIH1cblxuICAgIHZhciBwYWlycyA9IHJpZ2h0by5hbGwoT2JqZWN0LmtleXMob2JqZWN0KS5tYXAoZnVuY3Rpb24oa2V5KXtcbiAgICAgICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbih2YWx1ZSwgZG9uZSl7XG4gICAgICAgICAgICBpZihkZWVwKXtcbiAgICAgICAgICAgICAgICByaWdodG8uc3luYyhmdW5jdGlvbih2YWx1ZSl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBba2V5LCB2YWx1ZV07XG4gICAgICAgICAgICAgICAgfSwgcmlnaHRvLnJlc29sdmUodmFsdWUsIHRydWUpKShkb25lKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkb25lKG51bGwsIFtrZXksIHZhbHVlXSk7XG4gICAgICAgIH0sIG9iamVjdFtrZXldKTtcbiAgICB9KSk7XG5cbiAgICByZXR1cm4gcmlnaHRvLnN5bmMoZnVuY3Rpb24ocGFpcnMpe1xuICAgICAgICByZXR1cm4gcGFpcnMucmVkdWNlKGZ1bmN0aW9uKHJlc3VsdCwgcGFpcil7XG4gICAgICAgICAgICByZXN1bHRbcGFpclswXV0gPSBwYWlyWzFdO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSwgQXJyYXkuaXNBcnJheShvYmplY3QpID8gW10gOiB7fSk7XG4gICAgfSwgcGFpcnMpO1xufTtcblxucmlnaHRvLml0ZXJhdGUgPSBmdW5jdGlvbigpe1xuICAgIHZhciBhcmdzID0gc2xpY2UoYXJndW1lbnRzKSxcbiAgICAgICAgZm4gPSBhcmdzLnNoaWZ0KCk7XG5cbiAgICByZXR1cm4gcmlnaHRvLmFwcGx5KG51bGwsIFtyZXNvbHZlSXRlcmF0b3IoZm4pXS5jb25jYXQoYXJncykpO1xufTtcblxucmlnaHRvLnZhbHVlID0gZnVuY3Rpb24oKXtcbiAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICByZXR1cm4gcmlnaHRvKGZ1bmN0aW9uKGRvbmUpe1xuICAgICAgICBkb25lLmFwcGx5KG51bGwsIFtudWxsXS5jb25jYXQoc2xpY2UoYXJncykpKTtcbiAgICB9KTtcbn07XG5cbnJpZ2h0by5zdXJlbHkgPSBmdW5jdGlvbih0YXNrKXtcbiAgICBpZighaXNSZXNvbHZhYmxlKHRhc2spKXtcbiAgICAgICAgdGFzayA9IHJpZ2h0by5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHJldHVybiByaWdodG8oZnVuY3Rpb24oZG9uZSl7XG4gICAgICAgIHRhc2soZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGRvbmUobnVsbCwgc2xpY2UoYXJndW1lbnRzKSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufTtcblxucmlnaHRvLmhhbmRsZSA9IGZ1bmN0aW9uKHRhc2ssIGhhbmRsZXIpe1xuICAgIHJldHVybiByaWdodG8oZnVuY3Rpb24oaGFuZGxlciwgZG9uZSl7XG4gICAgICAgIHRhc2soZnVuY3Rpb24oZXJyb3Ipe1xuICAgICAgICAgICAgaWYoIWVycm9yKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGFzayhkb25lKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaGFuZGxlcihlcnJvciwgZG9uZSk7XG4gICAgICAgIH0pO1xuICAgIH0sIGhhbmRsZXIpO1xufTtcblxucmlnaHRvLmZhaWwgPSBmdW5jdGlvbihlcnJvcil7XG4gICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbihlcnJvciwgZG9uZSl7XG4gICAgICAgIGRvbmUoZXJyb3IpO1xuICAgIH0sIGVycm9yKTtcbn07XG5cbnJpZ2h0by5pc1JpZ2h0byA9IGlzUmlnaHRvO1xucmlnaHRvLmlzVGhlbmFibGUgPSBpc1RoZW5hYmxlO1xucmlnaHRvLmlzUmVzb2x2YWJsZSA9IGlzUmVzb2x2YWJsZTtcblxucmlnaHRvLnByb3h5ID0gZnVuY3Rpb24oKXtcbiAgICBpZih0eXBlb2YgUHJveHkgPT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGlzIGVudmlyb25tZW50IGRvZXMgbm90IHN1cHBvcnQgUHJveHlcXCdzJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHByb3h5KHJpZ2h0by5hcHBseSh0aGlzLCBhcmd1bWVudHMpKTtcbn07XG5cbmZvcih2YXIga2V5IGluIHJpZ2h0byl7XG4gICAgcmlnaHRvLnByb3h5W2tleV0gPSByaWdodG9ba2V5XTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSByaWdodG87IiwidmFyIENPTVBMRVRFID0gJ2NvbXBsZXRlJyxcbiAgICBDQU5DRUxFRCA9ICdjYW5jZWxlZCc7XG5cbmZ1bmN0aW9uIHJhZih0YXNrKXtcbiAgICBpZigncmVxdWVzdEFuaW1hdGlvbkZyYW1lJyBpbiB3aW5kb3cpe1xuICAgICAgICByZXR1cm4gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSh0YXNrKTtcbiAgICB9XG5cbiAgICBzZXRUaW1lb3V0KHRhc2ssIDE2KTtcbn1cblxuZnVuY3Rpb24gc2V0RWxlbWVudFNjcm9sbChlbGVtZW50LCB4LCB5KXtcbiAgICBpZihlbGVtZW50LnNlbGYgPT09IGVsZW1lbnQpe1xuICAgICAgICBlbGVtZW50LnNjcm9sbFRvKHgsIHkpO1xuICAgIH1lbHNle1xuICAgICAgICBlbGVtZW50LnNjcm9sbExlZnQgPSB4O1xuICAgICAgICBlbGVtZW50LnNjcm9sbFRvcCA9IHk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRUYXJnZXRTY3JvbGxMb2NhdGlvbih0YXJnZXQsIHBhcmVudCwgYWxpZ24pe1xuICAgIHZhciB0YXJnZXRQb3NpdGlvbiA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcbiAgICAgICAgcGFyZW50UG9zaXRpb24sXG4gICAgICAgIHgsXG4gICAgICAgIHksXG4gICAgICAgIGRpZmZlcmVuY2VYLFxuICAgICAgICBkaWZmZXJlbmNlWSxcbiAgICAgICAgdGFyZ2V0V2lkdGgsXG4gICAgICAgIHRhcmdldEhlaWdodCxcbiAgICAgICAgbGVmdEFsaWduID0gYWxpZ24gJiYgYWxpZ24ubGVmdCAhPSBudWxsID8gYWxpZ24ubGVmdCA6IDAuNSxcbiAgICAgICAgdG9wQWxpZ24gPSBhbGlnbiAmJiBhbGlnbi50b3AgIT0gbnVsbCA/IGFsaWduLnRvcCA6IDAuNSxcbiAgICAgICAgbGVmdE9mZnNldCA9IGFsaWduICYmIGFsaWduLmxlZnRPZmZzZXQgIT0gbnVsbCA/IGFsaWduLmxlZnRPZmZzZXQgOiAwLFxuICAgICAgICB0b3BPZmZzZXQgPSBhbGlnbiAmJiBhbGlnbi50b3BPZmZzZXQgIT0gbnVsbCA/IGFsaWduLnRvcE9mZnNldCA6IDAsXG4gICAgICAgIGxlZnRTY2FsYXIgPSBsZWZ0QWxpZ24sXG4gICAgICAgIHRvcFNjYWxhciA9IHRvcEFsaWduO1xuXG4gICAgaWYocGFyZW50LnNlbGYgPT09IHBhcmVudCl7XG4gICAgICAgIHRhcmdldFdpZHRoID0gTWF0aC5taW4odGFyZ2V0UG9zaXRpb24ud2lkdGgsIHBhcmVudC5pbm5lcldpZHRoKTtcbiAgICAgICAgdGFyZ2V0SGVpZ2h0ID0gTWF0aC5taW4odGFyZ2V0UG9zaXRpb24uaGVpZ2h0LCBwYXJlbnQuaW5uZXJIZWlnaHQpO1xuICAgICAgICB4ID0gdGFyZ2V0UG9zaXRpb24ubGVmdCArIHBhcmVudC5wYWdlWE9mZnNldCAtIHBhcmVudC5pbm5lcldpZHRoICogbGVmdFNjYWxhciArIHRhcmdldFdpZHRoICogbGVmdFNjYWxhcjtcbiAgICAgICAgeSA9IHRhcmdldFBvc2l0aW9uLnRvcCArIHBhcmVudC5wYWdlWU9mZnNldCAtIHBhcmVudC5pbm5lckhlaWdodCAqIHRvcFNjYWxhciArIHRhcmdldEhlaWdodCAqIHRvcFNjYWxhcjtcbiAgICAgICAgeCAtPSBsZWZ0T2Zmc2V0O1xuICAgICAgICB5IC09IHRvcE9mZnNldDtcbiAgICAgICAgZGlmZmVyZW5jZVggPSB4IC0gcGFyZW50LnBhZ2VYT2Zmc2V0O1xuICAgICAgICBkaWZmZXJlbmNlWSA9IHkgLSBwYXJlbnQucGFnZVlPZmZzZXQ7XG4gICAgfWVsc2V7XG4gICAgICAgIHRhcmdldFdpZHRoID0gdGFyZ2V0UG9zaXRpb24ud2lkdGg7XG4gICAgICAgIHRhcmdldEhlaWdodCA9IHRhcmdldFBvc2l0aW9uLmhlaWdodDtcbiAgICAgICAgcGFyZW50UG9zaXRpb24gPSBwYXJlbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIHZhciBvZmZzZXRMZWZ0ID0gdGFyZ2V0UG9zaXRpb24ubGVmdCAtIChwYXJlbnRQb3NpdGlvbi5sZWZ0IC0gcGFyZW50LnNjcm9sbExlZnQpO1xuICAgICAgICB2YXIgb2Zmc2V0VG9wID0gdGFyZ2V0UG9zaXRpb24udG9wIC0gKHBhcmVudFBvc2l0aW9uLnRvcCAtIHBhcmVudC5zY3JvbGxUb3ApO1xuICAgICAgICB4ID0gb2Zmc2V0TGVmdCArICh0YXJnZXRXaWR0aCAqIGxlZnRTY2FsYXIpIC0gcGFyZW50LmNsaWVudFdpZHRoICogbGVmdFNjYWxhcjtcbiAgICAgICAgeSA9IG9mZnNldFRvcCArICh0YXJnZXRIZWlnaHQgKiB0b3BTY2FsYXIpIC0gcGFyZW50LmNsaWVudEhlaWdodCAqIHRvcFNjYWxhcjtcbiAgICAgICAgeCA9IE1hdGgubWF4KE1hdGgubWluKHgsIHBhcmVudC5zY3JvbGxXaWR0aCAtIHBhcmVudC5jbGllbnRXaWR0aCksIDApO1xuICAgICAgICB5ID0gTWF0aC5tYXgoTWF0aC5taW4oeSwgcGFyZW50LnNjcm9sbEhlaWdodCAtIHBhcmVudC5jbGllbnRIZWlnaHQpLCAwKTtcbiAgICAgICAgeCAtPSBsZWZ0T2Zmc2V0O1xuICAgICAgICB5IC09IHRvcE9mZnNldDtcbiAgICAgICAgZGlmZmVyZW5jZVggPSB4IC0gcGFyZW50LnNjcm9sbExlZnQ7XG4gICAgICAgIGRpZmZlcmVuY2VZID0geSAtIHBhcmVudC5zY3JvbGxUb3A7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgeDogeCxcbiAgICAgICAgeTogeSxcbiAgICAgICAgZGlmZmVyZW5jZVg6IGRpZmZlcmVuY2VYLFxuICAgICAgICBkaWZmZXJlbmNlWTogZGlmZmVyZW5jZVlcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBhbmltYXRlKHBhcmVudCl7XG4gICAgcmFmKGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciBzY3JvbGxTZXR0aW5ncyA9IHBhcmVudC5fc2Nyb2xsU2V0dGluZ3M7XG4gICAgICAgIGlmKCFzY3JvbGxTZXR0aW5ncyl7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbG9jYXRpb24gPSBnZXRUYXJnZXRTY3JvbGxMb2NhdGlvbihzY3JvbGxTZXR0aW5ncy50YXJnZXQsIHBhcmVudCwgc2Nyb2xsU2V0dGluZ3MuYWxpZ24pLFxuICAgICAgICAgICAgdGltZSA9IERhdGUubm93KCkgLSBzY3JvbGxTZXR0aW5ncy5zdGFydFRpbWUsXG4gICAgICAgICAgICB0aW1lVmFsdWUgPSBNYXRoLm1pbigxIC8gc2Nyb2xsU2V0dGluZ3MudGltZSAqIHRpbWUsIDEpO1xuXG4gICAgICAgIGlmKFxuICAgICAgICAgICAgdGltZSA+IHNjcm9sbFNldHRpbmdzLnRpbWUgKyAyMFxuICAgICAgICApe1xuICAgICAgICAgICAgc2V0RWxlbWVudFNjcm9sbChwYXJlbnQsIGxvY2F0aW9uLngsIGxvY2F0aW9uLnkpO1xuICAgICAgICAgICAgcGFyZW50Ll9zY3JvbGxTZXR0aW5ncyA9IG51bGw7XG4gICAgICAgICAgICByZXR1cm4gc2Nyb2xsU2V0dGluZ3MuZW5kKENPTVBMRVRFKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBlYXNlVmFsdWUgPSAxIC0gc2Nyb2xsU2V0dGluZ3MuZWFzZSh0aW1lVmFsdWUpO1xuXG4gICAgICAgIHNldEVsZW1lbnRTY3JvbGwocGFyZW50LFxuICAgICAgICAgICAgbG9jYXRpb24ueCAtIGxvY2F0aW9uLmRpZmZlcmVuY2VYICogZWFzZVZhbHVlLFxuICAgICAgICAgICAgbG9jYXRpb24ueSAtIGxvY2F0aW9uLmRpZmZlcmVuY2VZICogZWFzZVZhbHVlXG4gICAgICAgICk7XG5cbiAgICAgICAgYW5pbWF0ZShwYXJlbnQpO1xuICAgIH0pO1xufVxuZnVuY3Rpb24gdHJhbnNpdGlvblNjcm9sbFRvKHRhcmdldCwgcGFyZW50LCBzZXR0aW5ncywgY2FsbGJhY2spe1xuICAgIHZhciBpZGxlID0gIXBhcmVudC5fc2Nyb2xsU2V0dGluZ3MsXG4gICAgICAgIGxhc3RTZXR0aW5ncyA9IHBhcmVudC5fc2Nyb2xsU2V0dGluZ3MsXG4gICAgICAgIG5vdyA9IERhdGUubm93KCksXG4gICAgICAgIGVuZEhhbmRsZXI7XG5cbiAgICBpZihsYXN0U2V0dGluZ3Mpe1xuICAgICAgICBsYXN0U2V0dGluZ3MuZW5kKENBTkNFTEVEKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbmQoZW5kVHlwZSl7XG4gICAgICAgIHBhcmVudC5fc2Nyb2xsU2V0dGluZ3MgPSBudWxsO1xuICAgICAgICBpZihwYXJlbnQucGFyZW50RWxlbWVudCAmJiBwYXJlbnQucGFyZW50RWxlbWVudC5fc2Nyb2xsU2V0dGluZ3Mpe1xuICAgICAgICAgICAgcGFyZW50LnBhcmVudEVsZW1lbnQuX3Njcm9sbFNldHRpbmdzLmVuZChlbmRUeXBlKTtcbiAgICAgICAgfVxuICAgICAgICBjYWxsYmFjayhlbmRUeXBlKTtcbiAgICAgICAgcGFyZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCBlbmRIYW5kbGVyKTtcbiAgICB9XG5cbiAgICBwYXJlbnQuX3Njcm9sbFNldHRpbmdzID0ge1xuICAgICAgICBzdGFydFRpbWU6IGxhc3RTZXR0aW5ncyA/IGxhc3RTZXR0aW5ncy5zdGFydFRpbWUgOiBEYXRlLm5vdygpLFxuICAgICAgICB0YXJnZXQ6IHRhcmdldCxcbiAgICAgICAgdGltZTogc2V0dGluZ3MudGltZSArIChsYXN0U2V0dGluZ3MgPyBub3cgLSBsYXN0U2V0dGluZ3Muc3RhcnRUaW1lIDogMCksXG4gICAgICAgIGVhc2U6IHNldHRpbmdzLmVhc2UsXG4gICAgICAgIGFsaWduOiBzZXR0aW5ncy5hbGlnbixcbiAgICAgICAgZW5kOiBlbmRcbiAgICB9O1xuXG4gICAgZW5kSGFuZGxlciA9IGVuZC5iaW5kKG51bGwsIENBTkNFTEVEKTtcbiAgICBwYXJlbnQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIGVuZEhhbmRsZXIpO1xuXG4gICAgaWYoaWRsZSl7XG4gICAgICAgIGFuaW1hdGUocGFyZW50KTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRJc1Njcm9sbGFibGUoZWxlbWVudCl7XG4gICAgcmV0dXJuIChcbiAgICAgICAgJ3BhZ2VYT2Zmc2V0JyBpbiBlbGVtZW50IHx8XG4gICAgICAgIChcbiAgICAgICAgICAgIGVsZW1lbnQuc2Nyb2xsSGVpZ2h0ICE9PSBlbGVtZW50LmNsaWVudEhlaWdodCB8fFxuICAgICAgICAgICAgZWxlbWVudC5zY3JvbGxXaWR0aCAhPT0gZWxlbWVudC5jbGllbnRXaWR0aFxuICAgICAgICApICYmXG4gICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkub3ZlcmZsb3cgIT09ICdoaWRkZW4nXG4gICAgKTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFZhbGlkVGFyZ2V0KCl7XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odGFyZ2V0LCBzZXR0aW5ncywgY2FsbGJhY2spe1xuICAgIGlmKCF0YXJnZXQpe1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYodHlwZW9mIHNldHRpbmdzID09PSAnZnVuY3Rpb24nKXtcbiAgICAgICAgY2FsbGJhY2sgPSBzZXR0aW5ncztcbiAgICAgICAgc2V0dGluZ3MgPSBudWxsO1xuICAgIH1cblxuICAgIGlmKCFzZXR0aW5ncyl7XG4gICAgICAgIHNldHRpbmdzID0ge307XG4gICAgfVxuXG4gICAgc2V0dGluZ3MudGltZSA9IGlzTmFOKHNldHRpbmdzLnRpbWUpID8gMTAwMCA6IHNldHRpbmdzLnRpbWU7XG4gICAgc2V0dGluZ3MuZWFzZSA9IHNldHRpbmdzLmVhc2UgfHwgZnVuY3Rpb24odil7cmV0dXJuIDEgLSBNYXRoLnBvdygxIC0gdiwgdiAvIDIpO307XG5cbiAgICB2YXIgcGFyZW50ID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQsXG4gICAgICAgIHBhcmVudHMgPSAwO1xuXG4gICAgZnVuY3Rpb24gZG9uZShlbmRUeXBlKXtcbiAgICAgICAgcGFyZW50cy0tO1xuICAgICAgICBpZighcGFyZW50cyl7XG4gICAgICAgICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayhlbmRUeXBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciB2YWxpZFRhcmdldCA9IHNldHRpbmdzLnZhbGlkVGFyZ2V0IHx8IGRlZmF1bHRWYWxpZFRhcmdldDtcbiAgICB2YXIgaXNTY3JvbGxhYmxlID0gc2V0dGluZ3MuaXNTY3JvbGxhYmxlO1xuXG4gICAgd2hpbGUocGFyZW50KXtcbiAgICAgICAgaWYodmFsaWRUYXJnZXQocGFyZW50LCBwYXJlbnRzKSAmJiAoaXNTY3JvbGxhYmxlID8gaXNTY3JvbGxhYmxlKHBhcmVudCwgZGVmYXVsdElzU2Nyb2xsYWJsZSkgOiBkZWZhdWx0SXNTY3JvbGxhYmxlKHBhcmVudCkpKXtcbiAgICAgICAgICAgIHBhcmVudHMrKztcbiAgICAgICAgICAgIHRyYW5zaXRpb25TY3JvbGxUbyh0YXJnZXQsIHBhcmVudCwgc2V0dGluZ3MsIGRvbmUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcGFyZW50ID0gcGFyZW50LnBhcmVudEVsZW1lbnQ7XG5cbiAgICAgICAgaWYoIXBhcmVudCl7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZihwYXJlbnQudGFnTmFtZSA9PT0gJ0JPRFknKXtcbiAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5vd25lckRvY3VtZW50O1xuICAgICAgICAgICAgcGFyZW50ID0gcGFyZW50LmRlZmF1bHRWaWV3IHx8IHBhcmVudC5vd25lcldpbmRvdztcbiAgICAgICAgfVxuICAgIH1cbn07XG4iXX0=
