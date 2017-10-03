# automagician

Automate websites in-browser, using human-style target selection.

Very new, thrown together to solve a problem, subject to major change.

## Usage

1. build, then run the server:
```
npm start
```

1. Add the bookmarklet to your browser:
```javascript
javascript: var x = document.createElement('script'); x.src = 'http://localhost:8080/index.browser.js?a='+Math.random(); document.body.appendChild(x);
```

1. Click your bookmarklet

1. Put some commands in the box, eg:
```
Click Me - click
Some input placeholder - enter - Hello world
Something off screen - scrollTo
```

1. Click "run"

## Issues

Runs on http, so you can't inject into https sites. Spin up a now.sh server to solve this.