# Decl 

[![Build Status](https://travis-ci.org/anarchocurious/decl.svg?branch=master)](https://travis-ci.org/anarchocurious/decl) [![Build Status](https://saucelabs.com/buildstatus/decl)](https://saucelabs.com/beta/builds/0431cafc7a784d5c83181efff37b78a5)

Decl is a simple library designed to enable more declarative and unobtrusive JavaScript.


## Browser Support

Decl should work on any modern browser and most older browsers (provided that they support either `MutationObserver` or the long depricated `MutationEvent` API); however it is actively tested against the browsers below.

[![Sauce Test Status](https://saucelabs.com/browser-matrix/decl.svg)](https://saucelabs.com/u/decl)

I've tried to select a diverse range of browsers and platforms for maximum coverage. If you feel another configuration should be included, feel free to [open an issue](https://github.com/anarchocurious/decl/issues/new).


## Usage

```javascript

Decl.select('body.accounts-index', function(scope) {
    scope.select('.row.expandable', function(scope) {
        scope.when(':not(.expanded)', function(scope) {
            scope.on('click', function(element) {
                $(element).addClass('expanded');
            });
        });

        scope.when('.expanded', function(scope) {
            scope.on('click', function(element) {
                $(element).removeClass('expanded');
            });
        });
    });
});

Decl.select('select[data-uses-select2]', function(scope) {
    scope.match(function(element) {
        $(element).select2();
    });

    scope.unmatch(function(element) {
        var select2 = $(element).data('select2');

        if(select2) {
            select2.destroy();
        }
    });
});

Decl.select('.counting-widget', function(scope) {
    var count = 0;

    scope.select('button.display-button', function(scope) {
        scope.on('click', function() {
            alert('The count is ' + count + '.');
        });
    });

    scope.select('button.increment-button', function(scope) {
        scope.on('click', function() {
            count++;
        });
    });

    scope.select('button.decrement-button', function(scope) {
        scope.on('click', function() {
            count--;
        });
    });
});

```


## Development

This project is setup using a bunch of tools -- most of which [I don't really understand](https://hackernoon.com/how-it-feels-to-learn-javascript-in-2016-d3a717dd577f). Fortunately, cloning this repo and running `npm install` from the project root on [a standard Node setup](https://nodejs.org/) seems to be sufficent to get the toolchain up and working.

The source is written in [TypeScript](https://www.typescriptlang.org/) and located in the `src` folder. The browser-ready JavaScript ends up in `dist` and can be generated with `gulp build`. The specs are in `test` and can be verified with `gulp test`.


## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/anarchocurious/decl).


## License

This library is available as open source under the terms of the [MIT License](http://opensource.org/licenses/MIT).
