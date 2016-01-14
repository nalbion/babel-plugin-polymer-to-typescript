Babel transformer to convert standard Polymer 1.x projects to [polymer-ts](https://github.com/nippur72/PolymerTS) style.


## Options

 - `userBehaviorDecorator` - if `true` use `@behavior(SomeBehavior)`  for each behavior.  If `false` (default) use Mixins

## Using with Gulp

### package.json
```json
{
	...
	"devDependencies": {
		"gulp": "^3.9.0",
		"gulp-babel": "^6.1.1",
    	"gulp-crisper": "^1.0.0",
		"gulp-if": "^2.0.0",
		"gulp-load-plugins": "^1.1.0",
		"gulp-rename": "^1.2.2",
		"gulp-replace": "^0.5.4",
		"babel-plugin-polymer-to-typescript": "^0.0.2",
	}
}

```

### gulpfile.js
```js
var gulp = require('gulp');
var $ = require('gulp-load-plugins')();

gulp.task('polymer-to-typescript', function() {
  return gulp.src('app/elements/**/*.html')
    .pipe($.crisper({scriptInHead: false}))
    .pipe($.if('*.html', $.replace(/^<html><head>|<\/head><body>|<\/body><\/html>/g, '')))
    .pipe($.if('*.html', 
      $.replace(/^<html><head>|<\/head><body>|<\/body><\/html>/g, ''),
      $.babel({"plugins": ["polymer-to-typescript", {
		  "useBehaviorDecorator": true
      	}]})
    ))
    .pipe($.if('*.js', $.rename({extname: '.ts'})))
    .pipe(gulp.dest('dist'));
});
```

## Contributing

PRs are welcome.  I found the [AST Explorer](http://astexplorer.net/) very useful to gain an understanding of the structure of the original code and the code to be generated.  Another good reference was the README for [babel-types](https://github.com/babel/babel/tree/master/packages/babel-types).