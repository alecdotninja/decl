var gulp = require('gulp');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var rimraf = require('gulp-rimraf');
var merge = require('gulp-merge');
var browserify = require('browserify');
var tsify = require('tsify');
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
var Server = require('karma').Server;

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

gulp.task('test', function (done) {
    new Server({ configFile: __dirname + '/karma.conf.js', singleRun: true }, done).start();
});

gulp.task('tdd', function (done) {
    new Server({ configFile: __dirname + '/karma.conf.js', singleRun: false }, done).start();
});

gulp.task('default', ['build']);