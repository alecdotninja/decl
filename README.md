# Decl 

[![Build Status](https://travis-ci.org/anarchocurious/decl.svg?branch=master)](https://travis-ci.org/anarchocurious/decl) [![Build Status](https://saucelabs.com/buildstatus/decl)](https://saucelabs.com/u/decl)

Decl is a simple library designed to enable more declarative and unobtrusive JavaScript.


## Browser Support

Decl should work on any modern browser and most older browsers (provided that they support either `MutationObserver` or the long depricated `MutationEvent` API); however it is actively tested against the browsers below.

[![Sauce Test Status](https://saucelabs.com/browser-matrix/decl.svg)](https://saucelabs.com/u/decl)

I've tried to select a diverse range of browsers and platforms for maximum coverage. If you feel another configuration should be included, feel free to [open an issue](https://github.com/anarchocurious/decl/issues/new).


## Usage

Decl is designed to be intuitive and reminiscent of SCSS. To get an intuition for how Decl works, checkout [this Fiddle](https://jsfiddle.net/wtzp3xz1/) which shows a simple implementation for the accordion effect.

### Scopes

Scopes are the central idea in Decl. A scope is a combination of some element and rules to be matched to that element. By default, the global `Decl` behaves like a scope for the root of the document (`document.documentElement`).

#### Select Rules
Select rules can be created on a scope by calling `select` with a matcher (usually a CSS selector string) and callback function. The select rule will match any child of the scope's element that matches the mater, and the callback will be invoked with a new scope for any element that matches the select rule.

```javascript
Decl.select('.kitten', function(scope, kitten) {
  // This callback will run any time an element has the "kitten" class. `kitten` is the element that matched, and `scope` is a new scope for that element.
  
  scope.select('.ears', function(scope, ears) {
    // This callback will run anytime a child of the `kitten` element has the "ears" class. Here, the `ears` is the element that has the "ears" class (nested within the `kitten` element), and `scope` is new scope for that element.
  });
});

```

#### When Rules
When rules are like select rules except they are created by calling `when` on a scope and apply to the element itself rather than the children.

```javascript
Decl.select('.kitten', function(scope, kitten) {  
  scope.when('.happy', function(scope) {
    // This callback will run anytime there is `kitten` element which simultaneously has the "kitten" and "happy" classes.
  });
  
  scope.when('.playful', function(scope) {
    // Similarly, this callback will run anytime there is `kitten` element which simultaneously has the "kitten" and "playful" classes.
  });
});
```

#### Match Rules
Match rules are created by calling `match` and `unmatch` on a scope with a callback. The callback will be invoked with the element that has just match or stopped matching respectively.

For performance reasons, the callback to select and when rules should only be used to add rules to the new scope it is passed. To tap into the lifecycle of an element matching a particular scope chain, match rules can be used.

```javascript
var playfulKittenCount = 0;

Decl.select('.kitten.playful', function(scope) {
  // This callback should avoid any computations and have no side effects (except calling methods on scope).
  
  scope.match(function(playfulKitten) {
    // The match callback will be invoked with the matching element exactly once when the element matches after all rules has been processed. Any modifications to the DOM must be done here.
    playfulKittenCount++;
  });
  
  scope.unmatch(function(playfulKitten) {
    // The unmatch callback will be invoked exactly once when an element which had previously matched stops doing so but after all rules have been processed. If the match callback was called for an element, the unmatch callback is guaranteed to be called (unless the page is unloaded entirely).
    playfulKittenCount--;
  });
});
```

#### Event Rules
Event rules allow you to define behavior for the occurrence of a DOM event on an element of a particular scope. They can be created by calling on `on` on a scope with an event matcher (usually a string with the event name) and a callback to be invoked when a matching event occurs. The callback will receive the matching event and a reference to the underlying element to which the listener was attached.

```javascript
Decl.select('.kitten', function(scope) {
  scope.on('click', function(event, kitten) {
    // This callback is invoked when a click event (`event`) occurs on an element with the "kitten" class (`kitten`).
  });

  // For connivence, jQuery style on syntax with an element matcher is also supported.
  scope.on('click', '.nose', function(event, nose) {
    // The callback is invoked when a click event (`event`) occurs on an element with the "nose" class (`nose`) that is the child of an element with the "kitten" class. 

    // This is equivalent to writing:
    //   scope.select('.nose', function(scope) {
    //     scope.on('click', function(event, nose) {
    //       // (implementation)
    //     });
    //   });
  });
});
```


### The global `Decl` object

The global `Decl` object is a constructor for instances of the `Decl` class. It delegates all but a few of it's methods to a default instance. Additionally, this default instance delegates `select` and `on` to a root scope. This is what allows the global `Decl` object to be used as the starting point for constructing new scopes.

Instances of `Decl` must be tied to a document and create a root scope for the root element of that document (the `documentElement` of that document). At initialization, the default instance is configured for a decl with the document in the global `document` reference; however, additional decls for other documents may be created and set as the default instance.

#### `Decl.getDefaultInstance`
`getDefaultInstance` returns the instance of `Decl` to which the `Decl` class is currently delegating.

#### `Decl.setDefaultInstance`
`getDefaultInstance` sets the instance of `Decl` to which the `Decl` class is currently delegating.

#### `Decl#getRootScope`
`getRootScope` returns the scope with no parent for the `documentElement` of the document to which the decl is attached and to which the `select` and `on` methods are delegated.

#### `Decl#inspect`
`inspect` prints the current state of the decl object to the console. This may be useful for debugging.

#### `Decl#pristine`
`pristine` resets this decl object to it's initial state fully cleaning up all scopes it contains in the process.


## Development

This project is setup using a bunch of tools -- most of which [I don't really understand](https://hackernoon.com/how-it-feels-to-learn-javascript-in-2016-d3a717dd577f). Fortunately, cloning this repo and running `npm install` from the project root on [a standard Node setup](https://nodejs.org/) seems to be sufficent to get the toolchain up and working.

The source is written in [TypeScript](https://www.typescriptlang.org/) and located in the `src` folder. The browser-ready JavaScript ends up in `dist` and can be generated with `gulp build`. The specs are in `test` and can be verified with `gulp test`.


## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/anarchocurious/decl).


## License

This library is available as open source under the terms of the [MIT License](http://opensource.org/licenses/MIT).