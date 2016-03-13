'use strict';

let build = require('gulp-core-build');

let plugins = {
  build: build,
  typescript: require('gulp-core-build-typescript'),
  mocha: require('gulp-core-build-mocha')
};

let tasks = {
  typescript: plugins.typescript,
  mocha: plugins.mocha.default
};

// Shortcuts since node doesn't support destructuring by default yet.
let task = build.task;
let parallel = build.parallel;
let serial = build.serial;
let watch = build.watch;

// Define task groups.
let buildTasks = task('build', tasks.typescript);
let testTasks = task('test', serial(buildTasks, tasks.mocha));
let watchTasks = task('watch', watch('lib/*.js', testTasks));
let defaultTasks = task('default', testTasks);

// Export tasks, groups, and initialize.
module.exports = {
  plugins: plugins,

  tasks: tasks,

  config: (config) => build.config(config),

  initialize: (gulp) => build.initialize(gulp)
};
