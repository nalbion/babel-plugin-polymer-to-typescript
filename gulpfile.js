var plumber = require("gulp-plumber");
var through = require("through2");
var chalk   = require("chalk");
var newer   = require("gulp-newer");
var babel   = require("gulp-babel");
var gutil   = require("gulp-util");
var gulp    = require("gulp");
var del     = require('del');
var ts      = require('gulp-typescript');
var sourcemaps = require('gulp-sourcemaps');
var watch   = require('gulp-watch');

var scripts = ['lib/**/*.ts'];
var dest = 'lib';

gulp.task("default", ["build"]);

gulp.task("clean", function(cb) {
  del(['lib/**/*.{js,d.ts,map}'], cb)
});

gulp.task("build", function () {
  var tsResult = gulp.src(scripts)
    .pipe(plumber({
      errorHandler: function (err) {
        gutil.log(err.stack);
      }
    }))
    .pipe(sourcemaps.init())
    .pipe(ts({
      target: 'es5',
      module: 'CommonJS',
      compilerOptions: {
        'experimentalDecorators': true
      }
    }));
    // .pipe(through.obj(function (file, enc, callback) {
    //   file._path = file.path;
    //   file.path = file.path.replace(srcEx, libFragment);
    //   callback(null, file);
    // }))
    // .pipe(newer(dest))
    // .pipe(through.obj(function (file, enc, callback) {
    //   gutil.log("Compiling", "'" + chalk.cyan(file._path) + "'...");
    //   callback(null, file);
    // }))
    // .pipe(babel())
    //.pipe(gulp.dest(dest));

    return tsResult.js
                .pipe(sourcemaps.write()) // Now the sourcemaps are added to the .js file
                .pipe(gulp.dest(dest));
});

gulp.task("watch", ["build"], function (callback) {
  watch(scripts, function () {
    gulp.start("build");
  });
});
