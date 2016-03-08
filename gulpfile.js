'use strict';

let gulp = require('gulp');

let config = {
  paths: {
    libFolder: 'lib',
    sourceMatch: [
      'src/**/*.ts',
      'typings/tsd.d.ts'
    ],
    testMatch: [
      'lib/**/*.test.js'
    ]
  }
}

gulp.task('build', () => {
  let ts = require('gulp-typescript');
  let plumber = require('gulp-plumber');
  let merge = require('merge2');
  let lint = require('gulp-tslint');
  let tsConfig = require('./tsconfig.json');
  let paths = config.paths;
  let errorCount = 0;
  let allStreams = [];
  let tsProject = ts.createProject(tsConfig.compilerOptions);
  let gutil = require('gulp-util');
  let sourceStream = gulp.src(paths.sourceMatch);

  sourceStream
    .pipe(lint({
      configuration: require('./tslint.json')
    }))
    .pipe(lint.report('full', {
      emitError: false
    }));

  let tsResult = sourceStream
    .pipe(plumber({
      errorHandler: function(error) {
       // console.log(error);
        errorCount++;
      }
    }))
    .pipe(ts(tsProject, undefined, ts.reporter.longReporter()));

  allStreams.push(tsResult.js.pipe(gulp.dest(paths.libFolder)));
  allStreams.push(tsResult.dts.pipe(gulp.dest(paths.libFolder)));

  let mergedStream = merge(allStreams);

  mergedStream.on('queueDrain', function() {
    if (errorCount) {
//      throw new gutil.PluginError('msg', `[gulp-typescript] TypeScript error(s): ${ chalk.red(errorCount) }`, { showStack: false });
    }
  });

  return mergedStream;
});

gulp.task('test', ['build'], () => {
  let mocha = require('gulp-mocha');

  return gulp.src(config.paths.testMatch, { read: false })
    .pipe(mocha());
});

gulp.task('default', ['build']);
