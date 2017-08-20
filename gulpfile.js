var gulp = require('gulp');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var rimraf = require('gulp-rimraf');
var merge = require('gulp-merge');
var browserify = require('browserify');
var tsify = require('tsify');
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
var KarmaServer = require('karma').Server;

function karma(options) {
    return new Promise(function(resolve, reject) {
        new KarmaServer(options, resolve).start();
    });
}

gulp.task('clean', function() {
  return gulp
  .src('dist')
  .pipe(rimraf());
});

gulp.task('build', function () {
    var bundle = browserify({
        basedir: '.',
        debug: true,
        entries: ['src/decl.ts'],
        cache: {},
        packageCache: {}
    })
    .plugin(tsify)
    .bundle();

    var debug = bundle
    .pipe(source('decl.js'))
    .pipe(gulp.dest('dist'));

    var min = bundle
    .pipe(source('decl.min.js'))
    .pipe(buffer())
    .pipe(sourcemaps.init({ loadMaps: true }))
    .pipe(uglify())
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('dist'));

    return merge(debug, min);
});

gulp.task('test', function () {
    return karma({
        configFile: __dirname + '/karma.conf.js', 
        singleRun: true
    });
});

gulp.task('tdd', function () {
    return karma({
        configFile: __dirname + '/karma.conf.js', 
        singleRun: false
    });
});

gulp.task('ci', function() {
    return Promise.resolve()
    .then(function() {
        return karma({
            configFile: __dirname + '/karma.conf.js', 
            singleRun: true
        });
    })
    .then(function() {
        var customLaunchers = {
            sl_chrome: {
                base: 'SauceLabs',
                browserName: 'chrome',
                platform: 'Linux'
            },
            sl_firefox: {
                base: 'SauceLabs',
                browserName: 'firefox',
                platform: 'Linux'
            },
            sl_mac_safari: {
                base: 'SauceLabs',
                browserName: 'safari',
                platform: 'OS X 10.10'
            },
            sl_edge: {
                base: 'SauceLabs',
                browserName: 'MicrosoftEdge',
                platform: 'Windows 10'
            },
            sl_ie_11: {
                base: 'SauceLabs',
                browserName: 'internet explorer',
                platform: 'Windows 8.1',
                version: '11'
            },
            sl_ios_safari_9: {
                base: 'SauceLabs',
                browserName: 'iphone',
                version: '9.3'
            },
            sl_ios_safari_10: {
                base: 'SauceLabs',
                browserName: 'iphone',
                version: '10.3'
            },
            sl_android_5_1: {
                base: 'SauceLabs',
                browserName: 'android',
                version: '5.1'
            },
            sl_android_6_0: {
                base: 'SauceLabs',
                browserName: 'android',
                version: '6.0'
            }
        };

        return karma({
            configFile: __dirname + '/karma.conf.js', 
            singleRun: true,
            concurrency: 5,
            reporters: ['mocha', 'saucelabs'],            
            browsers: Object.keys(customLaunchers),
            customLaunchers: customLaunchers,
            sauceLabs: {
                testName: 'Decl tests',
                build: process.env.TRAVIS_BUILD_NUMBER || process.env.SAUCE_BUILD_ID || Date.now()
            },
            captureTimeout: 300000,
            browserNoActivityTimeout: 300000
        });
    });
});

gulp.task('default', ['test', 'build']);
