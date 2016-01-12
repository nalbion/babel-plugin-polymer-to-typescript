Babel transformer to convert standard Polymer 1.x projects to polymer-ts style


## Using with Gulp

```
gulp.task('polymer-to-typescript', function() {
  return gulp.src('app/elements/**/*.html')
    .pipe($.crisper({scriptInHead: false}))
    .pipe($.if('*.html', $.replace(/^<html><head>|<\/head><body>|<\/body><\/html>/g, '')))
    .pipe($.if('*.js', $.babel({
      "plugins": ["polymer-to-typescript"]
    })))
    .pipe(gulp.dest('dist'));
});
```