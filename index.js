'use strict';

let build = require('gulp-core-build');
let tslint = require('gulp-core-build-typescript').tslint;
let typescript = require('gulp-core-build-typescript').typescript;
let sass = require('gulp-core-build-sass').default;
let karma = require('gulp-core-build-karma').default;
let webpack = require('gulp-core-build-webpack').default;
let serve = require('gulp-core-build-serve').serve;
let reload = require('gulp-core-build-serve').reload;

// Define task groups.
let buildTasks = task('build', parallel(tslint, typescript, sass));
let testTasks = task('test', serial(buildTasks, karma));
let bundleTasks = task('build', serial(buildTasks, webpack));
let defaultTasks = task('default', bundleTasks);
let serveTasks = task('serve',
  serial(
    bundleTasks,
    serve,
    watch('src/**/*.{ts,tsx}', serial(parallel(lint, typescript), webpack, reload)),
    watch('src/**/*.scss', serial(serial(sass, webpack, reload)))
  )
);

// Export tasks, groups, and initialize.
module.exports = {
  tasks: {
    tslint,
    typescript,
    sass,
    karma,
    webpack,
    serve,
    reload
  },

  taskGroups: {
    build: buildTasks,
    test: testTasks,
    bundle: bundleTasks,
    serve: serveTasks
  },

  initialize: (gulp) => build.initialize(gulp)
};
