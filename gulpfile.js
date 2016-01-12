var plumber = require("gulp-plumber");
var through = require("through2");
var chalk   = require("chalk");
var newer   = require("gulp-newer");
var babel   = require("gulp-babel");
var gutil   = require("gulp-util");
var gulp    = require("gulp");
var del     = require('del');
var ts      = require('gulp-typescript');
var watch   = require('gulp-watch');

var scripts = ['src/**/*.ts'];
var dest = 'lib';
// var srcEx = 'src', libFragment = 'lib';

// if (path.win32 === path) {
//   srcEx = /(packages\\[^\\]+)\\src\\/;
//   libFragment = "$1\\lib\\";
// } else {
//   srcEx = new RegExp("(packages/[^/]+)/src/");
//   libFragment = "$1/lib/";
// }

gulp.task("default", ["build"]);

gulp.task("clean", function(cb) {
  del(['lib/**'], cb)
});

gulp.task("build", function () {
  return gulp.src(scripts)
    .pipe(plumber({
      errorHandler: function (err) {
        gutil.log(err.stack);
      }
    }))
    .pipe(ts({
      noImplicitAny: true,
      target: 'es5'
    }))
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
    .pipe(gulp.dest(dest));
});

gulp.task("watch", ["build"], function (callback) {
  watch(scripts, function () {
    gulp.start("build");
  });
});